import { nanoid } from 'nanoid';
import { decryptWithKey, deriveDeviceKeyLabel, encryptWithKey, exportRawKey, generateAesKey, importAesKey } from './crypto/keys';
import { storeDeviceRecord, readDeviceRecord } from './storage/device';

const DEVICE_KEY_VERSION = 1;

export type DeviceKeyBundle = {
  deviceId: string;
  encryptedDeviceKey: string;
  deviceKeyNonce: string;
  version: number;
  deviceKey: CryptoKey;
};

export async function createDeviceKeyBundle(masterKeyBytes: Uint8Array): Promise<DeviceKeyBundle> {
  const deviceId = nanoid();
  const deviceKey = await generateAesKey();
  const masterKey = await importAesKey(masterKeyBytes);
  const rawDeviceKey = await exportRawKey(deviceKey);
  const aad = deriveDeviceKeyLabel(deviceId);
  const encrypted = await encryptWithKey(masterKey, rawDeviceKey, aad);

  const bundle: DeviceKeyBundle = {
    deviceId,
    encryptedDeviceKey: encrypted.ciphertext,
    deviceKeyNonce: encrypted.nonce,
    version: DEVICE_KEY_VERSION,
    deviceKey
  };

  await storeDeviceRecord({
    deviceId,
    encryptedDeviceKey: bundle.encryptedDeviceKey,
    deviceKeyNonce: bundle.deviceKeyNonce
  });

  return bundle;
}

export async function loadDeviceKey(deviceId: string, masterKeyBytes: Uint8Array): Promise<CryptoKey> {
  const record = await readDeviceRecord(deviceId);
  if (!record) {
    throw new Error('Device key not found on this device.');
  }
  const masterKey = await importAesKey(masterKeyBytes);
  const aad = deriveDeviceKeyLabel(deviceId);
  const rawKey = await decryptWithKey(masterKey, { nonce: record.deviceKeyNonce, ciphertext: record.encryptedDeviceKey }, aad);
  return importAesKey(rawKey);
}

export async function wrapDekForDevice(dek: CryptoKey, deviceKey: CryptoKey) {
  const rawDek = await exportRawKey(dek);
  return encryptWithKey(deviceKey, rawDek);
}

export async function unwrapDekForDevice(payload: { ciphertext: string; nonce: string }, deviceKey: CryptoKey) {
  const rawDek = await decryptWithKey(deviceKey, payload);
  return importAesKey(rawDek);
}
