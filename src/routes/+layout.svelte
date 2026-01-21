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
    const loginPath = `${base}/login`;
    try {
      await revokeSession({ sessionToken: session.sessionToken });
    } catch (err) {
      console.warn('Failed to revoke session.', err);
    } finally {
      clearUnsafeDek(session.userId);
      await clearSession();
      try {
        await goto(loginPath, { replaceState: true });
      } catch (err) {
        console.warn('Failed to navigate to login.', err);
        if (browser) {
          window.location.assign(loginPath);
        }
      }
    }
  };

  const withBase = (path) => `${base}${path}`;
  const applyUpdate = () => updateSW?.(true);

  const protectedRoutes = new Set(['/notes', '/settings']);

  $: if (browser) {
    const loginPath = `${base}/login`;
    if ($sessionStore && !$dekStore && $page.url.pathname !== loginPath) {
      goto(loginPath);
    }
    if (!$sessionStore && protectedRoutes.has($page.url.pathname)) {
      goto(loginPath);
    }
  }
</script>

<svelte:head>
  <title>E2EE Notes</title>
</svelte:head>

<div class="app">
  <header class="app__header">
    <div class="app__brand">
      <div>
        <h1>NoAppStore Demo</h1>
        <p class="app__subtitle">Private, end-to-end encrypted notes for teams and devices.</p>
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
    </div>
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
  </header>

  <main class="app__main">
    <div class="app__content">
      <slot />
    </div>
  </main>
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .app__header {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 2rem clamp(1.5rem, 3vw, 3.5rem);
    background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #1d4ed8 100%);
    color: #f8fafc;
  }

  .app__brand {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .app__subtitle {
    margin: 0.35rem 0 0;
    color: rgba(248, 250, 252, 0.75);
    font-size: 0.95rem;
  }

  .app__nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  nav {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: center;
  }

  nav a {
    color: #e2e8f0;
    font-weight: 600;
  }

  nav a:hover {
    color: #ffffff;
  }

  .logout {
    border: 1px solid rgba(248, 250, 252, 0.4);
    background: transparent;
    color: #ffffff;
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    cursor: pointer;
    box-shadow: none;
  }

  .logout:hover {
    background: rgba(248, 250, 252, 0.15);
  }

  .version {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: rgba(248, 250, 252, 0.8);
  }

  .version__badge {
    border: 1px solid rgba(255, 255, 255, 0.6);
    background: rgba(15, 23, 42, 0.3);
    color: #ffffff;
    font-size: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    cursor: pointer;
  }

  .version__badge--info {
    border-color: rgba(34, 197, 94, 0.6);
    background: rgba(34, 197, 94, 0.2);
    cursor: default;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.9rem;
    background: rgba(15, 23, 42, 0.35);
    padding: 0.4rem 0.8rem;
    border-radius: 999px;
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
    padding-left: 0.6rem;
    border-left: 1px solid rgba(248, 250, 252, 0.4);
    text-transform: capitalize;
  }

  .app__main {
    flex: 1;
    padding: 2.5rem clamp(1.5rem, 3vw, 3.5rem) 3.5rem;
  }

  .app__content {
    max-width: 960px;
    margin: 0 auto;
    display: grid;
    gap: 1.5rem;
  }
</style>
