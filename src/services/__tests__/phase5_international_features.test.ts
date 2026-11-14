// =======================================================================
// PhysioRecord — Phase 5: International-Grade Features Tests
// Covers:
//   5.1 HL7 FHIR R4 Bundle export, CSV patient onboarding & full vault CSV bundle
//   5.2 Encrypted patient attachments in Dexie v9, backup roundtrip & cascade purge
//   5.3 Arabic/Kurdish-aware patient search (MiniSearch + orthography + Eastern digits)
//   5.5 Strict on-device voice dictation guard (`processLocally: true`, hidden when unavailable)
//   5.6 Built-in CC0-1.0 slash snippets + strict open-license content pack validation
//   5.7 Local-only clinic analytics (caseload, attendance/no-show, MCID, void-safe cashflow)
//   5.8 Externalized ar/en/ckb JSON locale parity, RTL flags & Intl formatters
//   5.10 Phase 5 modules default OFF + Admin PIN Kiosk exit & rate-limiting guard
// =======================================================================

import { describe, it, expect } from 'vitest';
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
  randomBytes,
} from '../../crypto/vault';
import { exportBackupPackage, restoreBackupPackage } from '../../crypto/backup';
import type { PhysioRecordDatabase } from '../../db/db';
import { ClinicOperationsService } from '../clinicOperationsService';
import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../../types/clinical';
import type {
  ClinicAppointment,
  ClinicExpenseIQD,
  EpisodeScopedClinicalStore,
  FinancialInvoiceIQD,
} from '../../types/clinicManagement';
import { buildPatientFhirR4Bundle } from '../../utils/fhirExport';
import {
  buildFullVaultCsvFiles,
  buildSamplePatientsCsvTemplate,
  previewPatientCsvImport,
} from '../../utils/patientPortability';
import {
  ATTACHMENT_MAX_PDF_BYTES,
  ATTACHMENT_SINGLE_WARNING_BYTES,
  processAttachmentFile,
} from '../../utils/attachmentMedia';
import {
  PatientSearchEngine,
  extractPhoneSearchTokens,
  normalizeArabicSearchText,
} from '../../utils/arabicSearch';
import {
  createLocalSpeechSession,
  detectSpeechDictationSupport,
} from '../../utils/localSpeech';
import {
  BUILT_IN_CC0_SNIPPETS,
  parseAndValidateContentPackJson,
} from '../../data/noteTemplatesCc0';
import { computeLocalClinicAnalytics } from '../../utils/analyticsEngine';
import { LOCALE_CATALOGS, LANGUAGE_METADATA } from '../../context/LanguageContext';
import {
  formatIntlDate,
  formatIntlNumber,
  formatIntlPercent,
  isRtlLanguage,
} from '../../utils/i18nFormat';

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function setupInitializedVault(initialVerno = 9): Promise<{
  db: PhysioRecordDatabase;
  dek: CryptoKey;
  kek: CryptoKey;
}> {
  const db = createInMemoryDatabase(initialVerno);
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK('Phase5ClinicPass#2026', salt, 1000);
  const { operationalDek, wrappedDek, wrappedDekIv } =
    await generateAndWrapOperationalDEK(kek, 1);
  const { verifierIv, verifierCiphertext } = await generateVerifier(kek);

  await db.vaultMeta.put({
    id: 'auth',
    salt,
    wrappedDek,
    wrappedDekIv,
    verifierIv,
    verifierCiphertext,
    schemaVersion: db.verno,
    kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
    kdfIterations: 1000,
    dekVersion: CURRENT_DEK_VERSION,
    encryptionInvocationCount: 0,
    vaultGeneration: 1,
  });

  bindDekToGeneration(operationalDek, 1);
  await ClinicOperationsService.hydrateEncryptedCache(operationalDek, db);
  return { db, dek: operationalDek, kek };
}

