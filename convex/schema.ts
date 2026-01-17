import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    username: v.string(),
    email: v.optional(v.string()),
    e2eeSalt: v.string(),
    masterWrappedDek: v.optional(v.string()),
    masterWrapNonce: v.optional(v.string()),
    masterWrapVersion: v.optional(v.number()),
    totpSecretCiphertext: v.optional(v.string()),
    totpSecretNonce: v.optional(v.string()),
    createdAt: v.number()
  })
    .index('by_username', ['username'])
    .index('by_email', ['email']),
  magicLinks: defineTable({
    userId: v.id('users'),
    tokenHash: v.string(),
    expiresAt: v.number()
  })
    .index('by_user', ['userId'])
    .index('by_token_hash', ['tokenHash'])
    .index('by_user_token_hash', ['userId', 'tokenHash']),
  sessions: defineTable({
    userId: v.id('users'),
    token: v.string(),
    expiresAt: v.number()
  }).index('by_token', ['token']),
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number()
  }).index('by_key', ['key']),
  devices: defineTable({
    userId: v.id('users'),
    deviceId: v.string(),
    wrappedDek: v.string(),
    wrapNonce: v.string(),
    version: v.number(),
    createdAt: v.number()
  })
    .index('by_user', ['userId'])
    .index('by_user_device', ['userId', 'deviceId']),
  notes: defineTable({
    userId: v.id('users'),
    ciphertext: v.string(),
    nonce: v.string(),
    aad: v.string(),
    version: v.number(),
    createdAt: v.number()
  }).index('by_user', ['userId'])
});
