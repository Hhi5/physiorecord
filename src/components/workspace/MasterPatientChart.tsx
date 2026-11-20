// =======================================================================
// PhysioRecord — Master Patient Hub & Episode-Isolated Clinical Chart
// Central Patient Profile Hub + Strictly Isolated Episode of Care Assessments,
// Longitudinal Comparison Matrix, HEP Prescription & Iraqi IQD Financial Summary
// =======================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  History,
  Layers,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { useEpisodes } from '../../context/EpisodeContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { EpisodeService } from '../../services/episodeService';
import { SoapService } from '../../services/soapService';
import type {
  CustomPrecautionItem,
  EpisodeRecord,
  MmtAssessmentBatteryData,
  NeuroScreeningBatteryData,
  PatientClinicalData,
  PatientDocumentAttachment,
  PatientRecord,
  PatientRedFlagChecklistItem,
  RomAssessmentBatteryData,
  SessionRecord,
  SoapNoteRecord,
  StructuredPrecautionId,
} from '../../types/clinical';
import type {
  EpisodeScopedClinicalStore,
  FollowUpIntervalWeeks,
  PostDischargeFollowUpRecord,
  ReferralSourceType,
  ReferringDoctorEntry,
} from '../../types/clinicManagement';
import type {
  FunctionalScaleEntry,
  OrthopedicSpecialTestItem,
} from '../../types/clinicalWidgets';
import { computePatientAge } from '../../utils/date';
import {
  REFERRAL_SOURCE_LABELS,
  computeRetentionActionLists,
  resolveDoctorDisplayName,
  resolvePatientReferralSource,
} from '../../utils/iraqReferralsRetentionC6C7';
import { STRUCTURED_PRECAUTIONS_CATALOG } from '../../utils/modalitySafetyChecker';
import { evaluateReEvalDueStatus } from '../../utils/reEvalNudge';
import type { SessionPainPointInput } from '../organui/OrganClinicalCharts';
import type { PrintableDocumentType } from '../print/PrintDocumentModal';
import { ChartEvaluationTab } from './chart/ChartEvaluationTab';
import {
  ChartHeroAndUtilityStrip,
  type ChartNavigationTab,
  type ChartTabId,
} from './chart/ChartHeaderAndSummaryStrip';
import { ChartHistoryTab } from './chart/ChartHistoryTab';
import { ChartModals } from './chart/ChartModals';
import { ChartOverviewTab } from './chart/ChartOverviewTab';
import { ChartProfileTab } from './chart/ChartProfileTab';
import {
  ChartComparisonTab,
  ChartTreatmentTab,
} from './chart/ChartTreatmentAndComparisonTab';
import { DischargeEpisodeModal } from './DischargeEpisodeModal';

interface MasterPatientChartProps {
  patient: PatientRecord;
  episodes: EpisodeRecord[];
  sessions: SessionRecord[];
  selectedEpisodeId: string | null;
  onSelectEpisode: (epId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onOpenNewSession: () => void;
  onOpenNewEpisode: () => void;
  onBackToDirectory: () => void;
  onPatientUpdated: () => void;
  onStartChartTour?: () => void;
}

type EvalPlanSubView = 'plan' | 'progress';

export const MasterPatientChart: React.FC<MasterPatientChartProps> = ({
  patient,
  episodes,
  sessions,
  selectedEpisodeId,
  onSelectEpisode,
  onOpenSession,
  onOpenNewSession,
  onOpenNewEpisode,
  onBackToDirectory,
  onPatientUpdated,
  onStartChartTour,
}) => {
  const { language, bi } = useLanguage();
  const isRtlLang = language !== 'en';
  const { dek } = useVault();
  const { savePatient } = usePatients();
  const { closeEpisode, setEpisodeStatus } = useEpisodes();

  const [activeTab, setActiveTab] = useState<ChartTabId>('overview');
  const [evalSubView, setEvalSubView] = useState<EvalPlanSubView>('plan');
  const [isContextCollapsed, setIsContextCollapsed] = useState(false);

  const [sessionPainPoints, setSessionPainPoints] = useState<SessionPainPointInput[]>([]);
  const [episodeSoaps, setEpisodeSoaps] = useState<SoapNoteRecord[]>([]);
  const [allPatientSoaps, setAllPatientSoaps] = useState<SoapNoteRecord[]>([]);
  const [activePrintDoc, setActivePrintDoc] = useState<PrintableDocumentType | null>(null);
  const [isCustomStudioOpen, setIsCustomStudioOpen] = useState(false);
  const [isExamShelfModalOpen, setIsExamShelfModalOpen] = useState(false);
  const [isDischargeModalOpen, setIsDischargeModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const [isEditPersonalInfoOpen, setIsEditPersonalInfoOpen] = useState(false);
  const [isEditClinicalSummaryOpen, setIsEditClinicalSummaryOpen] = useState(false);
  const [isMmtModalOpen, setIsMmtModalOpen] = useState(false);
  const [isRomModalOpen, setIsRomModalOpen] = useState(false);
  const [isNeuroModalOpen, setIsNeuroModalOpen] = useState(false);
  const [isSpecialTestsModalOpen, setIsSpecialTestsModalOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(() => ClinicOperationsService.isPatientPinned(patient.id));

  // Track user-initiated new episode creation so creating a fresh episode opens Overview cleanly
  const pendingNewEpisodeEvalRef = useRef(false);
  const handleTriggerNewEpisode = () => {
    pendingNewEpisodeEvalRef.current = true;
    onOpenNewEpisode();
  };

  useEffect(() => {
    if (pendingNewEpisodeEvalRef.current && episodes.length > 0) {
      pendingNewEpisodeEvalRef.current = false;
      setActiveTab('evaluation');
      setEvalSubView('plan');
    }
  }, [episodes.length, selectedEpisodeId]);

  const handleSelectTab = (tab: ChartTabId) => {
    if (tab === 'comparison') {
      setActiveTab('evaluation');
      setEvalSubView('progress');
      return;
    }
    if (tab === 'treatment' || tab === 'hep') {
      setActiveTab('evaluation');
      setEvalSubView('plan');
      return;
    }
    if (tab === 'sessions') {
      setActiveTab('overview');
      return;
    }
    setActiveTab(tab);
  };

  // Allow interactive Patient Chart spotlight tour to switch tabs cleanly as user steps through
  useEffect(() => {
    const handleChartTourTabSwitch = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: ChartTabId }>).detail;
      const requestedTab = detail?.tab;
      if (
        requestedTab === 'overview' ||
        requestedTab === 'evaluation' ||
        requestedTab === 'history' ||
        requestedTab === 'profile'
      ) {
        setActiveTab(requestedTab);
        if (requestedTab === 'evaluation') {
          setEvalSubView('plan');
        }
      }
    };
    window.addEventListener('physiorecord-chart-select-tab', handleChartTourTabSwitch);
    return () => {
      window.removeEventListener('physiorecord-chart-select-tab', handleChartTourTabSwitch);
    };
  }, []);

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          const updatedClinicalData: PatientClinicalData = {
            ...patient.data,
            avatarUrl: compressed,
            photoDataUrl: compressed,
          };
          void savePatient(updatedClinicalData, patient.id).then(() => {
            patient.data.avatarUrl = compressed;
            patient.data.photoDataUrl = compressed;
            onPatientUpdated?.();
          });
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  useEffect(() => {
    setIsPinned(ClinicOperationsService.isPatientPinned(patient.id));
  }, [patient.id]);

