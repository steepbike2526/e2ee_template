import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { getSessionUser } from './lib/session';

const DEVICE_WRAP_VERSION = 1;

function assertValidWrapVersion(version: number) {
  if (version !== DEVICE_WRAP_VERSION) {
    throw new Error('Unsupported device wrap version.');
  }
}

export const registerDevice = mutation({
  args: {
    sessionToken: v.string(),
    deviceId: v.string(),
    wrappedDek: v.string(),
    wrapNonce: v.string(),
    version: v.number()
  },
  handler: async (ctx, args) => {
    const session = await getSessionUser(ctx, args.sessionToken);
    if (!session) {
      throw new Error('Unauthorized');
    }

    assertValidWrapVersion(args.version);

    const existing = await ctx.db
      .query('devices')
      .withIndex('by_user_device', (q) => q.eq('userId', session.user._id).eq('deviceId', args.deviceId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        wrappedDek: args.wrappedDek,
        wrapNonce: args.wrapNonce,
        version: args.version
      });
      return { deviceId: args.deviceId, sessionToken: session.sessionToken };
    }

    await ctx.db.insert('devices', {
      userId: session.user._id,
      deviceId: args.deviceId,
      wrappedDek: args.wrappedDek,
      wrapNonce: args.wrapNonce,
      version: args.version,
      createdAt: Date.now()
    });

    return { deviceId: args.deviceId, sessionToken: session.sessionToken };
  }
});

export const getWrappedDek = mutation({
  args: {
    sessionToken: v.string(),
    deviceId: v.string()
  },
  handler: async (ctx, args) => {
    const session = await getSessionUser(ctx, args.sessionToken);
    if (!session) {
      throw new Error('Unauthorized');
    }

    const device = await ctx.db
      .query('devices')
      .withIndex('by_user_device', (q) => q.eq('userId', session.user._id).eq('deviceId', args.deviceId))
      .unique();

    if (!device) {
      throw new Error('Device not registered.');
    }

    return {
      wrappedDek: device.wrappedDek,
      wrapNonce: device.wrapNonce,
      version: device.version,
      sessionToken: session.sessionToken
    };
  }
});
