// =======================================================================
// PhysioRecord — Vault Hydration & Lazy Cold-Store Loader Operations
// =======================================================================

import type { PhysioRecordDatabase } from '../../db/db';
import type { CustomWidgetDefinition } from '../../types/clinicalWidgets';
import type {
  EncryptedAttachmentEntity,
  EncryptedCashCloseEntity,
  EncryptedConsentEntity,
  EncryptedNoteTemplateEntity,
} from '../../types/clinical';
import type {
  AdminPinAuthRecord,
  AuditLogEntry,
  BackupStateMetadata,
  CashCloseZReportRecord,
  ClinicAppointment,
  ClinicExpenseIQD,
  ClinicProfileData,
  ClinicStaffMember,
  EncryptedAttachmentRecord,
  EpisodeScopedClinicalStore,
  FinancialInvoiceIQD,
  FinancialSequencesData,
  ModuleFlagsSettings,
  MrnRegistryData,
  NoteTemplateSnippet,
  OnboardingStateSettings,
  PatientConsentRecord,
  PatientMedicationPlan,
  PaymentTransactionIQD,
  PinRateLimitState,
  QuickSoapPreferences,
  RecurringPatientSchedule,
  SecurityConfigSettings,
  SmartMemorySettings,
  WaitingListEntry,
  WhatsAppTemplatesConfig,
  WorkspaceModeSettings,
  WriteTelemetryStats,
} from '../../types/clinicManagement';
import { localDate } from '../../utils/date';
import { sanitizeSessionTimersMap } from '../../utils/sessionTimerState';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../utils/whatsappTemplates';
import { validateCustomWidgetDefinition } from '../clinicSecurityHelpers';
import {
  ALL_COLD_STORES,
  DEFAULT_QUICK_SOAP_CHIPS,
  DEFAULT_VITALS_THRESHOLDS,
  cloneDefaultBreaks,
  cloneDefaultLocations,
  cloneDefaultRecurringExpenseTemplates,
  replaceLegacyDirectorNameAr,
  replaceLegacyDirectorNameEn,
  sanitizeDemoPhoneIfNeeded,
  type ColdStoreName,
} from './operationsConstants';
import { createDefaultCache, type OperationsRuntime } from './operationsTypes';

