import { describe, it, expect } from 'vitest';
import { createInMemoryDatabase } from './testDbHelper';
import {
  deriveKEK,
  generateAndWrapOperationalDEK,
  generateVerifier,
  bindDekToGeneration,
  encryptRecordWithMandatoryReservation,
  decryptRecordPayload,
  getEncryptionKeyUsageStatus,
  rotateAllKeys,
  randomBytes,
  CONSTANTS,
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  LEGACY_RECORD_CRYPTO_VERSION_V1,
  MAX_GCM_INVOCATIONS_PER_DEK,
  INVOCATION_RESERVATION_BLOCK_SIZE,
} from '../vault';
import {
  exportBackupPackage,
  verifyBackupPackage,
  restoreBackupPackage,
} from '../backup';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { LocalStorageMigrationService } from '../../services/localStorageMigrationService';
import {
  computePinBackoffMs,
  validateCustomWidgetDefinition,
  verifyAuditLogChainEntries,
  CUSTOM_WIDGET_LIMITS,
} from '../../services/clinicSecurityHelpers';

class MockLocalStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

async function setupVault(password = 'VaultTestPass#2026') {
  const testDb = createInMemoryDatabase();
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK(password, salt, 1000);
  const { operationalDek, wrappedDek, wrappedDekIv } =
    await generateAndWrapOperationalDEK(kek, 1);
  const { verifierIv, verifierCiphertext } = await generateVerifier(kek);
  bindDekToGeneration(operationalDek, 1);

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

  return { testDb, kek, dek: operationalDek };
}

