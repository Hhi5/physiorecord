// =======================================================================
// PhysioRecord — Module Flags, Settings, Locations, Breaks, Recycle Bin,
// Workspace Mode, Smart Memory, Quick SOAP & Onboarding Operations
// =======================================================================

import type {
  BackupStateMetadata,
  ClinicAppointment,
  ClinicExpenseIQD,
  ClinicProfileData,
  ClinicServiceItem,
  ClinicStaffMember,
  ClinicWorkspaceMode,
  ClosedDateRangeEntry,
  ModuleFlagsSettings,
  MrnRegistryData,
  OnboardingStateSettings,
  PostDischargeFollowUpRecord,
  PracticeLocationItem,
  QuickSoapChip,
  QuickSoapPreferences,
  RecycleBinEntry,
  RecycleBinItemType,
  RecurringExpenseTemplate,
  ReferringDoctorEntry,
  RegionalExamPresetDefinition,
  SecurityConfigSettings,
  SmartMemorySettings,
  VitalsAlertThresholds,
  WaitingListEntry,
  WeeklyBreakWindow,
  WhatsAppTemplatesConfig,
  WorkspaceModeSettings,
  WriteTelemetryStats,
} from '../../types/clinicManagement';
import { localDate } from '../../utils/date';
import {
  removeSessionTimerEntry,
  upsertBoundedSessionTimer,
} from '../../utils/sessionTimerState';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../utils/whatsappTemplates';
import {
  CLINIC_RECYCLE_BIN_RETENTION_DAYS,
  CLINIC_STAFF_ROSTER,
  DEFAULT_VITALS_THRESHOLDS,
  cloneDefaultLocations,
  cloneDefaultRecurringExpenseTemplates,
} from './operationsConstants';
import type { OperationsRuntime } from './operationsTypes';

export type BooleanModuleFlagKey =
  | 'enableConsentModule'
  | 'enableAttachmentsModule'
  | 'enableVoiceDictationModule'
  | 'allowCloudSpeechFallbackOptIn'
  | 'enableTemplatesModule'
  | 'enableAnalyticsModule'
  | 'enableKioskModule'
  | 'enableProblemListGoals'
  | 'enableReEvalNudges'
  | 'enableNoteCompletenessCheck'
  | 'enablePerformanceTestLibrary'
  | 'enableModalitySafetyCheck'
  | 'enableVitalsModule'
  | 'enablePediatricSafeguards'
  | 'enablePediatricGeometricPainIcons'
  | 'enableHomeVisits'
  | 'enablePracticeLocations'
  | 'enableClosedDaysBreaks'
  | 'enableHijriDateDisplay'
  | 'enableInstallmentPlans'
  | 'enableRecurringExpenses'
  | 'enableReferralsModule'
  | 'enableRetentionLists'
  | 'enableImportWizard'
  | 'enableTrashRecycleBin'
  | 'enableDataHealthScreen'
  | 'enableBilingualTerminologyGlossary'
  | 'enableWebShareInterop'
  | 'enableIcsCalendarExport'
  | 'enableScheduleVisitCardPrint'
  | 'enablePhotoMeasurementTools';

export function getReceptionPrivacyBlurOps(rt: OperationsRuntime): boolean {
  return rt.getCache().receptionPrivacyBlur;
}

export function setReceptionPrivacyBlurOps(rt: OperationsRuntime, enabled: boolean): void {
  const cache = rt.getCache();
  cache.receptionPrivacyBlur = enabled;
  const payload = {
    ...cache.moduleFlags,
    receptionPrivacyBlur: enabled,
    updatedAt: new Date().toISOString(),
  };
  void rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'module_flags', [], payload, {}, { skipConcurrencyCheck: true })
  ).catch(() => undefined);
  rt.notifyListeners();
}

export function getModuleFlagsOps(rt: OperationsRuntime): ModuleFlagsSettings {
  return { ...rt.getCache().moduleFlags };
}

export async function setModuleFlagsAsyncOps(
  rt: OperationsRuntime,
  partial: Partial<ModuleFlagsSettings>
): Promise<ModuleFlagsSettings> {
  const cache = rt.getCache();
  const next: ModuleFlagsSettings = {
    ...cache.moduleFlags,
    ...partial,
    id: 'module_flags',
    updatedAt: new Date().toISOString(),
    version: (cache.moduleFlags.version || 0) + 1,
  };
  cache.moduleFlags = next;
  await rt.trackWrite(
    rt.putRecordEncrypted(
      'clinicSettings',
      'module_flags',
      [],
      { ...next, receptionPrivacyBlur: cache.receptionPrivacyBlur },
      {},
      { skipConcurrencyCheck: true }
    )
  );
  rt.notifyListeners();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('physiorecord-modules-updated'));
  }
  return next;
}

