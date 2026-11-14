// =======================================================================
// PhysioRecord — Phase D Data Quality, Import, Recycle Bin & Health Engine
// Covers:
//   D1: Duplicate Patient Guard + Transactional Merge w/ Pre-Merge Snapshot
//   D2: CSV + Zero-Dependency XLSX Import Wizard, Auto-Guess, Dry-Run & Rollback
//   D3: 30-Day Non-Clinical Recycle Bin (Finalized Clinical Records Protected)
//   D4: Clinic Data Health Screen & Orphan Record Scanner
// License: GPL-3.0-or-later (original in-house implementation, 0 external deps)
// =======================================================================

import { db as defaultDb, type PhysioRecordDatabase } from '../db/db';
import { CLINICAL_STORES_REGISTRY, extractAndValidateParentIds } from '../db/registry';
import {
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  LEGACY_RECORD_CRYPTO_VERSION_V1,
  atomicReserveInvocationCount,
  decryptRecordPayload,
  encryptRecordPayload,
} from '../crypto/vault';
import { recoveryDb } from '../crypto/recovery';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import {
  CannotDeleteFinalizedRecordError,
  type EpisodeClinicalData,
  type PatientClinicalData,
  type PatientRecord,
  type SessionRecord,
  type SoapNoteRecord,
} from '../types/clinical';
import type {
  BackupStateMetadata,
  ClinicAppointment,
  ClinicExpenseIQD,
  ClinicRoleId,
  FinancialInvoiceIQD,
  PatientMedicationPlan,
  RecycleBinEntry,
  RecycleBinItemType,
  WaitingListEntry,
} from '../types/clinicManagement';
import { normalizeArabicSearchText } from './arabicSearch';
import { computePatientAge, localDate, normalizeIraqiPhoneStorage } from './date';
import { ensureUniquePatientMrn, getPatientMrn } from './mrn';
import { parseCsvMatrix } from './patientPortability';

// =======================================================================
// D1: DUPLICATE GUARD & TRANSACTIONAL PATIENT MERGE
// =======================================================================

export type DuplicateMatchConfidence =
  | 'exact_name_and_phone'
  | 'phone_suffix_match'
  | 'normalized_name_match';

export interface DuplicatePatientMatch {
  patient: PatientRecord;
  matchConfidence: DuplicateMatchConfidence;
  matchedByName: boolean;
  matchedByPhoneSuffix: boolean;
  matchedPhoneSuffix: string;
}

export interface DuplicatePatientPair {
  primary: PatientRecord;
  duplicate: PatientRecord;
  matchReasons: Array<'name' | 'phone_suffix'>;
}

/**
 * Normalizes any phone number string (including Eastern Arabic / Persian numerals)
 * and extracts its canonical 7-digit subscriber suffix (e.g. `0770 123 4567` -> `1234567`).
 */
export function extractCanonicalPhoneSuffix7(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  const digits = normalizeArabicSearchText(rawPhone).replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-7);
}

function getNormalizedNames(data: { fullNameAr?: string; fullName?: string }): string[] {
  const candidates = [data.fullNameAr, data.fullName]
    .map((s) => normalizeArabicSearchText(s))
    .filter((s) => s.length >= 2);
  return Array.from(new Set(candidates));
}

export function detectPatientDuplicates(
  candidate: {
    id?: string;
    fullNameAr?: string;
    fullName?: string;
    phoneNumber?: string;
    phone?: string;
  },
  existingPatients: PatientRecord[]
): DuplicatePatientMatch[] {
  const candidateNames = getNormalizedNames(candidate);
  const candidateSuffix = extractCanonicalPhoneSuffix7(
    candidate.phoneNumber || candidate.phone
  );

  if (candidateNames.length === 0 && !candidateSuffix) {
    return [];
  }

  const matches: DuplicatePatientMatch[] = [];
  for (const patient of existingPatients) {
    if (candidate.id && patient.id === candidate.id) continue;

    const existingNames = getNormalizedNames(patient.data);
    const existingSuffix = extractCanonicalPhoneSuffix7(
      patient.data.phoneNumber || patient.data.phone
    );

    const matchedByName =
      candidateNames.length > 0 &&
      existingNames.some((en) => candidateNames.includes(en));

    const matchedByPhoneSuffix =
      Boolean(candidateSuffix) &&
      Boolean(existingSuffix) &&
      candidateSuffix === existingSuffix;

    if (!matchedByName && !matchedByPhoneSuffix) continue;

    const matchConfidence: DuplicateMatchConfidence =
      matchedByName && matchedByPhoneSuffix
        ? 'exact_name_and_phone'
        : matchedByPhoneSuffix
        ? 'phone_suffix_match'
        : 'normalized_name_match';

    matches.push({
      patient,
      matchConfidence,
      matchedByName,
      matchedByPhoneSuffix,
      matchedPhoneSuffix: matchedByPhoneSuffix ? candidateSuffix : '',
    });
  }

  const weight: Record<DuplicateMatchConfidence, number> = {
    exact_name_and_phone: 3,
    phone_suffix_match: 2,
    normalized_name_match: 1,
  };

  return matches.sort((a, b) => weight[b.matchConfidence] - weight[a.matchConfidence]);
}

export function findAllDirectoryDuplicatePairs(
  patients: PatientRecord[]
): DuplicatePatientPair[] {
  const active = patients.filter((p) => p.isArchived !== 1 && !p.data.isDemo);
  const pairs: DuplicatePatientPair[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const namesA = getNormalizedNames(a.data);
    const suffixA = extractCanonicalPhoneSuffix7(a.data.phoneNumber || a.data.phone);

    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      const namesB = getNormalizedNames(b.data);
      const suffixB = extractCanonicalPhoneSuffix7(b.data.phoneNumber || b.data.phone);

      const matchedByName = namesA.length > 0 && namesB.some((n) => namesA.includes(n));
      const matchedByPhone = Boolean(suffixA && suffixB && suffixA === suffixB);
      if (!matchedByName && !matchedByPhone) continue;

      const pairKey = [a.id, b.id].sort().join('::');
      if (seenKeys.has(pairKey)) continue;
      seenKeys.add(pairKey);

      const matchReasons: Array<'name' | 'phone_suffix'> = [];
      if (matchedByName) matchReasons.push('name');
      if (matchedByPhone) matchReasons.push('phone_suffix');

      // Prefer older record as surviving primary
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      const [primary, duplicate] = aTime <= bTime ? [a, b] : [b, a];
      pairs.push({ primary, duplicate, matchReasons });
    }
  }

  return pairs;
}

export interface PatientMergeSummary {
  snapshotId: string;
  survivingPatientId: string;
  sourcePatientId: string;
  movedCounts: {
    episodes: number;
    sessions: number;
    soapNotes: number;
    clinicalAddenda: number;
    episodeClinical: number;
    appointments: number;
    waitingList: number;
    invoices: number;
    payments: number;
    expenses: number;
    recurringSchedules: number;
    patientMedications: number;
    consents: number;
    attachments: number;
    drafts: number;
  };
}

interface SerializedMergeEntity {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  iv: number[];
  ciphertext: number[];
  recordSalt?: number[];
  recordCryptoVersion?: number;
  dekVersion?: number;
  [key: string]: unknown;
}

interface EncryptedPreMergeSnapshotEnvelope {
  kind: 'pre_merge_patient_snapshot_v1';
  snapshotId: string;
  survivingPatientId: string;
  sourcePatientId: string;
  createdAt: string;
  recordCryptoVersion: number;
  dekVersion: number;
  iv: number[];
  ciphertext: number[];
  recordSalt?: number[];
}

function serializeRawEntity(row: Record<string, unknown>): SerializedMergeEntity {
  const iv = row.iv instanceof Uint8Array ? Array.from(row.iv) : Array.isArray(row.iv) ? row.iv : [];
  const ciphertext =
    row.ciphertext instanceof Uint8Array
      ? Array.from(row.ciphertext)
      : Array.isArray(row.ciphertext)
      ? row.ciphertext
      : [];
  const recordSalt =
    row.recordSalt instanceof Uint8Array
      ? Array.from(row.recordSalt)
      : Array.isArray(row.recordSalt)
      ? row.recordSalt
      : undefined;
  return {
    ...row,
    id: String(row.id),
    iv,
    ciphertext,
    ...(recordSalt ? { recordSalt } : {}),
  };
}

function deserializeRawEntity(row: SerializedMergeEntity): Record<string, unknown> {
  return {
    ...row,
    iv: new Uint8Array(row.iv),
    ciphertext: new Uint8Array(row.ciphertext),
    ...(row.recordSalt ? { recordSalt: new Uint8Array(row.recordSalt) } : {}),
  };
}

function mergeDistinctStrings(a?: string[], b?: string[]): string[] | undefined {
  const merged = Array.from(new Set([...(a || []), ...(b || [])].filter(Boolean)));
  return merged.length > 0 ? merged : undefined;
}

function appendUniqueNoteText(primary?: string, secondary?: string): string | undefined {
  const a = primary?.trim() || '';
  const b = secondary?.trim() || '';
  if (!a) return b || undefined;
  if (!b || a.includes(b)) return a;
  return `${a}\n---\n${b}`;
}