describe('Phase 1 — Security, Durability & Data Integrity', () => {
  it('1.5 derives distinct per-record HKDF subkeys (v2) with v1 compatibility & block counter reservation', async () => {
    const { testDb, dek, kek } = await setupVault();

    // Encrypt 5 records and confirm block reservation (single 64-count block instead of 5 writes)
    const salts: Uint8Array[] = [];
    for (let i = 1; i <= 5; i++) {
      const id = `pat-${i}`;
      const payload = { fullName: `Patient ${i}`, notes: 'lumbar pain' };
      const enc = await encryptRecordWithMandatoryReservation(
        testDb,
        dek,
        'patients',
        id,
        [],
        payload
      );
      expect(enc.recordSalt).toBeInstanceOf(Uint8Array);
      expect(enc.recordSalt!.byteLength).toBe(16);
      salts.push(enc.recordSalt!);

      await testDb.patients.put({
        id,
        createdAt: '2026-11-13T00:00:00Z',
        updatedAt: '2026-11-13T00:00:00Z',
        isArchived: 0,
        recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
        dekVersion: CURRENT_DEK_VERSION,
        recordSalt: enc.recordSalt,
        iv: enc.iv,
        ciphertext: enc.ciphertext,
      });

      const dec = await decryptRecordPayload<typeof payload>(
        dek,
        'patients',
        id,
        [],
        enc.iv,
        enc.ciphertext,
        CURRENT_RECORD_CRYPTO_VERSION,
        CURRENT_DEK_VERSION,
        enc.recordSalt
      );
      expect(dec).toEqual(payload);
    }

    // Salts must be unique per encryption invocation
    const hexSalts = new Set(salts.map((s) => Array.from(s).join(',')));
    expect(hexSalts.size).toBe(5);

    const statusBefore = await getEncryptionKeyUsageStatus(testDb, dek);
    expect(statusBefore.persistedCount).toBe(INVOCATION_RESERVATION_BLOCK_SIZE);
    expect(statusBefore.effectiveCount).toBe(INVOCATION_RESERVATION_BLOCK_SIZE);
    expect(statusBefore.shouldAutoRotate).toBe(false);

    // Push count to 70% threshold -> shouldAutoRotate must trigger
    await testDb.vaultMeta.update('auth', {
      encryptionInvocationCount: Math.ceil(MAX_GCM_INVOCATIONS_PER_DEK * 0.71),
    });
    const statusAt70 = await getEncryptionKeyUsageStatus(testDb, dek);
    expect(statusAt70.shouldAutoRotate).toBe(true);

    // Also include a legacy v1 record and rotate all keys cleanly
    const v1Enc = await encryptRecordWithMandatoryReservation(
      testDb,
      dek,
      'patients',
      'pat-v1-legacy',
      [],
      { fullName: 'Legacy V1 Patient' },
      LEGACY_RECORD_CRYPTO_VERSION_V1
    );
    expect(v1Enc.recordSalt).toBeUndefined();
    await testDb.patients.put({
      id: 'pat-v1-legacy',
      createdAt: '2026-11-13T00:00:00Z',
      updatedAt: '2026-11-13T00:00:00Z',
      isArchived: 0,
      recordCryptoVersion: LEGACY_RECORD_CRYPTO_VERSION_V1,
      dekVersion: CURRENT_DEK_VERSION,
      iv: v1Enc.iv,
      ciphertext: v1Enc.ciphertext,
    });

    const rotated = await rotateAllKeys(testDb, dek, kek);
    expect(rotated.totalRecordsRotated).toBe(6);
    expect(rotated.newDekVersion).toBe(CURRENT_DEK_VERSION + 1);

    const afterLegacy = await testDb.patients.get('pat-v1-legacy');
    expect(afterLegacy!.recordCryptoVersion).toBe(CURRENT_RECORD_CRYPTO_VERSION);
    expect(afterLegacy!.recordSalt).toBeInstanceOf(Uint8Array);
    const decryptedLegacyAfter = await decryptRecordPayload<{ fullName: string }>(
      rotated.newOperationalDek,
      'patients',
      'pat-v1-legacy',
      [],
      afterLegacy!.iv,
      afterLegacy!.ciphertext,
      afterLegacy!.recordCryptoVersion,
      afterLegacy!.dekVersion,
      afterLegacy!.recordSalt
    );
    expect(decryptedLegacyAfter.fullName).toBe('Legacy V1 Patient');
  });

  it('1.9 & 1.10 exports V3.0 gzip+chunked backup, verifies integrity, detects tampering & resolves merge conflicts protecting finalized SOAPs', async () => {
    const source = await setupVault('SourcePass#2026');

    // Source patient + finalized immutable SOAP note
    const pat1Enc = await encryptRecordWithMandatoryReservation(
      source.testDb,
      source.dek,
      'patients',
      'p-shared',
      [],
      { fullName: 'Ahmed Local-Older', phone: '0770000001' }
    );
    await source.testDb.patients.put({
      id: 'p-shared',
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z',
      isArchived: 0,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: pat1Enc.recordSalt,
      iv: pat1Enc.iv,
      ciphertext: pat1Enc.ciphertext,
    });

    const epEnc = await encryptRecordWithMandatoryReservation(
      source.testDb,
      source.dek,
      'episodes',
      'ep-1',
      ['p-shared'],
      { title: 'Knee Rehab' }
    );
    await source.testDb.episodes.put({
      id: 'ep-1',
      patientId: 'p-shared',
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z',
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: epEnc.recordSalt,
      iv: epEnc.iv,
      ciphertext: epEnc.ciphertext,
    });

    const sessEnc = await encryptRecordWithMandatoryReservation(
      source.testDb,
      source.dek,
      'sessions',
      's-1',
      ['p-shared', 'ep-1'],
      { date: '2026-11-10' }
    );
    await source.testDb.sessions.put({
      id: 's-1',
      patientId: 'p-shared',
      episodeId: 'ep-1',
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z',
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: sessEnc.recordSalt,
      iv: sessEnc.iv,
      ciphertext: sessEnc.ciphertext,
    });

    const soapBackupEnc = await encryptRecordWithMandatoryReservation(
      source.testDb,
      source.dek,
      'soapNotes',
      'soap-locked',
      ['p-shared', 'ep-1', 's-1'],
      { isFinalized: true, subjective: 'Backup Modified Attempt' }
    );
    await source.testDb.soapNotes.put({
      id: 'soap-locked',
      patientId: 'p-shared',
      episodeId: 'ep-1',
      sessionId: 's-1',
      createdAt: '2026-11-10T12:00:00Z',
      updatedAt: '2026-11-12T12:00:00Z', // newer timestamp, must still be rejected over finalized local!
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: soapBackupEnc.recordSalt,
      iv: soapBackupEnc.iv,
      ciphertext: soapBackupEnc.ciphertext,
    });

    const meta = (await source.testDb.vaultMeta.get('auth'))!;
    const v3Json = await exportBackupPackage(source.testDb, meta, source.kek, 'ExportPass#2026');
    const parsedV3 = JSON.parse(v3Json);
    expect(parsedV3.header.magic).toBe('PHYSIORECORD_BACKUP_V3.0');
    expect(parsedV3.header.compression).toBe('gzip');
    expect(Array.isArray(parsedV3.chunks)).toBe(true);
    expect(parsedV3.chunks.length).toBeGreaterThanOrEqual(1);

    const verified = await verifyBackupPackage(v3Json, 'ExportPass#2026');
    expect(verified.valid).toBe(true);
    expect(verified.formatVersion).toBe('3.0');
    expect(verified.recordCount).toBe(4);

    // Tamper chunk ciphertext -> must fail verification
    const tampered = JSON.parse(v3Json);
    tampered.chunks[0].ciphertext[0] ^= 0xff;
    await expect(
      verifyBackupPackage(JSON.stringify(tampered), 'ExportPass#2026')
    ).rejects.toThrow();

    // Target DB has a newer local p-shared AND an already finalized local soap-locked
    const dest = await setupVault('DestPass#2026');
    const destPatEnc = await encryptRecordWithMandatoryReservation(
      dest.testDb,
      dest.dek,
      'patients',
      'p-shared',
      [],
      { fullName: 'Ahmed Local-Newer', phone: '0779999999' }
    );
    await dest.testDb.patients.put({
      id: 'p-shared',
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-13T09:00:00Z',
      isArchived: 0,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: destPatEnc.recordSalt,
      iv: destPatEnc.iv,
      ciphertext: destPatEnc.ciphertext,
    });

    const destEpEnc = await encryptRecordWithMandatoryReservation(
      dest.testDb,
      dest.dek,
      'episodes',
      'ep-1',
      ['p-shared'],
      { title: 'Knee Rehab' }
    );
    await dest.testDb.episodes.put({
      id: 'ep-1',
      patientId: 'p-shared',
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z',
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: destEpEnc.recordSalt,
      iv: destEpEnc.iv,
      ciphertext: destEpEnc.ciphertext,
    });

    const destSessEnc = await encryptRecordWithMandatoryReservation(
      dest.testDb,
      dest.dek,
      'sessions',
      's-1',
      ['p-shared', 'ep-1'],
      { date: '2026-11-10' }
    );
    await dest.testDb.sessions.put({
      id: 's-1',
      patientId: 'p-shared',
      episodeId: 'ep-1',
      createdAt: '2026-11-10T10:00:00Z',
      updatedAt: '2026-11-10T10:00:00Z',
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: destSessEnc.recordSalt,
      iv: destSessEnc.iv,
      ciphertext: destSessEnc.ciphertext,
    });

    const destSoapEnc = await encryptRecordWithMandatoryReservation(
      dest.testDb,
      dest.dek,
      'soapNotes',
      'soap-locked',
      ['p-shared', 'ep-1', 's-1'],
      { isFinalized: true, subjective: 'Original Finalized Note' }
    );
    await dest.testDb.soapNotes.put({
      id: 'soap-locked',
      patientId: 'p-shared',
      episodeId: 'ep-1',
      sessionId: 's-1',
      createdAt: '2026-11-10T11:00:00Z',
      updatedAt: '2026-11-10T11:00:00Z',
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      recordSalt: destSoapEnc.recordSalt,
      iv: destSoapEnc.iv,
      ciphertext: destSoapEnc.ciphertext,
    });

    const mergeResult = await restoreBackupPackage(
      v3Json,
      'ExportPass#2026',
      'MergedVaultPass#2026',
      dest.testDb,
      { mode: 'merge', existingLocalDek: dest.dek }
    );
    expect(mergeResult.mode).toBe('merge');
    expect(mergeResult.skippedImmutableCount).toBe(1);
    expect(
      mergeResult.conflicts.some(
        (c) => c.storeName === 'soapNotes' && c.resolution === 'skipped_immutable'
      )
    ).toBe(true);
    expect(
      mergeResult.conflicts.some(
        (c) => c.storeName === 'patients' && c.resolution === 'kept_local'
      )
    ).toBe(true);

    const mergedSoap = await dest.testDb.soapNotes.get('soap-locked');
    const decMergedSoap = await decryptRecordPayload<{ subjective: string }>(
      mergeResult.destinationOperationalDek,
      'soapNotes',
      'soap-locked',
      ['p-shared', 'ep-1', 's-1'],
      mergedSoap!.iv,
      mergedSoap!.ciphertext,
      mergedSoap!.recordCryptoVersion,
      mergedSoap!.dekVersion,
      mergedSoap!.recordSalt
    );
    expect(decMergedSoap.subjective).toBe('Original Finalized Note');
  });

  it('1.1 & 1.6 hashes Admin PIN with PBKDF2, applies exponential backoff & maintains tamper-evident SHA-256 audit log chain', async () => {
    const { testDb, dek } = await setupVault();
    await ClinicOperationsService.hydrateEncryptedCache(dek, testDb);

    // Requires first-run setup; trivial defaults rejected
    expect(ClinicOperationsService.requiresFirstRunAdminPinSetup()).toBe(true);
    await expect(ClinicOperationsService.setAdminPinAsync('1234')).rejects.toThrow();
    await expect(ClinicOperationsService.setAdminPinAsync('0000')).rejects.toThrow();

    await ClinicOperationsService.setAdminPinAsync('73915');
    expect(ClinicOperationsService.requiresFirstRunAdminPinSetup()).toBe(false);

    // Exponential backoff calculation verification
    expect(computePinBackoffMs(1)).toBe(0);
    expect(computePinBackoffMs(2)).toBe(0);
    expect(computePinBackoffMs(3)).toBe(5_000);
    expect(computePinBackoffMs(4)).toBe(15_000);
    expect(computePinBackoffMs(5)).toBe(60_000);
    expect(computePinBackoffMs(6)).toBe(300_000);

    // 3 wrong PINs trigger rate limiting
    expect((await ClinicOperationsService.verifyAdminPinAsync('99999')).ok).toBe(false);
    expect((await ClinicOperationsService.verifyAdminPinAsync('99998')).ok).toBe(false);
    const thirdFail = await ClinicOperationsService.verifyAdminPinAsync('99997');
    expect(thirdFail.ok).toBe(false);
    expect(thirdFail.rateLimited).toBe(true);
    expect(thirdFail.remainingSeconds).toBeGreaterThan(0);

    // Verify encrypted audit chain integrity across logged actions
    await ClinicOperationsService.appendAuditLogAsync({
      actionType: 'evaluation_saved',
      entityType: 'episode',
      entityId: 'ep-audit-1',
      summaryAr: 'تم حفظ التقييم الأولي',
      summaryEn: 'Saved initial evaluation',
    });

    const chainCheck = await ClinicOperationsService.verifyAuditChain(testDb, dek);
    expect(chainCheck.valid).toBe(true);
    expect(chainCheck.verifiedEntries).toBeGreaterThanOrEqual(4); // pin_changed + pin_failed... + evaluation_saved

    // Tamper detection on decrypted chain entries
    const logs = ClinicOperationsService.getAuditLogs();
    const tamperedLogs = logs.map((l, idx) =>
      idx === 0 ? { ...l, summaryEn: 'Tampered entry!' } : l
    );
    const tamperedResult = await verifyAuditLogChainEntries(tamperedLogs);
    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.brokenAtEntryId).toBe(tamperedLogs[0].id);
  });

  it('1.2 leaves ZERO PHI-looking entries in localStorage after verified migration into Dexie v7', async () => {
    const { testDb, dek } = await setupVault();
    const storage = new MockLocalStorage();
    storage.setItem(
      'physiorecord_appointments_v2',
      JSON.stringify([
        {
          id: 'appt-legacy-1',
          patientId: 'pat-1',
          patientName: 'سعد كريم محمد',
          date: '2026-11-13',
          startTime: '10:00',
          durationMinutes: 45,
          therapistId: 'staff_1',
          therapistName: 'Dr. Hussein',
          roomName: 'Room 1',
          appointmentType: 'follow_up',
          status: 'scheduled',
        },
      ])
    );
    storage.setItem(
      'physiorecord_recurring_schedules_v1',
      JSON.stringify([
        {
          id: 'rec-legacy-1',
          patientId: 'pat-1',
          patientName: 'سعد كريم محمد',
          daysOfWeek: [0, 2, 4],
          startTime: '11:00',
          durationMinutes: 30,
          roomName: 'Room 1',
          therapistId: 'staff_1',
          therapistName: 'Dr. Hussein',
          active: true,
          createdAt: '2026-11-01T08:00:00Z',
        },
      ])
    );
    storage.setItem('physiorecord_admin_pin_v1', '5928');
    storage.setItem('physiorecord_language', 'ar');

    expect(
      LocalStorageMigrationService.findPhiLikeLocalStorageEntries(storage).length
    ).toBeGreaterThanOrEqual(3);

    const migRes = await LocalStorageMigrationService.runMigration(dek, testDb, {
      storage,
      destructive: true,
    });
    expect(migRes.report.corruptKeys).toEqual([]);
    expect(migRes.report.migratedKeys.length).toBeGreaterThanOrEqual(3);
    expect(storage.getItem('physiorecord_language')).toBe('ar');

    // Legacy PIN migrated into PBKDF2 encrypted clinicSettings ('admin_auth')
    await ClinicOperationsService.hydrateEncryptedCache(dek, testDb);
    const pinVerify = await ClinicOperationsService.verifyAdminPinAsync('5928');
    expect(pinVerify.ok).toBe(true);

    // Core security assertion: ZERO PHI keys remain in localStorage
    expect(LocalStorageMigrationService.findPhiLikeLocalStorageEntries(storage)).toEqual([]);
  });

  it('1.11 enforces strict Zod schema, HTML rejection, 64KB cap & 30-field cap for Custom Widgets', () => {
    const valid = validateCustomWidgetDefinition({
      id: 'shoulder_screen_v1',
      titleAr: 'فحص الكتف السريع',
      titleEn: 'Quick Shoulder Screen',
      fields: [
        {
          id: 'pain_arc',
          type: 'radio',
          labelAr: 'القوس المؤلم',
          labelEn: 'Painful Arc',
          options: [
            { value: 'pos', labelAr: 'إيجابي', labelEn: 'Positive', score: 1 },
            { value: 'neg', labelAr: 'سلبي', labelEn: 'Negative', score: 0 },
          ],
        },
      ],
    });
    expect(valid.ok).toBe(true);

    const xssPayload = validateCustomWidgetDefinition({
      id: 'xss_widget',
      titleAr: '<script>alert(1)</script>',
      titleEn: 'Bad Widget',
      fields: [{ id: 'f1', type: 'number', labelAr: 'نعم', labelEn: 'Yes' }],
    });
    expect(xssPayload.ok).toBe(false);

    const oversizedPayload = validateCustomWidgetDefinition({
      id: 'big_widget',
      titleAr: 'كبير',
      titleEn: 'Big',
      fields: [{ id: 'f1', type: 'text', labelAr: 'نص', labelEn: 'Text' }],
      descriptionEn: 'A'.repeat(CUSTOM_WIDGET_LIMITS.MAX_JSON_BYTES + 200),
    });
    expect(oversizedPayload.ok).toBe(false);

    const tooManyFields = validateCustomWidgetDefinition({
      id: 'many_fields',
      titleAr: 'حقول كثيرة',
      titleEn: 'Many fields',
      fields: Array.from({ length: 31 }, (_, i) => ({
        id: `field_${i}`,
        type: 'number' as const,
        labelAr: `حقل ${i}`,
        labelEn: `Field ${i}`,
      })),
    });
    expect(tooManyFields.ok).toBe(false);
  });
});
