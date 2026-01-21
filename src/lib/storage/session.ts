import { openNotesDb } from './db';
import { toUtf8Bytes } from '../crypto/encoding';
import { decryptWithKey, encryptWithKey } from '../crypto/keys';
import type { SessionState } from '../state';

const SESSION_KEY_ID = 'session-key';
const SESSION_RECORD_ID = 'session';
const SESSION_RECORD_VERSION = 1;

async function getSessionKey(): Promise<CryptoKey> {
  const db = await openNotesDb();
  const existing = await db.get('sessionKeys', SESSION_KEY_ID);
  if (existing?.key) {
    return existing.key;
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt'
  ]);
  await db.put('sessionKeys', { id: SESSION_KEY_ID, key });
  return key;
}

function toPayload(session: SessionState) {
  return JSON.stringify(session);
}

async function encryptPayload(payload: string) {
  const key = await getSessionKey();
  return encryptWithKey(key, toUtf8Bytes(payload));
}

async function decryptPayload(payload: { ciphertext: string; nonce: string }) {
  const key = await getSessionKey();
  const plaintext = await decryptWithKey(key, payload);
  return new TextDecoder().decode(plaintext);
}

export async function storeSessionState(session: SessionState) {
  const db = await openNotesDb();
  const encrypted = await encryptPayload(toPayload(session));
  await db.put('sessions', {
    id: SESSION_RECORD_ID,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    version: SESSION_RECORD_VERSION
  });
}

export async function readSessionState(): Promise<SessionState | null> {
  const db = await openNotesDb();
  const record = await db.get('sessions', SESSION_RECORD_ID);
  if (!record) return null;
  if (record.version !== SESSION_RECORD_VERSION) {
    await db.delete('sessions', SESSION_RECORD_ID);
    return null;
  }
  try {
    const decrypted = await decryptPayload(record);
    const parsed = JSON.parse(decrypted);
    return parsed as SessionState;
  } catch {
    await db.delete('sessions', SESSION_RECORD_ID);
    return null;
  }
}

export async function clearSessionState() {
  const db = await openNotesDb();
  await db.delete('sessions', SESSION_RECORD_ID);
}