function buildMergedPatientClinicalData(
  surviving: PatientClinicalData,
  source: PatientClinicalData,
  sourcePatientId: string
): PatientClinicalData {
  const existingChecklist = surviving.redFlagChecklist || [];
  const seenChecklistIds = new Set(existingChecklist.map((item) => item.itemId));
  const mergedChecklist = [...existingChecklist];
  for (const item of source.redFlagChecklist || []) {
    if (!seenChecklistIds.has(item.itemId)) {
      mergedChecklist.push(item);
      seenChecklistIds.add(item.itemId);
    }
  }

  const existingAttachments = surviving.attachments || [];
  const seenAttachmentIds = new Set(existingAttachments.map((att) => att.id));
  const mergedAttachments = [...existingAttachments];
  for (const att of source.attachments || []) {
    if (!seenAttachmentIds.has(att.id)) {
      mergedAttachments.push(att);
      seenAttachmentIds.add(att.id);
    }
  }

  const mergedStructuredPrecautions = mergeDistinctStrings(
    surviving.structuredPrecautions,
    source.structuredPrecautions
  ) as PatientClinicalData['structuredPrecautions'];

  const mergedTags = mergeDistinctStrings(surviving.tags, source.tags);
  const mergedLineage = mergeDistinctStrings(surviving.mergedFromPatientIds, [
    ...(source.mergedFromPatientIds || []),
    sourcePatientId,
  ]);

  return {
    ...surviving,
    fullNameAr: surviving.fullNameAr?.trim() || source.fullNameAr?.trim() || surviving.fullName,
    fullName: surviving.fullName?.trim() || source.fullName?.trim() || surviving.fullNameAr || '',
    phoneNumber:
      surviving.phoneNumber?.trim() ||
      surviving.phone?.trim() ||
      source.phoneNumber?.trim() ||
      source.phone?.trim(),
    phone:
      surviving.phoneNumber?.trim() ||
      surviving.phone?.trim() ||
      source.phoneNumber?.trim() ||
      source.phone?.trim(),
    dateOfBirth: surviving.dateOfBirth || source.dateOfBirth,
    age: computePatientAge(surviving.dateOfBirth || source.dateOfBirth, surviving.age ?? source.age),
    address: surviving.address?.trim() || source.address?.trim(),
    occupation: surviving.occupation?.trim() || source.occupation?.trim(),
    referringPhysician: surviving.referringPhysician?.trim() || source.referringPhysician?.trim(),
    referringClinic: surviving.referringClinic?.trim() || source.referringClinic?.trim(),
    referralSourceType: surviving.referralSourceType || source.referralSourceType,
    referringDoctorId: surviving.referringDoctorId || source.referringDoctorId,
    referralNotes: appendUniqueNoteText(surviving.referralNotes, source.referralNotes),
    emergencyContactName:
      surviving.emergencyContactName?.trim() || source.emergencyContactName?.trim(),
    emergencyContactRelation:
      surviving.emergencyContactRelation?.trim() || source.emergencyContactRelation?.trim(),
    emergencyContactPhone:
      surviving.emergencyContactPhone?.trim() || source.emergencyContactPhone?.trim(),
    medicalHistory: appendUniqueNoteText(surviving.medicalHistory, source.medicalHistory),
    previousSurgeries: appendUniqueNoteText(surviving.previousSurgeries, source.previousSurgeries),
    currentMedications: appendUniqueNoteText(
      surviving.currentMedications,
      source.currentMedications
    ),
    allergies: appendUniqueNoteText(surviving.allergies, source.allergies),
    comorbidities: appendUniqueNoteText(surviving.comorbidities, source.comorbidities),
    precautions: appendUniqueNoteText(surviving.precautions, source.precautions),
    contraindications: appendUniqueNoteText(
      surviving.contraindications,
      source.contraindications
    ),
    redFlags: appendUniqueNoteText(surviving.redFlags, source.redFlags),
    psychosocialFactors: appendUniqueNoteText(
      surviving.psychosocialFactors,
      source.psychosocialFactors
    ),
    generalNotes: appendUniqueNoteText(surviving.generalNotes, source.generalNotes),
    guardianName: surviving.guardianName?.trim() || source.guardianName?.trim(),
    guardianPhone: surviving.guardianPhone?.trim() || source.guardianPhone?.trim(),
    guardianRelation: surviving.guardianRelation?.trim() || source.guardianRelation?.trim(),
    pediatricConsentGranted:
      surviving.pediatricConsentGranted ?? source.pediatricConsentGranted,
    ...(mergedStructuredPrecautions ? { structuredPrecautions: mergedStructuredPrecautions } : {}),
    ...(mergedChecklist.length > 0 ? { redFlagChecklist: mergedChecklist } : {}),
    ...(mergedAttachments.length > 0
      ? { attachments: mergedAttachments, attachmentsCount: mergedAttachments.length }
      : {}),
    ...(mergedTags ? { tags: mergedTags } : {}),
    mergedFromPatientIds: mergedLineage,
    profileSummaryUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Phase D1 Transactional Merge:
 * 1. Captures an encrypted pre-merge safety snapshot in `recoveryDb.recoverySnapshots` BEFORE
 *    mutating any table in `PhysioRecordDB`.
 * 2. Moves all episodes, sessions, SOAP notes (preserving SHA-256 content seals), clinical addenda,
 *    episode clinical stores, appointments, waiting-list entries, invoices, payments, expenses,
 *    recurring schedules, medications, consents, attachments, and drafts under `survivingPatientId`.
 * 3. Verifies every staged record decrypts cleanly before committing inside a single Dexie rw tx.
 * 4. Deletes `sourcePatientId` and writes a hash-chained `patient_merged` audit log entry.
 */
export async function mergePatientsTransactional(params: {
  survivingPatientId: string;
  sourcePatientId: string;
  dek: CryptoKey;
  database?: PhysioRecordDatabase;
}): Promise<PatientMergeSummary> {
  const { survivingPatientId, sourcePatientId, dek, database = defaultDb } = params;
  if (!survivingPatientId || !sourcePatientId || survivingPatientId === sourcePatientId) {
    throw new Error('معرفا المريضين للدمج غير صالحين أو متطابقين.');
  }

  const vaultMeta = await database.vaultMeta.get('auth');
  const activeDekVersion = vaultMeta?.dekVersion || CURRENT_DEK_VERSION;

  const survivingEntity = await database.patients.get(survivingPatientId);
  const sourceEntity = await database.patients.get(sourcePatientId);
  if (!survivingEntity || !sourceEntity) {
    throw new Error('تعذر العثور على أحد سجلي المريضين المطلوب دمجهما.');
  }

  const decryptWithEntity = async <T>(
    tableName: string,
    entity: {
      id: string;
      iv: Uint8Array;
      ciphertext: Uint8Array;
      recordCryptoVersion?: number;
      dekVersion?: number;
      recordSalt?: Uint8Array;
    },
    parentIds: string[]
  ): Promise<T> => {
    return await decryptRecordPayload<T>(
      dek,
      tableName,
      entity.id,
      parentIds,
      new Uint8Array(entity.iv),
      new Uint8Array(entity.ciphertext),
      entity.recordCryptoVersion || LEGACY_RECORD_CRYPTO_VERSION_V1,
      entity.dekVersion || activeDekVersion,
      entity.recordSalt ? new Uint8Array(entity.recordSalt) : undefined
    );
  };

  const survivingData = await decryptWithEntity<PatientClinicalData>('patients', survivingEntity, []);
  const sourceData = await decryptWithEntity<PatientClinicalData>('patients', sourceEntity, []);

  // Collect raw records belonging to either patient for pre-merge safety snapshot
  const bothIds = [survivingPatientId, sourcePatientId];
  const snapTables: Record<string, SerializedMergeEntity[]> = {
    patients: [survivingEntity, sourceEntity].map((r) =>
      serializeRawEntity(r as unknown as Record<string, unknown>)
    ),
    episodes: (await database.episodes.where('patientId').anyOf(bothIds).toArray()).map((r) =>
      serializeRawEntity(r as unknown as Record<string, unknown>)
    ),
    sessions: (await database.sessions.where('patientId').anyOf(bothIds).toArray()).map((r) =>
      serializeRawEntity(r as unknown as Record<string, unknown>)
    ),
    soapNotes: (await database.soapNotes.where('patientId').anyOf(bothIds).toArray()).map((r) =>
      serializeRawEntity(r as unknown as Record<string, unknown>)
    ),
    clinicalAddenda: (
      await database.clinicalAddenda.where('patientId').anyOf(bothIds).toArray()
    ).map((r) => serializeRawEntity(r as unknown as Record<string, unknown>)),
    episodeClinical: (
      await database.episodeClinical.where('patientId').anyOf(bothIds).toArray()
    ).map((r) => serializeRawEntity(r as unknown as Record<string, unknown>)),
    appointments: (
      await database.appointments.where('patientId').anyOf(bothIds).toArray()
    ).map((r) => serializeRawEntity(r as unknown as Record<string, unknown>)),
    waitingList: (
      await database.waitingList.where('patientId').anyOf(bothIds).toArray()
    ).map((r) => serializeRawEntity(r as unknown as Record<string, unknown>)),
    invoices: (await database.invoices.where('patientId').anyOf(bothIds).toArray()).map((r) =>
      serializeRawEntity(r as unknown as Record<string, unknown>)
    ),
    payments: (await database.payments.where('patientId').anyOf(bothIds).toArray()).map((r) =>
      serializeRawEntity(r as unknown as Record<string, unknown>)
    ),
  };

  if (database.verno >= 7) {
    snapTables.recurringSchedules = (
      await database.recurringSchedules.where('patientId').anyOf(bothIds).toArray()
    ).map((r) => serializeRawEntity(r as unknown as Record<string, unknown>));
    snapTables.patientMedications = (
      await database.patientMedications.where('patientId').anyOf(bothIds).toArray()
    ).map((r) => serializeRawEntity(r as unknown as Record<string, unknown>));
  }
  if (database.verno >= 8) {
    snapTables.consents = (await database.consents.where('patientId').anyOf(bothIds).toArray()).map(
      (r) => serializeRawEntity(r as unknown as Record<string, unknown>)
    );
  }
  if (database.verno >= 9) {
    snapTables.attachments = (
      await database.attachments.where('patientId').anyOf(bothIds).toArray()
    ).map((r) => serializeRawEntity(r as unknown as Record<string, unknown>));
  }
  if (database.verno >= 10) {
    snapTables.drafts = (await database.drafts.where('patientId').anyOf(bothIds).toArray()).map(
      (r) => serializeRawEntity(r as unknown as Record<string, unknown>)
    );
  }

  // Step 1: Persist & verify encrypted pre-merge safety snapshot BEFORE modifying PhysioRecordDB
  const snapshotId = `pre_merge_${Date.now()}_${sourcePatientId.slice(0, 8)}`;
  const snapshotCreatedAt = new Date().toISOString();
  const encryptedSnap = await encryptRecordPayload(
    dek,
    'mergeSnapshots',
    snapshotId,
    [survivingPatientId, sourcePatientId],
    snapTables,
    CURRENT_RECORD_CRYPTO_VERSION,
    activeDekVersion
  );
  const envelope: EncryptedPreMergeSnapshotEnvelope = {
    kind: 'pre_merge_patient_snapshot_v1',
    snapshotId,
    survivingPatientId,
    sourcePatientId,
    createdAt: snapshotCreatedAt,
    recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
    dekVersion: activeDekVersion,
    iv: Array.from(encryptedSnap.iv),
    ciphertext: Array.from(encryptedSnap.ciphertext),
    ...(encryptedSnap.recordSalt ? { recordSalt: Array.from(encryptedSnap.recordSalt) } : {}),
  };

  await recoveryDb.recoverySnapshots.put({
    id: snapshotId,
    createdAt: snapshotCreatedAt,
    note: `لقطة أمان قبل دمج المريض (${sourceData.fullNameAr || sourceData.fullName}) في (${survivingData.fullNameAr || survivingData.fullName})`,
    patientCount: 2,
    sessionCount: snapTables.sessions.length,
    packageJson: JSON.stringify(envelope),
  });

  const confirmedSnap = await recoveryDb.recoverySnapshots.get(snapshotId);
  if (!confirmedSnap || !confirmedSnap.packageJson) {
    throw new Error('فشل تأكيد حفظ لقطة الأمان المسبقة للدمج. تم إلغاء عملية الدمج.');
  }

  // Step 2: Load all dependent entities of `sourcePatientId`
  const sourceEpisodes = await database.episodes.where('patientId').equals(sourcePatientId).toArray();
  const sourceSessions = await database.sessions.where('patientId').equals(sourcePatientId).toArray();
  const sourceSoaps = await database.soapNotes.where('patientId').equals(sourcePatientId).toArray();
  const sourceAddenda = await database.clinicalAddenda
    .where('patientId')
    .equals(sourcePatientId)
    .toArray();
  const sourceEpClinical = await database.episodeClinical
    .where('patientId')
    .equals(sourcePatientId)
    .toArray();
  const sourceAppts = await database.appointments
    .where('patientId')
    .equals(sourcePatientId)
    .toArray();
  const sourceWait = await database.waitingList
    .where('patientId')
    .equals(sourcePatientId)
    .toArray();
  const sourceInvoices = await database.invoices
    .where('patientId')
    .equals(sourcePatientId)
    .toArray();
  const sourcePayments = await database.payments
    .where('patientId')
    .equals(sourcePatientId)
    .toArray();
  const sourceRecurring =
    database.verno >= 7
      ? await database.recurringSchedules.where('patientId').equals(sourcePatientId).toArray()
      : [];
  const sourceMedRow =
    database.verno >= 7
      ? await database.patientMedications.where('patientId').equals(sourcePatientId).first()
      : undefined;
  const survivingMedRow =
    database.verno >= 7
      ? await database.patientMedications.where('patientId').equals(survivingPatientId).first()
      : undefined;
  const sourceConsents =
    database.verno >= 8
      ? await database.consents.where('patientId').equals(sourcePatientId).toArray()
      : [];
  const sourceAttachments =
    database.verno >= 9
      ? await database.attachments.where('patientId').equals(sourcePatientId).toArray()
      : [];
  const sourceDrafts =
    database.verno >= 10
      ? await database.drafts.where('patientId').equals(sourcePatientId).toArray()
      : [];

  // Expenses do not have a `patientId` index in v5-v10, so scan encrypted rows safely
  const allExpenses = await database.expenses.toArray();
  const matchedSourceExpenses: Array<{
    entity: (typeof allExpenses)[number];
    decrypted: ClinicExpenseIQD;
  }> = [];
  for (const expEntity of allExpenses) {
    try {
      const dec = await decryptWithEntity<ClinicExpenseIQD>('expenses', expEntity, []);
      if (dec.patientId === sourcePatientId) {
        matchedSourceExpenses.push({ entity: expEntity, decrypted: dec });
      }
    } catch {
      // Ignore unreadable rows
    }
  }

  const totalStagedEncryptions =
    1 +
    sourceEpisodes.length +
    sourceSessions.length +
    sourceSoaps.length +
    sourceAddenda.length +
    sourceEpClinical.length +
    sourceAppts.length +
    sourceWait.length +
    sourceInvoices.length +
    sourcePayments.length +
    matchedSourceExpenses.length +
    sourceRecurring.length +
    (sourceMedRow ? 1 : 0) +
    sourceConsents.length +
    sourceAttachments.length +
    sourceDrafts.length;

  await atomicReserveInvocationCount(database, dek, totalStagedEncryptions);

  const now = new Date().toISOString();
  const stagedUpdates: Array<{
    tableName: string;
    record: Record<string, unknown>;
    parentIds: string[];
  }> = [];

  const stageEncrypted = async (
    tableName: string,
    id: string,
    parentIds: string[],
    payload: unknown,
    wrapperBase: Record<string, unknown>
  ) => {
    const enc = await encryptRecordPayload(
      dek,
      tableName,
      id,
      parentIds,
      payload,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );
    const fullRecord: Record<string, unknown> = {
      ...wrapperBase,
      id,
      updatedAt: now,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      iv: enc.iv,
      ciphertext: enc.ciphertext,
      ...(enc.recordSalt ? { recordSalt: enc.recordSalt } : {}),
    };
    if (typeof fullRecord.version === 'number') {
      fullRecord.version = fullRecord.version + 1;
    }
    stagedUpdates.push({ tableName, record: fullRecord, parentIds });
  };

  // Surviving patient updated payload
  const mergedPatientPayload = buildMergedPatientClinicalData(
    survivingData,
    sourceData,
    sourcePatientId
  );
  await stageEncrypted(
    'patients',
    survivingEntity.id,
    [],
    mergedPatientPayload,
    { ...survivingEntity }
  );

  // Re-encrypt Episodes
  for (const ep of sourceEpisodes) {
    const payload = await decryptWithEntity<EpisodeClinicalData>('episodes', ep, [sourcePatientId]);
    await stageEncrypted('episodes', ep.id, [survivingPatientId], payload, {
      ...ep,
      patientId: survivingPatientId,
    });
  }

  // Re-encrypt Sessions (keep SessionClinicalData untouched so SHA-256 integrity seal stays valid)
  for (const sess of sourceSessions) {
    const payload = await decryptWithEntity<Record<string, unknown>>('sessions', sess, [
      sourcePatientId,
      sess.episodeId,
    ]);
    await stageEncrypted('sessions', sess.id, [survivingPatientId, sess.episodeId], payload, {
      ...sess,
      patientId: survivingPatientId,
    });
  }

  // Re-encrypt SOAP Notes (keep SoapNoteData untouched so SHA-256 contentDigestSha256 stays valid)
  for (const note of sourceSoaps) {
    const oldParents = extractAndValidateParentIds('soapNotes', {
      id: note.id,
      patientId: sourcePatientId,
      episodeId: note.episodeId,
      sessionId: note.sessionId,
    });
    const newParents = extractAndValidateParentIds('soapNotes', {
      id: note.id,
      patientId: survivingPatientId,
      episodeId: note.episodeId,
      sessionId: note.sessionId,
    });
    const payload = await decryptWithEntity<Record<string, unknown>>('soapNotes', note, oldParents);
    await stageEncrypted('soapNotes', note.id, newParents, payload, {
      ...note,
      patientId: survivingPatientId,
    });
  }

  // Re-encrypt Clinical Addenda
  for (const add of sourceAddenda) {
    const payload = await decryptWithEntity<Record<string, unknown>>('clinicalAddenda', add, [
      sourcePatientId,
      add.sessionId,
    ]);
    await stageEncrypted(
      'clinicalAddenda',
      add.id,
      [survivingPatientId, add.sessionId],
      payload,
      {
        ...add,
        patientId: survivingPatientId,
      }
    );
  }

  // Re-encrypt EpisodeClinical (parentKeys = ['episodeId'])
  for (const ec of sourceEpClinical) {
    const payload = await decryptWithEntity<Record<string, unknown>>('episodeClinical', ec, [
      ec.episodeId,
    ]);
    await stageEncrypted(
      'episodeClinical',
      ec.id,
      [ec.episodeId],
      { ...payload, patientId: survivingPatientId },
      { ...ec, patientId: survivingPatientId }
    );
  }

  // Re-encrypt Appointments, WaitingList, Invoices, RecurringSchedules (parentKeys = [])
  const survivingDisplayName =
    mergedPatientPayload.fullNameAr || mergedPatientPayload.fullName;
  for (const appt of sourceAppts) {
    const payload = await decryptWithEntity<ClinicAppointment>('appointments', appt, []);
    await stageEncrypted(
      'appointments',
      appt.id,
      [],
      {
        ...payload,
        patientId: survivingPatientId,
        patientName: survivingDisplayName || payload.patientName,
      },
      { ...appt, patientId: survivingPatientId }
    );
  }

  for (const wait of sourceWait) {
    const payload = await decryptWithEntity<WaitingListEntry>('waitingList', wait, []);
    await stageEncrypted(
      'waitingList',
      wait.id,
      [],
      {
        ...payload,
        patientId: survivingPatientId,
        patientName: survivingDisplayName || payload.patientName,
      },
      { ...wait, patientId: survivingPatientId }
    );
  }

  for (const inv of sourceInvoices) {
    const payload = await decryptWithEntity<FinancialInvoiceIQD>('invoices', inv, []);
    await stageEncrypted(
      'invoices',
      inv.id,
      [],
      {
        ...payload,
        patientId: survivingPatientId,
        patientName: survivingDisplayName || payload.patientName,
      },
      { ...inv, patientId: survivingPatientId }
    );
  }

  for (const pay of sourcePayments) {
    const payload = await decryptWithEntity<Record<string, unknown>>('payments', pay, [
      pay.invoiceId,
    ]);
    await stageEncrypted(
      'payments',
      pay.id,
      [pay.invoiceId],
      { ...payload, patientId: survivingPatientId },
      { ...pay, patientId: survivingPatientId }
    );
  }

  for (const item of matchedSourceExpenses) {
    await stageEncrypted(
      'expenses',
      item.entity.id,
      [],
      { ...item.decrypted, patientId: survivingPatientId },
      { ...item.entity }
    );
  }

  for (const rec of sourceRecurring) {
    const payload = await decryptWithEntity<Record<string, unknown>>('recurringSchedules', rec, []);
    await stageEncrypted(
      'recurringSchedules',
      rec.id,
      [],
      { ...payload, patientId: survivingPatientId },
      { ...rec, patientId: survivingPatientId }
    );
  }

  // Merge unique &patientId PatientMedications
  let deleteSourceMedId: string | null = null;
  if (sourceMedRow) {
    const srcMeds = await decryptWithEntity<PatientMedicationPlan>('patientMedications', sourceMedRow, [
      sourcePatientId,
    ]);
    let combinedMeds = [...(srcMeds.medications || [])];
    if (survivingMedRow) {
      const survMeds = await decryptWithEntity<PatientMedicationPlan>(
        'patientMedications',
        survivingMedRow,
        [survivingPatientId]
      );
      combinedMeds = [...(survMeds.medications || []), ...combinedMeds];
    }
    const mergedMedPlan: PatientMedicationPlan = {
      patientId: survivingPatientId,
      medications: combinedMeds,
      updatedAt: now,
      version: (survivingMedRow?.version || 0) + 1,
    };
    await stageEncrypted(
      'patientMedications',
      survivingPatientId,
      [survivingPatientId],
      mergedMedPlan,
      {
        createdAt: survivingMedRow?.createdAt || sourceMedRow.createdAt || now,
        patientId: survivingPatientId,
        version: mergedMedPlan.version,
      }
    );
    deleteSourceMedId = sourceMedRow.id;
  }

  for (const c of sourceConsents) {
    const payload = await decryptWithEntity<Record<string, unknown>>('consents', c, [
      sourcePatientId,
    ]);
    await stageEncrypted(
      'consents',
      c.id,
      [survivingPatientId],
      { ...payload, patientId: survivingPatientId },
      { ...c, patientId: survivingPatientId }
    );
  }

  for (const att of sourceAttachments) {
    const payload = await decryptWithEntity<Record<string, unknown>>('attachments', att, [
      sourcePatientId,
    ]);
    await stageEncrypted(
      'attachments',
      att.id,
      [survivingPatientId],
      { ...payload, patientId: survivingPatientId },
      { ...att, patientId: survivingPatientId }
    );
  }

  for (const d of sourceDrafts) {
    const oldParents = d.patientId ? [d.patientId] : [];
    const payload = await decryptWithEntity<Record<string, unknown>>('drafts', d, oldParents);
    await stageEncrypted(
      'drafts',
      d.id,
      [survivingPatientId],
      { ...payload, patientId: survivingPatientId },
      { ...d, patientId: survivingPatientId }
    );
  }

  // Step 3: Verify every staged record decrypts cleanly BEFORE opening write transaction
  for (const item of stagedUpdates) {
    await decryptRecordPayload(
      dek,
      item.tableName,
      String(item.record.id),
      item.parentIds,
      item.record.iv as Uint8Array,
      item.record.ciphertext as Uint8Array,
      item.record.recordCryptoVersion as number,
      item.record.dekVersion as number,
      item.record.recordSalt as Uint8Array | undefined
    );
  }

  // Step 4: Commit atomically inside a single Dexie rw transaction
  const txTables = [
    database.patients,
    database.episodes,
    database.sessions,
    database.soapNotes,
    database.clinicalAddenda,
    database.episodeClinical,
    database.appointments,
    database.waitingList,
    database.invoices,
    database.payments,
    database.expenses,
    ...(database.verno >= 7 ? [database.recurringSchedules, database.patientMedications] : []),
    ...(database.verno >= 8 ? [database.consents] : []),
    ...(database.verno >= 9 ? [database.attachments] : []),
    ...(database.verno >= 10 ? [database.drafts] : []),
  ];

  await database.transaction('rw', txTables, async () => {
    for (const item of stagedUpdates) {
      await database.table(item.tableName).put(item.record);
    }
    if (deleteSourceMedId && deleteSourceMedId !== survivingPatientId && database.verno >= 7) {
      await database.patientMedications.delete(deleteSourceMedId);
    }
    await database.patients.delete(sourcePatientId);
  });

  // Step 5: Re-hydrate ClinicOperationsService cache and append hash-chained audit entry
  await ClinicOperationsService.hydrateEncryptedCache(dek, database);
  await ClinicOperationsService.appendAuditLogAsync({
    actionType: 'patient_merged',
    entityType: 'patient',
    entityId: survivingPatientId,
    patientId: survivingPatientId,
    summaryAr: `دمج سجل المريض المكرر (${sourceData.fullNameAr || sourceData.fullName} -> ${survivingDisplayName}) مع نقل ${sourceEpisodes.length} حلقات و${sourceSessions.length} جلسات و${sourceInvoices.length} فواتير (لقطة الأمان: ${snapshotId})`,
    summaryEn: `Merged duplicate patient (${sourceData.fullName || sourceData.fullNameAr} -> ${survivingDisplayName}), moved ${sourceEpisodes.length} episode(s), ${sourceSessions.length} session(s), ${sourceInvoices.length} invoice(s) (Snapshot: ${snapshotId})`,
  });
  await ClinicOperationsService.flushPendingWrites();

  return {
    snapshotId,
    survivingPatientId,
    sourcePatientId,
    movedCounts: {
      episodes: sourceEpisodes.length,
      sessions: sourceSessions.length,
      soapNotes: sourceSoaps.length,
      clinicalAddenda: sourceAddenda.length,
      episodeClinical: sourceEpClinical.length,
      appointments: sourceAppts.length,
      waitingList: sourceWait.length,
      invoices: sourceInvoices.length,
      payments: sourcePayments.length,
      expenses: matchedSourceExpenses.length,
      recurringSchedules: sourceRecurring.length,
      patientMedications: sourceMedRow ? 1 : 0,
      consents: sourceConsents.length,
      attachments: sourceAttachments.length,
      drafts: sourceDrafts.length,
    },
  };
}

/**
 * Restores both patient records and their pre-merge encrypted entities from a saved
 * `pre_merge_*` snapshot in `recoveryDb.recoverySnapshots`.
 */
export async function restorePreMergeSafetySnapshot(
  snapshotId: string,
  dek: CryptoKey,
  database: PhysioRecordDatabase = defaultDb
): Promise<void> {
  const snapRecord = await recoveryDb.recoverySnapshots.get(snapshotId);
  if (!snapRecord) {
    throw new Error(`لقطة الأمان المسبقة للدمج غير موجودة: ${snapshotId}`);
  }
  const envelope = JSON.parse(snapRecord.packageJson) as EncryptedPreMergeSnapshotEnvelope;
  if (envelope.kind !== 'pre_merge_patient_snapshot_v1') {
    throw new Error('صيغة لقطة الدمج غير صالحة.');
  }

  const tables = await decryptRecordPayload<Record<string, SerializedMergeEntity[]>>(
    dek,
    'mergeSnapshots',
    envelope.snapshotId,
    [envelope.survivingPatientId, envelope.sourcePatientId],
    new Uint8Array(envelope.iv),
    new Uint8Array(envelope.ciphertext),
    envelope.recordCryptoVersion,
    envelope.dekVersion,
    envelope.recordSalt ? new Uint8Array(envelope.recordSalt) : undefined
  );

  const tableNames = Object.keys(tables).filter((name) => Boolean(database.table(name)));
  const txTables = tableNames.map((name) => database.table(name));

  await database.transaction('rw', txTables, async () => {
    for (const tableName of tableNames) {
      const tbl = database.table(tableName);
      for (const serializedRow of tables[tableName] || []) {
        await tbl.put(deserializeRawEntity(serializedRow));
      }
    }
  });

  await ClinicOperationsService.hydrateEncryptedCache(dek, database);
}

// =======================================================================
// D2: IMPORT WIZARD ENGINE (CSV + ZERO-DEP XLSX, AUTO-GUESS, DRY-RUN, ROLLBACK)
// =======================================================================

export type ImportColumnField =
  | 'fullNameAr'
  | 'fullName'
  | 'phone'
  | 'gender'
  | 'age'
  | 'dateOfBirth'
  | 'mrn'
  | 'address'
  | 'occupation'
  | 'medicalHistory'
  | 'redFlags'
  | 'referringPhysician'
  | 'generalNotes'
  | 'ignore';

export interface ImportWizardPreviewRow {
  rowNumber: number;
  data: PatientClinicalData;
  rawName: string;
  normalizedPhone: string;
  duplicateMatches: DuplicatePatientMatch[];
  intraFileDuplicate: boolean;
  isValid: boolean;
  skipReasonAr?: string;
  skipReasonEn?: string;
}

export interface ImportWizardDryRunReport {
  headers: string[];
  columnMapping: ImportColumnField[];
  totalRows: number;
  readyRows: ImportWizardPreviewRow[];
  duplicateRows: ImportWizardPreviewRow[];
  invalidRows: ImportWizardPreviewRow[];
  phoneNormalizedCount: number;
}

const HEADER_RULES: Array<{ field: Exclude<ImportColumnField, 'ignore'>; pattern: RegExp }> = [
  {
    field: 'fullNameAr',
    pattern:
      /^(الاسم|الاسم الكامل|الاسم بالعربية|اسم المريض|ناو|ناوی نەخۆش|full name ar|name ar|arabic name|patient name ar)$/i,
  },
  {
    field: 'fullName',
    pattern: /^(full name|fullname|full name en|name|patient name|patient|name en|الاسم بالانجليزية|الاسم بالإنكليزية)$/i,
  },
  {
    field: 'phone',
    pattern: /^(phone|phone number|mobile|tel|telephone|whatsapp|رقم الهاتف|الهاتف|الموبايل|الجوال|ژمارەی مۆبایل)$/i,
  },
  { field: 'gender', pattern: /^(gender|sex|الجنس|ڕەگەز)$/i },
  { field: 'age', pattern: /^(age|العمر|تەمەن)$/i },
  { field: 'dateOfBirth', pattern: /^(dob|date of birth|birth date|تاريخ الميلاد|الميلاد)$/i },
  { field: 'mrn', pattern: /^(mrn|medical record|file no|file number|رقم الملف|الرقم الطبي)$/i },
  { field: 'address', pattern: /^(address|city|landmark|العنوان|السكن|ناونیشان)$/i },
  { field: 'occupation', pattern: /^(occupation|job|work|المهنة|العمل)$/i },
  {
    field: 'medicalHistory',
    pattern: /^(medical history|history|diagnosis|condition|complaint|التشخيص|التاريخ المرضي|الشكوى)$/i,
  },
  { field: 'redFlags', pattern: /^(red flags|warnings|alerts|العلامات الحمراء|تحذيرات)$/i },
  {
    field: 'referringPhysician',
    pattern: /^(referring physician|doctor|physician|referred by|الطبيب المحول|الطبيب المحيل|الإحالة)$/i,
  },
  { field: 'generalNotes', pattern: /^(notes|general notes|remarks|ملاحظات|ملاحظات عامة)$/i },
];

export function autoGuessImportColumnMapping(headers: string[]): ImportColumnField[] {
  return headers.map((rawHeader) => {
    const camelSplit = rawHeader.replace(/([a-z])([A-Z])/g, '$1 $2');
    const clean = normalizeArabicSearchText(camelSplit).replace(/[_\-*/().]+/g, ' ').trim();
    const rawTrimmed = camelSplit.replace(/[_\-*/().]+/g, ' ').trim();
    for (const rule of HEADER_RULES) {
      if (rule.pattern.test(rawTrimmed) || rule.pattern.test(clean)) {
        return rule.field;
      }
    }
    return 'ignore';
  });
}

function normalizeGenderInput(raw?: string): 'male' | 'female' | 'other' {
  const v = normalizeArabicSearchText(raw);
  if (['f', 'female', 'woman', 'انثي', 'انثى', 'مونث', 'نير', 'مئ'].includes(v) || v.includes('انث')) {
    return 'female';
  }
  if (['other', 'اخر'].includes(v)) return 'other';
  return 'male';
}

function normalizeDobInput(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = normalizeArabicSearchText(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return undefined;
}

export function runImportWizardDryRun(params: {
  matrix?: string[][];
  csvText?: string;
  columnMapping?: ImportColumnField[];
  existingPatients: PatientRecord[];
}): ImportWizardDryRunReport {
  const matrix = params.matrix ?? parseCsvMatrix(params.csvText || '');
  if (matrix.length < 2) {
    const headers = matrix[0] || [];
    return {
      headers,
      columnMapping: params.columnMapping || autoGuessImportColumnMapping(headers),
      totalRows: 0,
      readyRows: [],
      duplicateRows: [],
      invalidRows: [],
      phoneNormalizedCount: 0,
    };
  }

  const headers = matrix[0];
  const columnMapping =
    params.columnMapping && params.columnMapping.length === headers.length
      ? params.columnMapping
      : autoGuessImportColumnMapping(headers);

  const readyRows: ImportWizardPreviewRow[] = [];
  const duplicateRows: ImportWizardPreviewRow[] = [];
  const invalidRows: ImportWizardPreviewRow[] = [];
  let phoneNormalizedCount = 0;

  const seenBatchNames = new Set<string>();
  const seenBatchSuffixes = new Set<string>();

  for (let rIdx = 1; rIdx < matrix.length; rIdx++) {
    const cells = matrix[rIdx];
    const rowNumber = rIdx + 1;
    const mapped: Partial<Record<Exclude<ImportColumnField, 'ignore'>, string>> = {};

    cells.forEach((cell, cIdx) => {
      const targetField = columnMapping[cIdx];
      if (targetField && targetField !== 'ignore' && cell?.trim()) {
        mapped[targetField] = cell.trim();
      }
    });

    const primaryName = mapped.fullNameAr?.trim() || mapped.fullName?.trim() || '';
    if (!primaryName) {
      invalidRows.push({
        rowNumber,
        data: {
          fullName: '',
          fullNameAr: '',
          gender: 'male',
        },
        rawName: '',
        normalizedPhone: '',
        duplicateMatches: [],
        intraFileDuplicate: false,
        isValid: false,
        skipReasonAr: 'الصف يفتقد اسم المريض.',
        skipReasonEn: 'Row is missing patient name.',
      });
      continue;
    }

    const rawPhoneClean = mapped.phone ? normalizeArabicSearchText(mapped.phone) : '';
    const normalizedPhone = rawPhoneClean ? normalizeIraqiPhoneStorage(rawPhoneClean) : '';
    if (normalizedPhone && normalizedPhone !== mapped.phone?.trim()) {
      phoneNormalizedCount++;
    } else if (normalizedPhone && normalizedPhone.startsWith('+964')) {
      phoneNormalizedCount++;
    }

    const dob = normalizeDobInput(mapped.dateOfBirth);
    const parsedAgeNum = mapped.age
      ? Number(normalizeArabicSearchText(mapped.age).replace(/[^\d]/g, ''))
      : undefined;
    const age = computePatientAge(dob, Number.isFinite(parsedAgeNum) ? parsedAgeNum : undefined);

    const data: PatientClinicalData = {
      fullName: mapped.fullName?.trim() || primaryName,
      fullNameAr: mapped.fullNameAr?.trim() || primaryName,
      gender: normalizeGenderInput(mapped.gender),
      ...(normalizedPhone ? { phoneNumber: normalizedPhone, phone: normalizedPhone } : {}),
      ...(dob ? { dateOfBirth: dob } : {}),
      ...(age !== undefined ? { age } : {}),
      ...(mapped.mrn ? { mrn: mapped.mrn.trim() } : {}),
      ...(mapped.address ? { address: mapped.address.trim() } : {}),
      ...(mapped.occupation ? { occupation: mapped.occupation.trim() } : {}),
      ...(mapped.medicalHistory ? { medicalHistory: mapped.medicalHistory.trim() } : {}),
      ...(mapped.redFlags ? { redFlags: mapped.redFlags.trim() } : {}),
      ...(mapped.referringPhysician
        ? { referringPhysician: mapped.referringPhysician.trim() }
        : {}),
      ...(mapped.generalNotes ? { generalNotes: mapped.generalNotes.trim() } : {}),
      tags: ['imported'],
      isImported: true,
    };

    const duplicateMatches = detectPatientDuplicates(data, params.existingPatients);
    const normPrimaryName = normalizeArabicSearchText(primaryName);
    const suffix7 = extractCanonicalPhoneSuffix7(normalizedPhone);
    const intraFileDuplicate =
      (normPrimaryName.length >= 2 && seenBatchNames.has(normPrimaryName)) ||
      Boolean(suffix7 && seenBatchSuffixes.has(suffix7));

    if (normPrimaryName.length >= 2) seenBatchNames.add(normPrimaryName);
    if (suffix7) seenBatchSuffixes.add(suffix7);

    const rowObj: ImportWizardPreviewRow = {
      rowNumber,
      data,
      rawName: primaryName,
      normalizedPhone,
      duplicateMatches,
      intraFileDuplicate,
      isValid: true,
    };

    if (duplicateMatches.length > 0 || intraFileDuplicate) {
      duplicateRows.push(rowObj);
    } else {
      readyRows.push(rowObj);
    }
  }

  return {
    headers,
    columnMapping,
    totalRows: matrix.length - 1,
    readyRows,
    duplicateRows,
    invalidRows,
    phoneNormalizedCount,
  };
}

/**
 * Atomically imports validated patient rows inside a single Dexie rw transaction,
 * reserving the exact DEK counter block, encrypting every record, tagging `'imported'`,
 * and rolling back 100% if any validation or transaction fault occurs.
 */
export async function executePatientImportBatchTransactional(params: {
  rows: ImportWizardPreviewRow[];
  dek: CryptoKey;
  existingPatients?: PatientRecord[];
  database?: PhysioRecordDatabase;
  batchId?: string;
  injectFaultAtRowIndex?: number;
}): Promise<{ batchId: string; importedIds: string[]; count: number }> {
  const {
    rows,
    dek,
    existingPatients = [],
    database = defaultDb,
    injectFaultAtRowIndex,
  } = params;
  if (!rows || rows.length === 0) {
    return { batchId: params.batchId || `imp_${Date.now()}`, importedIds: [], count: 0 };
  }

  const batchId = params.batchId || `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const vaultMeta = await database.vaultMeta.get('auth');
  const activeDekVersion = vaultMeta?.dekVersion || CURRENT_DEK_VERSION;

  const tempExisting: PatientRecord[] = [...existingPatients];
  const stagedEntities: Array<{ id: string; entity: Record<string, unknown> }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nameAr = row.data.fullNameAr?.trim() || row.data.fullName?.trim();
    if (!row.isValid || !nameAr) {
      throw new Error(`صف غير صالح أثناء الاستيراد (صف ${row.rowNumber}): الاسم مفقود.`);
    }
    const id = crypto.randomUUID();
    const mrn = ensureUniquePatientMrn(row.data.mrn, id, tempExisting);
    const taggedData: PatientClinicalData = {
      ...row.data,
      mrn,
      tags: Array.from(new Set([...(row.data.tags || []), 'imported'])),
      isImported: true,
      importedBatchId: batchId,
      importedAt: now,
    };

    const tempRecord: PatientRecord = {
      id,
      createdAt: now,
      updatedAt: now,
      isArchived: 0,
      data: taggedData,
    };
    tempExisting.push(tempRecord);
    stagedEntities.push({ id, entity: tempRecord as unknown as Record<string, unknown> });
  }

  await atomicReserveInvocationCount(database, dek, stagedEntities.length);

  const encryptedRows: Array<Record<string, unknown>> = [];
  for (const staged of stagedEntities) {
    const pRec = staged.entity as unknown as PatientRecord;
    const enc = await encryptRecordPayload(
      dek,
      'patients',
      staged.id,
      [],
      pRec.data,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );
    encryptedRows.push({
      id: staged.id,
      createdAt: now,
      updatedAt: now,
      isArchived: 0,
      version: 1,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      iv: enc.iv,
      ciphertext: enc.ciphertext,
      ...(enc.recordSalt ? { recordSalt: enc.recordSalt } : {}),
    });
  }

  await database.transaction('rw', [database.patients], async () => {
    for (let idx = 0; idx < encryptedRows.length; idx++) {
      if (injectFaultAtRowIndex !== undefined && idx === injectFaultAtRowIndex) {
        throw new Error(`فشل محاكاة المعاملة عند الصف #${idx + 1}؛ تم التراجع عن الدفعة بالكامل.`);
      }
      await database.patients.put(encryptedRows[idx] as never);
    }
  });

  if (ClinicOperationsService.isCacheHydrated()) {
    await ClinicOperationsService.appendAuditLogAsync({
      actionType: 'patients_imported_batch',
      entityType: 'patient',
      entityId: batchId,
      summaryAr: `استيراد دفعة مرضى مشفرة (${encryptedRows.length} مريضاً) — الدفعة ${batchId}`,
      summaryEn: `Encrypted patient import batch (${encryptedRows.length} patient(s)) — Batch ${batchId}`,
    });
    await ClinicOperationsService.flushPendingWrites();
  }

  return {
    batchId,
    importedIds: encryptedRows.map((r) => String(r.id)),
    count: encryptedRows.length,
  };
}

