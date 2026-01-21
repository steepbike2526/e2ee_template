import { browser } from '$app/environment';
import { sessionStore, dekStore, type SessionState } from './state';
import { clearSessionState, readSessionState, storeSessionState } from './storage/session';

const isSessionState = (value: unknown): value is SessionState => {
  if (!value || typeof value !== 'object') return false;
  const session = value as SessionState;
  return Boolean(
      session.sessionToken &&
      session.userId &&
      session.username &&
      session.e2eeSalt &&
      session.deviceId &&
      session.passphraseVerifierSalt &&
      typeof session.passphraseVerifierVersion === 'number'
  );
};

export async function restoreSession() {
  if (!browser) return null;
  const session = await readSessionState();
  if (session && !isSessionState(session)) {
    await clearSessionState();
    return null;
  }
  if (session) {
    sessionStore.set(session);
  }
  return session;
}

export async function updateSessionToken(sessionToken: string) {
  sessionStore.update((session) => {
    if (!session) return session;
    const updated = { ...session, sessionToken };
    if (browser) {
      void storeSessionState(updated);
    }
    return updated;
  });
}

export async function setSession(session: SessionState) {
  sessionStore.set(session);
  if (browser) {
    await storeSessionState(session);
  }
}

export async function clearSession() {
  sessionStore.set(null);
  dekStore.set(null);
  if (browser) {
    await clearSessionState();
  }
}
