<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { dekStore, sessionStore } from '$lib/state';
  import {
    deriveDeviceKeyLabel,
    deriveMasterKey,
    derivePassphraseVerifier,
    encryptWithKey,
    exportRawKey,
    generateRandomSalt,
    importAesKey
  } from '$lib/crypto/keys';
  import { createPassphraseProof } from '$lib/crypto/proof';
  import { loadDeviceKey, wrapDekWithMasterKey } from '$lib/e2ee';
  import { setSession } from '$lib/session';
  import { storeDeviceRecord } from '$lib/storage/device';
  import { getUserPreferences, updatePassphrase, updateUserPreferences } from '$lib/api';
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
  let authMethod = getAuthMethodPreference();
  let totpEnabled = true;
  let authMethodError = '';
  let biometricAvailable = false;
  let biometricStatus = '';
  let passphraseError = '';
  let passphraseSuccess = '';
  let currentPassphrase = '';
  let newPassphrase = '';
  let confirmPassphrase = '';
  let refreshWarning = '';
  let lastSessionToken = '';

  const refreshSettings = () => {
    const session = get(sessionStore);
    settings = getDeviceSettings(session?.userId ?? null);
  };

  const refreshUserPreferences = async (sessionToken) => {
    try {
      const response = await getUserPreferences({ sessionToken });
      authMethod = response.authMethod;
      totpEnabled = response.totpEnabled;
      setAuthMethodPreference(response.authMethod);
    } catch (err) {
      console.error('Failed to load user preferences.', err);
      authMethod = getAuthMethodPreference();
    }
  };

  const handleAuthMethodChange = async (method) => {
    authMethodError = '';
    const session = get(sessionStore);
    if (!session) {
      authMethod = method;
      setAuthMethodPreference(method);
      return;
    }
    if (method === 'totp' && !totpEnabled) {
      authMethodError = 'Enable TOTP during registration before selecting it here.';
      return;
    }
    const previousMethod = authMethod;
    authMethod = method;
    setAuthMethodPreference(method);
    try {
      const response = await updateUserPreferences({ sessionToken: session.sessionToken, authMethod: method });
      authMethod = response.authMethod;
      totpEnabled = response.totpEnabled;
      setAuthMethodPreference(response.authMethod);
    } catch (err) {
      console.error('Failed to update user preferences.', err);
      authMethodError = err instanceof Error ? err.message : 'Failed to update sign-in method.';
      authMethod = previousMethod;
    }
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
      biometricStatus = 'Passkey or device verification is not available on this device.';
      return;
    }
    try {
      const credentialId = await registerBiometricCredential(session.userId);
      settings = updateDeviceSettings(session.userId, { biometricsEnabled: true, biometricCredentialId: credentialId });
      biometricStatus = 'Passkey or device verification is enabled for this device.';
    } catch (err) {
      biometricStatus = err instanceof Error ? err.message : 'Failed to enable passkey verification.';
    }
  };

  const handleBiometricTest = async () => {
    biometricStatus = '';
    const session = get(sessionStore);
    if (!session || !settings.biometricCredentialId) return;
    try {
      await promptBiometric(settings.biometricCredentialId);
      biometricStatus = 'Passkey prompt succeeded.';
    } catch (err) {
      biometricStatus = err instanceof Error ? err.message : 'Passkey prompt failed.';
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
      const currentVerifier = await derivePassphraseVerifier(currentPassphrase, session.passphraseVerifierSalt);
      const nextVerifierSalt = generateRandomSalt();
      const nextVerifier = await derivePassphraseVerifier(newPassphrase, nextVerifierSalt);

      const response = await updatePassphrase({
        sessionToken: session.sessionToken,
        e2eeSalt: newSalt,
        wrappedDek: wrappedDek.ciphertext,
        wrapNonce: wrappedDek.nonce,
        version: 1,
        passphraseProof: await createPassphraseProof(currentVerifier, session.sessionToken),
        nextPassphraseVerifier: nextVerifier,
        nextPassphraseVerifierSalt: nextVerifierSalt,
        nextPassphraseVerifierVersion: 1
      });

      if (session.deviceId) {
        const deviceKey = await loadDeviceKey(session.deviceId, currentMasterKey.keyBytes, true);
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
        sessionToken: response.sessionToken ?? session.sessionToken,
        e2eeSalt: newSalt,
        passphraseVerifierSalt: nextVerifierSalt,
        passphraseVerifierVersion: 1
      });

      currentPassphrase = '';
      newPassphrase = '';
      confirmPassphrase = '';
      passphraseSuccess = 'Passphrase reset successfully.';
    } catch (err) {
      passphraseError = err instanceof Error ? err.message : 'Passphrase reset failed.';
    }
  };

  onMount(async () => {
    refreshSettings();
    const session = get(sessionStore);
    if (session) {
      lastSessionToken = session.sessionToken;
      await refreshUserPreferences(session.sessionToken);
    } else {
      authMethod = getAuthMethodPreference();
    }
    biometricAvailable = await isBiometricAvailable();
  });

  $: if ($sessionStore) {
    settings = getDeviceSettings($sessionStore.userId);
    if ($sessionStore.sessionToken && $sessionStore.sessionToken !== lastSessionToken) {
      lastSessionToken = $sessionStore.sessionToken;
      void refreshUserPreferences($sessionStore.sessionToken);
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
              checked={authMethod === 'magic'}
              on:change={() => handleAuthMethodChange('magic')}
            />
            Magic link
          </label>
          <label>
            <input
              type="radio"
              name="auth-method"
              checked={authMethod === 'totp'}
              disabled={!totpEnabled}
              on:change={() => handleAuthMethodChange('totp')}
            />
            TOTP
          </label>
        </div>
        {#if !totpEnabled}
          <div class="helper">TOTP is not enabled for this account.</div>
        {/if}
        {#if authMethodError}
          <div class="error">{authMethodError}</div>
        {/if}
      </section>

      <section class="panel">
        <h3>Passkey / device verification</h3>
        <p class="helper">
          Use WebAuthn to unlock with the device method (Face ID, Touch ID, PIN, or a platform passkey).
        </p>
        <label class="toggle">
          <input
            type="checkbox"
            checked={settings.biometricsEnabled}
            on:change={(event) => handleBiometricToggle(event.currentTarget.checked)}
          />
          Enable passkey or device verification on this device
        </label>
        <button type="button" class="secondary" on:click={handleBiometricTest} disabled={!settings.biometricCredentialId}>
          Test passkey prompt
        </button>
        {#if biometricStatus}
          <div class="helper">{biometricStatus}</div>
        {/if}
      </section>

      <section class="panel">
        <h3>Refresh behavior</h3>
        <p class="helper">
          Skip the passphrase check after a refresh by storing the DEK locally on this device. When passkey
          verification is enabled, refresh unlock will use the passkey instead of the passphrase.
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
          <strong>Warning:</strong> This stores your decrypted DEK in browser storage. Any XSS issue or malicious
          extension could expose your notes. Only enable this on devices you trust.
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
    padding: 1.5rem;
    border-radius: 1.25rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-card);
  }

  .options {
    display: flex;
    gap: 1.5rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
  }

  .options label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }

  .options input {
    accent-color: var(--color-primary);
  }

  .toggle {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    margin-top: 0.75rem;
    font-weight: 600;
  }

  .toggle input {
    accent-color: var(--color-primary);
  }

  .warning {
    margin-top: 0.75rem;
    padding: 0.9rem 1rem;
    border-radius: 0.9rem;
    background: rgba(220, 38, 38, 0.08);
    border: 1px solid rgba(220, 38, 38, 0.35);
    font-size: 0.9rem;
    color: #991b1b;
  }
</style>
