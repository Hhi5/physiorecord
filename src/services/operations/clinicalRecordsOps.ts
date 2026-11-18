// =======================================================================
// PhysioRecord — Clinical Records, Episode Stores, Snapshots, Consents,
// Attachments, Medications, Custom Widgets & Note Templates Operations
// =======================================================================

import { db as defaultDb, type PhysioRecordDatabase } from '../../db/db';
import {
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  decryptRecordPayload,
  encryptRecordWithMandatoryReservation,
} from '../../crypto/vault';
import { canonicalizeForSeal } from '../sessionService';
import { BUILT_IN_CC0_SNIPPETS, parseAndValidateContentPackJson } from '../../data/noteTemplatesCc0';
import type { CustomWidgetDefinition } from '../../types/clinicalWidgets';
import { StaleTabOverwriteError, type EncryptedEpisodeClinicalEntity } from '../../types/clinical';
import type {
  ClinicalAssessmentSnapshot,
  ConsentTemplateId,
  ContentPackDefinition,
  EncryptedAttachmentRecord,
  EpisodeScopedClinicalStore,
  NoteTemplateSnippet,
  PatientConsentRecord,
  PatientMedicationPlan,
  SessionFlowsheetData,
} from '../../types/clinicManagement';
import { localDate } from '../../utils/date';
import {
  CUSTOM_WIDGET_LIMITS,
  validateCustomWidgetDefinition,
} from '../clinicSecurityHelpers';
import {
  areUint8ArraysEqual,
  getEpisodeClinicalMutationTestHook,
} from './operationsConstants';
import type { OperationsRuntime } from './operationsTypes';

/**
 * Append-only snapshot invariant check: existing snapshots may not be deleted,
 * reordered, or mutated. New snapshots can only be appended at the tail.
 */
export function assertAppendOnlySnapshots(
  existingSnapshots: ClinicalAssessmentSnapshot[],
  candidateSnapshots: ClinicalAssessmentSnapshot[]
): void {
  if (!Array.isArray(existingSnapshots) || existingSnapshots.length === 0) {
    return;
  }
  if (!Array.isArray(candidateSnapshots) || candidateSnapshots.length < existingSnapshots.length) {
    throw new Error(
      'Append-only Snapshots Invariant Violation: لا يمكن حذف أو تقليص اللقطات السريرية المعتمدة في الحلقة.'
    );
  }
  for (let i = 0; i < existingSnapshots.length; i += 1) {
    if (canonicalizeForSeal(existingSnapshots[i]) !== canonicalizeForSeal(candidateSnapshots[i])) {
      throw new Error(
        `Append-only Snapshots Invariant Violation: تم رصد تعديل أو إعادة ترتيب غير مصرح للقطة السريرية #${existingSnapshots[i].id}.`
      );
    }
  }
}

// ---------------------------------------------------------------------
// Phase 5.2: Encrypted Patient Attachments & Posture Photos (Dexie v9)
// ---------------------------------------------------------------------
export function getAttachmentsForPatientOps(
  rt: OperationsRuntime,
  patientId: string
): EncryptedAttachmentRecord[] {
  return [...(rt.getCache().attachmentsByPatientId.get(patientId) || [])].sort(
    (a, b) => b.capturedAt.localeCompare(a.capturedAt) || b.createdAt.localeCompare(a.createdAt)
  );
}

export function getTotalAttachmentsBytesOps(rt: OperationsRuntime): number {
  let total = 0;
  for (const list of rt.getCache().attachmentsByPatientId.values()) {
    for (const att of list) {
      total += att.storedBytes || 0;
    }
  }
  return total;
}

