import { browser } from '$app/environment';
import { base64ToBytes, bytesToBase64 } from './crypto/encoding';
import { exportRawKey, importAesKey } from './crypto/keys';

export type DeviceSettings = {
  biometricsEnabled: boolean;
  biometricCredentialId?: string;
  allowUnsafeDekCache: boolean;
};

const SETTINGS_KEY = 'e2ee:device-settings';
const CACHED_DEK_KEY = 'e2ee:cached-dek';
const AUTH_METHOD_KEY = 'e2ee:auth-method';

const defaultSettings: DeviceSettings = {
  biometricsEnabled: false,
  biometricCredentialId: undefined,
  allowUnsafeDekCache: false
};

const readRecord = (key: string): Record<string, unknown> => {
  if (!browser) return {};
  const raw = localStorage.getItem(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore invalid storage
  }
  localStorage.removeItem(key);
  return {};
};

const writeRecord = (key: string, value: Record<string, unknown>) => {
  if (!browser) return;
  localStorage.setItem(key, JSON.stringify(value));
};

export const getDeviceSettings = (userId: string | null): DeviceSettings => {
  if (!browser || !userId) return { ...defaultSettings };
  const record = readRecord(SETTINGS_KEY);
  const stored = record[userId];
  if (!stored || typeof stored !== 'object') {
    return { ...defaultSettings };
  }
  const settings = stored as Partial<DeviceSettings>;
  return {
    ...defaultSettings,
    ...settings
  };
};

export const saveDeviceSettings = (userId: string, settings: DeviceSettings) => {
  if (!browser) return;
  const record = readRecord(SETTINGS_KEY);
  record[userId] = settings;
  writeRecord(SETTINGS_KEY, record);
};

export const updateDeviceSettings = (userId: string, updates: Partial<DeviceSettings>) => {
  const current = getDeviceSettings(userId);
  const next = { ...current, ...updates };
  saveDeviceSettings(userId, next);
  return next;
};

export const storeUnsafeDek = async (userId: string, deviceId: string, dek: CryptoKey) => {
  if (!browser) return;
  const record = readRecord(CACHED_DEK_KEY);
  const raw = await exportRawKey(dek);
  record[userId] = {
    deviceId,
    rawDek: bytesToBase64(raw)
  };
  writeRecord(CACHED_DEK_KEY, record);
};

export const clearUnsafeDek = (userId: string) => {
  if (!browser) return;
  const record = readRecord(CACHED_DEK_KEY);
  if (record[userId]) {
    delete record[userId];
    writeRecord(CACHED_DEK_KEY, record);
  }
};

export const loadUnsafeDek = async (userId: string, deviceId: string): Promise<CryptoKey | null> => {
  if (!browser) return null;
  const record = readRecord(CACHED_DEK_KEY);
  const payload = record[userId] as { deviceId?: string; rawDek?: string } | undefined;
  if (!payload?.rawDek || payload.deviceId !== deviceId) {
    return null;
  }
  const raw = base64ToBytes(payload.rawDek);
  return importAesKey(raw, true);
};

export const getAuthMethodPreference = () => {
  if (!browser) return 'magic';
  const stored = localStorage.getItem(AUTH_METHOD_KEY);
  if (stored === 'magic' || stored === 'totp') {
    return stored;
  }
  return 'magic';
};

export const setAuthMethodPreference = (method: 'magic' | 'totp') => {
  if (!browser) return;
  localStorage.setItem(AUTH_METHOD_KEY, method);
};
