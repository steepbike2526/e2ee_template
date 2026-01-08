import { openNotesDb, type LocalSession } from './db';

export async function storeSession(session: LocalSession) {
  const db = await openNotesDb();
  await db.put('sessions', session);
}

export async function readSession(userId: string): Promise<LocalSession | undefined> {
  const db = await openNotesDb();
  return db.get('sessions', userId);
}

export async function readAnySession(): Promise<LocalSession | undefined> {
  const db = await openNotesDb();
  const sessions = await db.getAll('sessions');
  return sessions[0];
}

export async function clearSessions() {
  const db = await openNotesDb();
  const tx = db.transaction('sessions', 'readwrite');
  await tx.store.clear();
  await tx.done;
}