export async function saveAttachmentAsyncOps(
  rt: OperationsRuntime,
  input: Omit<EncryptedAttachmentRecord, 'id' | 'createdAt' | 'updatedAt' | 'version'> & {
    id?: string;
  }
): Promise<EncryptedAttachmentRecord> {
  const cache = rt.getCache();
  const database = rt.getActiveDb();
  const now = new Date().toISOString();
  const id = input.id || `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const existingList = cache.attachmentsByPatientId.get(input.patientId) || [];
  const existing = existingList.find((a) => a.id === id);

  const record: EncryptedAttachmentRecord = {
    ...input,
    id,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    version: (existing?.version || 0) + 1,
  };

  const nextList = [record, ...existingList.filter((a) => a.id !== id)];
  cache.attachmentsByPatientId.set(input.patientId, nextList);

  if (!database.verno || database.verno >= 9) {
    await rt.trackWrite(
      rt.putRecordEncrypted(
        'attachments',
        record.id,
        [record.patientId],
        record,
        {
          patientId: record.patientId,
          category: record.category,
          ...(record.episodeId ? { episodeId: record.episodeId } : {}),
        },
        { skipConcurrencyCheck: true }
      )
    );
  }

  await rt.appendAuditLogAsync({
    actionType: 'attachment_saved',
    entityType: 'attachment',
    entityId: record.id,
    patientId: record.patientId,
    episodeId: record.episodeId,
    summaryAr: `حفظ مرفق سريري مشفر (${record.title}) — ${Math.round((record.storedBytes || 0) / 1024)} KB`,
    summaryEn: `Saved encrypted clinical attachment (${record.title}) — ${Math.round((record.storedBytes || 0) / 1024)} KB`,
  });

  rt.notifyListeners();
  return record;
}

export async function deleteAttachmentAsyncOps(
  rt: OperationsRuntime,
  patientId: string,
  attachmentId: string
): Promise<EncryptedAttachmentRecord[]> {
  const cache = rt.getCache();
  const database = rt.getActiveDb();
  const existingList = cache.attachmentsByPatientId.get(patientId) || [];
  const target = existingList.find((a) => a.id === attachmentId);
  const nextList = existingList.filter((a) => a.id !== attachmentId);
  cache.attachmentsByPatientId.set(patientId, nextList);

  if (!database.verno || database.verno >= 9) {
    await rt.deleteRecordEncrypted('attachments', attachmentId);
  }

  if (target) {
    await rt.appendAuditLogAsync({
      actionType: 'attachment_deleted',
      entityType: 'attachment',
      entityId: attachmentId,
      patientId,
      summaryAr: `حذف مرفق سريري (${target.title})`,
      summaryEn: `Deleted clinical attachment (${target.title})`,
    });
  }

  rt.notifyListeners();
  return getAttachmentsForPatientOps(rt, patientId);
}

// ---------------------------------------------------------------------
// Phase 5.6: Encrypted Clinical Note Templates & Content Packs (Dexie v9)
// ---------------------------------------------------------------------
export function getAllNoteTemplatesOps(rt: OperationsRuntime): NoteTemplateSnippet[] {
  const customMap = new Map<string, NoteTemplateSnippet>();
  for (const t of rt.getCache().noteTemplates) {
    customMap.set(t.id, t);
  }
  const merged: NoteTemplateSnippet[] = [];
  for (const cc0 of BUILT_IN_CC0_SNIPPETS) {
    merged.push(customMap.get(cc0.id) || cc0);
    customMap.delete(cc0.id);
  }
  return [...Array.from(customMap.values()), ...merged];
}

export function getCustomNoteTemplatesOps(rt: OperationsRuntime): NoteTemplateSnippet[] {
  return [...rt.getCache().noteTemplates];
}

export async function saveNoteTemplateAsyncOps(
  rt: OperationsRuntime,
  snippet: Omit<NoteTemplateSnippet, 'id' | 'updatedAt' | 'version'> & { id?: string }
): Promise<NoteTemplateSnippet> {
  const cleanTrigger = snippet.slashTrigger.replace(/^\/+/, '').trim().toLowerCase();
  if (!cleanTrigger) {
    throw new Error('يرجى إدخال كلمة الاختصار بدون مسافات.');
  }
  const cache = rt.getCache();
  const database = rt.getActiveDb();
  const now = new Date().toISOString();
  const id = snippet.id || `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const existing = cache.noteTemplates.find((n) => n.id === id);

  const record: NoteTemplateSnippet = {
    ...snippet,
    id,
    slashTrigger: cleanTrigger,
    isBuiltIn: false,
    updatedAt: now,
    version: (existing?.version || 0) + 1,
  };

  cache.noteTemplates = [record, ...cache.noteTemplates.filter((n) => n.id !== id)];

  if (!database.verno || database.verno >= 9) {
    await rt.trackWrite(
      rt.putRecordEncrypted(
        'noteTemplates',
        record.id,
        [],
        record,
        { category: record.category },
        { skipConcurrencyCheck: true }
      )
    );
  }

  rt.notifyListeners();
  return record;
}

