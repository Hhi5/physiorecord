// =======================================================================
// PhysioRecord — Phase A Tests: Crash Resilience, Batch Atomicity,
// Recovery Drill Sandbox Isolation, Low-End Device Mode & Virtualization
// =======================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInMemoryDatabase } from '../../crypto/__tests__/testDbHelper';
import {
  CONSTANTS,
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  bindDekToGeneration,
  deriveKEK,
  encryptRecordWithMandatoryReservation,
  generateAndWrapOperationalDEK,
  generateVerifier,
  isQuarterlyRecoveryDrillDue,
  randomBytes,
  recordRecoveryDrillSuccess,
  rotateAllKeys,
  verifyRecoveryKeyGroup,
} from '../../crypto/vault';
import {
  exportBackupPackage,
  verifyBackupInSandboxDb,
} from '../../crypto/backup';
import { DraftRecoveryService, DRAFT_DEBOUNCE_MS } from '../draftRecoveryService';
import { ClinicOperationsService } from '../clinicOperationsService';
import {
  loadFullPatientRecordFromDb,
  toPatientListCardRecord,
} from '../../context/PatientContext';
import {
  detectLowEndHardware,
  resolveReducedEffectsEnabled,
} from '../../utils/appearancePrefs';
import {
  VIRTUALIZATION_THRESHOLD,
  computeVirtualWindowBounds,
} from '../../hooks/useVirtualWindow';
import { computeAuditEntryHash } from '../clinicSecurityHelpers';
import type {
  AuditLogEntry,
  EpisodeScopedClinicalStore,
} from '../../types/clinicManagement';
import type {
  PatientClinicalData,
  PatientRecord,
} from '../../types/clinical';

async function setupVaultWithRecoveryKey(verno = 10) {
  const testDb = createInMemoryDatabase(verno);
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK('PhaseAResilience#2026', salt, 1000);
  const generated = await generateAndWrapOperationalDEK(kek, 1);

  const { verifierIv, verifierCiphertext } = await generateVerifier(kek);

  await testDb.vaultMeta.put({
    id: 'auth',
    salt,
    wrappedDek: generated.wrappedDek,
    wrappedDekIv: generated.wrappedDekIv,
    verifierIv,
    verifierCiphertext,
    schemaVersion: testDb.verno,
    kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
    kdfIterations: 1000,
    dekVersion: CURRENT_DEK_VERSION,
    encryptionInvocationCount: 0,
    vaultGeneration: 1,
    recoveryWrappedDek: generated.recoveryWrappedDek,
    recoveryWrappedDekIv: generated.recoveryWrappedDekIv,
    recoverySalt: generated.recoverySalt,
    recoveryKdfIterations: generated.recoveryKdfIterations,
    recoveryKeyGroupSalt: generated.recoveryKeyGroupSalt,
    recoveryKeyGroupDigests: generated.recoveryKeyGroupDigests,
  });

  bindDekToGeneration(generated.operationalDek, 1);
  return {
    testDb,
    dek: generated.operationalDek,
    kek,
    recoveryKeyFormatted: generated.recoveryKeyFormatted || '',
  };
}

async function seedMinimalPatient(
  testDb: ReturnType<typeof createInMemoryDatabase>,
  dek: CryptoKey,
  patientId: string,
  payload: PatientClinicalData
) {
  const now = new Date().toISOString();
  const enc = await encryptRecordWithMandatoryReservation(
    testDb,
    dek,
    'patients',
    patientId,
    [],
    payload
  );
  await testDb.patients.put({
    id: patientId,
    createdAt: now,
    updatedAt: now,
    isArchived: 0,
    version: 1,
    recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
    dekVersion: CURRENT_DEK_VERSION,
    recordSalt: enc.recordSalt,
    iv: enc.iv,
    ciphertext: enc.ciphertext,
  });
}

