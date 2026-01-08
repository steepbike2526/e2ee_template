import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    username: v.string(),
    email: v.optional(v.string()),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    e2eeSalt: v.string(),
    createdAt: v.number()
  })
    .index('by_username', ['username'])
    .index('by_email', ['email']),
  sessions: defineTable({
    userId: v.id('users'),
    token: v.string(),
    expiresAt: v.number()
  }).index('by_token', ['token']),
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