export async function deleteNoteTemplateAsyncOps(rt: OperationsRuntime, id: string): Promise<void> {
  const cache = rt.getCache();
  const database = rt.getActiveDb();
  cache.noteTemplates = cache.noteTemplates.filter((n) => n.id !== id);
  if (!database.verno || database.verno >= 9) {
    await rt.deleteRecordEncrypted('noteTemplates', id);
  }
  rt.notifyListeners();
}

export async function importContentPackAsyncOps(
  rt: OperationsRuntime,
  rawJson: string
): Promise<{
  pack: ContentPackDefinition;
  importedCount: number;
}> {
  const cache = rt.getCache();
  const database = rt.getActiveDb();
  const { pack, snippets } = parseAndValidateContentPackJson(rawJson);
  const nonConflict = cache.noteTemplates.filter((n) => n.packId !== pack.packId);
  cache.noteTemplates = [...snippets, ...nonConflict];

  if (!database.verno || database.verno >= 9) {
    for (const s of snippets) {
      await rt.trackWrite(
        rt.putRecordEncrypted(
          'noteTemplates',
          s.id,
          [],
          s,
          { category: s.category },
          { skipConcurrencyCheck: true }
        )
      );
    }
  }

  await rt.appendAuditLogAsync({
    actionType: 'content_pack_imported',
    entityType: 'settings',
    entityId: pack.packId,
    summaryAr: `استيراد حزمة قوالب (${pack.name} — ${pack.license}): ${snippets.length} قالب`,
    summaryEn: `Imported template content pack (${pack.name} — ${pack.license}): ${snippets.length} snippets`,
  });

  rt.notifyListeners();
  return { pack, importedCount: snippets.length };
}

export function getAllEpisodeClinicalStoresOps(
  rt: OperationsRuntime
): EpisodeScopedClinicalStore[] {
  return Array.from(rt.getCache().episodeClinicalByEpisodeId.values());
}

// ---------------------------------------------------------------------
// Patient Medications Encrypted Store (Dexie v7: patientMedications)
// ---------------------------------------------------------------------
export function getPatientMedicationsOps(
  rt: OperationsRuntime,
  patientId: string
): Array<Record<string, unknown>> {
  const plan = rt.getCache().patientMedicationsByPatientId.get(patientId);
  return plan ? [...plan.medications] : [];
}

export function savePatientMedicationsOps(
  rt: OperationsRuntime,
  patientId: string,
  medications: Array<Record<string, unknown>>
): void {
  const cache = rt.getCache();
  const now = new Date().toISOString();
  const existing = cache.patientMedicationsByPatientId.get(patientId);
  const plan: PatientMedicationPlan = {
    patientId,
    medications,
    updatedAt: now,
    version: (existing?.version || 0) + 1,
  };
  cache.patientMedicationsByPatientId.set(patientId, plan);
  void rt.trackWrite(
    rt.putRecordEncrypted('patientMedications', patientId, [patientId], plan, { patientId })
  ).catch(() => undefined);
  rt.notifyListeners();
}

// ---------------------------------------------------------------------
// Custom Clinical Widgets Encrypted Store with Zod Validation (1.11)
// ---------------------------------------------------------------------
export function getCustomWidgetsOps(rt: OperationsRuntime): CustomWidgetDefinition[] {
  return [...rt.getCache().customWidgets];
}