describe('Phase A — Crash Resilience, Sandbox Drill, Low-End Device Mode & Virtualization', () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    ClinicOperationsService.clearInMemoryCache();
  });

  it('A1.1: Dexie v10 drafts store encrypts at rest, rotates cleanly across DEKs, and cascades on patient deletion', async () => {
    const { testDb, dek, kek } = await setupVaultWithRecoveryKey(10);

    expect(testDb.getDeclaredIndexesForStore('drafts')).toEqual([
      'id',
      'draftType',
      'entityId',
      'patientId',
      'updatedAt',
    ]);

    await seedMinimalPatient(testDb, dek, 'pat-draft-1', {
      fullName: 'حيدر كاظم',
      fullNameAr: 'حيدر كاظم',
      gender: 'male',
      phone: '07700001122',
    });

    const saved = await DraftRecoveryService.saveDraftAsync(
      dek,
      {
        draftType: 'soap',
        entityId: 'sess-101',
        patientId: 'pat-draft-1',
        patientName: 'حيدر كاظم',
        summaryLabel: 'J2 / Acute Lumbar Strain',
        payload: {
          chiefComplaint: 'Severe morning low-back stiffness 7/10',
          nextSessionPlan: 'Manual traction + core stabilization',
        },
      },
      testDb
    );

    expect(saved).not.toBeNull();
    const rawRow = await testDb.drafts.get('soap:sess-101');
    expect(rawRow).toBeDefined();
    // Plaintext PHI must never appear in IndexedDB ciphertext bytes
    const rawUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(rawRow!.ciphertext);
    expect(rawUtf8).not.toContain('Severe morning low-back stiffness');
    expect(rawUtf8).not.toContain('حيدر كاظم');

    const roundtrip = await DraftRecoveryService.getDraftAsync<{ chiefComplaint: string }>(
      dek,
      'soap',
      'sess-101',
      testDb
    );
    expect(roundtrip?.payload.chiefComplaint).toBe('Severe morning low-back stiffness 7/10');
    expect(roundtrip?.patientName).toBe('حيدر كاظم');

    // Re-encryption under key rotation must preserve draft readability under new DEK and reject old DEK
    const rotated = await rotateAllKeys(testDb, dek, kek);
    expect(rotated.rotatedStoreCounts['drafts']).toBe(1);

    const oldDekAttempt = await DraftRecoveryService.getDraftAsync(
      dek,
      'soap',
      'sess-101',
      testDb
    );
    expect(oldDekAttempt).toBeNull();

    const newDekDrafts = await DraftRecoveryService.listDecryptedDraftsAsync(
      rotated.newOperationalDek,
      testDb
    );
    expect(newDekDrafts).toHaveLength(1);
    expect(newDekDrafts[0].payload).toMatchObject({
      chiefComplaint: 'Severe morning low-back stiffness 7/10',
    });

    // Hard-deleting parent patient cascades & deletes patient-linked drafts cleanly
    await testDb.deletePatientPermanently('pat-draft-1', {
      verifiedBackupString: 'BYPASS_FOR_TEST',
      bypassForTest: true,
      dek: rotated.newOperationalDek,
    });
    expect(await testDb.drafts.count()).toBe(0);
  });

  it('A1.2: DraftRecoveryService debounces at 650ms and flushes active snapshots immediately on pre-lock/unload', async () => {
    vi.useFakeTimers();
    const { testDb, dek } = await setupVaultWithRecoveryKey(10);

    DraftRecoveryService.scheduleDebouncedDraftSave(
      dek,
      {
        draftType: 'invoice',
        entityId: 'ledger-draft',
        patientId: 'pat-fin-1',
        summaryLabel: 'New IQD Invoice',
        payload: { totalIQD: '25000' },
      },
      testDb
    );

    expect(DRAFT_DEBOUNCE_MS).toBeLessThanOrEqual(700);
    await vi.advanceTimersByTimeAsync(DRAFT_DEBOUNCE_MS - 50);
    expect(await testDb.drafts.count()).toBe(0);

    await vi.advanceTimersByTimeAsync(60);
    // Allow microtasks from async WebCrypto inside debounced timeout to settle
    vi.useRealTimers();
    await DraftRecoveryService.flushAllPendingDrafts(dek, testDb);
    const listAfterDebounce = await DraftRecoveryService.listDecryptedDraftsAsync(dek, testDb);
    expect(listAfterDebounce).toHaveLength(1);
    expect(listAfterDebounce[0].payload).toMatchObject({ totalIQD: '25000' });

    // Test immediate pre-lock live collector flush even before any debounce timer fires
    const unregister = DraftRecoveryService.registerDraftFlushSource('soap:sess-live', () => ({
      draftType: 'soap',
      entityId: 'sess-live',
      patientId: 'pat-fin-1',
      payload: { chiefComplaint: 'Typed 50ms before power cut' },
    }));

    const flushedCount = await DraftRecoveryService.flushAllPendingDrafts(dek, testDb);
    unregister();
    expect(flushedCount).toBeGreaterThanOrEqual(1);

    const liveDraft = await DraftRecoveryService.getDraftAsync<{ chiefComplaint: string }>(
      dek,
      'soap',
      'sess-live',
      testDb
    );
    expect(liveDraft?.payload.chiefComplaint).toBe('Typed 50ms before power cut');
  });

  it('A1.3: ClinicOperationsService.createInvoiceIQD commits invoice + initial payment atomically in one transaction', async () => {
    const { testDb, dek } = await setupVaultWithRecoveryKey(10);
    await ClinicOperationsService.hydrateEncryptedCache(dek, testDb, { lazyHeavyStores: false });

    const tableSpy = vi.spyOn(testDb, 'table');
    const txSpy = vi.spyOn(testDb, 'transaction');

    const invoice = ClinicOperationsService.createInvoiceIQD({
      patientId: 'pat-inv-1',
      patientName: 'زينب ستار',
      invoiceType: 'single_session',
      titleAr: 'جلسة علاج طبيعي',
      titleEn: 'PT Session',
      totalAmountIQD: 25000,
      discountIQD: 0,
      initialPaidIQD: 25000,
      paymentMethod: 'cash',
    });

    await ClinicOperationsService.flushPendingWrites();

    // Verify a single multi-table transaction spanned invoices + payments + vaultMeta
    const batchTxCall = txSpy.mock.calls.find(
      ([, tables]) =>
        Array.isArray(tables) &&
        tables.length === 3 &&
        tables.includes(testDb.vaultMeta)
    );
    expect(batchTxCall).toBeDefined();
    expect(tableSpy).toHaveBeenCalledWith('invoices');
    expect(tableSpy).toHaveBeenCalledWith('payments');

    const storedInvoices = await testDb.invoices.toArray();
    const storedPayments = await testDb.payments.toArray();
    expect(storedInvoices).toHaveLength(1);
    expect(storedPayments).toHaveLength(1);
    expect(storedInvoices[0].id).toBe(invoice.id);
    expect(storedPayments[0].invoiceId).toBe(invoice.id);
  });

  it('A4: verifies recovery key SHA-256 group spot-check, quarterly cadence, and isolated sandbox backup verification', async () => {
    const { testDb, dek, kek, recoveryKeyFormatted } = await setupVaultWithRecoveryKey(10);
    await seedMinimalPatient(testDb, dek, 'pat-drill-1', {
      fullName: 'أحمد العزاوي',
      fullNameAr: 'أحمد العزاوي',
      gender: 'male',
      phone: '07801112233',
    });

    const meta = (await testDb.vaultMeta.get('auth'))!;
    expect(isQuarterlyRecoveryDrillDue(meta)).toBe(true);

    const groups = recoveryKeyFormatted.split('-');
    expect(groups.length).toBeGreaterThanOrEqual(4);
    expect(await verifyRecoveryKeyGroup(meta, 2, groups[2].toLowerCase())).toBe(true);
    expect(await verifyRecoveryKeyGroup(meta, 2, 'AAAA')).toBe(false);
    expect(await verifyRecoveryKeyGroup(meta, 99, groups[0])).toBe(false);

    const backupJson = await exportBackupPackage(testDb, meta, kek, 'DrillPass#2026!');
    const liveVaultBefore = await testDb.vaultMeta.get('auth');

    const sandboxResult = await verifyBackupInSandboxDb(backupJson, 'DrillPass#2026!', {
      databaseFactory: () => createInMemoryDatabase(10),
    });

    expect(sandboxResult.ok).toBe(true);
    expect(sandboxResult.patientCount).toBe(1);
    expect(sandboxResult.sampleDecryptedCount).toBeGreaterThanOrEqual(1);

    // Live vault must remain completely untouched (same generation & key digests)
    const liveVaultAfter = await testDb.vaultMeta.get('auth');
    expect(liveVaultAfter?.vaultGeneration).toBe(liveVaultBefore?.vaultGeneration);

    await recordRecoveryDrillSuccess(testDb, '2026-11-14T00:00:00.000Z');
    const updatedMeta = await testDb.vaultMeta.get('auth');
    expect(
      isQuarterlyRecoveryDrillDue(updatedMeta, Date.parse('2026-11-20T00:00:00.000Z'))
    ).toBe(false);
    expect(
      isQuarterlyRecoveryDrillDue(updatedMeta, Date.parse('2027-03-01T00:00:00.000Z'))
    ).toBe(true);
  });

  it('A3.1: detects low-end hardware and defers heavy cold stores at startup while preserving audit hash chaining', async () => {
    vi.stubGlobal('navigator', { deviceMemory: 4, hardwareConcurrency: 4 });
    expect(detectLowEndHardware()).toBe(true);
    expect(resolveReducedEffectsEnabled('auto')).toBe(true);
    expect(resolveReducedEffectsEnabled('off')).toBe(false);

    vi.stubGlobal('navigator', { deviceMemory: 16, hardwareConcurrency: 8 });
    expect(detectLowEndHardware()).toBe(false);
    expect(resolveReducedEffectsEnabled('auto')).toBe(false);
    expect(resolveReducedEffectsEnabled('on')).toBe(true);

    const { testDb, dek } = await setupVaultWithRecoveryKey(10);

    // Seed an existing chained audit entry, episodeClinical, and patient attachment directly in Dexie
    const genesisEntryBase: Omit<AuditLogEntry, 'entryHash'> = {
      id: 'aud-seed-1',
      timestamp: '2026-11-01T09:00:00.000Z',
      actorName: 'Dr. Ali',
      actorRole: 'senior_pt',
      actionType: 'backup_verified',
      entityType: 'security',
      entityId: 'seed-1',
      summaryAr: 'بداية سجل التدقيق',
      summaryEn: 'Audit chain genesis',
      sequence: 1,
      prevHash: 'GENESIS',
    };
    const genesisEntry: AuditLogEntry = {
      ...genesisEntryBase,
      entryHash: await computeAuditEntryHash(genesisEntryBase),
    };
    const encAudit = await encryptRecordWithMandatoryReservation(
      testDb,
      dek,
      'auditLogs',
      genesisEntry.id,
      [],
      genesisEntry
    );
    await testDb.auditLogs.put({
      id: genesisEntry.id,
      createdAt: genesisEntry.timestamp,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: encAudit.recordSalt,
      iv: encAudit.iv,
      ciphertext: encAudit.ciphertext,
    });

    const epClinical: EpisodeScopedClinicalStore = {
      episodeId: 'ep-lazy-1',
      patientId: 'pat-lazy-1',
      activeWidgetIds: [],
      chiefComplaint: 'Lazy loaded cervical findings',
      historyOfPresentIllness: '',
      mechanismOfInjury: '',
      painAtRestNrs: 0,
      painOnActivityNrs: 0,
      painWorst24hNrs: 0,
      painNature: '',
      aggravatingFactors: '',
      relievingFactors: '',
      functionalLimitations: '',
      patientPersonalGoals: '',
      observationPosture: '',
      palpationFindings: '',
      circumferenceEdemaNotes: '',
      treatmentFrequency: '3x/week',
      plannedDurationWeeks: 4,
      clinicalImpression: 'Mechanical neck pain',
      objective: {},
      specialTests: [],
      customWidgetsData: {},
      snapshots: [],
      hepProgram: [],
      updatedAt: '2026-11-01T10:00:00.000Z',
    };
    const encEpClinical = await encryptRecordWithMandatoryReservation(
      testDb,
      dek,
      'episodeClinical',
      epClinical.episodeId,
      [epClinical.episodeId],
      epClinical
    );
    await testDb.episodeClinical.put({
      id: epClinical.episodeId,
      episodeId: epClinical.episodeId,
      patientId: epClinical.patientId,
      createdAt: epClinical.updatedAt,
      updatedAt: epClinical.updatedAt,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: encEpClinical.recordSalt,
      iv: encEpClinical.iv,
      ciphertext: encEpClinical.ciphertext,
    });

    // 1. Unlock with lazyHeavyStores: true -> cold stores stay unloaded initially
    await ClinicOperationsService.hydrateEncryptedCache(dek, testDb, { lazyHeavyStores: true });

    expect(ClinicOperationsService.isColdStoreLoaded('auditLogs')).toBe(false);
    expect(ClinicOperationsService.isColdStoreLoaded('attachments')).toBe(false);
    expect(ClinicOperationsService.isColdStoreLoaded('episodeClinical')).toBe(false);
    expect(ClinicOperationsService.isPatientColdStoresLoaded('pat-lazy-1')).toBe(false);
    expect(ClinicOperationsService.getAuditLogs()).toHaveLength(0);

    // 2. On-demand patient cold store hydration decrypts that patient's episodeClinical without loading unrelated stores
    await ClinicOperationsService.ensurePatientColdStoresLoadedAsync('pat-lazy-1', ['ep-lazy-1']);
    expect(ClinicOperationsService.isPatientColdStoresLoaded('pat-lazy-1')).toBe(true);
    expect(
      ClinicOperationsService.getEpisodeClinicalStore('ep-lazy-1', 'pat-lazy-1').chiefComplaint
    ).toBe('Lazy loaded cervical findings');

    // 3. Appending an audit event while auditLogs was lazy automatically loads auditLogs first & preserves SHA-256 chain
    ClinicOperationsService.appendAuditLog({
      actionType: 'patient_updated',
      entityType: 'patient',
      entityId: 'pat-lazy-1',
      patientId: 'pat-lazy-1',
      summaryAr: 'فتح ملف المريض',
      summaryEn: 'Opened patient chart',
    });
    await ClinicOperationsService.flushPendingWrites();

    expect(ClinicOperationsService.isColdStoreLoaded('auditLogs')).toBe(true);
    const logs = ClinicOperationsService.getAuditLogs();
    expect(logs).toHaveLength(2);
    const integrity = await ClinicOperationsService.verifyAuditChain();
    expect(integrity.valid).toBe(true);
  });

  it('A3.2: PatientListCard strips heavy blobs in memory while loadFullPatientRecordFromDb recovers them + virtualizes >100 rows', async () => {
    const { testDb, dek } = await setupVaultWithRecoveryKey(10);
    const longMedicalHistory = 'H'.repeat(900);

    const fullPayload: PatientClinicalData = {
      fullName: 'نور الهدى صباح',
      fullNameAr: 'نور الهدى صباح',
      gender: 'female',
      phone: '07719998877',
      medicalHistory: longMedicalHistory,
      attachments: [
        {
          id: 'att-mri-1',
          title: 'Lumbar MRI Report',
          fileName: 'lumbar-mri.jpg',
          category: 'imaging_mri_xray',
          dateAdded: '2026-11-10',
          summaryNotes: 'L4-L5 disc bulge with mild nerve root contact',
          attachmentRecordId: 'att-blob-1',
        },
      ],
    };

    await seedMinimalPatient(testDb, dek, 'pat-heavy-1', fullPayload);

    const fullRecord: PatientRecord = {
      id: 'pat-heavy-1',
      createdAt: '2026-11-10T12:00:00.000Z',
      updatedAt: '2026-11-10T12:00:00.000Z',
      isArchived: 0,
      data: fullPayload,
    };

    const card = toPatientListCardRecord(fullRecord);
    expect(card.isSummaryOnly).toBe(true);
    expect(card.data.attachmentsCount).toBe(1);
    expect(card.data.attachments).toBeUndefined();
    expect((card.data.medicalHistory || '').length).toBeLessThan(longMedicalHistory.length);

    const hydrated = await loadFullPatientRecordFromDb('pat-heavy-1', dek, testDb);
    expect(hydrated).not.toBeNull();
    expect(hydrated?.isSummaryOnly).toBe(false);
    expect(hydrated?.data.attachments).toHaveLength(1);
    expect(hydrated?.data.attachments?.[0].summaryNotes).toBe(
      'L4-L5 disc bulge with mild nerve root contact'
    );
    expect(hydrated?.data.medicalHistory).toBe(longMedicalHistory);

    // Virtual window: inactive at <= 100 rows, O(visible) slice above 100 rows
    const smallBounds = computeVirtualWindowBounds({
      totalCount: VIRTUALIZATION_THRESHOLD,
      estimatedRowHeightPx: 60,
      columns: 1,
      overscanRows: 4,
      scrollTop: 0,
      viewportHeightPx: 600,
      threshold: VIRTUALIZATION_THRESHOLD,
    });
    expect(smallBounds.isVirtualized).toBe(false);
    expect(smallBounds.startIndex).toBe(0);
    expect(smallBounds.endIndex).toBe(VIRTUALIZATION_THRESHOLD);

    const largeBounds = computeVirtualWindowBounds({
      totalCount: 500,
      estimatedRowHeightPx: 60,
      columns: 1,
      overscanRows: 3,
      scrollTop: 1200,
      viewportHeightPx: 600,
      threshold: VIRTUALIZATION_THRESHOLD,
    });
    expect(largeBounds.isVirtualized).toBe(true);
    expect(largeBounds.endIndex - largeBounds.startIndex).toBeLessThan(30);
    expect(largeBounds.topSpacerPx).toBeGreaterThan(0);
    expect(largeBounds.bottomSpacerPx).toBeGreaterThan(0);
  });
});
