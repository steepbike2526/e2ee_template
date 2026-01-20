import { browser } from '$app/environment';

const randomChallenge = () => crypto.getRandomValues(new Uint8Array(32));

const base64UrlEncode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const base64UrlDecode = (value: string) => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const isBiometricAvailable = async () => {
  if (!browser || !window.PublicKeyCredential) return false;
  if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
};

export const registerBiometricCredential = async (userId: string) => {
  if (!browser || !window.PublicKeyCredential) {
    throw new Error('WebAuthn is not available in this browser.');
  }

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: 'E2EE Notes' },
      user: {
        id: new TextEncoder().encode(userId),
        name: userId,
        displayName: userId
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: {
        userVerification: 'required',
        authenticatorAttachment: 'platform'
      },
      timeout: 60_000,
      attestation: 'none'
    }
  });

  if (!credential || credential.type !== 'public-key') {
    throw new Error('Biometric setup was cancelled or failed.');
  }

  const publicKeyCredential = credential as PublicKeyCredential;
  return base64UrlEncode(new Uint8Array(publicKeyCredential.rawId));
};

export const promptBiometric = async (credentialId: string) => {
  if (!browser || !window.PublicKeyCredential) {
    throw new Error('WebAuthn is not available in this browser.');
  }

  const rawId = base64UrlDecode(credentialId);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [
        {
          id: rawId,
          type: 'public-key',
          transports: ['internal']
        }
      ],
      userVerification: 'required',
      timeout: 60_000
    }
  });

  if (!assertion) {
    throw new Error('Biometric verification failed.');
  }

  return true;
};
