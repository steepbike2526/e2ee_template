import { Id } from '../_generated/dataModel';

type RateLimitConfig = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitRecord = {
  _id: Id<'rateLimits'>;
  key: string;
  count: number;
  resetAt: number;
};

export async function enforceRateLimit(ctx: any, config: RateLimitConfig) {
  const now = Date.now();
  const existing: RateLimitRecord | null = await ctx.db
    .query('rateLimits')
    .withIndex('by_key', (q: any) => q.eq('key', config.key))
    .unique();

  if (!existing || existing.resetAt <= now) {
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    await ctx.db.insert('rateLimits', {
      key: config.key,
      count: 1,
      resetAt: now + config.windowMs
    });
    return;
  }

  if (existing.count >= config.limit) {
    throw new Error('Too many attempts. Please try again later.');
  }

  await ctx.db.patch(existing._id, { count: existing.count + 1 });
}