/**
 * Rolls back a previously imported batch by deleting only patients created by `batchId`
 * that have zero clinical/financial child records attached.
 */
export async function rollbackImportedBatchTransactional(
  batchId: string,
  dek: CryptoKey,
  database: PhysioRecordDatabase = defaultDb
): Promise<number> {
  if (!batchId) return 0;
  const entities = await database.patients.toArray();
  const targetIds: string[] = [];

  for (const entity of entities) {
    try {
      const dec = await decryptRecordPayload<PatientClinicalData>(
        dek,
        'patients',
        entity.id,
        [],
        new Uint8Array(entity.iv),
        new Uint8Array(entity.ciphertext),
        entity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
        entity.dekVersion || CURRENT_DEK_VERSION,
        entity.recordSalt ? new Uint8Array(entity.recordSalt) : undefined
      );
      if (dec.importedBatchId === batchId) {
        const epCount = await database.episodes.where('patientId').equals(entity.id).count();
        const invCount = await database.invoices.where('patientId').equals(entity.id).count();
        if (epCount === 0 && invCount === 0) {
          targetIds.push(entity.id);
        }
      }
    } catch {
      // Ignore un-decryptable rows
    }
  }

  if (targetIds.length === 0) return 0;

  await database.transaction('rw', [database.patients], async () => {
    for (const id of targetIds) {
      await database.patients.delete(id);
    }
  });

  return targetIds.length;
}

