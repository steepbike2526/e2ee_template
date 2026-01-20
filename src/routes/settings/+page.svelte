<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { dekStore, sessionStore } from '$lib/state';
  import {
    deriveDeviceKeyLabel,
    deriveMasterKey,
    encryptWithKey,
    exportRawKey,
    generateRandomSalt,
    importAesKey
  } from '$lib/crypto/keys';
  import { loadDeviceKey, wrapDekWithMasterKey } from '$lib/e2ee';
  import { setSession } from '$lib/session';
  import { storeDeviceRecord } from '$lib/storage/device';
  import { updatePassphrase } from '$lib/api';
  import {
    clearUnsafeDek,
    getAuthMethodPreference,
    getDeviceSettings,
    setAuthMethodPreference,
    storeUnsafeDek,
    updateDeviceSettings
  } from '$lib/deviceSettings';
  import { isBiometricAvailable, promptBiometric, registerBiometricCredential } from '$lib/biometrics';

  let settings = getDeviceSettings(null);
  let biometricAvailable = false;
  let biometricStatus = '';
  let deviceSetupStatus = '';
  let passphraseError = '';
  let passphraseSuccess = '';
  let currentPassphrase = '';
  let newPassphrase = '';
  let confirmPassphrase = '';
  let refreshWarning = '';

  const refreshSettings = () => {
    const session = get(sessionStore);
    settings = getDeviceSettings(session?.userId ?? null);
  };

  const handleAuthMethodChange = (method) => {
    const session = get(sessionStore);
    if (!session) return;
    settings = updateDeviceSettings(session.userId, { authMethod: method });
    setAuthMethodPreference(method);
  };

  const handleBiometricToggle = async (enabled) => {
    biometricStatus = '';
    const session = get(sessionStore);
    if (!session) return;
    if (!enabled) {
      settings = updateDeviceSettings(session.userId, { biometricsEnabled: false, biometricCredentialId: undefined });
      return;
    }
    if (!biometricAvailable) {
      biometricStatus = 'Biometrics are not available on this device.';
      return;
    }
    try {
      const credentialId = await registerBiometricCredential(session.userId);
      settings = updateDeviceSettings(session.userId, { biometricsEnabled: true, biometricCredentialId: credentialId });
      biometricStatus = 'Biometric unlock is enabled for this device.';
    } catch (err) {
      biometricStatus = err instanceof Error ? err.message : 'Failed to enable biometrics.';
    }
  };

  const handleBiometricTest = async () => {
    biometricStatus = '';
    const session = get(sessionStore);
    if (!session || !settings.biometricCredentialId) return;
    try {
      await promptBiometric(settings.biometricCredentialId);
      biometricStatus = 'Biometric prompt succeeded.';
    } catch (err) {
      biometricStatus = err instanceof Error ? err.message : 'Biometric prompt failed.';
    }
  };

  const handleUnsafeDekToggle = async (enabled) => {
    refreshWarning = '';
    const session = get(sessionStore);
    const dek = get(dekStore);
    if (!session) return;
    if (enabled) {
      if (!dek) {
        refreshWarning = 'Unlock your vault first so we can store the DEK for this device.';
        return;
      }
      await storeUnsafeDek(session.userId, session.deviceId, dek);
      settings = updateDeviceSettings(session.userId, { allowUnsafeDekCache: true });
      return;
    }
    clearUnsafeDek(session.userId);
    settings = updateDeviceSettings(session.userId, { allowUnsafeDekCache: false });
  };

  const handleResetPassphrase = async () => {
    passphraseError = '';
    passphraseSuccess = '';
    const session = get(sessionStore);
    const dek = get(dekStore);
    if (!session || !dek) {
      passphraseError = 'You must be logged in and unlocked to reset your passphrase.';
      return;
    }
    if (!currentPassphrase.trim()) {
      passphraseError = 'Current passphrase is required.';
      return;
    }
    if (newPassphrase.length < 8) {
      passphraseError = 'New passphrase must be at least 8 characters.';
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      passphraseError = 'New passphrases do not match.';
      return;
    }
    try {
      const currentMasterKey = await deriveMasterKey(currentPassphrase, session.e2eeSalt);
      const newSalt = generateRandomSalt();
      const newMasterKey = await deriveMasterKey(newPassphrase, newSalt);
      const wrappedDek = await wrapDekWithMasterKey(dek, newMasterKey.keyBytes);

      await updatePassphrase({
        sessionToken: session.sessionToken,
        e2eeSalt: newSalt,
        wrappedDek: wrappedDek.ciphertext,
        wrapNonce: wrappedDek.nonce,
        version: 1
      });

      if (session.deviceId) {
        const deviceKey = await loadDeviceKey(session.deviceId, currentMasterKey.keyBytes);
        const rawDeviceKey = await exportRawKey(deviceKey);
        const newMasterCryptoKey = await importAesKey(newMasterKey.keyBytes);
        const aad = deriveDeviceKeyLabel(session.deviceId);
        const encrypted = await encryptWithKey(newMasterCryptoKey, rawDeviceKey, aad);
        await storeDeviceRecord({
          deviceId: session.deviceId,
          encryptedDeviceKey: encrypted.ciphertext,
          deviceKeyNonce: encrypted.nonce
        });
      }

      await setSession({
        ...session,
        e2eeSalt: newSalt
      });

      currentPassphrase = '';
      newPassphrase = '';
      confirmPassphrase = '';
      passphraseSuccess = 'Passphrase reset successfully.';
    } catch (err) {
      passphraseError = err instanceof Error ? err.message : 'Passphrase reset failed.';
    }
  };

  const handleCopySetup = async () => {
    deviceSetupStatus = '';
    const session = get(sessionStore);
    if (!session) return;
    const message = `Set up another device:\n1. Open the login page.\n2. Sign in with ${settings.authMethod === 'totp' ? 'TOTP' : 'magic link'}.\n3. Unlock with your passphrase to register the new device.\nUsername: ${session.username}`;
    try {
      await navigator.clipboard.writeText(message);
      deviceSetupStatus = 'Setup instructions copied to clipboard.';
    } catch {
      deviceSetupStatus = 'Unable to copy. You can still follow the steps above.';
    }
  };

  onMount(async () => {
    refreshSettings();
    const preferredMethod = getAuthMethodPreference();
    const session = get(sessionStore);
    if (session) {
      settings = updateDeviceSettings(session.userId, { authMethod: preferredMethod });
    } else {
      settings.authMethod = preferredMethod;
    }
    biometricAvailable = await isBiometricAvailable();
  });

  $: if ($sessionStore) {
    settings = getDeviceSettings($sessionStore.userId);
    const preferredMethod = getAuthMethodPreference();
    if (settings.authMethod !== preferredMethod) {
      settings = updateDeviceSettings($sessionStore.userId, { authMethod: preferredMethod });
    }
  }
