import argon2WasmUrl from 'argon2-browser/dist/argon2.wasm?url';

const globalScope = typeof self !== 'undefined' ? self : globalThis;

export const ArgonType = {
  Argon2d: 0,
  Argon2i: 1,
  Argon2id: 2
} as const;

type ArgonTypeValue = (typeof ArgonType)[keyof typeof ArgonType];

type Argon2Module = {
  allocate: (arr: ArrayLike<number>, type: string, allocator: number) => number;
  ALLOC_NORMAL: number;
  HEAP8: Int8Array;
  UTF8ToString: (ptr: number) => string;
  _argon2_encodedlen: (
    tCost: number,
    mCost: number,
    parallelism: number,
    saltLen: number,
    hashLen: number,
    argon2Type: ArgonTypeValue
  ) => number;
  _argon2_error_message: (code: number) => number;
  _argon2_hash_ext: (
    tCost: number,
    mCost: number,
    parallelism: number,
    pwd: number,
    pwdLen: number,
    salt: number,
    saltLen: number,
    hash: number,
    hashLen: number,
    encoded: number,
    encodedLen: number,
    argon2Type: ArgonTypeValue,
    secret: number,
    secretLen: number,
    ad: number,
    adLen: number,
    version: number
  ) => number;
  _free: (ptr: number) => void;
  postRun?: () => void;
};

type Argon2HashParams = {
  pass: string | Uint8Array;
  salt: string | Uint8Array;
  time?: number;
  mem?: number;
  hashLen?: number;
  parallelism?: number;
  type?: ArgonTypeValue;
  secret?: Uint8Array;
  ad?: Uint8Array;
};

type Argon2HashResult = {
  hash: Uint8Array;
  hashHex: string;
  encoded: string;
};

type Argon2Error = {
  message: string;
  code: number;
};

let modulePromise: Promise<Argon2Module> | null = null;
let moduleCache: Argon2Module | null = null;

function loadModule(mem?: number) {
  if (modulePromise) {
    return modulePromise;
  }
  if (moduleCache) {
    return Promise.resolve(moduleCache);
  }

  modulePromise = loadWasmBinary().then((wasmBinary) => {
    const wasmMemory = mem ? createWasmMemory(mem) : undefined;
    return initWasm(wasmBinary, wasmMemory);
  });

  return modulePromise.then((Module) => {
    moduleCache = Module;
    modulePromise = null;
    return Module;
  });
}

async function loadWasmModule(): Promise<Argon2Module> {
  const module = await import('argon2-browser/dist/argon2.js');
  return (module as { default?: Argon2Module }).default ?? (module as Argon2Module);
}

function initWasm(wasmBinary: Uint8Array, wasmMemory?: WebAssembly.Memory): Promise<Argon2Module> {
  return new Promise((resolve) => {
    (globalScope as typeof globalScope & { Module?: Record<string, unknown> }).Module = {
      wasmBinary,
      wasmMemory,
      postRun() {
        resolve(
          (globalScope as typeof globalScope & { Module?: Argon2Module }).Module as Argon2Module
        );
      }
    };
    void loadWasmModule();
  });
}

function loadWasmBinary(): Promise<Uint8Array> {
  if (
    (globalScope as typeof globalScope & { loadArgon2WasmBinary?: () => Promise<Uint8Array> })
      .loadArgon2WasmBinary
  ) {
    return (
      globalScope as typeof globalScope & { loadArgon2WasmBinary: () => Promise<Uint8Array> }
    ).loadArgon2WasmBinary();
  }
  return fetch(argon2WasmUrl)
    .then((response) => response.arrayBuffer())
    .then((buffer) => new Uint8Array(buffer));
}

