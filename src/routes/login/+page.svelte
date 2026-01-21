<script>
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { deriveMasterKey } from '$lib/crypto/keys';
  import {
    fetchDeviceDek,
    fetchMasterWrappedDek,
    loginWithTotp,
    registerDevice,
    requestMagicLink,
    updateUserPreferences,
    verifyMagicLink
  } from '$lib/api';
  import { createDeviceKeyBundle, loadDeviceKey, unwrapDekForDevice, unwrapDekWithMasterKey, wrapDekForDevice } from '$lib/e2ee';
  import { setSession } from '$lib/session';
  import { dekStore, sessionStore } from '$lib/state';
  import { readAnyDeviceRecord } from '$lib/storage/device';
  import {
    getAuthMethodPreference,
    getDeviceSettings,
    loadUnsafeDek,
    setAuthMethodPreference,
    storeUnsafeDek
  } from '$lib/deviceSettings';
  import { promptBiometric } from '$lib/biometrics';

  const savedEmailKey = 'e2ee:lastEmail';

  let authMethod = getAuthMethodPreference();
  let username = '';
  let email = '';
  let token = '';
  let totpCode = '';
  let passphrase = '';
  let magicLinkExpiresAt = 0;
  let loginStep = 'auth';
  let pendingSessionState = null;
  let errorMessage = '';
  let isSubmitting = false;

  onMount(() => {
    const savedEmail = localStorage.getItem(savedEmailKey);
    if (savedEmail && !email) {
      email = savedEmail;
    }
    const storedSession = get(sessionStore);
    const dek = get(dekStore);
    if (storedSession && !dek) {
      pendingSessionState = storedSession;
      loginStep = 'decrypt';
    } else if (storedSession && dek) {
      goto(`${base}/notes`);
    }
  });

  const rememberEmail = (value) => {
    const trimmed = value.trim();
    if (trimmed) {
      localStorage.setItem(savedEmailKey, trimmed);
    }
  };

  const startDecrypt = (response) => {
    pendingSessionState = response;
    loginStep = 'decrypt';
    errorMessage = '';
    void updateUserPreferences({ sessionToken: response.sessionToken, authMethod }).catch((err) => {
      console.error('Failed to update user preferences.', err);
    });
  };

  const handleMagicLinkRequest = async () => {
    errorMessage = '';
    if (!email.trim()) {
      errorMessage = 'Email is required.';
      return;
    }
    isSubmitting = true;
    try {
      const response = await requestMagicLink({ email });
      rememberEmail(email);
      magicLinkExpiresAt = response.expiresAt;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Magic link request failed.';
    } finally {
      isSubmitting = false;
    }
  };

  const handleMagicLinkVerify = async () => {
    errorMessage = '';
    if (!email.trim() || !token.trim()) {
      errorMessage = 'Email and token are required.';
      return;
    }
    isSubmitting = true;
    try {
      const response = await verifyMagicLink({ email, token });
      rememberEmail(email);
      startDecrypt(response);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Magic link verification failed.';
    } finally {
      isSubmitting = false;
    }
  };

  const handleTotpSignIn = async () => {
    errorMessage = '';
    if (!username.trim() || !totpCode.trim()) {
      errorMessage = 'Username and TOTP code are required.';
      return;
    }
    isSubmitting = true;
    try {
      const response = await loginWithTotp({ username, code: totpCode });
      startDecrypt(response);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'TOTP login failed.';
    } finally {
      isSubmitting = false;
    }
  };

  const handlePassphraseUnlock = async () => {
    errorMessage = '';
    if (!pendingSessionState) return;
    if (!passphrase.trim()) {
      errorMessage = 'Passphrase is required to decrypt notes.';
      return;
    }
    isSubmitting = true;
    try {
      const deviceSettings = getDeviceSettings(pendingSessionState.userId);
      if (deviceSettings.biometricsEnabled && deviceSettings.biometricCredentialId) {
        await promptBiometric(deviceSettings.biometricCredentialId);
      }
      const deviceRecord = await readAnyDeviceRecord();
      let deviceId = deviceRecord?.deviceId ?? '';
      let currentSessionToken = pendingSessionState.sessionToken;
      const masterKey = await deriveMasterKey(passphrase, pendingSessionState.e2eeSalt);
      let dek;
      if (deviceId) {
        try {
          const deviceKey = await loadDeviceKey(deviceId, masterKey.keyBytes);
          const wrappedDek = await fetchDeviceDek({ sessionToken: currentSessionToken, deviceId });
          currentSessionToken = wrappedDek.sessionToken ?? currentSessionToken;
          dek = await unwrapDekForDevice({
            ciphertext: wrappedDek.wrappedDek,
            nonce: wrappedDek.wrapNonce
          }, deviceKey);
        } catch (err) {
          console.warn('Failed to load existing device, registering new device.', err);
          deviceId = '';
        }
      }

      if (!deviceId) {
        const masterWrappedDek = await fetchMasterWrappedDek({ sessionToken: currentSessionToken });
        currentSessionToken = masterWrappedDek.sessionToken ?? currentSessionToken;
        dek = await unwrapDekWithMasterKey({
          ciphertext: masterWrappedDek.wrappedDek,
          nonce: masterWrappedDek.wrapNonce
        }, masterKey.keyBytes);
        const deviceBundle = await createDeviceKeyBundle(masterKey.keyBytes);
        const wrappedDekForDevice = await wrapDekForDevice(dek, deviceBundle.deviceKey);
        const deviceResponse = await registerDevice({
          sessionToken: currentSessionToken,
          deviceId: deviceBundle.deviceId,
          wrappedDek: wrappedDekForDevice.ciphertext,
          wrapNonce: wrappedDekForDevice.nonce,
          version: 1
        });
        currentSessionToken = deviceResponse.sessionToken ?? currentSessionToken;
        deviceId = deviceBundle.deviceId;
      }

      await setSession({
        sessionToken: currentSessionToken,
        userId: pendingSessionState.userId,
        username: pendingSessionState.username,
        e2eeSalt: pendingSessionState.e2eeSalt,
        passphraseVerifierSalt: pendingSessionState.passphraseVerifierSalt,
        passphraseVerifierVersion: pendingSessionState.passphraseVerifierVersion,
        deviceId
      });
      dekStore.set(dek);
      if (deviceSettings.allowUnsafeDekCache) {
        await storeUnsafeDek(pendingSessionState.userId, deviceId, dek);
      }
      await goto(`${base}/notes`);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Unlock failed.';
    } finally {
      isSubmitting = false;
    }
  };

  const handlePasskeyUnlock = async () => {
    errorMessage = '';
    if (!pendingSessionState) return;
    const deviceSettings = getDeviceSettings(pendingSessionState.userId);
    if (!deviceSettings.biometricsEnabled || !deviceSettings.biometricCredentialId) {
      errorMessage = 'Passkey verification is not enabled for this device.';
      return;
    }
    if (!deviceSettings.allowUnsafeDekCache) {
      errorMessage = 'Enable “Keep this device unlocked after refresh” to use passkey-only unlock.';
      return;
    }
    if (!pendingSessionState.deviceId) {
      errorMessage = 'Unlock with your passphrase once to finish setting up this device.';
      return;
    }
    isSubmitting = true;
    try {
      await promptBiometric(deviceSettings.biometricCredentialId);
      const cachedDek = await loadUnsafeDek(pendingSessionState.userId, pendingSessionState.deviceId);
      if (!cachedDek) {
        errorMessage = 'No cached device key found. Unlock with your passphrase to refresh it.';
        return;
      }
      await setSession({
        sessionToken: pendingSessionState.sessionToken,
        userId: pendingSessionState.userId,
        username: pendingSessionState.username,
        e2eeSalt: pendingSessionState.e2eeSalt,
        passphraseVerifierSalt: pendingSessionState.passphraseVerifierSalt,
        passphraseVerifierVersion: pendingSessionState.passphraseVerifierVersion,
        deviceId: pendingSessionState.deviceId
      });
      dekStore.set(cachedDek);
      await goto(`${base}/notes`);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Passkey unlock failed.';
    } finally {
      isSubmitting = false;
    }
  };