// =======================================================================
// ZERO-DEPENDENCY XLSX (OOXML ZIP + SHARED STRINGS + SHEET1) PARSER & WRITER
// =======================================================================

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

function escapeXmlText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnLettersToZeroIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, idx - 1);
}

function zeroIndexToColumnLetters(index: number): string {
  let n = index + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

async function decompressZipEntryBytes(
  compressed: Uint8Array,
  compressionMethod: number
): Promise<Uint8Array> {
  if (compressionMethod === 0) {
    return compressed;
  }
  if (compressionMethod === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream is unavailable to read compressed XLSX entries.');
    }
    const copy = new Uint8Array(compressed.byteLength);
    copy.set(compressed);
    const stream = new Blob([copy.buffer])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }
  throw new Error(`Unsupported XLSX ZIP compression method: ${compressionMethod}`);
}

async function readZipArchiveEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');
  const files = new Map<string, Uint8Array>();

  // Locate End of Central Directory (0x06054b50) scanning backwards
  const minScan = Math.max(0, bytes.length - 65557);
  let eocdOffset = -1;
  for (let pos = bytes.length - 22; pos >= minScan; pos--) {
    if (view.getUint32(pos, true) === 0x06054b50) {
      eocdOffset = pos;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('ملف XLSX غير صالح (لا يحتوي على ترويسة ZIP Central Directory).');
  }

  const centralDirCount = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);

  for (let i = 0; i < centralDirCount; i++) {
    if (cdOffset + 46 > bytes.length || view.getUint32(cdOffset, true) !== 0x02014b50) {
      break;
    }
    const compressionMethod = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const fileNameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const fileName = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + fileNameLen));

    if (localHeaderOffset + 30 <= bytes.length && view.getUint32(localHeaderOffset, true) === 0x04034b50) {
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const dataEnd = dataStart + compressedSize;
      if (compressedSize > 0 && dataEnd <= bytes.length && !fileName.endsWith('/')) {
        const rawSlice = bytes.subarray(dataStart, dataEnd);
        const uncompressed = await decompressZipEntryBytes(rawSlice, compressionMethod);
        files.set(fileName, uncompressed);
      } else if (compressedSize === 0 && !fileName.endsWith('/')) {
        files.set(fileName, new Uint8Array(0));
      }
    }

    cdOffset += 46 + fileNameLen + extraLen + commentLen;
  }

  return files;
}