export function setModuleFlagOps(
  rt: OperationsRuntime,
  flagKey: BooleanModuleFlagKey,
  enabled: boolean
): void {
  const cache = rt.getCache();
  cache.moduleFlags = {
    ...cache.moduleFlags,
    [flagKey]: enabled,
    updatedAt: new Date().toISOString(),
    version: (cache.moduleFlags.version || 0) + 1,
  };
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'clinicSettings',
      'module_flags',
      [],
      { ...cache.moduleFlags, receptionPrivacyBlur: cache.receptionPrivacyBlur },
      {},
      { skipConcurrencyCheck: true }
    )
  ).catch(() => undefined);
  rt.notifyListeners();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('physiorecord-modules-updated'));
  }
}

export function patchModuleFlagsPartialOps(
  rt: OperationsRuntime,
  partial: Partial<ModuleFlagsSettings>
): void {
  const cache = rt.getCache();
  cache.moduleFlags = {
    ...cache.moduleFlags,
    ...partial,
    updatedAt: new Date().toISOString(),
    version: (cache.moduleFlags.version || 0) + 1,
  };
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'clinicSettings',
      'module_flags',
      [],
      { ...cache.moduleFlags, receptionPrivacyBlur: cache.receptionPrivacyBlur },
      {},
      { skipConcurrencyCheck: true }
    )
  ).catch(() => undefined);
  rt.notifyListeners();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('physiorecord-modules-updated'));
  }
}

export function setExerciseLibraryVisibleOps(rt: OperationsRuntime, visible: boolean): void {
  patchModuleFlagsPartialOps(rt, { showHepLibrary: visible });
}

export function setCustomWidgetStudioEnabledOps(rt: OperationsRuntime, enabled: boolean): void {
  patchModuleFlagsPartialOps(rt, { enableCustomWidgetStudio: enabled });
}

export function setSmartGoalsGasEnabledOps(rt: OperationsRuntime, enabled: boolean): void {
  patchModuleFlagsPartialOps(rt, { enableSmartGoalsGas: enabled });
}

export function getReEvalNudgeConfigOps(rt: OperationsRuntime): {
  afterSessions: number;
  afterDays: number;
} {
  const flags = rt.getCache().moduleFlags;
  return {
    afterSessions: flags.reEvalAfterSessions || 6,
    afterDays: flags.reEvalAfterDays || 21,
  };
}

export function setReEvalNudgeConfigOps(
  rt: OperationsRuntime,
  afterSessions: number,
  afterDays: number
): void {
  patchModuleFlagsPartialOps(rt, {
    reEvalAfterSessions: Math.max(1, Math.min(50, Math.round(afterSessions || 6))),
    reEvalAfterDays: Math.max(1, Math.min(180, Math.round(afterDays || 21))),
  });
}

export function getModalitySafetyReviewStatusOps(rt: OperationsRuntime): {
  enabled: boolean;
  reviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
} {
  const flags = rt.getCache().moduleFlags;
  const reviewedBy = flags.modalitySafetyReviewedBy?.trim();
  const reviewed = Boolean(reviewedBy);
  return {
    enabled: Boolean(flags.enableModalitySafetyCheck && reviewed),
    reviewed,
    reviewedBy: reviewedBy || undefined,
    reviewedAt: flags.modalitySafetyReviewedAt,
  };
}

export function confirmModalitySafetyReviewOps(
  rt: OperationsRuntime,
  reviewerName: string,
  enableNow = true
): void {
  const cleanName = reviewerName.trim();
  if (!cleanName) return;
  patchModuleFlagsPartialOps(rt, {
    modalitySafetyReviewedBy: cleanName,
    modalitySafetyReviewedAt: new Date().toISOString(),
    enableModalitySafetyCheck: enableNow,
  });
}

export function setModalitySafetyCheckEnabledOps(rt: OperationsRuntime, enabled: boolean): void {
  if (enabled && !rt.getCache().moduleFlags.modalitySafetyReviewedBy?.trim()) {
    return;
  }
  setModuleFlagOps(rt, 'enableModalitySafetyCheck', enabled);
}

export function getVitalsThresholdsOps(rt: OperationsRuntime): VitalsAlertThresholds {
  return {
    ...DEFAULT_VITALS_THRESHOLDS,
    ...(rt.getCache().moduleFlags.vitalsThresholds || {}),
  };
}

export function setVitalsThresholdsOps(
  rt: OperationsRuntime,
  thresholds: VitalsAlertThresholds
): void {
  patchModuleFlagsPartialOps(rt, {
    vitalsThresholds: { ...DEFAULT_VITALS_THRESHOLDS, ...thresholds },
  });
}

export function getCustomExamPresetsOps(rt: OperationsRuntime): RegionalExamPresetDefinition[] {
  return [...(rt.getCache().moduleFlags.customExamPresets || [])];
}

export function saveCustomExamPresetOps(
  rt: OperationsRuntime,
  preset: RegionalExamPresetDefinition
): void {
  const existing = rt.getCache().moduleFlags.customExamPresets || [];
  const idx = existing.findIndex((p) => p.id === preset.id);
  const nextPreset: RegionalExamPresetDefinition = {
    ...preset,
    updatedAt: new Date().toISOString(),
  };
  const nextList =
    idx >= 0
      ? existing.map((item, i) => (i === idx ? nextPreset : item))
      : [...existing, nextPreset];
  patchModuleFlagsPartialOps(rt, { customExamPresets: nextList });
}

