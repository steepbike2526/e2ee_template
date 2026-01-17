const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function getAesKey() {
  const rawKey = process.env.TOTP_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('Missing TOTP_ENCRYPTION_KEY; set a 32-byte base64 value in Convex env.');
  }
  const keyBytes = base64ToBytes(rawKey);
  if (keyBytes.length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must decode to 32 bytes (AES-256-GCM).');
  }
  const keyBuffer = toArrayBuffer(keyBytes);
  return crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(secret: string) {
  const key = await getAesKey();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(secret);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext);
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    nonce: bytesToBase64(nonce)
  };
}

export async function decryptSecret(ciphertext: string, nonce: string) {
  const key = await getAesKey();
  const bytes = base64ToBytes(ciphertext);
  const iv = base64ToBytes(nonce);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, toArrayBuffer(bytes));
  return decoder.decode(plaintext);
}