export async function saveCustomWidgetAsyncOps(
  rt: OperationsRuntime,
  candidate: unknown,
  rawJsonLength?: number
): Promise<CustomWidgetDefinition> {
  const check = validateCustomWidgetDefinition(candidate, rawJsonLength);
  if (!check.ok) {
    throw new Error(check.error);
  }
  const cache = rt.getCache();
  const widget = check.data;
  const existsIdx = cache.customWidgets.findIndex((w) => w.id === widget.id);
  if (existsIdx < 0 && cache.customWidgets.length >= CUSTOM_WIDGET_LIMITS.MAX_WIDGETS) {
    throw new Error(
      `Maximum custom widget cap (${CUSTOM_WIDGET_LIMITS.MAX_WIDGETS}) reached.`
    );
  }

  const updated = [...cache.customWidgets.filter((w) => w.id !== widget.id), widget];
  cache.customWidgets = updated;
  await rt.trackWrite(rt.putRecordEncrypted('customWidgets', widget.id, [], widget));
  await rt.appendAuditLogAsync({
    actionType: 'settings_updated',
    entityType: 'settings',
    entityId: widget.id,
    summaryAr: `حفظ فحص مخصص في الاستوديو: ${widget.titleAr}`,
    summaryEn: `Saved Custom Clinical Widget: ${widget.titleEn}`,
  });
  rt.notifyListeners();
  return widget;
}

export async function deleteCustomWidgetAsyncOps(
  rt: OperationsRuntime,
  widgetId: string
): Promise<void> {
  const cache = rt.getCache();
  cache.customWidgets = cache.customWidgets.filter((w) => w.id !== widgetId);
  await rt.deleteRecordEncrypted('customWidgets', widgetId);
  rt.notifyListeners();
}

// ---------------------------------------------------------------------
// Episode-Scoped Clinical Store & Append-Only Snapshots
// ---------------------------------------------------------------------
export function getEpisodeClinicalStoreOps(
  rt: OperationsRuntime,
  episodeId: string,
  patientId: string
): EpisodeScopedClinicalStore {
  const existing = rt.getCache().episodeClinicalByEpisodeId.get(episodeId);
  if (existing) {
    return existing;
  }

  const fresh: EpisodeScopedClinicalStore = {
    episodeId,
    patientId,
    activeWidgetIds: ['body_chart', 'rom', 'mmt', 'special_tests', 'functional_scales'],
    chiefComplaint: '',
    historyOfPresentIllness: '',
    mechanismOfInjury: '',
    painAtRestNrs: 3,
    painOnActivityNrs: 6,
    painWorst24hNrs: 7,
    painNature: 'ألم ميكانيكي يزداد مع المجهود (Mechanical pain)',
    aggravatingFactors: '',
    relievingFactors: '',
    functionalLimitations: '',
    patientPersonalGoals: '',
    observationPosture: '',
    palpationFindings: '',
    circumferenceEdemaNotes: '',
    treatmentFrequency: '3 جلسات أسبوعياً (3x / Week)',
    plannedDurationWeeks: 6,
    clinicalImpression: '',
    objective: {},
    specialTests: [],
    customWidgetsData: {},
    snapshots: [],
    smartGoals: [],
    hepProgram: [],
    problemList: [],
    outcomeGoals: [],
    performanceTests: [],
    vitalsHistory: [],
    appliedPresetIds: [],
    updatedAt: new Date().toISOString(),
  };
  return fresh;
}