function parseSharedStringsXml(xml: string): string[] {
  const result: string[] = [];
  const siRegex = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g;
  let siMatch: RegExpExecArray | null;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const inner = siMatch[1];
    const parts: string[] = [];
    const tRegex = /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      parts.push(decodeXmlEntities(tMatch[1]));
    }
    result.push(parts.join(''));
  }
  return result;
}

function parseWorksheetXml(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowInner = rowMatch[1];
    const rowValues: string[] = [];
    const cellRegex = /<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g;
    let cellMatch: RegExpExecArray | null;
    let fallbackColIdx = 0;

    while ((cellMatch = cellRegex.exec(rowInner)) !== null) {
      const attrs = cellMatch[1];
      const cellBody = cellMatch[2];
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/i);
      const colIdx = refMatch ? columnLettersToZeroIndex(refMatch[1].toUpperCase()) : fallbackColIdx;
      fallbackColIdx = colIdx + 1;

      const typeMatch = attrs.match(/\bt="([^"]+)"/i);
      const cellType = typeMatch ? typeMatch[1] : '';

      let cellText = '';
      if (cellType === 'inlineStr') {
        const tMatches = Array.from(
          cellBody.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)
        );
        cellText = tMatches.map((m) => decodeXmlEntities(m[1])).join('');
      } else {
        const vMatch = cellBody.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/);
        const rawVal = vMatch ? decodeXmlEntities(vMatch[1]) : '';
        if (cellType === 's') {
          const ssIndex = parseInt(rawVal, 10);
          cellText = Number.isFinite(ssIndex) ? sharedStrings[ssIndex] ?? '' : '';
        } else {
          cellText = rawVal;
        }
      }

      while (rowValues.length <= colIdx) rowValues.push('');
      rowValues[colIdx] = cellText.trim();
    }

    if (rowValues.some((cell) => cell.length > 0)) {
      rows.push(rowValues);
    }
  }

  return rows;
}

