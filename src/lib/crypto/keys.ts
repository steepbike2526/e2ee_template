import argon2 from './argon2';
import { base64ToBytes, bytesToBase64, toUtf8Bytes } from './encoding';

type ByteArray = Uint8Array<ArrayBuffer>;

const toByteArray = (bytes: Uint8Array): ByteArray => new Uint8Array(bytes);

const ARGON2_PARAMS = {
  time: 3,
  mem: 64 * 1024,
  parallelism: 1,
  hashLen: 32
};

export type DerivedMasterKey = {
  keyBytes: Uint8Array;
  salt: string;
  params: typeof ARGON2_PARAMS;
};

export async function deriveMasterKey(password: string, saltBase64: string): Promise<DerivedMasterKey> {
  const salt = base64ToBytes(saltBase64);
  const result = await argon2.hash({
    pass: password,
    salt,
    type: argon2.ArgonType.Argon2id,
    ...ARGON2_PARAMS
  });

  return {
    keyBytes: new Uint8Array(result.hash),
    salt: saltBase64,
    params: ARGON2_PARAMS
  };
}

export function generateRandomSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(salt);
}

export async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  const keyData = toByteArray(rawKey);
  return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt'
  ]);
}

export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt'
  ]);
}

export async function exportRawKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

export async function encryptWithKey(key: CryptoKey, plaintext: Uint8Array, aad?: Uint8Array) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad ? toByteArray(aad) : undefined },
    key,
    toByteArray(plaintext)
  );
  return {
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

export async function decryptWithKey(
  key: CryptoKey,
  payload: { nonce: string; ciphertext: string },
  aad?: Uint8Array
): Promise<Uint8Array> {
  const nonce = toByteArray(base64ToBytes(payload.nonce));
  const ciphertext = toByteArray(base64ToBytes(payload.ciphertext));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad ? toByteArray(aad) : undefined },
    key,
    ciphertext
  );
  return new Uint8Array(plaintext);
}

export function deriveDeviceKeyLabel(deviceId: string) {
  return toUtf8Bytes(`device-key:${deviceId}`);
}