</script>

<section class="card">
  <h2>Settings</h2>
  <p class="helper">Manage authentication, device security, and unlock behavior for this PWA installation.</p>

  {#if !$sessionStore}
    <div class="helper">Log in to manage device-specific settings.</div>
  {:else}
    <div class="settings-grid">
      <section class="panel">
        <h3>Sign-in method</h3>
        <p class="helper">Choose the default login flow shown on this device.</p>
        <div class="options">
          <label>
            <input
              type="radio"
              name="auth-method"
              checked={settings.authMethod === 'magic'}
              on:change={() => handleAuthMethodChange('magic')}
            />
            Magic link
          </label>
          <label>
            <input
              type="radio"
              name="auth-method"
              checked={settings.authMethod === 'totp'}
              on:change={() => handleAuthMethodChange('totp')}
            />
            TOTP
          </label>
        </div>
      </section>

      <section class="panel">
        <h3>Biometrics</h3>
        <p class="helper">Use WebAuthn to prompt for biometric verification before unlocking.</p>
        <label class="toggle">
          <input
            type="checkbox"
            checked={settings.biometricsEnabled}
            on:change={(event) => handleBiometricToggle(event.currentTarget.checked)}
          />
          Enable biometric prompt on this device
        </label>
        <button type="button" class="secondary" on:click={handleBiometricTest} disabled={!settings.biometricCredentialId}>
          Test biometric prompt
        </button>
        {#if biometricStatus}
          <div class="helper">{biometricStatus}</div>
        {/if}
      </section>

      <section class="panel">
        <h3>Refresh behavior</h3>
        <p class="helper">
          Skip the passphrase check after a refresh by storing the DEK locally on this device.
        </p>
        <label class="toggle">
          <input
            type="checkbox"
            checked={settings.allowUnsafeDekCache}
            on:change={(event) => handleUnsafeDekToggle(event.currentTarget.checked)}
          />
          Keep this device unlocked after refresh
        </label>
        <div class="warning">
          <strong>Warning:</strong> Enabling this stores your decrypted DEK in local storage. Only enable this on devices
          you trust to remain secure.
        </div>
        {#if refreshWarning}
          <div class="helper">{refreshWarning}</div>
        {/if}
      </section>

      <section class="panel">
        <h3>Reset passphrase</h3>
        <p class="helper">Rewrap your master key and device key with a new passphrase.</p>
        <div class="form">
          <label>
            Current passphrase
            <input bind:value={currentPassphrase} type="password" autocomplete="current-password" />
          </label>
          <label>
            New passphrase
            <input bind:value={newPassphrase} type="password" autocomplete="new-password" />
          </label>
          <label>
            Confirm new passphrase
            <input bind:value={confirmPassphrase} type="password" autocomplete="new-password" />
          </label>
          <button type="button" on:click={handleResetPassphrase}>Reset passphrase</button>
          {#if passphraseError}
            <div class="error">{passphraseError}</div>
          {/if}
          {#if passphraseSuccess}
            <div class="helper">{passphraseSuccess}</div>
          {/if}
        </div>
      </section>

      <section class="panel">
        <h3>Set up another device</h3>
        <p class="helper">
          Use your existing login method and passphrase on the new device. The new device will register its own device
          key on first unlock.
        </p>
        <ol>
          <li>Open the login page on the new device.</li>
          <li>Sign in using {settings.authMethod === 'totp' ? 'TOTP' : 'magic link'}.</li>
          <li>Enter your passphrase to register and unlock.</li>
        </ol>
        <button type="button" class="secondary" on:click={handleCopySetup}>Copy setup instructions</button>
        {#if deviceSetupStatus}
          <div class="helper">{deviceSetupStatus}</div>
        {/if}
      </section>
    </div>
  {/if}
</section>

<style>
  .settings-grid {
    display: grid;
    gap: 1.5rem;
    margin-top: 1.5rem;
  }

  .panel {
    padding: 1.25rem;
    border-radius: 0.9rem;
    background: rgba(15, 23, 42, 0.4);
    border: 1px solid #334155;
  }

  .options {
    display: flex;
    gap: 1.5rem;
    margin-top: 0.75rem;
  }

  .toggle {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    margin-top: 0.75rem;
  }

  .warning {
    margin-top: 0.75rem;
    padding: 0.75rem;
    border-radius: 0.75rem;
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(248, 113, 113, 0.4);
    font-size: 0.85rem;
  }

  .secondary {
    background: transparent;
    color: #e2e8f0;
    border: 1px solid #334155;
  }

  ol {
    margin: 0.75rem 0 0;
    padding-left: 1.4rem;
  }
</style>
