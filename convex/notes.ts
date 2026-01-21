import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { getSessionUser } from './lib/session';

export const createNote = mutation({
  args: {
    sessionToken: v.string(),
    clientNoteId: v.string(),
    ciphertext: v.string(),
    nonce: v.string(),
    aad: v.string(),
    version: v.number(),
    createdAt: v.number()
  },
  handler: async (ctx, args) => {
    const session = await getSessionUser(ctx, args.sessionToken);
    if (!session) {
      throw new Error('Unauthorized');
    }

    const existing = await ctx.db
      .query('notes')
      .withIndex('by_user_client', (q) =>
        q.eq('userId', session.user._id).eq('clientNoteId', args.clientNoteId)
      )
      .first();
    if (existing) {
      return { success: true, sessionToken: session.sessionToken };
    }

    await ctx.db.insert('notes', {
      userId: session.user._id,
      clientNoteId: args.clientNoteId,
      ciphertext: args.ciphertext,
      nonce: args.nonce,
      aad: args.aad,
      version: args.version,
      createdAt: args.createdAt
    });

    return { success: true, sessionToken: session.sessionToken };
  }
});

export const listNotes = mutation({
  args: {
    sessionToken: v.string()
  },
  handler: async (ctx, args) => {
    const session = await getSessionUser(ctx, args.sessionToken);
    if (!session) {
      throw new Error('Unauthorized');
    }

    const notes = await ctx.db
      .query('notes')
      .withIndex('by_user', (q) => q.eq('userId', session.user._id))
      .collect();

    return {
      sessionToken: session.sessionToken,
      notes: notes.map((note) => ({
        id: note.clientNoteId ?? note._id,
        ciphertext: note.ciphertext,
        nonce: note.nonce,
        aad: note.aad,
        version: note.version,
        createdAt: note.createdAt
      }))
    };
  }
});