export function deleteCustomExamPresetOps(rt: OperationsRuntime, presetId: string): void {
  const nextList = (rt.getCache().moduleFlags.customExamPresets || []).filter(
    (p) => p.id !== presetId
  );
  patchModuleFlagsPartialOps(rt, { customExamPresets: nextList });
}

export function importCustomExamPresetsOps(
  rt: OperationsRuntime,
  presets: RegionalExamPresetDefinition[]
): number {
  const existing = new Map(
    (rt.getCache().moduleFlags.customExamPresets || []).map((p) => [p.id, p])
  );
  let count = 0;
  for (const preset of presets) {
    existing.set(preset.id, {
      ...preset,
      updatedAt: new Date().toISOString(),
    });
    count += 1;
  }
  patchModuleFlagsPartialOps(rt, { customExamPresets: Array.from(existing.values()) });
  return count;
}

export function setRetentionInactiveDaysThresholdOps(rt: OperationsRuntime, days: number): void {
  const clean = Math.max(3, Math.min(180, Math.round(Number(days) || 14)));
  patchModuleFlagsPartialOps(rt, { retentionInactiveDaysThreshold: clean });
}

// ---------------------------------------------------------------------
// Recycle Bin (30-Day Non-Clinical)
// ---------------------------------------------------------------------
function filterActiveRecycleEntries(
  items: RecycleBinEntry[],
  nowIso?: string
): RecycleBinEntry[] {
  const refMs = nowIso ? Date.parse(nowIso) : Date.now();
  const safeRefMs = Number.isFinite(refMs) ? refMs : Date.now();
  return items.filter((item) => {
    const expMs = Date.parse(item.expiresAt);
    return Number.isFinite(expMs) && expMs > safeRefMs;
  });
}

export function getRecycleBinItemsOps(rt: OperationsRuntime, nowIso?: string): RecycleBinEntry[] {
  const items = rt.getCache().moduleFlags.recycleBinItems || [];
  return filterActiveRecycleEntries(items, nowIso).map((item) => ({
    ...item,
    payload: { ...item.payload },
  }));
}

export function moveRecordToRecycleBinOps(
  rt: OperationsRuntime,
  params: {
    itemType: RecycleBinItemType;
    originalId: string;
    titleAr: string;
    titleEn: string;
    subtitleAr?: string;
    subtitleEn?: string;
    payload: ClinicAppointment | WaitingListEntry | ClinicExpenseIQD;
    nowIso?: string;
  }
): RecycleBinEntry {
  const refMs = params.nowIso ? Date.parse(params.nowIso) : Date.now();
  const safeMs = Number.isFinite(refMs) ? refMs : Date.now();
  const deletedAt = new Date(safeMs).toISOString();
  const expiresAt = new Date(
    safeMs + CLINIC_RECYCLE_BIN_RETENTION_DAYS * 86400_000
  ).toISOString();
  const active = filterActiveRecycleEntries(
    rt.getCache().moduleFlags.recycleBinItems || [],
    deletedAt
  );
  const activeStaff = rt.getActiveStaff();
  const entry: RecycleBinEntry = {
    id: `trash_${params.itemType}_${params.originalId}_${safeMs}`,
    itemType: params.itemType,
    originalId: params.originalId,
    titleAr: params.titleAr,
    titleEn: params.titleEn,
    subtitleAr: params.subtitleAr,
    subtitleEn: params.subtitleEn,
    deletedAt,
    expiresAt,
    deletedBy: activeStaff.nameAr || activeStaff.nameEn,
    payload: { ...params.payload },
  };
  patchModuleFlagsPartialOps(rt, {
    recycleBinItems: [entry, ...active].slice(0, 250),
  });
  return entry;
}

export function restoreRecycleBinItemOps(
  rt: OperationsRuntime,
  trashId: string,
  nowIso?: string
): { restored: boolean; entry?: RecycleBinEntry } {
  const raw = rt.getCache().moduleFlags.recycleBinItems || [];
  const active = filterActiveRecycleEntries(raw, nowIso);
  const target = active.find((item) => item.id === trashId);
  if (!target) {
    if (active.length !== raw.length) {
      patchModuleFlagsPartialOps(rt, { recycleBinItems: active });
    }
    return { restored: false };
  }

  if (target.itemType === 'appointment') {
    rt.restoreAppointment(target.payload as unknown as ClinicAppointment);
  } else if (target.itemType === 'waiting_list') {
    rt.restoreWaitingListEntry(target.payload as unknown as WaitingListEntry);
  } else if (target.itemType === 'expense') {
    rt.restoreExpenseIQD(target.payload as unknown as ClinicExpenseIQD);
  } else {
    return { restored: false };
  }

  const remaining = active.filter((item) => item.id !== trashId);
  patchModuleFlagsPartialOps(rt, { recycleBinItems: remaining });
  rt.appendAuditLog({
    actionType: 'recycle_bin_restored',
    entityType: target.itemType,
    entityId: target.originalId,
    summaryAr: `استعادة عنصر غير سريري من سلة المهملات: ${target.titleAr}`,
    summaryEn: `Restored non-clinical item from 30-day recycle bin: ${target.titleEn}`,
  });
  return { restored: true, entry: target };
}

