<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { deriveMasterKey } from '$lib/crypto/keys';
  import { fetchDeviceDek, loginWithTotp, requestMagicLink, verifyMagicLink } from '$lib/api';
  import { loadDeviceKey, unwrapDekForDevice } from '$lib/e2ee';
  import { setSession } from '$lib/session';
  import { dekStore } from '$lib/state';
  import { readAnySession } from '$lib/storage/session';

  const savedEmailKey = 'e2ee:lastEmail';

  let method = 'magic';
  let username = '';
  let email = '';
  let token = '';
  let totpCode = '';
  let passphrase = '';
  let magicLinkToken = '';
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
      magicLinkToken = response.token;
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
      const previous = await readAnySession();
      const deviceId = previous?.deviceId ?? '';
      if (!deviceId) {
        throw new Error('This device is not registered. Please login on the original device to export the DEK.');
      }
      const masterKey = await deriveMasterKey(passphrase, pendingSession.e2eeSalt);
      const deviceKey = await loadDeviceKey(deviceId, masterKey.keyBytes);
      const wrappedDek = await fetchDeviceDek({ sessionToken: pendingSession.sessionToken, deviceId });
      const dek = await unwrapDekForDevice({
        ciphertext: wrappedDek.wrappedDek,
        nonce: wrappedDek.wrapNonce
      }, deviceKey);

      await setSession({
        sessionToken: pendingSession.sessionToken,
        userId: pendingSession.userId,
        username: pendingSession.username,
        e2eeSalt: pendingSession.e2eeSalt,
        deviceId
      });
      dekStore.set(dek);
      await goto('/demo');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unlock failed.';
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
      <button class:active={method === 'magic'} on:click={() => (method = 'magic')} type="button">
        Magic link
      </button>
      <button class:active={method === 'totp'} on:click={() => (method = 'totp')} type="button">
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

        {#if magicLinkToken}
          <div class="helper">
            Magic link token (dev only): <span class="token">{magicLinkToken}</span>
          </div>
          <div class="helper">
            Expires {new Date(magicLinkExpiresAt).toLocaleTimeString()}.
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

  .token {
    font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
      'Courier New', monospace;
  }
</style>