function mergeByIdIntoCacheArray<T extends { id: string }>(
  existing: T[],
  decryptedRows: T[]
): T[] {
  const byId = new Map<string, T>();
  for (const item of decryptedRows) {
    byId.set(item.id, item);
  }
  // Preserve any newly written in-memory entries created before lazy load finished
  for (const item of existing) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

function mergeGroupedById<T extends { id: string }>(
  map: Map<string, T[]>,
  key: string,
  incoming: T[]
): void {
  const merged = mergeByIdIntoCacheArray(map.get(key) || [], incoming);
  map.set(key, merged);
}

export async function hydrateEncryptedCacheOps(
  rt: OperationsRuntime,
  dek: CryptoKey,
  database: PhysioRecordDatabase,
  options?: { lazyHeavyStores?: boolean }
): Promise<void> {
  rt.beginHydration(dek, database);

  const lazyHeavyStores = Boolean(options?.lazyHeavyStores);
  const nextCache = createDefaultCache();
  const nextVersionMap = new Map<string, number>();

  const decryptSafe = <T>(
    tableName: string,
    id: string,
    parentIds: string[],
    entity: {
      iv: Uint8Array;
      ciphertext: Uint8Array;
      recordCryptoVersion?: number;
      dekVersion?: number;
      recordSalt?: Uint8Array;
      version?: number;
    }
  ): Promise<T | null> =>
    rt.decryptStoreEntity<T>(dek, nextVersionMap, tableName, id, parentIds, entity);

  const canUseV8Tables = !database.verno || database.verno >= 8;
  const canUseV9Tables = !database.verno || database.verno >= 9;

  const [
    apptEntities,
    waitEntities,
    invEntities,
    payEntities,
    expEntities,
    auditEntities,
    staffEntities,
    epEntities,
    widgetEntities,
    recEntities,
    skipEntities,
    settingEntities,
    medEntities,
    consentEntities,
    cashCloseEntities,
    attachmentEntities,
    noteTemplateEntities,
    patientCount,
  ] = await Promise.all([
    database.appointments.toArray(),
    database.waitingList.toArray(),
    database.invoices.toArray(),
    database.payments.toArray(),
    database.expenses.toArray(),
    lazyHeavyStores ? Promise.resolve([]) : database.auditLogs.toArray(),
    database.staffState.toArray(),
    lazyHeavyStores ? Promise.resolve([]) : database.episodeClinical.toArray(),
    lazyHeavyStores ? Promise.resolve([]) : database.customWidgets.toArray(),
    database.recurringSchedules.toArray(),
    database.recurringSkippedDates.toArray(),
    database.clinicSettings.toArray(),
    lazyHeavyStores ? Promise.resolve([]) : database.patientMedications.toArray(),
    !lazyHeavyStores && canUseV8Tables && database.consents
      ? database.consents.toArray()
      : Promise.resolve([]),
    canUseV8Tables && database.cashCloses ? database.cashCloses.toArray() : Promise.resolve([]),
    !lazyHeavyStores && canUseV9Tables && database.attachments
      ? database.attachments.toArray()
      : Promise.resolve([]),
    !lazyHeavyStores && canUseV9Tables && database.noteTemplates
      ? database.noteTemplates.toArray()
      : Promise.resolve([]),
    database.patients.count(),
  ]);

  for (const row of apptEntities) {
    const dec = await decryptSafe<ClinicAppointment>('appointments', row.id, [], row);
    if (dec && dec.patientId) {
      const isDemoAppt = Boolean(
        dec.isDemo || dec.id.startsWith('demo_appt_') || dec.patientId.startsWith('syn-patient-')
      );
      nextCache.appointments.push({
        ...dec,
        therapistName: replaceLegacyDirectorNameAr(dec.therapistName) || dec.therapistName,
        patientPhone: sanitizeDemoPhoneIfNeeded(dec.patientPhone, isDemoAppt),
        version: row.version ?? dec.version ?? 1,
      });
    }
  }

  for (const row of waitEntities) {
    const dec = await decryptSafe<WaitingListEntry>('waitingList', row.id, [], row);
    if (dec && dec.patientId) {
      const isDemoWait = Boolean(
        dec.isDemo || dec.id.startsWith('demo_wait_') || dec.patientId.startsWith('syn-patient-')
      );
      nextCache.waitingList.push({
        ...dec,
        preferredTherapist: replaceLegacyDirectorNameAr(dec.preferredTherapist) || dec.preferredTherapist,
        phone: sanitizeDemoPhoneIfNeeded(dec.phone, isDemoWait) || dec.phone,
        version: row.version ?? dec.version ?? 1,
      });
    }
  }

  const paymentsByInvoice = new Map<string, PaymentTransactionIQD[]>();
  for (const pRow of payEntities) {
    const dec = await decryptSafe<PaymentTransactionIQD>(
      'payments',
      pRow.id,
      [pRow.invoiceId],
      pRow
    );
    if (dec) {
      const list = paymentsByInvoice.get(pRow.invoiceId) || [];
      list.push(dec);
      paymentsByInvoice.set(pRow.invoiceId, list);
    }
  }

  for (const row of invEntities) {
    const dec = await decryptSafe<FinancialInvoiceIQD>('invoices', row.id, [], row);
    if (dec && dec.patientId) {
      const mergedPayments = new Map<string, PaymentTransactionIQD>();
      for (const p of dec.payments || []) mergedPayments.set(p.id, p);
      for (const p of paymentsByInvoice.get(dec.id) || []) mergedPayments.set(p.id, p);
      nextCache.invoices.push({
        ...dec,
        payments: Array.from(mergedPayments.values()),
        version: row.version ?? dec.version ?? 1,
      });
    }
  }

  for (const row of expEntities) {
    const dec = await decryptSafe<ClinicExpenseIQD>('expenses', row.id, [], row);
    if (dec) {
      nextCache.expenses.push({ ...dec, version: row.version ?? dec.version ?? 1 });
    }
  }

  const loadedLogs: AuditLogEntry[] = [];
  for (const row of auditEntities) {
    const dec = await decryptSafe<AuditLogEntry>('auditLogs', row.id, [], row);
    if (dec) loadedLogs.push(dec);
  }
  loadedLogs.sort((a, b) => {
    if (typeof a.sequence === 'number' && typeof b.sequence === 'number') {
      return b.sequence - a.sequence;
    }
    return b.timestamp.localeCompare(a.timestamp);
  });
  nextCache.auditLogs = loadedLogs;

  for (const row of staffEntities) {
    if (row.id === 'active_staff') {
      const dec = await decryptSafe<{ activeStaffId?: string }>('staffState', row.id, [], row);
      if (dec?.activeStaffId) nextCache.activeStaffId = dec.activeStaffId;
    } else if (row.id === 'staff_roster') {
      const dec = await decryptSafe<ClinicStaffMember[] | { roster?: ClinicStaffMember[] }>(
        'staffState',
        row.id,
        [],
        row
      );
      const arr = Array.isArray(dec) ? dec : Array.isArray(dec?.roster) ? dec.roster : null;
      if (arr && arr.length > 0) {
        nextCache.staffRoster = arr.map((member) => ({
          ...member,
          nameAr: replaceLegacyDirectorNameAr(member.nameAr) || member.nameAr,
          nameEn: replaceLegacyDirectorNameEn(member.nameEn) || member.nameEn,
        }));
      }
    }
  }

  for (const row of epEntities) {
    const dec = await decryptSafe<EpisodeScopedClinicalStore>(
      'episodeClinical',
      row.id,
      [row.episodeId],
      row
    );
    if (dec && dec.episodeId) {
      nextCache.episodeClinicalByEpisodeId.set(dec.episodeId, dec);
    }
  }

  for (const row of widgetEntities) {
    const dec = await decryptSafe<CustomWidgetDefinition>('customWidgets', row.id, [], row);
    if (dec && dec.id) {
      const validated = validateCustomWidgetDefinition(dec);
      if (validated.ok) nextCache.customWidgets.push(validated.data);
    }
  }

  for (const row of recEntities) {
    const dec = await decryptSafe<RecurringPatientSchedule>(
      'recurringSchedules',
      row.id,
      [],
      row
    );
    if (dec && dec.patientId && Array.isArray(dec.weekdays) && dec.weekdays.length > 0) {
      nextCache.recurringSchedules.push({ ...dec, version: row.version ?? dec.version ?? 1 });
    }
  }

  for (const row of skipEntities) {
    const dec = await decryptSafe<{ scheduleId: string; date: string; updatedAt?: string }>(
      'recurringSkippedDates',
      row.id,
      [],
      row
    );
    if (dec && dec.scheduleId && dec.date) {
      nextCache.recurringSkippedDates.set(row.id, {
        scheduleId: dec.scheduleId,
        date: dec.date,
        updatedAt: dec.updatedAt || row.updatedAt,
        version: row.version ?? 1,
      });
    }
  }

  for (const row of medEntities) {
    const dec = await decryptSafe<PatientMedicationPlan>(
      'patientMedications',
      row.id,
      [row.patientId],
      row
    );
    if (dec && dec.patientId) {
      nextCache.patientMedicationsByPatientId.set(dec.patientId, {
        ...dec,
        version: row.version ?? dec.version ?? 1,
      });
    }
  }

  for (const row of consentEntities as EncryptedConsentEntity[]) {
    const dec = await decryptSafe<PatientConsentRecord>(
      'consents',
      row.id,
      [row.patientId],
      row
    );
    if (dec && dec.patientId) {
      const list = nextCache.consentsByPatientId.get(dec.patientId) || [];
      list.push({ ...dec, version: row.version ?? dec.version ?? 1 });
      nextCache.consentsByPatientId.set(dec.patientId, list);
    }
  }

  for (const row of cashCloseEntities as EncryptedCashCloseEntity[]) {
    const dec = await decryptSafe<CashCloseZReportRecord>('cashCloses', row.id, [], row);
    if (dec && dec.dateKey) {
      nextCache.cashCloses.push({ ...dec, version: row.version ?? dec.version ?? 1 });
    }
  }
  nextCache.cashCloses.sort((a, b) => b.closedAt.localeCompare(a.closedAt));

  for (const row of attachmentEntities as EncryptedAttachmentEntity[]) {
    const dec = await decryptSafe<EncryptedAttachmentRecord>(
      'attachments',
      row.id,
      [row.patientId],
      row
    );
    if (dec && dec.patientId) {
      const list = nextCache.attachmentsByPatientId.get(dec.patientId) || [];
      list.push({ ...dec, version: row.version ?? dec.version ?? 1 });
      nextCache.attachmentsByPatientId.set(dec.patientId, list);
    }
  }

  for (const row of noteTemplateEntities as EncryptedNoteTemplateEntity[]) {
    const dec = await decryptSafe<NoteTemplateSnippet>('noteTemplates', row.id, [], row);
    if (dec && dec.slashTrigger) {
      nextCache.noteTemplates.push({ ...dec, version: row.version ?? dec.version ?? 1 });
    }
  }

  for (const row of settingEntities) {
    const dec = await decryptSafe<Record<string, unknown>>('clinicSettings', row.id, [], row);
    if (!dec) continue;
    if (row.id === 'clinic_profile') {
      const loadedProfile = dec as Partial<ClinicProfileData>;
      nextCache.clinicProfile = {
        ...nextCache.clinicProfile,
        ...loadedProfile,
        therapistNameAr:
          replaceLegacyDirectorNameAr(loadedProfile.therapistNameAr) ||
          loadedProfile.therapistNameAr ||
          nextCache.clinicProfile.therapistNameAr,
        therapistNameEn:
          replaceLegacyDirectorNameEn(loadedProfile.therapistNameEn) ||
          loadedProfile.therapistNameEn ||
          nextCache.clinicProfile.therapistNameEn,
      };
    } else if (row.id === 'admin_auth') {
      nextCache.adminAuth = dec as unknown as AdminPinAuthRecord;
    } else if (row.id === 'pin_rate_limit') {
      nextCache.pinRateLimit = dec as unknown as PinRateLimitState;
    } else if (row.id === 'security_config') {
      nextCache.securityConfig = {
        ...nextCache.securityConfig,
        ...(dec as Partial<SecurityConfigSettings>),
      };
    } else if (row.id === 'module_flags') {
      const flags = dec as Partial<ModuleFlagsSettings> & { receptionPrivacyBlur?: boolean };
      nextCache.moduleFlags = {
        ...nextCache.moduleFlags,
        showHepLibrary: Boolean(flags.showHepLibrary),
        enableCustomWidgetStudio: Boolean(flags.enableCustomWidgetStudio),
        enableSmartGoalsGas: Boolean(flags.enableSmartGoalsGas),
        enableConsentModule: Boolean(flags.enableConsentModule),
        enableAttachmentsModule: Boolean(flags.enableAttachmentsModule),
        enableVoiceDictationModule: Boolean(flags.enableVoiceDictationModule),
        allowCloudSpeechFallbackOptIn: Boolean(flags.allowCloudSpeechFallbackOptIn),
        enableTemplatesModule: Boolean(flags.enableTemplatesModule),
        enableAnalyticsModule: Boolean(flags.enableAnalyticsModule),
        enableKioskModule: Boolean(flags.enableKioskModule),
        enableProblemListGoals:
          typeof flags.enableProblemListGoals === 'boolean' ? flags.enableProblemListGoals : true,
        enableReEvalNudges: Boolean(flags.enableReEvalNudges),
        reEvalAfterSessions:
          typeof flags.reEvalAfterSessions === 'number' && flags.reEvalAfterSessions > 0
            ? flags.reEvalAfterSessions
            : 6,
        reEvalAfterDays:
          typeof flags.reEvalAfterDays === 'number' && flags.reEvalAfterDays > 0
            ? flags.reEvalAfterDays
            : 21,
        enableNoteCompletenessCheck:
          typeof flags.enableNoteCompletenessCheck === 'boolean'
            ? flags.enableNoteCompletenessCheck
            : true,
        enablePerformanceTestLibrary:
          typeof flags.enablePerformanceTestLibrary === 'boolean'
            ? flags.enablePerformanceTestLibrary
            : true,
        modalitySafetyReviewedBy: flags.modalitySafetyReviewedBy,
        modalitySafetyReviewedAt: flags.modalitySafetyReviewedAt,
        enableModalitySafetyCheck: Boolean(
          flags.enableModalitySafetyCheck && flags.modalitySafetyReviewedBy
        ),
        enableVitalsModule:
          typeof flags.enableVitalsModule === 'boolean' ? flags.enableVitalsModule : true,
        vitalsThresholds: flags.vitalsThresholds
          ? { ...DEFAULT_VITALS_THRESHOLDS, ...flags.vitalsThresholds }
          : { ...DEFAULT_VITALS_THRESHOLDS },
        enablePediatricSafeguards:
          typeof flags.enablePediatricSafeguards === 'boolean'
            ? flags.enablePediatricSafeguards
            : true,
        enablePediatricGeometricPainIcons:
          typeof flags.enablePediatricGeometricPainIcons === 'boolean'
            ? flags.enablePediatricGeometricPainIcons
            : true,
        customExamPresets: Array.isArray(flags.customExamPresets) ? flags.customExamPresets : [],
        enableHomeVisits:
          typeof flags.enableHomeVisits === 'boolean' ? flags.enableHomeVisits : true,
        enablePracticeLocations:
          typeof flags.enablePracticeLocations === 'boolean'
            ? flags.enablePracticeLocations
            : true,
        enableClosedDaysBreaks:
          typeof flags.enableClosedDaysBreaks === 'boolean'
            ? flags.enableClosedDaysBreaks
            : true,
        enableHijriDateDisplay:
          typeof flags.enableHijriDateDisplay === 'boolean'
            ? flags.enableHijriDateDisplay
            : false,
        enableInstallmentPlans:
          typeof flags.enableInstallmentPlans === 'boolean'
            ? flags.enableInstallmentPlans
            : true,
        enableRecurringExpenses:
          typeof flags.enableRecurringExpenses === 'boolean'
            ? flags.enableRecurringExpenses
            : true,
        enableReferralsModule:
          typeof flags.enableReferralsModule === 'boolean'
            ? flags.enableReferralsModule
            : true,
        enableRetentionLists:
          typeof flags.enableRetentionLists === 'boolean' ? flags.enableRetentionLists : true,
        retentionInactiveDaysThreshold:
          typeof flags.retentionInactiveDaysThreshold === 'number' &&
          flags.retentionInactiveDaysThreshold > 0
            ? flags.retentionInactiveDaysThreshold
            : 14,
        practiceLocations:
          Array.isArray(flags.practiceLocations) && flags.practiceLocations.length > 0
            ? flags.practiceLocations
            : cloneDefaultLocations(),
        weeklyBreaks: Array.isArray(flags.weeklyBreaks)
          ? flags.weeklyBreaks
          : cloneDefaultBreaks(),
        closedDateRanges: Array.isArray(flags.closedDateRanges) ? flags.closedDateRanges : [],
        recurringExpenseTemplates:
          Array.isArray(flags.recurringExpenseTemplates) &&
          flags.recurringExpenseTemplates.length > 0
            ? flags.recurringExpenseTemplates
            : cloneDefaultRecurringExpenseTemplates(),
        referringDoctors: Array.isArray(flags.referringDoctors) ? flags.referringDoctors : [],
        postDischargeFollowUps: Array.isArray(flags.postDischargeFollowUps)
          ? flags.postDischargeFollowUps
          : [],
        enableImportWizard:
          typeof flags.enableImportWizard === 'boolean' ? flags.enableImportWizard : true,
        enableTrashRecycleBin:
          typeof flags.enableTrashRecycleBin === 'boolean' ? flags.enableTrashRecycleBin : true,
        enableDataHealthScreen:
          typeof flags.enableDataHealthScreen === 'boolean' ? flags.enableDataHealthScreen : true,
        enableBilingualTerminologyGlossary:
          typeof flags.enableBilingualTerminologyGlossary === 'boolean'
            ? flags.enableBilingualTerminologyGlossary
            : true,
        recycleBinItems: Array.isArray(flags.recycleBinItems) ? flags.recycleBinItems : [],
        enableWebShareInterop:
          typeof flags.enableWebShareInterop === 'boolean'
            ? flags.enableWebShareInterop
            : true,
        enableIcsCalendarExport:
          typeof flags.enableIcsCalendarExport === 'boolean'
            ? flags.enableIcsCalendarExport
            : true,
        enableScheduleVisitCardPrint:
          typeof flags.enableScheduleVisitCardPrint === 'boolean'
            ? flags.enableScheduleVisitCardPrint
            : true,
        enablePhotoMeasurementTools:
          typeof flags.enablePhotoMeasurementTools === 'boolean'
            ? flags.enablePhotoMeasurementTools
            : true,
        settingsViewMode:
          flags.settingsViewMode === 'simple' || flags.settingsViewMode === 'advanced'
            ? flags.settingsViewMode
            : 'advanced',
        publicDemoModeEnabled:
          typeof flags.publicDemoModeEnabled === 'boolean'
            ? flags.publicDemoModeEnabled
            : false,
        updatedAt: flags.updatedAt || row.updatedAt,
        version: row.version ?? flags.version ?? 1,
      };
      if (typeof flags.receptionPrivacyBlur === 'boolean') {
        nextCache.receptionPrivacyBlur = flags.receptionPrivacyBlur;
      }
    } else if (row.id === 'mrn_registry') {
      const mrn = dec as Partial<MrnRegistryData>;
      nextCache.mrnRegistry = {
        id: 'mrn_registry',
        issuedMrns: Array.isArray(mrn.issuedMrns) ? mrn.issuedMrns : [],
        ...(mrn.patientMrnMap ? { patientMrnMap: mrn.patientMrnMap } : {}),
        sequence: typeof mrn.sequence === 'number' ? mrn.sequence : 0,
        updatedAt: mrn.updatedAt || row.updatedAt,
        version: row.version ?? mrn.version ?? 1,
      };
    } else if (row.id === 'backup_meta') {
      nextCache.backupMeta = { ...nextCache.backupMeta, ...(dec as Partial<BackupStateMetadata>) };
    } else if (row.id === 'write_telemetry') {
      const wt = dec as Partial<WriteTelemetryStats>;
      const today = localDate();
      nextCache.writeTelemetry = {
        id: 'write_telemetry',
        totalWrites: typeof wt.totalWrites === 'number' ? wt.totalWrites : 0,
        writesToday: wt.dayKey === today && typeof wt.writesToday === 'number' ? wt.writesToday : 0,
        dayKey: today,
        averageDailyWrites:
          typeof wt.averageDailyWrites === 'number' ? wt.averageDailyWrites : 0,
        updatedAt: wt.updatedAt || row.updatedAt,
        version: row.version ?? wt.version ?? 1,
      };
    } else if (row.id === 'workspace_mode') {
      const wm = dec as Partial<WorkspaceModeSettings>;
      nextCache.workspaceMode = {
        id: 'workspace_mode',
        mode: wm.mode === 'team' ? 'team' : 'solo',
        wizardCompleted: Boolean(wm.wizardCompleted),
        updatedAt: wm.updatedAt || row.updatedAt,
        version: row.version ?? wm.version ?? 1,
      };
    } else if (row.id === 'smart_memory') {
      const sm = dec as Partial<SmartMemorySettings>;
      nextCache.smartMemory = {
        id: 'smart_memory',
        lastDurationMinutes:
          typeof sm.lastDurationMinutes === 'number' && sm.lastDurationMinutes > 0
            ? sm.lastDurationMinutes
            : undefined,
        lastRoom: typeof sm.lastRoom === 'string' && sm.lastRoom.trim() ? sm.lastRoom : undefined,
        lastPaymentMethod: sm.lastPaymentMethod,
        recentPatientIds: Array.isArray(sm.recentPatientIds) ? sm.recentPatientIds.slice(0, 12) : [],
        pinnedPatientIds: Array.isArray(sm.pinnedPatientIds) ? sm.pinnedPatientIds : [],
        services: Array.isArray(sm.services) ? sm.services : [],
        sessionTimers: sanitizeSessionTimersMap(sm.sessionTimers),
        updatedAt: sm.updatedAt || row.updatedAt,
        version: row.version ?? sm.version ?? 1,
      };
    } else if (row.id === 'quick_soap_prefs') {
      const qp = dec as Partial<QuickSoapPreferences>;
      nextCache.quickSoapPrefs = {
        id: 'quick_soap_prefs',
        favoriteChips: Array.isArray(qp.favoriteChips) ? qp.favoriteChips : [...DEFAULT_QUICK_SOAP_CHIPS],
        updatedAt: qp.updatedAt || row.updatedAt,
        version: row.version ?? qp.version ?? 1,
      };
    } else if (row.id === 'onboarding_state') {
      const ob = dec as Partial<OnboardingStateSettings>;
      nextCache.onboardingState = {
        id: 'onboarding_state',
        tourCompleted: Boolean(ob.tourCompleted),
        tipsEnabled: typeof ob.tipsEnabled === 'boolean' ? ob.tipsEnabled : true,
        dismissedTipIds: Array.isArray(ob.dismissedTipIds) ? ob.dismissedTipIds : [],
        checklistDismissed: Boolean(ob.checklistDismissed),
        ...(typeof ob.lastSeenChangelogVersion === 'string'
          ? { lastSeenChangelogVersion: ob.lastSeenChangelogVersion }
          : {}),
        updatedAt: ob.updatedAt || row.updatedAt,
        version: row.version ?? ob.version ?? 1,
      };
    } else if (row.id === 'financial_sequences') {
      const fs = dec as Partial<FinancialSequencesData>;
      nextCache.financialSequences = {
        id: 'financial_sequences',
        invoiceSequence: typeof fs.invoiceSequence === 'number' ? fs.invoiceSequence : 0,
        receiptSequence: typeof fs.receiptSequence === 'number' ? fs.receiptSequence : 0,
        creditNoteSequence: typeof fs.creditNoteSequence === 'number' ? fs.creditNoteSequence : 0,
        zReportSequence: typeof fs.zReportSequence === 'number' ? fs.zReportSequence : 0,
        updatedAt: fs.updatedAt || row.updatedAt,
        version: row.version ?? fs.version ?? 1,
      };
    } else if (row.id === 'whatsapp_templates') {
      const wt = dec as Partial<WhatsAppTemplatesConfig>;
      nextCache.whatsappTemplates = {
        id: 'whatsapp_templates',
        appointmentReminder: wt.appointmentReminder?.ar
          ? wt.appointmentReminder
          : { ...DEFAULT_WHATSAPP_TEMPLATES.appointmentReminder },
        hepProgram: wt.hepProgram?.ar ? wt.hepProgram : { ...DEFAULT_WHATSAPP_TEMPLATES.hepProgram },
        paymentReceipt: wt.paymentReceipt?.ar
          ? wt.paymentReceipt
          : { ...DEFAULT_WHATSAPP_TEMPLATES.paymentReceipt },
        updatedAt: wt.updatedAt || row.updatedAt,
        version: row.version ?? wt.version ?? 1,
      };
    }
  }

  // Legacy pre-Phase-2 vaults with existing Admin PIN or clinical data upgrade transparently to Team Mode
  const hasExplicitWorkspaceMode = settingEntities.some((r) => r.id === 'workspace_mode');
  if (!hasExplicitWorkspaceMode) {
    const hasExistingVaultActivity =
      nextCache.adminAuth !== null ||
      patientCount > 0 ||
      nextCache.appointments.length > 0 ||
      nextCache.invoices.length > 0;
    if (hasExistingVaultActivity) {
      nextCache.workspaceMode = {
        ...nextCache.workspaceMode,
        mode: 'team',
        wizardCompleted: true,
      };
    }
  }

  nextCache.hydrated = true;
  rt.setCacheAndVersionMap(nextCache, nextVersionMap);
  if (!lazyHeavyStores) {
    const loadedCold = rt.getLoadedColdStores();
    for (const storeName of ALL_COLD_STORES) {
      loadedCold.add(storeName);
    }
  }
  rt.notifyListeners();
}

export async function ensureColdStoreLoadedOps(
  rt: OperationsRuntime,
  storeName: ColdStoreName
): Promise<void> {
  const activeDek = rt.getActiveDek();
  const loadedColdStores = rt.getLoadedColdStores();
  if (!activeDek || loadedColdStores.has(storeName)) return;
  const coldStoreLoadPromises = rt.getColdStoreLoadPromises();
  const inflight = coldStoreLoadPromises.get(storeName);
  if (inflight) return inflight;

  const dek = activeDek;
  const database = rt.getActiveDb();
  const versionMap = rt.getVersionMap();
  const canUseV8Tables = !database.verno || database.verno >= 8;
  const canUseV9Tables = !database.verno || database.verno >= 9;

  const task = (async () => {
    try {
      const cache = rt.getCache();
      if (storeName === 'auditLogs') {
        const rows = await database.auditLogs.toArray();
        const loaded: AuditLogEntry[] = [];
        for (const row of rows) {
          const dec = await rt.decryptStoreEntity<AuditLogEntry>(
            dek,
            versionMap,
            'auditLogs',
            row.id,
            [],
            row
          );
          if (dec) loaded.push(dec);
        }
        if (rt.getActiveDek() !== dek) return;
        const merged = mergeByIdIntoCacheArray(cache.auditLogs, loaded);
        merged.sort((a, b) => {
          if (typeof a.sequence === 'number' && typeof b.sequence === 'number') {
            return b.sequence - a.sequence;
          }
          return b.timestamp.localeCompare(a.timestamp);
        });
        cache.auditLogs = merged;
      } else if (storeName === 'customWidgets') {
        const rows = await database.customWidgets.toArray();
        const loaded: CustomWidgetDefinition[] = [];
        for (const row of rows) {
          const dec = await rt.decryptStoreEntity<CustomWidgetDefinition>(
            dek,
            versionMap,
            'customWidgets',
            row.id,
            [],
            row
          );
          if (dec && dec.id) {
            const validated = validateCustomWidgetDefinition(dec);
            if (validated.ok) loaded.push(validated.data);
          }
        }
        if (rt.getActiveDek() !== dek) return;
        cache.customWidgets = mergeByIdIntoCacheArray(cache.customWidgets, loaded);
      } else if (storeName === 'noteTemplates') {
        const rows =
          canUseV9Tables && database.noteTemplates ? await database.noteTemplates.toArray() : [];
        const loaded: NoteTemplateSnippet[] = [];
        for (const row of rows as EncryptedNoteTemplateEntity[]) {
          const dec = await rt.decryptStoreEntity<NoteTemplateSnippet>(
            dek,
            versionMap,
            'noteTemplates',
            row.id,
            [],
            row
          );
          if (dec && dec.slashTrigger) {
            loaded.push({ ...dec, version: row.version ?? dec.version ?? 1 });
          }
        }
        if (rt.getActiveDek() !== dek) return;
        cache.noteTemplates = mergeByIdIntoCacheArray(cache.noteTemplates, loaded);
      } else if (storeName === 'attachments') {
        const rows =
          canUseV9Tables && database.attachments ? await database.attachments.toArray() : [];
        const byPatient = new Map<string, EncryptedAttachmentRecord[]>();
        for (const row of rows as EncryptedAttachmentEntity[]) {
          const dec = await rt.decryptStoreEntity<EncryptedAttachmentRecord>(
            dek,
            versionMap,
            'attachments',
            row.id,
            [row.patientId],
            row
          );
          if (dec && dec.patientId) {
            const bucket = byPatient.get(dec.patientId) || [];
            bucket.push({ ...dec, version: row.version ?? dec.version ?? 1 });
            byPatient.set(dec.patientId, bucket);
          }
        }
        if (rt.getActiveDek() !== dek) return;
        for (const [pid, items] of byPatient.entries()) {
          mergeGroupedById(cache.attachmentsByPatientId, pid, items);
        }
      } else if (storeName === 'consents') {
        const rows =
          canUseV8Tables && database.consents ? await database.consents.toArray() : [];
        const byPatient = new Map<string, PatientConsentRecord[]>();
        for (const row of rows as EncryptedConsentEntity[]) {
          const dec = await rt.decryptStoreEntity<PatientConsentRecord>(
            dek,
            versionMap,
            'consents',
            row.id,
            [row.patientId],
            row
          );
          if (dec && dec.patientId) {
            const bucket = byPatient.get(dec.patientId) || [];
            bucket.push({ ...dec, version: row.version ?? dec.version ?? 1 });
            byPatient.set(dec.patientId, bucket);
          }
        }
        if (rt.getActiveDek() !== dek) return;
        for (const [pid, items] of byPatient.entries()) {
          mergeGroupedById(cache.consentsByPatientId, pid, items);
        }
      } else if (storeName === 'episodeClinical') {
        const rows = await database.episodeClinical.toArray();
        const loaded: EpisodeScopedClinicalStore[] = [];
        for (const row of rows) {
          const dec = await rt.decryptStoreEntity<EpisodeScopedClinicalStore>(
            dek,
            versionMap,
            'episodeClinical',
            row.id,
            [row.episodeId],
            row
          );
          if (dec && dec.episodeId) loaded.push(dec);
        }
        if (rt.getActiveDek() !== dek) return;
        const loadedColdEp = rt.getLoadedColdEpisodeIds();
        for (const item of loaded) {
          if (!cache.episodeClinicalByEpisodeId.has(item.episodeId)) {
            cache.episodeClinicalByEpisodeId.set(item.episodeId, item);
          }
          loadedColdEp.add(item.episodeId);
        }
      } else if (storeName === 'patientMedications') {
        const rows = await database.patientMedications.toArray();
        const loaded: PatientMedicationPlan[] = [];
        for (const row of rows) {
          const dec = await rt.decryptStoreEntity<PatientMedicationPlan>(
            dek,
            versionMap,
            'patientMedications',
            row.id,
            [row.patientId],
            row
          );
          if (dec && dec.patientId) {
            loaded.push({ ...dec, version: row.version ?? dec.version ?? 1 });
          }
        }
        if (rt.getActiveDek() !== dek) return;
        for (const item of loaded) {
          if (!cache.patientMedicationsByPatientId.has(item.patientId)) {
            cache.patientMedicationsByPatientId.set(item.patientId, item);
          }
        }
      }

      if (rt.getActiveDek() === dek) {
        loadedColdStores.add(storeName);
        rt.notifyListeners();
      }
    } finally {
      coldStoreLoadPromises.delete(storeName);
    }
  })();

  coldStoreLoadPromises.set(storeName, task);
  return task;
}

export async function ensurePatientColdStoresLoadedOps(
  rt: OperationsRuntime,
  patientId: string,
  episodeIds: string[] | undefined,
  isPatientColdStoresLoaded: (pid: string) => boolean
): Promise<void> {
  const normalizedEpisodeIds = episodeIds ?? [];
  const activeDek = rt.getActiveDek();
  if (!patientId || !activeDek) return;
  const cache = rt.getCache();
  const loadedColdEpisodeIds = rt.getLoadedColdEpisodeIds();
  if (isPatientColdStoresLoaded(patientId)) {
    const missingEp = normalizedEpisodeIds.some(
      (id) => id && !loadedColdEpisodeIds.has(id) && !cache.episodeClinicalByEpisodeId.has(id)
    );
    if (!missingEp) return;
  }

  const coldPatientLoadPromises = rt.getColdPatientLoadPromises();
  const existingPromise = coldPatientLoadPromises.get(patientId);
  if (existingPromise && normalizedEpisodeIds.length === 0) return existingPromise;

  const dek = activeDek;
  const database = rt.getActiveDb();
  const versionMap = rt.getVersionMap();
  const loadedColdStores = rt.getLoadedColdStores();
  const loadedColdPatientIds = rt.getLoadedColdPatientIds();
  const canUseV8Tables = !database.verno || database.verno >= 8;
  const canUseV9Tables = !database.verno || database.verno >= 9;

  const run = async () => {
    if (existingPromise) {
      await existingPromise.catch(() => undefined);
    }
    if (rt.getActiveDek() !== dek) return;

    const [attRows, consentRows, medRows, epByPatientRows, epByIdRows] = await Promise.all([
      !loadedColdStores.has('attachments') && canUseV9Tables && database.attachments
        ? database.attachments.where('patientId').equals(patientId).toArray()
        : Promise.resolve([]),
      !loadedColdStores.has('consents') && canUseV8Tables && database.consents
        ? database.consents.where('patientId').equals(patientId).toArray()
        : Promise.resolve([]),
      !loadedColdStores.has('patientMedications')
        ? database.patientMedications.where('patientId').equals(patientId).toArray()
        : Promise.resolve([]),
      !loadedColdStores.has('episodeClinical')
        ? database.episodeClinical.where('patientId').equals(patientId).toArray()
        : Promise.resolve([]),
      !loadedColdStores.has('episodeClinical') && normalizedEpisodeIds.length > 0
        ? database.episodeClinical.where('episodeId').anyOf(normalizedEpisodeIds).toArray()
        : Promise.resolve([]),
    ]);

    const attachmentsLoaded: EncryptedAttachmentRecord[] = [];
    for (const row of attRows as EncryptedAttachmentEntity[]) {
      const dec = await rt.decryptStoreEntity<EncryptedAttachmentRecord>(
        dek,
        versionMap,
        'attachments',
        row.id,
        [row.patientId],
        row
      );
      if (dec && dec.patientId) {
        attachmentsLoaded.push({ ...dec, version: row.version ?? dec.version ?? 1 });
      }
    }

    const consentsLoaded: PatientConsentRecord[] = [];
    for (const row of consentRows as EncryptedConsentEntity[]) {
      const dec = await rt.decryptStoreEntity<PatientConsentRecord>(
        dek,
        versionMap,
        'consents',
        row.id,
        [row.patientId],
        row
      );
      if (dec && dec.patientId) {
        consentsLoaded.push({ ...dec, version: row.version ?? dec.version ?? 1 });
      }
    }

    let medLoaded: PatientMedicationPlan | null = null;
    for (const row of medRows) {
      const dec = await rt.decryptStoreEntity<PatientMedicationPlan>(
        dek,
        versionMap,
        'patientMedications',
        row.id,
        [row.patientId],
        row
      );
      if (dec && dec.patientId) {
        medLoaded = { ...dec, version: row.version ?? dec.version ?? 1 };
      }
    }

    const combinedEpMap = new Map<string, (typeof epByPatientRows)[number]>();
    for (const row of [...epByPatientRows, ...epByIdRows]) {
      combinedEpMap.set(row.id, row);
    }
    const epLoaded: EpisodeScopedClinicalStore[] = [];
    for (const row of combinedEpMap.values()) {
      const dec = await rt.decryptStoreEntity<EpisodeScopedClinicalStore>(
        dek,
        versionMap,
        'episodeClinical',
        row.id,
        [row.episodeId],
        row
      );
      if (dec && dec.episodeId) epLoaded.push(dec);
    }

    if (rt.getActiveDek() !== dek) return;

    const currentCache = rt.getCache();
    if (attachmentsLoaded.length > 0) {
      mergeGroupedById(currentCache.attachmentsByPatientId, patientId, attachmentsLoaded);
    }
    if (consentsLoaded.length > 0) {
      mergeGroupedById(currentCache.consentsByPatientId, patientId, consentsLoaded);
    }
    if (medLoaded && !currentCache.patientMedicationsByPatientId.has(patientId)) {
      currentCache.patientMedicationsByPatientId.set(patientId, medLoaded);
    }
    for (const epStore of epLoaded) {
      if (!currentCache.episodeClinicalByEpisodeId.has(epStore.episodeId)) {
        currentCache.episodeClinicalByEpisodeId.set(epStore.episodeId, epStore);
      }
      loadedColdEpisodeIds.add(epStore.episodeId);
    }
    for (const epId of normalizedEpisodeIds) {
      if (epId) loadedColdEpisodeIds.add(epId);
    }
    loadedColdPatientIds.add(patientId);
    rt.notifyListeners();
  };

  const wrapped = run().finally(() => {
    if (coldPatientLoadPromises.get(patientId) === wrapped) {
      coldPatientLoadPromises.delete(patientId);
    }
  });
  coldPatientLoadPromises.set(patientId, wrapped);
  return wrapped;
}