export async function parseXlsxBufferToMatrix(buffer: ArrayBuffer): Promise<string[][]> {
  const entries = await readZipArchiveEntries(buffer);
  const decoder = new TextDecoder('utf-8');

  const ssEntry = entries.get('xl/sharedStrings.xml');
  const sharedStrings = ssEntry ? parseSharedStringsXml(decoder.decode(ssEntry)) : [];

  const sheetKey =
    entries.has('xl/worksheets/sheet1.xml')
      ? 'xl/worksheets/sheet1.xml'
      : Array.from(entries.keys()).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k));

  if (!sheetKey) {
    throw new Error('ملف XLSX لا يحتوي على ورقة عمل صالحة (sheet1.xml).');
  }
  const sheetBytes = entries.get(sheetKey);
  if (!sheetBytes) return [];

  return parseWorksheetXml(decoder.decode(sheetBytes), sharedStrings);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Generates a valid, uncompressed Office Open XML `.xlsx` workbook in pure TypeScript
 * (0 external dependencies, RTL/Arabic UTF-8 safe via `inlineStr`).
 */
export function buildMinimalXlsxBuffer(rows: string[][]): Uint8Array {
  const encoder = new TextEncoder();

  const sheetRowsXml = rows
    .map((cells, rIdx) => {
      const rowNum = rIdx + 1;
      const cellsXml = cells
        .map((val, cIdx) => {
          const ref = `${zeroIndexToColumnLetters(cIdx)}${rowNum}`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXmlText(
            String(val ?? '')
          )}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowNum}">${cellsXml}</row>`;
    })
    .join('');

  const files: Array<{ name: string; content: string }> = [
    {
      name: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Patients" sheetId="1" r:id="rId1"/></sheets>' +
        '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<sheetData>${sheetRowsXml}</sheetData>` +
        '</worksheet>',
    },
  ];

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const crc = computeCrc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(localHeader.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);
    ldv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    ldv.setUint16(8, 0, true); // Store
    ldv.setUint16(10, 0, true);
    ldv.setUint16(12, 0, true);
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, dataBytes.length, true);
    ldv.setUint32(22, dataBytes.length, true);
    ldv.setUint16(26, nameBytes.length, true);
    ldv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(centralHeader.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, dataBytes.length, true);
    cdv.setUint32(24, dataBytes.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralDirSize, true);
  edv.setUint32(16, offset, true);
  edv.setUint16(20, 0, true);

  const totalLen = offset + centralDirSize + eocd.length;
  const output = new Uint8Array(totalLen);
  let cursor = 0;
  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  output.set(eocd, cursor);
  return output;
}

// =======================================================================
// D3: 30-DAY NON-CLINICAL RECYCLE BIN
// =======================================================================

export const RECYCLE_BIN_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const IMMUTABLE_CLINICAL_TRASH_TYPES = new Set([
  'patient',
  'episode',
  'session',
  'soap',
  'soapnote',
  'addendum',
  'clinical_record',
]);

export function assertNonClinicalTrashTarget(entityType: string): void {
  if (IMMUTABLE_CLINICAL_TRASH_TYPES.has(entityType.trim().toLowerCase())) {
    throw new CannotDeleteFinalizedRecordError(
      'سلة المحذوفات مخصصة للسجلات غير السريرية فقط (المواعيد، قائمة الانتظار، المصاريف). السجلات السريرية المعتمدة محمية من الحذف دائماً.'
    );
  }
}

