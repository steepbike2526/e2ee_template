<script>
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { createDeviceKeyBundle, wrapDekForDevice, wrapDekWithMasterKey } from '$lib/e2ee';
  import { deriveMasterKey, derivePassphraseVerifier, generateAesKey, generateRandomSalt } from '$lib/crypto/keys';
  import { createPassphraseProof } from '$lib/crypto/proof';
  import { registerDevice, registerUser, storeMasterWrappedDek } from '$lib/api';
  import { setSession } from '$lib/session';
  import { dekStore } from '$lib/state';
  import { setAuthMethodPreference } from '$lib/deviceSettings';

  let username = '';
  let email = '';
  let passphrase = '';
  let confirmPassphrase = '';
  let selectedAuthMethod = 'magic';
  let isTotpEnabled = false;
  let totpSecret = '';
  let errorMessage = '';
  let isSubmitting = false;
  let isRegistrationComplete = false;
  let showTotpSetupStep = false;
  let copiedSecret = '';

  $: isTotpEnabled = selectedAuthMethod === 'totp';

  const validateRegistration = () => {
    if (!username.trim()) return 'Username is required.';
    if (!isTotpEnabled && !email.trim()) return 'Email is required unless you enable TOTP.';
    if (!passphrase || passphrase.length < 8) return 'Passphrase must be at least 8 characters.';
    if (passphrase !== confirmPassphrase) return 'Passphrases do not match.';
    return '';
  };

  const handleSubmit = async () => {
    errorMessage = validateRegistration();
    if (errorMessage) return;
    isSubmitting = true;
    try {
      const passphraseVerifierSalt = generateRandomSalt();
      const passphraseVerifier = await derivePassphraseVerifier(passphrase, passphraseVerifierSalt);
      const response = await registerUser({
        username,
        email: email.trim() ? email.trim() : undefined,
        enableTotp: isTotpEnabled,
        passphraseVerifier,
        passphraseVerifierSalt,
        passphraseVerifierVersion: 1
      });
      const masterKey = await deriveMasterKey(passphrase, response.e2eeSalt);
      const dek = await generateAesKey();
      const deviceBundle = await createDeviceKeyBundle(masterKey.keyBytes);
      const wrappedDek = await wrapDekForDevice(dek, deviceBundle.deviceKey);
      const masterWrappedDek = await wrapDekWithMasterKey(dek, masterKey.keyBytes);

      let currentSessionToken = response.sessionToken;
      const deviceResponse = await registerDevice({
        sessionToken: currentSessionToken,
        deviceId: deviceBundle.deviceId,
        wrappedDek: wrappedDek.ciphertext,
        wrapNonce: wrappedDek.nonce,
        version: 1
      });
      currentSessionToken = deviceResponse.sessionToken ?? currentSessionToken;

      const masterResponse = await storeMasterWrappedDek({
        sessionToken: currentSessionToken,
        wrappedDek: masterWrappedDek.ciphertext,
        wrapNonce: masterWrappedDek.nonce,
        version: 1,
        passphraseProof: await createPassphraseProof(passphraseVerifier, currentSessionToken)
      });
      currentSessionToken = masterResponse.sessionToken ?? currentSessionToken;

      dekStore.set(dek);

      await setSession({
        sessionToken: currentSessionToken,
        userId: response.userId,
        username: response.username,
        e2eeSalt: response.e2eeSalt,
        passphraseVerifierSalt: response.passphraseVerifierSalt,
        passphraseVerifierVersion: response.passphraseVerifierVersion,
        deviceId: deviceBundle.deviceId
      });
      setAuthMethodPreference(selectedAuthMethod);
      totpSecret = response.totpSecret ?? '';
      isRegistrationComplete = true;
      showTotpSetupStep = isTotpEnabled;
      if (!showTotpSetupStep) {
        await goto(`${base}/notes`);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Registration failed.';
    } finally {
      isSubmitting = false;
    }
  };

  const handleContinue = async () => {
    await goto(`${base}/notes`);
  };

  const handleCopy = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      copiedSecret = `${label} copied`;
      setTimeout(() => {
        if (copiedSecret === `${label} copied`) {
          copiedSecret = '';
        }
      }, 2000);
    } catch (err) {
      copiedSecret = 'Copy failed';
      console.error(err);
    }
  };
</script>

