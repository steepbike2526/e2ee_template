<script>
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { deriveMasterKey } from '$lib/crypto/keys';
  import { fetchDeviceDek, fetchMasterWrappedDek, loginWithTotp, registerDevice, requestMagicLink, verifyMagicLink } from '$lib/api';
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

  let method = getAuthMethodPreference();
  let username = '';
  let email = '';
  let token = '';
  let totpCode = '';
  let passphrase = '';
  let magicLinkExpiresAt = 0;
  let step = 'auth';
  let pendingSession = null;
  let error = '';
  let loading = false;

  onMount(() => {
    const savedEmail = localStorage.getItem(savedEmailKey);
    if (savedEmail && !email) {
      email = savedEmail;
    }
    const storedSession = get(sessionStore);
    const dek = get(dekStore);
    if (storedSession && !dek) {
      pendingSession = storedSession;
      step = 'decrypt';
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
    pendingSession = response;
    step = 'decrypt';
    error = '';
  };

  const handleRequestMagic = async () => {
    error = '';
    if (!email.trim()) {
      error = 'Email is required.';
      return;
    }
    loading = true;
    try {
      const response = await requestMagicLink({ email });
      rememberEmail(email);
      magicLinkExpiresAt = response.expiresAt;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Magic link request failed.';
    } finally {
      loading = false;
    }
  };

  const handleVerifyMagic = async () => {
    error = '';
    if (!email.trim() || !token.trim()) {
      error = 'Email and token are required.';
      return;
    }
    loading = true;
    try {
      const response = await verifyMagicLink({ email, token });
      rememberEmail(email);
      startDecrypt(response);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Magic link verification failed.';
    } finally {
      loading = false;
    }
  };

  const handleTotpLogin = async () => {
    error = '';
    if (!username.trim() || !totpCode.trim()) {
      error = 'Username and TOTP code are required.';
      return;
    }
    loading = true;
    try {
      const response = await loginWithTotp({ username, code: totpCode });
      startDecrypt(response);
    } catch (err) {
      error = err instanceof Error ? err.message : 'TOTP login failed.';
    } finally {
      loading = false;
    }
  };

  const handleUnlock = async () => {
    error = '';
    if (!pendingSession) return;
    if (!passphrase.trim()) {
      error = 'Passphrase is required to decrypt notes.';
      return;
    }
    loading = true;
    try {
      const deviceSettings = getDeviceSettings(pendingSession.userId);
      if (deviceSettings.biometricsEnabled && deviceSettings.biometricCredentialId) {
        await promptBiometric(deviceSettings.biometricCredentialId);
      }
      const deviceRecord = await readAnyDeviceRecord();
      let deviceId = deviceRecord?.deviceId ?? '';
      let currentSessionToken = pendingSession.sessionToken;
      const masterKey = await deriveMasterKey(passphrase, pendingSession.e2eeSalt);
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
        userId: pendingSession.userId,
        username: pendingSession.username,
        e2eeSalt: pendingSession.e2eeSalt,
        deviceId
      });
      dekStore.set(dek);
      if (deviceSettings.allowUnsafeDekCache) {
        await storeUnsafeDek(pendingSession.userId, deviceId, dek);
      }
      await goto(`${base}/notes`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unlock failed.';
    } finally {
      loading = false;
    }
  };

  const handlePasskeyUnlock = async () => {
    error = '';
    if (!pendingSession) return;
    const deviceSettings = getDeviceSettings(pendingSession.userId);
    if (!deviceSettings.biometricsEnabled || !deviceSettings.biometricCredentialId) {
      error = 'Passkey verification is not enabled for this device.';
      return;
    }
    if (!deviceSettings.allowUnsafeDekCache) {
      error = 'Enable “Keep this device unlocked after refresh” to use passkey-only unlock.';
      return;
    }
    if (!pendingSession.deviceId) {
      error = 'Unlock with your passphrase once to finish setting up this device.';
      return;
    }
    loading = true;
    try {
      await promptBiometric(deviceSettings.biometricCredentialId);
      const cachedDek = await loadUnsafeDek(pendingSession.userId, pendingSession.deviceId);
      if (!cachedDek) {
        error = 'No cached device key found. Unlock with your passphrase to refresh it.';
        return;
      }
      await setSession({
        sessionToken: pendingSession.sessionToken,
        userId: pendingSession.userId,
        username: pendingSession.username,
        e2eeSalt: pendingSession.e2eeSalt,
        deviceId: pendingSession.deviceId
      });
      dekStore.set(cachedDek);
      await goto(`${base}/notes`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Passkey unlock failed.';
    } finally {
      loading = false;
    }
  };
</script>

<section class="card">
  <h2>Login</h2>
  <p class="helper">Choose magic link or TOTP to authenticate, then unlock your notes with your local passphrase.</p>

  {#if step === 'auth'}
    <div class="tabs">
      <button
        class:active={method === 'magic'}
        on:click={() => {
          method = 'magic';
          setAuthMethodPreference('magic');
        }}
        type="button"
      >
        Magic link
      </button>
      <button
        class:active={method === 'totp'}
        on:click={() => {
          method = 'totp';
          setAuthMethodPreference('totp');
        }}
        type="button"
      >
        TOTP
      </button>
    </div>

    {#if method === 'magic'}
      <div class="form">
        <label>
          Email
          <input bind:value={email} type="email" autocomplete="email" />
        </label>

        <button on:click|preventDefault={handleRequestMagic} disabled={loading}>
          {loading ? 'Sending link...' : 'Send magic link'}
        </button>

        {#if magicLinkExpiresAt > 0}
          <div class="helper">
            Check your email for the magic link token. Expires {new Date(magicLinkExpiresAt).toLocaleTimeString()}.
          </div>
          <label>
            Enter token
            <input bind:value={token} autocomplete="one-time-code" />
          </label>
          <button on:click|preventDefault={handleVerifyMagic} disabled={loading}>
            {loading ? 'Verifying...' : 'Verify token'}
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

        <button on:click|preventDefault={handleTotpLogin} disabled={loading}>
          {loading ? 'Verifying...' : 'Login with TOTP'}
        </button>
      </div>
    {/if}
  {:else}
    <div class="form">
      <p class="helper">Use your passkey or your passphrase to unlock this device.</p>
      <button type="button" class="secondary" on:click={handlePasskeyUnlock} disabled={loading}>
        {loading ? 'Unlocking...' : 'Unlock with passkey'}
      </button>
      <label>
        Decryption passphrase
        <input bind:value={passphrase} type="password" autocomplete="current-password" />
      </label>
      <button on:click|preventDefault={handleUnlock} disabled={loading}>
        {loading ? 'Unlocking...' : 'Unlock notes'}
      </button>
    </div>
  {/if}

  {#if error}
    <div class="error">{error}</div>
  {/if}
</section>

<style>
  .tabs {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .tabs button {
    border: 1px solid #334155;
    background: transparent;
    color: #e2e8f0;
    padding: 0.5rem 0.9rem;
    border-radius: 999px;
  }

  .tabs button.active {
    background: #1e293b;
  }

  .secondary {
    background: transparent;
    color: #e2e8f0;
    border: 1px solid #334155;
  }

</style>
