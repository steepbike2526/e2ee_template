import { openNotesDb, type CachedNote, type PendingNote } from './db';

export async function cacheNotes(notes: CachedNote[]) {
  const db = await openNotesDb();
  const tx = db.transaction('cachedNotes', 'readwrite');
  for (const note of notes) {
    await tx.store.put(note);
  }
  await tx.done;
}

export async function readCachedNotes(): Promise<CachedNote[]> {
  const db = await openNotesDb();
  return db.getAll('cachedNotes');
}

export async function addPendingNote(note: PendingNote) {
  const db = await openNotesDb();
  await db.put('pendingNotes', note);
}

export async function readPendingNotes(): Promise<PendingNote[]> {
  const db = await openNotesDb();
  return db.getAll('pendingNotes');
}

export async function removePendingNote(id: string) {
  const db = await openNotesDb();
  await db.delete('pendingNotes', id);
}
