// =======================================================================
// PhysioRecord — Master Patient Hub & Episode-Isolated Clinical Chart
// Central Patient Profile Hub + Strictly Isolated Episode of Care Assessments,
// Longitudinal Comparison Matrix, HEP Prescription & Iraqi IQD Financial Summary
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Dumbbell,
  History,
  Layers,
  LayoutGrid,
  Plus,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
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
import { evaluateReEvalDueStatus } from '../../utils/reEvalNudge';
import type { SessionPainPointInput } from '../organui/OrganClinicalCharts';
import type { PrintableDocumentType } from '../print/PrintDocumentModal';
import { ChartEvaluationTab } from './chart/ChartEvaluationTab';
import {
  ChartHeaderBar,
  ChartHeroAndUtilityStrip,
  type ChartNavigationTab,
  type ChartTabId,
} from './chart/ChartHeaderAndSummaryStrip';
import { ChartHistoryTab } from './chart/ChartHistoryTab';
import { ChartModals } from './chart/ChartModals';
import { ChartOverviewTab } from './chart/ChartOverviewTab';
import { ChartProfileTab } from './chart/ChartProfileTab';
import { ChartSessionsTab } from './chart/ChartSessionsTab';
import {
  ChartComparisonTab,
  ChartTreatmentTab,
} from './chart/ChartTreatmentAndComparisonTab';

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
}

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
}) => {
  const { language, bi } = useLanguage();
  const isRtlLang = language !== 'en';
  const { dek } = useVault();
  const { savePatient } = usePatients();

  const [activeTab, setActiveTab] = useState<ChartTabId>('overview');
  const [sessionPainPoints, setSessionPainPoints] = useState<SessionPainPointInput[]>([]);
  const [episodeSoaps, setEpisodeSoaps] = useState<SoapNoteRecord[]>([]);
  const [allPatientSoaps, setAllPatientSoaps] = useState<SoapNoteRecord[]>([]);
  const [activePrintDoc, setActivePrintDoc] = useState<PrintableDocumentType | null>(null);
  const [isCustomStudioOpen, setIsCustomStudioOpen] = useState(false);
  const [isExamShelfModalOpen, setIsExamShelfModalOpen] = useState(false);
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

  useEffect(() => {
    setEditFullName(patient.data.fullName || '');
    setEditPhone(patient.data.phone || '');
    setEditDob(patient.data.dateOfBirth || '');
    setEditGender(patient.data.gender || 'male');
    setEditAddress(patient.data.address || '');
    setEditEmergencyName(patient.data.emergencyContactName || '');
    setEditEmergencyPhone(patient.data.emergencyContactPhone || '');
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
  const [enablePerformanceTestLibrary, setEnablePerformanceTestLibrary] = useState<boolean>(() =>
    ClinicOperationsService.isPerformanceTestLibraryEnabled()
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
      setEnablePerformanceTestLibrary(ClinicOperationsService.isPerformanceTestLibraryEnabled());
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
    overrideAttachments?: PatientDocumentAttachment[]
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

  const handleSavePersonalInfo = async () => {
    if (!dek) return;
    setIsSaving(true);
    try {
      const updatedClinicalData: PatientClinicalData = {
        ...buildMasterClinicalData(),
        fullName: editFullName.trim() || patient.data.fullName || 'مريض',
        phone: editPhone.trim() || undefined,
        dateOfBirth: editDob || undefined,
        gender: editGender,
        address: editAddress.trim() || undefined,
        emergencyContactName: editEmergencyName.trim() || undefined,
        emergencyContactPhone: editEmergencyPhone.trim() || undefined,
      };
      await savePatient(updatedClinicalData, patient.id);
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

  const navigationTabs: ChartNavigationTab[] = [
    {
      id: 'overview',
      label: bi('نظرة عامة', 'Overview', 'پوختە'),
      icon: LayoutGrid,
    },
    {
      id: 'history',
      label: bi('السجل المرضي', 'History', 'مێژوو'),
      icon: History,
    },
    {
      id: 'treatment',
      label: showExerciseLibrary
        ? bi('العلاج والتمارين', 'Treatment', 'چارەسەر')
        : bi('الخطة والأهداف', 'Plan & Goals', 'پلان و ئامانجەکان'),
      icon: showExerciseLibrary ? Dumbbell : CheckCircle2,
      count: showExerciseLibrary ? episodeStore.hepProgram.length : undefined,
    },
    {
      id: 'sessions',
      label: bi('الجلسات', 'Sessions', 'دانیشتنەکان'),
      icon: Clock,
      count: episodeSessions.length,
    },
    {
      id: 'evaluation',
      label: bi('التقييم السريري', 'Evaluation', 'هەڵسەنگاندن'),
      icon: Layers,
      count: episodeStore.activeWidgetIds.length,
    },
    {
      id: 'comparison',
      label: bi('المقارنة', 'Progress', 'بەراورد'),
      icon: TrendingUp,
      count: episodeStore.snapshots.length,
    },
    {
      id: 'profile',
      label: bi('الملف والمالية', 'Financial & Docs', 'دارایی و دۆکیومێنت'),
      icon: Wallet,
    },
  ];

  const handleSaveMasterAndEpisode = async () => {
    if (!dek) return;
    setIsSaving(true);
    try {
      const updatedClinicalData = buildMasterClinicalData();
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
  };

  const handleRemoveWidget = (widgetId: string) => {
    updateEpisodeField(
      'activeWidgetIds',
      episodeStore.activeWidgetIds.filter((id) => id !== widgetId)
    );
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
      <ChartHeaderBar
        patientId={patient.id}
        isPinned={isPinned}
        onTogglePinned={setIsPinned}
        onBackToDirectory={onBackToDirectory}
        onPrintComprehensiveReport={() => setActivePrintDoc('medical_report')}
      />

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
          onSelectTab={setActiveTab}
          episodes={episodes}
          activeEpisode={activeEpisode}
          onSelectEpisode={onSelectEpisode}
          onOpenNewEpisode={onOpenNewEpisode}
          totalDebtIQD={financialSummary.totalDebtIQD}
          enableReferralsModule={enableReferralsModule}
          hasReferralAttribution={hasReferralAttribution}
          referralPillText={referralPillText}
          onOpenReportBackModal={() => setIsReportBackModalOpen(true)}
          isSaving={isSaving}
          isDirty={isDirty}
          lastSavedAt={lastSavedAt}
          activeWidgetCount={episodeStore.activeWidgetIds.length}
          onOpenExamShelfModal={() => setIsExamShelfModalOpen(true)}
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
        />

        {activeTab === 'overview' && (
          <ChartOverviewTab
            patient={patient}
            patientAge={patientAge}
            genderLabel={genderLabel}
            activeEpisode={activeEpisode}
            episodeStore={episodeStore}
            episodeSessions={episodeSessions}
            onOpenEditPersonalInfo={() => setIsEditPersonalInfoOpen(true)}
            onOpenEditClinicalSummary={() => setIsEditClinicalSummaryOpen(true)}
            onOpenMmtModal={() => setIsMmtModalOpen(true)}
            onOpenRomModal={() => setIsRomModalOpen(true)}
            onOpenNeuroModal={() => setIsNeuroModalOpen(true)}
            onOpenSpecialTestsModal={() => setIsSpecialTestsModalOpen(true)}
            onOpenSession={onOpenSession}
            onViewAllSessions={() => setActiveTab('sessions')}
          />
        )}

        {activeTab === 'evaluation' && (
          <ChartEvaluationTab
            effectiveEpisodeId={effectiveEpisodeId}
            patient={patient}
            episodeStore={episodeStore}
            setEpisodeStore={setEpisodeStore}
            updateEpisodeField={updateEpisodeField}
            enableProblemListGoals={enableProblemListGoals}
            enablePerformanceTestLibrary={enablePerformanceTestLibrary}
            enableVitalsModule={enableVitalsModule}
            onRemoveWidget={handleRemoveWidget}
            onAddWidget={handleAddWidget}
            onOpenExamShelf={() => setIsExamShelfModalOpen(true)}
          />
        )}

        {activeTab === 'comparison' && (
          <ChartComparisonTab
            episodeStore={episodeStore}
            activeEpisode={activeEpisode}
            episodeSessions={episodeSessions}
            sessionPainPoints={sessionPainPoints}
            onSnapshotAdded={(updatedStore) => setEpisodeStore(updatedStore)}
          />
        )}

        {(activeTab === 'treatment' || activeTab === 'hep') && (
          <ChartTreatmentTab
            patient={patient}
            activeEpisode={activeEpisode}
            episodeStore={episodeStore}
            showExerciseLibrary={showExerciseLibrary}
            updateEpisodeField={updateEpisodeField}
          />
        )}

        {activeTab === 'sessions' && (
          <ChartSessionsTab
            patient={patient}
            activeEpisode={activeEpisode}
            episodeSessions={episodeSessions}
            onOpenSession={onOpenSession}
            onOpenNewSession={onOpenNewSession}
          />
        )}

        {activeTab === 'history' && (
          <ChartHistoryTab
            patient={patient}
            activeEpisode={activeEpisode}
            enableReferralsModule={enableReferralsModule}
            referringDoctors={referringDoctors}
            referralSourceType={referralSourceType}
            setReferralSourceType={setReferralSourceType}
            referringDoctorId={referringDoctorId}
            setReferringDoctorId={setReferringDoctorId}
            referralNotes={referralNotes}
            setReferralNotes={setReferralNotes}
            referringPhysician={referringPhysician}
            setReferringPhysician={setReferringPhysician}
            referringClinic={referringClinic}
            setReferringClinic={setReferringClinic}
            emergencyContactName={emergencyContactName}
            setEmergencyContactName={setEmergencyContactName}
            emergencyContactPhone={emergencyContactPhone}
            setEmergencyContactPhone={setEmergencyContactPhone}
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
            onOpenReportBackModal={() => setIsReportBackModalOpen(true)}
            onSaveMasterAndEpisode={handleSaveMasterAndEpisode}
            isSaving={isSaving}
            saveSuccess={saveSuccess}
          />
        )}

        {activeTab === 'profile' && (
          <ChartProfileTab
            patient={patient}
            episodes={episodes}
            activeEpisode={activeEpisode}
            sessions={sessions}
            episodeStore={episodeStore}
            financialSummary={financialSummary}
            enableScheduleVisitCardPrint={enableScheduleVisitCardPrint}
            onAllPatientSoapsLoaded={setAllPatientSoaps}
            onOpenPrintDoc={setActivePrintDoc}
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

      {/* Mobile Floating Bottom Action Button */}
      <div className="fixed bottom-4 inset-x-4 z-30 sm:hidden pointer-events-none">
        <button
          type="button"
          onClick={onOpenNewSession}
          className="pointer-events-auto w-full py-3.5 px-6 rounded-2xl bg-primary text-primary-foreground font-black text-sm shadow-xl shadow-primary/25 hover:bg-primary-hover active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="size-5" />
          <span>{bi('إضافة جلسة جديدة', 'Add New Session', 'زیادکردنی دانیشتنی نوێ')}</span>
        </button>
      </div>
    </div>
  );
};
