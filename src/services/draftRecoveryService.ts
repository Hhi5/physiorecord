/**
 * src/services/draftRecoveryService.ts
 * Phase A1: Power-Cut / Crash-Resilient Encrypted Work-in-Progress Draft Service (Dexie v10).
 *
 * Guarantees:
 * - Zero plaintext PHI: all drafts (SOAP, flowsheet, invoice, appointment) are encrypted via
 *   `encryptRecordWithMandatoryReservation` into Dexie v10 `drafts` (`{ durability: 'strict' }` on Chromium).
 * - Fast <= 700ms debounced writes while typing.
 * - Immediate synchronous-snapshot collection & async flush on `visibilitychange` (hidden),
 *   `pagehide`, `beforeunload`, and BEFORE vault lock (`lock()` / inactivity timeout).
 * - Cleans up deterministically when the user explicitly saves, submits, or discards a draft.
 */

import { db, type PhysioRecordDatabase } from '../db/db';
import { runStrictWriteTransaction } from '../db/durability';
import {
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  decryptRecordPayload,
  encryptRecordWithMandatoryReservation,
  getDekGeneration,
} from '../crypto/vault';
import type {
  DecryptedDraftRecord,
  DraftRecordType,
  EncryptedDraftEntity,
} from '../types/clinical';

export const DRAFT_DEBOUNCE_MS = 650;

export interface PendingDraftInput<TPayload = Record<string, unknown>> {
  draftType: DraftRecordType;
  entityId: string;
  patientId?: string;
  patientName?: string;
  summaryLabel?: string;
  payload: TPayload;
}

interface StoredDraftPlainPayload<TPayload = Record<string, unknown>> {
  draftType: DraftRecordType;
  entityId: string;
  patientId?: string;
  patientName?: string;
  summaryLabel?: string;
  payload: TPayload;
  updatedAt: string;
}

export function buildDraftId(draftType: DraftRecordType, entityId: string): string {
  return `${draftType}:${entityId}`;
}

export class DraftRecoveryService {
  private static pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static pendingInputs = new Map<
    string,
    {
      dek: CryptoKey;
      database: PhysioRecordDatabase;
      input: PendingDraftInput<any>;
    }
  >();
  private static flushSources = new Map<
    string,
    () => PendingDraftInput<any> | null
  >();
  private static inFlightSaves = new Set<Promise<unknown>>();
  private static listeners: Set<() => void> = new Set();

  static subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private static notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  private static canUseDraftsStore(database: PhysioRecordDatabase): boolean {
    const dbAny = database as unknown as { drafts?: unknown; verno?: number };
    return Boolean(dbAny.drafts && (!dbAny.verno || dbAny.verno >= 10));
  }

  private static trackSave<T>(promise: Promise<T>): Promise<T> {
    this.inFlightSaves.add(promise);
    return promise.finally(() => {
      this.inFlightSaves.delete(promise);
    });
  }

  static async saveDraftAsync<TPayload = Record<string, unknown>>(
    dek: CryptoKey,
    input: PendingDraftInput<TPayload>,
    database: PhysioRecordDatabase = db
  ): Promise<DecryptedDraftRecord<TPayload> | null> {
    if (!this.canUseDraftsStore(database)) return null;
    if (getDekGeneration(dek) === undefined) return null;

    const id = buildDraftId(input.draftType, input.entityId);
    const nowIso = new Date().toISOString();
    const cleanPatientId = input.patientId?.trim() || undefined;
    const parentIds = cleanPatientId ? [cleanPatientId] : [];
    const wrappedPayload: StoredDraftPlainPayload<TPayload> = {
      draftType: input.draftType,
      entityId: input.entityId,
      patientId: cleanPatientId,
      patientName: input.patientName,
      summaryLabel: input.summaryLabel,
      payload: input.payload,
      updatedAt: nowIso,
    };

    const meta = await database.vaultMeta.get('auth').catch(() => undefined);
    const activeDekVersion = meta?.dekVersion || CURRENT_DEK_VERSION;
    const existing = await database.drafts.get(id).catch(() => undefined);

    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      database,
      dek,
      'drafts',
      id,
      parentIds,
      wrappedPayload,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );

    const entity: EncryptedDraftEntity = {
      id,
      draftType: input.draftType,
      entityId: input.entityId,
      patientId: cleanPatientId,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      ...(recordSalt ? { recordSalt } : {}),
      iv,
      ciphertext,
    };