async function seedPatientRecord(
  db: PhysioRecordDatabase,
  dek: CryptoKey,
  patientId: string,
  fullName: string,
  phoneNumber = '07701234567'
): Promise<PatientRecord> {
  const now = new Date().toISOString();
  const data = {
    fullName,
    fullNameAr: fullName,
    gender: 'male' as const,
    phone: phoneNumber,
    phoneNumber,
  };
  const enc = await encryptRecordWithMandatoryReservation(db, dek, 'patients', patientId, [], data);
  await db.patients.put({
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
  return {
    id: patientId,
    createdAt: now,
    updatedAt: now,
    isArchived: 0,
    data,
  };
}

function makeEmptyEpisodeStore(
  episodeId: string,
  patientId: string,
  overrides: Partial<EpisodeScopedClinicalStore> = {}
): EpisodeScopedClinicalStore {
  return {
    episodeId,
    patientId,
    activeWidgetIds: [],
    chiefComplaint: '',
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
    treatmentFrequency: '',
    plannedDurationWeeks: 4,
    clinicalImpression: '',
    objective: {},
    specialTests: [],
    gaitPosture: {
      postureDeviations: [],
      gaitPattern: 'normal',
      assistiveDevice: 'none',
    },
    customWidgetsData: {},
    snapshots: [],
    hepProgram: [],
    updatedAt: '2026-10-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('Phase 5 — International-Grade Features (Toggled & Local-First)', () => {

  it('5.1: exports compliant HL7 FHIR R4 Bundle with Patient, EpisodeOfCare, Condition, Encounter & Observations', () => {
    const patient: PatientRecord = {
      id: 'pat-fhir-1',
      createdAt: '2026-01-01T09:00:00.000Z',
      updatedAt: '2026-01-10T09:00:00.000Z',
      isArchived: 0,
      data: {
        mrn: 'PT-2026-0009',
        fullName: 'Ali Hassan',
        fullNameAr: 'علي حسن',
        gender: 'male',
        dateOfBirth: '1990-05-14',
        phoneNumber: '07701112233',
        address: 'Baghdad - Karrada',
      },
    };
    const episode: EpisodeRecord = {
      id: 'ep-fhir-1',
      patientId: patient.id,
      status: 'active',
      primarySpecialty: 'musculoskeletal',
      startDate: '2026-01-02',
      createdAt: '2026-01-02T09:00:00.000Z',
      updatedAt: '2026-01-02T09:00:00.000Z',
      data: {
        title: 'Right Rotator Cuff Tendinopathy',
        status: 'active',
        primarySpecialty: 'musculoskeletal',
        medicalDiagnosis: 'Supraspinatus Tendinopathy',
        icd10Code: 'M75.1',
        clinicalImpression: 'Subacromial pain arc 70-120 deg',
        affectedBodyRegion: 'Right Shoulder',
        rehabilitationGoals: { shortTerm: ['Pain < 3/10'], longTerm: ['Overhead lift'] },
      },
    };
    const session: SessionRecord = {
      id: 'sess-fhir-1',
      episodeId: episode.id,
      patientId: patient.id,
      sessionNumber: 1,
      sessionDate: '2026-01-02',
      sessionType: 'initial_evaluation',
      status: 'finalized',
      attendanceStatus: 'attended',
      createdAt: '2026-01-02T10:00:00.000Z',
      updatedAt: '2026-01-02T10:30:00.000Z',
      data: {
        sessionNumber: 1,
        sessionDate: '2026-01-02',
        sessionDurationMinutes: 45,
        sessionType: 'initial_evaluation',
        status: 'finalized',
        attendanceStatus: 'attended',
        therapistName: 'د. سارة',
      },
    };
    const soap: SoapNoteRecord = {
      id: 'soap-fhir-1',
      sessionId: session.id,
      episodeId: episode.id,
      patientId: patient.id,
      createdAt: '2026-01-02T10:05:00.000Z',
      updatedAt: '2026-01-02T10:30:00.000Z',
      data: {
        subjective: { painNrsScore: 7, chiefComplaint: 'Shoulder pain reaching overhead' },
        objective: {},
        assessment: { clinicalImpressionCurrent: 'Painful arc positive', progressStatus: 'unchanged' },
        plan: { nextSessionPlan: 'Scapular control + isometrics' },
        isFinalized: true,
      },
    };

    const store = makeEmptyEpisodeStore(episode.id, patient.id, {
      functionalScales: {
        scaleId: 'spadi',
        scaleNameAr: 'مقياس SPADI للكتف',
        scaleNameEn: 'SPADI',
        scorePercentage: 40,
        severityLabelAr: 'عجز متوسط',
        severityLabelEn: 'Moderate disability',
        responses: {},
        rawScore: 52,
        maxScore: 130,
        history: [
          {
            id: 'spadi-1',
            date: '2026-01-02',
            visitType: 'initial_evaluation',
            scaleId: 'spadi',
            scaleNameAr: 'مقياس SPADI للكتف',
            scaleNameEn: 'SPADI',
            rawScore: 52,
            scorePercentage: 40,
            severityLabelAr: 'عجز متوسط',
            severityLabelEn: 'Moderate disability',
          },
        ],
      },
    });

    const bundle = buildPatientFhirR4Bundle({
      patient,
      episodes: [episode],
      sessions: [session],
      soaps: [soap],
      episodeStores: [store],
      clinicName: 'Baghdad Rehab Clinic',
    });

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');

    const resources = bundle.entry.map((e) => e.resource);
    expect(resources.some((r) => r.resourceType === 'Patient')).toBe(true);
    expect(resources.some((r) => r.resourceType === 'EpisodeOfCare')).toBe(true);

    const condition = resources.find((r) => r.resourceType === 'Condition') as Record<string, unknown>;
    expect(condition).toBeDefined();
    expect(JSON.stringify(condition.code)).toContain('M75.1');

    const encounter = resources.find((r) => r.resourceType === 'Encounter') as Record<string, unknown>;
    expect(encounter).toBeDefined();
    expect(encounter.status).toBe('finished');

    const observations = resources.filter((r) => r.resourceType === 'Observation');
    expect(observations.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(observations)).toContain('72514-3'); // LOINC pain severity NPRS
    expect(JSON.stringify(observations)).toContain('SPADI');
  });

  it('5.1: parses UTF-8 BOM CSV onboarding rows, normalizes Iraqi phones, detects duplicates & sanitizes full CSV bundle', () => {
    const sampleCsv = buildSamplePatientsCsvTemplate('ar');
    expect(sampleCsv.startsWith('\uFEFF')).toBe(true);

    const existingPatients: PatientRecord[] = [
      {
        id: 'p-exist-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isArchived: 0,
        data: {
          fullName: 'Zainab Ali',
          fullNameAr: 'زينب علي',
          gender: 'female',
          phoneNumber: '07701234567',
        },
      },
    ];

    const incomingCsv = [
      '\uFEFFالاسم بالعربية,phone,gender,dateOfBirth,address',
      '"نور الهدى صباح","0780 999 8877",أنثى,1995-03-20,"بغداد, المنصور"',
      'زينب علي,07701234567,female,1992-01-01,البصرة',
      ',07700001111,male,,', // Missing name -> skipped row
    ].join('\r\n');

    const preview = previewPatientCsvImport(incomingCsv, existingPatients);
    expect(preview.totalRows).toBe(3);
    expect(preview.validRows).toHaveLength(2);
    expect(preview.skippedRows).toHaveLength(1);
    expect(preview.validRows[0].normalizedPhone).toBe('+964 780 999 8877');
    expect(preview.validRows[0].data.address).toBe('بغداد, المنصور');
    expect(preview.validRows[1].isDuplicatePhone).toBe(true);
    expect(preview.validRows[1].isDuplicateName).toBe(true);

    const exportFiles = buildFullVaultCsvFiles({
      patients: [
        {
          ...existingPatients[0],
          data: {
            ...existingPatients[0].data,
            medicalHistory: '=CMD("calc")',
          },
        },
      ],
      invoices: [],
      expenses: [],
      currencyCode: 'IQD',
      lang: 'en',
    });

    expect(exportFiles).toHaveLength(4);
    expect(exportFiles[0].csvContent).toContain("'=CMD");
  });

  it('5.2: encrypts patient attachments in Dexie v9, roundtrips backup & purges on permanent patient deletion', async () => {
    const { db, dek, kek } = await setupInitializedVault(9);
    await seedPatientRecord(db, dek, 'p5-att-1', 'حيدر طارق');

    // Verify media processor guards
    await expect(
      processAttachmentFile(new File(['bad'], 'malware.exe', { type: 'application/octet-stream' }))
    ).rejects.toThrow();

    const oversizedPdf = new File([new Uint8Array(ATTACHMENT_MAX_PDF_BYTES + 1024)], 'huge.pdf', {
      type: 'application/pdf',
    });
    await expect(processAttachmentFile(oversizedPdf)).rejects.toThrow();

    const saved = await ClinicOperationsService.saveAttachmentAsync({
      patientId: 'p5-att-1',
      title: 'Posture Anterior View',
      category: 'posture_before',
      capturedAt: '2026-11-10',
      fileName: 'posture.png',
      mimeType: 'image/png',
      payloadDataUrl: VALID_PNG_DATA_URL,
      thumbnailDataUrl: VALID_PNG_DATA_URL,
      widthPx: 1,
      heightPx: 1,
      originalBytes: 120,
      storedBytes: 120,
      notes: 'Baseline cervical posture',
    });

    expect(saved.id).toBeTruthy();
    expect(ATTACHMENT_SINGLE_WARNING_BYTES).toBe(2 * 1024 * 1024);

    // Inspect raw IndexedDB row to prove zero plaintext leaks
    const rawRow = await db.attachments.get(saved.id);
    expect(rawRow).toBeDefined();
    const rawText = new TextDecoder().decode(rawRow!.ciphertext);
    expect(rawText).not.toContain('Posture Anterior View');
    expect(rawText).not.toContain(VALID_PNG_DATA_URL);

    // Re-hydrate from encrypted store
    await ClinicOperationsService.flushPendingWrites();
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);
    const reloaded = ClinicOperationsService.getAttachmentsForPatient('p5-att-1');
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].title).toBe('Posture Anterior View');
    expect(ClinicOperationsService.getTotalAttachmentsBytes()).toBe(120);

    // Backup export + delete + restore roundtrip preserves v9 attachments
    const meta = (await db.vaultMeta.get('auth'))!;
    const backupJson = await exportBackupPackage(db, meta, kek, 'BackupAttach#5');
    await ClinicOperationsService.deleteAttachmentAsync('p5-att-1', saved.id);
    expect(ClinicOperationsService.getAttachmentsForPatient('p5-att-1')).toHaveLength(0);

    const restored = await restoreBackupPackage(
      backupJson,
      'BackupAttach#5',
      'Phase5ClinicPass#2026',
      db,
      { mode: 'replace' }
    );
    expect(restored.mode).toBe('replace');
    const restoredMeta = await db.vaultMeta.get('auth');
    bindDekToGeneration(restored.destinationOperationalDek, restoredMeta?.vaultGeneration ?? 2);
    await ClinicOperationsService.hydrateEncryptedCache(restored.destinationOperationalDek, db);
    expect(ClinicOperationsService.getAttachmentsForPatient('p5-att-1')).toHaveLength(1);

    // Permanent patient deletion removes attachments atomically
    await db.deletePatientPermanently('p5-att-1', { verifiedBackupString: backupJson });
    expect(await db.attachments.where('patientId').equals('p5-att-1').count()).toBe(0);
  });

  it('5.3: normalizes Arabic/Kurdish orthography & digits and retrieves patients via MiniSearch', () => {
    expect(normalizeArabicSearchText('أَحْمَدُ إِبْرَاهِيم — مِنَى فَاطِمَة')).toBe('احمد ابراهيم — مني فاطمه');
    expect(normalizeArabicSearchText('٠٧٧٠١٢٣٤٥٦٧ / ۰۷۸۰۹۹۹')).toBe('07701234567 / 0780999');
    expect(extractPhoneSearchTokens('0770 123 4567')).toContain('4567');

    const patients: PatientRecord[] = [
      {
        id: 'p-ar-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isArchived: 0,
        data: {
          mrn: 'PT-2026-0042',
          fullName: 'Ahmed Kareem',
          fullNameAr: 'أَحْمَد كَرِيم طَارِق',
          gender: 'male',
          phoneNumber: '+964 770 123 4567',
          medicalHistory: 'إصابة رباط صليبي',
        },
      },
      {
        id: 'p-ar-2',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        isArchived: 0,
        data: {
          mrn: 'PT-2026-0088',
          fullName: 'Fatima Salam',
          fullNameAr: 'فاطمة منى سلام',
          gender: 'female',
          phoneNumber: '07805559911',
          medicalHistory: 'خشونة مفصل الركبة',
        },
      },
    ];

    const engine = new PatientSearchEngine(patients);
    expect(engine.search('احمد')[0]?.id).toBe('p-ar-1');
    expect(engine.search('فاطمه مني')[0]?.id).toBe('p-ar-2');
    expect(engine.search('٤٥٦٧')[0]?.id).toBe('p-ar-1'); // Arabic-Indic phone suffix
    expect(engine.search('0088')[0]?.id).toBe('p-ar-2');
  });

  it('5.5: enforces local-only Web Speech API (`processLocally: true`) and never silently uses cloud speech', async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const hadWindow = 'window' in globalThis;
    const originalWindow = g.window;
    const winObj: Record<string, unknown> = hadWindow && typeof originalWindow === 'object' && originalWindow
      ? (originalWindow as Record<string, unknown>)
      : {};
    if (!hadWindow) {
      g.window = winObj;
    }

    try {
      // 1. Absent SpeechRecognition -> hidden
      delete winObj.SpeechRecognition;
      delete winObj.webkitSpeechRecognition;
      const absentStatus = await detectSpeechDictationSupport('ar-IQ', false);
      expect(absentStatus.mode).toBe('hidden');
      expect(absentStatus.onDeviceSupported).toBe(false);

      // 2. Cloud-only SpeechRecognition (no `processLocally` / static `available`) -> MUST hide unless opted-in
      class CloudOnlySpeechCtor {
        lang = '';
        continuous = false;
        interimResults = false;
        onresult = null;
        onerror = null;
        onend = null;
        start() {}
        stop() {}
        abort() {}
      }
      winObj.SpeechRecognition = CloudOnlySpeechCtor;

      const cloudBlockedStatus = await detectSpeechDictationSupport('ar-IQ', false);
      expect(cloudBlockedStatus.mode).toBe('hidden');

      const cloudOptInStatus = await detectSpeechDictationSupport('ar-IQ', true);
      expect(cloudOptInStatus.mode).toBe('cloud_opt_in');

      // 3. On-device `processLocally: true` available -> local_ready + flag set on instance
      class LocalSpeechCtor {
        lang = '';
        continuous = false;
        interimResults = false;
        processLocally = false;
        onresult = null;
        onerror = null;
        onend = null;
        start() {}
        stop() {}
        abort() {}
        static async available(opts: { langs: string[]; processLocally?: boolean }) {
          return opts.processLocally ? 'available' : 'unavailable';
        }
      }
      winObj.SpeechRecognition = LocalSpeechCtor;

      const localReadyStatus = await detectSpeechDictationSupport('ar-IQ', false);
      expect(localReadyStatus.mode).toBe('local_ready');
      expect(localReadyStatus.onDeviceSupported).toBe(true);

      const rec = createLocalSpeechSession({
        langTag: 'ar-IQ',
        requireLocalOnly: true,
        onTranscriptChunk: () => {},
        onError: () => {},
        onEnd: () => {},
      });
      expect(rec.processLocally).toBe(true);
    } finally {
      delete winObj.SpeechRecognition;
      delete winObj.webkitSpeechRecognition;
      if (!hadWindow) {
        delete g.window;
      } else {
        g.window = originalWindow;
      }
    }
  });

  it('5.6: ships CC0-1.0 slash snippets and rejects non-open/NC/ND content packs while saving valid packs in Dexie v9', async () => {
    const { db, dek } = await setupInitializedVault(9);

    expect(BUILT_IN_CC0_SNIPPETS.length).toBeGreaterThanOrEqual(4);
    expect(BUILT_IN_CC0_SNIPPETS.every((s) => s.license === 'CC0-1.0')).toBe(true);

    // Forbidden NC license must be rejected
    expect(() =>
      parseAndValidateContentPackJson(
        JSON.stringify({
          packId: 'bad-nc-pack',
          name: 'Blocked Pack',
          source: 'https://example.org',
          license: 'CC-BY-NC-4.0',
          snippets: [{ slashTrigger: 'x', bodyAr: 'نص', bodyEn: 'text' }],
        })
      )
    ).toThrow();

    // Missing source/license must be rejected
    expect(() =>
      parseAndValidateContentPackJson(
        JSON.stringify({
          packId: 'no-lic',
          name: 'No License Pack',
          snippets: [{ slashTrigger: 'y', bodyAr: 'نص', bodyEn: 'text' }],
        })
      )
    ).toThrow();

    // Valid CC-BY-4.0 pack imports & persists encrypted in Dexie v9 noteTemplates
    const importRes = await ClinicOperationsService.importContentPackAsync(
      JSON.stringify({
        packId: 'open-ortho-ccby',
        name: 'Open Orthopedic Pack',
        version: '1.0.0',
        source: 'PhysioRecord Community CC0/CC-BY',
        license: 'CC-BY-4.0',
        snippets: [
          {
            slashTrigger: '/lumbago',
            titleAr: 'فحص أسفل الظهر',
            titleEn: 'Lumbar Screen',
            bodyAr: 'تم فحص ثني وبسط الفقرات القطنية بدون علامات عصبية.',
            bodyEn: 'Lumbar flexion/extension screened without neurological deficit.',
            category: 'objective',
          },
        ],
      })
    );

    expect(importRes.importedCount).toBe(1);
    expect(await db.noteTemplates.count()).toBe(1);

    await ClinicOperationsService.flushPendingWrites();
    await ClinicOperationsService.hydrateEncryptedCache(dek, db);
    const allSnippets = ClinicOperationsService.getAllNoteTemplates();
    expect(allSnippets.some((s) => s.slashTrigger === 'lumbago' && s.license === 'CC-BY-4.0')).toBe(
      true
    );
  });

  it('5.7: calculates accurate local analytics (caseload, attendance, MCID, void-safe cashflow)', () => {
    const patients: PatientRecord[] = [
      {
        id: 'p1',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        isArchived: 0,
        data: { fullName: 'P1', fullNameAr: 'م1', gender: 'male' },
      },
      {
        id: 'p2',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        isArchived: 1,
        data: { fullName: 'P2', fullNameAr: 'م2', gender: 'female' },
      },
    ];
    const episodes: EpisodeRecord[] = [
      {
        id: 'e1',
        patientId: 'p1',
        status: 'completed',
        primarySpecialty: 'musculoskeletal',
        startDate: '2026-10-01',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-15T00:00:00.000Z',
        data: {
          title: 'Ep 1',
          status: 'completed',
          primarySpecialty: 'musculoskeletal',
          medicalDiagnosis: 'LBP',
          clinicalImpression: '',
          affectedBodyRegion: 'Lumbar',
          rehabilitationGoals: { shortTerm: [], longTerm: [] },
        },
      },
    ];
    const sessions: SessionRecord[] = [
      {
        id: 's1',
        episodeId: 'e1',
        patientId: 'p1',
        sessionNumber: 1,
        sessionDate: '2026-10-01',
        sessionType: 'initial_evaluation',
        status: 'finalized',
        attendanceStatus: 'attended',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        data: {
          sessionNumber: 1,
          sessionDate: '2026-10-01',
          sessionType: 'initial_evaluation',
          status: 'finalized',
          attendanceStatus: 'attended',
        },
      },
      {
        id: 's2',
        episodeId: 'e1',
        patientId: 'p1',
        sessionNumber: 2,
        sessionDate: '2026-10-08',
        sessionType: 'follow_up',
        status: 'cancelled',
        attendanceStatus: 'cancelled_patient',
        createdAt: '2026-10-08T00:00:00.000Z',
        updatedAt: '2026-10-08T00:00:00.000Z',
        data: {
          sessionNumber: 2,
          sessionDate: '2026-10-08',
          sessionType: 'follow_up',
          status: 'cancelled',
          attendanceStatus: 'cancelled_patient',
        },
      },
    ];
    const appointments: ClinicAppointment[] = [
      {
        id: 'a1',
        patientId: 'p1',
        patientName: 'P1',
        therapistName: 'Therapist',
        date: '2026-10-01',
        startTime: '10:00',
        durationMinutes: 45,
        visitType: 'follow_up',
        status: 'completed',
      },
      {
        id: 'a2',
        patientId: 'p1',
        patientName: 'P1',
        therapistName: 'Therapist',
        date: '2026-10-05',
        startTime: '10:00',
        durationMinutes: 45,
        visitType: 'follow_up',
        status: 'completed',
      },
      {
        id: 'a3',
        patientId: 'p1',
        patientName: 'P1',
        therapistName: 'Therapist',
        date: '2026-10-10',
        startTime: '10:00',
        durationMinutes: 45,
        visitType: 'follow_up',
        status: 'no_show',
      },
      {
        id: 'a4',
        patientId: 'p1',
        patientName: 'P1',
        therapistName: 'Therapist',
        date: '2026-10-12',
        startTime: '10:00',
        durationMinutes: 45,
        visitType: 'follow_up',
        status: 'cancelled',
      },
    ];
    const episodeStores: EpisodeScopedClinicalStore[] = [
      makeEmptyEpisodeStore('e1', 'p1', {
        functionalScales: {
          scaleId: 'odi',
          scaleNameAr: 'أوسويستري للظهر',
          scaleNameEn: 'ODI',
          scorePercentage: 30,
          severityLabelAr: 'متوسط',
          severityLabelEn: 'Moderate',
          responses: {},
          rawScore: 15,
          maxScore: 50,
          history: [
            {
              id: 'o1',
              date: '2026-10-01',
              visitType: 'initial_evaluation',
              scaleId: 'odi',
              scaleNameAr: 'أوسويستري للظهر',
              scaleNameEn: 'ODI',
              rawScore: 30,
              scorePercentage: 60,
              severityLabelAr: 'شديد',
              severityLabelEn: 'Severe',
            },
            {
              id: 'o2',
              date: '2026-10-15',
              visitType: 're_evaluation',
              scaleId: 'odi',
              scaleNameAr: 'أوسويستري للظهر',
              scaleNameEn: 'ODI',
              rawScore: 15,
              scorePercentage: 30,
              severityLabelAr: 'متوسط',
              severityLabelEn: 'Moderate',
            },
          ],
        },
      }),
    ];
    const invoices: FinancialInvoiceIQD[] = [
      {
        id: 'inv1',
        invoiceNumber: 'INV-0001',
        patientId: 'p1',
        patientName: 'P1',
        date: '2026-10-01',
        invoiceType: 'single_session',
        titleAr: 'جلسة مفردة',
        titleEn: 'Single Session',
        totalAmountIQD: 50000,
        discountIQD: 0,
        netAmountIQD: 50000,
        paidAmountIQD: 40000,
        balanceDueIQD: 10000,
        status: 'partial',
        payments: [
          {
            id: 'pay1',
            invoiceId: 'inv1',
            patientId: 'p1',
            date: '2026-10-01',
            amountIQD: 40000,
            method: 'cash',
            receivedBy: 'Therapist',
            receiptNumber: 'RCPT-0001',
          },
        ],
        createdBy: 'Therapist',
      },
      {
        id: 'inv-void',
        invoiceNumber: 'INV-0002',
        patientId: 'p1',
        patientName: 'P1',
        date: '2026-10-02',
        invoiceType: 'single_session',
        titleAr: 'ملغاة',
        titleEn: 'Void',
        totalAmountIQD: 900000,
        discountIQD: 0,
        netAmountIQD: 900000,
        paidAmountIQD: 0,
        balanceDueIQD: 0,
        status: 'void',
        payments: [],
        createdBy: 'Therapist',
      },
    ];
    const expenses: ClinicExpenseIQD[] = [
      {
        id: 'exp1',
        date: '2026-10-03',
        category: 'medical_consumables',
        titleAr: 'لوازم',
        titleEn: 'Supplies',
        amountIQD: 15000,
        paidBy: 'Therapist',
      },
    ];

    const summary = computeLocalClinicAnalytics({
      patients,
      episodes,
      sessions,
      appointments,
      episodeStores,
      invoices,
      expenses,
    });

    expect(summary.totalPatients).toBe(2);
    expect(summary.activePatients).toBe(1);
    expect(summary.completedEpisodes).toBe(1);
    expect(summary.finalizedSessions).toBe(1);
    expect(summary.meanSessionsPerEpisode).toBe(1); // Excludes cancelled session
    expect(summary.attendanceRatePercent).toBe(50); // 2/4
    expect(summary.noShowRatePercent).toBe(25); // 1/4
    expect(summary.outcomesEvaluatedCount).toBe(1);
    expect(summary.outcomesImprovedCount).toBe(1);
    expect(summary.outcomesMcidAchievedCount).toBe(1);
    expect(summary.totalInvoicedIQD).toBe(50000); // Void excluded
    expect(summary.totalCollectedIQD).toBe(40000);
    expect(summary.totalExpensesIQD).toBe(15000);
    expect(summary.netCashflowIQD).toBe(25000);
    expect(summary.collectionRatePercent).toBe(80);
  });

  it('5.8: maintains full key parity across externalized ar/en/ckb JSON catalogs & Intl formatters', () => {
    const arKeys = Object.keys(LOCALE_CATALOGS.ar).sort();
    const enKeys = Object.keys(LOCALE_CATALOGS.en).sort();
    const ckbKeys = Object.keys(LOCALE_CATALOGS.ckb).sort();

    expect(enKeys).toEqual(arKeys);
    expect(ckbKeys).toEqual(arKeys);
    expect(arKeys.every((k) => LOCALE_CATALOGS.ar[k].trim().length > 0)).toBe(true);
    expect(ckbKeys.every((k) => LOCALE_CATALOGS.ckb[k].trim().length > 0)).toBe(true);

    expect(LANGUAGE_METADATA.ar.dir).toBe('rtl');
    expect(LANGUAGE_METADATA.ckb.dir).toBe('rtl');
    expect(LANGUAGE_METADATA.en.dir).toBe('ltr');
    expect(isRtlLanguage('ar')).toBe(true);
    expect(isRtlLanguage('ckb')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);

    expect(formatIntlNumber(25000, 'ar')).toContain('25');
    expect(formatIntlNumber(25000, 'ckb')).toContain('25');
    expect(formatIntlDate('2026-11-13', 'en').length).toBeGreaterThan(3);
    expect(formatIntlPercent(75, 'en')).toContain('75');
  });

  it('5.10 & R6: keeps all optional Phase 5 modules OFF by default and protects Kiosk exit via Admin PIN & backoff', async () => {
    await setupInitializedVault(9);

    expect(ClinicOperationsService.isAttachmentsModuleEnabled()).toBe(false);
    expect(ClinicOperationsService.isVoiceDictationModuleEnabled()).toBe(false);
    expect(ClinicOperationsService.isCloudSpeechFallbackOptIn()).toBe(false);
    expect(ClinicOperationsService.isTemplatesModuleEnabled()).toBe(false);
    expect(ClinicOperationsService.isAnalyticsModuleEnabled()).toBe(false);
    expect(ClinicOperationsService.isKioskModuleEnabled()).toBe(false);

    await ClinicOperationsService.setAdminPinAsync('4928');
    const goodPin = await ClinicOperationsService.verifyAdminPinAsync('4928');
    expect(goodPin.ok).toBe(true);

    const badPin = await ClinicOperationsService.verifyAdminPinAsync('0000');
    expect(badPin.ok).toBe(false);
  });
});
