// =======================================================================
// PhysioRecord — Master Patient Hub & Episode-Isolated Clinical Chart
// Central Patient Profile Hub + Strictly Isolated Episode of Care Assessments,
// Longitudinal Comparison Matrix, HEP Prescription & Iraqi IQD Financial Summary
// =======================================================================

import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { useVirtualWindow } from '../../hooks/useVirtualWindow';
import {
  ClinicOperationsService,
} from '../../services/clinicOperationsService';
import {
  localDate,
  formatDateDDMMYYYY,
  formatTimeIraq,
  WEEKDAYS_IRAQI_ORDER,
  formatWeekdaysSummary,
  computePatientAge,
  formatIraqiPhoneDisplay,
  formatClinicalDate,
} from '../../utils/date';
import type {
  RomAssessmentBatteryData,
  MmtAssessmentBatteryData,
  NeuroScreeningBatteryData,
  PatientRecord,
  EpisodeRecord,
  SessionRecord,
  PatientClinicalData,
  PatientDocumentAttachment,
  PatientRedFlagChecklistItem,
  SoapNoteRecord,
  StructuredPrecautionId,
  CustomPrecautionItem,
} from '../../types/clinical';
import type {
  EpisodeScopedClinicalStore,
  FollowUpIntervalWeeks,
  PostDischargeFollowUpRecord,
  RecurringPatientSchedule,
  ReferralSourceType,
  ReferringDoctorEntry,
  WeekdayIndex,
} from '../../types/clinicManagement';
import type {
  OrthopedicSpecialTestItem,
  FunctionalScaleEntry,
} from '../../types/clinicalWidgets';
import {
  isDemoPatient,
  getPatientMrn,
  getPatientDisplayName,
  getPatientSecondaryName,
} from '../../utils/mrn';
import { EpisodeService } from '../../services/episodeService';
import type { PrintableDocumentType } from '../print/PrintDocumentModal';
import type { SessionPainPointInput } from '../organui/OrganClinicalCharts';
import { RedFlagChecklistPanel } from './RedFlagChecklistPanel';
import { evaluateReEvalDueStatus } from '../../utils/reEvalNudge';
import { STRUCTURED_PRECAUTIONS_CATALOG } from '../../utils/modalitySafetyChecker';
import {
  REFERRAL_SOURCE_LABELS,
  REFERRAL_SOURCE_TYPES,
  computeRetentionActionLists,
  resolveDoctorDisplayName,
  resolveDoctorFacility,
  resolvePatientReferralSource,
} from '../../utils/iraqReferralsRetentionC6C7';

const ExamPresetBar = lazy(() =>
  import('./ExamPresetBar').then((m) => ({ default: m.ExamPresetBar }))
);
const EpisodeProblemListGoalsPanel = lazy(() =>
  import('./EpisodeProblemListGoalsPanel').then((m) => ({
    default: m.EpisodeProblemListGoalsPanel,
  }))
);
const VitalsPanel = lazy(() =>
  import('./VitalsPanel').then((m) => ({ default: m.VitalsPanel }))
);

