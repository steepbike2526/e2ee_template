import { webcrypto } from 'crypto';

if (!globalThis.crypto) {
  // @ts-expect-error: Node global assignment for tests.
  globalThis.crypto = webcrypto;
}

if (!globalThis.atob) {
  globalThis.atob = (data: string) => Buffer.from(data, 'base64').toString('binary');
}

if (!globalThis.btoa) {
  globalThis.btoa = (data: string) => Buffer.from(data, 'binary').toString('base64');
}
