import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { createSession, getSessionUser } from './lib/session';
import { generateTotpSecret, verifyTotpCode } from './lib/totp';
import { decryptSecret, encryptSecret } from './lib/secrets';
import { enforceRateLimit } from './lib/rateLimit';

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

export const registerUser = mutation({
  args: {
    username: v.string(),
    email: v.optional(v.string()),
    enableTotp: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const email = args.email?.trim().toLowerCase();
    if (!args.enableTotp && !email) {
      throw new Error('Email is required unless you enable TOTP.');
    }

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
    const userId = await ctx.db.insert('users', {
      username: args.username,
      email,
      e2eeSalt,
      totpSecretCiphertext: totpPayload?.ciphertext,
      totpSecretNonce: totpPayload?.nonce,
      createdAt: Date.now()
    });

    const session = await createSession(ctx, userId);

    return {
      userId,
      username: args.username,
      e2eeSalt,
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

    if (!user) {
      throw new Error('No account found for that email.');
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...tokenBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const tokenHash = await hashToken(token);
    const expiresAt = Date.now() + 1000 * 60 * 15;

    await ctx.db.insert('magicLinks', {
      userId: user._id,
      tokenHash,
      expiresAt
    });

    // TODO: deliver the token via email (or other out-of-band channel) in production.
    return {
      email: user.email,
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

    if (!user) {
      throw new Error('No account found for that email.');
    }

    const tokenHash = await hashToken(args.token);
    const link = await ctx.db
      .query('magicLinks')
      .withIndex('by_user_token_hash', (q) => q.eq('userId', user._id).eq('tokenHash', tokenHash))
      .unique();

    if (!link || link.expiresAt < Date.now()) {
      throw new Error('Magic link is invalid or expired.');
    }

    await ctx.db.delete(link._id);
    const session = await createSession(ctx, user._id);

    return {
      userId: user._id,
      username: user.username,
      e2eeSalt: user.e2eeSalt,
      sessionToken: session.token
    };
  }
});

export const loginWithTotp = mutation({
  args: {
    username: v.string(),
    code: v.string()
  },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, {
      key: `totp:${args.username.trim().toLowerCase()}`,
      limit: 5,
      windowMs: 1000 * 60 * 15
    });
    const user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.username))
      .unique();

    if (!user || !user.totpSecretCiphertext || !user.totpSecretNonce) {
      throw new Error('TOTP is not enabled for this account.');
    }

    const totpSecret = await decryptSecret(user.totpSecretCiphertext, user.totpSecretNonce);
    const isValid = await verifyTotpCode(totpSecret, args.code);
    if (!isValid) {
      throw new Error('Invalid authentication code.');
    }

    const session = await createSession(ctx, user._id);
    return {
      userId: user._id,
      username: user.username,
      e2eeSalt: user.e2eeSalt,
      sessionToken: session.token
    };
  }
});

export const storeMasterWrappedDek = mutation({
  args: {
    sessionToken: v.string(),
    wrappedDek: v.string(),
    wrapNonce: v.string(),
    version: v.number()
  },
  handler: async (ctx, args) => {
    const session = await getSessionUser(ctx, args.sessionToken);
    if (!session) {
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

export const revokeSession = mutation({
  args: {
    sessionToken: v.string()
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_token', (q) => q.eq('token', args.sessionToken))
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
    return { ok: true };
  }
});
