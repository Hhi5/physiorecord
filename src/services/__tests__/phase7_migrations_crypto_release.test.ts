// =======================================================================
// PhysioRecord — Phase 7: Exhaustive Migration Chain, Crypto & Release Tests
// Covers:
//   7.1 Full Dexie schema evolution matrix v1 -> v2 -> v3 -> v4 -> v5 -> v6 -> v7 -> v8 -> v9
//       + downgrade guard + cascade delete + store registry parity
//   7.2 Crypto engine completeness: WebAuthn PRF enroll/unlock/disable, CryptoWorkerClient
//       main-thread fallback + gzip compression, Emergency Recovery snapshot roundtrip
//   7.3 V3.0 full-v9 encrypted .ptbackup export/verify/tamper/replace/merge
//   7.4 Attribution & license policy invariants (GPL-3.0 Niema-Lab/PhysioMeter + package.json)
// =======================================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createInMemoryDatabase } from '../../crypto/__tests__/testDbHelper';
import { PhysioRecordDatabase } from '../../db/db';
import { CLINICAL_STORES_REGISTRY, EXCLUDED_DEVICE_STORES } from '../../db/registry';
import {
  CONSTANTS,
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  bindDekToGeneration,
  decryptRecordPayload,
  deriveBackupKeys,
  deriveKEK,
  encryptRecordWithMandatoryReservation,
  generateAndWrapOperationalDEK,
  generateVerifier,
  randomBytes,
  unwrapOperationalDEK,
} from '../../crypto/vault';
import {
  compressBytesGzip,
  decompressBytesGzip,
  deriveBackupKeysWithWorker,
  deriveKEKWithWorker,
} from '../../crypto/cryptoWorkerClient';
import {
  disablePasskeyPrfUnlock,
  enrollPasskeyPrfUnlock,
  isWebAuthnPrfSupported,
  unlockOperationalDekWithPrf,
} from '../../crypto/webauthnPrf';
import {
  exportBackupPackage,
  restoreBackupPackage,
  verifyBackupPackage,
  type ExportedBackupPackage,
} from '../../crypto/backup';
import {
  createDurablePreRestoreRecoveryBackup,
  recoveryDb,
  restoreFromEmergencySnapshot,
  type EmergencyRecoverySnapshotEntity,
} from '../../crypto/recovery';
import { ClinicOperationsService } from '../clinicOperationsService';
import { CONSENT_TEMPLATES } from '../../data/consentTemplates';
import type { PatientClinicalData } from '../../types/clinical';

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function setupVaultAtVerno(verno: number) {
  const testDb = createInMemoryDatabase(verno);
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK('Phase7ReleasePass#2026', salt, 1000);
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

  bindDekToGeneration(operationalDek, 1);
  return { testDb, dek: operationalDek, kek };
}

