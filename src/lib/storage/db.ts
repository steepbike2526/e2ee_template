import { openDB, type IDBPDatabase } from 'idb';

export type PendingNote = {
  id: string;
  userId: string;
  ciphertext: string;
  nonce: string;
  aad: string;
  createdAt: number;
  version: number;
};

export type CachedNote = PendingNote;

export type DeviceRecord = {
  deviceId: string;
  encryptedDeviceKey: string;
  deviceKeyNonce: string;
};

export type SessionKeyRecord = {
  id: string;
  key: CryptoKey;
};

export type SessionRecord = {
  id: string;
  ciphertext: string;
  nonce: string;
  version: number;
};

export type NotesDb = IDBPDatabase<{
  pendingNotes: PendingNote;
  cachedNotes: CachedNote;
  deviceRecords: DeviceRecord;
  sessionKeys: SessionKeyRecord;
  sessions: SessionRecord;
}>;

export async function openNotesDb(): Promise<NotesDb> {
  return openDB('e2ee-notes', 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pendingNotes')) {
        db.createObjectStore('pendingNotes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cachedNotes')) {
        db.createObjectStore('cachedNotes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('deviceRecords')) {
        db.createObjectStore('deviceRecords', { keyPath: 'deviceId' });
      }
      if (!db.objectStoreNames.contains('sessionKeys')) {
        db.createObjectStore('sessionKeys', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
    }
  });
}
