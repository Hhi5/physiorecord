// =======================================================================
// PhysioRecord — Crypto Worker Client & Streaming Gzip Helpers (Phase 1.7 & 1.9)
// Runs heavy PBKDF2 in Web Worker when available, falling back cleanly in tests/Node.
// =======================================================================

import { deriveBackupKeys, deriveKEK, type BackupKeys } from './vault';

let nextRequestId = 1;

const runPbkdf2BitsInWorker = (
  password: string,
  salt: Uint8Array,
  iterations: number,
  onProgress?: (percent: number) => void
): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      reject(new Error('WebWorker unavailable'));
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL('./cryptoWorker.ts', import.meta.url), {
        type: 'module',
      });
    } catch (err) {
      reject(err);
      return;
    }

    const requestId = nextRequestId++;
    const timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new Error('Crypto worker timed out'));
    }, 60_000);

    worker.onmessage = (event: MessageEvent<{ id: number; type: string; progress?: number; bits?: ArrayBuffer; error?: string }>) => {
      const data = event.data;
      if (!data || data.id !== requestId) return;

      if (data.type === 'progress' && typeof data.progress === 'number') {
        onProgress?.(data.progress);
        return;
      }

      clearTimeout(timeoutId);
      worker.terminate();

      if (data.type === 'result' && data.bits) {
        resolve(data.bits);
      } else {
        reject(new Error(data.error || 'Worker key derivation failed'));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeoutId);
      worker.terminate();
      reject(err instanceof ErrorEvent ? new Error(err.message) : new Error('Crypto worker error'));
    };

    worker.postMessage({
      id: requestId,
      type: 'pbkdf2_derive_bits',
      password,
      salt: Array.from(salt),
      iterations,
    });
  });
};

/**
 * Derive Vault KEK in Web Worker (non-blocking UI) with graceful main-thread fallback.
 */
export const deriveKEKWithWorker = async (
  password: string,
  salt: Uint8Array,
  iterations = 600_000,
  onProgress?: (percent: number) => void
): Promise<CryptoKey> => {
  onProgress?.(5);
  try {
    const bits = await runPbkdf2BitsInWorker(password, salt, iterations, onProgress);
    const bytes = new Uint8Array(bits);
    try {
      return await crypto.subtle.importKey(
        'raw',
        bytes,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    } finally {
      bytes.fill(0);
    }
  } catch {
    onProgress?.(35);
    const key = await deriveKEK(password, salt, iterations);
    onProgress?.(100);
    return key;
  }
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

/**
 * Derive HKDF backup keys via Worker PBKDF2 with graceful main-thread fallback.
 */
export const deriveBackupKeysWithWorker = async (
  password: string,
  pbkdf2Salt: Uint8Array,
  hkdfSalt: Uint8Array,
  iterations = 600_000,
  infoDekWrap = 'physiorecord-backup-dek-wrap-v3.0',
  infoPayloadEnc = 'physiorecord-backup-payload-enc-v3.0',
  onProgress?: (percent: number) => void
): Promise<BackupKeys> => {
  onProgress?.(5);
  try {
    const masterBits = await runPbkdf2BitsInWorker(password, pbkdf2Salt, iterations, onProgress);
    const masterBytes = new Uint8Array(masterBits);
    try {
      const hkdfKey = await crypto.subtle.importKey('raw', masterBytes, 'HKDF', false, ['deriveKey']);
      const hkdfSaltBuf = toArrayBuffer(hkdfSalt);
      const backupDekWrapKey = await crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: hkdfSaltBuf,
          info: toArrayBuffer(new TextEncoder().encode(infoDekWrap)),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      const backupPayloadEncKey = await crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: hkdfSaltBuf,
          info: toArrayBuffer(new TextEncoder().encode(infoPayloadEnc)),
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      return { backupDekWrapKey, backupPayloadEncKey };
    } finally {
      masterBytes.fill(0);
    }
  } catch {
    onProgress?.(40);
    const keys = await deriveBackupKeys(
      password,
      pbkdf2Salt,
      hkdfSalt,
      iterations,
      infoDekWrap,
      infoPayloadEnc
    );
    onProgress?.(100);
    return keys;
  }
};

const readAllStreamBytes = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return merged;
};

/**
 * Check whether standard Web Streams CompressionStream('gzip') is supported in the current WebView/browser.
 */
export const isCompressionStreamSupported = (): boolean => {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
};

/**
 * Compress bytes using standard Web Streams CompressionStream('gzip').
 */
export const compressBytesGzip = async (input: Uint8Array): Promise<Uint8Array> => {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('CompressionStream API is not available in this environment.');
  }
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new CompressionStream('gzip'));
  return await readAllStreamBytes(stream as ReadableStream<Uint8Array>);
};

/**
 * Decompress gzip bytes using standard Web Streams DecompressionStream('gzip').
 */
export const decompressBytesGzip = async (compressed: Uint8Array): Promise<Uint8Array> => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream API is not available in this environment.');
  }
  const copy = new Uint8Array(compressed.byteLength);
  copy.set(compressed);
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await readAllStreamBytes(stream as ReadableStream<Uint8Array>);
};