export function permanentlyDeleteRecycleBinItemOps(
  rt: OperationsRuntime,
  trashId: string
): RecycleBinEntry[] {
  const remaining = (rt.getCache().moduleFlags.recycleBinItems || []).filter(
    (item) => item.id !== trashId
  );
  patchModuleFlagsPartialOps(rt, { recycleBinItems: remaining });
  return getRecycleBinItemsOps(rt);
}

export function purgeExpiredRecycleBinItemsOps(
  rt: OperationsRuntime,
  nowIso?: string
): number {
  const raw = rt.getCache().moduleFlags.recycleBinItems || [];
  const active = filterActiveRecycleEntries(raw, nowIso);
  const removedCount = raw.length - active.length;
  if (removedCount > 0) {
    patchModuleFlagsPartialOps(rt, { recycleBinItems: active });
  }
  return removedCount;
}

// ---------------------------------------------------------------------
// Practice Locations, Weekly Breaks, Closed Dates, Recurring Expense
// Templates, Referring Doctors & Post-Discharge Follow-Ups
// ---------------------------------------------------------------------
export function getPracticeLocationsOps(rt: OperationsRuntime): PracticeLocationItem[] {
  const list = rt.getCache().moduleFlags.practiceLocations;
  return list && list.length > 0 ? list.map((item) => ({ ...item })) : cloneDefaultLocations();
}

export function savePracticeLocationsOps(
  rt: OperationsRuntime,
  locations: PracticeLocationItem[]
): PracticeLocationItem[] {
  patchModuleFlagsPartialOps(rt, { practiceLocations: locations.map((l) => ({ ...l })) });
  return getPracticeLocationsOps(rt);
}

export function getWeeklyBreaksOps(rt: OperationsRuntime): WeeklyBreakWindow[] {
  return (rt.getCache().moduleFlags.weeklyBreaks || []).map((b) => ({
    ...b,
    weekdays: [...b.weekdays],
  }));
}

export function saveWeeklyBreaksOps(
  rt: OperationsRuntime,
  breaks: WeeklyBreakWindow[]
): WeeklyBreakWindow[] {
  patchModuleFlagsPartialOps(rt, {
    weeklyBreaks: breaks.map((b) => ({ ...b, weekdays: [...b.weekdays] })),
  });
  return getWeeklyBreaksOps(rt);
}

export function getClosedDateRangesOps(rt: OperationsRuntime): ClosedDateRangeEntry[] {
  return (rt.getCache().moduleFlags.closedDateRanges || []).map((c) => ({ ...c }));
}

export function saveClosedDateRangesOps(
  rt: OperationsRuntime,
  ranges: ClosedDateRangeEntry[]
): ClosedDateRangeEntry[] {
  patchModuleFlagsPartialOps(rt, { closedDateRanges: ranges.map((r) => ({ ...r })) });
  return getClosedDateRangesOps(rt);
}

export function getRecurringExpenseTemplatesOps(
  rt: OperationsRuntime
): RecurringExpenseTemplate[] {
  const list = rt.getCache().moduleFlags.recurringExpenseTemplates;
  return list && list.length > 0
    ? list.map((t) => ({ ...t }))
    : cloneDefaultRecurringExpenseTemplates();
}

export function saveRecurringExpenseTemplatesOps(
  rt: OperationsRuntime,
  templates: RecurringExpenseTemplate[]
): RecurringExpenseTemplate[] {
  patchModuleFlagsPartialOps(rt, {
    recurringExpenseTemplates: templates.map((t) => ({ ...t })),
  });
  return getRecurringExpenseTemplatesOps(rt);
}

export function getReferringDoctorsOps(rt: OperationsRuntime): ReferringDoctorEntry[] {
  return (rt.getCache().moduleFlags.referringDoctors || []).map((d) => ({ ...d }));
}

export function saveReferringDoctorsOps(
  rt: OperationsRuntime,
  doctors: ReferringDoctorEntry[]
): ReferringDoctorEntry[] {
  patchModuleFlagsPartialOps(rt, { referringDoctors: doctors.map((d) => ({ ...d })) });
  return getReferringDoctorsOps(rt);
}