<section class="card">
  <h2>Create your account</h2>
  <p class="helper">
    Registration sets up your auth account and bootstraps the encrypted key hierarchy. Your passphrase never leaves this
    device.
  </p>

  {#if isRegistrationComplete && showTotpSetupStep}
    <div class="totp-setup-card">
      {#if totpSecret}
        <h3>Save your TOTP secret</h3>
        <p class="helper">
          Add this secret to your authenticator app. This is shown only once. Store it somewhere safe before continuing.
        </p>
        <div class="totp-secret-row">
          <div class="totp-secret-value">{totpSecret}</div>
          <button
            class="totp-copy-button"
            type="button"
            on:click={() => handleCopy(totpSecret, 'TOTP secret')}
            aria-label="Copy TOTP secret"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M8 6.5A2.5 2.5 0 0 1 10.5 4h7A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16h-7A2.5 2.5 0 0 1 8 13.5z"
              />
              <path
                d="M4 10.5A2.5 2.5 0 0 1 6.5 8h7A2.5 2.5 0 0 1 16 10.5v7A2.5 2.5 0 0 1 13.5 20h-7A2.5 2.5 0 0 1 4 17.5z"
              />
            </svg>
            Copy
          </button>
        </div>
      {:else if isTotpEnabled}
        <p class="helper error">
          We were unable to retrieve a TOTP secret. Please try registering again or contact support.
        </p>
      {/if}
      {#if copiedSecret}
        <p class="helper copy-feedback" aria-live="polite">{copiedSecret}</p>
      {/if}
      <button on:click|preventDefault={handleContinue}>Continue to notes</button>
    </div>
  {:else}
  <div class="form">
    <label>
      Username
      <input bind:value={username} autocomplete="username" />
    </label>
    <fieldset class="auth-toggle">
      <legend>Login method</legend>
      <p class="helper">
        Choose how you want to sign in. Magic link uses email, while TOTP uses an authenticator app.
      </p>
      <div class="auth-options">
        <label class:active={selectedAuthMethod === 'magic'}>
          <input type="radio" bind:group={selectedAuthMethod} value="magic" />
          Magic link
        </label>
        <label class:active={selectedAuthMethod === 'totp'}>
          <input type="radio" bind:group={selectedAuthMethod} value="totp" />
          TOTP app
        </label>
      </div>
    </fieldset>
    <label>
      Email {isTotpEnabled ? '(optional for TOTP)' : '(required for magic link)'}
      <input bind:value={email} type="email" autocomplete="email" />
    </label>
    <label>
      Encryption passphrase
      <input bind:value={passphrase} type="password" autocomplete="new-password" />
    </label>
    <label>
      Confirm passphrase
      <input bind:value={confirmPassphrase} type="password" autocomplete="new-password" />
    </label>
    <p class="helper">Choose a passphrase you can remember. You will need it to unlock notes on this device.</p>
    {#if isTotpEnabled}
      <p class="helper">
        If you skip email, you will only be able to log in with TOTP. Keep your authenticator app in a safe place.
      </p>
    {/if}

    {#if errorMessage}
      <div class="error">{errorMessage}</div>
    {/if}

    <button on:click|preventDefault={handleSubmit} disabled={isSubmitting}>
      {isSubmitting ? 'Creating account...' : 'Register'}
    </button>
  </div>
  {/if}
</section>

<style>
  .totp-setup-card {
    display: grid;
    gap: 1rem;
  }

  .totp-secret-value {
    font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
      'Courier New', monospace;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    background: var(--color-surface-muted);
    border: 1px solid var(--color-border);
    color: var(--color-text);
    word-break: break-all;
    flex: 1;
  }

  .totp-secret-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .totp-copy-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 999px;
    padding: 0.45rem 0.85rem;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-primary-strong);
    font-weight: 600;
    box-shadow: none;
  }

  .totp-copy-button:hover {
    background: var(--color-surface-muted);
  }

  .totp-copy-button svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }

  .copy-feedback {
    color: var(--color-primary);
    font-weight: 600;
  }

  .auth-toggle {
    border: 0;
    padding: 0;
    margin: 0 0 1rem;
  }

  .auth-toggle legend {
    font-weight: 700;
    margin-bottom: 0.4rem;
  }

  .auth-options {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
  }

  .auth-options label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.85rem;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    cursor: pointer;
    color: var(--color-muted);
    background: var(--color-surface);
  }

  .auth-options label.active {
    background: var(--color-surface-muted);
    border-color: rgba(29, 78, 216, 0.4);
    color: var(--color-primary-strong);
  }

  .auth-options input {
    accent-color: var(--color-primary);
  }
</style>
