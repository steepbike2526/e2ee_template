import { base64ToBytes, bytesToBase64, fromUtf8Bytes, toUtf8Bytes } from './encoding';

type ByteArray = Uint8Array<ArrayBuffer>;

const toByteArray = (bytes: Uint8Array): ByteArray => new Uint8Array(bytes);

const NOTE_SCHEMA_VERSION = 1;

export type EncryptedNotePayload = {
  ciphertext: string;
  nonce: string;
  aad: string;
  version: number;
};

export async function encryptNote(
  dek: CryptoKey,
  plaintext: string,
  options: { userId: string; noteId: string }
): Promise<EncryptedNotePayload> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aadPayload = JSON.stringify({ userId: options.userId, noteId: options.noteId, v: 1 });
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: toByteArray(toUtf8Bytes(aadPayload)) },
    dek,
    toByteArray(toUtf8Bytes(plaintext))
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    nonce: bytesToBase64(nonce),
    aad: bytesToBase64(toByteArray(toUtf8Bytes(aadPayload))),
    version: NOTE_SCHEMA_VERSION
  };
}

export async function decryptNote(
  dek: CryptoKey,
  payload: EncryptedNotePayload
): Promise<string> {
  const aad = toByteArray(base64ToBytes(payload.aad));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toByteArray(base64ToBytes(payload.nonce)), additionalData: aad },
    dek,
    toByteArray(base64ToBytes(payload.ciphertext))
  );
  return fromUtf8Bytes(new Uint8Array(plaintext));
}
