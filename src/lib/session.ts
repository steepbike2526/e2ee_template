import { sessionStore, dekStore } from './state';

export async function setSession(session: {
  sessionToken: string;
  userId: string;
  username: string;
  e2eeSalt: string;
  deviceId: string;
}) {
  sessionStore.set(session);
}

export async function clearSession() {
  sessionStore.set(null);
  dekStore.set(null);
}