  // Personal Info Form State
  const [editFullName, setEditFullName] = useState(patient.data.fullName || '');
  const [editPhone, setEditPhone] = useState(patient.data.phone || '');
  const [editDob, setEditDob] = useState(patient.data.dateOfBirth || '');
  const [editGender, setEditGender] = useState<'male' | 'female' | 'other'>(patient.data.gender || 'male');
  const [editAddress, setEditAddress] = useState(patient.data.address || '');
  const [editEmergencyName, setEditEmergencyName] = useState(patient.data.emergencyContactName || '');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState(patient.data.emergencyContactPhone || '');
  const [editReferralSourceType, setEditReferralSourceType] = useState<ReferralSourceType | ''>(
    patient.data.referralSourceType || ''
  );
  const [editReferringDoctorId, setEditReferringDoctorId] = useState(patient.data.referringDoctorId || '');
  const [editReferralNotes, setEditReferralNotes] = useState(patient.data.referralNotes || '');
  const [editReferringPhysician, setEditReferringPhysician] = useState(patient.data.referringPhysician || '');
  const [editReferringClinic, setEditReferringClinic] = useState(patient.data.referringClinic || '');

  useEffect(() => {
    setEditFullName(patient.data.fullName || '');
    setEditPhone(patient.data.phone || '');
    setEditDob(patient.data.dateOfBirth || '');
    setEditGender(patient.data.gender || 'male');
    setEditAddress(patient.data.address || '');
    setEditEmergencyName(patient.data.emergencyContactName || '');
    setEditEmergencyPhone(patient.data.emergencyContactPhone || '');
    setEditReferralSourceType(patient.data.referralSourceType || '');
    setEditReferringDoctorId(patient.data.referringDoctorId || '');
    setEditReferralNotes(patient.data.referralNotes || '');
    setEditReferringPhysician(patient.data.referringPhysician || '');
    setEditReferringClinic(patient.data.referringClinic || '');
  }, [patient]);

  // Clinical Summary Form State
  const [editEpisodeTitle, setEditEpisodeTitle] = useState('');
  const [editDiagnosis, setEditDiagnosis] = useState('');
  const [editChiefComplaint, setEditChiefComplaint] = useState('');
  const [editGoals, setEditGoals] = useState('');
  const [editClinicalImpression, setEditClinicalImpression] = useState('');

  const patientAge = computePatientAge(patient.data.dateOfBirth, patient.data.age);
  const genderLabel =
    patient.data.gender === 'male'
      ? bi('ذكر', 'Male', 'نێر')
      : patient.data.gender === 'female'
      ? bi('أنثى', 'Female', 'مێ')
      : bi('غير محدد', 'Unspecified', 'دیاری نەکراو');

  const activeEpisode =
    episodes.find((e) => e.id === selectedEpisodeId) || episodes[0] || null;
  const effectiveEpisodeId = activeEpisode ? activeEpisode.id : `default_ep_${patient.id}`;

  const episodeSessions = useMemo(
    () => (activeEpisode ? sessions.filter((s) => s.episodeId === activeEpisode.id) : sessions),
    [activeEpisode, sessions]
  );

  const episodeSessionKey = useMemo(
    () => episodeSessions.map((s) => `${s.id}:${s.updatedAt || ''}`).join('|'),
    [episodeSessions]
  );

  // --- Central Patient Profile State (Patient-Level) ---
  const d = patient.data;
  const [referringPhysician, setReferringPhysician] = useState(d.referringPhysician || '');
  const [referringClinic, setReferringClinic] = useState(d.referringClinic || '');
  const [referralSourceType, setReferralSourceType] = useState<ReferralSourceType | ''>(
    d.referralSourceType || ''
  );
  const [referringDoctorId, setReferringDoctorId] = useState(d.referringDoctorId || '');
  const [referralNotes, setReferralNotes] = useState(d.referralNotes || '');
  const [emergencyContactName, setEmergencyContactName] = useState(d.emergencyContactName || '');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState(
    d.emergencyContactRelation || ''
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    d.emergencyContactPhone || ''
  );
  const [medicalHistory, setMedicalHistory] = useState(d.medicalHistory || '');
  const [previousSurgeries, setPreviousSurgeries] = useState(d.previousSurgeries || '');
  const [currentMedications, setCurrentMedications] = useState(d.currentMedications || '');
  const [allergies, setAllergies] = useState(d.allergies || '');
  const [precautions, setPrecautions] = useState(d.precautions || '');
  const [structuredPrecautions, setStructuredPrecautions] = useState<StructuredPrecautionId[]>(
    d.structuredPrecautions || []
  );
  const [customPrecautions, setCustomPrecautions] = useState<CustomPrecautionItem[]>(
    d.customPrecautions || []
  );
  const [dismissedPrecautionIds, setDismissedPrecautionIds] = useState<string[]>(
    d.dismissedPrecautionIds || []
  );
  const [dismissedRedFlagIds, setDismissedRedFlagIds] = useState<string[]>(
    d.dismissedRedFlagIds || []
  );
  const [contraindications, setContraindications] = useState(d.contraindications || '');
  const [redFlags, setRedFlags] = useState(d.redFlags || '');
  const [redFlagChecklist, setRedFlagChecklist] = useState<PatientRedFlagChecklistItem[]>(
    d.redFlagChecklist || []
  );
  const [generalNotes, setGeneralNotes] = useState(d.generalNotes || '');
  const [attachments, setAttachments] = useState<PatientDocumentAttachment[]>(
    d.attachments || []
  );

