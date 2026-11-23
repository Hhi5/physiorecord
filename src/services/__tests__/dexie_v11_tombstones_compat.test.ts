import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInMemoryDatabase } from '../../crypto/__tests__/testDbHelper';
import { CURRENT_DEXIE_SCHEMA_VERSION, type PhysioRecordDatabase } from '../../db/db';
import { CLINICAL_STORES_REGISTRY } from '../../db/registry';
import {
  CONSTANTS,
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  bindDekToGeneration,
  deriveKEK,
  encryptRecordWithMandatoryReservation,
  generateAndWrapOperationalDEK,
  generateVerifier,
  randomBytes,
} from '../../crypto/vault';
import { exportBackupPackage, restoreBackupPackage } from '../../crypto/backup';
import { EpisodeService } from '../episodeService';
import { SessionService } from '../sessionService';
import { SoapService } from '../soapService';
import { ClinicOperationsService } from '../clinicOperationsService';
import { getAllDeletionTombstones } from '../deletionTombstoneService';
import {
  collectLocalClinicSyncPayload,
  importAndMergeEncryptedSyncFile,
} from '../clinicSyncService';
import {
  PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS,
  encryptSyncEnvelope,
  mergeClinicSyncPayloads,
} from '../../utils/clinicSyncEngine';
import {
  detectDexieSchemaDowngradeError,
  inspectOpenedDatabaseSchemaDowngrade,
} from '../../platform/nativeBridge';
import type { PatientClinicalData } from '../../types/clinical';

async function setupVaultDb(verno = CURRENT_DEXIE_SCHEMA_VERSION) {
  const testDb = createInMemoryDatabase(verno);
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK('V11CompatVault#2026', salt, 1000);
  const { operationalDek, wrappedDek, wrappedDekIv } = await generateAndWrapOperationalDEK(kek, 1);
  const { verifierIv, verifierCiphertext } = await generateVerifier(kek);

  const meta = {
    id: 'auth' as const,
    salt,
    wrappedDek,
    wrappedDekIv,
    verifierIv,
    verifierCiphertext,
    schemaVersion: testDb.verno,
    kdfAlgorithm: 'PBKDF2-HMAC-SHA256' as const,
    kdfIterations: 1000,
    dekVersion: CURRENT_DEK_VERSION,
    encryptionInvocationCount: 0,
    vaultGeneration: 1,
  };
  await testDb.vaultMeta.put(meta);
  bindDekToGeneration(operationalDek, 1);
  return { testDb, kek, dek: operationalDek, meta };
}

async function seedPatientWithFinalizedSession(
  testDb: PhysioRecordDatabase,
  dek: CryptoKey,
  ids: { patientId: string; episodeId: string; sessionId: string }
) {
  const now = '2026-11-20T09:00:00.000Z';
  const patientData: PatientClinicalData = {
    fullName: 'حيدر كريم',
    fullNameAr: 'حيدر كريم',
    gender: 'male',
    phone: '07701234567',
    phoneNumber: '07701234567',
    medicalHistory: 'No significant PMH',
    redFlags: 'None',
  };
  const encPat = await encryptRecordWithMandatoryReservation(
    testDb,
    dek,
    'patients',
    ids.patientId,
    [],
    patientData,
    CURRENT_RECORD_CRYPTO_VERSION,
    CURRENT_DEK_VERSION
  );
  await testDb.patients.put({
    id: ids.patientId,
    createdAt: now,
    updatedAt: now,
    isArchived: 0,
    recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
    dekVersion: CURRENT_DEK_VERSION,
    recordSalt: encPat.recordSalt,
    iv: encPat.iv,
    ciphertext: encPat.ciphertext,
  });

  await EpisodeService.createEpisode(
    ids.patientId,
    {
      title: 'تأهيل أسفل الظهر',
      primarySpecialty: 'musculoskeletal',
      medicalDiagnosis: 'Lumbar disc bulge',
      clinicalImpression: 'L4-L5 radiculopathy',
      affectedBodyRegion: 'Low Back',
      startDate: '2026-11-20',
      rehabilitationGoals: { shortTerm: ['Reduce pain'], longTerm: ['Full ADL'] },
    },
    dek,
    ids.episodeId,
    testDb
  );

  const session = await SessionService.createSession(
    ids.patientId,
    ids.episodeId,
    {
      sessionDate: '2026-11-20',
      sessionType: 'follow_up',
      attendanceStatus: 'attended',
    },
    dek,
    ids.sessionId,
    testDb
  );

  await SoapService.createSoapNote(
    ids.patientId,
    ids.episodeId,
    session.id,
    {
      subjective: { chiefComplaint: 'ألم خفيف' },
      objective: { objectiveFindings: 'مدى حركي جيد' },
      assessment: { clinicalImpressionCurrent: 'تحسن تدريجي' },
      plan: { nextSessionPlan: 'متابعة التمارين' },
    },
    dek,
    `soap-${session.id}`,
    testDb
  );

  await SessionService.finalizeSession(
    session.id,
    'د. حيدر التميمي',
    dek,
    testDb,
    undefined,
    undefined,
    false,
    { allowIncompleteSoap: true }
  );
  return session;
}

