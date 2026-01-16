<script>
  import { goto } from '$app/navigation';
  import { createDeviceKeyBundle, wrapDekForDevice } from '$lib/e2ee';
  import { deriveMasterKey, generateAesKey } from '$lib/crypto/keys';
  import { registerDevice, registerUser } from '$lib/api';
  import { setSession } from '$lib/session';
  import { dekStore } from '$lib/state';

  let username = '';
  let email = '';
  let passphrase = '';
  let confirmPassphrase = '';
  let enableTotp = false;
  let totpSecret = '';
  let error = '';
  let loading = false;
  let registrationComplete = false;

  const validate = () => {
    if (!username.trim()) return 'Username is required.';
    if (!email.trim()) return 'Email is required for magic link or TOTP login.';
    if (!passphrase || passphrase.length < 8) return 'Passphrase must be at least 8 characters.';
    if (passphrase !== confirmPassphrase) return 'Passphrases do not match.';
    return '';
  };

  const handleSubmit = async () => {
    error = validate();
    if (error) return;
    loading = true;
    try {
      const response = await registerUser({ username, email, enableTotp });
      const masterKey = await deriveMasterKey(passphrase, response.e2eeSalt);
      const dek = await generateAesKey();
      const deviceBundle = await createDeviceKeyBundle(masterKey.keyBytes);
      const wrappedDek = await wrapDekForDevice(dek, deviceBundle.deviceKey);

      await registerDevice({
        sessionToken: response.sessionToken,
        deviceId: deviceBundle.deviceId,
        wrappedDek: wrappedDek.ciphertext,
        wrapNonce: wrappedDek.nonce,
        version: 1
      });

      await setSession({
        sessionToken: response.sessionToken,
        userId: response.userId,
        username: response.username,
        e2eeSalt: response.e2eeSalt,
        deviceId: deviceBundle.deviceId
      });

      dekStore.set(dek);
      totpSecret = response.totpSecret ?? '';
      registrationComplete = true;
      if (!totpSecret) {
        await goto('/demo');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Registration failed.';
    } finally {
      loading = false;
    }
  };

  const handleContinue = async () => {
    await goto('/demo');
  };
</script>

<section class="card">
  <h2>Create your account</h2>
  <p class="helper">
    Registration sets up your auth account and bootstraps the encrypted key hierarchy. Your passphrase never leaves this
    device.
  </p>

  {#if registrationComplete && totpSecret}
    <div class="totp-card">
      <h3>Save your TOTP secret</h3>
      <p class="helper">
        Add this secret to your authenticator app. This is shown only once. Store it somewhere safe before continuing.
      </p>
      <div class="totp-secret">{totpSecret}</div>
      <button on:click|preventDefault={handleContinue}>Continue to notes</button>
    </div>
  {:else}
  <div class="form">
    <label>
      Username
      <input bind:value={username} autocomplete="username" />
    </label>
    <label>
      Email
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
    <label class="inline">
      <input type="checkbox" bind:checked={enableTotp} />
      Enable TOTP for login
    </label>

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
  }

  .inline {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
</style>
