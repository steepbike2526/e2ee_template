import crypto from 'crypto';

const HASH_LENGTH = 64;

export function hashPassword(password: string, salt?: string) {
  const resolvedSalt = salt ?? crypto.randomBytes(16).toString('base64');
  const hash = crypto.scryptSync(password, resolvedSalt, HASH_LENGTH).toString('base64');
  return { hash, salt: resolvedSalt };
}

export function verifyPassword(password: string, hash: string, salt: string) {
  const derived = crypto.scryptSync(password, salt, HASH_LENGTH);
  const stored = Buffer.from(hash, 'base64');
  return crypto.timingSafeEqual(derived, stored);
}
