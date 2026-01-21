import { writable } from 'svelte/store';

export type SessionState = {
  sessionToken: string;
  userId: string;
  username: string;
  e2eeSalt: string;
  passphraseVerifierSalt: string;
  passphraseVerifierVersion: number;
  deviceId: string;
};

export const sessionStore = writable<SessionState | null>(null);
export const dekStore = writable<CryptoKey | null>(null);
export const syncStatusStore = writable<'idle' | 'syncing' | 'offline'>('idle');
export const onlineStore = writable<boolean>(true);
