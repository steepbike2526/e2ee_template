import { base64ToBytes, bytesToBase64, toUtf8Bytes } from './encoding';

const toByteArray = (bytes: Uint8Array) => new Uint8Array(bytes);

export async function createPassphraseProof(verifierBase64: string, sessionToken: string): Promise<string> {
  const keyBytes = base64ToBytes(verifierBase64);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toByteArray(keyBytes),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, toByteArray(toUtf8Bytes(sessionToken)));
  return bytesToBase64(new Uint8Array(signature));
}
