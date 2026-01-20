import { browser } from '$app/environment';
import { sessionStore, dekStore, type SessionState } from './state';

const SESSION_STORAGE_KEY = 'e2ee:session';

const isSessionState = (value: unknown): value is SessionState => {
  if (!value || typeof value !== 'object') return false;
  const session = value as SessionState;
  return Boolean(
    session.sessionToken &&
      session.userId &&
      session.username &&
      session.e2eeSalt &&
      session.deviceId
  );
};

const readStoredSession = (): SessionState | null => {
  if (!browser) return null;
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isSessionState(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore invalid storage payloads.
  }
  localStorage.removeItem(SESSION_STORAGE_KEY);
  return null;
};

export async function restoreSession() {
  const session = readStoredSession();
  if (session) {
    sessionStore.set(session);
  }
  return session;
}

export function updateSessionToken(sessionToken: string) {
  sessionStore.update((session) => {
    if (!session) return session;
    const updated = { ...session, sessionToken };
    if (browser) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
    }
    return updated;
  });
}

export async function setSession(session: SessionState) {
  sessionStore.set(session);
  if (browser) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }
}

export async function clearSession() {
  sessionStore.set(null);
  dekStore.set(null);
  if (browser) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}