</script>

<section class="card">
  <h2>Login</h2>
  <p class="helper">Choose magic link or TOTP to authenticate, then unlock your notes with your local passphrase.</p>

  {#if loginStep === 'auth'}
    <div class="auth-method-tabs" role="tablist">
      <button
        class:active={authMethod === 'magic'}
        on:click={() => {
          authMethod = 'magic';
          setAuthMethodPreference('magic');
        }}
        type="button"
      >
        Magic link
      </button>
      <button
        class:active={authMethod === 'totp'}
        on:click={() => {
          authMethod = 'totp';
          setAuthMethodPreference('totp');
        }}
        type="button"
      >
        TOTP
      </button>
    </div>

    {#if authMethod === 'magic'}
      <div class="form">
        <label>
          Email
          <input bind:value={email} type="email" autocomplete="email" />
        </label>

        <button on:click|preventDefault={handleMagicLinkRequest} disabled={isSubmitting}>
          {isSubmitting ? 'Sending link...' : 'Send magic link'}
        </button>

        {#if magicLinkExpiresAt > 0}
          <div class="helper">
            Check your email for the magic link token. Expires {new Date(magicLinkExpiresAt).toLocaleTimeString()}.
          </div>
          <label>
            Enter token
            <input bind:value={token} autocomplete="one-time-code" />
          </label>
          <button on:click|preventDefault={handleMagicLinkVerify} disabled={isSubmitting}>
            {isSubmitting ? 'Verifying...' : 'Verify token'}
          </button>
        {/if}
      </div>
    {:else}
      <div class="form">
        <label>
          Username
          <input bind:value={username} autocomplete="username" />
        </label>
        <label>
          Authentication code
          <input bind:value={totpCode} inputmode="numeric" autocomplete="one-time-code" />
        </label>

        <button on:click|preventDefault={handleTotpSignIn} disabled={isSubmitting}>
          {isSubmitting ? 'Verifying...' : 'Login with TOTP'}
        </button>
      </div>
    {/if}
  {:else}
    <div class="form">
      <p class="helper">Use your passkey or your passphrase to unlock this device.</p>
      <button type="button" class="secondary" on:click={handlePasskeyUnlock} disabled={isSubmitting}>
        {isSubmitting ? 'Unlocking...' : 'Unlock with passkey'}
      </button>
      <label>
        Decryption passphrase
        <input bind:value={passphrase} type="password" autocomplete="current-password" />
      </label>
      <button on:click|preventDefault={handlePassphraseUnlock} disabled={isSubmitting}>
        {isSubmitting ? 'Unlocking...' : 'Unlock notes'}
      </button>
    </div>
  {/if}

  {#if errorMessage}
    <div class="error">{errorMessage}</div>
  {/if}
</section>

<style>
  .auth-method-tabs {
    display: inline-flex;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
    padding: 0.35rem;
    border-radius: 999px;
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
  }

  .auth-method-tabs button {
    border: none;
    background: transparent;
    color: var(--color-muted);
    padding: 0.45rem 1rem;
    border-radius: 999px;
    box-shadow: none;
  }

  .auth-method-tabs button.active {
    background: var(--color-surface);
    color: var(--color-primary-strong);
    box-shadow: var(--shadow-soft);
  }
</style>
