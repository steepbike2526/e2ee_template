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
  let authMethod = 'magic';
  let enableTotp = false;
  let totpSecret = '';
  let error = '';
  let loading = false;
  let registrationComplete = false;
  let showSetupStep = false;
  let copiedSecret = '';

  $: enableTotp = authMethod === 'totp';

  const validate = () => {
    if (!username.trim()) return 'Username is required.';
    if (!enableTotp && !email.trim()) return 'Email is required unless you enable TOTP.';
    if (!passphrase || passphrase.length < 8) return 'Passphrase must be at least 8 characters.';
    if (passphrase !== confirmPassphrase) return 'Passphrases do not match.';
    return '';
  };

  const handleSubmit = async () => {
    error = validate();
    if (error) return;
    loading = true;
    try {
      const passphraseVerifierSalt = generateRandomSalt();
      const passphraseVerifier = await derivePassphraseVerifier(passphrase, passphraseVerifierSalt);
      const response = await registerUser({
        username,
        email: email.trim() ? email.trim() : undefined,
        enableTotp,
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
      setAuthMethodPreference(authMethod);
      totpSecret = response.totpSecret ?? '';
      registrationComplete = true;
      showSetupStep = enableTotp;
      if (!showSetupStep) {
        await goto(`${base}/notes`);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Registration failed.';
    } finally {
      loading = false;
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

  {#if registrationComplete && showSetupStep}
    <div class="totp-card">
      {#if totpSecret}
        <h3>Save your TOTP secret</h3>
        <p class="helper">
          Add this secret to your authenticator app. This is shown only once. Store it somewhere safe before continuing.
        </p>
        <div class="secret-row">
          <div class="totp-secret">{totpSecret}</div>
          <button
            class="copy-button"
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
      {:else if enableTotp}
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
        <label class:active={authMethod === 'magic'}>
          <input type="radio" bind:group={authMethod} value="magic" />
          Magic link
        </label>
        <label class:active={authMethod === 'totp'}>
          <input type="radio" bind:group={authMethod} value="totp" />
          TOTP app
        </label>
      </div>
    </fieldset>
    <label>
      Email {enableTotp ? '(optional for TOTP)' : '(required for magic link)'}
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
    {#if enableTotp}
      <p class="helper">
        If you skip email, you will only be able to log in with TOTP. Keep your authenticator app in a safe place.
      </p>
    {/if}

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <button on:click|preventDefault={handleSubmit} disabled={loading}>
      {loading ? 'Creating account...' : 'Register'}
    </button>
  </div>
  {/if}
</section>

<style>
  .totp-card {
    display: grid;
    gap: 1rem;
  }

  .totp-secret {
    font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
      'Courier New', monospace;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    background: #0f172a;
    border: 1px solid #334155;
    color: #e2e8f0;
    word-break: break-all;
    flex: 1;
  }

  .secret-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .copy-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 999px;
    padding: 0.45rem 0.85rem;
    border: 1px solid #334155;
    background: #0b1220;
    color: #e2e8f0;
    font-weight: 600;
  }

  .copy-button svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }

  .copy-feedback {
    color: #38bdf8;
    font-weight: 600;
  }

  .auth-toggle {
    border: 0;
    padding: 0;
    margin: 0 0 1rem;
  }

  .auth-options {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .auth-options label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.85rem;
    border-radius: 999px;
    border: 1px solid #334155;
    cursor: pointer;
  }

  .auth-options label.active {
    background: #1e293b;
    border-color: #38bdf8;
  }

  .auth-options input {
    accent-color: #38bdf8;
  }
</style>
