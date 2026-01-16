const crypto = globalThis.crypto;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function normalizeSecret(secret: string) {
  return secret.replace(/=+$/g, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
}

export function generateTotpSecret(length = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let secret = '';
  for (let i = 0; i < length; i += 1) {
    const char = BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length];
    if (char) {
      secret += char;
    }
  }
  return secret;
}

function base32ToBytes(secret: string) {
  const normalized = normalizeSecret(secret);
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      continue;
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

async function hmacSha1(key: Uint8Array, message: Uint8Array) {
  const keyData = new Uint8Array(key);
  const messageData = new Uint8Array(message);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return new Uint8Array(signature);
}

export async function generateTotpCode(secret: string, timestamp = Date.now(), stepSeconds = 30) {
  const counter = Math.floor(timestamp / 1000 / stepSeconds);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter);

  const key = base32ToBytes(secret);
  const hmac = await hmacSha1(key, new Uint8Array(buffer));
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  const code = (binary % 1_000_000).toString().padStart(6, '0');
  return code;
}

export async function verifyTotpCode(secret: string, code: string, window = 1) {
  const now = Date.now();
  const normalized = code.replace(/\s+/g, '');
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = await generateTotpCode(secret, now + offset * 30_000);
    if (candidate === normalized) {
      return true;
    }
  }
  return false;
}