export function createRecycleBinEntry(params: {
  itemType: RecycleBinItemType;
  originalId: string;
  titleAr: string;
  titleEn: string;
  subtitleAr?: string;
  subtitleEn?: string;
  deletedBy: string;
  payload: ClinicAppointment | WaitingListEntry | ClinicExpenseIQD;
  deletedAtIso?: string;
}): RecycleBinEntry {
  assertNonClinicalTrashTarget(params.itemType);
  const deletedAt = params.deletedAtIso || new Date().toISOString();
  const expiresAt = new Date(
    new Date(deletedAt).getTime() + RECYCLE_BIN_RETENTION_DAYS * DAY_MS
  ).toISOString();

  return {
    id: `trash_${params.itemType}_${params.originalId}_${Date.now()}`,
    itemType: params.itemType,
    originalId: params.originalId,
    titleAr: params.titleAr,
    titleEn: params.titleEn,
    subtitleAr: params.subtitleAr,
    subtitleEn: params.subtitleEn,
    deletedAt,
    expiresAt,
    deletedBy: params.deletedBy,
    payload: params.payload,
  };
}

export function filterActiveRecycleBinEntries(
  items: RecycleBinEntry[],
  nowIso: string = new Date().toISOString()
): RecycleBinEntry[] {
  const nowMs = new Date(nowIso).getTime();
  return (items || []).filter((entry) => {
    const expMs = new Date(entry.expiresAt).getTime();
    return Number.isFinite(expMs) && expMs > nowMs;
  });
}

export function getRemainingRecycleDays(
  entry: RecycleBinEntry,
  nowIso: string = new Date().toISOString()
): number {
  const diffMs = new Date(entry.expiresAt).getTime() - new Date(nowIso).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.max(1, Math.ceil(diffMs / DAY_MS));
}

// =======================================================================
// D4: DATA HEALTH SCREEN & ORPHAN SCANNER
// =======================================================================

export type DataHealthCategoryId =
  | 'missing_demographics'
  | 'unsigned_notes'
  | 'unpaid_invoices'
  | 'orphan_records'
  | 'unverified_backup';

export interface OrphanRecordItem {
  tableName:
    | 'episodes'
    | 'sessions'
    | 'soapNotes'
    | 'clinicalAddenda'
    | 'episodeClinical'
    | 'appointments'
    | 'waitingList'
    | 'invoices'
    | 'payments'
    | 'consents'
    | 'attachments';
  recordId: string;
  missingParentType: 'patient' | 'episode' | 'session' | 'invoice';
  missingParentId: string;
  isClinicalRecord: boolean;
  labelAr: string;
  labelEn: string;
}

export interface DataHealthIssueDetail {
  id: string;
  labelAr: string;
  labelEn: string;
  secondaryAr?: string;
  secondaryEn?: string;
  patientId?: string;
  sessionId?: string;
  orphan?: OrphanRecordItem;
}

export interface DataHealthCategoryItem {
  id: DataHealthCategoryId;
  count: number;
  severity: 'ok' | 'warning' | 'critical';
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  fixActionLabelAr: string;
  fixActionLabelEn: string;
  items: DataHealthIssueDetail[];
}

export interface ClinicDataHealthReport {
  generatedAt: string;
  totalIssues: number;
  categories: DataHealthCategoryItem[];
}

export async function scanDatabaseOrphanRecords(
  database: PhysioRecordDatabase = defaultDb
): Promise<OrphanRecordItem[]> {
  const orphans: OrphanRecordItem[] = [];
  const patientIds = new Set((await database.patients.toArray()).map((p) => p.id));
  const episodeIds = new Set((await database.episodes.toArray()).map((e) => e.id));
  const sessionIds = new Set((await database.sessions.toArray()).map((s) => s.id));
  const invoiceIds = new Set((await database.invoices.toArray()).map((inv) => inv.id));

  for (const ep of await database.episodes.toArray()) {
    if (!ep.patientId || !patientIds.has(ep.patientId)) {
      orphans.push({
        tableName: 'episodes',
        recordId: ep.id,
        missingParentType: 'patient',
        missingParentId: ep.patientId || '(empty)',
        isClinicalRecord: true,
        labelAr: `حلقة رعاية بدون ملف مريض (${ep.id.slice(0, 8)})`,
        labelEn: `Orphan episode without patient (${ep.id.slice(0, 8)})`,
      });
    }
  }

  for (const s of await database.sessions.toArray()) {
    if (!s.patientId || !patientIds.has(s.patientId)) {
      orphans.push({
        tableName: 'sessions',
        recordId: s.id,
        missingParentType: 'patient',
        missingParentId: s.patientId || '(empty)',
        isClinicalRecord: true,
        labelAr: `جلسة بدون ملف مريض (${s.id.slice(0, 8)})`,
        labelEn: `Orphan session without patient (${s.id.slice(0, 8)})`,
      });
    } else if (s.episodeId && !episodeIds.has(s.episodeId)) {
      orphans.push({
        tableName: 'sessions',
        recordId: s.id,
        missingParentType: 'episode',
        missingParentId: s.episodeId,
        isClinicalRecord: true,
        labelAr: `جلسة بدون حلقة رعاية (${s.id.slice(0, 8)})`,
        labelEn: `Orphan session without episode (${s.id.slice(0, 8)})`,
      });
    }
  }

  for (const note of await database.soapNotes.toArray()) {
    if (!note.sessionId || !sessionIds.has(note.sessionId)) {
      orphans.push({
        tableName: 'soapNotes',
        recordId: note.id,
        missingParentType: 'session',
        missingParentId: note.sessionId || '(empty)',
        isClinicalRecord: true,
        labelAr: `ملاحظة SOAP بدون جلسة (${note.id.slice(0, 8)})`,
        labelEn: `Orphan SOAP note without session (${note.id.slice(0, 8)})`,
      });
    }
  }

  for (const appt of await database.appointments.toArray()) {
    if (!appt.patientId || !patientIds.has(appt.patientId)) {
      orphans.push({
        tableName: 'appointments',
        recordId: appt.id,
        missingParentType: 'patient',
        missingParentId: appt.patientId || '(empty)',
        isClinicalRecord: false,
        labelAr: `موعد بدون ملف مريض (${appt.id.slice(0, 8)})`,
        labelEn: `Orphan appointment without patient (${appt.id.slice(0, 8)})`,
      });
    }
  }

  for (const wait of await database.waitingList.toArray()) {
    if (wait.patientId && !patientIds.has(wait.patientId)) {
      orphans.push({
        tableName: 'waitingList',
        recordId: wait.id,
        missingParentType: 'patient',
        missingParentId: wait.patientId,
        isClinicalRecord: false,
        labelAr: `عنصر قائمة انتظار بدون مريض (${wait.id.slice(0, 8)})`,
        labelEn: `Orphan waitlist entry without patient (${wait.id.slice(0, 8)})`,
      });
    }
  }

  for (const inv of await database.invoices.toArray()) {
    if (!inv.patientId || !patientIds.has(inv.patientId)) {
      orphans.push({
        tableName: 'invoices',
        recordId: inv.id,
        missingParentType: 'patient',
        missingParentId: inv.patientId || '(empty)',
        isClinicalRecord: false,
        labelAr: `فاتورة بدون ملف مريض (${inv.id.slice(0, 8)})`,
        labelEn: `Orphan invoice without patient (${inv.id.slice(0, 8)})`,
      });
    }
  }

  for (const pay of await database.payments.toArray()) {
    if (!pay.invoiceId || !invoiceIds.has(pay.invoiceId)) {
      orphans.push({
        tableName: 'payments',
        recordId: pay.id,
        missingParentType: 'invoice',
        missingParentId: pay.invoiceId || '(empty)',
        isClinicalRecord: false,
        labelAr: `دفعة بدون فاتورة أصلية (${pay.id.slice(0, 8)})`,
        labelEn: `Orphan payment without invoice (${pay.id.slice(0, 8)})`,
      });
    }
  }

  if (database.verno >= 8) {
    for (const c of await database.consents.toArray()) {
      if (!c.patientId || !patientIds.has(c.patientId)) {
        orphans.push({
          tableName: 'consents',
          recordId: c.id,
          missingParentType: 'patient',
          missingParentId: c.patientId || '(empty)',
          isClinicalRecord: true,
          labelAr: `موافقة مستنيرة بدون ملف مريض (${c.id.slice(0, 8)})`,
          labelEn: `Orphan consent without patient (${c.id.slice(0, 8)})`,
        });
      }
    }
  }

  if (database.verno >= 9) {
    for (const att of await database.attachments.toArray()) {
      if (!att.patientId || !patientIds.has(att.patientId)) {
        orphans.push({
          tableName: 'attachments',
          recordId: att.id,
          missingParentType: 'patient',
          missingParentId: att.patientId || '(empty)',
          isClinicalRecord: true,
          labelAr: `مرفق بدون ملف مريض (${att.id.slice(0, 8)})`,
          labelEn: `Orphan attachment without patient (${att.id.slice(0, 8)})`,
        });
      }
    }
  }

  return orphans;
}

export async function resolveOrphanRecord(params: {
  orphan: OrphanRecordItem;
  action: 'delete_non_clinical' | 'reassign_patient';
  targetPatientId?: string;
  dek?: CryptoKey;
  database?: PhysioRecordDatabase;
}): Promise<void> {
  const { orphan, action, targetPatientId, dek, database = defaultDb } = params;
  if (action === 'delete_non_clinical') {
    if (orphan.isClinicalRecord) {
      throw new CannotDeleteFinalizedRecordError(
        'لا يمكن حذف السجلات السريرية المعزولة مباشرة؛ يرجى ربطها بمريض صالح أو استعادتها عبر لقطة النسخ الاحتياطي.'
      );
    }
    await database.table(orphan.tableName).delete(orphan.recordId);
    if (dek) {
      await ClinicOperationsService.hydrateEncryptedCache(dek, database);
    }
    return;
  }

  if (action === 'reassign_patient') {
    if (!targetPatientId || !(await database.patients.get(targetPatientId))) {
      throw new Error('المريض الهدف غير موجود لإعادة الربط.');
    }
    const entity = (await database.table(orphan.tableName).get(orphan.recordId)) as
      | Record<string, unknown>
      | undefined;
    if (!entity || !dek) {
      throw new Error('يتطلب إعادة ربط السجل وجود السجل ومفتاح التشفير التشغيلي.');
    }

    const oldParentId = orphan.missingParentId === '(empty)' ? '' : orphan.missingParentId;
    const storeDef = CLINICAL_STORES_REGISTRY[orphan.tableName];
    const oldParents = storeDef.parentKeys
      .map((k) => (k === 'patientId' ? oldParentId : String(entity[k] || '')))
      .filter(Boolean);
    const newParents = storeDef.parentKeys
      .map((k) => (k === 'patientId' ? targetPatientId : String(entity[k] || '')))
      .filter(Boolean);

    const payload = await decryptRecordPayload<Record<string, unknown>>(
      dek,
      orphan.tableName,
      orphan.recordId,
      oldParents,
      new Uint8Array(entity.iv as Uint8Array),
      new Uint8Array(entity.ciphertext as Uint8Array),
      Number(entity.recordCryptoVersion) || LEGACY_RECORD_CRYPTO_VERSION_V1,
      Number(entity.dekVersion) || CURRENT_DEK_VERSION,
      entity.recordSalt ? new Uint8Array(entity.recordSalt as Uint8Array) : undefined
    );

    const nextPayload =
      typeof payload === 'object' && payload !== null && 'patientId' in payload
        ? { ...payload, patientId: targetPatientId }
        : payload;

    const enc = await encryptRecordPayload(
      dek,
      orphan.tableName,
      orphan.recordId,
      newParents,
      nextPayload,
      CURRENT_RECORD_CRYPTO_VERSION,
      Number(entity.dekVersion) || CURRENT_DEK_VERSION
    );

    await database.table(orphan.tableName).put({
      ...entity,
      patientId: targetPatientId,
      updatedAt: new Date().toISOString(),
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      iv: enc.iv,
      ciphertext: enc.ciphertext,
      ...(enc.recordSalt ? { recordSalt: enc.recordSalt } : {}),
    });
    await ClinicOperationsService.hydrateEncryptedCache(dek, database);
  }
}

