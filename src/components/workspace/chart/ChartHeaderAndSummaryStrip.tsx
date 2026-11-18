import React, { useRef, useState } from 'react';
import {
  Calendar,
  CalendarCheck2,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Copy,
  Layers,
  Plus,
  Printer,
  Send,
  Star,
  Stethoscope,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { ClinicOperationsService } from '../../../services/clinicOperationsService';
import type { EpisodeRecord, PatientRecord } from '../../../types/clinical';
import type {
  EpisodeScopedClinicalStore,
  FollowUpIntervalWeeks,
  PostDischargeFollowUpRecord,
} from '../../../types/clinicManagement';
import type { PostDischargeFollowUpDueItem } from '../../../utils/iraqReferralsRetentionC6C7';
import type { ReEvalNudgeEvaluation } from '../../../utils/reEvalNudge';
import { formatClinicalDate, formatDateDDMMYYYY } from '../../../utils/date';
import { getPatientDisplayName, getPatientMrn, isDemoPatient } from '../../../utils/mrn';
import type { PrintableDocumentType } from '../../print/PrintDocumentModal';
import { Money, Num } from '../../ui/Primitives';

export type ChartTabId =
  | 'overview'
  | 'history'
  | 'treatment'
  | 'sessions'
  | 'evaluation'
  | 'comparison'
  | 'profile'
  | 'hep';

export interface ChartNavigationTab {
  id: ChartTabId;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export interface ChartHeaderBarProps {
  patientId: string;
  isPinned: boolean;
  onTogglePinned: (next: boolean) => void;
  onBackToDirectory: () => void;
  onPrintComprehensiveReport: () => void;
}

export const ChartHeaderBar: React.FC<ChartHeaderBarProps> = ({
  patientId,
  isPinned,
  onTogglePinned,
  onBackToDirectory,
  onPrintComprehensiveReport,
}) => {
  const { bi } = useLanguage();

  return (
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
          onClick={onPrintComprehensiveReport}
          title={bi('طباعة تقرير شامل', 'Print Comprehensive Report', 'چاپکردنی ڕاپۆرت')}
          className="size-9 rounded-xl bg-surface hover:bg-muted/60 border border-line-2 flex items-center justify-center text-muted-foreground-1 hover:text-primary transition-colors cursor-pointer"
        >
          <Printer className="size-4.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            const next = ClinicOperationsService.togglePinnedPatient(patientId);
            onTogglePinned(next);
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
  );
};

export interface ChartHeroAndUtilityStripProps {
  patient: PatientRecord;
  patientAge: number | undefined;
  genderLabel: string;
  onAvatarFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  navigationTabs: ChartNavigationTab[];
  activeTab: ChartTabId;
  onSelectTab: (tab: ChartTabId) => void;
  episodes: EpisodeRecord[];
  activeEpisode: EpisodeRecord | null;
  onSelectEpisode: (epId: string) => void;
  onOpenNewEpisode: () => void;
  totalDebtIQD: number;
  enableReferralsModule: boolean;
  hasReferralAttribution: boolean;
  referralPillText: string;
  onOpenReportBackModal: () => void;
  isSaving: boolean;
  isDirty: boolean;
  lastSavedAt: string | null;
  activeWidgetCount: number;
  onOpenExamShelfModal: () => void;
  onOpenNewSession: () => void;
  reEvalStatus: ReEvalNudgeEvaluation;
  enableRetentionLists: boolean;
  duePostDischargeItems: PostDischargeFollowUpDueItem[];
  patientFollowUps: PostDischargeFollowUpRecord[];
  activeFollowUpTarget: {
    episodeId: string;
    episodeTitle: string;
    intervalWeeks: FollowUpIntervalWeeks;
    dischargeDate: string;
    dueDate: string;
  } | null;
  setActiveFollowUpTarget: React.Dispatch<
    React.SetStateAction<{
      episodeId: string;
      episodeTitle: string;
      intervalWeeks: FollowUpIntervalWeeks;
      dischargeDate: string;
      dueDate: string;
    } | null>
  >;
  followUpNprs: string;
  setFollowUpNprs: (v: string) => void;
  followUpPsfs: string;
  setFollowUpPsfs: (v: string) => void;
  followUpNotes: string;
  setFollowUpNotes: (v: string) => void;
  followUpFeedback: { kind: 'success' | 'error'; text: string } | null;
  setFollowUpFeedback: (v: { kind: 'success' | 'error'; text: string } | null) => void;
  onSavePostDischargeFollowUp: (e: React.FormEvent) => void;
}

export const ChartHeroAndUtilityStrip: React.FC<ChartHeroAndUtilityStripProps> = ({
  patient,
  patientAge,
  genderLabel,
  onAvatarFileSelect,
  navigationTabs,
  activeTab,
  onSelectTab,
  episodes,
  activeEpisode,
  onSelectEpisode,
  onOpenNewEpisode,
  totalDebtIQD,
  enableReferralsModule,
  hasReferralAttribution,
  referralPillText,
  onOpenReportBackModal,
  isSaving,
  isDirty,
  lastSavedAt,
  activeWidgetCount,
  onOpenExamShelfModal,
  onOpenNewSession,
  reEvalStatus,
  enableRetentionLists,
  duePostDischargeItems,
  patientFollowUps,
  activeFollowUpTarget,
  setActiveFollowUpTarget,
  followUpNprs,
  setFollowUpNprs,
  followUpPsfs,
  setFollowUpPsfs,
  followUpNotes,
  setFollowUpNotes,
  followUpFeedback,
  setFollowUpFeedback,
  onSavePostDischargeFollowUp,
}) => {
  const { language, bi } = useLanguage();
  const [mrnCopied, setMrnCopied] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* Patient Hero Card */}
      <div className="max-w-7xl mx-auto w-full">
        <div className="relative rounded-3xl p-4 sm:p-6 bg-gradient-to-br from-card via-card/95 to-primary/10 border border-primary/20 shadow-2xs overflow-hidden space-y-4">
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none select-none">
            <div className="absolute -top-12 -end-12 size-48 rounded-full border-2 border-primary/10 dark:border-primary/15" />
            <div className="absolute -top-6 -end-6 size-36 rounded-full border border-dashed border-primary/15 dark:border-primary/20" />
            <div className="absolute top-4 end-1/3 size-12 rounded-xl border-2 border-primary/10 dark:border-primary/15 rotate-45" />
            <div className="absolute -bottom-10 start-8 size-28 rounded-2xl border-2 border-primary/10 dark:border-primary/15 -rotate-12" />
            <div className="absolute -bottom-5 start-12 size-20 rounded-xl border border-dashed border-primary/15 dark:border-primary/20 -rotate-12" />
            <div className="absolute top-4 start-1/3 size-8 rounded-full border border-primary/15" />
            <div className="absolute bottom-3 end-12 size-5 rounded-full bg-primary/10" />
            <div className="absolute bottom-4 end-1/4 flex gap-2 opacity-25">
              <div className="size-1.5 rounded-full bg-primary" />
              <div className="size-1.5 rounded-full bg-primary" />
              <div className="size-1.5 rounded-full bg-primary" />
            </div>
            <div className="absolute top-6 end-16 opacity-20">
              <div className="relative size-5">
                <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-primary rounded-full" />
                <div className="absolute inset-y-0 start-1/2 w-0.5 -translate-x-1/2 bg-primary rounded-full" />
              </div>
            </div>
          </div>

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
              <div className="relative shrink-0 select-none">
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label={bi('رفع صورة المريض', 'Upload patient photo', 'بارکردنی وێنەی نەخۆش')}
                  onChange={onAvatarFileSelect}
                />
                <div className="size-16 rounded-full bg-gradient-to-br from-primary/20 via-sky-500/10 to-primary/5 border-2 border-primary/25 flex items-center justify-center text-primary font-black text-2xl shadow-inner select-none overflow-hidden">
                  {patient.data.avatarUrl || patient.data.photoDataUrl ? (
                    <img
                      src={patient.data.avatarUrl || patient.data.photoDataUrl}
                      alt={getPatientDisplayName(patient.data, language)}
                      className="size-full object-cover"
                    />
                  ) : (
                    getPatientDisplayName(patient.data, language).slice(0, 1) || (
                      <User className="size-7 text-primary" />
                    )
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
                    onClick={() => onSelectTab(tab.id)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                    }`}
                  >
                    <Icon className="size-3.5" />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] tabular-nums ${
                          isSelected
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-surface border border-line-2 text-muted-foreground-1'
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

      {/* Consolidated Workspace Utility Strip */}
      {activeTab !== 'profile' && activeTab !== 'history' && (
        <div
          data-testid="clinical-summary-collapsible"
          className="max-w-7xl mx-auto px-3 sm:px-4 py-2 rounded-xl bg-card shadow-2xs border border-card-line/60 space-y-2"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 sm:flex-initial">
                <label
                  htmlFor="chart-episode-select"
                  className="text-xs font-semibold text-muted-foreground-1 whitespace-nowrap shrink-0"
                >
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
                          {ep.data.title || ep.data.medicalDiagnosis} (
                          {formatDateDDMMYYYY(ep.data.startDate || ep.startDate)})
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

              {totalDebtIQD > 0 && (
                <span className="py-0.5 px-2 rounded-md bg-rose-500/10 text-xs tabular-nums font-bold text-rose-700 dark:text-rose-300 whitespace-nowrap">
                  {bi('ذمة: ', 'Due: ', 'ماوە: ')}
                  <Money amount={totalDebtIQD} />
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
                    onClick={onOpenReportBackModal}
                    className="min-h-[32px] inline-flex items-center gap-1 py-1 px-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Send className="size-3.5 shrink-0" />
                    <span>{bi('تقرير للمحيل', 'Report Back', 'ڕاپۆرت')}</span>
                  </button>
                </div>
              )}
            </div>

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
                      <bdi dir="ltr" className="hidden lg:inline font-mono tabular-nums opacity-80">
                        {lastSavedAt}
                      </bdi>
                    )}
                  </>
                )}
              </span>

              <button
                type="button"
                data-testid="open-exam-shelf-btn"
                onClick={onOpenExamShelfModal}
                className="min-h-[32px] py-1 px-2.5 rounded-lg bg-surface hover:bg-layer-hover text-foreground font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Layers className="size-3.5 text-primary" />
                <span>{bi('أدوات الفحص', 'Tools', 'ئامراز')}</span>
                <span className="font-mono text-primary tabular-nums">
                  <Num value={activeWidgetCount} />
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
            onClick={() => onSelectTab('comparison')}
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
                            <span className="text-primary font-bold">{intervalBadge}</span>
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
                          onSubmit={onSavePostDischargeFollowUp}
                          className="pt-2 border-t border-card-divider grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                        >
                          <div className="sm:col-span-3">
                            <label
                              htmlFor={`followup-nprs-${item.episodeId}`}
                              className="block text-xs font-semibold text-foreground mb-1"
                            >
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
                            <label
                              htmlFor={`followup-psfs-${item.episodeId}`}
                              className="block text-xs font-semibold text-foreground mb-1"
                            >
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
                            <label
                              htmlFor={`followup-notes-${item.episodeId}`}
                              className="block text-xs font-semibold text-foreground mb-1"
                            >
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
                          {rec.notes && <p className="text-xs text-muted-foreground-1">{rec.notes}</p>}
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
    </>
  );
};

export type { PrintableDocumentType, EpisodeScopedClinicalStore };
