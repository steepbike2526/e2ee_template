import { base64ToBytes, toUtf8Bytes } from './encoding';

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function hmacSha256(keyBytes: Uint8Array, message: Uint8Array) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(signature);
}

export async function verifyPassphraseProof(
  verifierBase64: string,
  sessionToken: string,
  proofBase64: string
) {
  const keyBytes = base64ToBytes(verifierBase64);
  const message = toUtf8Bytes(sessionToken);
  const expected = await hmacSha256(keyBytes, message);
  const provided = base64ToBytes(proofBase64);
  return constantTimeEqual(expected, provided);
}
