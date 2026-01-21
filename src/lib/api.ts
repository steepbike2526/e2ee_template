import { api } from '../../convex/_generated/api';
import { getConvexClient } from './convexClient';
import { updateSessionToken } from './session';

const refreshSessionToken = (response: { sessionToken?: string }) => {
  if (response?.sessionToken) {
    void updateSessionToken(response.sessionToken);
  }
};

export async function registerUser(payload: {
  username: string;
  email?: string;
  enableTotp?: boolean;
  passphraseVerifier: string;
  passphraseVerifierSalt: string;
  passphraseVerifierVersion: number;
}) {
  return getConvexClient().mutation(api.auth.registerUser, payload);
}

export async function requestMagicLink(payload: { email: string }) {
  return getConvexClient().mutation(api.auth.requestMagicLink, payload);
}

export async function verifyMagicLink(payload: { email: string; token: string }) {
  return getConvexClient().mutation(api.auth.verifyMagicLink, payload);
}

export async function loginWithTotp(payload: { username: string; code: string }) {
  return getConvexClient().mutation(api.auth.loginWithTotp, payload);
}

export async function revokeSession(payload: { sessionToken: string }) {
  return getConvexClient().mutation(api.auth.revokeSession, payload);
}

export async function registerDevice(payload: {
  sessionToken: string;
  deviceId: string;
  wrappedDek: string;
  wrapNonce: string;
  version: number;
}) {
  const response = await getConvexClient().mutation(api.devices.registerDevice, payload);
  refreshSessionToken(response);
  return response;
}

export async function storeMasterWrappedDek(payload: {
  sessionToken: string;
  wrappedDek: string;
  wrapNonce: string;
  version: number;
  passphraseProof: string;
}) {
  const response = await getConvexClient().mutation(api.auth.storeMasterWrappedDek, payload);
  refreshSessionToken(response);
  return response;
}

export async function fetchMasterWrappedDek(payload: { sessionToken: string }) {
  const response = await getConvexClient().mutation(api.auth.getMasterWrappedDek, payload);
  refreshSessionToken(response);
  return response;
}

export async function updatePassphrase(payload: {
  sessionToken: string;
  e2eeSalt: string;
  wrappedDek: string;
  wrapNonce: string;
  version: number;
  passphraseProof: string;
  nextPassphraseVerifier: string;
  nextPassphraseVerifierSalt: string;
  nextPassphraseVerifierVersion: number;
}) {
  const response = await getConvexClient().mutation(api.auth.updatePassphrase, payload);
  refreshSessionToken(response);
  return response;
}

export async function getUserPreferences(payload: { sessionToken: string }) {
  const response = await getConvexClient().mutation(api.userPreferences.getUserPreferences, payload);
  refreshSessionToken(response);
  return response;
}

export async function updateUserPreferences(payload: { sessionToken: string; authMethod: 'magic' | 'totp' }) {
  const response = await getConvexClient().mutation(api.userPreferences.updateUserPreferences, payload);
  refreshSessionToken(response);
  return response;
}

export async function fetchDeviceDek(payload: { sessionToken: string; deviceId: string }) {
  const response = await getConvexClient().mutation(api.devices.getWrappedDek, payload);
  refreshSessionToken(response);
  return response;
}

export async function createNote(payload: {
  sessionToken: string;
  clientNoteId: string;
  ciphertext: string;
  nonce: string;
  aad: string;
  version: number;
  createdAt: number;
}) {
  const response = await getConvexClient().mutation(api.notes.createNote, payload);
  refreshSessionToken(response);
  return response;
}

export async function listNotes(payload: { sessionToken: string }) {
  const response = await getConvexClient().mutation(api.notes.listNotes, payload);
  refreshSessionToken(response);
  return response;
}