export function upsertReferringDoctorOps(
  rt: OperationsRuntime,
  entry: Omit<ReferringDoctorEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): ReferringDoctorEntry[] {
  const now = new Date().toISOString();
  const list = getReferringDoctorsOps(rt);
  const targetId = entry.id || `refdoc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  const idx = list.findIndex((d) => d.id === targetId);
  const record: ReferringDoctorEntry = {
    ...entry,
    id: targetId,
    createdAt: idx >= 0 ? list[idx].createdAt : now,
    updatedAt: now,
  };
  const next = idx >= 0 ? list.map((d, i) => (i === idx ? record : d)) : [record, ...list];
  return saveReferringDoctorsOps(rt, next);
}

export function deleteReferringDoctorOps(
  rt: OperationsRuntime,
  doctorId: string
): ReferringDoctorEntry[] {
  return saveReferringDoctorsOps(
    rt,
    getReferringDoctorsOps(rt).filter((d) => d.id !== doctorId)
  );
}

export function getPostDischargeFollowUpsOps(
  rt: OperationsRuntime
): PostDischargeFollowUpRecord[] {
  return (rt.getCache().moduleFlags.postDischargeFollowUps || []).map((f) => ({ ...f }));
}

export function recordPostDischargeFollowUpOps(
  rt: OperationsRuntime,
  entry: Omit<PostDischargeFollowUpRecord, 'id' | 'recordedAt' | 'recordedBy'> & {
    recordedAt?: string;
  }
): PostDischargeFollowUpRecord[] {
  const staff = rt.getActiveStaff();
  const list = rt.getCache().moduleFlags.postDischargeFollowUps || [];
  const existingIdx = list.findIndex(
    (f) =>
      f.patientId === entry.patientId &&
      f.intervalWeeks === entry.intervalWeeks &&
      (entry.episodeId ? f.episodeId === entry.episodeId : f.dischargeDate === entry.dischargeDate)
  );
  const record: PostDischargeFollowUpRecord = {
    ...entry,
    id:
      existingIdx >= 0
        ? list[existingIdx].id
        : `pdfu_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    recordedAt: entry.recordedAt || localDate(),
    recordedBy: staff.nameAr,
  };
  const next =
    existingIdx >= 0 ? list.map((f, i) => (i === existingIdx ? record : f)) : [record, ...list];
  patchModuleFlagsPartialOps(rt, { postDischargeFollowUps: next });
  return next.map((f) => ({ ...f }));
}

// ---------------------------------------------------------------------
// WhatsApp Templates, Clinic Profile, Security Config, MRN, Backup, Telemetry
// ---------------------------------------------------------------------
export function getWhatsAppTemplatesOps(rt: OperationsRuntime): WhatsAppTemplatesConfig {
  const wt = rt.getCache().whatsappTemplates;
  return {
    ...wt,
    appointmentReminder: { ...wt.appointmentReminder },
    hepProgram: { ...wt.hepProgram },
    paymentReceipt: { ...wt.paymentReceipt },
  };
}

export async function saveWhatsAppTemplatesAsyncOps(
  rt: OperationsRuntime,
  partial: Partial<Omit<WhatsAppTemplatesConfig, 'id' | 'updatedAt' | 'version'>>
): Promise<WhatsAppTemplatesConfig> {
  const cache = rt.getCache();
  const next: WhatsAppTemplatesConfig = {
    id: 'whatsapp_templates',
    appointmentReminder:
      partial.appointmentReminder || cache.whatsappTemplates.appointmentReminder,
    hepProgram: partial.hepProgram || cache.whatsappTemplates.hepProgram,
    paymentReceipt: partial.paymentReceipt || cache.whatsappTemplates.paymentReceipt,
    updatedAt: new Date().toISOString(),
    version: (cache.whatsappTemplates.version || 0) + 1,
  };
  cache.whatsappTemplates = next;
  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'whatsapp_templates', [], next, {}, { skipConcurrencyCheck: true })
  );
  await rt.appendAuditLogAsync({
    actionType: 'settings_updated',
    entityType: 'settings',
    entityId: 'whatsapp_templates',
    summaryAr: 'تحديث قوالب رسائل واتساب للعيادة',
    summaryEn: 'Updated clinic WhatsApp message templates',
  });
  rt.notifyListeners();
  return getWhatsAppTemplatesOps(rt);
}

export function resetWhatsAppTemplatesAsyncOps(
  rt: OperationsRuntime
): Promise<WhatsAppTemplatesConfig> {
  return saveWhatsAppTemplatesAsyncOps(rt, {
    appointmentReminder: { ...DEFAULT_WHATSAPP_TEMPLATES.appointmentReminder },
    hepProgram: { ...DEFAULT_WHATSAPP_TEMPLATES.hepProgram },
    paymentReceipt: { ...DEFAULT_WHATSAPP_TEMPLATES.paymentReceipt },
  });
}

export function getClinicProfileOps(rt: OperationsRuntime): ClinicProfileData {
  return { ...rt.getCache().clinicProfile };
}

export async function saveClinicProfileAsyncOps(
  rt: OperationsRuntime,
  partial: Partial<Omit<ClinicProfileData, 'id' | 'updatedAt' | 'version'>>
): Promise<ClinicProfileData> {
  const cache = rt.getCache();
  const next: ClinicProfileData = {
    ...cache.clinicProfile,
    ...partial,
    id: 'clinic_profile',
    updatedAt: new Date().toISOString(),
    version: (cache.clinicProfile.version || 0) + 1,
  };
  cache.clinicProfile = next;
  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'clinic_profile', [], next, {}, { skipConcurrencyCheck: true })
  );
  rt.appendAuditLog({
    actionType: 'settings_updated',
    entityType: 'settings',
    entityId: 'clinic_profile',
    summaryAr: `تحديث بيانات ملف العيادة (${next.clinicNameAr || next.clinicNameEn || 'PhysioRecord'})`,
    summaryEn: `Updated Clinic Profile (${next.clinicNameEn || next.clinicNameAr || 'PhysioRecord'})`,
  });
  rt.notifyListeners();
  return next;
}

