import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInMemoryDatabase } from '../../crypto/__tests__/testDbHelper';
import type { PhysioRecordDatabase } from '../../db/db';
import {
  CONSTANTS,
  CURRENT_DEK_VERSION,
  bindDekToGeneration,
  deriveKEK,
  generateAndWrapOperationalDEK,
  generateVerifier,
  randomBytes,
} from '../../crypto/vault';
import { ClinicOperationsService } from '../clinicOperationsService';
import { importAndMergeEncryptedSyncFile } from '../clinicSyncService';
import {
  PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS,
  encryptSyncEnvelope,
  type ClinicSyncPayload,
} from '../../utils/clinicSyncEngine';
import type { FinancialInvoiceIQD } from '../../types/clinicManagement';

describe('Clinic Sync Service — Encrypted Invoice Persistence', () => {
  let testDb: PhysioRecordDatabase;
  let dek: CryptoKey;
  let prevLocalStorage: unknown;

  beforeEach(async () => {
    const map = new Map<string, string>();
    prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
    };

    testDb = createInMemoryDatabase(9);

    const salt = randomBytes(CONSTANTS.SALT_BYTES);
    const kek = await deriveKEK('ClinicSyncTest#2026', salt, 1000);
    const { operationalDek, wrappedDek, wrappedDekIv } =
      await generateAndWrapOperationalDEK(kek, 1);
    const { verifierIv, verifierCiphertext } = await generateVerifier(kek);

    await testDb.vaultMeta.put({
      id: 'auth',
      salt,
      wrappedDek,
      wrappedDekIv,
      verifierIv,
      verifierCiphertext,
      schemaVersion: testDb.verno,
      kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
      kdfIterations: 1000,
      dekVersion: CURRENT_DEK_VERSION,
      encryptionInvocationCount: 0,
      vaultGeneration: 1,
    });

    dek = operationalDek;
    bindDekToGeneration(dek, 1);
    await ClinicOperationsService.hydrateEncryptedCache(dek, testDb);
  });

  afterEach(() => {
    ClinicOperationsService.clearInMemoryCache();
    if (prevLocalStorage === undefined) {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
    }
  });

  it('persists merged peer invoices into ClinicOperationsService and encrypted IndexedDB', async () => {
    const peerInvoice: FinancialInvoiceIQD = {
      id: 'inv_peer_sync_001',
      invoiceNumber: 'INV-2026-0099',
      patientId: 'pat_sync_001',
      patientName: 'علي حسن',
      date: '2026-05-01',
      invoiceType: 'rehab_package',
      titleAr: 'كورس علاج طبيعي (10 جلسات)',
      titleEn: 'Physiotherapy Course (10 Sessions)',
      totalAmountIQD: 250000,
      discountIQD: 0,
      netAmountIQD: 250000,
      paidAmountIQD: 100000,
      balanceDueIQD: 150000,
      status: 'partial',
      packageTotalSessions: 10,
      packageUsedSessions: 2,
      payments: [
        {
          id: 'pay_peer_1',
          invoiceId: 'inv_peer_sync_001',
          patientId: 'pat_sync_001',
          date: '2026-05-01',
          amountIQD: 100000,
          method: 'zain_cash',
          receivedBy: 'الاستقبال',
          receiptNumber: 'RCPT-2026-0099',
          status: 'posted',
        },
      ],
      createdBy: 'الاستقبال',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };

    const peerPayload: ClinicSyncPayload = {
      schemaVersion: 1,
      deviceId: 'dev_reception_pc_99',
      deviceLabel: 'Reception PC',
      exportedAt: '2026-05-01T10:05:00.000Z',
      patients: [],
      episodes: [],
      sessions: [],
      soapNotes: [],
      clinicalAddenda: [],
      appointments: [],
      invoices: [peerInvoice],
      episodeClinicalStores: [],
      staffRoster: [],
    };

    const envelope = await encryptSyncEnvelope(
      peerPayload,
      'SharedClinicKey#2026',
      PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS
    );

    const outcome = await importAndMergeEncryptedSyncFile(
      JSON.stringify(envelope),
      dek,
      'SharedClinicKey#2026',
      testDb
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.stats?.invoicesMerged).toBe(1);
    expect(outcome.messageEn).toContain('1 invoices');

    // Verify in-memory state immediately reflects the merged invoice
    const inMem = ClinicOperationsService.getInvoicesIQD();
    expect(inMem.some((i) => i.id === 'inv_peer_sync_001' && i.totalAmountIQD === 250000)).toBe(
      true
    );

    // Wipe memory and re-hydrate from encrypted IndexedDB to verify durable persistence
    ClinicOperationsService.clearInMemoryCache();
    await ClinicOperationsService.hydrateEncryptedCache(dek, testDb);
    const rehydrated = ClinicOperationsService.getInvoicesIQD();
    const restored = rehydrated.find((i) => i.id === 'inv_peer_sync_001');
    expect(restored).toBeDefined();
    expect(restored?.invoiceNumber).toBe('INV-2026-0099');
    expect(restored?.paidAmountIQD).toBe(100000);
    expect(restored?.balanceDueIQD).toBe(150000);
  });
});
