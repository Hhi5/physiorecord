import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CONSTANTS,
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  deriveKEK,
  generateAndWrapOperationalDEK,
  generateVerifier,
  encryptRecordPayload,
  decryptRecordPayload,
  randomBytes,
} from '../../crypto/vault';
import { createInMemoryDatabase } from '../../crypto/__tests__/testDbHelper';
import { recoveryDb } from '../../crypto/recovery';
import { EpisodeService } from '../../services/episodeService';
import { SessionService, verifySessionSeal, verifySoapSeal } from '../../services/sessionService';
import { SoapService } from '../../services/soapService';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { CannotDeleteFinalizedRecordError, type PatientRecord } from '../../types/clinical';
import {
  searchBilingualGlossary,
  resolveCanonicalBilingualTerm,
  getPrintDocumentGlossaryLabels,
} from '../../data/terminology';
import {
  RECYCLE_BIN_RETENTION_DAYS,
  assertNonClinicalTrashTarget,
  autoGuessImportColumnMapping,
  buildMinimalXlsxBuffer,
  computeClinicDataHealthReport,
  detectPatientDuplicates,
  executePatientImportBatchTransactional,
  extractCanonicalPhoneSuffix7,
  filterActiveRecycleBinEntries,
  findAllDirectoryDuplicatePairs,
  getRemainingRecycleDays,
  mergePatientsTransactional,
  parseXlsxBufferToMatrix,
  resolveOrphanRecord,
  restorePreMergeSafetySnapshot,
  rollbackImportedBatchTransactional,
  runImportWizardDryRun,
  scanDatabaseOrphanRecords,
} from '../dataQualityPhaseD';

async function bootstrapPhaseDTestDb() {
  const db = createInMemoryDatabase(10);
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK('PhaseD-Test-Pass!1', salt, 1000);
  const { operationalDek, wrappedDek, wrappedDekIv } = await generateAndWrapOperationalDEK(kek, 1);
  const { verifierIv, verifierCiphertext } = await generateVerifier(kek);

  await db.vaultMeta.put({
    id: 'auth',
    salt,
    wrappedDek,
    wrappedDekIv,
    verifierIv,
    verifierCiphertext,
    schemaVersion: 10,
    kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
    kdfIterations: 1000,
    dekVersion: CURRENT_DEK_VERSION,
    encryptionInvocationCount: 0,
    vaultGeneration: 1,
  });

  return { db, dek: operationalDek };
}

function attachTransactionalRollbackMock(db: ReturnType<typeof createInMemoryDatabase>) {
  const originalTx = db.transaction.bind(db) as (
    mode: 'rw',
    tables: unknown,
    scope: () => Promise<unknown>
  ) => Promise<unknown>;
  (db as unknown as { transaction: unknown }).transaction = async (
    mode: 'rw',
    tables: unknown,
    scope: () => Promise<unknown>
  ) => {
    const tableList = Array.isArray(tables) ? tables : [];
    const backups = new Map<string, Record<string, unknown>[]>();
    for (const tbl of tableList) {
      if (tbl && typeof tbl.name === 'string' && typeof tbl.toArray === 'function') {
        backups.set(tbl.name, await tbl.toArray());
      }
    }
    try {
      return await originalTx(mode, tables, scope);
    } catch (err) {
      for (const tbl of tableList) {
        if (tbl && typeof tbl.name === 'string') {
          const prev = backups.get(tbl.name) || [];
          await tbl.clear();
          if (prev.length > 0) {
            await tbl.bulkPut(prev);
          }
        }
      }
      throw err;
    }
  };
}

