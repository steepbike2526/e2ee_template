import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getSessionUser } from './lib/session';

export const createNote = mutation({
  args: {
    sessionToken: v.string(),
    ciphertext: v.string(),
    nonce: v.string(),
    aad: v.string(),
    version: v.number(),
    createdAt: v.number()
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    if (!user) {
      throw new Error('Unauthorized');
    }

    await ctx.db.insert('notes', {
      userId: user._id,
      ciphertext: args.ciphertext,
      nonce: args.nonce,
      aad: args.aad,
      version: args.version,
      createdAt: args.createdAt
    });

    return { success: true };
  }
});

export const listNotes = query({
  args: {
    sessionToken: v.string()
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.sessionToken);
    if (!user) {
      throw new Error('Unauthorized');
    }

    const notes = await ctx.db
      .query('notes')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .collect();

    return notes.map((note) => ({
      id: note._id,
      ciphertext: note.ciphertext,
      nonce: note.nonce,
      aad: note.aad,
      version: note.version,
      createdAt: note.createdAt
    }));
  }
});
