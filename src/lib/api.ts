import { api } from '../../convex/_generated/api';
import { getConvexClient } from './convexClient';

export async function registerUser(payload: {
  username: string;
  email?: string;
  password: string;
}) {
  return getConvexClient().mutation(api.auth.registerUser, payload);
}

export async function loginUser(payload: { username: string; password: string; deviceId: string }) {
  return getConvexClient().mutation(api.auth.loginUser, payload);
}

export async function registerDevice(payload: {
  sessionToken: string;
  deviceId: string;
  wrappedDek: string;
  wrapNonce: string;
  version: number;
}) {
  return getConvexClient().mutation(api.devices.registerDevice, payload);
}

export async function fetchDeviceDek(payload: { sessionToken: string; deviceId: string }) {
  return getConvexClient().query(api.devices.getWrappedDek, payload);
}

export async function createNote(payload: {
  sessionToken: string;
  ciphertext: string;
  nonce: string;
  aad: string;
  version: number;
  createdAt: number;
}) {
  return getConvexClient().mutation(api.notes.createNote, payload);
}

export async function listNotes(payload: { sessionToken: string }) {
  return getConvexClient().query(api.notes.listNotes, payload);
}
