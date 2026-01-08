import { mutation, query } from 'convex/server';
import { v } from 'convex/values';
import { getSessionUser } from './lib/session';

export const registerDevice = mutation({
  args: {
    sessionToken: v.string(),
    deviceId: v.string(),
    wrappedDek: v.string(),
    wrapNonce: v.string(),
    version: v.number()
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    if (!user) {
      throw new Error('Unauthorized');
    }

    const existing = await ctx.db
      .query('devices')
      .withIndex('by_user_device', (q) => q.eq('userId', user._id).eq('deviceId', args.deviceId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        wrappedDek: args.wrappedDek,
        wrapNonce: args.wrapNonce,
        version: args.version
      });
      return { deviceId: args.deviceId };
    }

    await ctx.db.insert('devices', {
      userId: user._id,
      deviceId: args.deviceId,
      wrappedDek: args.wrappedDek,
      wrapNonce: args.wrapNonce,
      version: args.version,
      createdAt: Date.now()
    });

    return { deviceId: args.deviceId };
  }
});

export const getWrappedDek = query({
  args: {
    sessionToken: v.string(),
    deviceId: v.string()
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    if (!user) {
      throw new Error('Unauthorized');
    }

    const device = await ctx.db
      .query('devices')
      .withIndex('by_user_device', (q) => q.eq('userId', user._id).eq('deviceId', args.deviceId))
      .unique();

    if (!device) {
      throw new Error('Device not registered.');
    }

    return {
      wrappedDek: device.wrappedDek,
      wrapNonce: device.wrapNonce,
      version: device.version
    };
  }
});
