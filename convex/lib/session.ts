import crypto from 'crypto';
import { Id } from '../_generated/dataModel';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createSession(ctx: any, userId: Id<'users'>) {
  const token = generateSessionToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await ctx.db.insert('sessions', { userId, token, expiresAt });
  return { token, expiresAt };
}

export async function getSessionUser(ctx: any, token: string) {
  const session = await ctx.db
    .query('sessions')
    .withIndex('by_token', (q: any) => q.eq('token', token))
    .unique();
  if (!session || session.expiresAt < Date.now()) {
    return null;
  }
  const user = await ctx.db.get(session.userId);
  return user;
}