async function seedPatient(
  testDb: ReturnType<typeof createInMemoryDatabase>,
  dek: CryptoKey,
  patientId: string,
  fullName: string
) {
  const now = new Date().toISOString();
  const payload: PatientClinicalData = {
    fullName,
    fullNameAr: fullName,
    gender: 'male',
    phone: '07701234567',
    phoneNumber: '07701234567',
  };
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

describe('Phase 7 — Migrations (v1–v9), Crypto Completeness & Release Integrity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('7.1: traverses every Dexie schema version upgrade step v1 -> v2 -> ... -> v9 without data loss and blocks downgrades', async () => {
    const { testDb, dek } = await setupVaultAtVerno(1);
    const nowIso = new Date().toISOString();

    // v1 baseline: core stores exist, patients already indexes isArchived, while v3+ tables do not exist yet
    expect(testDb.verno).toBe(1);
    expect(testDb.getDeclaredIndexesForStore('patients')).toEqual([
      'id',
      'createdAt',
      'updatedAt',
      'isArchived',
    ]);
    expect(testDb.getDeclaredIndexesForStore('clinicalAddenda')).toEqual([]);
    expect(testDb.getDeclaredIndexesForStore('episodeSequences')).toEqual([]);
    expect(() => testDb.clinicalAddenda.where('patientId')).toThrow(/SchemaError/);

    await seedPatient(testDb, dek, 'pat-mig-1', 'سعدون الجبوري');

    // v1 -> v2: upgrade path + patients archive/unarchive lifecycle
    testDb.upgradeToVersion(2);
    expect(testDb.verno).toBe(2);
    expect(testDb.getDeclaredIndexesForStore('patients')).toContain('isArchived');
    await testDb.archivePatient('pat-mig-1');
    expect((await testDb.patients.get('pat-mig-1'))?.isArchived).toBe(1);
    await testDb.unarchivePatient('pat-mig-1');
    expect((await testDb.patients.get('pat-mig-1'))?.isArchived).toBe(0);

    // Downgrade prevention
    expect(() => testDb.upgradeToVersion(1)).toThrow(/Cannot downgrade/);

    // v2 -> v3: clinicalAddenda immutable append-only store introduced
    testDb.upgradeToVersion(3);
    expect(testDb.verno).toBe(3);
    expect(testDb.getDeclaredIndexesForStore('clinicalAddenda')).toEqual([
      'id',
      'sessionId',
      'patientId',
      'targetId',
      'createdAt',
    ]);
    expect(testDb.getDeclaredIndexesForStore('episodeSequences')).toEqual([]);

    // v3 -> v4: episodeSequences store added
    testDb.upgradeToVersion(4);
    expect(testDb.verno).toBe(4);
    expect(testDb.getDeclaredIndexesForStore('episodeSequences')).toEqual(['episodeId']);
    expect(testDb.getDeclaredIndexesForStore('episodeClinical')).toEqual([]);

    // v4 -> v5: Phase 1A operational/clinical stores + migrationState + unique episodeClinical.episodeId
    testDb.upgradeToVersion(5);
    expect(testDb.verno).toBe(5);
    for (const storeName of [
      'appointments',
      'waitingList',
      'invoices',
      'payments',
      'expenses',
      'auditLogs',
      'staffState',
      'episodeClinical',
      'migrationState',
    ]) {
      expect(testDb.getDeclaredIndexesForStore(storeName).length).toBeGreaterThan(0);
    }

    const dummyEnc = await encryptRecordWithMandatoryReservation(
      testDb,
      dek,
      'episodeClinical',
      'epc-1',
      ['ep-mig-1'],
      { ok: true }
    );
    await testDb.episodeClinical.put({
      id: 'epc-1',
      episodeId: 'ep-mig-1',
      patientId: 'pat-mig-1',
      createdAt: nowIso,
      updatedAt: nowIso,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: dummyEnc.recordSalt,
      iv: dummyEnc.iv,
      ciphertext: dummyEnc.ciphertext,
    });
    await expect(
      testDb.episodeClinical.put({
        id: 'epc-duplicate-id',
        episodeId: 'ep-mig-1',
        patientId: 'pat-mig-1',
        createdAt: nowIso,
        updatedAt: nowIso,
        recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
        dekVersion: CURRENT_DEK_VERSION,
        recordSalt: dummyEnc.recordSalt,
        iv: dummyEnc.iv,
        ciphertext: dummyEnc.ciphertext,
      })
    ).rejects.toThrow(/ConstraintError/);

    // v5 -> v6: waitingList.patientId + auditLogs.{patientId, episodeId} indexes added
    testDb.upgradeToVersion(6);
    expect(testDb.verno).toBe(6);
    expect(testDb.getDeclaredIndexesForStore('waitingList')).toContain('patientId');
    expect(testDb.getDeclaredIndexesForStore('auditLogs')).toEqual([
      'id',
      'patientId',
      'episodeId',
      'createdAt',
    ]);

    // v6 -> v7: custom/clinic ops tables including patientMedications & fsHandles
    testDb.upgradeToVersion(7);
    expect(testDb.verno).toBe(7);
    for (const storeName of [
      'customWidgets',
      'migrationReports',
      'recurringSchedules',
      'recurringSkippedDates',
      'clinicSettings',
      'patientMedications',
      'fsHandles',
    ]) {
      expect(testDb.getDeclaredIndexesForStore(storeName).length).toBeGreaterThan(0);
    }
    expect(testDb.getDeclaredIndexesForStore('patientMedications')).toEqual([
      'id',
      'patientId',
      'createdAt',
      'updatedAt',
    ]);
    expect(testDb.getDeclaredIndexesForStore('fsHandles')).toEqual(['id', 'updatedAt']);

    // v7 -> v8: consents & cashCloses added
    testDb.upgradeToVersion(8);
    expect(testDb.verno).toBe(8);
    expect(testDb.getDeclaredIndexesForStore('consents')).toEqual([
      'id',
      'patientId',
      'episodeId',
      'createdAt',
      'updatedAt',
    ]);
    expect(testDb.getDeclaredIndexesForStore('cashCloses')).toEqual([
      'id',
      'dateKey',
      'createdAt',
      'updatedAt',
    ]);

    // v8 -> v9: attachments & noteTemplates added
    testDb.upgradeToVersion(9);
    expect(testDb.verno).toBe(9);
    expect(testDb.getDeclaredIndexesForStore('attachments')).toEqual([
      'id',
      'patientId',
      'episodeId',
      'category',
      'createdAt',
      'updatedAt',
    ]);
    expect(testDb.getDeclaredIndexesForStore('noteTemplates')).toEqual([
      'id',
      'category',
      'createdAt',
      'updatedAt',
    ]);

    // v9 -> v10: encrypted power-cut draft recovery buffer added
    testDb.upgradeToVersion(10);
    expect(testDb.verno).toBe(10);
    expect(testDb.getDeclaredIndexesForStore('drafts')).toEqual([
      'id',
      'draftType',
      'entityId',
      'patientId',
      'updatedAt',
    ]);

    // v10 -> v11: encrypted deletionTombstones added (portable store)
    testDb.upgradeToVersion(11);
    expect(testDb.verno).toBe(11);
    expect(testDb.getDeclaredIndexesForStore('deletionTombstones')).toEqual([
      'id',
      'storeName',
      'recordId',
      'deletedAt',
    ]);

    // Original v1 patient survived all 10 sequential upgrades and still decrypts cleanly
    const rawPatient = await testDb.patients.get('pat-mig-1');
    expect(rawPatient).toBeDefined();
    const decrypted = await decryptRecordPayload<PatientClinicalData>(
      dek,
      'patients',
      'pat-mig-1',
      [],
      rawPatient!.iv,
      rawPatient!.ciphertext,
      rawPatient!.recordCryptoVersion,
      rawPatient!.dekVersion,
      rawPatient!.recordSalt
    );
    expect(decrypted.fullName).toBe('سعدون الجبوري');

    // Verify PhysioRecordDatabase v11 declared stores match CLINICAL_STORES_REGISTRY U EXCLUDED_DEVICE_STORES 1:1
    const realInspectorDb = new PhysioRecordDatabase('__phase7_registry_parity');
    const versions = (
      realInspectorDb as unknown as {
        _versions?: Array<{ _cfg?: { version?: number; storesSource?: Record<string, string | null> } }>;
      }
    )._versions || [];
    const maxVerno = Math.max(...versions.map((v) => v._cfg?.version || 0));
    expect(maxVerno).toBe(11);

    const declaredV11Stores = new Set<string>();
    for (const v of [...versions].sort((a, b) => (a._cfg?.version || 0) - (b._cfg?.version || 0))) {
      for (const [k, spec] of Object.entries(v._cfg?.storesSource || {})) {
        if (spec === null) declaredV11Stores.delete(k);
        else declaredV11Stores.add(k);
      }
    }

    const registryNames = new Set(Object.keys(CLINICAL_STORES_REGISTRY));
    const excludedNames = new Set(EXCLUDED_DEVICE_STORES);

    for (const name of registryNames) {
      expect(excludedNames.has(name)).toBe(false);
    }
    const union = new Set([...registryNames, ...excludedNames]);
    expect(union.size).toBe(29);
    expect(union).toEqual(declaredV11Stores);
  });

  it('7.2: covers WebAuthn PRF enroll/unlock/disable, tampering rejection, Worker PBKDF2 fallback & gzip roundtrip', async () => {
    const { testDb, dek } = await setupVaultAtVerno(9);
    await seedPatient(testDb, dek, 'pat-prf-1', 'فاطمة حسن');

    // Without window/navigator credentials, feature detection returns false cleanly
    expect(await isWebAuthnPrfSupported()).toBe(false);

    // Mock WebAuthn PRF platform authenticator
    const credRawId = randomBytes(16);
    const prfSecret = randomBytes(32);
    let activePrfSecret = prfSecret;

    const fakePublicKeyCred = {
      isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    };
    const fakeCredentials = {
      create: async () => ({
        rawId: credRawId.slice().buffer,
        getClientExtensionResults: () => ({
          prf: { results: { first: activePrfSecret.slice().buffer } },
        }),
      }),
      get: async () => ({
        rawId: credRawId.slice().buffer,
        getClientExtensionResults: () => ({
          prf: { results: { first: activePrfSecret.slice().buffer } },
        }),
      }),
    };

    vi.stubGlobal('window', { PublicKeyCredential: fakePublicKeyCred, location: { hostname: 'localhost' } });
    vi.stubGlobal('navigator', { credentials: fakeCredentials });

    expect(await isWebAuthnPrfSupported()).toBe(true);
    await expect(
      enrollPasskeyPrfUnlock(testDb, await deriveKEK('Phase7ReleasePass#2026', (await testDb.vaultMeta.get('auth'))!.salt, 1000))
    ).resolves.toEqual({ credentialId: credRawId });

    const metaWithPrf = await testDb.vaultMeta.get('auth');
    expect(metaWithPrf?.prfCredentialId).toEqual(credRawId);

    const prfUnlockedDek = await unlockOperationalDekWithPrf(metaWithPrf!);
    bindDekToGeneration(prfUnlockedDek, metaWithPrf!.vaultGeneration ?? 1);
    const encPatient = (await testDb.patients.get('pat-prf-1'))!;
    const decPatient = await decryptRecordPayload<PatientClinicalData>(
      prfUnlockedDek,
      'patients',
      'pat-prf-1',
      [],
      encPatient.iv,
      encPatient.ciphertext,
      encPatient.recordCryptoVersion,
      encPatient.dekVersion,
      encPatient.recordSalt
    );
    expect(decPatient.fullName).toBe('فاطمة حسن');

    // Wrong PRF assertion must fail AES-GCM authentication
    activePrfSecret = randomBytes(32);
    await expect(unlockOperationalDekWithPrf(metaWithPrf!)).rejects.toThrow();

    // Disable passkey PRF leaves password unlock completely intact
    await disablePasskeyPrfUnlock(testDb);
    const metaCleared = await testDb.vaultMeta.get('auth');
    expect(metaCleared?.prfCredentialId).toBeUndefined();
    expect(metaCleared?.prfWrappedDek).toBeUndefined();
    const kek = await deriveKEK('Phase7ReleasePass#2026', metaCleared!.salt, 1000);
    const pwDek = await unwrapOperationalDEK(
      metaCleared!.wrappedDek,
      metaCleared!.wrappedDekIv,
      kek,
      metaCleared!.vaultGeneration ?? 1
    );
    expect(pwDek).toBeDefined();

    vi.unstubAllGlobals();

    // CryptoWorkerClient main-thread fallback + progress & gzip compression roundtrip
    const kekProgress: number[] = [];
    const fallbackKek = await deriveKEKWithWorker('WorkerPass#7', randomBytes(16), 1000, (p) =>
      kekProgress.push(p)
    );
    expect(fallbackKek.type).toBe('secret');
    expect(kekProgress.at(0)).toBe(5);
    expect(kekProgress.at(-1)).toBe(100);

    const bSalt = randomBytes(16);
    const hSalt = randomBytes(32);
    const directBackupKeys = await deriveBackupKeys('BackupKey#7', bSalt, hSalt, 1000);
    const workerBackupKeys = await deriveBackupKeysWithWorker('BackupKey#7', bSalt, hSalt, 1000);
    expect(directBackupKeys.backupDekWrapKey.algorithm).toEqual(workerBackupKeys.backupDekWrapKey.algorithm);
    expect(directBackupKeys.backupPayloadEncKey.algorithm).toEqual(
      workerBackupKeys.backupPayloadEncKey.algorithm
    );

    const samplePayload = new TextEncoder().encode(
      JSON.stringify({ arabic: 'علاج طبيعي متقدم', english: 'PhysioRecord Release', repeated: 'x'.repeat(2000) })
    );
    const gzipped = await compressBytesGzip(samplePayload);
    expect(gzipped.byteLength).toBeLessThan(samplePayload.byteLength);
    const gunzipped = await decompressBytesGzip(gzipped);
    expect(new TextDecoder().decode(gunzipped)).toBe(new TextDecoder().decode(samplePayload));
  });

  it('7.3: exports V3.0 schemaVersion=9 .ptbackup covering v8/v9 stores, rejects tampering & completes durable emergency snapshot recovery', async () => {
    const { testDb, dek, kek } = await setupVaultAtVerno(9);
    await ClinicOperationsService.hydrateEncryptedCache(dek, testDb);
    await seedPatient(testDb, dek, 'pat-v9-bak', 'نور الهدى كريم');

    // Add v8 consent + v9 attachment so full v9 backup coverage is exercised
    const template = CONSENT_TEMPLATES[0];
    await ClinicOperationsService.savePatientConsentAsync({
      patientId: 'pat-v9-bak',
      templateId: template.id,
      templateVersion: template.version,
      titleAr: template.titleAr,
      titleEn: template.titleEn,
      bodySnapshotAr: template.bodyAr,
      bodySnapshotEn: template.bodyEn,
      signerName: 'نور الهدى كريم',
      signerRelation: 'patient',
      signatureDataUrl: VALID_PNG_DATA_URL,
      consentGranted: true,
    });
    await ClinicOperationsService.saveAttachmentAsync({
      patientId: 'pat-v9-bak',
      title: 'Posture Anterior View',
      category: 'posture_before',
      capturedAt: '2026-11-12',
      fileName: 'xray.png',
      mimeType: 'image/png',
      payloadDataUrl: VALID_PNG_DATA_URL,
      thumbnailDataUrl: VALID_PNG_DATA_URL,
      widthPx: 1,
      heightPx: 1,
      originalBytes: 120,
      storedBytes: 120,
    });
    await ClinicOperationsService.flushPendingWrites();

    const meta = (await testDb.vaultMeta.get('auth'))!;
    const backupStr = await exportBackupPackage(testDb, meta, kek, 'ExportStrongPass!9');
    const parsedPkg = JSON.parse(backupStr) as ExportedBackupPackage;
    expect(parsedPkg.header.magic).toBe('PHYSIORECORD_BACKUP_V3.0');
    expect(parsedPkg.header.schemaVersion).toBe(9);

    const verification = await verifyBackupPackage(backupStr, 'ExportStrongPass!9');
    expect(verification.recordCount).toBeGreaterThanOrEqual(3);

    // Tamper 1 byte in chunk ciphertext -> rejected
    const tamperedPkg = JSON.parse(backupStr) as ExportedBackupPackage;
    tamperedPkg.chunks![0].ciphertext[0] ^= 0xff;
    await expect(verifyBackupPackage(JSON.stringify(tamperedPkg), 'ExportStrongPass!9')).rejects.toThrow();

    // Spy recoveryDb in Node (IndexedDB unavailable) and test pre-restore recovery snapshot + restoreFromEmergencySnapshot
    const savedSnapshots = new Map<string, EmergencyRecoverySnapshotEntity>();
    vi.spyOn(recoveryDb.recoverySnapshots, 'put').mockImplementation(((
      rec: EmergencyRecoverySnapshotEntity
    ) => {
      savedSnapshots.set(rec.id, rec);
      return Promise.resolve(rec.id);
    }) as unknown as typeof recoveryDb.recoverySnapshots.put);
    vi.spyOn(recoveryDb.recoverySnapshots, 'get').mockImplementation(((id: string) => {
      return Promise.resolve(savedSnapshots.get(id));
    }) as unknown as typeof recoveryDb.recoverySnapshots.get);

    const durable = await createDurablePreRestoreRecoveryBackup(
      testDb,
      meta,
      kek,
      'EmergencySnap#9',
      'Pre-restore release safety snapshot'
    );
    expect(durable.patientCount).toBe(1);
    expect(savedSnapshots.has(durable.snapshotId)).toBe(true);

    // Restore from emergency snapshot into a clean v9 database under a new destination password
    const freshV9 = createInMemoryDatabase(9);
    const restored = await restoreFromEmergencySnapshot(
      durable.snapshotId,
      'EmergencySnap#9',
      'FreshDevicePass!99',
      freshV9
    );
    expect(restored.patientCount).toBe(1);
    expect(await freshV9.patients.count()).toBe(1);
    expect(await freshV9.consents.count()).toBe(1);
    expect(await freshV9.attachments.count()).toBe(1);

    // Also test restoreBackupPackage wrong password rejection
    await expect(
      restoreBackupPackage(backupStr, 'WrongPassword#123', 'Dest#123456', createInMemoryDatabase(9))
    ).rejects.toThrow();
  });

  it('7.4: preserves GPL-3.0-or-later license metadata and Niema-Lab/PhysioMeter attribution integrity', () => {
    const rootDir = process.cwd();
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    expect(pkg.license).toBe('GPL-3.0-or-later');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);

    const vaultSrc = fs.readFileSync(path.join(rootDir, 'src/crypto/vault.ts'), 'utf8');
    expect(vaultSrc).toContain('Niema-Lab/PhysioMeter');
    expect(vaultSrc).toContain('GPL-3.0');
  });

  it('7.5: exports, verifies, and restores >25 MB v3.0 chunked backups in both replace and merge modes', async () => {
    const { testDb: srcDb, dek: srcDek, kek: srcKek } = await setupVaultAtVerno(9);
    await seedPatient(srcDb, srcDek, 'pat-big-1', 'مريض نسخة كبيرة');

    // 8 encrypted attachments x 980 KB plaintext (~7.84 MB ciphertext -> >26 MB snapshot payload & >25 MB .ptbackup file)
    const chunkBlobText = 'A'.repeat(980_000);
    const createdIso = new Date().toISOString();
    for (let i = 0; i < 8; i++) {
      const attId = `att-big-${i}`;
      const enc = await encryptRecordWithMandatoryReservation(
        srcDb,
        srcDek,
        'attachments',
        attId,
        ['pat-big-1'],
        {
          fileName: `scan-${i}.bin`,
          category: 'imaging',
          mimeType: 'application/octet-stream',
          sizeBytes: chunkBlobText.length,
          dataUrl: chunkBlobText,
        }
      );
      await srcDb.attachments.put({
        id: attId,
        patientId: 'pat-big-1',
        category: 'imaging',
        createdAt: createdIso,
        updatedAt: createdIso,
        recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
        dekVersion: CURRENT_DEK_VERSION,
        recordSalt: enc.recordSalt,
        iv: enc.iv,
        ciphertext: enc.ciphertext,
      });
    }

    const srcMeta = (await srcDb.vaultMeta.get('auth'))!;
    const backupJsonStr = await exportBackupPackage(
      srcDb as unknown as PhysioRecordDatabase,
      srcMeta,
      srcKek,
      'BigBackupPass#7'
    );

    expect(Buffer.byteLength(backupJsonStr, 'utf8')).toBeGreaterThan(25 * 1024 * 1024);

    const verification = await verifyBackupPackage(backupJsonStr, 'BigBackupPass#7');
    expect(verification.valid).toBe(true);
    expect(verification.formatVersion).toBe('3.0');
    expect(verification.uncompressedBytes).toBeGreaterThan(25 * 1024 * 1024);
    expect(verification.recordCount).toBe(9);

    // 1. Replace mode clears prior local data and restores all 8 attachments cleanly
    const { testDb: replaceDb, dek: replacePreDek } = await setupVaultAtVerno(9);
    await seedPatient(replaceDb, replacePreDek, 'pat-replace-drop', 'سجل سيتم استبداله');

    const replaceSummary = await restoreBackupPackage(
      backupJsonStr,
      'BigBackupPass#7',
      'DestReplacePass#7',
      replaceDb as unknown as PhysioRecordDatabase,
      { mode: 'replace' }
    );
    expect(replaceSummary.mode).toBe('replace');
    expect(replaceSummary.patientCount).toBe(1);
    expect(replaceSummary.countsByStore.attachments).toBe(8);
    expect(await replaceDb.patients.get('pat-replace-drop')).toBeUndefined();

    const restoredAtt = (await replaceDb.attachments.get('att-big-7'))!;
    const decAtt = await decryptRecordPayload<{ fileName: string; dataUrl: string }>(
      replaceSummary.destinationOperationalDek,
      'attachments',
      'att-big-7',
      ['pat-big-1'],
      restoredAtt.iv,
      restoredAtt.ciphertext,
      restoredAtt.recordCryptoVersion,
      restoredAtt.dekVersion,
      restoredAtt.recordSalt
    );
    expect(decAtt.fileName).toBe('scan-7.bin');
    expect(decAtt.dataUrl.length).toBe(980_000);

    // 2. Merge mode keeps distinct local patients, resolves older duplicate by newer timestamp, and restores all >25 MB attachments
    const { testDb: mergeDb, dek: mergeDek } = await setupVaultAtVerno(9);
    await seedPatient(mergeDb, mergeDek, 'pat-local-keep', 'مريض محلي محفوظ');
    await seedPatient(mergeDb, mergeDek, 'pat-big-1', 'نسخة قديمة');
    const oldTs = '2020-01-01T00:00:00.000Z';
    await mergeDb.patients.update('pat-big-1', { createdAt: oldTs, updatedAt: oldTs });

    const mergeSummary = await restoreBackupPackage(
      backupJsonStr,
      'BigBackupPass#7',
      'DestMergePass#7',
      mergeDb as unknown as PhysioRecordDatabase,
      { mode: 'merge', existingLocalDek: mergeDek }
    );
    expect(mergeSummary.mode).toBe('merge');
    expect(mergeSummary.patientCount).toBe(2);
    expect(mergeSummary.countsByStore.attachments).toBe(8);
    expect(mergeSummary.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          storeName: 'patients',
          recordId: 'pat-big-1',
          resolution: 'applied_backup',
        }),
      ])
    );

    const keptLocalPatient = (await mergeDb.patients.get('pat-local-keep'))!;
    const decLocal = await decryptRecordPayload<PatientClinicalData>(
      mergeSummary.destinationOperationalDek,
      'patients',
      'pat-local-keep',
      [],
      keptLocalPatient.iv,
      keptLocalPatient.ciphertext,
      keptLocalPatient.recordCryptoVersion,
      keptLocalPatient.dekVersion,
      keptLocalPatient.recordSalt
    );
    expect(decLocal.fullName).toBe('مريض محلي محفوظ');

    const updatedBigPatient = (await mergeDb.patients.get('pat-big-1'))!;
    const decBigPatient = await decryptRecordPayload<PatientClinicalData>(
      mergeSummary.destinationOperationalDek,
      'patients',
      'pat-big-1',
      [],
      updatedBigPatient.iv,
      updatedBigPatient.ciphertext,
      updatedBigPatient.recordCryptoVersion,
      updatedBigPatient.dekVersion,
      updatedBigPatient.recordSalt
    );
    expect(decBigPatient.fullName).toBe('مريض نسخة كبيرة');
  }, 45_000);
});
