import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { createSession } from './lib/session';
import { generateTotpSecret, verifyTotpCode } from './lib/totp';

export const registerUser = mutation({
  args: {
    username: v.string(),
    email: v.string(),
    enableTotp: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.username))
      .unique();
    if (existingUser) {
      throw new Error('Username already exists.');
    }

    const existingEmail = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique();
    if (existingEmail) {
      throw new Error('Email already exists.');
    }

    const e2eeSaltBytes = crypto.getRandomValues(new Uint8Array(16));
    const e2eeSalt = btoa(String.fromCharCode(...e2eeSaltBytes));
    const totpSecret = args.enableTotp ? generateTotpSecret() : undefined;
    const userId = await ctx.db.insert('users', {
      username: args.username,
      email: args.email,
      e2eeSalt,
      totpSecret,
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
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique();

    if (!user) {
      throw new Error('No account found for that email.');
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...tokenBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const expiresAt = Date.now() + 1000 * 60 * 15;

    await ctx.db.insert('magicLinks', {
      userId: user._id,
      token,
      expiresAt
    });

    return {
      email: user.email,
      token,
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
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique();

    if (!user) {
      throw new Error('No account found for that email.');
    }

    const link = await ctx.db
      .query('magicLinks')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .filter((q) => q.eq(q.field('token'), args.token))
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
    email: v.string(),
    code: v.string()
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .unique();

    if (!user || !user.totpSecret) {
      throw new Error('TOTP is not enabled for this account.');
    }

    const isValid = await verifyTotpCode(user.totpSecret, args.code);
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
