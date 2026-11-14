// =======================================================================
// PhysioRecord — Dedicated Crypto Web Worker (Phase 1.7)
// Offloads PBKDF2 key stretching and gzip compression/decompression from UI thread.
// =======================================================================

interface DeriveBitsRequest {
  id: number;
  type: 'pbkdf2_derive_bits';
  password: string;
  salt: number[];
  iterations: number;
}

interface WorkerResponse {
  id: number;
  type: 'progress' | 'result' | 'error';
  progress?: number;
  bits?: ArrayBuffer;
  error?: string;
}

self.onmessage = async (event: MessageEvent<DeriveBitsRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'pbkdf2_derive_bits') {
    return;
  }

  let progressTimer: ReturnType<typeof setInterval> | null = null;
  try {
    let pct = 15;
    (self as unknown as Worker).postMessage({
      id: msg.id,
      type: 'progress',
      progress: pct,
    } satisfies WorkerResponse);

    progressTimer = setInterval(() => {
      pct = Math.min(90, pct + 12);
      (self as unknown as Worker).postMessage({
        id: msg.id,
        type: 'progress',
        progress: pct,
      } satisfies WorkerResponse);
    }, 120);

    const passwordBytes = new TextEncoder().encode(msg.password);
    const saltBytes = new Uint8Array(msg.salt);
    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: msg.iterations,
        hash: 'SHA-256',
      },
      baseKey,
      256
    );

    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }

    (self as unknown as Worker).postMessage({
      id: msg.id,
      type: 'progress',
      progress: 100,
    } satisfies WorkerResponse);

    (self as unknown as Worker).postMessage(
      {
        id: msg.id,
        type: 'result',
        bits,
      } satisfies WorkerResponse,
      [bits]
    );
  } catch (err: unknown) {
    if (progressTimer) {
      clearInterval(progressTimer);
    }
    const message = err instanceof Error ? err.message : 'Worker crypto failure';
    (self as unknown as Worker).postMessage({
      id: msg.id,
      type: 'error',
      error: message,
    } satisfies WorkerResponse);
  }
};