describe('Dexie v11 Compatibility, Downgrade Guard & Deletion Tombstones', () => {
  let prevLocalStorage: unknown;

  beforeEach(() => {
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
  });

  afterEach(() => {
    ClinicOperationsService.clearInMemoryCache();
    if (prevLocalStorage === undefined) {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
    }
  });

  it('registers deletionTombstones in CLINICAL_STORES_REGISTRY and upgrades cleanly from v10 -> v11', async () => {
    expect(CLINICAL_STORES_REGISTRY.deletionTombstones).toBeDefined();

    const { testDb, dek } = await setupVaultDb(10);
    expect(testDb.verno).toBe(10);

    await seedPatientWithFinalizedSession(testDb, dek, {
      patientId: 'pat-v10-1',
      episodeId: 'ep-v10-1',
      sessionId: 'sess-v10-1',
    });

    // Upgrade non-destructively from v10 -> v11
    testDb.upgradeToVersion(11);
    expect(testDb.verno).toBe(11);
    expect(testDb.getDeclaredIndexesForStore('deletionTombstones')).toEqual([
      'id',
      'storeName',
      'recordId',
      'deletedAt',
    ]);

    // Pre-existing v10 session survives v10 -> v11 upgrade intact
    const reloaded = await SessionService.getSessionById('sess-v10-1', dek, testDb);
    expect(reloaded?.status).toBe('finalized');
  });

  it('detects both deeply nested thrown VersionError AND Dexie 4 silent-open downgrade via backendDB.version', () => {
    // 1. Deeply nested Dexie error chain (DatabaseClosedError -> OpenFailedError -> VersionError)
    const nestedErr = {
      name: 'DatabaseClosedError',
      message: 'Database has been closed',
      inner: {
        name: 'OpenFailedError',
        message: 'Failed to open DB',
        cause: {
          name: 'VersionError',
          message: 'The requested version (100) is less than the existing version (110).',
        },
      },
    };
    const thrownResult = detectDexieSchemaDowngradeError(nestedErr);
    expect(thrownResult?.isDowngrade).toBe(true);
    expect(thrownResult?.onDiskVersion).toBe(11);
    expect(thrownResult?.supportedVersion).toBe(10);

    // 2. Dexie 4 silent-open scenario: NO error thrown, db.verno reports 10, backendDB().version is 110
    const silentBackendDowngrade = inspectOpenedDatabaseSchemaDowngrade({
      backendVersionRaw: 110,
      vaultMetaSchemaVersion: 11,
      declaredMaxVersion: 10,
      backendStoreNames: ['patients', 'vaultMeta', 'deletionTombstones'],
      declaredStoreNames: ['patients', 'vaultMeta'],
    });
    expect(silentBackendDowngrade?.isDowngrade).toBe(true);
    expect(silentBackendDowngrade?.detectionSource).toBe('backend_db_version');
    expect(silentBackendDowngrade?.onDiskVersion).toBe(11);
    expect(silentBackendDowngrade?.supportedVersion).toBe(10);
    expect(silentBackendDowngrade?.message).toContain('deletionTombstones');

    // 3. Matching v11 DB on v11 binary returns null (safe to proceed)
    const okResult = inspectOpenedDatabaseSchemaDowngrade({
      backendVersionRaw: 110,
      vaultMetaSchemaVersion: 11,
      declaredMaxVersion: 11,
      backendStoreNames: ['patients', 'vaultMeta', 'deletionTombstones'],
      declaredStoreNames: ['patients', 'vaultMeta', 'deletionTombstones'],
    });
    expect(okResult).toBeNull();
  });

  it('preserves deletionTombstones across backup export/restore and prevents resurrection when merging legacy pre-v11 backups', async () => {
    const { testDb, kek, dek, meta } = await setupVaultDb(11);
    await seedPatientWithFinalizedSession(testDb, dek, {
      patientId: 'pat-bkp-1',
      episodeId: 'ep-bkp-1',
      sessionId: 'sess-bkp-del',
    });

    // Export an OLD backup BEFORE deleting the session (simulating a legacy backup still containing sess-bkp-del)
    const preDeleteBackup = await exportBackupPackage(testDb, meta, kek, 'BackupPass#2026');

    // Deliberately delete the finalized session -> creates encrypted deletionTombstones
    await SessionService.deleteFinalizedSession('sess-bkp-del', dek, testDb);
    const tombstonesAfterDelete = await getAllDeletionTombstones(dek, testDb);
    expect(tombstonesAfterDelete.some((t) => t.storeName === 'sessions' && t.recordId === 'sess-bkp-del')).toBe(
      true
    );
    expect(tombstonesAfterDelete.some((t) => t.storeName === 'soapNotes')).toBe(true);

    // Export a v11 backup AFTER deletion -> MUST include deletionTombstones
    const postDeleteMeta = (await testDb.vaultMeta.get('auth'))!;
    const postDeleteBackup = await exportBackupPackage(
      testDb,
      postDeleteMeta,
      kek,
      'BackupPass#2026'
    );

    // Scenario A: Replace-restore postDeleteBackup into a fresh DB -> tombstones preserved!
    const freshDb = createInMemoryDatabase(11);
    const replaceSummary = await restoreBackupPackage(
      postDeleteBackup,
      'BackupPass#2026',
      'FreshVaultPass#2026',
      freshDb,
      { mode: 'replace', sandboxVerification: true }
    );
    expect(replaceSummary.sessionCount).toBe(0);
    expect(replaceSummary.countsByStore.deletionTombstones).toBeGreaterThanOrEqual(2);
    const restoredTombstones = await getAllDeletionTombstones(
      replaceSummary.destinationOperationalDek,
      freshDb
    );
    expect(
      restoredTombstones.some((t) => t.storeName === 'sessions' && t.recordId === 'sess-bkp-del')
    ).toBe(true);

    // Scenario B: Merge OLD preDeleteBackup (which still contains sess-bkp-del and no tombstones)
    // into `freshDb` -> sess-bkp-del & its SOAP note MUST NOT resurrect!
    const mergeOldSummary = await restoreBackupPackage(
      preDeleteBackup,
      'BackupPass#2026',
      'MergedVaultPass#2026',
      freshDb,
      {
        mode: 'merge',
        existingLocalDek: replaceSummary.destinationOperationalDek,
        sandboxVerification: true,
      }
    );
    expect(mergeOldSummary.sessionCount).toBe(0);
    expect(mergeOldSummary.soapCount).toBe(0);
    expect(mergeOldSummary.countsByStore.deletionTombstones).toBeGreaterThanOrEqual(2);
    expect(
      mergeOldSummary.conflicts.some(
        (c) => c.storeName === 'sessions' && c.recordId === 'sess-bkp-del' && c.resolution === 'skipped_deleted'
      )
    ).toBe(true);
  });

  it('prevents resurrection and propagates explicit deletions across 2-device clinic sync', async () => {
    // Device A & Device B both start with the same patient, episode, and finalized session
    const devA = await setupVaultDb(11);
    await ClinicOperationsService.hydrateEncryptedCache(devA.dek, devA.testDb);
    await seedPatientWithFinalizedSession(devA.testDb, devA.dek, {
      patientId: 'pat-sync-1',
      episodeId: 'ep-sync-1',
      sessionId: 'sess-sync-del',
    });

    const devB = await setupVaultDb(11);
    await ClinicOperationsService.hydrateEncryptedCache(devB.dek, devB.testDb);
    await seedPatientWithFinalizedSession(devB.testDb, devB.dek, {
      patientId: 'pat-sync-1',
      episodeId: 'ep-sync-1',
      sessionId: 'sess-sync-del',
    });

    // Capture Device B's stale payload BEFORE deletion
    const devBPayloadBefore = await collectLocalClinicSyncPayload(devB.dek, devB.testDb);
    expect(devBPayloadBefore.sessions).toHaveLength(1);
    expect(devBPayloadBefore.soapNotes).toHaveLength(1);

    // Device A explicitly deletes the finalized session -> creates tombstones
    await SessionService.deleteFinalizedSession('sess-sync-del', devA.dek, devA.testDb);
    const devAPayloadAfterDelete = await collectLocalClinicSyncPayload(devA.dek, devA.testDb);
    expect(devAPayloadAfterDelete.sessions).toHaveLength(0);
    expect(devAPayloadAfterDelete.deletionTombstones?.length).toBeGreaterThanOrEqual(2);

    // 1. Device A merges Device B's stale envelope -> deleted session MUST NOT resurrect on Device A!
    const devBEnvelope = await encryptSyncEnvelope(
      { ...devBPayloadBefore, deviceId: 'dev_b_peer' },
      'SharedClinicPass#2026',
      PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS
    );
    await importAndMergeEncryptedSyncFile(
      JSON.stringify(devBEnvelope),
      devA.dek,
      'SharedClinicPass#2026',
      devA.testDb
    );
    expect(await devA.testDb.sessions.get('sess-sync-del')).toBeUndefined();
    expect(await devA.testDb.soapNotes.toArray()).toHaveLength(0);

    // 2. Device B merges Device A's envelope (with tombstones) -> session IS deleted on Device B
    //    AND tombstones are persisted on Device B!
    const devAEnvelope = await encryptSyncEnvelope(
      { ...devAPayloadAfterDelete, deviceId: 'dev_a_peer' },
      'SharedClinicPass#2026',
      PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS
    );
    const mergeOnB = await importAndMergeEncryptedSyncFile(
      JSON.stringify(devAEnvelope),
      devB.dek,
      'SharedClinicPass#2026',
      devB.testDb
    );
    expect(mergeOnB.ok).toBe(true);
    expect(mergeOnB.stats?.recordsDeletedByTombstones).toBeGreaterThanOrEqual(2);
    expect(await devB.testDb.sessions.get('sess-sync-del')).toBeUndefined();
    expect(await devB.testDb.soapNotes.toArray()).toHaveLength(0);
    const devBTombstones = await getAllDeletionTombstones(devB.dek, devB.testDb);
    expect(
      devBTombstones.some((t) => t.storeName === 'sessions' && t.recordId === 'sess-sync-del')
    ).toBe(true);

    // 3. Ordinary absence without a tombstone STILL never deletes unrelated local records
    const pureMerge = mergeClinicSyncPayloads(
      {
        ...devBPayloadBefore,
        deviceId: 'dev_local',
        deletionTombstones: [],
      },
      [
        {
          ...devBPayloadBefore,
          deviceId: 'dev_empty_peer',
          patients: [],
          episodes: [],
          sessions: [],
          soapNotes: [],
          deletionTombstones: [],
        },
      ]
    );
    expect(pureMerge.merged.patients).toHaveLength(1);
    expect(pureMerge.merged.sessions).toHaveLength(1);
  });
});
