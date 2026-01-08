<script>
  import { goto } from '$app/navigation';
  import { deriveMasterKey } from '$lib/crypto/keys';
  import { fetchDeviceDek, loginUser } from '$lib/api';
  import { loadDeviceKey, unwrapDekForDevice } from '$lib/e2ee';
  import { setSession } from '$lib/session';
  import { dekStore } from '$lib/state';
  import { readAnySession } from '$lib/storage/session';

  let username = '';
  let password = '';
  let error = '';
  let loading = false;

  const handleSubmit = async () => {
    error = '';
    if (!username || !password) {
      error = 'Username and password are required.';
      return;
    }
    loading = true;
    try {
      const previous = await readAnySession();
      const deviceId = previous?.deviceId ?? '';
      if (!deviceId) {
        throw new Error('This device is not registered. Please login on the original device to export the DEK.');
      }

      const response = await loginUser({ username, password, deviceId });
      const masterKey = await deriveMasterKey(password, response.e2eeSalt);
      const deviceKey = await loadDeviceKey(deviceId, masterKey.keyBytes);
      const wrappedDek = await fetchDeviceDek({ sessionToken: response.sessionToken, deviceId });
      const dek = await unwrapDekForDevice({
        ciphertext: wrappedDek.wrappedDek,
        nonce: wrappedDek.wrapNonce
      }, deviceKey);

      await setSession({
        sessionToken: response.sessionToken,
        userId: response.userId,
        username: response.username,
        e2eeSalt: response.e2eeSalt,
        deviceId
      });
      dekStore.set(dek);
      await goto('/demo');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Login failed.';
    } finally {
      loading = false;
    }
  };
</script>

<section class="card">
  <h2>Login</h2>
  <p class="helper">Traditional auth establishes a session. Your DEK is still unlocked locally.</p>

  <div class="form">
    <label>
      Username
      <input bind:value={username} autocomplete="username" />
    </label>
    <label>
      Password
      <input bind:value={password} type="password" autocomplete="current-password" />
    </label>

    {#if error}
      <div class="error">{error}</div>
    {/if}

    <button on:click|preventDefault={handleSubmit} disabled={loading}>
      {loading ? 'Signing in...' : 'Login'}
    </button>
  </div>
</section>