export function saveEpisodeClinicalStoreOps(
  rt: OperationsRuntime,
  store: EpisodeScopedClinicalStore
): void {
  const cache = rt.getCache();
  const existing = cache.episodeClinicalByEpisodeId.get(store.episodeId);
  if (existing) {
    assertAppendOnlySnapshots(existing.snapshots || [], store.snapshots || []);
  }

  const updated: EpisodeScopedClinicalStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  cache.episodeClinicalByEpisodeId.set(store.episodeId, updated);

  if (rt.getActiveDek()) {
    void rt.trackWrite(
      rt.putRecordEncrypted(
        'episodeClinical',
        updated.episodeId,
        [updated.episodeId],
        updated,
        {
          episodeId: updated.episodeId,
          patientId: updated.patientId,
        },
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
  }

  rt.appendAuditLog({
    actionType: 'evaluation_saved',
    entityType: 'episode',
    entityId: store.episodeId,
    patientId: store.patientId,
    episodeId: store.episodeId,
    summaryAr: `حفظ وتحديث التقييم السريري لحلقة الرعاية #${store.episodeId.slice(0, 6)}`,
    summaryEn: `Saved episode-scoped clinical assessment for episode #${store.episodeId.slice(0, 6)}`,
  });
}

export async function getEpisodeClinicalStoreEncryptedOps(
  rt: OperationsRuntime,
  episodeId: string,
  patientId: string,
  dek: CryptoKey,
  database: PhysioRecordDatabase = defaultDb
): Promise<EpisodeScopedClinicalStore> {
  const existingEntity =
    (await database.episodeClinical.get(episodeId)) ||
    (await database.episodeClinical.where('episodeId').equals(episodeId).first());
  if (existingEntity) {
    const dec = await decryptRecordPayload<EpisodeScopedClinicalStore>(
      dek,
      'episodeClinical',
      existingEntity.id,
      [existingEntity.episodeId],
      existingEntity.iv,
      existingEntity.ciphertext,
      existingEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
      existingEntity.dekVersion || CURRENT_DEK_VERSION,
      existingEntity.recordSalt
    );
    rt.getCache().episodeClinicalByEpisodeId.set(episodeId, dec);
    return dec;
  }
  return getEpisodeClinicalStoreOps(rt, episodeId, patientId);
}

export async function saveEpisodeClinicalStoreEncryptedOps(
  rt: OperationsRuntime,
  store: EpisodeScopedClinicalStore,
  dek: CryptoKey,
  database: PhysioRecordDatabase = defaultDb,
  expectedUpdatedAt?: string
): Promise<EncryptedEpisodeClinicalEntity> {
  if (!store.episodeId || !store.patientId) {
    throw new Error('معرّف حلقة الرعاية والمريض إلزاميان لحفظ سجل التقييم المشفر.');
  }

  // Read-only legacy snapshot invariant check if an unmigrated key exists during migration
  if (typeof localStorage !== 'undefined') {
    const epKey = `physiorecord_episode_clinical_v2_${store.episodeId}`;
    const existingLsRaw = localStorage.getItem(epKey);
    if (existingLsRaw) {
      try {
        const parsedLs = JSON.parse(existingLsRaw) as EpisodeScopedClinicalStore;
        assertAppendOnlySnapshots(parsedLs.snapshots || [], store.snapshots || []);
      } catch (err) {
        if (err instanceof Error && err.message.includes('Append-only Snapshots')) {
          throw err;
        }
      }
    }
  }

  const preEntity =
    (await database.episodeClinical.get(store.episodeId)) ||
    (await database.episodeClinical.where('episodeId').equals(store.episodeId).first());

  if (
    expectedUpdatedAt !== undefined &&
    preEntity &&
    preEntity.updatedAt !== expectedUpdatedAt
  ) {
    throw new StaleTabOverwriteError(
      'تم تعديل سجل تقييم حلقة الرعاية في تبويب آخر (Changed in another tab).'
    );
  }

  if (preEntity) {
    const preDecrypted = await decryptRecordPayload<EpisodeScopedClinicalStore>(
      dek,
      'episodeClinical',
      preEntity.id,
      [preEntity.episodeId],
      preEntity.iv,
      preEntity.ciphertext,
      preEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
      preEntity.dekVersion || CURRENT_DEK_VERSION,
      preEntity.recordSalt
    );
    assertAppendOnlySnapshots(preDecrypted.snapshots || [], store.snapshots || []);
  }

  const baselineUpdatedAt = expectedUpdatedAt ?? preEntity?.updatedAt;
  const baselineIv = preEntity?.iv;
  const now = new Date().toISOString();
  const createdAt = preEntity?.createdAt || now;

  const payloadToEncrypt: EpisodeScopedClinicalStore = {
    ...store,
    updatedAt: now,
  };

  const meta = await database.vaultMeta.get('auth');
  const activeDekVersion = meta?.dekVersion || CURRENT_DEK_VERSION;

  const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
    database,
    dek,
    'episodeClinical',
    store.episodeId,
    [store.episodeId],
    payloadToEncrypt,
    CURRENT_RECORD_CRYPTO_VERSION,
    activeDekVersion
  );

  const candidateEntity: EncryptedEpisodeClinicalEntity = {
    id: store.episodeId,
    episodeId: store.episodeId,
    patientId: store.patientId,
    createdAt,
    updatedAt: now,
    version: (preEntity?.version ?? 0) + 1,
    recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
    dekVersion: activeDekVersion,
    recordSalt,
    iv,
    ciphertext,
  };

  const testHook = getEpisodeClinicalMutationTestHook();
  if (testHook) {
    await testHook({ episodeId: store.episodeId });
  }

  await database.transaction(
    'rw',
    [database.episodeClinical, database.vaultMeta],
    async () => {
      const currentEntity =
        (await database.episodeClinical.get(store.episodeId)) ||
        (await database.episodeClinical.where('episodeId').equals(store.episodeId).first());

      if (preEntity) {
        if (
          !currentEntity ||
          currentEntity.updatedAt !== baselineUpdatedAt ||
          (baselineIv && !areUint8ArraysEqual(currentEntity.iv, baselineIv))
        ) {
          throw new StaleTabOverwriteError(
            'تم تعديل سجل تقييم حلقة الرعاية في تبويب آخر أثناء الحفظ (Changed in another tab).'
          );
        }
      } else if (currentEntity) {
        throw new StaleTabOverwriteError(
          'تم إنشاء سجل تقييم حلقة الرعاية في تبويب آخر أثناء الحفظ (Changed in another tab).'
        );
      }

      if (currentEntity) {
        const inTxDecrypted = await decryptRecordPayload<EpisodeScopedClinicalStore>(
          dek,
          'episodeClinical',
          currentEntity.id,
          [currentEntity.episodeId],
          currentEntity.iv,
          currentEntity.ciphertext,
          currentEntity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
          currentEntity.dekVersion || CURRENT_DEK_VERSION,
          currentEntity.recordSalt
        );
        assertAppendOnlySnapshots(
          inTxDecrypted.snapshots || [],
          payloadToEncrypt.snapshots || []
        );
      }

      await database.episodeClinical.put(candidateEntity);
    }
  );

  rt.getCache().episodeClinicalByEpisodeId.set(store.episodeId, payloadToEncrypt);
  return candidateEntity;
}

export function recordEpisodeSnapshotOps(
  rt: OperationsRuntime,
  episodeId: string,
  patientId: string,
  snapshotType: ClinicalAssessmentSnapshot['snapshotType'],
  customLabelAr?: string,
  customLabelEn?: string
): ClinicalAssessmentSnapshot {
  const store = getEpisodeClinicalStoreOps(rt, episodeId, patientId);
  const staff = rt.getActiveStaff();
  const today = localDate();

  const romEntries = store.objective?.romBattery?.entries || [];
  const mmtEntries = store.objective?.mmtBattery?.entries || [];

  const typeLabels: Record<ClinicalAssessmentSnapshot['snapshotType'], { ar: string; en: string }> = {
    initial_evaluation: { ar: 'التقييم الأولي (Baseline)', en: 'Initial Evaluation' },
    re_evaluation: {
      ar: `إعادة تقييم سريري (${store.snapshots.length + 1})`,
      en: `Re-evaluation #${store.snapshots.length + 1}`,
    },
    follow_up: { ar: 'تحديث متابعة سريرية', en: 'Follow-up Snapshot' },
    discharge: { ar: 'تقييم التخريج الختامي (Discharge)', en: 'Discharge Evaluation' },
  };

  const snapshot: ClinicalAssessmentSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    episodeId,
    snapshotType,
    recordedDate: today,
    recordedBy: staff.nameEn,
    labelAr: customLabelAr || typeLabels[snapshotType].ar,
    labelEn: customLabelEn || typeLabels[snapshotType].en,
    painNrsRest: store.painAtRestNrs ?? 0,
    painNrsActivity: store.painOnActivityNrs ?? 0,
    romSummary: romEntries
      .filter((r) => r.isTested && r.measuredAngleDegrees !== null)
      .map((r) => ({
        jointMovementKey: `${r.jointId}_${r.movementId}_${r.laterality}`,
        canonicalKey: r.canonicalKey ?? `rom.${r.jointId}.${r.movementId}.${r.laterality}`,
        label: r.label || r.movementNameEn || r.movementNameAr,
        labelAr: `${r.jointNameAr} - ${r.movementNameAr} (${r.laterality === 'right' ? 'يمين' : r.laterality === 'left' ? 'يسار' : 'ثنائي'})`,
        labelEn: `${r.jointNameEn} ${r.movementNameEn} (${r.laterality})`,
        laterality: r.laterality,
        aromDegrees: r.measuredAngleDegrees,
      })),
    mmtSummary: mmtEntries
      .filter((m) => m.isTested && m.gradeValue !== null)
      .map((m) => ({
        muscleKey: `${m.muscleGroupId}_${m.laterality}`,
        canonicalKey: m.canonicalKey ?? null,
        label: m.label || m.muscleNameAr || m.muscleNameEn,
        labelAr: `${m.muscleNameAr} (${m.laterality === 'right' ? 'يمين' : m.laterality === 'left' ? 'يسار' : 'ثنائي'})`,
        labelEn: `${m.muscleNameEn} (${m.laterality})`,
        laterality: m.laterality,
        grade: m.gradeValue || '4',
      })),
    outcomeScale: store.functionalScales
      ? {
          scaleId: store.functionalScales.scaleId,
          scaleNameAr: store.functionalScales.scaleNameAr,
          scaleNameEn: store.functionalScales.scaleNameEn,
          rawScore: store.functionalScales.rawScore,
          scorePercentage: store.functionalScales.scorePercentage,
          severityLabelAr: store.functionalScales.severityLabelAr,
          severityLabelEn: store.functionalScales.severityLabelEn,
        }
      : undefined,
    specialTestsPositiveCount: (store.specialTests || []).filter(
      (t) => t.outcome === 'positive' || t.outcome === 'pain_reproduced'
    ).length,
    clinicalImpressionNote: store.clinicalImpression,
  };

  const nextStore: EpisodeScopedClinicalStore = {
    ...store,
    snapshots: [...store.snapshots, snapshot],
  };
  saveEpisodeClinicalStoreOps(rt, nextStore);
  return snapshot;
}