describe('Phase D (D1–D5): Data Quality, Import, Recycle Bin, Health & Glossary', () => {
  const snapshotMap = new Map<string, { id: string; [key: string]: unknown }>();

  beforeEach(() => {
    snapshotMap.clear();
    ClinicOperationsService.clearInMemoryCache();
    vi.spyOn(recoveryDb.recoverySnapshots, 'put').mockImplementation((async (item: {
      id: string;
      [key: string]: unknown;
    }) => {
      snapshotMap.set(item.id, structuredClone(item));
      return item.id;
    }) as never);
    vi.spyOn(recoveryDb.recoverySnapshots, 'get').mockImplementation((async (id: string) => {
      const found = snapshotMap.get(id);
      return found ? structuredClone(found) : undefined;
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ClinicOperationsService.clearInMemoryCache();
  });

  it('D1: normalizes Arabic/Eastern-numeral phone suffixes and detects duplicates without false self-matches', () => {
    expect(extractCanonicalPhoneSuffix7('+964 770 123 4567')).toBe('1234567');
    expect(extractCanonicalPhoneSuffix7('٠٧٧٠١٢٣٤٥٦٧')).toBe('1234567');
    expect(extractCanonicalPhoneSuffix7('0770-123-4567')).toBe('1234567');

    const existing: PatientRecord[] = [
      {
        id: 'pat-a',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
        isArchived: 0,
        data: {
          fullName: 'Ahmed Kareem Abbas',
          fullNameAr: 'أحمد كريم عباس',
          phone: '+9647701234567',
          gender: 'male',
          mrn: 'PT-000001',
        },
      },
      {
        id: 'pat-b',
        createdAt: '2026-10-02T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
        isArchived: 0,
        data: {
          fullName: 'Noor Al-Huda',
          fullNameAr: 'نور الهدى',
          phone: '07809998877',
          gender: 'female',
          mrn: 'PT-000002',
        },
      },
    ];

    const matches = detectPatientDuplicates(
      {
        fullNameAr: 'احمد كريم عباس',
        phone: '07701234567',
      },
      existing
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].patient.id).toBe('pat-a');
    expect(matches[0].matchConfidence).toBe('exact_name_and_phone');
    expect(matches[0].matchedByName).toBe(true);
    expect(matches[0].matchedByPhoneSuffix).toBe(true);

    // Editing pat-a itself must never warn against itself
    const selfEdit = detectPatientDuplicates(
      {
        id: 'pat-a',
        fullNameAr: 'أحمد كريم عباس',
        phone: '07701234567',
      },
      existing
    );
    expect(selfEdit).toHaveLength(0);

    const directoryPairs = findAllDirectoryDuplicatePairs([
      ...existing,
      {
        ...existing[0],
        id: 'pat-a-dup',
        data: {
          ...existing[0].data,
          fullNameAr: 'احمد كريم عباس',
          phone: '0770 123 4567',
        },
      },
    ]);
    expect(directoryPairs).toHaveLength(1);
    expect(directoryPairs[0].matchReasons).toContain('phone_suffix');
  });

  it('D1: merges duplicate patients transactionally, preserves SHA-256 clinical seals, stores pre-merge snapshot, and restores cleanly', async () => {
    const { db, dek } = await bootstrapPhaseDTestDb();
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);

    const putEnc = async (
      tableName: string,
      id: string,
      parentIds: string[],
      payload: unknown,
      extraCols: Record<string, unknown> = {}
    ) => {
      const enc = await encryptRecordPayload(
        dek,
        tableName,
        id,
        parentIds,
        payload,
        CURRENT_RECORD_CRYPTO_VERSION,
        CURRENT_DEK_VERSION
      );
      await db.table(tableName).put({
        id,
        createdAt: '2026-10-05T08:00:00.000Z',
        updatedAt: '2026-10-05T08:00:00.000Z',
        version: 1,
        recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
        dekVersion: CURRENT_DEK_VERSION,
        iv: enc.iv,
        ciphertext: enc.ciphertext,
        ...(enc.recordSalt ? { recordSalt: enc.recordSalt } : {}),
        ...extraCols,
      });
    };

    await putEnc(
      'patients',
      'pat-surv',
      [],
      {
        fullName: 'Zaid Al-Mansoor',
        fullNameAr: 'زيد المنصور',
        phone: '+9647701112233',
        gender: 'male',
        mrn: 'PT-000010',
        tags: ['vip'],
      },
      { isArchived: 0 }
    );
    await putEnc(
      'patients',
      'pat-dup',
      [],
      {
        fullName: 'Zaid Mansoor',
        fullNameAr: 'زيد منصور',
        phone: '07701112233',
        gender: 'male',
        mrn: 'PT-000011',
        medicalHistory: 'Hypertension controlled',
        tags: ['imported'],
      },
      { isArchived: 0 }
    );

    const dupEp = await EpisodeService.createEpisode(
      'pat-dup',
      {
        title: 'Right Shoulder Impingement',
        primarySpecialty: 'musculoskeletal',
        medicalDiagnosis: 'Subacromial pain syndrome',
        clinicalImpression: 'Subacromial pain reproduced with abduction above 90 degrees',
        affectedBodyRegion: 'Shoulder',
        onsetDate: '2026-09-20',
        startDate: '2026-10-01',
        status: 'active',
        rehabilitationGoals: { shortTerm: ['Pain < 3/10'], longTerm: ['Overhead reach'] },
      },
      dek,
      'ep-dup-1',
      db
    );

    const dupSess = await SessionService.createSession(
      'pat-dup',
      dupEp.id,
      {
        sessionDate: '2026-10-05',
        sessionType: 'initial_evaluation',
        attendanceStatus: 'attended',
      },
      dek,
      'sess-dup-1',
      db
    );

    await SoapService.createSoapNote(
      'pat-dup',
      dupEp.id,
      dupSess.id,
      {
        isFinalized: false,
        subjective: {
          chiefComplaint: 'Painful arc above 90 deg',
          painNrsScore: 6,
          postSessionPainNrs: 4,
        },
        objective: {
          dailyInterventionsSummary: 'Scapular stabilization + isometric ER',
        },
        assessment: {
          clinicalImpressionCurrent: 'Impingement responding well to loading',
          progressStatus: 'improved',
          patientTolerance: 'well_tolerated',
        },
        plan: {
          nextSessionPlan: 'Progress band resistance',
        },
      },
      dek,
      'soap-dup-1',
      db
    );

    await SessionService.finalizeSession(dupSess.id, 'Dr. Haidar', dek, db);

    await putEnc(
      'appointments',
      'appt-dup-1',
      [],
      {
        id: 'appt-dup-1',
        patientId: 'pat-dup',
        patientName: 'زيد منصور',
        therapistName: 'د. حيدر',
        date: '2026-11-20',
        startTime: '11:00',
        durationMinutes: 45,
        visitType: 'follow_up',
        status: 'scheduled',
      },
      { patientId: 'pat-dup' }
    );

    await putEnc(
      'invoices',
      'inv-dup-1',
      [],
      {
        id: 'inv-dup-1',
        invoiceNumber: 'INV-2026-011',
        patientId: 'pat-dup',
        patientName: 'زيد منصور',
        date: '2026-10-05',
        invoiceType: 'single_session',
        titleAr: 'جلسة علاج طبيعي',
        titleEn: 'PT Session',
        totalAmountIQD: 25000,
        discountIQD: 0,
        netAmountIQD: 25000,
        paidAmountIQD: 25000,
        balanceDueIQD: 0,
        status: 'paid',
        payments: [],
        createdBy: 'Dr. Haidar',
      },
      { patientId: 'pat-dup' }
    );

    const mergeResult = await mergePatientsTransactional({
      survivingPatientId: 'pat-surv',
      sourcePatientId: 'pat-dup',
      dek,
      database: db,
    });

    expect(mergeResult.movedCounts.episodes).toBe(1);
    expect(mergeResult.movedCounts.sessions).toBe(1);
    expect(mergeResult.movedCounts.soapNotes).toBe(1);
    expect(mergeResult.movedCounts.appointments).toBe(1);
    expect(mergeResult.movedCounts.invoices).toBe(1);
    expect(snapshotMap.has(mergeResult.snapshotId)).toBe(true);

    // Duplicate source deleted cleanly
    expect(await db.patients.get('pat-dup')).toBeUndefined();

    // Surviving patient contains merged metadata + history
    const survRow = (await db.patients.get('pat-surv'))!;
    const survDec = await decryptRecordPayload<Record<string, unknown>>(
      dek,
      'patients',
      'pat-surv',
      [],
      survRow.iv,
      survRow.ciphertext,
      survRow.recordCryptoVersion,
      survRow.dekVersion
    );
    expect(survDec.mergedFromPatientIds).toEqual(['pat-dup']);
    expect(String(survDec.medicalHistory)).toContain('Hypertension controlled');

    // Moved episode, session, and sealed SOAP note decrypt under survivingPatientId and pass SHA-256 verification!
    const movedSess = await SessionService.getSessionById(dupSess.id, dek, db);
    const movedSoap = await SoapService.getSoapNoteBySession(dupSess.id, dek, db);
    expect(movedSess?.patientId).toBe('pat-surv');
    expect(movedSoap?.patientId).toBe('pat-surv');

    const soapSealCheck = await verifySoapSeal(movedSoap!.data);
    const sessSealCheck = await verifySessionSeal(movedSess!.data, movedSoap!.data);
    expect(soapSealCheck.status).toBe('valid');
    expect(sessSealCheck.status).toBe('valid');

    // Rollback from pre-merge encrypted snapshot restores pat-dup and original child ownership
    await restorePreMergeSafetySnapshot(mergeResult.snapshotId, dek, db);
    expect(await db.patients.get('pat-dup')).toBeDefined();
    const restoredSess = await SessionService.getSessionById(dupSess.id, dek, db);
    expect(restoredSess?.patientId).toBe('pat-dup');
  });

  it('D2: parses & generates zero-dependency XLSX, auto-guesses AR/CKB/EN/camelCase columns, normalizes +964, rolls back on fault & supports batch rollback', async () => {
    expect(
      autoGuessImportColumnMapping(['ناوی نەخۆش', 'ژمارەی مۆبایل', 'ڕەگەز', 'تەمەن'])
    ).toEqual(['fullNameAr', 'phone', 'gender', 'age']);
    expect(
      autoGuessImportColumnMapping(['fullNameAr', 'phoneNumber', 'gender', 'age', 'medicalHistory'])
    ).toEqual(['fullNameAr', 'phone', 'gender', 'age', 'medicalHistory']);

    const sampleRows = [
      ['الاسم الكامل', 'Full Name', 'الهاتف', 'الجنس', 'التشخيص'],
      ['سارة حسين جاسم', 'Sarah Hussein', '0770 444 5566', 'أنثى', 'انزلاق غضروفي قطني'],
      ['كرار عادل', 'Karrar Adel', '٠٧٨٠٢٢٢٣٣٤٤', 'ذكر', 'تأهيل ركبة'],
    ];
    const xlsxBytes = buildMinimalXlsxBuffer(sampleRows);
    const ab = xlsxBytes.buffer.slice(
      xlsxBytes.byteOffset,
      xlsxBytes.byteOffset + xlsxBytes.byteLength
    ) as ArrayBuffer;
    const parsedMatrix = await parseXlsxBufferToMatrix(ab);
    expect(parsedMatrix).toHaveLength(3);
    expect(parsedMatrix[1][0]).toBe('سارة حسين جاسم');
    expect(parsedMatrix[2][1]).toBe('Karrar Adel');

    const { db, dek } = await bootstrapPhaseDTestDb();
    attachTransactionalRollbackMock(db);
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);

    const existing: PatientRecord[] = [
      {
        id: 'existing-1',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        isArchived: 0,
        data: {
          fullName: 'Existing Duplicate',
          fullNameAr: 'مريض مسجل مسبقا',
          phone: '+9647709991111',
          gender: 'male',
        },
      },
    ];

    const report = runImportWizardDryRun({
      matrix: [
        ['الاسم', 'الهاتف', 'التشخيص'],
        ['مريم كريم', '07701239876', 'ألم أسفل الظهر'],
        ['مكرر بالهاتف', '0770 999 1111', ''],
        ['', '07801112233', 'ناقص الاسم'],
        ['حسن علي', '٠٧٧١٥٥٥٦٦٧٧', 'تمزق أربطة'],
      ],
      existingPatients: existing,
    });

    expect(report.totalRows).toBe(4);
    expect(report.readyRows).toHaveLength(2);
    expect(report.duplicateRows).toHaveLength(1);
    expect(report.invalidRows).toHaveLength(1);
    expect(report.readyRows[0].normalizedPhone).toBe('+964 770 123 9876');
    expect(report.readyRows[1].normalizedPhone).toBe('+964 771 555 6677');

    // Transactional rollback on fault leaves 0 imported rows in IndexedDB
    await expect(
      executePatientImportBatchTransactional({
        rows: report.readyRows,
        dek,
        existingPatients: existing,
        database: db,
        injectFaultAtRowIndex: 1,
      })
    ).rejects.toThrow();
    expect(await db.patients.count()).toBe(0);

    // Clean commit adds imported badge & batchId
    const committed = await executePatientImportBatchTransactional({
      rows: report.readyRows,
      dek,
      existingPatients: existing,
      database: db,
    });
    expect(committed.count).toBe(2);
    expect(await db.patients.count()).toBe(2);

    const firstRow = (await db.patients.get(committed.importedIds[0]))!;
    const dec = await decryptRecordPayload<Record<string, unknown>>(
      dek,
      'patients',
      firstRow.id,
      [],
      firstRow.iv,
      firstRow.ciphertext,
      firstRow.recordCryptoVersion,
      firstRow.dekVersion
    );
    expect(dec.isImported).toBe(true);
    expect(dec.tags).toEqual(['imported']);
    expect(dec.importedBatchId).toBe(committed.batchId);

    // Rollback imported batch deletes only that batch
    const deletedCount = await rollbackImportedBatchTransactional(committed.batchId, dek, db);
    expect(deletedCount).toBe(2);
    expect(await db.patients.count()).toBe(0);
  });

  it('D3: moves deleted non-clinical items to 30-day Recycle Bin, restores them, purges after 30 days, and blocks finalized clinical deletion', () => {
    expect(RECYCLE_BIN_RETENTION_DAYS).toBe(30);
    expect(() => assertNonClinicalTrashTarget('soap')).toThrow(CannotDeleteFinalizedRecordError);
    expect(() => assertNonClinicalTrashTarget('session')).toThrow(CannotDeleteFinalizedRecordError);
    expect(() => assertNonClinicalTrashTarget('episode')).toThrow(CannotDeleteFinalizedRecordError);
    expect(() => assertNonClinicalTrashTarget('appointment')).not.toThrow();

    const appt = ClinicOperationsService.saveAppointment({
      patientId: 'p-1',
      patientName: 'علي حسين',
      therapistName: 'د. نور',
      date: '2026-11-25',
      startTime: '09:30',
      durationMinutes: 30,
      visitType: 'follow_up',
      status: 'scheduled',
    });

    ClinicOperationsService.deleteAppointment(appt.id, {
      deletedAtIso: '2026-11-01T10:00:00.000Z',
    });
    expect(ClinicOperationsService.getAppointments()).toHaveLength(0);

    const trash = ClinicOperationsService.getRecycleBinItems('2026-11-05T10:00:00.000Z');
    expect(trash).toHaveLength(1);
    expect(getRemainingRecycleDays(trash[0], '2026-11-05T10:00:00.000Z')).toBe(26);

    // Restore puts appointment back and logs audit
    const restoreRes = ClinicOperationsService.restoreRecycleBinItem(
      trash[0].id,
      '2026-11-05T10:00:00.000Z'
    );
    expect(restoreRes.restored).toBe(true);
    expect(ClinicOperationsService.getAppointments()).toHaveLength(1);
    expect(ClinicOperationsService.getRecycleBinItems('2026-11-05T10:00:00.000Z')).toHaveLength(0);

    // Test 30-day automatic expiration
    const [exp] = ClinicOperationsService.addExpenseIQD({
      titleAr: 'فاتورة كهرباء',
      titleEn: 'Electricity Bill',
      amountIQD: 40000,
      category: 'electricity_generator',
      date: '2026-10-01',
      paidBy: 'د. نور',
    });
    ClinicOperationsService.deleteExpenseIQD(exp.id, {
      deletedAtIso: '2026-10-01T00:00:00.000Z',
    });
    expect(
      filterActiveRecycleBinEntries(
        ClinicOperationsService.getRecycleBinItems('2026-10-15T00:00:00.000Z'),
        '2026-11-01T00:00:00.000Z'
      )
    ).toHaveLength(0);
    const purged = ClinicOperationsService.purgeExpiredRecycleBinItems('2026-11-02T00:00:00.000Z');
    expect(purged).toBe(1);
  });

  it('D4: reports all 5 data health categories, scans orphan records, and protects clinical orphans while resolving non-clinical ones', async () => {
    const { db, dek } = await bootstrapPhaseDTestDb();

    const encValidPatient = await encryptRecordPayload(
      dek,
      'patients',
      'valid-p1',
      [],
      { fullName: 'Valid Patient', fullNameAr: 'مريض مكتمل', gender: 'male' },
      CURRENT_RECORD_CRYPTO_VERSION,
      CURRENT_DEK_VERSION
    );
    await db.patients.put({
      id: 'valid-p1',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      isArchived: 0,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      iv: encValidPatient.iv,
      ciphertext: encValidPatient.ciphertext,
    });

    // Clinical orphan episode referencing ghost patient
    const encOrphanEp = await encryptRecordPayload(
      dek,
      'episodes',
      'orphan-ep-1',
      ['ghost-pat'],
      { title: 'Orphan Knee Rehab' },
      CURRENT_RECORD_CRYPTO_VERSION,
      CURRENT_DEK_VERSION
    );
    await db.episodes.put({
      id: 'orphan-ep-1',
      patientId: 'ghost-pat',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      iv: encOrphanEp.iv,
      ciphertext: encOrphanEp.ciphertext,
    });

    // Non-clinical orphan appointment referencing ghost patient
    await db.appointments.put({
      id: 'orphan-appt-1',
      patientId: 'ghost-pat',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      version: 1,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: CURRENT_DEK_VERSION,
      iv: new Uint8Array(12),
      ciphertext: new Uint8Array(16),
    });

    const orphans = await scanDatabaseOrphanRecords(db);
    expect(orphans).toHaveLength(2);
    const epOrphan = orphans.find((o) => o.recordId === 'orphan-ep-1')!;
    const apptOrphan = orphans.find((o) => o.recordId === 'orphan-appt-1')!;

    // Cannot delete clinical orphan directly
    await expect(
      resolveOrphanRecord({ orphan: epOrphan, action: 'delete_non_clinical', database: db })
    ).rejects.toThrow(CannotDeleteFinalizedRecordError);

    // Can delete non-clinical orphan appointment & reassign clinical episode
    await resolveOrphanRecord({
      orphan: apptOrphan,
      action: 'delete_non_clinical',
      database: db,
    });
    await resolveOrphanRecord({
      orphan: epOrphan,
      action: 'reassign_patient',
      targetPatientId: 'valid-p1',
      dek,
      database: db,
    });
    expect(await scanDatabaseOrphanRecords(db)).toHaveLength(0);

    const health = computeClinicDataHealthReport({
      patients: [
        {
          id: 'valid-p1',
          createdAt: '2026-11-01T00:00:00.000Z',
          updatedAt: '2026-11-01T00:00:00.000Z',
          isArchived: 0,
          data: { fullName: 'Missing Phone', fullNameAr: 'بدون هاتف', gender: 'male' },
        },
      ],
      draftSessions: [
        {
          session: {
            id: 'draft-s1',
            patientId: 'valid-p1',
            episodeId: 'orphan-ep-1',
            sessionNumber: 1,
            sessionDate: '2026-11-01',
            sessionType: 'follow_up',
            attendanceStatus: 'attended',
            status: 'draft',
            createdAt: '2026-11-01T00:00:00.000Z',
            updatedAt: '2026-11-01T00:00:00.000Z',
            data: {
              sessionNumber: 1,
              sessionDate: '2026-11-01',
              sessionType: 'follow_up',
              attendanceStatus: 'attended',
              status: 'draft',
            },
          },
        },
      ],
      invoices: [
        {
          id: 'inv-u1',
          invoiceNumber: 'INV-1',
          patientId: 'valid-p1',
          patientName: 'بدون هاتف',
          date: '2026-11-01',
          invoiceType: 'single_session',
          titleAr: 'جلسة',
          titleEn: 'Session',
          totalAmountIQD: 25000,
          discountIQD: 0,
          netAmountIQD: 25000,
          paidAmountIQD: 0,
          balanceDueIQD: 25000,
          status: 'unpaid',
          payments: [],
          createdBy: 'Admin',
        },
      ],
      orphanRecords: [epOrphan],
      backupMeta: null,
      recoveryDrillDue: true,
    });

    expect(health.categories.map((c) => c.id)).toEqual([
      'missing_demographics',
      'unsigned_notes',
      'unpaid_invoices',
      'orphan_records',
      'unverified_backup',
    ]);
    expect(health.totalIssues).toBe(5);
  });

  it('D5: provides CC0-1.0 bilingual terminology glossary search, canonical resolution & print labels', () => {
    const aclResults = searchBilingualGlossary('ACL');
    expect(aclResults.length).toBeGreaterThanOrEqual(1);
    expect(aclResults[0].ar).toContain('الرباط الصليبي الأمامي');

    const arResults = searchBilingualGlossary('انزلاق غضروفي');
    expect(arResults.length).toBeGreaterThanOrEqual(1);

    const resolved = resolveCanonicalBilingualTerm('Lumbar Disc Herniation with Radiculopathy');
    expect(resolved.matched).toBe(true);
    expect(resolved.bilingual).toContain('انزلاق غضروفي قطني');

    const unknown = resolveCanonicalBilingualTerm('Custom Local Condition Note');
    expect(unknown.matched).toBe(false);
    expect(unknown.bilingual).toBe('Custom Local Condition Note');

    const arLabels = getPrintDocumentGlossaryLabels('ar');
    const enLabels = getPrintDocumentGlossaryLabels('en');
    expect(arLabels.diagnosisLabel).toBe('التشخيص الطبي');
    expect(enLabels.diagnosisLabel).toBe('Medical Diagnosis');
  });
});