  // --- Phase B Module Flags ---
  const [showExerciseLibrary, setShowExerciseLibrary] = useState<boolean>(() =>
    ClinicOperationsService.isExerciseLibraryVisible()
  );
  const [enableProblemListGoals, setEnableProblemListGoals] = useState<boolean>(() =>
    ClinicOperationsService.isProblemListGoalsEnabled()
  );
  const [enableReEvalNudges, setEnableReEvalNudges] = useState<boolean>(() =>
    ClinicOperationsService.isReEvalNudgesEnabled()
  );
  const [reEvalConfig, setReEvalConfig] = useState(() =>
    ClinicOperationsService.getReEvalNudgeConfig()
  );
  const [enableVitalsModule, setEnableVitalsModule] = useState<boolean>(() =>
    ClinicOperationsService.isVitalsModuleEnabled()
  );
  const [enableReferralsModule, setEnableReferralsModule] = useState<boolean>(() =>
    ClinicOperationsService.isReferralsModuleEnabled()
  );
  const [enableRetentionLists, setEnableRetentionLists] = useState<boolean>(() =>
    ClinicOperationsService.isRetentionListsEnabled()
  );
  const [enableScheduleVisitCardPrint, setEnableScheduleVisitCardPrint] = useState<boolean>(() =>
    ClinicOperationsService.isScheduleVisitCardPrintEnabled()
  );
  const [referringDoctors, setReferringDoctors] = useState<ReferringDoctorEntry[]>(() =>
    ClinicOperationsService.getReferringDoctors()
  );
  const [postDischargeFollowUps, setPostDischargeFollowUps] = useState<
    PostDischargeFollowUpRecord[]
  >(() => ClinicOperationsService.getPostDischargeFollowUps());
  const [isReportBackModalOpen, setIsReportBackModalOpen] = useState(false);
  const [activeFollowUpTarget, setActiveFollowUpTarget] = useState<{
    episodeId: string;
    episodeTitle: string;
    intervalWeeks: FollowUpIntervalWeeks;
    dischargeDate: string;
    dueDate: string;
  } | null>(null);
  const [followUpNprs, setFollowUpNprs] = useState<string>('');
  const [followUpPsfs, setFollowUpPsfs] = useState<string>('');
  const [followUpNotes, setFollowUpNotes] = useState<string>('');
  const [followUpFeedback, setFollowUpFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    const syncModules = () => {
      setShowExerciseLibrary(ClinicOperationsService.isExerciseLibraryVisible());
      setEnableProblemListGoals(ClinicOperationsService.isProblemListGoalsEnabled());
      setEnableReEvalNudges(ClinicOperationsService.isReEvalNudgesEnabled());
      setReEvalConfig(ClinicOperationsService.getReEvalNudgeConfig());
      setEnableVitalsModule(ClinicOperationsService.isVitalsModuleEnabled());
      setEnableReferralsModule(ClinicOperationsService.isReferralsModuleEnabled());
      setEnableRetentionLists(ClinicOperationsService.isRetentionListsEnabled());
      setEnableScheduleVisitCardPrint(ClinicOperationsService.isScheduleVisitCardPrintEnabled());
      setReferringDoctors(ClinicOperationsService.getReferringDoctors());
      setPostDischargeFollowUps(ClinicOperationsService.getPostDischargeFollowUps());
    };
    const unsubOps = ClinicOperationsService.subscribe(syncModules);
    window.addEventListener('physiorecord-modules-updated', syncModules);
    return () => {
      unsubOps();
      window.removeEventListener('physiorecord-modules-updated', syncModules);
    };
  }, []);

  // --- Strictly Episode-Isolated Clinical Assessment State ---
  const [episodeStore, setEpisodeStore] = useState<EpisodeScopedClinicalStore>(() =>
    ClinicOperationsService.getEpisodeClinicalStore(effectiveEpisodeId, patient.id)
  );

  // Sync Patient-Level Profile when patient changes or transitions from summary-only to full record
  const syncedSummaryRef = React.useRef<{ id: string; wasSummary: boolean }>({
    id: '',
    wasSummary: true,
  });
  useEffect(() => {
    const prev = syncedSummaryRef.current;
    const switchedPatient = prev.id !== patient.id;
    const upgradedFromSummary = prev.id === patient.id && prev.wasSummary && !patient.isSummaryOnly;
    syncedSummaryRef.current = { id: patient.id, wasSummary: Boolean(patient.isSummaryOnly) };

    if (!switchedPatient && !upgradedFromSummary) return;

    setReferringPhysician(patient.data.referringPhysician || '');
    setReferringClinic(patient.data.referringClinic || '');
    setReferralSourceType(patient.data.referralSourceType || '');
    setReferringDoctorId(patient.data.referringDoctorId || '');
    setReferralNotes(patient.data.referralNotes || '');
    setReferringDoctors(ClinicOperationsService.getReferringDoctors());
    setPostDischargeFollowUps(ClinicOperationsService.getPostDischargeFollowUps());
    if (switchedPatient) {
      setIsReportBackModalOpen(false);
      setActiveFollowUpTarget(null);
      setFollowUpNprs('');
      setFollowUpPsfs('');
      setFollowUpNotes('');
      setFollowUpFeedback(null);
    }
    setEmergencyContactName(patient.data.emergencyContactName || '');
    setEmergencyContactRelation(patient.data.emergencyContactRelation || '');
    setEmergencyContactPhone(patient.data.emergencyContactPhone || '');
    setMedicalHistory(patient.data.medicalHistory || '');
    setPreviousSurgeries(patient.data.previousSurgeries || '');
    setCurrentMedications(patient.data.currentMedications || '');
    setAllergies(patient.data.allergies || '');
    setPrecautions(patient.data.precautions || '');
    setStructuredPrecautions(patient.data.structuredPrecautions || []);
    setCustomPrecautions(patient.data.customPrecautions || []);
    setDismissedPrecautionIds(patient.data.dismissedPrecautionIds || []);
    setDismissedRedFlagIds(patient.data.dismissedRedFlagIds || []);
    setContraindications(patient.data.contraindications || '');
    setRedFlags(patient.data.redFlags || '');
    setRedFlagChecklist(patient.data.redFlagChecklist || []);
    setGeneralNotes(patient.data.generalNotes || '');
    setAttachments(patient.data.attachments || []);
  }, [patient.id, patient.isSummaryOnly, patient.data]);

  // Sync Episode-Scoped Store whenever selectedEpisodeId or patient.id changes
  useEffect(() => {
    let active = true;
    const loaded = ClinicOperationsService.getEpisodeClinicalStore(
      effectiveEpisodeId,
      patient.id
    );
    setEpisodeStore(loaded);
    void ClinicOperationsService.ensurePatientColdStoresLoadedAsync(
      patient.id,
      effectiveEpisodeId ? [effectiveEpisodeId] : []
    ).then(() => {
      if (!active) return;
      setEpisodeStore(
        ClinicOperationsService.getEpisodeClinicalStore(effectiveEpisodeId, patient.id)
      );
    });
    return () => {
      active = false;
    };
  }, [effectiveEpisodeId, patient.id]);

  // Load real recorded NPRS session pain trajectory for longitudinal charts (Zero Mock)
  useEffect(() => {
    if (!dek || episodeSessions.length === 0) {
      setSessionPainPoints((prev) => (prev.length === 0 ? prev : []));
      setEpisodeSoaps((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    let cancelled = false;
    void (async () => {
      const points: SessionPainPointInput[] = [];
      const loadedSoaps: SoapNoteRecord[] = [];
      for (const sess of episodeSessions) {
        try {
          const soap = await SoapService.getSoapNoteBySession(sess.id, dek);
          if (soap) {
            loadedSoaps.push(soap);
          }
          const score = soap?.data.subjective?.painNrsScore;
          if (typeof score === 'number' && Number.isFinite(score)) {
            points.push({
              sessionId: sess.id,
              sessionNumber: sess.sessionNumber,
              date: sess.sessionDate,
              pain: score,
            });
          }
        } catch {
          // Skip unreadable draft safely
        }
      }
      if (!cancelled) {
        setSessionPainPoints(points);
        setEpisodeSoaps(loadedSoaps);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dek, effectiveEpisodeId, episodeSessionKey]);

  const updateEpisodeField = <K extends keyof EpisodeScopedClinicalStore>(
    field: K,
    val: EpisodeScopedClinicalStore[K]
  ) => {
    setEpisodeStore((prev) => ({
      ...prev,
      [field]: val,
    }));
    setIsDirty(true);
  };

  // Debounced Autosave for Episode Clinical Store
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      ClinicOperationsService.saveEpisodeClinicalStore(episodeStore);
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setLastSavedAt(`${hh}:${mm}`);
      setIsDirty(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [episodeStore, isDirty]);

  const buildMasterClinicalData = (
    overrideAttachments?: PatientDocumentAttachment[],
    overrides?: Partial<PatientClinicalData>
  ): PatientClinicalData => ({
    ...patient.data,
    referringPhysician,
    referringClinic,
    referralSourceType: referralSourceType || undefined,
    referringDoctorId: referringDoctorId || undefined,
    referralNotes: referralNotes.trim() || undefined,
    emergencyContactName,
    emergencyContactRelation,
    emergencyContactPhone,
    medicalHistory,
    previousSurgeries,
    currentMedications,
    allergies,
    precautions,
    structuredPrecautions,
    customPrecautions,
    dismissedPrecautionIds,
    dismissedRedFlagIds,
    contraindications,
    redFlags,
    redFlagChecklist,
    generalNotes,
    attachments: overrideAttachments ?? attachments,
    ...overrides,
    profileSummaryUpdatedAt: new Date().toISOString(),
  });

  const reEvalStatus = useMemo(() => {
    const validSessions = episodeSessions.filter((s) => s.data.status !== 'cancelled');
    const snaps = episodeStore.snapshots || [];
    const latestSnap = snaps.length > 0 ? snaps[snaps.length - 1] : undefined;
    const lastEvalDateStr = (
      latestSnap?.recordedDate ||
      activeEpisode?.data.startDate ||
      activeEpisode?.createdAt ||
      ''
    ).slice(0, 10);
    const sessionsSinceLastEval = latestSnap
      ? validSessions.filter(
          (s) => (s.data.sessionDate || s.createdAt.slice(0, 10)) > latestSnap.recordedDate.slice(0, 10)
        ).length
      : validSessions.length;
    return evaluateReEvalDueStatus({
      enabled: enableReEvalNudges,
      sessionsSinceLastEval,
      lastEvalDateStr,
      thresholdSessions: reEvalConfig.afterSessions,
      thresholdDays: reEvalConfig.afterDays,
    });
  }, [
    episodeSessions,
    episodeStore.snapshots,
    activeEpisode,
    enableReEvalNudges,
    reEvalConfig.afterSessions,
    reEvalConfig.afterDays,
  ]);

  useEffect(() => {
    setEditEpisodeTitle(activeEpisode?.data.title || '');
    setEditDiagnosis(activeEpisode?.data.medicalDiagnosis || '');
    setEditChiefComplaint(episodeStore.chiefComplaint || '');
    setEditGoals(episodeStore.patientPersonalGoals || '');
    setEditClinicalImpression(episodeStore.clinicalImpression || '');
  }, [
    activeEpisode,
    episodeStore.chiefComplaint,
    episodeStore.patientPersonalGoals,
    episodeStore.clinicalImpression,
  ]);

  const openEditPersonalInfoModal = () => {
    setEditFullName(patient.data.fullName || '');
    setEditPhone(patient.data.phone || '');
    setEditDob(patient.data.dateOfBirth || '');
    setEditGender(patient.data.gender || 'male');
    setEditAddress(patient.data.address || '');
    setEditEmergencyName(emergencyContactName || patient.data.emergencyContactName || '');
    setEditEmergencyPhone(emergencyContactPhone || patient.data.emergencyContactPhone || '');
    setEditReferralSourceType(referralSourceType || patient.data.referralSourceType || '');
    setEditReferringDoctorId(referringDoctorId || patient.data.referringDoctorId || '');
    setEditReferralNotes(referralNotes || patient.data.referralNotes || '');
    setEditReferringPhysician(referringPhysician || patient.data.referringPhysician || '');
    setEditReferringClinic(referringClinic || patient.data.referringClinic || '');
    setIsEditPersonalInfoOpen(true);
  };

  const handleSavePersonalInfo = async () => {
    if (!dek) return;
    setIsSaving(true);
    try {
      const nextEmergencyName = editEmergencyName.trim();
      const nextEmergencyPhone = editEmergencyPhone.trim();
      const nextRefPhysician = editReferringPhysician.trim();
      const nextRefClinic = editReferringClinic.trim();
      const nextRefSource = editReferralSourceType;
      const nextRefDocId = editReferringDoctorId;
      const nextRefNotes = editReferralNotes.trim();

      const updatedClinicalData: PatientClinicalData = {
        ...buildMasterClinicalData(),
        fullName: editFullName.trim() || patient.data.fullName || 'مريض',
        phone: editPhone.trim() || undefined,
        dateOfBirth: editDob || undefined,
        gender: editGender,
        address: editAddress.trim() || undefined,
        emergencyContactName: nextEmergencyName || undefined,
        emergencyContactPhone: nextEmergencyPhone || undefined,
        referringPhysician: nextRefPhysician || undefined,
        referringClinic: nextRefClinic || undefined,
        referralSourceType: nextRefSource || undefined,
        referringDoctorId: nextRefDocId || undefined,
        referralNotes: nextRefNotes || undefined,
      };
      await savePatient(updatedClinicalData, patient.id);
      setEmergencyContactName(nextEmergencyName);
      setEmergencyContactPhone(nextEmergencyPhone);
      setReferringPhysician(nextRefPhysician);
      setReferringClinic(nextRefClinic);
      setReferralSourceType(nextRefSource);
      setReferringDoctorId(nextRefDocId);
      setReferralNotes(nextRefNotes);
      setIsEditPersonalInfoOpen(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      onPatientUpdated();
    } catch (err) {
      console.error('Failed to save personal info:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveClinicalSummary = async () => {
    if (!dek) return;
    setIsSaving(true);
    try {
      if (activeEpisode) {
        await EpisodeService.updateEpisode(
          activeEpisode.id,
          {
            ...activeEpisode.data,
            title: editEpisodeTitle.trim() || activeEpisode.data.title,
            medicalDiagnosis: editDiagnosis.trim() || activeEpisode.data.medicalDiagnosis,
          },
          dek
        );
      }
      setEpisodeStore((prev) => ({
        ...prev,
        chiefComplaint: editChiefComplaint.trim(),
        patientPersonalGoals: editGoals.trim(),
        clinicalImpression: editClinicalImpression.trim(),
      }));
      setIsDirty(true);
      setIsEditClinicalSummaryOpen(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      onPatientUpdated();
    } catch (err) {
      console.error('Failed to save clinical summary:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const updateObjectiveRom = (rom: RomAssessmentBatteryData) => {
    setEpisodeStore((prev) => ({
      ...prev,
      objective: { ...prev.objective, romBattery: rom },
    }));
    setIsDirty(true);
  };

  const updateObjectiveMmt = (mmt: MmtAssessmentBatteryData) => {
    setEpisodeStore((prev) => ({
      ...prev,
      objective: { ...prev.objective, mmtBattery: mmt },
    }));
    setIsDirty(true);
  };

  const updateObjectiveNeuro = (neuro: NeuroScreeningBatteryData) => {
    setEpisodeStore((prev) => ({
      ...prev,
      objective: { ...prev.objective, neuroScreening: neuro },
    }));
    setIsDirty(true);
  };

  const updateSpecialTests = (specialTests: OrthopedicSpecialTestItem[]) => {
    setEpisodeStore((prev) => ({ ...prev, specialTests }));
    setIsDirty(true);
  };

  const updateFunctionalScales = (functionalScales: FunctionalScaleEntry) => {
    setEpisodeStore((prev) => ({ ...prev, functionalScales }));
    setIsDirty(true);
  };

  // --- 4 Clean Tabs (3 Pure Clinical + 1 Non-Clinical & Financial) ---
  const navigationTabs: ChartNavigationTab[] = [
    {
      id: 'overview',
      label: bi('المتابعة', 'Follow-up & Sessions', 'بەدواداچوون'),
      icon: Clock,
      count: episodeSessions.length,
    },
    {
      id: 'evaluation',
      label: bi('الخطة والتقدم', 'Plan & Progress', 'پلان و پێشکەوتن'),
      icon: Layers,
    },
    {
      id: 'history',
      label: bi('السجل المرضي', 'History', 'مێژوو'),
      icon: History,
    },
    {
      id: 'profile',
      label: bi('الملف والمالية', 'Financial & Docs', 'دارایی و دۆکیومێنت'),
      icon: Wallet,
    },
  ];

  // Inline Clinical Safety Alerts (Red for Red Flags/Contraindications, Orange for Precautions)
  const redAlerts = useMemo(() => {
    const list: string[] = [];
    if (redFlags.trim()) list.push(redFlags.trim());
    if (contraindications.trim()) list.push(contraindications.trim());
    for (const item of redFlagChecklist) {
      if (item.status === 'present') {
        list.push(bi(item.labelAr, item.labelEn));
      }
    }
    return list;
  }, [redFlags, contraindications, redFlagChecklist, bi]);

  const cautionAlerts = useMemo(() => {
    const list: string[] = [];
    if (precautions.trim()) list.push(precautions.trim());
    for (const id of structuredPrecautions) {
      const cat = STRUCTURED_PRECAUTIONS_CATALOG.find((item) => item.id === id);
      if (cat) {
        list.push(bi(cat.labelAr, cat.labelEn, cat.labelCkb));
      } else {
        const cust = customPrecautions.find((item) => item.id === id);
        if (cust) list.push(bi(cust.labelAr, cust.labelEn || cust.labelAr));
      }
    }
    return list;
  }, [precautions, structuredPrecautions, customPrecautions, bi]);

  const handleSaveMasterAndEpisode = async (
    overrides?: Partial<PatientClinicalData>
  ) => {
    if (!dek) return;
    setIsSaving(true);
    try {
      const updatedClinicalData = buildMasterClinicalData(undefined, overrides);
      await savePatient(updatedClinicalData, patient.id);
      ClinicOperationsService.saveEpisodeClinicalStore(episodeStore);
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setLastSavedAt(`${hh}:${mm}`);
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onPatientUpdated();
    } catch (err) {
      console.error('Failed to save patient & episode chart:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePersistAttachments = async (nextAttachments: PatientDocumentAttachment[]) => {
    setAttachments(nextAttachments);
    if (!dek) return;
    const updatedClinicalData = buildMasterClinicalData(nextAttachments);
    await savePatient(updatedClinicalData, patient.id);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setLastSavedAt(`${hh}:${mm}`);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
    onPatientUpdated();
  };

  const handleAddWidget = (widgetId: string) => {
    if (!episodeStore.activeWidgetIds.includes(widgetId)) {
      updateEpisodeField('activeWidgetIds', [...episodeStore.activeWidgetIds, widgetId]);
    }
    setActiveTab('evaluation');
    setEvalSubView('plan');
  };

  const latestDraftSessionForExam = useMemo(() => {
    const drafts = episodeSessions.filter((s) => {
      const status = s.status ?? s.data?.status ?? 'draft';
      return status !== 'finalized' && status !== 'cancelled';
    });
    if (drafts.length === 0) return null;
    return [...drafts].sort((a, b) => {
      const numA = a.sessionNumber ?? a.data?.sessionNumber ?? 0;
      const numB = b.sessionNumber ?? b.data?.sessionNumber ?? 0;
      if (numB !== numA) return numB - numA;
      const dateA = a.sessionDate ?? a.data?.sessionDate ?? '';
      const dateB = b.sessionDate ?? b.data?.sessionDate ?? '';
      return dateB.localeCompare(dateA);
    })[0];
  }, [episodeSessions]);

  const handleOpenSessionForExam = () => {
    if (latestDraftSessionForExam) {
      onOpenSession(latestDraftSessionForExam.id);
    } else {
      onOpenNewSession();
    }
  };

  const financialSummary = ClinicOperationsService.getPatientFinancialSummaryIQD(
    patient.id,
    patient.data.fullName
  );

  // C6: Referring Doctor & Referral Attribution Resolution
  const resolvedDoctor = useMemo(
    () =>
      referringDoctorId
        ? referringDoctors.find((doc) => doc.id === referringDoctorId) || null
        : null,
    [referringDoctorId, referringDoctors]
  );

  const patientWithReferralEdits = useMemo<PatientRecord>(
    () => ({
      ...patient,
      data: {
        ...patient.data,
        referringPhysician,
        referringClinic,
        referralSourceType: referralSourceType || undefined,
        referringDoctorId: referringDoctorId || undefined,
        referralNotes: referralNotes.trim() || undefined,
      },
    }),
    [patient, referringPhysician, referringClinic, referralSourceType, referringDoctorId, referralNotes]
  );

  const resolvedReferralSource = useMemo(
    () => resolvePatientReferralSource(patientWithReferralEdits.data),
    [patientWithReferralEdits.data]
  );

  const hasReferralAttribution = Boolean(
    resolvedReferralSource ||
      resolvedDoctor ||
      referringPhysician.trim() ||
      referringClinic.trim() ||
      referralNotes.trim()
  );

  const referralPillText = useMemo(() => {
    const sourceLabel = resolvedReferralSource
      ? bi(
          REFERRAL_SOURCE_LABELS[resolvedReferralSource].ar,
          REFERRAL_SOURCE_LABELS[resolvedReferralSource].en
        )
      : '';
    const detail = resolvedDoctor
      ? resolveDoctorDisplayName(resolvedDoctor, isRtlLang)
      : referringPhysician.trim() || referringClinic.trim();
    if (sourceLabel && detail && detail !== sourceLabel) {
      return `${sourceLabel}: ${detail}`;
    }
    return detail || sourceLabel || referralNotes.trim();
  }, [resolvedReferralSource, resolvedDoctor, referringPhysician, referringClinic, referralNotes, bi, isRtlLang]);

  // C7: Post-Discharge 4w/12w Follow-Ups for this Patient
  const patientFollowUps = useMemo(
    () =>
      postDischargeFollowUps
        .filter((item) => item.patientId === patient.id)
        .sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || '')),
    [postDischargeFollowUps, patient.id]
  );

  const duePostDischargeItems = useMemo(() => {
    if (!enableRetentionLists) return [];
    return computeRetentionActionLists({
      patients: [patient],
      episodes,
      sessions,
      invoices: [],
      appointments: [],
      followUps: postDischargeFollowUps,
    }).postDischargeFollowUpsDue;
  }, [enableRetentionLists, patient, episodes, sessions, postDischargeFollowUps]);

  const handleSavePostDischargeFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFollowUpTarget) return;

    const rawNprs = followUpNprs.trim();
    const rawPsfs = followUpPsfs.trim();
    const rawNotes = followUpNotes.trim();

    if (!rawNprs && !rawPsfs && !rawNotes) {
      setFollowUpFeedback({
        kind: 'error',
        text: bi(
          'يرجى إدخال درجة NPRS أو PSFS أو ملاحظة متابعة واحدة على الأقل.',
          'Please enter an NPRS score, PSFS score, or a follow-up note.',
          'تکایە لانیکەم نمرەی NPRS یان PSFS یان تێبینییەکی بەدواداچوون تۆمار بکە.'
        ),
      });
      return;
    }

    let parsedNprs: number | undefined;
    if (rawNprs !== '') {
      const n = Number(rawNprs);
      if (!Number.isFinite(n) || n < 0 || n > 10) {
        setFollowUpFeedback({
          kind: 'error',
          text: bi(
            'يجب أن تكون درجة الألم (NPRS) بين 0 و 10.',
            'NPRS score must be between 0 and 10.',
            'نمرەی ئازار (NPRS) دەبێت لە نێوان ٠ و ١٠ بێت.'
          ),
        });
        return;
      }
      parsedNprs = Math.round(n * 10) / 10;
    }

    let parsedPsfs: number | undefined;
    if (rawPsfs !== '') {
      const p = Number(rawPsfs);
      if (!Number.isFinite(p) || p < 0 || p > 10) {
        setFollowUpFeedback({
          kind: 'error',
          text: bi(
            'يجب أن تكون درجة الوظيفة (PSFS) بين 0 و 10.',
            'PSFS score must be between 0 and 10.',
            'نمرەی فەرمان (PSFS) دەبێت لە نێوان ٠ و ١٠ بێت.'
          ),
        });
        return;
      }
      parsedPsfs = Math.round(p * 10) / 10;
    }

    const updatedList = ClinicOperationsService.recordPostDischargeFollowUp({
      patientId: patient.id,
      episodeId: activeFollowUpTarget.episodeId,
      intervalWeeks: activeFollowUpTarget.intervalWeeks,
      dischargeDate: activeFollowUpTarget.dischargeDate,
      dueDate: activeFollowUpTarget.dueDate,
      nprsScore: parsedNprs,
      psfsScore: parsedPsfs,
      notes: rawNotes || undefined,
    });
    setPostDischargeFollowUps(updatedList);
    setActiveFollowUpTarget(null);
    setFollowUpNprs('');
    setFollowUpPsfs('');
    setFollowUpNotes('');
    setFollowUpFeedback({
      kind: 'success',
      text: bi(
        'تم حفظ متابعة ما بعد التخريج بنجاح.',
        'Post-discharge follow-up recorded.',
        'بەدواداچوونی دوای دەرچوون بە سەرکەوتوویی تۆمار کرا.'
      ),
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden transition-colors">
      {/* Main Content Scroll Canvas */}
      <div
        tabIndex={0}
        aria-label={bi('محتوى الملف السريري للمريض', 'Patient clinical chart content', 'ناوەڕۆکی تۆماری کلینیکیی نەخۆش')}
        className="flex-1 overflow-y-auto p-3 sm:p-5 pb-24 sm:pb-8 space-y-4 focus:outline-none"
      >
        <ChartHeroAndUtilityStrip
          patient={patient}
          patientAge={patientAge}
          genderLabel={genderLabel}
          onAvatarFileSelect={handleAvatarFileSelect}
          navigationTabs={navigationTabs}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          episodes={episodes}
          activeEpisode={activeEpisode}
          onSelectEpisode={onSelectEpisode}
          onOpenNewEpisode={handleTriggerNewEpisode}
          totalDebtIQD={financialSummary.totalDebtIQD}
          enableReferralsModule={enableReferralsModule}
          hasReferralAttribution={hasReferralAttribution}
          referralPillText={referralPillText}
          onOpenReportBackModal={() => setIsReportBackModalOpen(true)}
          isSaving={isSaving}
          isDirty={isDirty}
          lastSavedAt={lastSavedAt}
          onOpenNewSession={onOpenNewSession}
          reEvalStatus={reEvalStatus}
          enableRetentionLists={enableRetentionLists}
          duePostDischargeItems={duePostDischargeItems}
          patientFollowUps={patientFollowUps}
          activeFollowUpTarget={activeFollowUpTarget}
          setActiveFollowUpTarget={setActiveFollowUpTarget}
          followUpNprs={followUpNprs}
          setFollowUpNprs={setFollowUpNprs}
          followUpPsfs={followUpPsfs}
          setFollowUpPsfs={setFollowUpPsfs}
          followUpNotes={followUpNotes}
          setFollowUpNotes={setFollowUpNotes}
          followUpFeedback={followUpFeedback}
          setFollowUpFeedback={setFollowUpFeedback}
          onSavePostDischargeFollowUp={handleSavePostDischargeFollowUp}
          isPinned={isPinned}
          onTogglePinned={setIsPinned}
          onBackToDirectory={onBackToDirectory}
          onPrintComprehensiveReport={() => setActivePrintDoc('medical_report')}
          onOpenEditPersonalInfo={() => setIsEditPersonalInfoOpen(true)}
          redAlerts={redAlerts}
          cautionAlerts={cautionAlerts}
          isContextCollapsed={isContextCollapsed}
          onToggleContextCollapsed={() => setIsContextCollapsed((v) => !v)}
          onStartChartTour={onStartChartTour}
          onOpenDischargeModal={() => setIsDischargeModalOpen(true)}
        />

        {/* Tab 1: المتابعة (Live Clinical Pulse + Recorded Objective Snapshot + Sessions Timeline) */}
        {activeTab === 'overview' && (
          <ChartOverviewTab
            patient={patient}
            patientAge={patientAge}
            genderLabel={genderLabel}
            activeEpisode={activeEpisode}
            episodeStore={episodeStore}
            episodeSessions={episodeSessions}
            sessionPainPoints={sessionPainPoints}
            onOpenEditPersonalInfo={() => setIsEditPersonalInfoOpen(true)}
            onOpenEditClinicalSummary={() => setIsEditClinicalSummaryOpen(true)}
            onOpenMmtModal={() => setIsMmtModalOpen(true)}
            onOpenRomModal={() => setIsRomModalOpen(true)}
            onOpenNeuroModal={() => setIsNeuroModalOpen(true)}
            onOpenSpecialTestsModal={() => setIsSpecialTestsModalOpen(true)}
            onOpenSession={onOpenSession}
            onOpenNewSession={onOpenNewSession}
            onViewAllSessions={() => setActiveTab('overview')}
            onOpenFullEvaluation={() => {
              setActiveTab('evaluation');
              setEvalSubView('plan');
            }}
            isContextCollapsed={isContextCollapsed}
          />
        )}

        {/* Tab 2: الخطة والتقدم (Read-Only Latest Exam Status + Plan of Care & Goals + Progress Comparison) */}
        {activeTab === 'evaluation' && (
          <div className="max-w-7xl mx-auto space-y-4">
            {/* 2 Crisp Sub-Tabs ONLY (No duplicate Assessment Tools button) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-surface/80 max-w-full">
                {(
                  [
                    {
                      id: 'plan' as EvalPlanSubView,
                      shortLabel: bi('الحالة والخطة', 'Status & Plan', 'دۆخ و پلان'),
                      label: showExerciseLibrary
                        ? bi('الحالة والخطة والتمارين', 'Status, Plan & HEP', 'دۆخ، پلان و ڕاهێنان')
                        : bi('الحالة والخطة', 'Status & Plan', 'دۆخ و پلان'),
                      icon: CheckCircle2,
                    },
                    {
                      id: 'progress' as EvalPlanSubView,
                      shortLabel: bi('التقدم', 'Progress', 'پێشکەوتن'),
                      label: bi('مقارنة التقدم', 'Progress Charts', 'بەراوردی پێشکەوتن'),
                      icon: TrendingUp,
                    },
                  ] as const
                ).map((sub) => {
                  const SubIcon = sub.icon;
                  const active = evalSubView === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setEvalSubView(sub.id)}
                      className={`shrink-0 compact-btn h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground-1 hover:text-foreground hover:bg-card/60'
                      }`}
                    >
                      <SubIcon className="size-3.5 shrink-0 hidden sm:inline" />
                      <span className="sm:hidden">{sub.shortLabel}</span>
                      <span className="hidden sm:inline">{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {evalSubView === 'plan' && (
              <div className="space-y-5">
                <ChartEvaluationTab
                  episodeStore={episodeStore}
                  enableProblemListGoals={enableProblemListGoals}
                  enableVitalsModule={enableVitalsModule}
                  hasOpenDraftSession={Boolean(latestDraftSessionForExam)}
                  onOpenSessionForExam={handleOpenSessionForExam}
                />

                <ChartTreatmentTab
                  patient={patient}
                  activeEpisode={activeEpisode}
                  episodeStore={episodeStore}
                  showExerciseLibrary={showExerciseLibrary}
                  updateEpisodeField={updateEpisodeField}
                />
              </div>
            )}

            {evalSubView === 'progress' && (
              <ChartComparisonTab
                episodeStore={episodeStore}
                activeEpisode={activeEpisode}
                episodeSessions={episodeSessions}
                sessionPainPoints={sessionPainPoints}
                patientName={patient.data.fullNameAr || patient.data.fullName}
                onSnapshotAdded={(updatedStore) => setEpisodeStore(updatedStore)}
                onPrintProgressReport={() => setActivePrintDoc('progress_report')}
              />
            )}
          </div>
        )}

        {/* Tab 3: السجل المرضي (100% Pure Clinical Background: Safety, Red Flags, History, Medications, Imaging, Posture Studio) */}
        {activeTab === 'history' && (
          <ChartHistoryTab
            patient={patient}
            activeEpisode={activeEpisode}
            contraindications={contraindications}
            setContraindications={setContraindications}
            structuredPrecautions={structuredPrecautions}
            setStructuredPrecautions={setStructuredPrecautions}
            customPrecautions={customPrecautions}
            setCustomPrecautions={setCustomPrecautions}
            dismissedPrecautionIds={dismissedPrecautionIds}
            setDismissedPrecautionIds={setDismissedPrecautionIds}
            redFlags={redFlags}
            setRedFlags={setRedFlags}
            redFlagChecklist={redFlagChecklist}
            setRedFlagChecklist={setRedFlagChecklist}
            dismissedRedFlagIds={dismissedRedFlagIds}
            setDismissedRedFlagIds={setDismissedRedFlagIds}
            currentMedications={currentMedications}
            setCurrentMedications={setCurrentMedications}
            medicalHistory={medicalHistory}
            setMedicalHistory={setMedicalHistory}
            previousSurgeries={previousSurgeries}
            setPreviousSurgeries={setPreviousSurgeries}
            attachments={attachments}
            onPersistAttachments={handlePersistAttachments}
            onSaveMasterAndEpisode={handleSaveMasterAndEpisode}
            isSaving={isSaving}
            saveSuccess={saveSuccess}
          />
        )}

        {/* Tab 4: الملف والمالية (100% Non-Clinical, Administrative & Financial Hub) */}
        {activeTab === 'profile' && (
          <ChartProfileTab
            patient={patient}
            patientAge={patientAge}
            genderLabel={genderLabel}
            episodes={episodes}
            activeEpisode={activeEpisode}
            sessions={sessions}
            episodeStore={episodeStore}
            financialSummary={financialSummary}
            enableScheduleVisitCardPrint={enableScheduleVisitCardPrint}
            onAllPatientSoapsLoaded={setAllPatientSoaps}
            onOpenPrintDoc={setActivePrintDoc}
            onOpenEditPersonalInfo={openEditPersonalInfoModal}
            enableReferralsModule={enableReferralsModule}
            referringDoctors={referringDoctors}
            referralSourceType={referralSourceType}
            referringDoctorId={referringDoctorId}
            referralNotes={referralNotes}
            referringPhysician={referringPhysician}
            referringClinic={referringClinic}
            emergencyContactName={emergencyContactName}
            emergencyContactPhone={emergencyContactPhone}
            onOpenReportBackModal={() => setIsReportBackModalOpen(true)}
          />
        )}
      </div>

      <ChartModals
        patient={patient}
        patientAge={patientAge}
        episodes={episodes}
        activeEpisode={activeEpisode}
        sessions={sessions}
        episodeSessions={episodeSessions}
        episodeStore={episodeStore}
        episodeSoaps={episodeSoaps}
        allPatientSoaps={allPatientSoaps}
        isSaving={isSaving}
        isExamShelfModalOpen={isExamShelfModalOpen}
        setIsExamShelfModalOpen={setIsExamShelfModalOpen}
        onAddWidget={handleAddWidget}
        activePrintDoc={activePrintDoc}
        setActivePrintDoc={setActivePrintDoc}
        isCustomStudioOpen={isCustomStudioOpen}
        setIsCustomStudioOpen={setIsCustomStudioOpen}
        isEditPersonalInfoOpen={isEditPersonalInfoOpen}
        setIsEditPersonalInfoOpen={setIsEditPersonalInfoOpen}
        editFullName={editFullName}
        setEditFullName={setEditFullName}
        editPhone={editPhone}
        setEditPhone={setEditPhone}
        editGender={editGender}
        setEditGender={setEditGender}
        editDob={editDob}
        setEditDob={setEditDob}
        editAddress={editAddress}
        setEditAddress={setEditAddress}
        editEmergencyName={editEmergencyName}
        setEditEmergencyName={setEditEmergencyName}
        editEmergencyPhone={editEmergencyPhone}
        setEditEmergencyPhone={setEditEmergencyPhone}
        enableReferralsModule={enableReferralsModule}
        referringDoctors={referringDoctors}
        editReferralSourceType={editReferralSourceType}
        setEditReferralSourceType={setEditReferralSourceType}
        editReferringDoctorId={editReferringDoctorId}
        setEditReferringDoctorId={setEditReferringDoctorId}
        editReferralNotes={editReferralNotes}
        setEditReferralNotes={setEditReferralNotes}
        editReferringPhysician={editReferringPhysician}
        setEditReferringPhysician={setEditReferringPhysician}
        editReferringClinic={editReferringClinic}
        setEditReferringClinic={setEditReferringClinic}
        onSavePersonalInfo={handleSavePersonalInfo}
        isEditClinicalSummaryOpen={isEditClinicalSummaryOpen}
        setIsEditClinicalSummaryOpen={setIsEditClinicalSummaryOpen}
        editEpisodeTitle={editEpisodeTitle}
        setEditEpisodeTitle={setEditEpisodeTitle}
        editDiagnosis={editDiagnosis}
        setEditDiagnosis={setEditDiagnosis}
        editChiefComplaint={editChiefComplaint}
        setEditChiefComplaint={setEditChiefComplaint}
        editClinicalImpression={editClinicalImpression}
        setEditClinicalImpression={setEditClinicalImpression}
        editGoals={editGoals}
        setEditGoals={setEditGoals}
        onSaveClinicalSummary={handleSaveClinicalSummary}
        isMmtModalOpen={isMmtModalOpen}
        setIsMmtModalOpen={setIsMmtModalOpen}
        onUpdateObjectiveMmt={updateObjectiveMmt}
        isRomModalOpen={isRomModalOpen}
        setIsRomModalOpen={setIsRomModalOpen}
        onUpdateObjectiveRom={updateObjectiveRom}
        isNeuroModalOpen={isNeuroModalOpen}
        setIsNeuroModalOpen={setIsNeuroModalOpen}
        onUpdateObjectiveNeuro={updateObjectiveNeuro}
        isSpecialTestsModalOpen={isSpecialTestsModalOpen}
        setIsSpecialTestsModalOpen={setIsSpecialTestsModalOpen}
        onUpdateSpecialTests={updateSpecialTests}
        onUpdateFunctionalScales={updateFunctionalScales}
        onSaveMasterAndEpisode={handleSaveMasterAndEpisode}
        isReportBackModalOpen={isReportBackModalOpen}
        setIsReportBackModalOpen={setIsReportBackModalOpen}
        patientWithReferralEdits={patientWithReferralEdits}
        resolvedDoctor={resolvedDoctor}
        referringPhysician={referringPhysician}
        referringClinic={referringClinic}
      />

      <DischargeEpisodeModal
        isOpen={isDischargeModalOpen}
        onClose={() => setIsDischargeModalOpen(false)}
        patient={patient}
        episode={activeEpisode}
        sessions={episodeSessions}
        soaps={episodeSoaps}
        episodeStore={episodeStore}
        onConfirmDischarge={async (payload) => {
          await closeEpisode(payload.episodeId, {
            endDate: payload.endDate,
            dischargeReason: payload.dischargeReason,
            dischargeSummary: payload.dischargeSummary,
            dischargeFinalOutcomeNote: payload.dischargeFinalOutcomeNote,
          });
          window.dispatchEvent(new CustomEvent('physiorecord-episodes-updated'));
          onPatientUpdated();
        }}
        onReopenEpisode={async (episodeId) => {
          await setEpisodeStatus(episodeId, 'active');
          window.dispatchEvent(new CustomEvent('physiorecord-episodes-updated'));
          onPatientUpdated();
        }}
        onStartNewEpisode={handleTriggerNewEpisode}
        onPrintDischargeReport={() => {
          setIsDischargeModalOpen(false);
          setActivePrintDoc('medical_report');
        }}
      />
    </div>
  );
};