// Legacy in-memory flowsheet accessors (kept for compat without localStorage)
export function getSessionFlowsheetOps(
  rt: OperationsRuntime,
  sessionId: string
): SessionFlowsheetData | null {
  return rt.getCache().flowsheetBySessionId.get(sessionId) || null;
}

export function saveSessionFlowsheetOps(
  rt: OperationsRuntime,
  sessionId: string,
  episodeId: string,
  data: SessionFlowsheetData
): void {
  const cache = rt.getCache();
  cache.flowsheetBySessionId.set(sessionId, data);
  cache.latestFlowsheetByEpisodeId.set(episodeId, data);
}

export function getLatestEpisodeFlowsheetOps(
  rt: OperationsRuntime,
  episodeId: string
): SessionFlowsheetData | null {
  return rt.getCache().latestFlowsheetByEpisodeId.get(episodeId) || null;
}

// ---------------------------------------------------------------------
// Bilingual Informed Consents & Encrypted Canvas Signatures (Phase 4.8)
// ---------------------------------------------------------------------
export function getConsentsForPatientOps(
  rt: OperationsRuntime,
  patientId: string
): PatientConsentRecord[] {
  const list = rt.getCache().consentsByPatientId.get(patientId) || [];
  return [...list].sort((a, b) => b.signedAt.localeCompare(a.signedAt));
}

