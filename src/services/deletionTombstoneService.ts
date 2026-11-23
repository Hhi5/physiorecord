// =======================================================================
// PhysioRecord — Encrypted Deletion Tombstone Service (Dexie v11)
// Prevents resurrection of explicitly deleted records across backup merges
// and multi-device clinic sync while keeping all metadata encrypted at rest.
// =======================================================================

import { db as defaultDb, type PhysioRecordDatabase } from '../db/db';
import {
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  decryptRecordPayload,
  encryptRecordWithMandatoryReservation,
} from '../crypto/vault';
import type {
  DeletionTombstoneData,
  DeletionTombstoneRecord,
  EncryptedDeletionTombstoneEntity,
} from '../types/clinical';

export function makeDeletionTombstoneId(storeName: string, recordId: string): string {
  return `${storeName.trim()}:${recordId.trim()}`;
}

export interface RecordDeletionTombstoneInput {
  storeName: string;
  recordId: string;
  deletedAt?: string;
  deletedByDeviceId?: string;
  reason?: string;
  parentIds?: string[];
}

/**
 * Encrypts and stores one or more deletion tombstones in Dexie v11 `deletionTombstones`.
 * Gracefully no-ops if the target database instance is an older test schema (< v11)
 * without a `deletionTombstones` table.
 */
export async function recordDeletionTombstones(
  entries: RecordDeletionTombstoneInput[],
  dek: CryptoKey,
  database: PhysioRecordDatabase = defaultDb
): Promise<DeletionTombstoneRecord[]> {
  if (!entries.length) return [];
  const table = (
    database as unknown as {
      deletionTombstones?: PhysioRecordDatabase['deletionTombstones'];
    }
  ).deletionTombstones;
  if (!table || typeof table.put !== 'function') {
    return [];
  }

  const meta = await database.vaultMeta.get('auth');
  const activeDekVersion = meta?.dekVersion || CURRENT_DEK_VERSION;
  const nowIso = new Date().toISOString();

  const saved: DeletionTombstoneRecord[] = [];
  for (const entry of entries) {
    const storeName = String(entry.storeName || '').trim();
    const recordId = String(entry.recordId || '').trim();
    if (!storeName || !recordId) continue;

    const id = makeDeletionTombstoneId(storeName, recordId);
    const deletedAt = entry.deletedAt || nowIso;
    const payload: DeletionTombstoneData = {
      storeName,
      recordId,
      deletedAt,
      ...(entry.deletedByDeviceId ? { deletedByDeviceId: entry.deletedByDeviceId } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.parentIds && entry.parentIds.length > 0 ? { parentIds: entry.parentIds } : {}),
    };

    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      database,
      dek,
      'deletionTombstones',
      id,
      [],
      payload,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );

    const entity: EncryptedDeletionTombstoneEntity = {
      id,
      storeName,
      recordId,
      deletedAt,
      createdAt: deletedAt,
      updatedAt: deletedAt,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      recordSalt,
      iv,
      ciphertext,
    };
    await table.put(entity);

    saved.push({
      id,
      ...payload,
      createdAt: deletedAt,
      updatedAt: deletedAt,
    });
  }

  return saved;
}

/**
 * Decrypts all deletion tombstones stored in `deletionTombstones`.
 */
export async function getAllDeletionTombstones(
  dek: CryptoKey,
  database: PhysioRecordDatabase = defaultDb
): Promise<DeletionTombstoneRecord[]> {
  const table = (
    database as unknown as {
      deletionTombstones?: PhysioRecordDatabase['deletionTombstones'];
    }
  ).deletionTombstones;
  if (!table || typeof table.toArray !== 'function') {
    return [];
  }

  const rows = await table.toArray();
  const result: DeletionTombstoneRecord[] = [];
  for (const entity of rows) {
    try {
      const data = await decryptRecordPayload<DeletionTombstoneData>(
        dek,
        'deletionTombstones',
        entity.id,
        [],
        entity.iv,
        entity.ciphertext,
        entity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
        entity.dekVersion || CURRENT_DEK_VERSION,
        entity.recordSalt
      );
      result.push({
        id: entity.id,
        storeName: data.storeName || entity.storeName,
        recordId: data.recordId || entity.recordId,
        deletedAt: data.deletedAt || entity.deletedAt,
        deletedByDeviceId: data.deletedByDeviceId,
        reason: data.reason,
        parentIds: data.parentIds,
        createdAt: entity.createdAt || entity.deletedAt,
        updatedAt: entity.updatedAt || entity.deletedAt,
      });
    } catch {
      // Skip corrupted tombstone row without breaking sync/load
    }
  }
  return result;
}

/**
 * Removes a tombstone if an explicitly soft-deleted record is restored (e.g. from 30-day trash).
 */
export async function clearDeletionTombstone(
  storeName: string,
  recordId: string,
  database: PhysioRecordDatabase = defaultDb
): Promise<void> {
  const table = (
    database as unknown as {
      deletionTombstones?: PhysioRecordDatabase['deletionTombstones'];
    }
  ).deletionTombstones;
  if (!table || typeof table.delete !== 'function') return;
  await table.delete(makeDeletionTombstoneId(storeName, recordId));
}
