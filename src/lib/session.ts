import { sessionStore, dekStore } from './state';
import { storeSession, clearSessions } from './storage/session';

export async function setSession(session: {
  sessionToken: string;
  userId: string;
  username: string;
  e2eeSalt: string;
  deviceId: string;
}) {
  await storeSession(session);
  sessionStore.set(session);
}

export async function clearSession() {
  await clearSessions();
  sessionStore.set(null);
  dekStore.set(null);
}