const ExamWidgetShelf = lazy(() =>
  import('./ExamWidgetShelf').then((m) => ({ default: m.ExamWidgetShelf }))
);
const ActiveExamCanvas = lazy(() =>
  import('./ActiveExamCanvas').then((m) => ({ default: m.ActiveExamCanvas }))
);
const CustomWidgetStudioModal = lazy(() =>
  import('./CustomWidgetStudioModal').then((m) => ({ default: m.CustomWidgetStudioModal }))
);
const PrintDocumentModal = lazy(() =>
  import('../print/PrintDocumentModal').then((m) => ({ default: m.PrintDocumentModal }))
);
const ConsentSignaturePanel = lazy(() =>
  import('../clinic/ConsentSignaturePanel').then((m) => ({ default: m.ConsentSignaturePanel }))
);
const PatientAttachmentsPanel = lazy(() =>
  import('../clinic/PatientAttachmentsPanel').then((m) => ({ default: m.PatientAttachmentsPanel }))
);
const PatientImagingReportsPanel = lazy(() =>
  import('./PatientImagingReportsPanel').then((m) => ({ default: m.PatientImagingReportsPanel }))
);
const LongitudinalComparisonView = lazy(() =>
  import('./LongitudinalComparisonView').then((m) => ({ default: m.LongitudinalComparisonView }))
);
const ExerciseLibraryHepView = lazy(() =>
  import('../clinic/ExerciseLibraryHepView').then((m) => ({ default: m.ExerciseLibraryHepView }))
);
const OrganMedicationSchedule = lazy(() =>
  import('../organui/OrganMedicationSchedule').then((m) => ({ default: m.OrganMedicationSchedule }))
);
const OrganClinicalCharts = lazy(() =>
  import('../organui/OrganClinicalCharts').then((m) => ({ default: m.OrganClinicalCharts }))
);
const SmartGoalsGasPanel = lazy(() =>
  import('./SmartGoalsGasPanel').then((m) => ({ default: m.SmartGoalsGasPanel }))
);
import { SoapService } from '../../services/soapService';
import { buildPatientFhirR4Bundle } from '../../utils/fhirExport';
import { localDate as getTodayIso } from '../../utils/date';
import {
  Money,
  AutoResizeTextarea,
  PhoneInput,
  Num,
  Fraction,
  NprsControl,
  DatePickerInput,
  TimePickerInput,
  TimeDisplay,
} from '../ui/Primitives';
import {
  ModalDialog,
} from '../ui/Dialog';
import {
  Layers,
  Plus,
  Save,
  CheckCircle2,
  FileText,
  Clock,
  ShieldAlert,
  TrendingUp,
  Dumbbell,
  Wallet,
  Trash2,
  UserCheck,
  Repeat,
  Pause,
  Play,
  Printer,
  Download,
  CalendarCheck2,
  Send,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  Sparkles,
  History,
  Star,
  Activity,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  MoreVertical,
  Award,
  Zap,
  Gauge,
  Target,
  Edit3,
  MapPin,
  Phone,
  Shield,
  Calendar,
  User,
  Camera,
  Check,
  Copy,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';


const RomWidget = lazy(() =>
  import('../widgets/RomWidget').then((m) => ({ default: m.RomWidget }))
);
const MmtWidget = lazy(() =>
  import('../widgets/MmtWidget').then((m) => ({ default: m.MmtWidget }))
);
const NeuroWidget = lazy(() =>
  import('../widgets/NeuroWidget').then((m) => ({ default: m.NeuroWidget }))
);
const SpecialTestsWidget = lazy(() =>
  import('../widgets/SpecialTestsWidget').then((m) => ({ default: m.SpecialTestsWidget }))
);
const FunctionalScalesWidget = lazy(() =>
  import('../widgets/FunctionalScalesWidget').then((m) => ({ default: m.FunctionalScalesWidget }))
);

const DoctorReportBackLetterModal = lazy(() =>
  import('../clinic/ReferralsAndRetentionPanel').then((m) => ({
    default: m.DoctorReportBackLetterModal,
  }))
);

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
  const { language, bi, t } = useLanguage();
  const isRtlLang = language !== 'en';
  const { dek } = useVault();
  const { savePatient } = usePatients();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'history' | 'treatment' | 'sessions' | 'evaluation' | 'comparison' | 'profile' | 'hep'
  >('overview');
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
  const [mrnCopied, setMrnCopied] = useState(false);
  const [isPinned, setIsPinned] = useState(() => ClinicOperationsService.isPatientPinned(patient.id));
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

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
  const [editFullName, setEditFullName] = useState(patient.data.fullName || patient.data.fullName || '');
  const [editPhone, setEditPhone] = useState(patient.data.phone || '');
  const [editDob, setEditDob] = useState(patient.data.dateOfBirth || '');
  const [editGender, setEditGender] = useState<'male' | 'female' | 'other'>(patient.data.gender || 'male');
  
  const [editAddress, setEditAddress] = useState(patient.data.address || '');
  const [editEmergencyName, setEditEmergencyName] = useState(patient.data.emergencyContactName || '');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState(patient.data.emergencyContactPhone || '');

  useEffect(() => {
    setEditFullName(patient.data.fullName || patient.data.fullName || '');
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

  const [sessionGridCols, setSessionGridCols] = useState<number>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 2 : 1
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setSessionGridCols(window.innerWidth >= 768 ? 2 : 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const chartSessionsVirtual = useVirtualWindow({
    totalCount: episodeSessions.length,
    estimatedRowHeightPx: 96,
    columns: sessionGridCols,
    overscanRows: 4,
  });

  const visibleChartSessions = useMemo(
    () => episodeSessions.slice(chartSessionsVirtual.startIndex, chartSessionsVirtual.endIndex),
    [episodeSessions, chartSessionsVirtual.startIndex, chartSessionsVirtual.endIndex]
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
  const [newPrecautionText, setNewPrecautionText] = useState('');
  const [contraindications, setContraindications] = useState(d.contraindications || '');
  const [redFlags, setRedFlags] = useState(d.redFlags || '');
  const [redFlagChecklist, setRedFlagChecklist] = useState<PatientRedFlagChecklistItem[]>(
    d.redFlagChecklist || []
  );
  const [generalNotes, setGeneralNotes] = useState(d.generalNotes || '');
  const [attachments, setAttachments] = useState<PatientDocumentAttachment[]>(
    d.attachments || []
  );

  // --- Patient Recurring Weekly Session Schedules & Phase B Module Flags ---
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
  const [patientRecurringRules, setPatientRecurringRules] = useState<RecurringPatientSchedule[]>(
    () => ClinicOperationsService.getRecurringSchedulesForPatient(patient.id)
  );
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recWeekdays, setRecWeekdays] = useState<WeekdayIndex[]>([0, 2, 4]);
  const [recStartTime, setRecStartTime] = useState('10:00');
  const [recDuration, setRecDuration] = useState<number>(45);
  const [recCustomDurationMode, setRecCustomDurationMode] = useState(false);
  const [recCustomDurationDraft, setRecCustomDurationDraft] = useState('45');
  const [recStartDate, setRecStartDate] = useState(localDate());

  const reloadPatientRecurring = () => {
    setPatientRecurringRules(ClinicOperationsService.getRecurringSchedulesForPatient(patient.id));
  };

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

  useEffect(() => {
    reloadPatientRecurring();
    const onScheduleUpdate = () => reloadPatientRecurring();
    window.addEventListener('physiorecord-schedule-updated', onScheduleUpdate);
    window.addEventListener('physiorecord-demo-updated', onScheduleUpdate);
    return () => {
      window.removeEventListener('physiorecord-schedule-updated', onScheduleUpdate);
      window.removeEventListener('physiorecord-demo-updated', onScheduleUpdate);
    };
  }, [patient.id]);

  const handleToggleRecWeekday = (day: WeekdayIndex) => {
    setRecWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSavePatientRecurring = (e: React.FormEvent) => {
    e.preventDefault();
    if (recWeekdays.length === 0) return;
    const resolvedDuration = Math.max(
      5,
      Math.min(480, Math.round(Number(recDuration) || 45))
    );
    ClinicOperationsService.saveRecurringSchedule({
      patientId: patient.id,
      patientName: patient.data.fullNameAr || patient.data.fullName,
      patientPhone: patient.data.phoneNumber || patient.data.phone || '',
      episodeTitle:
        activeEpisode?.data.title ||
        bi('جلسات تأهيل وعلاج طبيعي', 'PT Rehabilitation Sessions', 'دانیشتنەکانی شیاندنەوە و چارەسەری سروشتی'),
      therapistName: ClinicOperationsService.getActiveStaff().nameAr,
      weekdays: recWeekdays,
      startTime: recStartTime,
      durationMinutes: resolvedDuration,
      visitType: 'follow_up',
      roomOrBed: bi('وحدة العلاج الطبيعي 1', 'PT Treatment Room 1', 'یەکەی چارەسەری سروشتی ١'),
      startDate: recStartDate || localDate(),
      isActive: true,
      isDemo: isDemoPatient(patient),
    });
    reloadPatientRecurring();
    setRecCustomDurationMode(false);
    setRecDuration(45);
    setRecCustomDurationDraft('45');
    setShowRecurringForm(false);
  };

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
  }, [activeEpisode, episodeStore.chiefComplaint, episodeStore.patientPersonalGoals, episodeStore.clinicalImpression]);

  const handleSavePersonalInfo = async () => {
    if (!dek) return;
    setIsSaving(true);
    try {
      const updatedClinicalData: PatientClinicalData = {
        ...buildMasterClinicalData(),
        fullName: editFullName.trim() || patient.data.fullName || "مريض",
        
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
      objective: {
        ...prev.objective,
        romBattery: rom,
      },
    }));
    setIsDirty(true);
  };

  const updateObjectiveMmt = (mmt: MmtAssessmentBatteryData) => {
    setEpisodeStore((prev) => ({
      ...prev,
      objective: {
        ...prev.objective,
        mmtBattery: mmt,
      },
    }));
    setIsDirty(true);
  };

  const updateObjectiveNeuro = (neuro: NeuroScreeningBatteryData) => {
    setEpisodeStore((prev) => ({
      ...prev,
      objective: {
        ...prev.objective,
        neuroScreening: neuro,
      },
    }));
    setIsDirty(true);
  };

  const updateSpecialTests = (specialTests: OrthopedicSpecialTestItem[]) => {
    setEpisodeStore((prev) => ({
      ...prev,
      specialTests,
    }));
    setIsDirty(true);
  };

  const updateFunctionalScales = (functionalScales: FunctionalScaleEntry) => {
    setEpisodeStore((prev) => ({
      ...prev,
      functionalScales,
    }));
    setIsDirty(true);
  };


  const navigationTabs = [
    {
      id: 'overview' as const,
      label: bi('نظرة عامة', 'Overview', 'پوختە'),
      icon: LayoutGrid,
    },
    {
      id: 'history' as const,
      label: bi('السجل المرضي', 'History', 'مێژوو'),
      icon: History,
    },
    {
      id: 'treatment' as const,
      label: showExerciseLibrary
        ? bi('العلاج والتمارين', 'Treatment', 'چارەسەر')
        : bi('الخطة والأهداف', 'Plan & Goals', 'پلان و ئامانجەکان'),
      icon: showExerciseLibrary ? Dumbbell : CheckCircle2,
      count: showExerciseLibrary ? episodeStore.hepProgram.length : undefined,
    },
    {
      id: 'sessions' as const,
      label: bi('الجلسات', 'Sessions', 'دانیشتنەکان'),
      icon: Clock,
      count: episodeSessions.length,
    },
    {
      id: 'evaluation' as const,
      label: bi('التقييم السريري', 'Evaluation', 'هەڵسەنگاندن'),
      icon: Layers,
      count: episodeStore.activeWidgetIds.length,
    },
    {
      id: 'comparison' as const,
      label: bi('المقارنة', 'Progress', 'بەراورد'),
      icon: TrendingUp,
      count: episodeStore.snapshots.length,
    },
    {
      id: 'profile' as const,
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

      // Save strictly isolated Episode store
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

  const handlePersistAttachments = async (
    nextAttachments: PatientDocumentAttachment[]
  ) => {
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

  // Iraqi Financial Summary for this Patient
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
      {/* Top Bar Header */}
      <header className="px-4 py-3 sm:px-6 border-b border-card-line bg-card/90 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToDirectory}
            title={bi('العودة إلى سجل المرضى', 'Back to Patient Directory', 'گەڕانەوە بۆ لیستی نەخۆشەکان')}
            className="size-9 rounded-xl bg-surface hover:bg-muted/60 border border-line-2 flex items-center justify-center text-foreground hover:text-primary transition-colors cursor-pointer shrink-0"
          >
            <ChevronLeft className="size-5 rtl:rotate-0 ltr:rotate-180" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-black text-foreground truncate">
              {bi('ملف المريض', 'Patient Profile', 'پرۆفایلی نەخۆش')}
            </h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground-1 truncate">
              {bi('التفاصيل والمعلومات السريرية', 'Patient Details & Clinical Info', 'زانیاری ورد و کلینیکی')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActivePrintDoc('medical_report')}
            title={bi('طباعة تقرير شامل', 'Print Comprehensive Report', 'چاپکردنی ڕاپۆرت')}
            className="size-9 rounded-xl bg-surface hover:bg-muted/60 border border-line-2 flex items-center justify-center text-muted-foreground-1 hover:text-primary transition-colors cursor-pointer"
          >
            <Printer className="size-4.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const next = ClinicOperationsService.togglePinnedPatient(patient.id);
              setIsPinned(next);
            }}
            title={isPinned ? bi('إلغاء التثبيت', 'Unpin Patient', 'لابردنی چەسپاندن') : bi('تثبيت المريض', 'Pin Patient', 'چەسپاندنی نەخۆش')}
            className={`size-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
              isPinned
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                : 'bg-surface hover:bg-muted/60 border-line-2 text-muted-foreground-1 hover:text-amber-500'
            }`}
          >
            <Star className={`size-4.5 ${isPinned ? 'fill-amber-500 text-amber-500' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Content Scroll Canvas */}
      <div
        tabIndex={0}
        aria-label={bi('محتوى الملف السريري للمريض', 'Patient clinical chart content', 'ناوەڕۆکی تۆماری کلینیکیی نەخۆش')}
        className="flex-1 overflow-y-auto p-3 sm:p-5 pb-24 sm:pb-8 space-y-4 focus:outline-none"
      >
        {/* Patient Hero Card */}
        <div className="max-w-7xl mx-auto w-full">
          <div className="relative rounded-3xl p-4 sm:p-6 bg-gradient-to-br from-card via-card/95 to-primary/10 border border-primary/20 shadow-2xs overflow-hidden space-y-4">
            {/* Pure Geometric Shapes Background (Circles, Rings, Diamonds, Rotated Squares, Dots, Crosses) */}
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none select-none">
              {/* Concentric Circles & Rings */}
              <div className="absolute -top-12 -end-12 size-48 rounded-full border-2 border-primary/10 dark:border-primary/15" />
              <div className="absolute -top-6 -end-6 size-36 rounded-full border border-dashed border-primary/15 dark:border-primary/20" />
              
              {/* Floating Rotated Diamond */}
              <div className="absolute top-4 end-1/3 size-12 rounded-xl border-2 border-primary/10 dark:border-primary/15 rotate-45" />

              {/* Rotated Squares */}
              <div className="absolute -bottom-10 start-8 size-28 rounded-2xl border-2 border-primary/10 dark:border-primary/15 -rotate-12" />
              <div className="absolute -bottom-5 start-12 size-20 rounded-xl border border-dashed border-primary/15 dark:border-primary/20 -rotate-12" />

              {/* Geometric Floating Circles */}
              <div className="absolute top-4 start-1/3 size-8 rounded-full border border-primary/15" />
              <div className="absolute bottom-3 end-12 size-5 rounded-full bg-primary/10" />

              {/* Dot Grid */}
              <div className="absolute bottom-4 end-1/4 flex gap-2 opacity-25">
                <div className="size-1.5 rounded-full bg-primary" />
                <div className="size-1.5 rounded-full bg-primary" />
                <div className="size-1.5 rounded-full bg-primary" />
              </div>

              {/* Geometric Cross */}
              <div className="absolute top-6 end-16 opacity-20">
                <div className="relative size-5">
                  <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-primary rounded-full" />
                  <div className="absolute inset-y-0 start-1/2 w-0.5 -translate-x-1/2 bg-primary rounded-full" />
                </div>
              </div>
            </div>

            <div className="relative z-10 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
                {/* Circular Avatar with Camera Edit Icon on Corner */}
                <div className="relative shrink-0 select-none">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-label={bi('رفع صورة المريض', 'Upload patient photo', 'بارکردنی وێنەی نەخۆش')}
                    onChange={handleAvatarFileSelect}
                  />
                  <div className="size-16 rounded-full bg-gradient-to-br from-primary/20 via-sky-500/10 to-primary/5 border-2 border-primary/25 flex items-center justify-center text-primary font-black text-2xl shadow-inner select-none overflow-hidden">
                    {patient.data.avatarUrl || patient.data.photoDataUrl ? (
                      <img
                        src={patient.data.avatarUrl || patient.data.photoDataUrl}
                        alt={getPatientDisplayName(patient.data, language)}
                        className="size-full object-cover"
                      />
                    ) : (
                      getPatientDisplayName(patient.data, language).slice(0, 1) || <User className="size-7 text-primary" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarFileInputRef.current?.click()}
                    title={bi('اختيار صورة من المعرض', 'Pick Photo from Gallery', 'دیاریکردنی وێنە لە گەلەری')}
                    style={{ width: '22px', height: '22px', minWidth: '22px', minHeight: '22px' }}
                    className="compact-btn !w-[22px] !h-[22px] !min-w-[22px] !min-h-[22px] rounded-full bg-slate-900 text-white border-2 border-card flex items-center justify-center shadow-md absolute bottom-0 end-0 hover:scale-110 transition-transform cursor-pointer z-10 p-0"
                  >
                    <Camera className="size-3 text-white" />
                  </button>
                </div>

                {/* Name, MRN & Chips */}
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base sm:text-xl font-black text-foreground truncate">
                      {getPatientDisplayName(patient.data, language)}
                    </h2>
                    <div className="size-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <User className="size-3" />
                    </div>
                    {isDemoPatient(patient) && (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        DEMO
                      </span>
                    )}
                  </div>

                  {/* MRN Code with Copy */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const mrn = getPatientMrn(patient);
                        if (navigator?.clipboard?.writeText) {
                          navigator.clipboard.writeText(mrn);
                          setMrnCopied(true);
                          setTimeout(() => setMrnCopied(false), 2000);
                        }
                      }}
                      title={bi('نسخ كود المريض', 'Copy MRN', 'کۆپیکردنی کۆد')}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-surface/80 hover:bg-surface border border-line-2 text-xs font-mono text-muted-foreground-1 hover:text-foreground transition-colors cursor-pointer"
                    >
                      <span className="font-bold text-foreground">{getPatientMrn(patient)}</span>
                      {mrnCopied ? (
                        <Check className="size-3 text-emerald-600" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>

                  {/* Meta Chips: Age, Gender, DOB */}
                  <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs text-muted-foreground-1 pt-0.5">
                    <div className="flex items-center gap-1">
                      <Calendar className="size-3.5 text-primary/70" />
                      <span className="font-semibold text-foreground/80">
                        {patientAge ? `${patientAge} ${bi('سنة', 'Years', 'ساڵ')}` : '—'}
                      </span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <User className="size-3.5 text-primary/70" />
                      <span className="font-semibold text-foreground/80">{genderLabel}</span>
                    </div>
                    {patient.data.dateOfBirth && (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3.5 text-primary/70" />
                          <span className="font-semibold text-foreground/80">
                            {formatClinicalDate(patient.data.dateOfBirth)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Status "نشط" placed at top without box */}
              <div className="shrink-0 pt-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 select-none">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{bi('نشط', 'Active', 'چالاک')}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pill Navigation Tabs Bar */}
        <div className="max-w-7xl mx-auto w-full">
          <div className="bg-surface/60 rounded-2xl border border-line-2 p-1 overflow-hidden">
            <div className="overflow-x-auto pr-hscroll mx-4 pb-1.5 pt-0.5">
              <div className="flex items-center gap-1.5 min-w-max">
                {navigationTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isSelected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setActiveTab(tab.id)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                      }`}
                    >
                      <Icon className="size-3.5" />
                      <span>{tab.label}</span>
                      {'count' in tab && tab.count !== undefined && (
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                            isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-surface border border-line-2 text-muted-foreground-1'
                          }`}
                        >
                          <Num value={tab.count} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        {/* Consolidated Workspace Utility Strip (Hidden on Profile tab per V-05/V-10) */}
        {activeTab !== 'profile' && activeTab !== 'history' && (
        <div
          data-testid="clinical-summary-collapsible"
          className="max-w-7xl mx-auto px-3 sm:px-4 py-2 rounded-xl bg-card shadow-2xs border border-card-line/60 space-y-2"
        >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 sm:flex-initial">
              <label htmlFor="chart-episode-select" className="text-xs font-semibold text-muted-foreground-1 whitespace-nowrap shrink-0">
                {bi('الحلقة:', 'Episode:', 'قۆناغ:')}
              </label>
              {episodes.length > 0 ? (
                <div className="min-w-[140px] flex-1 sm:flex-initial max-w-full">
                  <select
                    id="chart-episode-select"
                    value={activeEpisode?.id || ''}
                    onChange={(e) => onSelectEpisode(e.target.value)}
                    className="w-full sm:w-auto min-h-[34px] py-1 px-2.5 rounded-lg text-xs font-semibold bg-surface border border-line-2/60 hover:border-line-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 max-w-full truncate"
                  >
                  {episodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.data.title || ep.data.medicalDiagnosis} ({formatDateDDMMYYYY(ep.data.startDate || ep.startDate)})
                    </option>
                  ))}
                  </select>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground-1 font-medium">
                  {bi('بدون حلقة رعاية', 'No episode yet', 'بێ قۆناغ')}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenNewEpisode}
              className="min-h-[32px] py-1 px-2 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 cursor-pointer whitespace-nowrap transition-colors shrink-0"
            >
              {bi('+ حلقة جديدة', '+ New Episode', '+ قۆناغی نوێ')}
            </button>

            {financialSummary.totalDebtIQD > 0 && (
              <span className="py-0.5 px-2 rounded-md bg-rose-500/10 text-xs tabular-nums font-bold text-rose-700 dark:text-rose-300 whitespace-nowrap">
                {bi('ذمة: ', 'Due: ', 'ماوە: ')}
                <Money amount={financialSummary.totalDebtIQD} />
              </span>
            )}

            {enableReferralsModule && hasReferralAttribution && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  data-testid="patient-referral-pill"
                  className="inline-flex items-center gap-1 py-0.5 px-2 rounded-md bg-primary/10 text-xs font-semibold text-primary whitespace-nowrap"
                >
                  <Stethoscope className="size-3.5 shrink-0" />
                  <span>{bi('إحالة:', 'Referral:', 'ڕەوانەکردن:')}</span>
                  <span>{referralPillText}</span>
                </span>
                <button
                  type="button"
                  data-testid="open-report-back-btn"
                  onClick={() => setIsReportBackModalOpen(true)}
                  className="min-h-[32px] inline-flex items-center gap-1 py-1 px-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Send className="size-3.5 shrink-0" />
                  <span>{bi('تقرير للمحيل', 'Report Back', 'ڕاپۆرت')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Quiet Status + Compact Action Group */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              role="status"
              aria-live="polite"
              className={`text-xs font-medium inline-flex items-center gap-1 px-1.5 whitespace-nowrap ${
                isSaving || isDirty
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {isSaving ? (
                <span>{bi('حفظ...', 'Saving...', 'پاشەکەوت...')}</span>
              ) : isDirty ? (
                <span>{bi('مزامنة...', 'Auto-saving...', 'خەریکی پاشەکەوت...')}</span>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span className="hidden md:inline">
                    {bi('محفوظ تلقائياً', 'Auto-saved', 'خۆکار پاشەکەوتکرا')}
                  </span>
                  {lastSavedAt && (
                    <bdi dir="ltr" className="hidden lg:inline font-mono tabular-nums opacity-80">{lastSavedAt}</bdi>
                  )}
                </>
              )}
            </span>

            <button
              type="button"
              data-testid="open-exam-shelf-btn"
              onClick={() => setIsExamShelfModalOpen(true)}
              className="min-h-[32px] py-1 px-2.5 rounded-lg bg-surface hover:bg-layer-hover text-foreground font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Layers className="size-3.5 text-primary" />
              <span>{bi('أدوات الفحص', 'Tools', 'ئامراز')}</span>
              <span className="font-mono text-primary tabular-nums">
                <Num value={episodeStore.activeWidgetIds.length} />
              </span>
            </button>

            {activeEpisode && (
              <button
                type="button"
                onClick={onOpenNewSession}
                className="hidden sm:inline-flex min-h-[32px] py-1 px-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Plus className="size-3.5" />
                <span>{bi('جلسة جديدة', 'New Session', 'دانیشتنی نوێ')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
      )}

        {reEvalStatus.isDue && (
          <div
            data-testid="reeval-due-banner"
            className="max-w-7xl mx-auto p-3.5 sm:p-4 rounded-2xl bg-amber-500/12 border border-amber-500/35 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200"
          >
            <div className="flex items-start gap-2.5">
              <Clock className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold block">
                  {language === 'en'
                    ? reEvalStatus.reasonEn
                    : language === 'ckb'
                    ? reEvalStatus.reasonCkb
                    : reEvalStatus.reasonAr}
                </span>
                <span className="text-muted-foreground-1">
                  {bi(
                    'يمكنك تسجيل لقطة إعادة تقييم جديدة من تبويب التقدم والمقارنة.',
                    'Record a fresh Re-Evaluation Snapshot inside the Progress & Comparison tab.',
                    'دەتوانیت وێنەگرتنێکی نوێی دووبارە هەڵسەنگاندن لە تابی پێشکەوتن و بەراوردکردن تۆمار بکەیت.'
                  )}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('comparison')}
              className="min-h-[34px] px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold cursor-pointer shrink-0"
            >
              {bi('فتح مقارنة التقدم', 'Open Progress Comparison', 'کردنەوەی بەراوردی پێشکەوتن')}
            </button>
          </div>
        )}

        {/* C7: Post-Discharge 4w / 12w Follow-Up Card */}
        {enableRetentionLists &&
          (duePostDischargeItems.length > 0 || patientFollowUps.length > 0 || followUpFeedback) && (
            <div
              data-testid="post-discharge-followup-card"
              className="max-w-7xl mx-auto p-3.5 sm:p-4 rounded-2xl bg-primary/5 border border-primary/25 space-y-3 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-extrabold text-foreground">
                  <CalendarCheck2 className="size-4 text-primary shrink-0" />
                  <span>
                    {bi(
                      'متابعة ما بعد التخريج (4 أسابيع / 12 أسبوعاً)',
                      'Post-Discharge Follow-Up (4w / 12w)',
                      'بەدواداچوونی دوای دەرچوون (٤ هەفتە / ١٢ هەفتە)'
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {duePostDischargeItems.length > 0 && (
                    <span className="text-amber-700 dark:text-amber-400 font-bold tabular-nums">
                      {bi('مستحقة:', 'Due:', 'کاتەهاتوو:')} <Num value={duePostDischargeItems.length} />
                    </span>
                  )}
                  {patientFollowUps.length > 0 && (
                    <span className="text-primary font-bold tabular-nums">
                      {bi('مسجّلة:', 'Logged:', 'تۆمارکراو:')} <Num value={patientFollowUps.length} />
                    </span>
                  )}
                </div>
              </div>

              {followUpFeedback && (
                <div
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
                    followUpFeedback.kind === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  <span>{followUpFeedback.text}</span>
                  <button
                    type="button"
                    onClick={() => setFollowUpFeedback(null)}
                    className="font-bold hover:opacity-80 cursor-pointer"
                  >
                    {bi('إغلاق', 'Dismiss', 'داخستن')}
                  </button>
                </div>
              )}

              {duePostDischargeItems.length > 0 && (
                <div className="space-y-2">
                  {duePostDischargeItems.map((item) => {
                    const isEditing =
                      activeFollowUpTarget?.episodeId === item.episodeId &&
                      activeFollowUpTarget?.intervalWeeks === item.intervalWeeks;
                    const intervalBadge =
                      item.intervalWeeks === 4
                        ? bi('متابعة 4 أسابيع', '4-Week Follow-Up', 'بەدواداچوونی ٤ هەفتە')
                        : bi('متابعة 12 أسبوعاً', '12-Week Follow-Up', 'بەدواداچوونی ١٢ هەفتە');

                    return (
                      <div
                        key={`${item.episodeId}_${item.intervalWeeks}`}
                        className="p-3 rounded-xl bg-card border border-card-line space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-primary font-bold">
                                {intervalBadge}
                              </span>
                              <span className="font-bold text-foreground">{item.episodeTitle}</span>
                            </div>
                            <p className="text-xs text-muted-foreground-1">
                              {bi('تاريخ التخريج:', 'Discharged:', 'بەرواری دەرچوون:')}{' '}
                              <bdi dir="ltr" className="font-mono">
                                {formatDateDDMMYYYY(item.dischargeDate)}
                              </bdi>{' '}
                              • {bi('تاريخ الاستحقاق:', 'Due:', 'بەرواری کاتەهاتوو:')}{' '}
                              <bdi dir="ltr" className="font-mono">
                                {formatDateDDMMYYYY(item.dueDate)}
                              </bdi>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setFollowUpFeedback(null);
                              if (isEditing) {
                                setActiveFollowUpTarget(null);
                              } else {
                                setActiveFollowUpTarget({
                                  episodeId: item.episodeId,
                                  episodeTitle: item.episodeTitle,
                                  intervalWeeks: item.intervalWeeks,
                                  dischargeDate: item.dischargeDate,
                                  dueDate: item.dueDate,
                                });
                                setFollowUpNprs('');
                                setFollowUpPsfs('');
                                setFollowUpNotes('');
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold cursor-pointer shrink-0"
                          >
                            {isEditing
                              ? bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')
                              : bi('تسجيل NPRS / PSFS', 'Log NPRS / PSFS', 'تۆمارکردنی NPRS / PSFS')}
                          </button>
                        </div>

                        {isEditing && (
                          <form
                            onSubmit={handleSavePostDischargeFollowUp}
                            className="pt-2 border-t border-card-divider grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                          >
                            <div className="sm:col-span-3">
                              <label htmlFor={`followup-nprs-${item.episodeId}`} className="block text-xs font-semibold text-foreground mb-1">
                                {bi('الألم NPRS (0-10)', 'NPRS Pain (0-10)', 'ئازاری NPRS (0-10)')}
                              </label>
                              <input
                                id={`followup-nprs-${item.episodeId}`}
                                type="number"
                                min={0}
                                max={10}
                                step="any"
                                value={followUpNprs}
                                onChange={(e) => setFollowUpNprs(e.target.value)}
                                placeholder="0 - 10"
                                className="w-full px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-xs text-foreground tabular-nums focus:outline-none focus:border-primary"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label htmlFor={`followup-psfs-${item.episodeId}`} className="block text-xs font-semibold text-foreground mb-1">
                                {bi('الوظيفة PSFS (0-10)', 'PSFS Function (0-10)', 'فرمانی PSFS (0-10)')}
                              </label>
                              <input
                                id={`followup-psfs-${item.episodeId}`}
                                type="number"
                                min={0}
                                max={10}
                                step="any"
                                value={followUpPsfs}
                                onChange={(e) => setFollowUpPsfs(e.target.value)}
                                placeholder="0 - 10"
                                className="w-full px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-xs text-foreground tabular-nums focus:outline-none focus:border-primary"
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <label htmlFor={`followup-notes-${item.episodeId}`} className="block text-xs font-semibold text-foreground mb-1">
                                {bi('ملاحظات المتابعة', 'Follow-Up Notes', 'تێبینییەکانی بەدواداچوون')}
                              </label>
                              <input
                                id={`followup-notes-${item.episodeId}`}
                                type="text"
                                value={followUpNotes}
                                onChange={(e) => setFollowUpNotes(e.target.value)}
                                placeholder={bi(
                                  'مستوى التحسن، الانتكاس، توصية...',
                                  'Recovery status, flare-up, advice...',
                                  'ئاستی چاکبوونەوە، گەڕانەوە، ڕاسپاردە...'
                                )}
                                className="w-full px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <button
                                type="submit"
                                className="w-full min-h-[36px] py-1.5 px-3 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
                              >
                                {bi('حفظ', 'Save', 'پاشەکەوتکردن')}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {patientFollowUps.length > 0 && (
                <div className="pt-1 space-y-1.5">
                  <div className="text-xs font-bold text-foreground">
                    {bi('سجل المتابعات السابقة:', 'Recorded Follow-Up History:', 'تۆماری بەدواداچوونەکانی پێشوو:')}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {patientFollowUps.slice(0, 6).map((rec) => {
                      const epTitle =
                        episodes.find((ep) => ep.id === rec.episodeId)?.data.title ||
                        episodes.find((ep) => ep.id === rec.episodeId)?.data.medicalDiagnosis;
                      return (
                        <div
                          key={rec.id}
                          className="p-2.5 rounded-xl bg-card border border-card-line flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-bold text-foreground">
                              <span className="text-emerald-700 dark:text-emerald-400">
                                {rec.intervalWeeks === 4
                                  ? bi('4 أسابيع', '4w', '٤ هەفتە')
                                  : bi('12 أسبوعاً', '12w', '١٢ هەفتە')}
                              </span>
                              {epTitle && <span className="truncate max-w-[180px]">{epTitle}</span>}
                            </div>
                            {rec.notes && (
                              <p className="text-xs text-muted-foreground-1">{rec.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 tabular-nums font-semibold text-foreground">
                            {rec.nprsScore !== undefined && (
                              <span className="px-2 py-0.5 rounded-md bg-layer border border-layer-line">
                                NPRS: {rec.nprsScore}/10
                              </span>
                            )}
                            {rec.psfsScore !== undefined && (
                              <span className="px-2 py-0.5 rounded-md bg-layer border border-layer-line">
                                PSFS: {rec.psfsScore}/10
                              </span>
                            )}
                            <span className="text-muted-foreground-1 font-mono">
                              {formatDateDDMMYYYY(rec.recordedAt)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        {/* TAB 1: EPISODE-SCOPED INITIAL EVALUATION & INTERACTIVE WIDGETS */}
        
        {/* TAB 0: OVERVIEW (Matching User Image media_1794843103766_1ad13515.jpg) */}
        {activeTab === 'overview' && (
          <div className="max-w-7xl mx-auto space-y-4">
            {/* 3 Metric Cards */}
            <div className="grid grid-cols-3 gap-3">
              {/* Age Card */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-card-line shadow-2xs flex flex-col items-center justify-center text-center gap-1">
                <div className="size-9 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center mb-0.5">
                  <Calendar className="size-4.5" />
                </div>
                <span className="text-xl sm:text-2xl font-black text-foreground tabular-nums">
                  {patientAge ? <Num value={patientAge} /> : '—'}
                </span>
                <span className="text-xs text-muted-foreground-1 font-medium">
                  {bi('سنة', 'Years', 'ساڵ')}
                </span>
              </div>

              {/* Gender Card */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-card-line shadow-2xs flex flex-col items-center justify-center text-center gap-1">
                <div className="size-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center mb-0.5">
                  <User className="size-4.5" />
                </div>
                <span className="text-base sm:text-lg font-bold text-foreground">
                  {genderLabel}
                </span>
                <span className="text-xs text-muted-foreground-1 font-medium">
                  {bi('الجنس', 'Gender', 'ڕەگەز')}
                </span>
              </div>

              {/* Status Card */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-card border border-card-line shadow-2xs flex flex-col items-center justify-center text-center gap-1">
                <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-0.5">
                  <ShieldCheck className="size-4.5" />
                </div>
                <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  {bi('نشط', 'Active', 'چالاک')}
                </span>
                <span className="text-xs text-muted-foreground-1 font-medium">
                  {bi('الحالة', 'Status', 'دۆخ')}
                </span>
              </div>
            </div>

            {/* Interactive Grid Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Card 1: Personal Information */}
              <div
                onClick={() => setIsEditPersonalInfoOpen(true)}
                className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3.5 group overflow-hidden"
              >
                {/* Top Bookmark Ribbon */}
                <div className="absolute top-0 end-5 z-10">
                  <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
                    <Edit3 className="size-3 text-white" />
                    <span>{bi('تعديل', 'Edit', 'دەستکاری')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <User className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">
                    {bi('المعلومات الشخصية', 'Personal Information', 'زانیاری کەسی')}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div className="space-y-1">
                    <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
                      <User className="size-3 text-muted-foreground-1" />
                      {bi('الاسم الكامل', 'Full Name', 'ناوی تەواو')}
                    </span>
                    <span className="font-bold text-foreground block truncate">
                      {getPatientDisplayName(patient.data, language)}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
                      <Phone className="size-3 text-muted-foreground-1" />
                      {bi('رقم الهاتف', 'Phone', 'ژمارەی تەلەفۆن')}
                    </span>
                    <span className="font-bold text-foreground block dir-ltr text-right truncate">
                      {patient.data.phone ? formatIraqiPhoneDisplay(patient.data.phone) : '—'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
                      <Calendar className="size-3 text-muted-foreground-1" />
                      {bi('تاريخ الميلاد', 'Date of Birth', 'بەرواری لەدایکبوون')}
                    </span>
                    <span className="font-bold text-foreground block">
                      {patient.data.dateOfBirth ? formatClinicalDate(patient.data.dateOfBirth) : '—'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
                      <MapPin className="size-3 text-muted-foreground-1" />
                      {bi('العنوان والمدينة', 'Address', 'ناونیشان')}
                    </span>
                    <span className="font-bold text-foreground block truncate">
                      {patient.data.address || bi('بغداد، العراق', 'Baghdad, Iraq', 'بەغدا، عێراق')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Clinical Summary */}
              <div
                onClick={() => setIsEditClinicalSummaryOpen(true)}
                className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3.5 group overflow-hidden"
              >
                {/* Top Bookmark Ribbon */}
                <div className="absolute top-0 end-5 z-10">
                  <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
                    <Edit3 className="size-3 text-white" />
                    <span>{bi('عرض وتعديل', 'View & Edit', 'بینین و دەستکاری')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
                    <Stethoscope className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">
                    {bi('ملخص الحالة السريرية', 'Clinical Summary', 'پوختەی کلینیکی')}
                  </h3>
                </div>

                <div className="flex items-start gap-3.5 pt-1">
                  <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-sky-500/20 border border-primary/20 flex items-center justify-center shrink-0 text-primary">
                    <Activity className="size-7" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div>
                      <h4 className="text-sm font-bold text-foreground truncate">
                        {activeEpisode?.data.title || activeEpisode?.data.medicalDiagnosis || episodeStore.chiefComplaint || bi('علاج تأهيلي', 'Physical Rehabilitation', 'چارەسەری سروشتی')}
                      </h4>
                      <p className="text-xs text-muted-foreground-1 truncate">
                        {episodeStore.clinicalImpression || activeEpisode?.data.medicalDiagnosis || bi('تشخيص سريري معتمد', 'Clinical Impression', 'دەستنیشانکردنی کلینیکی')}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-foreground/90 font-medium">
                      <Target className="size-3.5 text-primary shrink-0" />
                      <span className="truncate">
                        {episodeStore.patientPersonalGoals || bi('تقليل الألم واستعادة المدى الحركي', 'Reduce pain and improve ROM', 'کەمکردنەوەی ئازار و باشترکردنی جووڵە')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: MMT (Muscle Strength) */}
              <div
                onClick={() => setIsMmtModalOpen(true)}
                className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3 group overflow-hidden"
              >
                {/* Top Bookmark Ribbon */}
                <div className="absolute top-0 end-5 z-10">
                  <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
                    <Edit3 className="size-3 text-white" />
                    <span>{bi('عرض وتعديل', 'View & Edit', 'بینین و دەستکاری')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Dumbbell className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">
                    {bi('القوة العضلية (MMT)', 'Muscle Testing (MMT)', 'هێزی ماسولکەکان')}
                  </h3>
                </div>

                <div className="pt-1">
                  {episodeStore.objective?.mmtBattery?.entries && episodeStore.objective.mmtBattery.entries.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="pr-hscroll overflow-x-auto flex items-center gap-2 whitespace-nowrap pb-1.5 pt-0.5 px-0.5">
                        {episodeStore.objective.mmtBattery.entries.slice(0, 3).map((entry: any, idx: number) => {
                          const muscleLabel = bi(
                            entry.label || entry.muscleNameAr || entry.actionNameAr || 'عضلة',
                            entry.label || entry.muscleNameEn || entry.actionNameEn || 'Muscle'
                          );
                          const side = entry.laterality === 'right' ? bi('(يمين)', '(R)') : entry.laterality === 'left' ? bi('(يسار)', '(L)') : '';
                          const grade = entry.gradeValue ?? entry.grade ?? '—';
                          return (
                            <span key={idx} className="px-2.5 py-1 rounded-lg bg-surface border border-line-2 text-xs font-semibold flex items-center gap-1.5">
                              <span className="text-foreground">{muscleLabel} {side}:</span>
                              <strong className="text-primary font-bold tabular-nums">{grade}/5</strong>
                            </span>
                          );
                        })}
                        {episodeStore.objective.mmtBattery.entries.length > 3 && (
                          <span className="px-2 py-1 text-xs text-muted-foreground-1 font-medium">
                            +{episodeStore.objective.mmtBattery.entries.length - 3} {bi('عضلات أخرى', 'more', 'زیاتر')}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-muted-foreground-1 py-1">
                      <span>{bi('لم يتم تسجيل قياسات قوة عضلية بعد', 'No MMT recorded yet', 'هێشتا تۆمار نەکراوە')}</span>
                      <span className="text-primary font-bold">+ {bi('إضافة فحص', 'Add Test', 'زیادکردن')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: ROM (Range of Motion) */}
              <div
                onClick={() => setIsRomModalOpen(true)}
                className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3 group overflow-hidden"
              >
                {/* Top Bookmark Ribbon */}
                <div className="absolute top-0 end-5 z-10">
                  <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
                    <Edit3 className="size-3 text-white" />
                    <span>{bi('عرض وتعديل', 'View & Edit', 'بینین و دەستکاری')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-cyan-500/10 text-cyan-600 flex items-center justify-center">
                    <Gauge className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">
                    {bi('المدى الحركي للمفاصل (ROM)', 'Range of Motion (ROM)', 'مەودای جووڵە')}
                  </h3>
                </div>

                <div className="pt-1">
                  {episodeStore.objective?.romBattery?.entries && episodeStore.objective.romBattery.entries.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="pr-hscroll overflow-x-auto flex items-center gap-2 whitespace-nowrap pb-1.5 pt-0.5 px-0.5">
                        {episodeStore.objective.romBattery.entries.slice(0, 3).map((entry: any, idx: number) => {
                          const jointLabel = bi(
                            `${entry.jointNameAr || ''} ${entry.movementNameAr ? `(${entry.movementNameAr})` : ''}`.trim() || entry.label || 'مفصل',
                            `${entry.jointNameEn || ''} ${entry.movementNameEn ? `(${entry.movementNameEn})` : ''}`.trim() || entry.label || 'Joint'
                          );
                          const side = entry.laterality === 'right' ? bi('يمين', 'R') : entry.laterality === 'left' ? bi('يسار', 'L') : '';
                          const angle = entry.measuredAngleDegrees ?? entry.activeDegrees ?? entry.passiveDegrees;
                          return (
                            <span key={idx} className="px-2.5 py-1 rounded-lg bg-surface border border-line-2 text-xs font-semibold flex items-center gap-1.5">
                              <span className="text-foreground">{jointLabel} {side ? `(${side})` : ''}:</span>
                              <strong className="text-primary font-bold tabular-nums">{angle !== undefined && angle !== null ? `${angle}°` : '—'}</strong>
                            </span>
                          );
                        })}
                        {episodeStore.objective.romBattery.entries.length > 3 && (
                          <span className="px-2 py-1 text-xs text-muted-foreground-1 font-medium">
                            +{episodeStore.objective.romBattery.entries.length - 3} {bi('حركات أخرى', 'more', 'زیاتر')}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-muted-foreground-1 py-1">
                      <span>{bi('لم يتم توثيق مدى حركي للمفاصل بعد', 'No ROM recorded yet', 'هێشتا تۆمار نەکراوە')}</span>
                      <span className="text-primary font-bold">+ {bi('إضافة قياس', 'Add Joint', 'زیادکردن')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 5: Neuro Screening */}
              <div
                onClick={() => setIsNeuroModalOpen(true)}
                className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3 group overflow-hidden"
              >
                {/* Top Bookmark Ribbon */}
                <div className="absolute top-0 end-5 z-10">
                  <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
                    <Edit3 className="size-3 text-white" />
                    <span>{bi('عرض وتعديل', 'View & Edit', 'بینین و دەستکاری')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center">
                    <Zap className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">
                    {bi('الفحص العصبي (Neuro)', 'Neurological Screening', 'پشکنینی دەماری')}
                  </h3>
                </div>

                <div className="pt-1">
                  {episodeStore.objective?.neuroScreening?.dermatomes || episodeStore.objective?.neuroScreening?.reflexes ? (
                    <div className="text-xs text-foreground flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-surface border border-line-2 font-semibold">
                        {bi('إحساس الجلد (Dermatomes)', 'Dermatomes', 'دەمارە هەستەوەرەکان')}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-surface border border-line-2 font-semibold">
                        {bi('المنعكسات (Reflexes)', 'Reflexes', 'ڕەفڵەکس')}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-muted-foreground-1 py-1">
                      <span>{bi('لم يتم توثيق الفحص العصبي بعد', 'No Neuro screening yet', 'هێشتا تۆمار نەکراوە')}</span>
                      <span className="text-primary font-bold">+ {bi('فحص عصبي', 'Screen', 'پشکنین')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 6: Special Tests & Scales */}
              <div
                onClick={() => setIsSpecialTestsModalOpen(true)}
                className="relative p-4 sm:p-5 pt-6 rounded-2xl bg-card border border-card-line shadow-2xs hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer space-y-3 group overflow-hidden"
              >
                {/* Top Bookmark Ribbon */}
                <div className="absolute top-0 end-5 z-10">
                  <div className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-b-xl shadow-xs flex items-center gap-1 cursor-pointer hover:bg-primary/90 transition-transform active:scale-95">
                    <Edit3 className="size-3 text-white" />
                    <span>{bi('عرض وتعديل', 'View & Edit', 'بینین و دەستکاری')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
                    <Award className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">
                    {bi('الفحوصات الخاصة والمقاييس', 'Special Tests & Scales', 'پشکنینە تایبەتەکان و پێوەرەکان')}
                  </h3>
                </div>

                <div className="pt-1">
                  {episodeStore.specialTests && episodeStore.specialTests.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {episodeStore.specialTests.slice(0, 3).map((test, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${
                            test.outcome === 'positive'
                              ? 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-400'
                              : 'bg-surface border-line-2 text-foreground'
                          }`}
                        >
                          {bi(test.nameAr, test.nameEn)}: {test.outcome === 'positive' ? bi('إيجابي (+)', 'Positive (+)', 'پۆزەتیڤ') : bi('سلبي (-)', 'Negative (-)', 'نێگەتیڤ')}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-muted-foreground-1 py-1">
                      <span>{bi('لا توجد فحوصات خاصة موثقة', 'No special tests recorded', 'هیچ پشکنینێک تۆمار نەکراوە')}</span>
                      <span className="text-primary font-bold">+ {bi('إضافة فحص', 'Add Test', 'زیادکردن')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 7: Recent Sessions */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3 md:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                      <CalendarCheck2 className="size-4" />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">
                      {bi('الجلسات الأخيرة', 'Recent Sessions', 'دانیشتنە نوێیەکان')}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sessions')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    <span>{bi('عرض الكل', 'View All', 'هەموو')}</span>
                    <ChevronLeft className="size-3.5 rtl:rotate-0 ltr:rotate-180" />
                  </button>
                </div>

                <div className="pt-1">
                  {episodeSessions.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {episodeSessions.slice(-2).reverse().map((sess) => {
                        const isCompleted = sess.data.status === 'finalized';
                        return (
                          <div
                            key={sess.id}
                            onClick={() => onOpenSession(sess.id)}
                            className="p-3 rounded-xl bg-surface/70 border border-card-line hover:border-primary/30 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
                                isCompleted ? 'bg-emerald-500/15 text-emerald-600' : 'bg-primary/10 text-primary'
                              }`}>
                                <CheckCircle2 className="size-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-foreground truncate">
                                  {bi('جلسة', 'Session', 'دانیشتن')} #{sess.data.sessionNumber || 1}
                                </div>
                                <div className="text-[11px] text-muted-foreground-1 flex items-center gap-1.5 tabular-nums">
                                  <span>{formatClinicalDate(sess.data.sessionDate)}</span>
                                  <span>•</span>
                                  <span>{sess.data.sessionDurationMinutes || 45} {bi('دقيقة', 'min', 'خولەک')}</span>
                                </div>
                              </div>
                            </div>

                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                              isCompleted
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-primary/15 text-primary border border-primary/30'
                            }`}>
                              {isCompleted ? bi('مكتملة', 'Completed', 'تەواوکراو') : bi('مسودة', 'Draft', 'ڕەشنووس')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-xs text-muted-foreground-1">
                      <p>{bi('لا توجد جلسات مسجلة لهذه الحلقة بعد', 'No sessions recorded yet for this episode', 'هیچ دانیشتنێک تۆمار نەکراوە')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'evaluation' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Phase B1 (ESSENTIAL): One-Tap CC0-1.0 Regional Exam Presets */}
            <Suspense fallback={null}>
              <ExamPresetBar
                episodeStore={episodeStore}
                onApplyStore={(next) => {
                  setEpisodeStore(next);
                  ClinicOperationsService.saveEpisodeClinicalStore(next);
                }}
              />
            </Suspense>

            {/* Phase B2: Episode Problem List & Outcome-Linked Goals */}
            {enableProblemListGoals && (
              <Suspense fallback={null}>
                <EpisodeProblemListGoalsPanel
                  episodeStore={episodeStore}
                  onUpdateStore={(patch) => {
                    const next = { ...episodeStore, ...patch };
                    setEpisodeStore(next);
                    ClinicOperationsService.saveEpisodeClinicalStore(next);
                  }}
                />
              </Suspense>
            )}
            {/* Structured Initial Evaluation Subjective & Objective Intake Card */}
            <div className="p-5 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
              <div className="border-b border-card-divider pb-3.5">
                <h2 className="text-sm font-bold text-foreground">
                  {bi(
                    'التقييم السريري المهيكل لحلقة الرعاية',
                    'Episode-Scoped Subjective & Objective Clinical Evaluation',
                    'هەڵسەنگاندنی کلینیکی پێکهاتەدار بۆ قۆناغی چاودێری'
                  )}
                </h2>
              </div>

              {/* Pain NPRS Segmented Controls (Rest / Activity / Worst 24h) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-surface p-3.5 rounded-xl border border-line-2">
                <NprsControl
                  value={episodeStore.painAtRestNrs}
                  onChange={(val) => updateEpisodeField('painAtRestNrs', val ?? 0)}
                  label={bi('ألم الراحة (NPRS)', 'Pain at Rest (NPRS)', 'ئازار لە کاتی پشوو (NPRS)')}
                />
                <NprsControl
                  value={episodeStore.painOnActivityNrs}
                  onChange={(val) => updateEpisodeField('painOnActivityNrs', val ?? 0)}
                  label={bi('الألم مع الحركة (NPRS)', 'Pain on Activity (NPRS)', 'ئازار لە کاتی جوڵە (NPRS)')}
                />
                <NprsControl
                  value={episodeStore.painWorst24hNrs}
                  onChange={(val) => updateEpisodeField('painWorst24hNrs', val ?? 0)}
                  label={bi('أقصى ألم خلال 24 ساعة (NPRS)', 'Worst 24h Pain (NPRS)', 'توندترین ئازار لە ٢٤ کاتژمێردا (NPRS)')}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="eval-chief-complaint" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('الشكوى الرئيسية للمريض:', 'Chief Complaint:', 'سکاڵای سەرەکی نەخۆش:')}
                  </label>
                  <AutoResizeTextarea
                    id="eval-chief-complaint"
                    minRows={2}
                    value={episodeStore.chiefComplaint}
                    onChange={(e) => updateEpisodeField('chiefComplaint', e.target.value)}
                    placeholder={bi(
                      'مثال: ألم حاد أسفل الظهر يمتد للساق اليمنى...',
                      'e.g., Sharp low back pain radiating to right leg...',
                      'نموونە: ئازارێکی تیژی خوارەوەی پشت کە بەرەو قاچی ڕاست دەڕوات...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="eval-hpi" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('آلية الإصابة وتاريخ الحالة:', 'Mechanism of Injury & HPI:', 'میکانیزمی برینداری و مێژووی حاڵەت:')}
                  </label>
                  <AutoResizeTextarea
                    id="eval-hpi"
                    minRows={2}
                    value={episodeStore.historyOfPresentIllness}
                    onChange={(e) =>
                      updateEpisodeField('historyOfPresentIllness', e.target.value)
                    }
                    placeholder={bi(
                      'مثال: بدأ بعد رفع جسم ثقيل قبل 3 أسابيع...',
                      'e.g., Onset 3 weeks ago after heavy lifting...',
                      'نموونە: ٣ هەفتە لەمەوبەر دوای هەڵگرتنی شتێکی قورس دەستی پێکرد...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="eval-pain-nature" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('طبيعة الألم وانتشاره:', 'Pain Quality & Pattern:', 'جۆر و بڵاوبوونەوەی ئازار:')}
                  </label>
                  <AutoResizeTextarea
                    id="eval-pain-nature"
                    minRows={2}
                    value={episodeStore.painNature}
                    onChange={(e) => updateEpisodeField('painNature', e.target.value)}
                    placeholder={bi(
                      'حارق / جذري / يزداد صباحاً...',
                      'Shooting, aching, worse in morning...',
                      'سووتێنەر / ڕەگی / بەیانیان زیاترە...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="eval-aggravating" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('العوامل المهيجة للألم:', 'Aggravating Factors:', 'هۆکارە زیادکەرەکانی ئازار:')}
                  </label>
                  <AutoResizeTextarea
                    id="eval-aggravating"
                    minRows={2}
                    value={episodeStore.aggravatingFactors}
                    onChange={(e) => updateEpisodeField('aggravatingFactors', e.target.value)}
                    placeholder={bi(
                      'مثال: الجلوس لأكثر من 20 دقيقة، الانحناء للأمام، صعود الدرج...',
                      'e.g., Sitting > 20m, forward flexion, stairs...',
                      'نموونە: دانیشتن زیاتر لە ٢٠ خولەک، چەمانەوە بۆ پێشەوە، سەرکەوتنی پلیکانە...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="eval-relieving" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('العوامل المخففة للألم:', 'Relieving Factors:', 'هۆکارە کەمکەرەوەکانی ئازار:')}
                  </label>
                  <AutoResizeTextarea
                    id="eval-relieving"
                    minRows={2}
                    value={episodeStore.relievingFactors}
                    onChange={(e) => updateEpisodeField('relievingFactors', e.target.value)}
                    placeholder={bi(
                      'مثال: الاستلقاء على الظهر، المشي الخفيف، الكمادات الدافئة...',
                      'e.g., Supine lying, gentle walking, heat...',
                      'نموونە: پاڵکەوتن لەسەر پشت، پیاسەکردنی سووك، گەرمی...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="eval-palpation" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('الجس والملاحظة السريرية:', 'Observation & Palpation:', 'تێبینی کلینیکی و دەستلێدان (Palpation):')}
                  </label>
                  <AutoResizeTextarea
                    id="eval-palpation"
                    minRows={2}
                    value={episodeStore.palpationFindings}
                    onChange={(e) => updateEpisodeField('palpationFindings', e.target.value)}
                    placeholder={bi(
                      'مثال: إيلام موضعي على L4-L5، تشنج العضلات جانب الفقار...',
                      'e.g., Tenderness over L4 spinous process, paraspinal spasm...',
                      'نموونە: ئازاری ناوچەیی لەسەر L4-L5، گرژبوونی ماسولکەکانی تەنیشت بڕبڕە...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            {/* Active Examination Canvas Scoped to this Episode */}
            <Suspense
              fallback={
                <div className="p-6 rounded-2xl bg-card border border-card-line text-center text-xs text-muted-foreground-1">
                  {bi('جاري تحميل أدوات الفحص...', 'Loading assessment tools...', 'ئامرازەکانی پشکنین بار دەکرێن...')}
                </div>
              }
            >
              <ActiveExamCanvas
                key={effectiveEpisodeId}
                activeWidgetIds={episodeStore.activeWidgetIds}
                onRemoveWidget={handleRemoveWidget}
                onAddWidget={handleAddWidget}
                onOpenExamShelf={() => setIsExamShelfModalOpen(true)}
                bodyChart={episodeStore.bodyChart}
                onBodyChartChange={(val) => updateEpisodeField('bodyChart', val)}
                objective={episodeStore.objective}
                onObjectiveChange={(val) => updateEpisodeField('objective', val)}
                specialTests={episodeStore.specialTests}
                onSpecialTestsChange={(val) => updateEpisodeField('specialTests', val)}
                gaitPosture={episodeStore.gaitPosture}
                onGaitPostureChange={(val) => updateEpisodeField('gaitPosture', val)}
                functionalScales={episodeStore.functionalScales}
                onFunctionalScalesChange={(val) => updateEpisodeField('functionalScales', val)}
                customWidgetsData={episodeStore.customWidgetsData}
                onCustomWidgetsDataChange={(val) => updateEpisodeField('customWidgetsData', val)}
                performanceTests={episodeStore.performanceTests || []}
                onPerformanceTestsChange={(list) => updateEpisodeField('performanceTests', list)}
                patientAge={computePatientAge(patient.data.dateOfBirth, patient.data.age)}
                patientGender={patient.data.gender}
                enablePerformanceTestLibrary={enablePerformanceTestLibrary}
              />

              {/* Phase B7: Baseline Vitals & Trend Mini-Chart */}
              {enableVitalsModule && (
                <VitalsPanel
                  value={episodeStore.objective?.vitals}
                  history={episodeStore.vitalsHistory || []}
                  onChange={(v) =>
                    updateEpisodeField('objective', {
                      ...episodeStore.objective,
                      vitals: v,
                    })
                  }
                />
              )}
            </Suspense>
          </div>
        )}

        {/* TAB 2: LONGITUDINAL COMPARISON MATRIX & CLINICAL PROGRESS CHARTS */}
        {activeTab === 'comparison' && (
          <div className="max-w-7xl mx-auto space-y-6">
            <Suspense
              fallback={
                <div className="p-8 rounded-2xl bg-card border border-card-line text-center text-xs text-muted-foreground-1">
                  {bi('جاري تحميل مصفوفة التقدم...', 'Loading progress analytics...', 'شیکارییەکانی پێشکەوتن بار دەکرێن...')}
                </div>
              }
            >
              <LongitudinalComparisonView
                episodeStore={episodeStore}
                episodeTitle={
                  activeEpisode?.data.title ||
                  activeEpisode?.data.medicalDiagnosis ||
                  bi('حلقة الرعاية النشطة', 'Active Episode', 'قۆناغی چاودێری چالاک')
                }
                onSnapshotAdded={(updatedStore) => setEpisodeStore(updatedStore)}
              />

              <OrganClinicalCharts
                sessions={episodeSessions}
                masterObjective={episodeStore.objective}
                sessionPainPoints={sessionPainPoints}
                functionalScales={episodeStore.functionalScales}
                snapshots={episodeStore.snapshots}
              />
            </Suspense>
          </div>
        )}

        {/* TAB 3: GOALS, PLAN OF CARE, HEP BUILDER & DISCHARGE SUMMARY */}
        {(activeTab === 'treatment' || activeTab === 'hep') && (
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Clinical Impression, Plan of Care & Goals Card */}
            <div className="p-5 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-divider pb-3">
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    {bi(
                      'الانطباع السريري، خطة الرعاية، والأهداف التأهيلية',
                      'Clinical Impression, Plan of Care & Rehabilitation Goals',
                      'تێگەیشتنی کلینیکی، پلانی چاودێری و ئامانجەکانی ڕاهێنانەوە'
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground-1">
                    {activeEpisode
                      ? `${activeEpisode.data.title || activeEpisode.data.medicalDiagnosis}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="hep-treatment-frequency" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('معدل تكرار الجلسات:', 'Treatment Frequency:', 'ڕێژەی دووبارەبوونەوەی دانیشتنەکان:')}
                  </label>
                  <input
                    id="hep-treatment-frequency"
                    type="text"
                    value={episodeStore.treatmentFrequency}
                    onChange={(e) => updateEpisodeField('treatmentFrequency', e.target.value)}
                    placeholder={bi('3 جلسات أسبوعياً', '3 sessions / week', '٣ دانیشتن لە هەفتەیەکدا')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="hep-planned-duration" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('المدة المتوقعة للخطة (بالأسابيع):', 'Planned Duration (Weeks):', 'ماوەی پێشبینیکراو (بە هەفتە):')}
                  </label>
                  <input
                    id="hep-planned-duration"
                    type="number"
                    value={episodeStore.plannedDurationWeeks}
                    onChange={(e) =>
                      updateEpisodeField('plannedDurationWeeks', Number(e.target.value))
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground tabular-nums focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="hep-personal-goals" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('أهداف المريض الوظيفية والشخصية:', 'Patient Functional Goals:', 'ئامانجە فرمانی و کەسییەکانی نەخۆش:')}
                  </label>
                  <input
                    id="hep-personal-goals"
                    type="text"
                    value={episodeStore.patientPersonalGoals}
                    onChange={(e) =>
                      updateEpisodeField('patientPersonalGoals', e.target.value)
                    }
                    placeholder={bi(
                      'مثال: العودة لممارسة كرة القدم، الصلاة بدون ألم...',
                      'e.g., Return to sport, pain-free daily activities...',
                      'نموونە: گەڕانەوە بۆ وەرزش، چالاکی ڕۆژانە بەبێ ئازار...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Optional SMART Goals & GAS (-2..+2) Module (3.3 / R6) */}
              <Suspense fallback={null}>
                <SmartGoalsGasPanel
                  goals={
                    episodeStore.smartGoals && episodeStore.smartGoals.length > 0
                      ? episodeStore.smartGoals
                      : activeEpisode?.data.structuredGoals || []
                  }
                  onChange={(next) => updateEpisodeField('smartGoals', next)}
                />
              </Suspense>

              <div>
                <label htmlFor="hep-clinical-impression" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi(
                    'الانطباع السريري والتشخيص الوظيفي وملخص التخريج:',
                    'Clinical Impression & Discharge Summary:',
                    'تێگەیشتنی کلینیکی، دەستنیشانکردنی فرمانی و پوختەی دەرچوون:'
                  )}
                </label>
                <AutoResizeTextarea
                  id="hep-clinical-impression"
                  minRows={2}
                  value={episodeStore.clinicalImpression}
                  onChange={(e) => updateEpisodeField('clinicalImpression', e.target.value)}
                  placeholder={bi(
                    'تفسير الفحص السريري، المشكلات الوظيفية المحددة، ومعايير التخريج...',
                    'Clinical synthesis, functional deficits, and discharge criteria...',
                    'لێکدانەوەی پشکنینی کلینیکی، کێشە فرمانییەکان و پێوەرەکانی دەرچوون...'
                  )}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Embedded Searchable Exercise Library & HEP Builder for this Episode (Preserved when hidden) */}
            {showExerciseLibrary && (
              <Suspense
                fallback={
                  <div className="p-6 rounded-2xl bg-card border border-card-line text-center text-xs text-muted-foreground-1">
                    {bi('جاري تحميل برنامج التمارين...', 'Loading exercise program...', 'بەرنامەی ڕاهێنانەکان بار دەکرێت...')}
                  </div>
                }
              >
                <ExerciseLibraryHepView
                  embeddedHepProgram={episodeStore.hepProgram}
                  onUpdateEmbeddedHep={(updatedHep) =>
                    updateEpisodeField('hepProgram', updatedHep)
                  }
                  patient={patient}
                  patientName={patient.data.fullNameAr || patient.data.fullName}
                  patientPhone={patient.data.phoneNumber || patient.data.phone || ''}
                  episode={activeEpisode}
                  episodeTitle={
                    activeEpisode?.data.title || activeEpisode?.data.medicalDiagnosis
                  }
                />
              </Suspense>
            )}
          </div>
        )}

        {/* TAB 4: TREATMENT SESSIONS LOG */}
        {activeTab === 'sessions' && (
          <div className="max-w-5xl mx-auto space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  {bi(
                    'سجل الجلسات العلاجية لحلقة الرعاية الحالية:',
                    'Episode Treatment Sessions:',
                    'تۆماری دانیشتنە چارەسەرییەکانی قۆناغی چاودێری ئێستا:'
                  )}
                </h2>
                <p className="text-xs text-muted-foreground-1">
                  {bi(
                    'افتح أي جلسة لتوثيق جدول التمارين اليومي، العلاج اليدوي، والأجهزة.',
                    'Click any session to open its structured Exercise & Modality Flowsheet.',
                    'هەر دانیشتنێک بکەرەوە بۆ تۆمارکردنی خشتەی ڕاهێنانی ڕۆژانە، چارەسەری دەستی و ئامێرەکان.'
                  )}
                </p>
              </div>

              {activeEpisode && (
                <button
                  type="button"
                  onClick={onOpenNewSession}
                  className="min-h-[36px] py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs inline-flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <Plus className="size-4" />
                  <span>{bi('بدء جلسة علاجية جديدة', 'New Treatment Session', 'دەستپێکردنی دانیشتنێکی چارەسەری نوێ')}</span>
                </button>
              )}
            </div>

            {/* Weekly Recurring Session Days Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Repeat className="size-4 text-primary" />
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">
                    {bi(
                      'مواعيد الجلسات الأسبوعية (إضافة تلقائية للطابور)',
                      'Weekly Recurring Sessions (Auto-Queue)',
                      'کاتی دانیشتنە هەفتانەکان (زیادکردنی خۆکار بۆ ڕیز)'
                    )}
                  </h3>
                  <span className="py-0.5 px-2 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary tabular-nums">
                    <Num value={patientRecurringRules.length} />
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowRecurringForm(!showRecurringForm)}
                  className="min-h-[36px] py-1.5 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {showRecurringForm
                    ? bi('إغلاق النموذج', 'Close Form', 'داخستنی فۆرم')
                    : bi('+ تحديد أيام أسبوعية', '+ Set Weekly Days', '+ دیاریکردنی ڕۆژە هەفتانەکان')}
                </button>
              </div>

              {showRecurringForm && (
                <form
                  onSubmit={handleSavePatientRecurring}
                  className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground">
                      {bi('اختر أيام الحضور الأسبوعية:', 'Select Weekly Session Days:', 'ڕۆژەکانی ئامادەبوونی هەفتانە هەڵبژێرە:')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setRecWeekdays([0, 2, 4])}
                        className="min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold bg-card border border-line-2 text-primary hover:bg-primary/10 cursor-pointer"
                      >
                        {bi('أحد · ثلاثاء · خميس', 'Sun · Tue · Thu', 'یەکشەممە · سێشەممە · پێنجشەممە')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecWeekdays([6, 1, 3])}
                        className="min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold bg-card border border-line-2 text-primary hover:bg-primary/10 cursor-pointer"
                      >
                        {bi('سبت · إثنين · أربعاء', 'Sat · Mon · Wed', 'شەممە · دووشەممە · چوارشەممە')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                    {WEEKDAYS_IRAQI_ORDER.map((day) => {
                      const activeDay = recWeekdays.includes(day.index);
                      return (
                        <button
                          key={day.index}
                          type="button"
                          onClick={() => handleToggleRecWeekday(day.index)}
                          className={`min-h-[36px] py-2 px-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer text-center ${
                            activeDay
                              ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                              : 'bg-card text-foreground border-layer-line hover:bg-layer-hover'
                          }`}
                        >
                          {bi(day.ar, day.shortEn, day.ckb)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="rec-start-time" className="text-xs font-semibold text-foreground block mb-1">
                        {bi('وقت الجلسة:', 'Session Time:', 'کاتی دانیشتن:')}
                      </label>
                      <TimePickerInput id="rec-start-time" value={recStartTime} onChange={setRecStartTime} />
                    </div>
                    <div>
                      <label htmlFor="rec-start-date" className="text-xs font-semibold text-foreground block mb-1">
                        {bi('يبدأ من تاريخ:', 'Starts On:', 'دەستپێدەکات لە بەرواری:')}
                      </label>
                      <DatePickerInput id="rec-start-date" value={recStartDate} onChange={setRecStartDate} />
                    </div>
                    <div>
                      <label htmlFor="rec-custom-duration" className="text-xs font-semibold text-foreground block mb-1">
                        {bi('المدة (بالدقائق):', 'Duration (min):', 'ماوە (بە خولەک):')}
                      </label>
                      <div className="grid grid-cols-4 gap-1" dir="ltr">
                        {([30, 45, 60] as const).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setRecCustomDurationMode(false);
                              setRecDuration(preset);
                            }}
                            className={`min-h-[36px] py-2 rounded-xl text-xs font-mono font-bold border transition-colors cursor-pointer ${
                              !recCustomDurationMode && recDuration === preset
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-card text-foreground border-layer-line'
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setRecCustomDurationMode(true);
                            setRecCustomDurationDraft(String(recDuration || 45));
                          }}
                          className={`min-h-[36px] py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                            recCustomDurationMode
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-foreground border-layer-line'
                          }`}
                        >
                          {bi('يدوي', 'Custom', 'دەستی')}
                        </button>
                      </div>
                      {recCustomDurationMode && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <input
                            id="rec-custom-duration"
                            type="number"
                            min={5}
                            max={480}
                            step={1}
                            dir="ltr"
                            aria-label={bi('مدة الجلسة المخصصة بالدقائق', 'Custom session duration in minutes')}
                            value={recCustomDurationDraft}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setRecCustomDurationDraft(raw);
                              const parsed = parseInt(raw, 10);
                              if (!Number.isNaN(parsed) && parsed >= 5) {
                                setRecDuration(Math.min(480, parsed));
                              }
                            }}
                            placeholder="75"
                            className="w-24 px-2.5 py-1.5 text-xs rounded-lg bg-card border border-layer-line text-foreground font-mono font-bold tabular-nums focus:outline-none focus:border-primary"
                          />
                          <span className="text-xs text-muted-foreground-1 font-semibold">
                            {bi('دقيقة', 'min', 'خولەک')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-primary/90 font-medium">
                      {bi(
                        'عند حلول كل يوم محدد، ينضاف المريض تلقائياً لطابور الاستقبال.',
                        'Patient auto-joins Reception Queue on matching dates.',
                        'لە هەر ڕۆژێکی دیاریکراودا، نەخۆشەکە بە شێوەی خۆکار دەچێتە ناو ڕیزی پێشوازی.'
                      )}
                    </span>
                    <button
                      type="submit"
                      disabled={recWeekdays.length === 0}
                      className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed text-primary-foreground text-xs font-bold cursor-pointer compact-btn"
                      style={{ minHeight: 'unset' }}
                    >
                      {bi('حفظ الجدول الأسبوعي', 'Save Weekly Schedule', 'پاشەکەوتکردنی خشتەی هەفتانە')}
                    </button>
                  </div>
                </form>
              )}

              {patientRecurringRules.length === 0 ? (
                !showRecurringForm && (
                  <p className="text-xs text-muted-foreground-2">
                    {bi(
                      'لا توجد أيام أسبوعية محددة لهذا المريض حالياً.',
                      'No weekly recurring session days configured for this patient yet.',
                      'لە ئێستادا هیچ ڕۆژێکی هەفتانە بۆ ئەم نەخۆشە دیاری نەکراوە.'
                    )}
                  </p>
                )
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {patientRecurringRules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                        rule.isActive
                          ? 'bg-layer border-layer-line'
                          : 'bg-muted/40 border-line-2 opacity-75'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-primary">
                            {formatWeekdaysSummary(rule.weekdays, language)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              rule.isActive
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {rule.isActive
                              ? bi('نشط', 'Active', 'چالاک')
                              : bi('متوقف', 'Paused', 'وەستاو')}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground-1 flex items-center gap-2">
                          <span className="font-bold text-foreground">
                            <TimeDisplay time={rule.startTime} />
                          </span>
                          <span>•</span>
                          <span>
                            <Num value={rule.durationMinutes} /> {bi('دقيقة', 'min', 'خولەک')}
                          </span>
                          <span>•</span>
                          <span>
                            {bi('من ', 'From ', 'لە ')}
                            <bdi dir="ltr">{formatDateDDMMYYYY(rule.startDate)}</bdi>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            ClinicOperationsService.toggleRecurringScheduleActive(rule.id);
                            reloadPatientRecurring();
                          }}
                          className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-muted-foreground-1 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer inline-flex items-center justify-center"
                          aria-label={
                            rule.isActive
                              ? bi('إيقاف مؤقت للجدول الأسبوعي', 'Pause weekly schedule', 'وەستاندنی کاتی')
                              : bi('تفعيل الجدول الأسبوعي', 'Resume weekly schedule', 'کاراکردن')
                          }
                          title={
                            rule.isActive
                              ? bi('إيقاف مؤقت', 'Pause', 'وەستاندنی کاتی')
                              : bi('تفعيل', 'Resume', 'کاراکردن')
                          }
                        >
                          {rule.isActive ? (
                            <Pause className="size-3.5" />
                          ) : (
                            <Play className="size-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            ClinicOperationsService.deleteRecurringSchedule(rule.id);
                            reloadPatientRecurring();
                          }}
                          className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-muted-foreground-1 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer inline-flex items-center justify-center"
                          aria-label={bi('حذف الجدول الأسبوعي', 'Delete weekly schedule', 'سڕینەوە')}
                          title={bi('حذف', 'Delete', 'سڕینەوە')}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {episodeSessions.length === 0 ? (
              <div className="p-12 rounded-2xl bg-card border border-card-line text-center space-y-3 shadow-2xs">
                <Clock className="size-8 text-muted-foreground-1 mx-auto" />
                <p className="text-xs text-muted-foreground-1">
                  {bi(
                    'لا توجد جلسات مسجلة في حلقة الرعاية هذه بعد.',
                    'No treatment sessions recorded in this episode yet.',
                    'هێشتا هیچ دانیشتنێک لەم قۆناغەدا تۆمار نەکراوە.'
                  )}
                </p>
              </div>
            ) : (
              <div
                ref={chartSessionsVirtual.containerRef}
                onScroll={chartSessionsVirtual.onScroll}
                data-testid="chart-sessions-list"
                tabIndex={chartSessionsVirtual.isVirtualized ? 0 : undefined}
                aria-label={chartSessionsVirtual.isVirtualized ? bi('قائمة الجلسات العلاجية', 'Treatment sessions list') : undefined}
                className={
                  chartSessionsVirtual.isVirtualized
                    ? 'max-h-[70vh] overflow-y-auto pe-1'
                    : ''
                }
              >
                {chartSessionsVirtual.topSpacerPx > 0 && (
                  <div style={{ height: chartSessionsVirtual.topSpacerPx }} aria-hidden="true" />
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {visibleChartSessions.map((session) => {
                  const sNumber = session.sessionNumber ?? session.data?.sessionNumber ?? 1;
                  const sDate = session.sessionDate ?? session.data?.sessionDate ?? '';
                  const sStatus = session.status ?? session.data?.status ?? 'draft';
                  const sType = session.sessionType ?? session.data?.sessionType ?? 'follow_up';
                  const sDuration = session.data?.sessionDurationMinutes || 45;

                  return (
                    <div
                      key={session.id}
                      onClick={() => onOpenSession(session.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenSession(session.id);
                        }
                      }}
                      className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line hover:border-primary/60 shadow-2xs transition-all cursor-pointer space-y-2 group focus:outline-none focus:ring-2 focus:ring-primary/25"
                    >
                      <div className="flex items-center justify-between tabular-nums">
                        <span className="font-bold text-foreground text-xs sm:text-sm flex items-center gap-2">
                          <span className="text-primary font-mono font-bold">
                            <bdi dir="ltr">#{sNumber}</bdi>
                          </span>
                          <bdi dir="ltr">{formatDateDDMMYYYY(sDate)}</bdi>
                        </span>
                        <span
                          className={`py-0.5 px-2.5 rounded-full text-xs font-semibold border ${
                            sStatus === 'finalized'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                              : 'bg-surface text-muted-foreground-1 border-line-2'
                          }`}
                        >
                          {sStatus === 'finalized'
                            ? bi('معتمدة ومغلقة', 'Finalized', 'پەسەندکراو و داخراو')
                            : bi('مسودة', 'Draft', 'ڕەشنووس')}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground-1 tabular-nums">
                        {sType === 'initial_evaluation'
                          ? bi('تقييم أولي', 'Initial Evaluation', 'هەڵسەنگاندنی سەرەتایی')
                          : sType === 're_evaluation'
                          ? bi('إعادة تقييم', 'Re-evaluation', 'دووبارە هەڵسەنگاندن')
                          : bi('جلسة متابعة', 'Follow-up', 'دانیشتنی بەدواداچوون')}{' '}
                        · {sDuration}m
                      </p>
                    </div>
                  );
                })}
                </div>
                {chartSessionsVirtual.bottomSpacerPx > 0 && (
                  <div style={{ height: chartSessionsVirtual.bottomSpacerPx }} aria-hidden="true" />
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CENTRAL PATIENT CLINICAL HISTORY */}
        {activeTab === 'history' && (
          <div className="max-w-5xl mx-auto space-y-5">
            {/* Referral Physician & Emergency Contact Card */}
            <div className="p-5 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-xs font-bold text-primary">
                  <UserCheck className="size-4" />
                  <span>
                    {bi(
                      'الطبيب المحيل وجهات الاتصال للطوارئ',
                      'Referring Physician & Emergency Contact',
                      'پزیشکی ڕەوانەکار و پەیوەندیی فریاگوزاری'
                    )}
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {enableReferralsModule && (
                    <button
                      type="button"
                      onClick={() => setIsReportBackModalOpen(true)}
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-layer border border-layer-line hover:bg-layer-hover text-foreground text-xs font-semibold cursor-pointer"
                    >
                      <Send className="size-3.5 text-primary" />
                      <span>{bi('إعداد تقرير للطبيب المحيل', 'Report Back to Doctor', 'ئامادەکردنی ڕاپۆرت بۆ پزیشکی ڕەوانەکار')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveMasterAndEpisode}
                    disabled={isSaving}
                    className={`min-h-[36px] py-1.5 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
                      saveSuccess
                        ? 'bg-emerald-700 text-white'
                        : 'bg-primary hover:bg-primary-hover text-primary-foreground'
                    }`}
                  >
                    <Save className="size-3.5" />
                    <span>
                      {isSaving
                        ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                        : saveSuccess
                        ? bi('تم حفظ الملف', 'Saved', 'پاشەکەوتکرا')
                        : bi('حفظ بيانات الملف', 'Save Profile', 'پاشەکەوتکردن')}
                    </span>
                  </button>
                </div>
              </div>

              {enableReferralsModule && (
                <div className="p-3.5 rounded-xl bg-surface/60 border border-card-line grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="profile-referral-source" className="text-xs font-semibold text-foreground block mb-1.5">
                      {bi('مصدر الإحالة:', 'Referral Source:', 'سەرچاوەی ڕەوانەکردن:')}
                    </label>
                    <select
                      id="profile-referral-source"
                      value={referralSourceType}
                      onChange={(e) =>
                        setReferralSourceType((e.target.value as ReferralSourceType) || '')
                      }
                      className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="">
                        {bi('— غير محدد —', '— Unspecified —', '— دیارینەکراو —')}
                      </option>
                      {REFERRAL_SOURCE_TYPES.map((sourceType) => (
                        <option key={sourceType} value={sourceType}>
                          {bi(
                            REFERRAL_SOURCE_LABELS[sourceType].ar,
                            REFERRAL_SOURCE_LABELS[sourceType].en
                          )}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="profile-referring-doctor-id" className="text-xs font-semibold text-foreground block mb-1.5">
                      {bi('الطبيب المحيل (من الدليل):', 'Directory Doctor:', 'پزیشکی ڕەوانەکار (لە ڕێبەرەوە):')}
                    </label>
                    <select
                      id="profile-referring-doctor-id"
                      value={referringDoctorId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        const doc = referringDoctors.find((entry) => entry.id === nextId);
                        setReferringDoctorId(nextId);
                        if (doc) {
                          setReferringPhysician(resolveDoctorDisplayName(doc, isRtlLang));
                          const docFacility = resolveDoctorFacility(doc, isRtlLang);
                          if (docFacility) setReferringClinic(docFacility);
                          if (!referralSourceType) setReferralSourceType('doctor');
                        }
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="">
                        {bi(
                          '— اختياري: اختر من الدليل —',
                          '— Optional: Pick from Directory —',
                          '— دڵخوازانە: لە ڕێبەر هەڵبژێرە —'
                        )}
                      </option>
                      {referringDoctors.map((doc) => {
                        const docFacility = resolveDoctorFacility(doc, isRtlLang);
                        return (
                          <option key={doc.id} value={doc.id}>
                            {resolveDoctorDisplayName(doc, isRtlLang)}
                            {docFacility ? ` (${docFacility})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="profile-referral-notes" className="text-xs font-semibold text-foreground block mb-1.5">
                      {bi('ملاحظات الإحالة:', 'Referral Notes:', 'تێبینییەکانی ڕەوانەکردن:')}
                    </label>
                    <input
                      id="profile-referral-notes"
                      type="text"
                      value={referralNotes}
                      onChange={(e) => setReferralNotes(e.target.value)}
                      placeholder={bi(
                        'مثال: كتاب إحالة / اسم المُعرِّف...',
                        'e.g., Referral ref / recommender...',
                        'نموونە: نووسراوی ڕەوانەکردن / ناوی پێشنیارکەر...'
                      )}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="profile-referring-physician" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('الطبيب الاستشاري المحيل:', 'Referring Physician:', 'پزیشکی ڕاوێژکاری ڕەوانەکار:')}
                  </label>
                  <input
                    id="profile-referring-physician"
                    type="text"
                    value={referringPhysician}
                    onChange={(e) => setReferringPhysician(e.target.value)}
                    placeholder={bi('مثال: د. حيدر العبيدي (جراحة عظام)', 'e.g., Dr. Haider Al-Obaidi', 'نموونە: د. حەیدەر عوبەیدی (نەشتەرگەری ئێسک)')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="profile-referring-clinic" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('المستشفى / المركز المحيل:', 'Referring Hospital / Clinic:', 'نەخۆشخانە / سەنتەری ڕەوانەکار:')}
                  </label>
                  <input
                    id="profile-referring-clinic"
                    type="text"
                    value={referringClinic}
                    onChange={(e) => setReferringClinic(e.target.value)}
                    placeholder={bi('مستشفى الكفيل / عيادة الحارثية...', 'Hospital / Medical Center...', 'نەخۆشخانە / سەنتەری پزیشکی...')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="profile-emergency-name" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('اسم قريب الطوارئ وصلة القرابة:', 'Emergency Contact & Relation:', 'ناوی خزمی فریاگوزاری و پەیوەندی:')}
                  </label>
                  <input
                    id="profile-emergency-name"
                    type="text"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    placeholder={bi('مثال: محمد عبد الله (الأخ)', 'Name & Relationship', 'ناو و پەیوەندیی خزمایەتی')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="profile-emergency-phone" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('هاتف الطوارئ:', 'Emergency Phone:', 'ژمارەی تەلەفۆنی فریاگوزاری:')}
                  </label>
                  <PhoneInput
                    id="profile-emergency-phone"
                    value={emergencyContactPhone}
                    onChange={setEmergencyContactPhone}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="profile-contraindications" className="text-xs font-semibold text-rose-700 dark:text-rose-400 block mb-1.5">
                    {bi(
                      'موانع الاستعمال والمحاذير الطبية:',
                      'Contraindications & Precautions:',
                      'قەدەغەکراوە پزیشکییەکان و ئاگادارییەکان:'
                    )}
                  </label>
                  <AutoResizeTextarea
                    id="profile-contraindications"
                    minRows={2}
                    value={contraindications}
                    onChange={(e) => setContraindications(e.target.value)}
                    placeholder={bi(
                      'مثال: منظم ضربات قلب (يمنع TENS/Diathermy)، تثبيت فقرات، هشاشة عظام...',
                      'e.g., Pacemaker, recent DVT, weight-bearing restriction...',
                      'نموونە: ڕێکخەری لێدانی دڵ (TENS قەدەغەیە)، جێگیرکردنی بڕبڕە، پووکانەوەی ئێسک...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-rose-500/10 border border-rose-500/30 text-foreground focus:outline-none"
                  />
                  <div className="mt-2.5 pt-2.5 border-t border-rose-500/20 space-y-2">
                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 block">
                      {bi(
                        'المحاذير السريرية المهيكلة (لتنبيهات سلامة الأجهزة):',
                        'Structured Clinical Precautions (Modality Safety Alerts):',
                        'ئاگادارییە کلینیکییە ڕێکخراوەکان (بۆ سەلامەتی ئامێرەکان):'
                      )}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {STRUCTURED_PRECAUTIONS_CATALOG.filter(
                        (item) => !dismissedPrecautionIds.includes(item.id)
                      ).map((item) => {
                        const checked = structuredPrecautions.includes(item.id);
                        return (
                          <div
                            key={item.id}
                            data-testid={`chart-precaution-${item.id}`}
                            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                              checked
                                ? 'bg-rose-500/20 border-rose-500 text-rose-800 dark:text-rose-200 font-bold'
                                : 'bg-surface/70 border-layer-line text-foreground hover:bg-muted/40'
                            }`}
                          >
                            <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setStructuredPrecautions((prev) =>
                                    prev.includes(item.id)
                                      ? prev.filter((id) => id !== item.id)
                                      : [...prev, item.id]
                                  )
                                }
                                className="size-3.5 accent-rose-600 rounded shrink-0"
                              />
                              <span className="truncate">
                                {bi(item.labelAr, item.labelEn, item.labelCkb)}
                              </span>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setDismissedPrecautionIds((prev) => [...prev, item.id]);
                                setStructuredPrecautions((prev) => prev.filter((id) => id !== item.id));
                              }}
                              title={bi('حذف هذا المحذور', 'Delete this precaution', 'سڕینەوەی ئەم ئاگادارییە')}
                              className="p-1 text-muted-foreground-2 hover:text-rose-600 rounded transition-colors shrink-0 cursor-pointer"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        );
                      })}

                      {customPrecautions.map((item) => {
                        const checked = structuredPrecautions.includes(item.id);
                        return (
                          <div
                            key={item.id}
                            data-testid={`chart-precaution-${item.id}`}
                            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                              checked
                                ? 'bg-rose-500/20 border-rose-500 text-rose-800 dark:text-rose-200 font-bold'
                                : 'bg-surface/70 border-layer-line text-foreground hover:bg-muted/40'
                            }`}
                          >
                            <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setStructuredPrecautions((prev) =>
                                    prev.includes(item.id)
                                      ? prev.filter((id) => id !== item.id)
                                      : [...prev, item.id]
                                  )
                                }
                                className="size-3.5 accent-rose-600 rounded shrink-0"
                              />
                              <span className="truncate">
                                {bi(item.labelAr, item.labelEn || item.labelAr, item.labelCkb || item.labelAr)}
                              </span>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setCustomPrecautions((prev) => prev.filter((p) => p.id !== item.id));
                                setStructuredPrecautions((prev) => prev.filter((id) => id !== item.id));
                              }}
                              title={bi('حذف هذا المحذور المخصص', 'Delete this custom precaution', 'سڕینەوەی ئەم ئاگادارییە')}
                              className="p-1 text-muted-foreground-2 hover:text-rose-600 rounded transition-colors shrink-0 cursor-pointer"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Quick Add Custom Precaution */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={newPrecautionText}
                        onChange={(e) => setNewPrecautionText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const trimmed = newPrecautionText.trim();
                            if (!trimmed) return;
                            const newId = `custom_prec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                            setCustomPrecautions((prev) => [
                              ...prev,
                              { id: newId, labelAr: trimmed, labelEn: trimmed, createdAt: new Date().toISOString() },
                            ]);
                            setStructuredPrecautions((prev) => [...prev, newId]);
                            setNewPrecautionText('');
                          }
                        }}
                        placeholder={bi(
                          'إضافة محذور سريري مخصص جديد...',
                          'Add new custom clinical precaution...',
                          'زیادکردنی ئاگاداری کلینیکی نوێ...'
                        )}
                        className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-card border border-layer-line text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:border-rose-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newPrecautionText.trim();
                          if (!trimmed) return;
                          const newId = `custom_prec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                          setCustomPrecautions((prev) => [
                            ...prev,
                            { id: newId, labelAr: trimmed, labelEn: trimmed, createdAt: new Date().toISOString() },
                          ]);
                          setStructuredPrecautions((prev) => [...prev, newId]);
                          setNewPrecautionText('');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="size-3.5" />
                        <span>{bi('إضافة', 'Add', 'زیادکردن')}</span>
                      </button>
                    </div>

                    {dismissedPrecautionIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDismissedPrecautionIds([])}
                        className="text-xs text-rose-700 dark:text-rose-400 hover:underline font-semibold block pt-1 cursor-pointer"
                      >
                        {bi('استعادة المحاذير الافتراضية المحذوفة', 'Restore default precautions', 'گەڕاندنەوەی ئاگادارییە سەرەتاییەکان')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Red Flags Alert Box & Structured Screening Checklist (3.4) */}
            <div className="p-5 sm:p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <RedFlagChecklistPanel
                checklist={redFlagChecklist}
                onChange={setRedFlagChecklist}
                redFlagsText={redFlags}
                onRedFlagsTextChange={setRedFlags}
                dismissedItemIds={dismissedRedFlagIds}
                onDismissedItemIdsChange={setDismissedRedFlagIds}
              />
            </div>

            {/* Patient Medication Schedule */}
            <Suspense fallback={null}>
              <OrganMedicationSchedule
                patientId={patient.id}
                currentMedicationsText={currentMedications}
                onUpdateMedicationsText={(summary) => setCurrentMedications(summary)}
              />
            </Suspense>

            {/* Medical History & Surgeries */}
            <div className="p-5 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
              <h2 className="text-xs font-bold text-primary uppercase tracking-wider">
                {bi(
                  'التاريخ المرضي والعمليات الجراحية والحساسية:',
                  'Medical History, Surgeries & Allergies:',
                  'مێژووی نەخۆشی، نەشتەرگەرییەکان و هەستیاری:'
                )}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="profile-medical-history" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('الأمراض المزمنة والتاريخ المرضي:', 'Medical History:', 'نەخۆشییە درێژخایەنەکان و مێژووی نەخۆشی:')}
                  </label>
                  <AutoResizeTextarea
                    id="profile-medical-history"
                    minRows={3}
                    value={medicalHistory}
                    onChange={(e) => setMedicalHistory(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="profile-previous-surgeries" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('العمليات الجراحية السابقة:', 'Previous Surgeries:', 'نەشتەرگەرییەکانی پێشوو:')}
                  </label>
                  <AutoResizeTextarea
                    id="profile-previous-surgeries"
                    minRows={3}
                    value={previousSurgeries}
                    onChange={(e) => setPreviousSurgeries(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSaveMasterAndEpisode}
                  disabled={isSaving}
                  className={`min-h-[36px] py-1.5 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
                    saveSuccess
                      ? 'bg-emerald-700 text-white'
                      : 'bg-primary hover:bg-primary-hover text-primary-foreground'
                  }`}
                >
                  <Save className="size-3.5" />
                  <span>
                    {isSaving
                      ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                      : saveSuccess
                      ? bi('تم الحفظ', 'Saved', 'پاشەکەوتکرا')
                      : bi('حفظ التغييرات', 'Save Changes', 'پاشەکەوتکردن')}
                  </span>
                </button>
              </div>
            </div>

            {/* Clinical Attachments & Imaging Reports (MRI / X-Ray / Referrals / Other) */}
            <Suspense fallback={null}>
              <PatientImagingReportsPanel
                patientId={patient.id}
                episodeId={activeEpisode?.id}
                attachments={attachments}
                onPersistAttachments={handlePersistAttachments}
              />
            </Suspense>
          </div>
        )}

        {/* TAB 5: CENTRAL PATIENT PROFILE HUB, FINANCIAL SUMMARY & ATTACHMENTS */}
        {activeTab === 'profile' && (
          <div className="max-w-5xl mx-auto space-y-5">
            {/* Patient Iraqi Financial Summary Strip (IQD) */}
            <div className="p-5 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Wallet className="size-4 text-primary" />
                  <span>
                    {bi(
                      'الملخص المالي للمريض بالدينار العراقي',
                      'Patient Financial Summary (IQD)',
                      'پوختەی دارایی نەخۆش بە دیناری عێراقی'
                    )}
                  </span>
                </h2>
                <span className="text-xs text-muted-foreground-1 tabular-nums">
                  <Num value={financialSummary.invoices.length} /> {bi('فواتير', 'invoices', 'پسوولە')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 tabular-nums">
                <div className="p-4 rounded-xl bg-surface border border-line-2">
                  <span className="text-xs text-muted-foreground-1 block font-sans">
                    {bi('إجمالي المبالغ المفوترة', 'Total Billed', 'کۆی گشتیی پسوولەکراو')}
                  </span>
                  <span className="text-base font-bold text-foreground mt-0.5 block">
                    <Money amount={financialSummary.totalBilledIQD} />
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-surface border border-line-2">
                  <span className="text-xs text-muted-foreground-1 block font-sans">
                    {bi('إجمالي المدفوع نقداً / إلكترونياً', 'Total Paid', 'کۆی پارەی دراو (نەقد / ئەلیکترۆنی)')}
                  </span>
                  <span className="text-base font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                    <Money amount={financialSummary.totalPaidIQD} />
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-surface border border-line-2">
                  <span className="text-xs text-muted-foreground-1 block font-sans">
                    {bi('الرصيد المتبقي بذمة المريض (دين)', 'Balance Due (Debt)', 'پارەی ماوە لەسەر نەخۆش (قەرز)')}
                  </span>
                  <span
                    className={`text-base font-bold mt-0.5 block ${
                      financialSummary.totalDebtIQD > 0
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-muted-foreground-1'
                    }`}
                  >
                    <Money amount={financialSummary.totalDebtIQD} />
                  </span>
                </div>
              </div>
            </div>

            {/* 4.6 Printable Clinical Reports Portal */}
            <div className="bg-card p-5 sm:p-6 rounded-2xl border border-card-line shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-divider pb-3">
                <div className="flex items-center gap-2">
                  <Printer className="size-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">
                    {bi(
                      'التقارير الطبية والطباعة الرسمية (PDF)',
                      'Official Printable Clinical Reports (PDF)',
                      'ڕاپۆرتە پزیشکییەکان و چاپکردنی فەرمی (PDF)'
                    )}
                  </h2>
                </div>
                <span className="text-xs text-muted-foreground-1">
                  {bi(
                    'بترويسة وشعار وختم العيادة المشفر محلياً',
                    'With encrypted clinic letterhead, logo & stamp',
                    'بە سەردێڕ و لۆگۆ و مۆری کلینیکی کۆدکراوی ناوخۆیی'
                  )}
                </span>
              </div>

              <div className="pr-hscroll overflow-x-auto flex items-center gap-2 whitespace-nowrap pb-1.5 pt-0.5 px-0.5">
                {(
                  [
                    {
                      type: 'progress_report',
                      ar: 'تقرير متابعة التقدم',
                      en: 'Progress Report',
                      ckb: 'ڕاپۆرتی بەدواداچوونی پێشکەوتن',
                    },
                    {
                      type: 'discharge_summary',
                      ar: 'ملخص التخريج',
                      en: 'Discharge Summary',
                      ckb: 'پوختەی دەرچوون',
                    },
                    {
                      type: 'referral_letter',
                      ar: 'كتاب إحالة طبية',
                      en: 'Referral Letter',
                      ckb: 'نامەی ڕەوانەکردنی پزیشکی',
                    },
                    {
                      type: 'medical_report',
                      ar: 'تقرير علاج طبيعي',
                      en: 'Medical Report',
                      ckb: 'ڕاپۆرتی چارەسەری سروشتی',
                    },
                    {
                      type: 'patient_dossier',
                      ar: 'الملف السريري الكامل (PDF)',
                      en: 'Full Patient Dossier (PDF)',
                      ckb: 'دۆسیەی کلینیکیی تەواو (PDF)',
                    },
                    ...(episodeStore.hepProgram.length > 0
                      ? [
                          {
                            type: 'hep_sheet' as PrintableDocumentType,
                            ar: 'ورقة التمارين المنزلية (HEP)',
                            en: 'HEP Exercise Sheet',
                            ckb: 'لاپەڕەی ڕاهێنانی ماڵەوە (HEP)',
                          },
                        ]
                      : []),
                    ...(enableScheduleVisitCardPrint
                      ? [
                          {
                            type: 'patient_visit_card' as PrintableDocumentType,
                            ar: 'بطاقة مواعيد المريض ورصيد الجلسات',
                            en: 'Patient Visit Card',
                            ckb: 'کارتی وادەکانی نەخۆش و ژمارەی دانیشتنەکان',
                            testId: 'print-patient-visit-card-btn',
                          },
                        ]
                      : []),
                  ] satisfies Array<{
                    type: PrintableDocumentType;
                    ar: string;
                    en: string;
                    ckb: string;
                    testId?: string;
                  }>
                ).map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    data-testid={item.testId}
                    onClick={async () => {
                      if (item.type === 'patient_dossier' && dek) {
                        const loaded: SoapNoteRecord[] = [];
                        for (const s of sessions) {
                          try {
                            const note = await SoapService.getSoapNoteBySession(s.id, dek);
                            if (note) loaded.push(note);
                          } catch {
                            // skip unreadable draft
                          }
                        }
                        setAllPatientSoaps(loaded);
                      }
                      setActivePrintDoc(item.type);
                    }}
                    className="py-2 px-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-surface hover:bg-gray-50 dark:hover:bg-neutral-800 text-xs font-semibold text-foreground inline-flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
                  >
                    <Printer className="size-3.5 text-primary" />
                    <span>{bi(item.ar, item.en, item.ckb)}</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={async () => {
                    if (!dek) return;
                    const allSoaps: SoapNoteRecord[] = [];
                    for (const s of sessions) {
                      const note = await SoapService.getSoapNoteBySession(s.id, dek);
                      if (note) allSoaps.push(note);
                    }
                    const stores = episodes.map((ep) =>
                      ClinicOperationsService.getEpisodeClinicalStore(ep.id, patient.id)
                    );
                    const profile = ClinicOperationsService.getClinicProfile();
                    const bundle = buildPatientFhirR4Bundle({
                      patient,
                      episodes,
                      sessions,
                      soaps: allSoaps,
                      episodeStores: stores,
                      clinicName: bi(profile.clinicNameAr, profile.clinicNameEn),
                    });
                    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                      type: 'application/fhir+json;charset=utf-8',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `patient-${patient.data.mrn || patient.id}-fhir-r4-${getTodayIso()}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                  className="py-2 px-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-semibold text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
                >
                  <Download className="size-3.5" />
                  <span>{bi('تصدير HL7 FHIR R4 JSON', 'Export FHIR R4 JSON', 'هەناردەکردنی HL7 FHIR R4 JSON')}</span>
                </button>
              </div>
            </div>

            {/* 5.2 Encrypted Patient Attachments & Posture Photos (off by default in Modules) */}
            <Suspense fallback={null}>
              <PatientAttachmentsPanel patientId={patient.id} episodeId={activeEpisode?.id} />

              {/* 4.8 Informed Consent & Encrypted Signature Pad */}
              <ConsentSignaturePanel patient={patient} episode={activeEpisode} />
            </Suspense>
          </div>
        )}
      </div>

      {/* Assessment Tools Shelf Modal */}
      <ModalDialog
        isOpen={isExamShelfModalOpen}
        onOpenChange={setIsExamShelfModalOpen}
        size="xl"
        title={bi('رف الفحوصات والأدوات السريرية', 'Clinical Examination Shelf', 'ڕەفەی پشکنین و ئامرازە کلینیکییەکان')}
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsExamShelfModalOpen(false)}
              className="py-1.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold cursor-pointer"
            >
              {bi('تم', 'Done', 'تەواو')}
            </button>
          </div>
        }
      >
        <Suspense
          fallback={
            <div className="p-6 text-center text-xs text-muted-foreground-1">
              {bi('جاري تحميل أدوات الفحص...', 'Loading assessment tools...', 'ئامرازەکانی پشکنین بار دەکرێن...')}
            </div>
          }
        >
          <ExamWidgetShelf
            onAddWidget={handleAddWidget}
            onOpenCustomStudio={() => {
              setIsExamShelfModalOpen(false);
              setIsCustomStudioOpen(true);
            }}
            activeWidgetIds={episodeStore.activeWidgetIds}
          />
        </Suspense>
      </ModalDialog>

      {/* Printable Clinical & Financial Documents Modal (4.6 + 5.1 Dossier) */}
      {activePrintDoc !== null && (
        <Suspense fallback={null}>
          <PrintDocumentModal
            isOpen={activePrintDoc !== null}
            onClose={() => setActivePrintDoc(null)}
            documentType={activePrintDoc || 'progress_report'}
            patient={patient}
            episode={activeEpisode}
            allEpisodes={episodes}
            allPatientConsents={ClinicOperationsService.getConsentsForPatient(patient.id)}
            clinicalStore={episodeStore}
            sessions={activePrintDoc === 'patient_dossier' ? sessions : episodeSessions}
            soaps={activePrintDoc === 'patient_dossier' ? allPatientSoaps : episodeSoaps}
            hepProgram={episodeStore.hepProgram}
          />
        </Suspense>
      )}

      {/* Custom Widget Studio Modal */}
      {isCustomStudioOpen && (
        <Suspense fallback={null}>
          <CustomWidgetStudioModal
            isOpen={isCustomStudioOpen}
            onClose={() => setIsCustomStudioOpen(false)}
            onWidgetCreated={(newWidget) => {
              handleAddWidget(newWidget.id);
            }}
          />
        </Suspense>
      )}


      {/* 1. Modal: Edit Personal Information */}
      <ModalDialog
        isOpen={isEditPersonalInfoOpen}
        onOpenChange={setIsEditPersonalInfoOpen}
        size="md"
        title={bi('تعديل المعلومات الشخصية للمريض', 'Edit Patient Personal Information', 'دەستکاری زانیاری کەسیی نەخۆش')}
      >
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('الاسم الكامل', 'Full Name', 'ناوی تەواو')}
            </label>
            <input
              type="text"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {bi('رقم الهاتف', 'Phone Number', 'ژمارەی تەلەفۆن')}
              </label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {bi('الجنس', 'Gender', 'ڕەگەز')}
              </label>
              <select
                value={editGender}
                onChange={(e) => setEditGender(e.target.value as 'male' | 'female' | 'other')}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none"
              >
                <option value="male">{bi('ذكر', 'Male', 'نێر')}</option>
                <option value="female">{bi('أنثى', 'Female', 'مێ')}</option>
                <option value="other">{bi('أخرى', 'Other', 'هی تر')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('تاريخ الميلاد', 'Date of Birth', 'بەرواری لەدایکبوون')}
            </label>
            <input
              type="date"
              value={editDob}
              onChange={(e) => setEditDob(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('العنوان التفصيلي', 'Detailed Address', 'ناونیشانی ورد')}
            </label>
            <input
              type="text"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              placeholder={bi('المدينة، المنطقة، أقرب نقطة دالة', 'City, Area, Landmark', 'شار، ناوچە، نزیکترین خاڵ')}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none"
            />
          </div>

          <div className="pt-2 border-t border-card-divider space-y-3">
            <h4 className="text-xs font-bold text-primary">
              {bi('جهة الاتصال للطوارئ', 'Emergency Contact', 'پەیوەندیی فریاگوزاری')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  {bi('اسم جهة الطوارئ', 'Emergency Contact Name', 'ناوی کەسی پەیوەندی')}
                </label>
                <input
                  type="text"
                  value={editEmergencyName}
                  onChange={(e) => setEditEmergencyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  {bi('هاتف الطوارئ', 'Emergency Phone', 'تەلەفۆنی فریاگوزاری')}
                </label>
                <input
                  type="tel"
                  value={editEmergencyPhone}
                  onChange={(e) => setEditEmergencyPhone(e.target.value)}
                  dir="ltr"
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-card-divider">
            <button
              type="button"
              onClick={() => setIsEditPersonalInfoOpen(false)}
              className="px-4 py-2 rounded-xl bg-surface border border-line-2 text-xs font-semibold hover:bg-muted/60 transition-colors"
            >
              {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
            </button>
            <button
              type="button"
              onClick={handleSavePersonalInfo}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {isSaving ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...') : bi('حفظ التعديلات', 'Save Changes', 'پاشەکەوتی دەستکاری')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* 2. Modal: Edit Clinical Summary & Goals */}
      <ModalDialog
        isOpen={isEditClinicalSummaryOpen}
        onOpenChange={setIsEditClinicalSummaryOpen}
        size="md"
        title={bi('ملخص الحالة السريرية والأهداف', 'Clinical Summary & Goals', 'پوختەی کلینیکی و ئامانجەکان')}
      >
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('عنوان الحلقة / الحالة الرئيسية', 'Condition / Episode Title', 'ناونیشانی حاڵەت')}
            </label>
            <input
              type="text"
              value={editEpisodeTitle}
              onChange={(e) => setEditEpisodeTitle(e.target.value)}
              placeholder={bi('مثال: التهاب محفظة الكتف اللاصق / الكتف المتجمد', 'e.g. Frozen Shoulder', 'وەک: شانی بەستوو')}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('التشخيص الطبي الأولي', 'Medical Diagnosis', 'دەستنیشانکردنی پزیشکی')}
            </label>
            <input
              type="text"
              value={editDiagnosis}
              onChange={(e) => setEditDiagnosis(e.target.value)}
              placeholder={bi('مثال: Adhesive Capsulitis', 'e.g. Adhesive Capsulitis', 'دەستنیشانکردن')}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('الشكوى الرئيسية للمريض', 'Chief Complaint', 'سکاڵای سەرەکی')}
            </label>
            <textarea
              rows={2}
              value={editChiefComplaint}
              onChange={(e) => setEditChiefComplaint(e.target.value)}
              placeholder={bi('وصف ألم المريض وموقع الإصابة وتأثيرها على الحركة', 'Patient complaint & pain description', 'وەسفی ئازار')}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('الانطباع السريري للمعالج الطبيعي', 'Clinical Impression', 'تێگەیشتنی کلینیکی')}
            </label>
            <textarea
              rows={2}
              value={editClinicalImpression}
              onChange={(e) => setEditClinicalImpression(e.target.value)}
              placeholder={bi('الانطباع السريري والملاحظات الفسيولوجية', 'Physical therapist clinical impression', 'تێگەیشتن')}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('الأهداف التأهيلية للمريض (Goals)', 'Rehabilitation Goals', 'ئامانجەکانی چارەسەر')}
            </label>
            <textarea
              rows={2}
              value={editGoals}
              onChange={(e) => setEditGoals(e.target.value)}
              placeholder={bi('مثال: تقليل الألم واستعادة المدى الحركي والقدرة على رفع الذراع', 'e.g. Reduce pain and improve ROM', 'ئامانجەکان')}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-line-2 text-sm text-foreground focus:border-primary outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-card-divider">
            <button
              type="button"
              onClick={() => setIsEditClinicalSummaryOpen(false)}
              className="px-4 py-2 rounded-xl bg-surface border border-line-2 text-xs font-semibold hover:bg-muted/60 transition-colors"
            >
              {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
            </button>
            <button
              type="button"
              onClick={handleSaveClinicalSummary}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {isSaving ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...') : bi('حفظ التعديلات', 'Save Changes', 'پاشەکەوتی دەستکاری')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* 3. Modal: MMT (Manual Muscle Testing) */}
      <ModalDialog
        isOpen={isMmtModalOpen}
        onOpenChange={setIsMmtModalOpen}
        size="lg"
        title={bi('تقييم القوة العضلية اليدوي (MMT)', 'Manual Muscle Testing (MMT)', 'پشکنینی هێزی ماسولکەکان')}
      >
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground-1">{bi('جاري تحميل وحدة فحص القوة العضلية...', 'Loading MMT widget...', 'باردەکرێت...')}</div>}>
            <MmtWidget
              value={episodeStore.objective?.mmtBattery}
              onChange={updateObjectiveMmt}
            />
          </Suspense>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-card-divider">
            <button
              type="button"
              onClick={() => {
                setIsMmtModalOpen(false);
                handleSaveMasterAndEpisode();
              }}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              {bi('إغلاق وتأكيد الحفظ', 'Save & Close', 'پاشەکەوت و داخستن')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* 4. Modal: ROM (Range of Motion) */}
      <ModalDialog
        isOpen={isRomModalOpen}
        onOpenChange={setIsRomModalOpen}
        size="lg"
        title={bi('قياس المدى الحركي للمفاصل (ROM)', 'Range of Motion (ROM)', 'پێوانی مەودای جووڵەی جومگەکان')}
      >
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground-1">{bi('جاري تحميل وحدة فحص المدى الحركي...', 'Loading ROM widget...', 'باردەکرێت...')}</div>}>
            <RomWidget
              value={episodeStore.objective?.romBattery}
              onChange={updateObjectiveRom}
            />
          </Suspense>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-card-divider">
            <button
              type="button"
              onClick={() => {
                setIsRomModalOpen(false);
                handleSaveMasterAndEpisode();
              }}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              {bi('إغلاق وتأكيد الحفظ', 'Save & Close', 'پاشەکەوت و داخستن')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* 5. Modal: Neuro Screening */}
      <ModalDialog
        isOpen={isNeuroModalOpen}
        onOpenChange={setIsNeuroModalOpen}
        size="lg"
        title={bi('الفحص العصبي (الإحساس والمنعكسات)', 'Neurological Screening', 'پشکنینی دەمار و ڕەفڵەکس')}
      >
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground-1">{bi('جاري تحميل وحدة الفحص العصبي...', 'Loading Neuro widget...', 'باردەکرێت...')}</div>}>
            <NeuroWidget
              value={episodeStore.objective?.neuroScreening}
              onChange={updateObjectiveNeuro}
            />
          </Suspense>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-card-divider">
            <button
              type="button"
              onClick={() => {
                setIsNeuroModalOpen(false);
                handleSaveMasterAndEpisode();
              }}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              {bi('إغلاق وتأكيد الحفظ', 'Save & Close', 'پاشەکەوت و داخستن')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* 6. Modal: Special Tests & Functional Scales */}
      <ModalDialog
        isOpen={isSpecialTestsModalOpen}
        onOpenChange={setIsSpecialTestsModalOpen}
        size="lg"
        title={bi('الفحوصات السريرية الخاصة والمقاييس الوظيفية', 'Special Tests & Functional Scales', 'پشکنینە تایبەتەکان و پێوەرەکان')}
      >
        <div className="p-4 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground-1">{bi('جاري تحميل الفحوصات الخاصة...', 'Loading Special Tests...', 'باردەکرێت...')}</div>}>
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-primary flex items-center gap-2">
                <Award className="size-4" />
                <span>{bi('الفحوصات السريرية الاستفزازية (Special Tests)', 'Orthopedic Special Tests', 'پشکنینە تایبەتەکان')}</span>
              </h4>
              <SpecialTestsWidget
                value={episodeStore.specialTests}
                onChange={updateSpecialTests}
              />
            </div>

            <div className="pt-4 border-t border-card-divider space-y-3">
              <h4 className="text-xs font-bold text-primary flex items-center gap-2">
                <Target className="size-4" />
                <span>{bi('المقاييس والدرجات الوظيفية (Functional Scales)', 'Functional Outcome Measures', 'پێوەرە فەنکشنەڵەکان')}</span>
              </h4>
              <FunctionalScalesWidget
                value={episodeStore.functionalScales}
                onChange={updateFunctionalScales}
                patientAge={patientAge}
                patientGender={patient.data.gender}
              />
            </div>
          </Suspense>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-card-divider">
            <button
              type="button"
              onClick={() => {
                setIsSpecialTestsModalOpen(false);
                handleSaveMasterAndEpisode();
              }}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity"
            >
              {bi('إغلاق وتأكيد الحفظ', 'Save & Close', 'پاشەکەوت و داخستن')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* C6: Printable & Copyable Report-Back Letter to Referring Doctor */}
      {isReportBackModalOpen && (
        <Suspense fallback={null}>
          <DoctorReportBackLetterModal
            isOpen={isReportBackModalOpen}
            onClose={() => setIsReportBackModalOpen(false)}
            patient={patientWithReferralEdits}
            doctor={resolvedDoctor}
            doctorNameFallback={
              referringPhysician.trim() || referringClinic.trim() || undefined
            }
            episode={activeEpisode}
            sessions={episodeSessions.length > 0 ? episodeSessions : sessions}
            episodeStore={episodeStore}
            soaps={allPatientSoaps}
          />
        </Suspense>
      )}

      {/* Mobile Floating Bottom Action Button (hidden on tablet/desktop where compact episode bar button is shown) */}
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
