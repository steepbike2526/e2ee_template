import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { createSession, getSessionUser } from './lib/session';
import { generateTotpSecret, verifyTotpCode } from './lib/totp';
import { decryptSecret, encryptSecret } from './lib/secrets';
import { enforceRateLimit } from './lib/rateLimit';
import { base64ToBytes } from './lib/encoding';
import { verifyPassphraseProof } from './lib/passphrase';

async function hashToken(token: string) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

const MASTER_WRAP_VERSION = 1;
const PASS_VERIFIER_VERSION = 1;
const SALT_BYTES = 16;
const VERIFIER_BYTES = 32;

function assertBase64Length(value: string, expectedLength: number, label: string) {
  const bytes = base64ToBytes(value);
  if (bytes.length !== expectedLength) {
    throw new Error(`${label} must decode to ${expectedLength} bytes.`);
  }
}

function assertValidWrapVersion(version: number) {
  if (version !== MASTER_WRAP_VERSION) {
    throw new Error('Unsupported wrap version.');
  }
}

async function enforceMinDelay(startTime: number, minMs = 250) {
  const elapsed = Date.now() - startTime;
  if (elapsed < minMs) {
    await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
  }
}

export const registerUser = mutation({
  args: {
    username: v.string(),
    email: v.optional(v.string()),
    enableTotp: v.optional(v.boolean()),
    passphraseVerifier: v.string(),
    passphraseVerifierSalt: v.string(),
    passphraseVerifierVersion: v.number()
  },
  handler: async (ctx, args) => {
    const email = args.email?.trim().toLowerCase();
    if (!args.enableTotp && !email) {
      throw new Error('Email is required unless you enable TOTP.');
    }

    if (args.passphraseVerifierVersion !== PASS_VERIFIER_VERSION) {
      throw new Error('Unsupported passphrase verifier version.');
    }
    assertBase64Length(args.passphraseVerifierSalt, SALT_BYTES, 'Passphrase verifier salt');
    assertBase64Length(args.passphraseVerifier, VERIFIER_BYTES, 'Passphrase verifier');

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.username))
      .unique();
    if (existingUser) {
      throw new Error('Username already exists.');
    }

    if (email) {
      const existingEmail = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', email))
        .unique();
      if (existingEmail) {
        throw new Error('Email already exists.');
      }
    }

    const e2eeSaltBytes = crypto.getRandomValues(new Uint8Array(16));
    const e2eeSalt = btoa(String.fromCharCode(...e2eeSaltBytes));
    const totpSecret = args.enableTotp ? generateTotpSecret() : undefined;
    const totpPayload = totpSecret ? await encryptSecret(totpSecret) : null;
    const createdAt = Date.now();
    const userId = await ctx.db.insert('users', {
      username: args.username,
      email,
      e2eeSalt,
      passphraseVerifier: args.passphraseVerifier,
      passphraseVerifierSalt: args.passphraseVerifierSalt,
      passphraseVerifierVersion: args.passphraseVerifierVersion,
      totpSecretCiphertext: totpPayload?.ciphertext,
      totpSecretNonce: totpPayload?.nonce,
      createdAt
    });
    const authMethod = args.enableTotp ? 'totp' : 'magic';
    await ctx.db.insert('userPreferences', {
      userId,
      authMethod,
      createdAt,
      updatedAt: createdAt
    });

    const session = await createSession(ctx, userId);

    return {
      userId,
      username: args.username,
      e2eeSalt,
      passphraseVerifierSalt: args.passphraseVerifierSalt,
      passphraseVerifierVersion: args.passphraseVerifierVersion,
      sessionToken: session.token,
      totpSecret
    };
  }
});

export const requestMagicLink = mutation({
  args: {
    email: v.string()
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const normalizedEmail = args.email.trim().toLowerCase();
    await enforceRateLimit(ctx, {
      key: `magic-link:${normalizedEmail}`,
      limit: 3,
      windowMs: 1000 * 60 * 15
    });
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', normalizedEmail))
      .unique();

    const expiresAt = Date.now() + 1000 * 60 * 15;
    if (user) {
      const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
      const token = btoa(String.fromCharCode(...tokenBytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
      const tokenHash = await hashToken(token);
      await ctx.db.insert('magicLinks', {
        userId: user._id,
        tokenHash,
        expiresAt
      });
    }

    // TODO: deliver the token via email (or other out-of-band channel) in production.
    await enforceMinDelay(startTime);
    return {
      email: normalizedEmail,
      expiresAt
    };
  }
});

export const verifyMagicLink = mutation({
  args: {
    email: v.string(),
    token: v.string()
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const normalizedEmail = args.email.trim().toLowerCase();
    await enforceRateLimit(ctx, {
      key: `magic-verify:${normalizedEmail}`,
      limit: 5,
      windowMs: 1000 * 60 * 15
    });
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', normalizedEmail))
      .unique();

    if (user) {
      const tokenHash = await hashToken(args.token);
      const link = await ctx.db
        .query('magicLinks')
        .withIndex('by_user_token_hash', (q) => q.eq('userId', user._id).eq('tokenHash', tokenHash))
        .unique();
      if (link && link.expiresAt >= Date.now()) {
        await ctx.db.delete(link._id);
        const session = await createSession(ctx, user._id);
        return {
          userId: user._id,
          username: user.username,
          e2eeSalt: user.e2eeSalt,
          passphraseVerifierSalt: user.passphraseVerifierSalt,
          passphraseVerifierVersion: user.passphraseVerifierVersion,
          sessionToken: session.token
        };
      }
    }
    await enforceMinDelay(startTime);
    throw new Error('Magic link is invalid or expired.');
  }
});

export const loginWithTotp = mutation({
  args: {
    username: v.string(),
    code: v.string()
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    await enforceRateLimit(ctx, {
      key: `totp:${args.username.trim().toLowerCase()}`,
      limit: 5,
      windowMs: 1000 * 60 * 15
    });
    const user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.username))
      .unique();

    if (user && user.totpSecretCiphertext && user.totpSecretNonce) {
      const totpSecret = await decryptSecret(user.totpSecretCiphertext, user.totpSecretNonce);
      const isValid = await verifyTotpCode(totpSecret, args.code);
      if (isValid) {
        const session = await createSession(ctx, user._id);
        return {
          userId: user._id,
          username: user.username,
          e2eeSalt: user.e2eeSalt,
          passphraseVerifierSalt: user.passphraseVerifierSalt,
          passphraseVerifierVersion: user.passphraseVerifierVersion,
          sessionToken: session.token
        };
      }
    }
    await enforceMinDelay(startTime);
    throw new Error('Invalid authentication code.');
  }
});