export function getSecurityConfigOps(rt: OperationsRuntime): SecurityConfigSettings {
  return { ...rt.getCache().securityConfig };
}

export async function saveSecurityConfigAsyncOps(
  rt: OperationsRuntime,
  partial: Partial<Omit<SecurityConfigSettings, 'id' | 'updatedAt' | 'version'>>
): Promise<SecurityConfigSettings> {
  const cache = rt.getCache();
  const next: SecurityConfigSettings = {
    ...cache.securityConfig,
    ...partial,
    id: 'security_config',
    updatedAt: new Date().toISOString(),
    version: (cache.securityConfig.version || 0) + 1,
  };
  cache.securityConfig = next;
  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'security_config', [], next, {}, { skipConcurrencyCheck: true })
  );
  rt.notifyListeners();
  return next;
}

export function getMrnRegistryOps(rt: OperationsRuntime): MrnRegistryData {
  const reg = rt.getCache().mrnRegistry;
  return {
    ...reg,
    issuedMrns: [...reg.issuedMrns],
    ...(reg.patientMrnMap ? { patientMrnMap: { ...reg.patientMrnMap } } : {}),
  };
}

export async function saveMrnRegistryAsyncOps(
  rt: OperationsRuntime,
  reg: MrnRegistryData
): Promise<void> {
  const cache = rt.getCache();
  const next: MrnRegistryData = {
    ...reg,
    id: 'mrn_registry',
    updatedAt: new Date().toISOString(),
    version: (cache.mrnRegistry.version || 0) + 1,
  };
  cache.mrnRegistry = next;
  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'mrn_registry', [], next, {}, { skipConcurrencyCheck: true })
  );
}

export function saveMrnRegistrySyncOps(rt: OperationsRuntime, reg: MrnRegistryData): void {
  const cache = rt.getCache();
  const next: MrnRegistryData = {
    ...reg,
    id: 'mrn_registry',
    updatedAt: new Date().toISOString(),
    version: (cache.mrnRegistry.version || 0) + 1,
  };
  cache.mrnRegistry = next;
  void rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'mrn_registry', [], next, {}, { skipConcurrencyCheck: true })
  ).catch(() => undefined);
}

export function getBackupMetaOps(rt: OperationsRuntime): BackupStateMetadata {
  return { ...rt.getCache().backupMeta };
}

export async function updateBackupMetaAsyncOps(
  rt: OperationsRuntime,
  partial: Partial<Omit<BackupStateMetadata, 'id' | 'updatedAt' | 'version'>>
): Promise<BackupStateMetadata> {
  const cache = rt.getCache();
  const next: BackupStateMetadata = {
    ...cache.backupMeta,
    ...partial,
    id: 'backup_meta',
    updatedAt: new Date().toISOString(),
    version: (cache.backupMeta.version || 0) + 1,
  };
  cache.backupMeta = next;
  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'backup_meta', [], next, {}, { skipConcurrencyCheck: true })
  );
  rt.notifyListeners();
  return next;
}

export function getWriteTelemetryOps(rt: OperationsRuntime): WriteTelemetryStats {
  return { ...rt.getCache().writeTelemetry };
}

// ---------------------------------------------------------------------
// Phase 2: Solo/Team Workspace Mode, Smart Memory, Quick SOAP & Onboarding
// ---------------------------------------------------------------------
export function getWorkspaceModeOps(rt: OperationsRuntime): WorkspaceModeSettings {
  return { ...rt.getCache().workspaceMode };
}

