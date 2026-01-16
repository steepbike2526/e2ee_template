const HASH_LENGTH_BYTES = 64;
const ITERATIONS = 100_000;

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

async function deriveKeyBits(password: string, salt: Uint8Array) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_LENGTH_BYTES * 8
  );
  return new Uint8Array(derivedBits);
}

export async function hashPassword(password: string, salt?: string) {
  const saltBytes = salt
    ? fromBase64(salt)
    : crypto.getRandomValues(new Uint8Array(16));
  const hashBytes = await deriveKeyBits(password, saltBytes);
  return {
    hash: toBase64(hashBytes),
    salt: salt ?? toBase64(saltBytes)
  };
}

export async function verifyPassword(password: string, hash: string, salt: string) {
  const derived = await deriveKeyBits(password, fromBase64(salt));
  const stored = fromBase64(hash);
  return timingSafeEqual(derived, stored);
}