function createWasmMemory(mem: number) {
  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;
  const WASM_PAGE_SIZE = 64 * KB;

  const totalMemory = (2 * GB - 64 * KB) / WASM_PAGE_SIZE;
  const initialMemory = Math.min(
    Math.max(Math.ceil((mem * KB) / WASM_PAGE_SIZE), 256) + 256,
    totalMemory
  );

  return new WebAssembly.Memory({
    initial: initialMemory,
    maximum: totalMemory
  });
}

function allocateArray(Module: Argon2Module, arr: ArrayLike<number>) {
  return Module.allocate(arr, 'i8', Module.ALLOC_NORMAL);
}

function allocateArrayStr(Module: Argon2Module, arr: Uint8Array) {
  const nullTerminatedArray = new Uint8Array([...arr, 0]);
  return allocateArray(Module, nullTerminatedArray);
}

function encodeUtf8(value: string | Uint8Array) {
  if (typeof value !== 'string') {
    return value;
  }
  if (typeof TextEncoder === 'function') {
    return new TextEncoder().encode(value);
  }
  throw new Error("Don't know how to encode UTF8");
}

export async function hash(params: Argon2HashParams): Promise<Argon2HashResult> {
  const mCost = params.mem || 1024;
  const Module = await loadModule(mCost);
  const tCost = params.time || 1;
  const parallelism = params.parallelism || 1;
  const pwdEncoded = encodeUtf8(params.pass);
  const pwd = allocateArrayStr(Module, pwdEncoded);
  const pwdlen = pwdEncoded.length;
  const saltEncoded = encodeUtf8(params.salt);
  const salt = allocateArrayStr(Module, saltEncoded);
  const saltlen = saltEncoded.length;
  const argon2Type = params.type || ArgonType.Argon2d;
  const hash = Module.allocate(new Array(params.hashLen || 24), 'i8', Module.ALLOC_NORMAL);
  const secret = params.secret ? allocateArray(Module, params.secret) : 0;
  const secretlen = params.secret ? params.secret.byteLength : 0;
  const ad = params.ad ? allocateArray(Module, params.ad) : 0;
  const adlen = params.ad ? params.ad.byteLength : 0;
  const hashlen = params.hashLen || 24;
  const encodedlen = Module._argon2_encodedlen(
    tCost,
    mCost,
    parallelism,
    saltlen,
    hashlen,
    argon2Type
  );
  const encoded = Module.allocate(new Array(encodedlen + 1), 'i8', Module.ALLOC_NORMAL);
  const version = 0x13;
  let err: unknown;
  let res = 0;

  try {
    res = Module._argon2_hash_ext(
      tCost,
      mCost,
      parallelism,
      pwd,
      pwdlen,
      salt,
      saltlen,
      hash,
      hashlen,
      encoded,
      encodedlen,
      argon2Type,
      secret,
      secretlen,
      ad,
      adlen,
      version
    );
  } catch (error) {
    err = error;
  }

  let result: Argon2HashResult | Argon2Error;
  if (res === 0 && !err) {
    let hashStr = '';
    const hashArr = new Uint8Array(hashlen);
    for (let i = 0; i < hashlen; i += 1) {
      const byte = Module.HEAP8[hash + i];
      hashArr[i] = byte;
      hashStr += ('0' + (0xff & byte).toString(16)).slice(-2);
    }
    const encodedStr = Module.UTF8ToString(encoded);
    result = {
      hash: hashArr,
      hashHex: hashStr,
      encoded: encodedStr
    };
  } else {
    try {
      if (!err) {
        err = Module.UTF8ToString(Module._argon2_error_message(res));
      }
    } catch {
      // ignore error fallback
    }
    result = { message: String(err), code: res };
  }

  try {
    Module._free(pwd);
    Module._free(salt);
    Module._free(hash);
    Module._free(encoded);
    if (ad) {
      Module._free(ad);
    }
    if (secret) {
      Module._free(secret);
    }
  } catch {
    // ignore cleanup errors
  }

  if ('message' in result) {
    throw result;
  }
  return result;
}

export default {
  ArgonType,
  hash
};
