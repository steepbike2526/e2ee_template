<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { dekStore, onlineStore, sessionStore, syncStatusStore } from '$lib/state';
  import { revokeSession } from '$lib/api';
  import { clearSession, restoreSession } from '$lib/session';
  import { getDeviceSettings, loadUnsafeDek, clearUnsafeDek } from '$lib/deviceSettings';
  import { promptBiometric } from '$lib/biometrics';
  import { registerSW } from 'virtual:pwa-register';
  import { appVersion } from '$lib/version';
  import '../app.css';

  const VERSION_STORAGE_KEY = 'appVersion';
  let updateBadgeVisible = false;
  let updateAvailable = false;
  let updateBadgeMessage = '';
  let updateBadgeAction = false;
  let updateSW;
  let updateBadgeTimeout;

  const showUpdateBadge = (message, { action = false, autoHide = false } = {}) => {
    updateBadgeMessage = message;
    updateBadgeAction = action;
    updateBadgeVisible = true;
    if (updateBadgeTimeout) {
      clearTimeout(updateBadgeTimeout);
      updateBadgeTimeout = undefined;
    }
    if (autoHide) {
      updateBadgeTimeout = setTimeout(() => {
        updateBadgeVisible = false;
      }, 8000);
    }
  };

  onMount(async () => {
    if (!browser) return;
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        updateAvailable = true;
        showUpdateBadge('Update available', { action: true, autoHide: false });
      }
    });
    const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);
    if (storedVersion && storedVersion !== appVersion) {
      showUpdateBadge(`Updated to v${appVersion}`, { action: false, autoHide: true });
    }
    localStorage.setItem(VERSION_STORAGE_KEY, appVersion);
    const session = await restoreSession();
    const dek = get(dekStore);
    const loginPath = `${base}/login`;
    if (session && !dek) {
      const settings = getDeviceSettings(session.userId);
      if (settings.allowUnsafeDekCache) {
        try {
          if (settings.biometricsEnabled && settings.biometricCredentialId) {
            await promptBiometric(settings.biometricCredentialId);
          }
          const cachedDek = await loadUnsafeDek(session.userId, session.deviceId);
          if (cachedDek) {
            dekStore.set(cachedDek);
          }
        } catch (err) {
          console.warn('Failed to restore cached DEK.', err);
        }
      }
    }
    if (session && !get(dekStore) && get(page).url.pathname !== loginPath) {
      await goto(loginPath);
    }
    const updateOnline = () => onlineStore.set(navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    return () => {
      if (updateBadgeTimeout) {
        clearTimeout(updateBadgeTimeout);
      }
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  });

  const handleLogout = async () => {
    const session = $sessionStore;
    if (!session) return;
    await revokeSession({ sessionToken: session.sessionToken });
    clearUnsafeDek(session.userId);
    await clearSession();
  };

  const withBase = (path) => `${base}${path}`;
  const applyUpdate = () => updateSW?.(true);
</script>

<svelte:head>
  <title>E2EE Notes</title>
</svelte:head>

<div class="app">
  <header class="app__header">
    <h1>E2EE Notes</h1>
    <div class="app__nav">
      <nav>
        <a href={withBase('/')}>Home</a>
        {#if !$sessionStore}
          <a href={withBase('/register')}>Register</a>
          <a href={withBase('/login')}>Login</a>
        {:else}
          <a href={withBase('/notes')}>Notes</a>
          <a href={withBase('/settings')}>Settings</a>
        {/if}
        {#if $sessionStore}
          <button type="button" class="logout" on:click={handleLogout}>Logout</button>
        {/if}
      </nav>
      <div class="version">
        <span>v{appVersion}</span>
        {#if updateBadgeVisible}
          {#if updateBadgeAction && updateAvailable}
            <button type="button" class="version__badge" on:click={applyUpdate}>
              {updateBadgeMessage}
            </button>
          {:else}
            <span class="version__badge version__badge--info">{updateBadgeMessage}</span>
          {/if}
        {/if}
      </div>
    </div>
    <div class="status">
      {#if $onlineStore}
        <span class="status__dot status__dot--online"></span>
        <span>Online</span>
      {:else}
        <span class="status__dot status__dot--offline"></span>
        <span>Offline</span>
      {/if}
      <span class="status__sync">{$syncStatusStore}</span>
    </div>
  </header>

  <main class="app__main">
    <slot />
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Inter', system-ui, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
  }

  a {
    color: #38bdf8;
    text-decoration: none;
  }

  .app__header {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem;
    background: #1e293b;
  }

  .app__nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  nav {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .logout {
    border: 1px solid #334155;
    background: transparent;
    color: #e2e8f0;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    cursor: pointer;
  }

  .version {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: #cbd5f5;
  }

  .version__badge {
    border: 1px solid #38bdf8;
    background: rgba(56, 189, 248, 0.15);
    color: #e0f2fe;
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    cursor: pointer;
  }

  .version__badge--info {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.15);
    color: #dcfce7;
    cursor: default;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .status__dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 999px;
    display: inline-block;
  }

  .status__dot--online {
    background: #22c55e;
  }

  .status__dot--offline {
    background: #f97316;
  }

  .status__sync {
    padding-left: 0.5rem;
    border-left: 1px solid #475569;
  }

  .app__main {
    padding: 1.5rem;
  }

</style>
