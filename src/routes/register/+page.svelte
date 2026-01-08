<script>
  import { goto } from '$app/navigation';
  import { createDeviceKeyBundle, wrapDekForDevice } from '$lib/e2ee';
  import { deriveMasterKey, generateAesKey } from '$lib/crypto/keys';
  import { registerDevice, registerUser } from '$lib/api';
  import { setSession } from '$lib/session';
  import { dekStore } from '$lib/state';

  let username = '';
  let email = '';
  let password = '';
  let error = '';
  let loading = false;

  const validate = () => {
    if (!username.trim()) return 'Username is required.';
    if (!password || password.length < 8) return 'Password must be at least 8 characters.';
    return '';
  };

  const handleSubmit = async () => {
    error = validate();
    if (error) return;
    loading = true;
    try {
      const response = await registerUser({ username, email: email || undefined, password });
      const masterKey = await deriveMasterKey(password, response.e2eeSalt);
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
      await goto('/demo');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Registration failed.';
    } finally {
      loading = false;
    }
  };
</script>

<section class="card">
  <h2>Create your account</h2>
  <p class="helper">Registration sets up your auth account and bootstraps the encrypted key hierarchy.</p>

  <div class="form">
    <label>
      Username
      <input bind:value={username} autocomplete="username" />
    </label>
    <label>
      Email (optional)
      <input bind:value={email} type="email" autocomplete="email" />
    </label>
    <label>
      Password
      <input bind:value={password} type="password" autocomplete="new-password" />
    </label>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <button on:click|preventDefault={handleSubmit} disabled={loading}>
      {loading ? 'Creating account...' : 'Register'}
    </button>
  </div>
</section>
