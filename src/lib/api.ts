import { convexClient } from './convexClient';

export async function registerUser(payload: {
  username: string;
  email?: string;
  password: string;
}) {
  return convexClient.mutation('auth.registerUser', payload);
}

export async function loginUser(payload: { username: string; password: string; deviceId: string }) {
  return convexClient.mutation('auth.loginUser', payload);
}

export async function registerDevice(payload: {
  sessionToken: string;
  deviceId: string;
  wrappedDek: string;
  wrapNonce: string;
  version: number;
}) {
  return convexClient.mutation('devices.registerDevice', payload);
}

export async function fetchDeviceDek(payload: { sessionToken: string; deviceId: string }) {
  return convexClient.query('devices.getWrappedDek', payload);
}

export async function createNote(payload: {
  sessionToken: string;
  ciphertext: string;
  nonce: string;
  aad: string;
  version: number;
  createdAt: number;
}) {
  return convexClient.mutation('notes.createNote', payload);
}

export async function listNotes(payload: { sessionToken: string }) {
  return convexClient.query('notes.listNotes', payload);
}
