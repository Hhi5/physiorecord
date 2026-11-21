// =======================================================================
// PhysioRecord — Calm Face-Sheet Medical History & Safety Tab (Solution 1)
// Read-First clinical overview with zero open forms by default:
//   1. Segmented Focus Filter (All | Safety & History | Imaging & Files)
//   2. Clinical Safety & Red Flags Summary + Bottom-Sheet Screening Modal
//   3. Chronic History & Previous Surgeries Summary + Modal Editor
//   4. Active Medications (Read-First + Modal Add)
//   5. Unified Imaging Reports & Encrypted Posture/File Attachments
// =======================================================================

import React, { Suspense, lazy, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import type {
  CustomPrecautionItem,
  EpisodeRecord,
  PatientClinicalData,
  PatientDocumentAttachment,
  PatientRecord,
  PatientRedFlagChecklistItem,
  StructuredPrecautionId,
} from '../../../types/clinical';
import type { ReferralSourceType, ReferringDoctorEntry } from '../../../types/clinicManagement';
import { STRUCTURED_PRECAUTIONS_CATALOG } from '../../../utils/modalitySafetyChecker';
import { localizeDemoText } from '../../../utils/demoLocalization';
import { ModalDialog } from '../../ui/Dialog';
import { AutoResizeTextarea } from '../../ui/Primitives';
import { RedFlagChecklistPanel } from '../RedFlagChecklistPanel';

const OrganMedicationSchedule = lazy(() =>
  import('../../organui/OrganMedicationSchedule').then((m) => ({
    default: m.OrganMedicationSchedule,
  }))
);
const PatientImagingReportsPanel = lazy(() =>
  import('../PatientImagingReportsPanel').then((m) => ({
    default: m.PatientImagingReportsPanel,
  }))
);
const PatientAttachmentsPanel = lazy(() =>
  import('../../clinic/PatientAttachmentsPanel').then((m) => ({
    default: m.PatientAttachmentsPanel,
  }))
);

type HistorySectionFilter = 'safety_history' | 'imaging';
type SafetyModalTab = 'precautions' | 'red_flags';

const QUICK_CONTRAINDICATION_CHIPS: Array<{ ar: string; en: string; ckb: string }> = [
  { ar: 'منظم ضربات قلب (يمنع TENS/Diathermy)', en: 'Pacemaker (No TENS/Diathermy)', ckb: 'ڕێکخەری لێدانی دڵ (TENS قەدەغەیە)' },
  { ar: 'تثبيت فقرات / معدن مزروع', en: 'Spinal Fixation / Metal Implant', ckb: 'جێگیرکردنی بڕبڕە / کانزای چێنراو' },
  { ar: 'هشاشة عظام شديدة', en: 'Severe Osteoporosis', ckb: 'پووکانەوەی توندی ئێسک' },
  { ar: 'حمل (يمنع التيارات أسفل الظهر والبطن)', en: 'Pregnancy (Pelvic/Lumbar Precautions)', ckb: 'دووگیانی' },
  { ar: 'جلطة حديثة (DVT)', en: 'Recent DVT', ckb: 'مەیینی خوێنی نوێ (DVT)' },
];

const QUICK_CHRONIC_CONDITIONS: Array<{ ar: string; en: string; ckb: string }> = [
  { ar: 'السكري', en: 'Diabetes Mellitus', ckb: 'شەکرە' },
  { ar: 'ارتفاع ضغط الدم', en: 'Hypertension', ckb: 'بەرزی پەستانی خوێن' },
  { ar: 'أمراض القلب', en: 'Cardiac Disease', ckb: 'نەخۆشی دڵ' },
  { ar: 'هشاشة العظام', en: 'Osteoporosis', ckb: 'پووکانەوەی ئێسک' },
  { ar: 'الربو / حساسية الصدر', en: 'Asthma', ckb: 'تەنگەنەفەسی (ڕەبۆ)' },
  { ar: 'اضطراب الغدة الدرقية', en: 'Thyroid Disorder', ckb: 'ناڕێکی سایرۆید' },
];

export interface ChartHistoryTabProps {
  patient: PatientRecord;
  activeEpisode: EpisodeRecord | null;
  enableReferralsModule?: boolean;
  referringDoctors?: ReferringDoctorEntry[];
  referralSourceType?: ReferralSourceType | '';
  setReferralSourceType?: (v: ReferralSourceType | '') => void;
  referringDoctorId?: string;
  setReferringDoctorId?: (v: string) => void;
  referralNotes?: string;
  setReferralNotes?: (v: string) => void;
  referringPhysician?: string;
  setReferringPhysician?: (v: string) => void;
  referringClinic?: string;
  setReferringClinic?: (v: string) => void;
  emergencyContactName?: string;
  setEmergencyContactName?: (v: string) => void;
  emergencyContactPhone?: string;
  setEmergencyContactPhone?: (v: string) => void;
  contraindications: string;
  setContraindications: (v: string) => void;
  structuredPrecautions: StructuredPrecautionId[];
  setStructuredPrecautions: React.Dispatch<React.SetStateAction<StructuredPrecautionId[]>>;
  customPrecautions: CustomPrecautionItem[];
  setCustomPrecautions: React.Dispatch<React.SetStateAction<CustomPrecautionItem[]>>;
  dismissedPrecautionIds: string[];
  setDismissedPrecautionIds: React.Dispatch<React.SetStateAction<string[]>>;
  redFlags: string;
  setRedFlags: (v: string) => void;
  redFlagChecklist: PatientRedFlagChecklistItem[];
  setRedFlagChecklist: (list: PatientRedFlagChecklistItem[]) => void;
  dismissedRedFlagIds: string[];
  setDismissedRedFlagIds: (ids: string[]) => void;
  currentMedications: string;
  setCurrentMedications: (v: string) => void;
  medicalHistory: string;
  setMedicalHistory: (v: string) => void;
  previousSurgeries: string;
  setPreviousSurgeries: (v: string) => void;
  attachments: PatientDocumentAttachment[];
  onPersistAttachments: (next: PatientDocumentAttachment[]) => Promise<void>;
  onOpenReportBackModal?: () => void;
  onSaveMasterAndEpisode: (overrides?: Partial<PatientClinicalData>) => Promise<void> | void;
  isSaving: boolean;
  saveSuccess: boolean;
}

export const ChartHistoryTab: React.FC<ChartHistoryTabProps> = ({
  patient,
  activeEpisode,
  contraindications,
  setContraindications,
  structuredPrecautions,
  setStructuredPrecautions,
  customPrecautions,
  setCustomPrecautions,
  dismissedPrecautionIds,
  setDismissedPrecautionIds,
  redFlags,
  setRedFlags,
  redFlagChecklist,
  setRedFlagChecklist,
  dismissedRedFlagIds,
  setDismissedRedFlagIds,
  currentMedications,
  setCurrentMedications,
  medicalHistory,
  setMedicalHistory,
  previousSurgeries,
  setPreviousSurgeries,
  attachments,
  onPersistAttachments,
  onSaveMasterAndEpisode,
  isSaving,
  saveSuccess,
}) => {
  const { bi, language } = useLanguage();

  const [sectionFilter, setSectionFilter] = useState<HistorySectionFilter>('safety_history');

  // Safety & Red Flags Modal Draft State
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [safetyModalTab, setSafetyModalTab] = useState<SafetyModalTab>('precautions');
  const [draftContraindications, setDraftContraindications] = useState(contraindications);
  const [draftStructuredPrecautions, setDraftStructuredPrecautions] =
    useState<StructuredPrecautionId[]>(structuredPrecautions);
  const [draftCustomPrecautions, setDraftCustomPrecautions] =
    useState<CustomPrecautionItem[]>(customPrecautions);
  const [draftDismissedPrecautionIds, setDraftDismissedPrecautionIds] =
    useState<string[]>(dismissedPrecautionIds);
  const [draftRedFlags, setDraftRedFlags] = useState(redFlags);
  const [draftRedFlagChecklist, setDraftRedFlagChecklist] =
    useState<PatientRedFlagChecklistItem[]>(redFlagChecklist);
  const [draftDismissedRedFlagIds, setDraftDismissedRedFlagIds] =
    useState<string[]>(dismissedRedFlagIds);
  const [newPrecautionText, setNewPrecautionText] = useState('');

  // History & Surgeries Modal Draft State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [draftMedicalHistory, setDraftMedicalHistory] = useState(medicalHistory);
  const [draftPreviousSurgeries, setDraftPreviousSurgeries] = useState(previousSurgeries);

  const openSafetyModal = (initialTab: SafetyModalTab = 'precautions') => {
    setDraftContraindications(contraindications);
    setDraftStructuredPrecautions([...structuredPrecautions]);
    setDraftCustomPrecautions([...customPrecautions]);
    setDraftDismissedPrecautionIds([...dismissedPrecautionIds]);
    setDraftRedFlags(redFlags);
    setDraftRedFlagChecklist([...redFlagChecklist]);
    setDraftDismissedRedFlagIds([...dismissedRedFlagIds]);
    setNewPrecautionText('');
    setSafetyModalTab(initialTab);
    setIsSafetyModalOpen(true);
  };

  const openHistoryModal = () => {
    setDraftMedicalHistory(medicalHistory);
    setDraftPreviousSurgeries(previousSurgeries);
    setIsHistoryModalOpen(true);
  };

  const handleSaveSafetyModal = async () => {
    setContraindications(draftContraindications);
    setStructuredPrecautions(draftStructuredPrecautions);
    setCustomPrecautions(draftCustomPrecautions);
    setDismissedPrecautionIds(draftDismissedPrecautionIds);
    setRedFlags(draftRedFlags);
    setRedFlagChecklist(draftRedFlagChecklist);
    setDismissedRedFlagIds(draftDismissedRedFlagIds);

    await onSaveMasterAndEpisode({
      contraindications: draftContraindications,
      structuredPrecautions: draftStructuredPrecautions,
      customPrecautions: draftCustomPrecautions,
      dismissedPrecautionIds: draftDismissedPrecautionIds,
      redFlags: draftRedFlags,
      redFlagChecklist: draftRedFlagChecklist,
      dismissedRedFlagIds: draftDismissedRedFlagIds,
    });
    setIsSafetyModalOpen(false);
  };

  const handleSaveHistoryModal = async () => {
    setMedicalHistory(draftMedicalHistory);
    setPreviousSurgeries(draftPreviousSurgeries);

    await onSaveMasterAndEpisode({
      medicalHistory: draftMedicalHistory,
      previousSurgeries: draftPreviousSurgeries,
    });
    setIsHistoryModalOpen(false);
  };

  const appendChipValue = (current: string, snippet: string): string => {
    const trimmed = current.trim();
    if (!trimmed) return snippet;
    if (trimmed.includes(snippet)) return current;
    return `${trimmed}، ${snippet}`;
  };

  const addCustomPrecaution = () => {
    const trimmed = newPrecautionText.trim();
    if (!trimmed) return;
    const newId = `custom_prec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setDraftCustomPrecautions((prev) => [
      ...prev,
      { id: newId, labelAr: trimmed, labelEn: trimmed, createdAt: new Date().toISOString() },
    ]);
    setDraftStructuredPrecautions((prev) => [...prev, newId]);
    setNewPrecautionText('');
  };

  // Active safety read-only summary data
  const activePrecautionLabels = useMemo(() => {
    const labels: string[] = [];
    for (const id of structuredPrecautions) {
      const cat = STRUCTURED_PRECAUTIONS_CATALOG.find((item) => item.id === id);
      if (cat) {
        labels.push(bi(cat.labelAr, cat.labelEn, cat.labelCkb));
      } else {
        const cust = customPrecautions.find((item) => item.id === id);
        if (cust) labels.push(bi(cust.labelAr, cust.labelEn || cust.labelAr, cust.labelCkb || cust.labelAr));
      }
    }
    return labels;
  }, [structuredPrecautions, customPrecautions, bi]);

  const activeRedFlags = useMemo(
    () => redFlagChecklist.filter((item) => item.status === 'present'),
    [redFlagChecklist]
  );

  const totalRedCount =
    (contraindications.trim() ? 1 : 0) +
    activeRedFlags.length +
    (redFlags.trim() ? 1 : 0);
  const totalSafetyCount = totalRedCount + activePrecautionLabels.length;

  const draftRedFlagCount = draftRedFlagChecklist.filter((c) => c.status === 'present').length;

  const showSafetyAndHistory = sectionFilter === 'safety_history';
  const showImaging = sectionFilter === 'imaging';

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Compact Top Focus Bar + Segmented Section Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-1 min-w-0">
          <span className="font-bold text-foreground">
            {bi('الملف الطبي والأمان', 'Medical Face Sheet', 'تۆماری پزیشکی و سەلامەتی')}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {totalSafetyCount > 0
              ? bi(`${totalSafetyCount} تنبيهات أمان`, `${totalSafetyCount} safety alerts`, `${totalSafetyCount} ئاگاداری سەلامەتی`)
              : bi('خالي من الموانع', 'Safety clear', 'بێ قەدەغەکراو')}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {bi(`${attachments.length} تقارير`, `${attachments.length} reports`, `${attachments.length} ڕاپۆرت`)}
          </span>
          {saveSuccess && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                {bi('تم الحفظ', 'Saved', 'پاشەکەوتکرا')}
              </span>
            </>
          )}
        </div>

        <div
          role="tablist"
          aria-label={bi('تصفية السجل المرضي', 'Filter Medical History', 'پاڵاوتنی تۆماری نەخۆشی')}
          className="inline-flex items-center gap-1 p-1 rounded-2xl bg-surface/80 max-w-full overflow-x-auto"
        >
          {(
            [
              { id: 'safety_history', ar: 'الأمان والتاريخ', en: 'Safety & History', ckb: 'سەلامەتی و مێژوو' },
              { id: 'imaging', ar: 'الأشعة والمرفقات', en: 'Imaging & Files', ckb: 'تیشک و هاوپێچەکان' },
            ] as const
          ).map((tab) => {
            const active = sectionFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSectionFilter(tab.id)}
                className={`compact-btn min-h-[36px] px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground-1 hover:text-foreground'
                }`}
              >
                {bi(tab.ar, tab.en, tab.ckb)}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION A: Clinical Safety, Red Flags & Chronic History */}
      {showSafetyAndHistory && (
        <div className="space-y-4">
          {/* 1. Read-First Clinical Safety & Red Flags Card */}
          <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`size-8 rounded-xl flex items-center justify-center shrink-0 ${
                    totalRedCount > 0
                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                      : activePrecautionLabels.length > 0
                      ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  {totalSafetyCount > 0 ? (
                    <ShieldAlert className="size-4" />
                  ) : (
                    <ShieldCheck className="size-4" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <h2 className="text-xs sm:text-sm font-bold text-foreground">
                    {bi(
                      'السلامة السريرية والعلامات الحمراء',
                      'Clinical Safety & Red Flags',
                      'سەلامەتی کلینیکی و نیشانە سوورەکان'
                    )}
                  </h2>
                  {totalSafetyCount > 0 && (
                    <span
                      className={`text-xs font-mono font-bold tabular-nums ${
                        totalRedCount > 0
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-orange-600 dark:text-orange-400'
                      }`}
                    >
                      · <bdi dir="ltr">{totalSafetyCount}</bdi>
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => openSafetyModal('precautions')}
                className="compact-btn min-h-[40px] px-3.5 rounded-xl bg-surface/90 hover:bg-surface text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Edit3 className="size-3.5 text-primary" />
                <span>
                  {totalSafetyCount > 0
                    ? bi('فحص / تعديل الأمان', 'Review / Edit Safety', 'پشکنین / دەستکاری سەلامەتی')
                    : bi('فحص الأمان والمحاذير', 'Screen Safety & Flags', 'پشکنینی سەلامەتی')}
                </span>
              </button>
            </div>

            {totalSafetyCount === 0 ? (
              <p className="text-xs text-muted-foreground-1 leading-relaxed py-1">
                {bi(
                  'لم يتم تسجيل موانع استعمال أو علامات حمراء — اضغط «فحص الأمان والمحاذير» عند التقييم الأولي.',
                  'No contraindications, modality precautions, or red flags recorded — screen during initial evaluation.',
                  'هیچ قەدەغەکراوێک یان نیشانەیەکی سوور تۆمار نەکراوە — لە کاتی هەڵسەنگاندنی سەرەتاییدا بیپشکنە.'
                )}
              </p>
            ) : (
              <div className="space-y-2.5 pt-1">
                {contraindications.trim() && (
                  <div className="p-3 rounded-xl bg-surface/65 flex items-start gap-2.5 text-xs">
                    <ShieldAlert className="size-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-0.5">
                      <span className="font-bold text-rose-700 dark:text-rose-400 block">
                        {bi('موانع الاستعمال:', 'Contraindications:', 'قەدەغەکراوەکان:')}
                      </span>
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                        {localizeDemoText(contraindications.trim(), language)}
                      </p>
                    </div>
                  </div>
                )}

                {activePrecautionLabels.length > 0 && (
                  <div className="p-3 rounded-xl bg-surface/65 flex items-start gap-2.5 text-xs">
                    <AlertTriangle className="size-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-1">
                      <span className="font-bold text-orange-600 dark:text-orange-400 block">
                        {bi('محاذير الأجهزة النشطة:', 'Active Modality Precautions:', 'ئاگادارییە چالاکەکانی ئامێرەکان:')}
                      </span>
                      <p className="text-foreground leading-relaxed">
                        {activePrecautionLabels.join(' · ')}
                      </p>
                    </div>
                  </div>
                )}

                {(activeRedFlags.length > 0 || redFlags.trim()) && (
                  <div className="p-3 rounded-xl bg-surface/65 flex items-start gap-2.5 text-xs">
                    <ShieldAlert className="size-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-1">
                      <span className="font-bold text-rose-700 dark:text-rose-400 block">
                        {bi('العلامات الحمراء المرصودة:', 'Flagged Red Flags:', 'نیشانە سوورە تۆمارکراوەکان:')}
                      </span>
                      {activeRedFlags.length > 0 && (
                        <ul className="space-y-1 text-foreground">
                          {activeRedFlags.map((rf) => (
                            <li key={rf.itemId} className="leading-snug">
                              • {bi(rf.labelAr, rf.labelEn)}
                            </li>
                          ))}
                        </ul>
                      )}
                      {redFlags.trim() && (
                        <p className="text-muted-foreground-1 leading-relaxed whitespace-pre-wrap pt-0.5">
                          {localizeDemoText(redFlags.trim(), language)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Read-First Chronic Medical History & Previous Surgeries Card */}
          <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <ClipboardList className="size-4" />
                </div>
                <h2 className="text-xs sm:text-sm font-bold text-foreground">
                  {bi(
                    'الأمراض المزمنة والعمليات الجراحية',
                    'Chronic Medical History & Surgeries',
                    'نەخۆشییە درێژخایەنەکان و نەشتەرگەرییەکان'
                  )}
                </h2>
              </div>

              <button
                type="button"
                onClick={openHistoryModal}
                className="compact-btn min-h-[40px] px-3.5 rounded-xl bg-surface/90 hover:bg-surface text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Edit3 className="size-3.5 text-primary" />
                <span>{bi('تعديل', 'Edit', 'دەستکاری')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-surface/55 space-y-1">
                <span className="text-xs font-semibold text-muted-foreground-1 block">
                  {bi('الأمراض المزمنة والتاريخ المرضي', 'Chronic Conditions & Medical History', 'نەخۆشییە درێژخایەنەکان')}
                </span>
                <p
                  className={`text-xs leading-relaxed whitespace-pre-wrap ${
                    medicalHistory.trim() ? 'text-foreground font-medium' : 'text-muted-foreground-2'
                  }`}
                >
                  {localizeDemoText(medicalHistory.trim(), language) ||
                    bi('لا توجد أمراض مزمنة مسجلة', 'No chronic conditions recorded', 'هیچ نەخۆشییەکی درێژخایەن تۆمار نەکراوە')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-surface/55 space-y-1">
                <span className="text-xs font-semibold text-muted-foreground-1 block">
                  {bi('العمليات الجراحية السابقة', 'Previous Surgeries', 'نەشتەرگەرییەکانی پێشوو')}
                </span>
                <p
                  className={`text-xs leading-relaxed whitespace-pre-wrap ${
                    previousSurgeries.trim() ? 'text-foreground font-medium' : 'text-muted-foreground-2'
                  }`}
                >
                  {localizeDemoText(previousSurgeries.trim(), language) ||
                    bi('لا توجد عمليات جراحية مسجلة', 'No previous surgeries recorded', 'هیچ نەشتەرگەرییەک تۆمار نەکراوە')}
                </p>
              </div>
            </div>
          </div>

          {/* 3. Read-First Patient Medication Schedule */}
          <Suspense fallback={null}>
            <OrganMedicationSchedule
              patientId={patient.id}
              currentMedicationsText={currentMedications}
              onUpdateMedicationsText={(summary) => setCurrentMedications(summary)}
            />
          </Suspense>
        </div>
      )}

      {/* SECTION B: Unified Clinical Imaging Reports & Encrypted Posture/File Gallery */}
      {showImaging && (
        <div className="space-y-4">
          <Suspense fallback={null}>
            <PatientImagingReportsPanel
              patientId={patient.id}
              episodeId={activeEpisode?.id}
              attachments={attachments}
              onPersistAttachments={onPersistAttachments}
            />
            <PatientAttachmentsPanel patientId={patient.id} episodeId={activeEpisode?.id} />
          </Suspense>
        </div>
      )}

      {/* MODAL 1: Clinical Safety & Red Flags Bottom Sheet */}
      <ModalDialog
        isOpen={isSafetyModalOpen}
        onOpenChange={setIsSafetyModalOpen}
        title={bi(
          'فحص السلامة السريرية والعلامات الحمراء',
          'Clinical Safety & Red-Flag Screening',
          'پشکنینی سەلامەتی کلینیکی و نیشانە سوورەکان'
        )}
        subtitle={bi(
          'تحديث موانع الاستعمال ومحاذير الأجهزة وقائمة العلامات الحمراء — يُحفظ مباشرة في ملف المريض',
          'Update contraindications, device precautions, and red-flag screening',
          'نوێکردنەوەی قەدەغەکراوەکان و ئاگاداری ئامێرەکان — ڕاستەوخۆ پاشەکەوت دەکرێت'
        )}
        size="lg"
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setIsSafetyModalOpen(false)}
              className="compact-btn min-h-[44px] px-4 rounded-xl bg-surface hover:bg-surface/80 text-foreground text-xs font-bold cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSaveSafetyModal()}
              className="compact-btn min-h-[44px] px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-60"
            >
              {isSaving
                ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                : bi('حفظ وتحديث الأمان', 'Save Safety Profile', 'پاشەکەوتکردنی سەلامەتی')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Sub-tabs inside Safety Modal */}
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-surface/80">
            <button
              type="button"
              onClick={() => setSafetyModalTab('precautions')}
              className={`compact-btn min-h-[38px] px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                safetyModalTab === 'precautions'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground-1 hover:text-foreground'
              }`}
            >
              {bi('الموانع ومحاذير الأجهزة', 'Contraindications & Devices', 'قەدەغەکراوەکان و ئامێرەکان')}
              {draftStructuredPrecautions.length > 0 && (
                <span className="ms-1.5 font-mono tabular-nums text-orange-600 dark:text-orange-400">
                  ({draftStructuredPrecautions.length})
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSafetyModalTab('red_flags')}
              className={`compact-btn min-h-[38px] px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                safetyModalTab === 'red_flags'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground-1 hover:text-foreground'
              }`}
            >
              {bi('العلامات الحمراء حسب المنطقة', 'Regional Red Flags', 'نیشانە سوورەکان بەپێی ناوچە')}
              {draftRedFlagCount > 0 && (
                <span className="ms-1.5 font-mono tabular-nums text-rose-700 dark:text-rose-400">
                  ({draftRedFlagCount})
                </span>
              )}
            </button>
          </div>

          {safetyModalTab === 'precautions' && (
            <div className="space-y-4">
              {/* Contraindications Free-Text + Quick Iraqi Clinical Chips */}
              <div className="space-y-2">
                <label
                  htmlFor="profile-contraindications"
                  className="text-xs font-bold text-rose-700 dark:text-rose-400 block"
                >
                  {bi(
                    'موانع الاستعمال والمحاذير الحرجة:',
                    'Contraindications & Critical Warnings:',
                    'قەدەغەکراوە پزیشکییەکان و ئاگادارییەکان:'
                  )}
                </label>

                <div className="flex flex-wrap gap-1.5">
                  {QUICK_CONTRAINDICATION_CHIPS.map((chip) => {
                    const txt = bi(chip.ar, chip.en, chip.ckb);
                    return (
                      <button
                        key={chip.en}
                        type="button"
                        onClick={() =>
                          setDraftContraindications((prev) => appendChipValue(prev, txt))
                        }
                        className="compact-btn min-h-[34px] px-2.5 py-1 rounded-xl bg-surface hover:bg-surface/80 text-xs text-foreground cursor-pointer transition-colors"
                      >
                        + {txt}
                      </button>
                    );
                  })}
                </div>

                <AutoResizeTextarea
                  id="profile-contraindications"
                  minRows={2}
                  value={draftContraindications}
                  onChange={(e) => setDraftContraindications(e.target.value)}
                  placeholder={bi(
                    'مثال: منظم ضربات قلب (يمنع TENS/Diathermy)، تثبيت فقرات، هشاشة عظام...',
                    'e.g., Pacemaker, recent DVT, weight-bearing restriction...',
                    'نموونە: ڕێکخەری لێدانی دڵ (TENS قەدەغەیە)...'
                  )}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>

              {/* Structured Precautions Grid */}
              <div className="pt-3 border-t border-black/[0.045] dark:border-white/[0.06] space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>
                    {bi(
                      'المحاذير السريرية المهيكلة (لتنبيهات سلامة الأجهزة):',
                      'Structured Clinical Precautions (Modality Safety Alerts):',
                      'ئاگادارییە کلینیکییە ڕێکخراوەکان (بۆ سەلامەتی ئامێرەکان):'
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {STRUCTURED_PRECAUTIONS_CATALOG.filter(
                    (item) => !draftDismissedPrecautionIds.includes(item.id)
                  ).map((item) => {
                    const checked = draftStructuredPrecautions.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        data-testid={`chart-precaution-${item.id}`}
                        className={`flex items-center justify-between gap-2 px-3 py-2 min-h-[42px] rounded-xl text-xs transition-colors ${
                          checked
                            ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                            : 'bg-surface/70 text-foreground hover:bg-surface'
                        }`}
                      >
                        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setDraftStructuredPrecautions((prev) =>
                                prev.includes(item.id)
                                  ? prev.filter((id) => id !== item.id)
                                  : [...prev, item.id]
                              )
                            }
                            className="size-4 accent-primary rounded shrink-0"
                          />
                          <span className="leading-snug">
                            {bi(item.labelAr, item.labelEn, item.labelCkb)}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setDraftDismissedPrecautionIds((prev) => [...prev, item.id]);
                            setDraftStructuredPrecautions((prev) =>
                              prev.filter((id) => id !== item.id)
                            );
                          }}
                          title={bi('حذف هذا المحذور', 'Delete this precaution', 'سڕینەوەی ئەم ئاگادارییە')}
                          className={`p-1.5 rounded transition-colors shrink-0 cursor-pointer ${
                            checked
                              ? 'text-primary-foreground/80 hover:text-primary-foreground'
                              : 'text-muted-foreground-2 hover:text-rose-600'
                          }`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {draftCustomPrecautions.map((item) => {
                    const checked = draftStructuredPrecautions.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        data-testid={`chart-precaution-${item.id}`}
                        className={`flex items-center justify-between gap-2 px-3 py-2 min-h-[42px] rounded-xl text-xs transition-colors ${
                          checked
                            ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                            : 'bg-surface/70 text-foreground hover:bg-surface'
                        }`}
                      >
                        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setDraftStructuredPrecautions((prev) =>
                                prev.includes(item.id)
                                  ? prev.filter((id) => id !== item.id)
                                  : [...prev, item.id]
                              )
                            }
                            className="size-4 accent-primary rounded shrink-0"
                          />
                          <span className="leading-snug">
                            {bi(item.labelAr, item.labelEn || item.labelAr, item.labelCkb || item.labelAr)}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setDraftCustomPrecautions((prev) =>
                              prev.filter((p) => p.id !== item.id)
                            );
                            setDraftStructuredPrecautions((prev) =>
                              prev.filter((id) => id !== item.id)
                            );
                          }}
                          title={bi('حذف هذا المحذور المخصص', 'Delete this custom precaution', 'سڕینەوەی ئەم ئاگادارییە')}
                          className={`p-1.5 rounded transition-colors shrink-0 cursor-pointer ${
                            checked
                              ? 'text-primary-foreground/80 hover:text-primary-foreground'
                              : 'text-muted-foreground-2 hover:text-rose-600'
                          }`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 pt-1 min-w-0">
                  <input
                    type="text"
                    value={newPrecautionText}
                    onChange={(e) => setNewPrecautionText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomPrecaution();
                      }
                    }}
                    placeholder={bi(
                      'إضافة محذور سريري مخصص جديد...',
                      'Add new custom clinical precaution...',
                      'زیادکردنی ئاگاداری کلینیکی نوێ...'
                    )}
                    className="flex-1 min-w-0 w-0 min-h-[40px] px-3 py-1.5 text-xs rounded-xl bg-surface/80 text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                  <button
                    type="button"
                    onClick={addCustomPrecaution}
                    className="compact-btn min-h-[40px] inline-flex items-center gap-1 px-3 rounded-xl text-xs font-bold bg-surface/90 hover:bg-surface text-orange-600 dark:text-orange-400 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Plus className="size-3.5" />
                    <span>{bi('إضافة', 'Add', 'زیادکردن')}</span>
                  </button>
                </div>

                {draftDismissedPrecautionIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDraftDismissedPrecautionIds([])}
                    className="text-xs text-primary hover:underline font-semibold block pt-1 cursor-pointer"
                  >
                    {bi(
                      'استعادة المحاذير الافتراضية المحذوفة',
                      'Restore default precautions',
                      'گەڕاندنەوەی ئاگادارییە سەرەتاییەکان'
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {safetyModalTab === 'red_flags' && (
            <RedFlagChecklistPanel
              checklist={draftRedFlagChecklist}
              onChange={setDraftRedFlagChecklist}
              redFlagsText={draftRedFlags}
              onRedFlagsTextChange={setDraftRedFlags}
              dismissedItemIds={draftDismissedRedFlagIds}
              onDismissedItemIdsChange={setDraftDismissedRedFlagIds}
            />
          )}
        </div>
      </ModalDialog>

      {/* MODAL 2: Chronic Medical History & Previous Surgeries Bottom Sheet */}
      <ModalDialog
        isOpen={isHistoryModalOpen}
        onOpenChange={setIsHistoryModalOpen}
        title={bi(
          'تعديل التاريخ المرضي والعمليات الجراحية',
          'Edit Medical History & Previous Surgeries',
          'دەستکاریکردنی مێژووی نەخۆشی و نەشتەرگەرییەکان'
        )}
        subtitle={bi(
          'اختر من الأمراض الشائعة للإضافة السريعة أو اكتب التفاصيل يدوياً',
          'Tap quick chronic conditions or enter surgical history details',
          'لە نەخۆشییە باوەکان هەڵبژێرە یان وردەکارییەکان بنووسە'
        )}
        size="md"
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setIsHistoryModalOpen(false)}
              className="compact-btn min-h-[44px] px-4 rounded-xl bg-surface hover:bg-surface/80 text-foreground text-xs font-bold cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSaveHistoryModal()}
              className="compact-btn min-h-[44px] px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-60"
            >
              {isSaving
                ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                : bi('حفظ التاريخ المرضي', 'Save Medical History', 'پاشەکەوتکردنی مێژوو')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="profile-medical-history" className="text-xs font-bold text-foreground block">
              {bi('الأمراض المزمنة والتاريخ المرضي:', 'Medical History:', 'نەخۆشییە درێژخایەنەکان و مێژووی نەخۆشی:')}
            </label>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_CHRONIC_CONDITIONS.map((cond) => {
                const txt = bi(cond.ar, cond.en, cond.ckb);
                return (
                  <button
                    key={cond.en}
                    type="button"
                    onClick={() =>
                      setDraftMedicalHistory((prev) => appendChipValue(prev, txt))
                    }
                    className="compact-btn min-h-[34px] px-2.5 py-1 rounded-xl bg-surface hover:bg-surface/80 text-xs text-foreground cursor-pointer transition-colors"
                  >
                    + {txt}
                  </button>
                );
              })}
            </div>

            <AutoResizeTextarea
              id="profile-medical-history"
              minRows={3}
              value={draftMedicalHistory}
              onChange={(e) => setDraftMedicalHistory(e.target.value)}
              placeholder={bi(
                'مثال: سكري النوع الثاني، ارتفاع ضغط الدم...',
                'e.g., Type 2 Diabetes, Hypertension...',
                'نموونە: شەکرە، بەرزی پەستانی خوێن...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-previous-surgeries" className="text-xs font-bold text-foreground block">
              {bi('العمليات الجراحية السابقة:', 'Previous Surgeries:', 'نەشتەرگەرییەکانی پێشوو:')}
            </label>
            <AutoResizeTextarea
              id="profile-previous-surgeries"
              minRows={3}
              value={draftPreviousSurgeries}
              onChange={(e) => setDraftPreviousSurgeries(e.target.value)}
              placeholder={bi(
                'مثال: ترميم الرباط الصليبي الأيمن (2025)، تثبيت فقرات...',
                'e.g., Right ACL reconstruction (2025)...',
                'نموونە: نەشتەرگەری ئەژنۆ (2025)...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>
      </ModalDialog>
    </div>
  );
};