export const storeMasterWrappedDek = mutation({
  args: {
    sessionToken: v.string(),
    wrappedDek: v.string(),
    wrapNonce: v.string(),
    version: v.number(),
    passphraseProof: v.string()
  },
  handler: async (ctx, args) => {
    const session = await getSessionUser(ctx, args.sessionToken);
    if (!session) {
      throw new Error('Unauthorized');
    }

    assertValidWrapVersion(args.version);
    const proofOk = await verifyPassphraseProof(
      session.user.passphraseVerifier,
      args.sessionToken,
      args.passphraseProof
    );
    if (!proofOk) {
      throw new Error('Unauthorized');
    }

    await ctx.db.patch(session.user._id, {
      masterWrappedDek: args.wrappedDek,
      masterWrapNonce: args.wrapNonce,
      masterWrapVersion: args.version
    });

    return { ok: true, sessionToken: session.sessionToken };
  }
});

export const getMasterWrappedDek = mutation({
  args: {
    sessionToken: v.string()
  },
  handler: async (ctx, args) => {
    const session = await getSessionUser(ctx, args.sessionToken);
    if (!session) {
      throw new Error('Unauthorized');
    }

    const user = session.user;
    if (!user?.masterWrappedDek || !user.masterWrapNonce || !user.masterWrapVersion) {
      throw new Error('Master-wrapped DEK is not available.');
    }

    return {
      wrappedDek: user.masterWrappedDek,
      wrapNonce: user.masterWrapNonce,
      version: user.masterWrapVersion,
      sessionToken: session.sessionToken
    };
  }
});

export const updatePassphrase = mutation({
  args: {
    sessionToken: v.string(),
    e2eeSalt: v.string(),
    wrappedDek: v.string(),
    wrapNonce: v.string(),
    version: v.number(),
    passphraseProof: v.string(),
    nextPassphraseVerifier: v.string(),
    nextPassphraseVerifierSalt: v.string(),
    nextPassphraseVerifierVersion: v.number()
  },
  handler: async (ctx, args) => {
    const session = await getSessionUser(ctx, args.sessionToken);
    if (!session) {
      throw new Error('Unauthorized');
    }

    assertBase64Length(args.e2eeSalt, SALT_BYTES, 'E2EE salt');
    assertValidWrapVersion(args.version);
    if (args.nextPassphraseVerifierVersion !== PASS_VERIFIER_VERSION) {
      throw new Error('Unsupported passphrase verifier version.');
    }
    assertBase64Length(args.nextPassphraseVerifierSalt, SALT_BYTES, 'Passphrase verifier salt');
    assertBase64Length(args.nextPassphraseVerifier, VERIFIER_BYTES, 'Passphrase verifier');
    const proofOk = await verifyPassphraseProof(
      session.user.passphraseVerifier,
      args.sessionToken,
      args.passphraseProof
    );
    if (!proofOk) {
      throw new Error('Unauthorized');
    }

    await ctx.db.patch(session.user._id, {
      e2eeSalt: args.e2eeSalt,
      masterWrappedDek: args.wrappedDek,
      masterWrapNonce: args.wrapNonce,
      masterWrapVersion: args.version,
      passphraseVerifier: args.nextPassphraseVerifier,
      passphraseVerifierSalt: args.nextPassphraseVerifierSalt,
      passphraseVerifierVersion: args.nextPassphraseVerifierVersion
    });

    return { ok: true, sessionToken: session.sessionToken };
  }
});

export const revokeSession = mutation({
  args: {
    sessionToken: v.string()
  },
  handler: async (ctx, args) => {
    const tokenHash = await hashToken(args.sessionToken);
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token_hash', (q) => q.eq('tokenHash', tokenHash))
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
    return { ok: true };
  }
});
