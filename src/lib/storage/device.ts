import { openNotesDb, type DeviceRecord } from './db';

export async function storeDeviceRecord(record: DeviceRecord) {
  const db = await openNotesDb();
  await db.put('deviceRecords', record);
}

export async function readDeviceRecord(deviceId: string): Promise<DeviceRecord | undefined> {
  const db = await openNotesDb();
  return db.get('deviceRecords', deviceId);
}

export async function readAnyDeviceRecord(): Promise<DeviceRecord | undefined> {
  const db = await openNotesDb();
  const cursor = await db.transaction('deviceRecords').store.openCursor();
  return cursor?.value;
}