export function computeClinicDataHealthReport(params: {
  patients: PatientRecord[];
  draftSessions: Array<{
    session: SessionRecord;
    soap?: SoapNoteRecord | null;
    patientNameAr?: string;
    patientNameEn?: string;
  }>;
  invoices: FinancialInvoiceIQD[];
  orphanRecords: OrphanRecordItem[];
  backupMeta: BackupStateMetadata | {
    lastBackupAt?: string;
    lastVerifiedBackupAt?: string;
    lastBackupVerified?: boolean;
  } | null;
  recoveryDrillDue?: boolean;
  nowIso?: string;
}): ClinicDataHealthReport {
  const nowIso = params.nowIso || new Date().toISOString();
  const activePatients = params.patients.filter((p) => p.isArchived !== 1 && !p.data.isDemo);

  const missingDemographicsItems: DataHealthIssueDetail[] = [];
  for (let i = 0; i < activePatients.length; i++) {
    const p = activePatients[i];
    const hasPhone = Boolean((p.data.phoneNumber || p.data.phone || '').trim());
    const hasDobOrAge = Boolean(
      p.data.dateOfBirth?.trim() || (typeof p.data.age === 'number' && Number.isFinite(p.data.age))
    );
    if (!hasPhone || !hasDobOrAge) {
      const missingAr: string[] = [];
      const missingEn: string[] = [];
      if (!hasPhone) {
        missingAr.push('الهاتف');
        missingEn.push('Phone');
      }
      if (!hasDobOrAge) {
        missingAr.push('الميلاد/العمر');
        missingEn.push('DOB/Age');
      }
      const nameAr = p.data.fullNameAr || p.data.fullName;
      const nameEn = p.data.fullName || p.data.fullNameAr || '';
      const mrn = getPatientMrn(p, i);
      missingDemographicsItems.push({
        id: `demo_${p.id}`,
        patientId: p.id,
        labelAr: `${nameAr} (${mrn})`,
        labelEn: `${nameEn} (${mrn})`,
        secondaryAr: `ناقص: ${missingAr.join(' + ')}`,
        secondaryEn: `Missing: ${missingEn.join(' + ')}`,
      });
    }
  }

  const unsignedNotesItems: DataHealthIssueDetail[] = params.draftSessions.map((entry) => {
    const p = activePatients.find((pat) => pat.id === entry.session.patientId);
    const pNameAr = entry.patientNameAr || p?.data.fullNameAr || p?.data.fullName || entry.session.patientId;
    const pNameEn = entry.patientNameEn || p?.data.fullName || p?.data.fullNameAr || entry.session.patientId;
    return {
      id: `unsigned_${entry.session.id}`,
      patientId: entry.session.patientId,
      sessionId: entry.session.id,
      labelAr: `${pNameAr} — جلسة #${entry.session.sessionNumber} (${entry.session.sessionDate})`,
      labelEn: `${pNameEn} — Session #${entry.session.sessionNumber} (${entry.session.sessionDate})`,
      secondaryAr: 'ملاحظة SOAP غير معتمدة (مسودة)',
      secondaryEn: 'Unsigned SOAP note (Draft)',
    };
  });

  const unpaidInvoicesItems: DataHealthIssueDetail[] = params.invoices
    .filter((inv) => inv.status !== 'void' && !inv.isDemo && inv.balanceDueIQD > 0)
    .map((inv) => ({
      id: `unpaid_${inv.id}`,
      patientId: inv.patientId,
      labelAr: `${inv.patientName} — ${inv.invoiceNumber}`,
      labelEn: `${inv.patientName} — ${inv.invoiceNumber}`,
      secondaryAr: `المتبقي: ${inv.balanceDueIQD.toLocaleString()} د.ع`,
      secondaryEn: `Due: ${inv.balanceDueIQD.toLocaleString()}`,
    }));

  const orphanItems: DataHealthIssueDetail[] = params.orphanRecords.map((o) => ({
    id: `orphan_${o.tableName}_${o.recordId}`,
    labelAr: o.labelAr,
    labelEn: o.labelEn,
    secondaryAr: `المعرف المفقود: ${o.missingParentId}`,
    secondaryEn: `Missing ${o.missingParentType}: ${o.missingParentId}`,
    orphan: o,
  }));

  const lastVerified = params.backupMeta?.lastVerifiedBackupAt || null;
  const isBackupStale =
    !lastVerified ||
    Boolean(params.recoveryDrillDue) ||
    new Date(nowIso).getTime() - new Date(lastVerified).getTime() > 90 * DAY_MS;

  const backupItems: DataHealthIssueDetail[] = isBackupStale
    ? [
        {
          id: 'backup_verification_due',
          labelAr: lastVerified
            ? `آخر تحقق من النسخة الاحتياطية بتاريخ ${localDate(lastVerified)}`
            : 'لم يتم التحقق من أي نسخة احتياطية مشفرة بعد',
          labelEn: lastVerified
            ? `Last verified backup on ${localDate(lastVerified)}`
            : 'No verified encrypted backup recorded yet',
          secondaryAr: 'ينصح بتشغيل تمرين استعادة النسخة الاحتياطية الآن',
          secondaryEn: 'Run a sandbox backup verification drill now',
        },
      ]
    : [];

  const categories: DataHealthCategoryItem[] = [
    {
      id: 'missing_demographics',
      count: missingDemographicsItems.length,
      severity: missingDemographicsItems.length > 0 ? 'warning' : 'ok',
      titleAr: 'مرضى ينقصهم رقم الهاتف أو تاريخ الميلاد/العمر',
      titleEn: 'Patients Missing Phone or DOB/Age',
      descriptionAr: 'مهم للتواصل عبر واتساب وحساب فئة العمر ووقاية الأطفال.',
      descriptionEn: 'Required for WhatsApp follow-ups, age calculation & pediatric safeguards.',
      fixActionLabelAr: 'إكمال بيانات المريض',
      fixActionLabelEn: 'Edit Patient Info',
      items: missingDemographicsItems,
    },
    {
      id: 'unsigned_notes',
      count: unsignedNotesItems.length,
      severity: unsignedNotesItems.length > 0 ? 'warning' : 'ok',
      titleAr: 'ملاحظات جلسات غير معتمدة (مسودات)',
      titleEn: 'Unsigned / Draft Session Notes',
      descriptionAr: 'جلسات لم تُختم بعد لإصدار الختم التشفيري وخصم الحصة.',
      descriptionEn: 'Sessions still in draft state awaiting clinical finalization.',
      fixActionLabelAr: 'فتح الجلسة للاعتماد',
      fixActionLabelEn: 'Open Session Note',
      items: unsignedNotesItems,
    },
    {
      id: 'unpaid_invoices',
      count: unpaidInvoicesItems.length,
      severity: unpaidInvoicesItems.length > 0 ? 'warning' : 'ok',
      titleAr: 'فواتير غير مسددة بالكامل',
      titleEn: 'Unpaid / Partially Paid Invoices',
      descriptionAr: 'فواتير ذات رصيد مستحق أو أقساط بانتظار التحصيل.',
      descriptionEn: 'Active invoices with outstanding balance due.',
      fixActionLabelAr: 'فتح السجل المالي',
      fixActionLabelEn: 'Open Financial Ledger',
      items: unpaidInvoicesItems,
    },
    {
      id: 'orphan_records',
      count: orphanItems.length,
      severity: orphanItems.length > 0 ? 'critical' : 'ok',
      titleAr: 'سجلات معزولة (Orphan Records)',
      titleEn: 'Orphan Records (Missing Parent)',
      descriptionAr: 'سجلات تشير إلى معرف مريض أو حلقة أو جلسة غير موجودة.',
      descriptionEn: 'Encrypted rows referencing a missing patient, episode, session, or invoice.',
      fixActionLabelAr: 'تنظيف غير السريري',
      fixActionLabelEn: 'Clean Non-Clinical Orphans',
      items: orphanItems,
    },
    {
      id: 'unverified_backup',
      count: backupItems.length,
      severity: backupItems.length > 0 ? 'critical' : 'ok',
      titleAr: 'النسخة الاحتياطية غير متحقق منها',
      titleEn: 'Unverified Backup / Recovery Drill Due',
      descriptionAr: 'تحقق من أن أحدث نسخة .ptbackup قابلة لفك التشفير والاستعادة.',
      descriptionEn: 'Verify that your latest .ptbackup decrypts cleanly in a sandbox.',
      fixActionLabelAr: 'فحص النسخة الاحتياطية الآن',
      fixActionLabelEn: 'Verify Backup Now',
      items: backupItems,
    },
  ];

  return {
    generatedAt: nowIso,
    totalIssues: categories.reduce((sum, cat) => sum + cat.count, 0),
    categories,
  };
}