export async function configureSoloModeAsyncOps(
  rt: OperationsRuntime,
  params?: {
    therapistNameAr?: string;
    therapistNameEn?: string;
    clinicNameAr?: string;
    clinicNameEn?: string;
  }
): Promise<WorkspaceModeSettings> {
  const cache = rt.getCache();
  const now = new Date().toISOString();
  const existingAdmin =
    cache.staffRoster.find((s) => s.role === 'admin') || CLINIC_STAFF_ROSTER[0];
  const nameAr =
    params?.therapistNameAr?.trim() ||
    cache.clinicProfile.therapistNameAr?.trim() ||
    existingAdmin.nameAr;
  const nameEn =
    params?.therapistNameEn?.trim() ||
    cache.clinicProfile.therapistNameEn?.trim() ||
    existingAdmin.nameEn;

  const soloStaff: ClinicStaffMember = {
    id: existingAdmin.id || 'staff_admin',
    nameAr,
    nameEn,
    role: 'admin',
    specialtyAr: existingAdmin.specialtyAr || 'أخصائي العلاج الطبيعي وتأهيل العيادة',
    specialtyEn: existingAdmin.specialtyEn || 'Solo Physical Therapist & Clinic Owner',
  };

  cache.staffRoster = [soloStaff];
  cache.activeStaffId = soloStaff.id;

  const nextMode: WorkspaceModeSettings = {
    id: 'workspace_mode',
    mode: 'solo',
    wizardCompleted: true,
    updatedAt: now,
    version: (cache.workspaceMode.version || 0) + 1,
  };
  cache.workspaceMode = nextMode;

  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'workspace_mode', [], nextMode, {}, { skipConcurrencyCheck: true })
  );
  await rt.trackWrite(
    rt.putRecordEncrypted('staffState', 'staff_roster', [], [soloStaff], {}, { skipConcurrencyCheck: true })
  );
  await rt.trackWrite(
    rt.putRecordEncrypted(
      'staffState',
      'active_staff',
      [],
      { activeStaffId: soloStaff.id, updatedAt: now },
      {},
      { skipConcurrencyCheck: true }
    )
  );

  if (
    params?.therapistNameAr?.trim() ||
    params?.therapistNameEn?.trim() ||
    params?.clinicNameAr?.trim() ||
    params?.clinicNameEn?.trim()
  ) {
    await rt.saveClinicProfileAsync({
      therapistNameAr: nameAr,
      therapistNameEn: nameEn,
      ...(params?.clinicNameAr?.trim() ? { clinicNameAr: params.clinicNameAr.trim() } : {}),
      ...(params?.clinicNameEn?.trim() ? { clinicNameEn: params.clinicNameEn.trim() } : {}),
    });
  }

  await rt.appendAuditLogAsync({
    actionType: 'settings_updated',
    entityType: 'settings',
    entityId: 'workspace_mode',
    summaryAr: 'تفعيل وضع المعالج الفردي (Solo Mode)',
    summaryEn: 'Configured Solo Therapist workspace mode',
  });
  rt.notifyListeners();
  return nextMode;
}

export async function configureTeamModeAsyncOps(
  rt: OperationsRuntime
): Promise<WorkspaceModeSettings> {
  const cache = rt.getCache();
  const now = new Date().toISOString();
  const nextMode: WorkspaceModeSettings = {
    id: 'workspace_mode',
    mode: 'team',
    wizardCompleted: true,
    updatedAt: now,
    version: (cache.workspaceMode.version || 0) + 1,
  };
  cache.workspaceMode = nextMode;

  if (cache.staffRoster.length <= 1) {
    const primaryAdmin = cache.staffRoster[0] || CLINIC_STAFF_ROSTER[0];
    const mergedRoster = [primaryAdmin, ...CLINIC_STAFF_ROSTER.slice(1)];
    cache.staffRoster = mergedRoster;
    await rt.trackWrite(
      rt.putRecordEncrypted('staffState', 'staff_roster', [], mergedRoster, {}, { skipConcurrencyCheck: true })
    );
  }

  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'workspace_mode', [], nextMode, {}, { skipConcurrencyCheck: true })
  );
  await rt.appendAuditLogAsync({
    actionType: 'settings_updated',
    entityType: 'settings',
    entityId: 'workspace_mode',
    summaryAr: 'تفعيل وضع فريق العمل (Team Mode)',
    summaryEn: 'Configured Multi-Staff Team workspace mode',
  });
  rt.notifyListeners();
  return nextMode;
}

export function switchWorkspaceModeAsyncOps(
  rt: OperationsRuntime,
  mode: ClinicWorkspaceMode
): Promise<WorkspaceModeSettings> {
  return mode === 'solo' ? configureSoloModeAsyncOps(rt) : configureTeamModeAsyncOps(rt);
}

export function getSmartMemoryOps(rt: OperationsRuntime): SmartMemorySettings {
  const sm = rt.getCache().smartMemory;
  return {
    ...sm,
    recentPatientIds: [...sm.recentPatientIds],
    pinnedPatientIds: [...sm.pinnedPatientIds],
    services: [...sm.services],
    sessionTimers: { ...(sm.sessionTimers || {}) },
  };
}

export async function updateSmartMemoryAsyncOps(
  rt: OperationsRuntime,
  partial: Partial<Omit<SmartMemorySettings, 'id' | 'updatedAt' | 'version'>>
): Promise<SmartMemorySettings> {
  const cache = rt.getCache();
  const next: SmartMemorySettings = {
    ...cache.smartMemory,
    ...partial,
    id: 'smart_memory',
    recentPatientIds: (partial.recentPatientIds ?? cache.smartMemory.recentPatientIds).slice(0, 12),
    pinnedPatientIds: partial.pinnedPatientIds ?? cache.smartMemory.pinnedPatientIds,
    services: partial.services ?? cache.smartMemory.services,
    sessionTimers: partial.sessionTimers ?? cache.smartMemory.sessionTimers ?? {},
    updatedAt: new Date().toISOString(),
    version: (cache.smartMemory.version || 0) + 1,
  };
  cache.smartMemory = next;
  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'smart_memory', [], next, {}, { skipConcurrencyCheck: true })
  );
  rt.notifyListeners();
  return next;
}