export async function savePatientConsentAsyncOps(
  rt: OperationsRuntime,
  input: {
    patientId: string;
    episodeId?: string;
    templateId: ConsentTemplateId;
    templateVersion: string;
    titleAr: string;
    titleEn: string;
    bodySnapshotAr: string;
    bodySnapshotEn: string;
    signerName: string;
    signerRelation: 'patient' | 'guardian' | 'representative';
    signatureDataUrl: string;
    consentGranted: boolean;
  }
): Promise<PatientConsentRecord> {
  if (!input.patientId?.trim()) {
    throw new Error('معرّف المريض مطلوب لحفظ نموذج الموافقة المستنيرة.');
  }
  if (!input.signerName?.trim()) {
    throw new Error('اسم الموقّع مطلوب لحفظ نموذج الموافقة.');
  }
  if (!input.signatureDataUrl || !input.signatureDataUrl.startsWith('data:image/')) {
    throw new Error('التوقيع الرقمي على اللوحة مطلوب قبل الاعتماد.');
  }

  const cache = rt.getCache();
  const database = rt.getActiveDb();
  const staff = rt.getActiveStaff();
  const now = new Date().toISOString();
  const record: PatientConsentRecord = {
    id: `cons_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    patientId: input.patientId.trim(),
    ...(input.episodeId ? { episodeId: input.episodeId } : {}),
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    titleAr: input.titleAr,
    titleEn: input.titleEn,
    bodySnapshotAr: input.bodySnapshotAr,
    bodySnapshotEn: input.bodySnapshotEn,
    signerName: input.signerName.trim(),
    signerRelation: input.signerRelation,
    therapistWitnessName: staff.nameAr || staff.nameEn,
    signatureDataUrl: input.signatureDataUrl,
    consentGranted: input.consentGranted,
    signedAt: now,
    updatedAt: now,
    version: 1,
  };

  const existing = cache.consentsByPatientId.get(record.patientId) || [];
  cache.consentsByPatientId.set(record.patientId, [record, ...existing]);

  if (!database.verno || database.verno >= 8) {
    await rt.trackWrite(
      rt.putRecordEncrypted('consents', record.id, [record.patientId], record, {
        patientId: record.patientId,
        ...(record.episodeId ? { episodeId: record.episodeId } : {}),
      })
    );
  }

  await rt.appendAuditLogAsync({
    actionType: 'consent_signed',
    entityType: 'consent',
    entityId: record.id,
    patientId: record.patientId,
    episodeId: record.episodeId,
    summaryAr: `توقيع نموذج موافقة (${record.titleAr}) باسم ${record.signerName}`,
    summaryEn: `Signed consent (${record.titleEn}) by ${record.signerName}`,
  });

  rt.notifyListeners();
  return record;
}

export async function revokePatientConsentAsyncOps(
  rt: OperationsRuntime,
  patientId: string,
  consentId: string,
  reason: string
): Promise<PatientConsentRecord[]> {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('يرجى كتابة سبب سحب أو إلغاء الموافقة.');
  }
  const cache = rt.getCache();
  const database = rt.getActiveDb();
  const existingList = cache.consentsByPatientId.get(patientId) || [];
  let updatedRef: PatientConsentRecord | null = null;
  const now = new Date().toISOString();

  const nextList = existingList.map((c) => {
    if (c.id !== consentId) return c;
    updatedRef = {
      ...c,
      revokedAt: now,
      revokeReason: cleanReason,
      updatedAt: now,
      version: (c.version || 1) + 1,
    };
    return updatedRef;
  });

  if (!updatedRef) {
    throw new Error('لم يتم العثور على سجل الموافقة المطلوب.');
  }

  cache.consentsByPatientId.set(patientId, nextList);
  if (!database.verno || database.verno >= 8) {
    const ref: PatientConsentRecord = updatedRef;
    await rt.trackWrite(
      rt.putRecordEncrypted(
        'consents',
        ref.id,
        [ref.patientId],
        ref,
        {
          patientId: ref.patientId,
          ...(ref.episodeId ? { episodeId: ref.episodeId } : {}),
        },
        { skipConcurrencyCheck: true }
      )
    );
  }

  await rt.appendAuditLogAsync({
    actionType: 'consent_revoked',
    entityType: 'consent',
    entityId: consentId,
    patientId,
    summaryAr: `سحب الموافقة (${(updatedRef as PatientConsentRecord).titleAr}): ${cleanReason}`,
    summaryEn: `Revoked consent (${(updatedRef as PatientConsentRecord).titleEn}): ${cleanReason}`,
  });

  rt.notifyListeners();
  return getConsentsForPatientOps(rt, patientId);
}