    await runStrictWriteTransaction(database, [database.drafts], async () => {
      await database.drafts.put(entity);
    });

    this.notify();

    return {
      id,
      draftType: input.draftType,
      entityId: input.entityId,
      patientId: cleanPatientId,
      patientName: input.patientName,
      summaryLabel: input.summaryLabel,
      payload: input.payload,
      createdAt: entity.createdAt,
      updatedAt: nowIso,
    };
  }

  static scheduleDebouncedDraftSave<TPayload = Record<string, unknown>>(
    dek: CryptoKey | null,
    input: PendingDraftInput<TPayload>,
    database: PhysioRecordDatabase = db,
    delayMs: number = DRAFT_DEBOUNCE_MS
  ): void {
    if (!dek) return;
    const id = buildDraftId(input.draftType, input.entityId);
    const prevTimer = this.pendingTimers.get(id);
    if (prevTimer) clearTimeout(prevTimer);

    this.pendingInputs.set(id, { dek, database, input });

    const timer = setTimeout(() => {
      this.pendingTimers.delete(id);
      const pending = this.pendingInputs.get(id);
      if (!pending) return;
      this.pendingInputs.delete(id);
      void this.trackSave(
        this.saveDraftAsync(pending.dek, pending.input, pending.database)
      ).catch(() => undefined);
    }, Math.min(Math.max(100, delayMs), 1000));

    this.pendingTimers.set(id, timer);
  }

  static cancelDebouncedDraft(draftType: DraftRecordType, entityId: string): void {
    const id = buildDraftId(draftType, entityId);
    const timer = this.pendingTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimers.delete(id);
    }
    this.pendingInputs.delete(id);
  }

  static async deleteDraftAsync(
    draftType: DraftRecordType,
    entityId: string,
    database: PhysioRecordDatabase = db
  ): Promise<void> {
    this.cancelDebouncedDraft(draftType, entityId);
    if (!this.canUseDraftsStore(database)) return;
    const id = buildDraftId(draftType, entityId);
    await runStrictWriteTransaction(database, [database.drafts], async () => {
      await database.drafts.delete(id);
    });
    this.notify();
  }

  static async deleteDraftByIdAsync(
    id: string,
    database: PhysioRecordDatabase = db
  ): Promise<void> {
    const prevTimer = this.pendingTimers.get(id);
    if (prevTimer) {
      clearTimeout(prevTimer);
      this.pendingTimers.delete(id);
    }
    this.pendingInputs.delete(id);
    if (!this.canUseDraftsStore(database)) return;
    await runStrictWriteTransaction(database, [database.drafts], async () => {
      await database.drafts.delete(id);
    });
    this.notify();
  }

  static async clearAllDraftsAsync(database: PhysioRecordDatabase = db): Promise<void> {
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
    this.pendingInputs.clear();
    if (!this.canUseDraftsStore(database)) return;
    await runStrictWriteTransaction(database, [database.drafts], async () => {
      await database.drafts.clear();
    });
    this.notify();
  }

  static async getDraftAsync<TPayload = Record<string, unknown>>(
    dek: CryptoKey,
    draftType: DraftRecordType,
    entityId: string,
    database: PhysioRecordDatabase = db
  ): Promise<DecryptedDraftRecord<TPayload> | null> {
    if (!this.canUseDraftsStore(database)) return null;
    if (this.inFlightSaves.size > 0) {
      await Promise.all([...this.inFlightSaves]);
    }
    const id = buildDraftId(draftType, entityId);
    const raw = await database.drafts.get(id).catch(() => undefined);
    if (!raw) return null;
    try {
      const parentIds = raw.patientId ? [raw.patientId] : [];
      const decrypted = await decryptRecordPayload<StoredDraftPlainPayload<TPayload>>(
        dek,
        'drafts',
        raw.id,
        parentIds,
        raw.iv instanceof Uint8Array ? raw.iv : new Uint8Array(raw.iv),
        raw.ciphertext instanceof Uint8Array ? raw.ciphertext : new Uint8Array(raw.ciphertext),
        raw.recordCryptoVersion,
        raw.dekVersion,
        raw.recordSalt ? new Uint8Array(raw.recordSalt) : undefined
      );
      return {
        id: raw.id,
        draftType: raw.draftType,
        entityId: raw.entityId,
        patientId: raw.patientId,
        patientName: decrypted.patientName,
        summaryLabel: decrypted.summaryLabel,
        payload: decrypted.payload,
        createdAt: raw.createdAt,
        updatedAt: decrypted.updatedAt || raw.updatedAt,
      };
    } catch {
      return null;
    }
  }

  static async listDecryptedDraftsAsync(
    dek: CryptoKey,
    database: PhysioRecordDatabase = db
  ): Promise<DecryptedDraftRecord[]> {
    if (!this.canUseDraftsStore(database)) return [];
    if (this.inFlightSaves.size > 0) {
      await Promise.all([...this.inFlightSaves]);
    }
    const rows = await database.drafts.toArray().catch(() => []);
    const results: DecryptedDraftRecord[] = [];
    for (const raw of rows) {
      try {
        const parentIds = raw.patientId ? [raw.patientId] : [];
        const decrypted = await decryptRecordPayload<StoredDraftPlainPayload>(
          dek,
          'drafts',
          raw.id,
          parentIds,
          raw.iv instanceof Uint8Array ? raw.iv : new Uint8Array(raw.iv),
          raw.ciphertext instanceof Uint8Array ? raw.ciphertext : new Uint8Array(raw.ciphertext),
          raw.recordCryptoVersion,
          raw.dekVersion,
          raw.recordSalt ? new Uint8Array(raw.recordSalt) : undefined
        );
        results.push({
          id: raw.id,
          draftType: raw.draftType,
          entityId: raw.entityId,
          patientId: raw.patientId,
          patientName: decrypted.patientName,
          summaryLabel: decrypted.summaryLabel,
          payload: decrypted.payload,
          createdAt: raw.createdAt,
          updatedAt: decrypted.updatedAt || raw.updatedAt,
        });
      } catch {
        // Ignore stale or undecryptable rows from prior key generations
      }
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Register a live form collector so before-lock / visibilitychange / unload can pull
   * even un-debounced unsaved state (typed in the last few milliseconds) before flushing.
   */
  static registerDraftFlushSource(
    sourceKey: string,
    collector: () => PendingDraftInput<any> | null
  ): () => void {
    this.flushSources.set(sourceKey, collector);
    return () => {
      this.flushSources.delete(sourceKey);
    };
  }

  /**
   * Synchronously flush all pending debounced drafts + active live form snapshots
   * BEFORE clearing DEK or unloading the page.
   */
  static async flushAllPendingDrafts(
    fallbackDek?: CryptoKey | null,
    database: PhysioRecordDatabase = db
  ): Promise<number> {
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();

    const toSave = new Map<
      string,
      { dek: CryptoKey; database: PhysioRecordDatabase; input: PendingDraftInput<any> }
    >(this.pendingInputs);
    this.pendingInputs.clear();

    if (fallbackDek) {
      for (const collector of this.flushSources.values()) {
        try {
          const snapshot = collector();
          if (snapshot) {
            const id = buildDraftId(snapshot.draftType, snapshot.entityId);
            toSave.set(id, { dek: fallbackDek, database, input: snapshot });
          }
        } catch {
          // Ignore UI collector error during unload
        }
      }
    }

    let savedCount = 0;
    const writes: Promise<unknown>[] = [];
    for (const item of toSave.values()) {
      writes.push(
        this.trackSave(
          this.saveDraftAsync(item.dek, item.input, item.database)
            .then((res) => {
              if (res) savedCount++;
            })
            .catch(() => undefined)
        )
      );
    }

    await Promise.all([...this.inFlightSaves, ...writes]);
    return savedCount;
  }

  /**
   * Attach page lifecycle hooks (`visibilitychange`, `pagehide`, `beforeunload`)
   * that flush pending drafts immediately whenever the tab goes hidden or unloads.
   */
  static attachGlobalDraftFlushHandlers(
    getActiveDek: () => CryptoKey | null,
    database: PhysioRecordDatabase = db
  ): () => void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return () => undefined;
    }

    const triggerFlush = () => {
      const dek = getActiveDek();
      if (!dek) return;
      void this.flushAllPendingDrafts(dek, database);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        triggerFlush();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', triggerFlush);
    window.addEventListener('beforeunload', triggerFlush);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', triggerFlush);
      window.removeEventListener('beforeunload', triggerFlush);
    };
  }
}