export function getSessionTimerSecondsOps(rt: OperationsRuntime, sessionId: string): number | null {
  const cleanId = sessionId.trim();
  if (!cleanId) return null;
  const raw = rt.getCache().smartMemory.sessionTimers?.[cleanId];
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
}

export function saveSessionTimerSecondsOps(
  rt: OperationsRuntime,
  sessionId: string,
  seconds: number
): void {
  const cleanId = sessionId.trim();
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const cache = rt.getCache();
  if (!cleanId || safeSeconds <= 0 || !rt.getActiveDek()) return;
  if (cache.smartMemory.sessionTimers?.[cleanId] === safeSeconds) return;

  const nextTimers = upsertBoundedSessionTimer(
    cache.smartMemory.sessionTimers,
    cleanId,
    safeSeconds
  );
  const next: SmartMemorySettings = {
    ...cache.smartMemory,
    id: 'smart_memory',
    sessionTimers: nextTimers,
    updatedAt: new Date().toISOString(),
    version: (cache.smartMemory.version || 0) + 1,
  };
  cache.smartMemory = next;
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'clinicSettings',
      'smart_memory',
      [],
      next,
      {},
      { skipConcurrencyCheck: true, skipBroadcast: true }
    )
  ).catch(() => undefined);
}

export function clearSessionTimerSecondsOps(rt: OperationsRuntime, sessionId: string): void {
  const cleanId = sessionId.trim();
  const cache = rt.getCache();
  if (!cleanId || !cache.smartMemory.sessionTimers?.[cleanId]) return;
  const nextTimers = removeSessionTimerEntry(cache.smartMemory.sessionTimers, cleanId);
  const next: SmartMemorySettings = {
    ...cache.smartMemory,
    id: 'smart_memory',
    sessionTimers: nextTimers,
    updatedAt: new Date().toISOString(),
    version: (cache.smartMemory.version || 0) + 1,
  };
  cache.smartMemory = next;
  if (!rt.getActiveDek()) return;
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'clinicSettings',
      'smart_memory',
      [],
      next,
      {},
      { skipConcurrencyCheck: true, skipBroadcast: true }
    )
  ).catch(() => undefined);
}

export function recordPatientVisitMemoryOps(rt: OperationsRuntime, patientId: string): void {
  if (!patientId || !patientId.trim()) return;
  const prev = rt.getCache().smartMemory.recentPatientIds.filter((id) => id !== patientId);
  const updated = [patientId, ...prev].slice(0, 8);
  void updateSmartMemoryAsyncOps(rt, { recentPatientIds: updated }).catch(() => undefined);
}

export function togglePinnedPatientOps(rt: OperationsRuntime, patientId: string): boolean {
  if (!patientId || !patientId.trim()) return false;
  const pinned = rt.getCache().smartMemory.pinnedPatientIds;
  const exists = pinned.includes(patientId);
  const nextPinned = exists ? pinned.filter((id) => id !== patientId) : [patientId, ...pinned];
  void updateSmartMemoryAsyncOps(rt, { pinnedPatientIds: nextPinned }).catch(() => undefined);
  return !exists;
}

export async function saveClinicServicesAsyncOps(
  rt: OperationsRuntime,
  services: ClinicServiceItem[]
): Promise<ClinicServiceItem[]> {
  const updated = await updateSmartMemoryAsyncOps(rt, { services });
  return updated.services;
}

export function getQuickSoapChipsOps(rt: OperationsRuntime): QuickSoapChip[] {
  return [...rt.getCache().quickSoapPrefs.favoriteChips];
}

export async function saveQuickSoapChipsAsyncOps(
  rt: OperationsRuntime,
  chips: QuickSoapChip[]
): Promise<QuickSoapChip[]> {
  const cache = rt.getCache();
  const next: QuickSoapPreferences = {
    id: 'quick_soap_prefs',
    favoriteChips: chips,
    updatedAt: new Date().toISOString(),
    version: (cache.quickSoapPrefs.version || 0) + 1,
  };
  cache.quickSoapPrefs = next;
  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'quick_soap_prefs', [], next, {}, { skipConcurrencyCheck: true })
  );
  rt.notifyListeners();
  return [...next.favoriteChips];
}

export function getOnboardingStateOps(rt: OperationsRuntime): OnboardingStateSettings {
  const ob = rt.getCache().onboardingState;
  return {
    ...ob,
    dismissedTipIds: [...ob.dismissedTipIds],
  };
}

export async function updateOnboardingStateAsyncOps(
  rt: OperationsRuntime,
  partial: Partial<Omit<OnboardingStateSettings, 'id' | 'updatedAt' | 'version'>>
): Promise<OnboardingStateSettings> {
  const cache = rt.getCache();
  const next: OnboardingStateSettings = {
    ...cache.onboardingState,
    ...partial,
    id: 'onboarding_state',
    updatedAt: new Date().toISOString(),
    version: (cache.onboardingState.version || 0) + 1,
  };
  cache.onboardingState = next;
  await rt.trackWrite(
    rt.putRecordEncrypted('clinicSettings', 'onboarding_state', [], next, {}, { skipConcurrencyCheck: true })
  );
  rt.notifyListeners();
  return next;
}
