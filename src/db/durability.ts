/**
 * src/db/durability.ts
 * Helpers for strict IndexedDB commit durability (`{ durability: 'strict' }` on supported Chromium engines)
 * and atomic multi-record write transactions with safe feature-detection fallbacks.
 */

import type { PhysioRecordDatabase } from './db';

export type PreferredIdbDurability = 'strict' | 'default';

/**
 * Detect whether the runtime's IndexedDB implementation supports explicit `durability`
 * transaction options (`IDBTransaction.prototype.durability`).
 * Note: Returns `'default'` safely in mock environments without IDBTransaction so Node/Vitest never fails.
 */
export function getPreferredIdbDurability(): PreferredIdbDurability {
  try {
    if (
      typeof IDBTransaction !== 'undefined' &&
      IDBTransaction.prototype &&
      'durability' in IDBTransaction.prototype
    ) {
      return 'strict';
    }
  } catch {
    // Ignore restricted environment checks
  }
  return 'default';
}

/**
 * Execute an atomic read-write IndexedDB/Dexie transaction across multiple tables.
 * When backed by Chromium's native IndexedDB, Dexie's `chromeTransactionDurability: 'strict'`
 * ensures writes are fsynced to stable storage before resolving.
 */
export async function runStrictWriteTransaction<T>(
  database: PhysioRecordDatabase,
  tables: unknown[],
  scope: () => Promise<T>
): Promise<T> {
  return await database.transaction('rw', tables as any[], scope);
}
