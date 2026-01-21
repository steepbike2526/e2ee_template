import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { getSessionUser } from './lib/session';

const authMethodType = v.union(v.literal('magic'), v.literal('totp'));

const getDefaultAuthMethod = (user: { totpSecretCiphertext?: string | null }) =>
  user.totpSecretCiphertext ? 'totp' : 'magic';

const isTotpEnabled = (user: { totpSecretCiphertext?: string | null }) => Boolean(user.totpSecretCiphertext);

export const getUserPreferences = mutation({
  args: {
    sessionToken: v.string()
  },
  handler: async (ctx, args) => {
    const session = await getSessionUser(ctx, args.sessionToken);
    if (!session) {
      throw new Error('Unauthorized');
    }

    const existing = await ctx.db
      .query('userPreferences')
      .withIndex('by_user', (q) => q.eq('userId', session.user._id))
      .unique();
    const totpEnabled = isTotpEnabled(session.user);
    if (existing) {
      return { authMethod: existing.authMethod, totpEnabled, sessionToken: session.sessionToken };
    }

    const authMethod = getDefaultAuthMethod(session.user);
    const now = Date.now();
    await ctx.db.insert('userPreferences', {
      userId: session.user._id,
      authMethod,
      createdAt: now,
      updatedAt: now
    });

    return { authMethod, totpEnabled, sessionToken: session.sessionToken };
  }
});

export const updateUserPreferences = mutation({
  args: {
    sessionToken: v.string(),
    authMethod: authMethodType
  },
  handler: async (ctx, args) => {
    const session = await getSessionUser(ctx, args.sessionToken);
    if (!session) {
      throw new Error('Unauthorized');
    }

    const existing = await ctx.db
      .query('userPreferences')
      .withIndex('by_user', (q) => q.eq('userId', session.user._id))
      .unique();

    if (args.authMethod === 'totp' && !isTotpEnabled(session.user)) {
      throw new Error('TOTP is not enabled for this account.');
    }

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        authMethod: args.authMethod,
        updatedAt: now
      });
    } else {
      await ctx.db.insert('userPreferences', {
        userId: session.user._id,
        authMethod: args.authMethod,
        createdAt: now,
        updatedAt: now
      });
    }

    return { authMethod: args.authMethod, totpEnabled: isTotpEnabled(session.user), sessionToken: session.sessionToken };
  }
});
