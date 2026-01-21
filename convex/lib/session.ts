import { Id } from '../_generated/dataModel';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_REFRESH_WINDOW_MS = 1000 * 60 * 60 * 24;

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

export function generateSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createSession(ctx: any, userId: Id<'users'>) {
  const token = generateSessionToken();
  const tokenHash = await hashToken(token);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await ctx.db.insert('sessions', { userId, tokenHash, expiresAt });
  return { token, expiresAt };
}

async function refreshSession(ctx: any, session: any) {
  const token = generateSessionToken();
  const tokenHash = await hashToken(token);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await ctx.db.patch(session._id, { tokenHash, expiresAt });
  return { token, expiresAt };
}

export async function getSessionUser(ctx: any, token: string) {
  const tokenHash = await hashToken(token);
  const session = await ctx.db
    .query('sessions')
    .withIndex('by_token_hash', (q: any) => q.eq('tokenHash', tokenHash))
    .unique();
  if (!session || session.expiresAt < Date.now()) {
    return null;
  }
  const user = await ctx.db.get(session.userId);
  if (!user) {
    return null;
  }
  const shouldRefresh = session.expiresAt - Date.now() < SESSION_REFRESH_WINDOW_MS;
  if (shouldRefresh) {
    const refreshed = await refreshSession(ctx, session);
    return { user, sessionToken: refreshed.token };
  }
  return { user, sessionToken: token };
}
