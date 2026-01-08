import { mutation } from 'convex/server';
import { v } from 'convex/values';
import crypto from 'crypto';
import { hashPassword, verifyPassword } from './lib/password';
import { createSession } from './lib/session';

export const registerUser = mutation({
  args: {
    username: v.string(),
    email: v.optional(v.string()),
    password: v.string()
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.username))
      .unique();
    if (existingUser) {
      throw new Error('Username already exists.');
    }

    if (args.email) {
      const existingEmail = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', args.email))
        .unique();
      if (existingEmail) {
        throw new Error('Email already exists.');
      }
    }

    const { hash, salt } = hashPassword(args.password);
    const e2eeSalt = crypto.randomBytes(16).toString('base64');
    const userId = await ctx.db.insert('users', {
      username: args.username,
      email: args.email,
      passwordHash: hash,
      passwordSalt: salt,
      e2eeSalt,
      createdAt: Date.now()
    });

    const session = await createSession(ctx, userId);

    return {
      userId,
      username: args.username,
      e2eeSalt,
      sessionToken: session.token
    };
  }
});

export const loginUser = mutation({
  args: {
    username: v.string(),
    password: v.string(),
    deviceId: v.string()
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_username', (q) => q.eq('username', args.username))
      .unique();

    if (!user) {
      throw new Error('Invalid username or password.');
    }

    const isValid = verifyPassword(args.password, user.passwordHash, user.passwordSalt);
    if (!isValid) {
      throw new Error('Invalid username or password.');
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
