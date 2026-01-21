import { openNotesDb, type CachedNote, type PendingNote } from './db';

export async function cacheNotes(notes: CachedNote[]) {
  const db = await openNotesDb();
  const tx = db.transaction('cachedNotes', 'readwrite');
  const writes = notes.map((note) => tx.store.put(note));
  await Promise.all(writes);
  await tx.done;
}

export async function readCachedNotes(userId?: string): Promise<CachedNote[]> {
  const db = await openNotesDb();
  const notes = await db.getAll('cachedNotes');
  if (!userId) return notes;
  return notes.filter((note) => !note.userId || note.userId === userId);
}

export async function addPendingNote(note: PendingNote) {
  const db = await openNotesDb();
  await db.put('pendingNotes', note);
}

export async function readPendingNotes(userId?: string): Promise<PendingNote[]> {
  const db = await openNotesDb();
  const notes = await db.getAll('pendingNotes');
  if (!userId) return notes;
  return notes.filter((note) => !note.userId || note.userId === userId);
}

export async function removePendingNote(id: string) {
  const db = await openNotesDb();
  await db.delete('pendingNotes', id);
}
