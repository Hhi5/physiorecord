import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck2,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Compass,
  Copy,
  Edit3,
  MoreHorizontal,
  Plus,
  Printer,
  Send,
  ShieldAlert,
  Star,
  Stethoscope,
  User,
  Wallet,
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
import { formatDateDDMMYYYY } from '../../../utils/date';
import { getPatientDisplayName, getPatientMrn, isDemoPatient } from '../../../utils/mrn';
import type { PrintableDocumentType } from '../../print/PrintDocumentModal';
import { Money, Num } from '../../ui/Primitives';
import { ClampedMenuPanel } from '../../ui/ClampedMenuPanel';

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
  shortLabel?: string;
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

// Legacy pass-through kept for backwards compatibility; controls now live in ChartHeroAndUtilityStrip.
export const ChartHeaderBar: React.FC<ChartHeaderBarProps> = () => null;

const NEW_EPISODE_OPTION = '__new_episode__';

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
  isPinned?: boolean;
  onTogglePinned?: (next: boolean) => void;
  onBackToDirectory?: () => void;
  onPrintComprehensiveReport?: () => void;
  onOpenEditPersonalInfo?: () => void;
  /** Clinical red flags & contraindications (rendered in red text). */
  redAlerts?: string[];
  /** Clinical precautions (rendered in orange text). */
  cautionAlerts?: string[];
  isContextCollapsed?: boolean;
  onToggleContextCollapsed?: () => void;
  onStartChartTour?: () => void;
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
  isPinned = false,
  onTogglePinned,
  onBackToDirectory,
  onPrintComprehensiveReport,
  onOpenEditPersonalInfo,
  redAlerts = [],
  cautionAlerts = [],
  isContextCollapsed = false,
  onToggleContextCollapsed,
  onStartChartTour,
}) => {
  const { language, bi } = useLanguage();
  const [mrnCopied, setMrnCopied] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isMoreMenuOpen]);

  useEffect(() => {
    setIsAlertsOpen(false);
  }, [patient.id]);

  const displayName = getPatientDisplayName(patient.data, language);
  const mrn = getPatientMrn(patient);
  const redCount = redAlerts.length;
  const cautionCount = cautionAlerts.length;
  const hasAlerts = redCount + cautionCount > 0;

  const redLabel =
    redCount === 1
      ? redAlerts[0]
      : redCount === 2
      ? bi('تنبيهان سريريان', '2 clinical alerts', '٢ ئاگاداری کلینیکی')
      : bi(`${redCount} تنبيهات سريرية`, `${redCount} clinical alerts`, `${redCount} ئاگاداری کلینیکی`);

  return (
    <div className="max-w-7xl mx-auto w-full space-y-2.5">
      <div className="pr-surface rounded-2xl px-3.5 py-3 sm:px-4 space-y-2">
        {/* Line 1: Identity + the only 2 actions the therapist needs here */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onBackToDirectory && (
            <button
              type="button"
              onClick={onBackToDirectory}
              title={bi('العودة إلى سجل المرضى', 'Back to Patient Directory', 'گەڕانەوە بۆ لیستی نەخۆشەکان')}
              className="compact-btn size-9 rounded-xl bg-surface/80 hover:bg-surface flex items-center justify-center text-foreground hover:text-primary transition-colors cursor-pointer shrink-0"
            >
              <ChevronLeft className="size-5 rtl:rotate-0 ltr:rotate-180" />
            </button>
          )}

          <div className="relative shrink-0 select-none hidden sm:block">
            <input
              ref={avatarFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label={bi('رفع صورة المريض', 'Upload patient photo', 'بارکردنی وێنەی نەخۆش')}
              onChange={onAvatarFileSelect}
            />
            <button
              type="button"
              onClick={() => avatarFileInputRef.current?.click()}
              title={bi('تغيير صورة المريض', 'Change patient photo', 'گۆڕینی وێنەی نەخۆش')}
              className="compact-btn size-10 rounded-full bg-primary/10 text-primary font-black text-base flex items-center justify-center overflow-hidden cursor-pointer relative group"
            >
              {patient.data.avatarUrl || patient.data.photoDataUrl ? (
                <img
                  src={patient.data.avatarUrl || patient.data.photoDataUrl}
                  alt={displayName}
                  className="size-full object-cover"
                />
              ) : (
                displayName.slice(0, 1) || <User className="size-5 text-primary" />
              )}
              <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="size-3.5 text-white" />
              </span>
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-sm sm:text-lg font-black text-foreground truncate">{displayName}</h1>
              {isDemoPatient(patient) && (
                <span className="text-xs font-extrabold tracking-wider text-orange-600 dark:text-orange-400 shrink-0">
                  DEMO
                </span>
              )}
              {isPinned && <Star className="size-3.5 fill-amber-500 text-amber-500 shrink-0" />}
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground-1 min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(mrn);
                    setMrnCopied(true);
                    setTimeout(() => setMrnCopied(false), 2000);
                  }
                }}
                title={bi('نسخ كود المريض', 'Copy MRN', 'کۆپیکردنی کۆد')}
                className="compact-btn inline-flex items-center gap-1 font-mono font-bold text-foreground/80 hover:text-primary transition-colors cursor-pointer shrink-0"
              >
                <span>{mrn}</span>
                {mrnCopied && <Check className="size-3 text-emerald-600" />}
                {!mrnCopied && <Copy className="size-3 opacity-60 hidden sm:inline" />}
              </button>
              <span>·</span>
              <span className="whitespace-nowrap">
                {patientAge ? `${patientAge} ${bi('سنة', 'yrs', 'ساڵ')}` : '—'}
              </span>
              <span>·</span>
              <span className="truncate">{genderLabel}</span>
            </div>
          </div>

          <button
            type="button"
            data-tour="chart-new-session-btn"
            onClick={onOpenNewSession}
            className="compact-btn h-9 px-3 sm:px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs inline-flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="size-4 shrink-0" />
            <span className="sm:hidden">{bi('جلسة', 'Session', 'دانیشتن')}</span>
            <span className="hidden sm:inline">{bi('جلسة جديدة', 'New Session', 'دانیشتنی نوێ')}</span>
          </button>

          {onStartChartTour && (
            <button
              type="button"
              data-testid="chart-header-tour-btn"
              onClick={onStartChartTour}
              title={bi('شرح سجل المريض (جولة تفاعلية)', 'Patient Chart Guide', 'ڕێبەری دۆسیەی نەخۆش')}
              aria-label={bi('شرح سجل المريض (جولة تفاعلية)', 'Patient Chart Guide', 'ڕێبەری دۆسیەی نەخۆش')}
              className="compact-btn size-9 rounded-xl bg-surface/80 hover:bg-surface text-muted-foreground-1 hover:text-primary flex items-center justify-center transition-colors cursor-pointer focus:outline-none shrink-0"
            >
              <Compass className="size-4" />
            </button>
          )}

          <div ref={moreMenuRef} className="relative shrink-0">
            <button
              type="button"
              data-tour="chart-more-btn"
              onClick={() => setIsMoreMenuOpen((v) => !v)}
              aria-label={bi('خيارات إضافية لملف المريض', 'More patient chart actions', 'بژاردەی زیاتر')}
              aria-expanded={isMoreMenuOpen}
              className="compact-btn size-9 rounded-xl bg-surface/80 hover:bg-surface text-muted-foreground-1 hover:text-foreground flex items-center justify-center transition-colors cursor-pointer focus:outline-none"
            >
              <MoreHorizontal className="size-4.5" />
            </button>

            {isMoreMenuOpen && (
              <ClampedMenuPanel className="absolute end-0 top-full mt-1.5 w-60 rounded-2xl bg-card shadow-2xl p-1.5 z-40 divide-y divide-black/[0.045] dark:divide-white/[0.06]">
                <div className="py-1 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      onOpenNewEpisode();
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-foreground hover:bg-surface flex items-center gap-2.5 cursor-pointer text-start"
                  >
                    <Plus className="size-4 text-primary shrink-0" />
                    <span>{bi('بدء حلقة رعاية جديدة', 'Start New Episode', 'دەستپێکردنی قۆناغی نوێ')}</span>
                  </button>
                  {onOpenEditPersonalInfo && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        onOpenEditPersonalInfo();
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-foreground hover:bg-surface flex items-center gap-2.5 cursor-pointer text-start"
                    >
                      <Edit3 className="size-4 text-primary shrink-0" />
                      <span>{bi('تعديل البيانات الشخصية', 'Edit Personal Info', 'دەستکاری زانیاری کەسی')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreMenuOpen(false);
                      avatarFileInputRef.current?.click();
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-foreground hover:bg-surface flex items-center gap-2.5 cursor-pointer text-start sm:hidden"
                  >
                    <Camera className="size-4 text-primary shrink-0" />
                    <span>{bi('تغيير صورة المريض', 'Change Photo', 'گۆڕینی وێنە')}</span>
                  </button>
                  {onPrintComprehensiveReport && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        onPrintComprehensiveReport();
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-foreground hover:bg-surface flex items-center gap-2.5 cursor-pointer text-start"
                    >
                      <Printer className="size-4 text-primary shrink-0" />
                      <span>{bi('طباعة تقرير طبي شامل', 'Print Comprehensive Report', 'چاپکردنی ڕاپۆرت')}</span>
                    </button>
                  )}
                  {onTogglePinned && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        const next = ClinicOperationsService.togglePinnedPatient(patient.id);
                        onTogglePinned(next);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-foreground hover:bg-surface flex items-center gap-2.5 cursor-pointer text-start"
                    >
                      <Star
                        className={`size-4 shrink-0 ${
                          isPinned ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground-1'
                        }`}
                      />
                      <span>
                        {isPinned
                          ? bi('إلغاء تثبيت المريض', 'Unpin Patient', 'لابردنی چەسپاندن')
                          : bi('تثبيت المريض في المفضلة', 'Pin Patient', 'چەسپاندنی نەخۆش')}
                      </span>
                    </button>
                  )}
                  {onStartChartTour && (
                    <button
                      type="button"
                      data-testid="chart-replay-tour-btn"
                      onClick={() => {
                        setIsMoreMenuOpen(false);
                        onStartChartTour();
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-foreground hover:bg-surface flex items-center gap-2.5 cursor-pointer text-start"
                    >
                      <Compass className="size-4 text-primary shrink-0" />
                      <span>
                        {bi(
                          'شرح سجل المريض (جولة تفاعلية)',
                          'Patient Chart Guide (Tour)',
                          'ڕێبەری دۆسیەی نەخۆش (گەشت)'
                        )}
                      </span>
                    </button>
                  )}
                </div>
                <div
                  role="status"
                  aria-live="polite"
                  className="pt-1.5 pb-1 px-3 flex items-center justify-between text-xs text-muted-foreground-1"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      {isSaving
                        ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت...')
                        : isDirty
                        ? bi('مزامنة تلقائية...', 'Auto-saving...', 'خەریکی پاشەکەوت...')
                        : bi('محفوظ تلقائياً', 'Auto-saved', 'خۆکار پاشەکەوتکرا')}
                    </span>
                  </span>
                  {lastSavedAt && (
                    <bdi dir="ltr" className="font-mono tabular-nums opacity-80">
                      {lastSavedAt}
                    </bdi>
                  )}
                </div>
              </ClampedMenuPanel>
            )}
          </div>
        </div>

        {/* Line 2: Episode + ONE compact alerts/debt line (text only, zero boxes) */}
        <div
          data-testid="clinical-summary-collapsible"
          data-tour="chart-episode-strip"
          className="pt-2 border-t border-black/[0.045] dark:border-white/[0.06] flex flex-wrap items-center gap-x-3 gap-y-1.5"
        >
          {episodes.length > 0 ? (
            <div className="relative order-1 min-w-0 flex-1 sm:flex-initial sm:max-w-xs">
              <select
                id="chart-episode-select"
                aria-label={bi('حلقة الرعاية', 'Episode of care', 'قۆناغی چاودێری')}
                value={activeEpisode?.id || ''}
                onChange={(e) => {
                  if (e.target.value === NEW_EPISODE_OPTION) {
                    onOpenNewEpisode();
                    return;
                  }
                  onSelectEpisode(e.target.value);
                }}
                className="peer appearance-none opacity-0 absolute inset-0 w-full h-9 !min-h-[36px] z-10 cursor-pointer"
              >
                {episodes.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.data.title || ep.data.medicalDiagnosis} (
                    {formatDateDDMMYYYY(ep.data.startDate || ep.startDate)})
                  </option>
                ))}
                <option value={NEW_EPISODE_OPTION}>
                  {bi('+ بدء حلقة جديدة', '+ Start new episode', '+ قۆناغی نوێ')}
                </option>
              </select>
              <div
                aria-hidden="true"
                className="h-9 ps-3 pe-8 rounded-xl text-xs font-bold bg-surface/80 peer-hover:bg-surface peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 text-foreground flex items-center transition-colors pointer-events-none select-none overflow-hidden"
              >
                <span className="truncate block min-w-0">
                  {activeEpisode
                    ? `${activeEpisode.data.title || activeEpisode.data.medicalDiagnosis} (${formatDateDDMMYYYY(
                        activeEpisode.data.startDate || activeEpisode.startDate
                      )})`
                    : ''}
                </span>
              </div>
              <ChevronDown className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground-1" />
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenNewEpisode}
              className="order-1 compact-btn h-9 px-3 rounded-xl text-xs font-bold bg-primary/10 text-primary hover:bg-primary/15 cursor-pointer whitespace-nowrap transition-colors"
            >
              {bi('+ حلقة جديدة', '+ New Episode', '+ قۆناغی نوێ')}
            </button>
          )}

          {onToggleContextCollapsed && (
            <button
              type="button"
              data-testid="toggle-clinical-summary-btn"
              onClick={onToggleContextCollapsed}
              title={
                isContextCollapsed
                  ? bi('إظهار الملخص السريري', 'Show clinical summary', 'پیشاندانی پوختە')
                  : bi('طيّ الملخص السريري', 'Collapse clinical summary', 'شاردنەوەی پوختە')
              }
              className="order-2 sm:order-last compact-btn ms-auto size-8 rounded-xl text-muted-foreground-1 hover:text-foreground hover:bg-surface/80 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 self-center"
            >
              {isContextCollapsed ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronUp className="size-3.5" />
              )}
            </button>
          )}

          {(hasAlerts || totalDebtIQD > 0 || (enableReferralsModule && hasReferralAttribution)) && (
            <span className="order-3 basis-full h-0 sm:hidden" aria-hidden="true" />
          )}

          {hasAlerts && (
            <button
              type="button"
              onClick={() => setIsAlertsOpen((v) => !v)}
              aria-expanded={isAlertsOpen}
              className="order-4 sm:order-2 compact-btn h-6 inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer min-w-0 max-w-[205px] sm:max-w-md hover:underline"
            >
              {redCount > 0 ? (
                <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 min-w-0">
                  <ShieldAlert className="size-3.5 shrink-0" />
                  {redCount === 1 ? (
                    <>
                      <span className="sm:hidden whitespace-nowrap">
                        {bi('تنبيه سريري', 'Clinical alert', 'ئاگاداری کلینیکی')}
                      </span>
                      <span className="hidden sm:inline truncate">{redLabel}</span>
                    </>
                  ) : (
                    <span className="truncate">{redLabel}</span>
                  )}
                </span>
              ) : null}
              {cautionCount > 0 && (
                <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 shrink-0 whitespace-nowrap">
                  {redCount === 0 && <AlertTriangle className="size-3.5 shrink-0" />}
                  {redCount > 0 && <span className="text-muted-foreground-2">·</span>}
                  <span>
                    {bi('محاذير', 'Precautions', 'ئاگاداری')} (<Num value={cautionCount} />)
                  </span>
                </span>
              )}
            </button>
          )}

          {totalDebtIQD > 0 && (
            <button
              type="button"
              onClick={() => onSelectTab('profile')}
              className="order-5 sm:order-3 compact-btn h-6 inline-flex items-center gap-1 text-xs tabular-nums font-bold text-orange-600 dark:text-orange-400 hover:underline whitespace-nowrap cursor-pointer"
            >
              <Wallet className="size-3.5 shrink-0" />
              <span>
                {bi('ذمة ', 'Due ', 'ماوە ')}
                <Money amount={totalDebtIQD} />
              </span>
            </button>
          )}

          {enableReferralsModule && hasReferralAttribution && (
            <span className="order-6 sm:order-4 inline-flex items-center gap-1.5 min-w-0">
              <span
                data-testid="patient-referral-pill"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary truncate"
              >
                <Stethoscope className="size-3.5 shrink-0" />
                <span className="truncate">{referralPillText}</span>
              </span>
              <button
                type="button"
                data-testid="open-report-back-btn"
                onClick={onOpenReportBackModal}
                title={bi('تقرير للطبيب المحيل', 'Report back to referrer', 'ڕاپۆرت بۆ پزیشکی ڕەوانەکار')}
                className="compact-btn h-7 inline-flex items-center gap-1 px-2 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold cursor-pointer whitespace-nowrap transition-colors"
              >
                <Send className="size-3 shrink-0" />
                <span>{bi('تقرير', 'Report', 'ڕاپۆرت')}</span>
              </button>
            </span>
          )}
        </div>

        {/* Expanded alert details (only on demand) */}
        {hasAlerts && isAlertsOpen && (
          <div className="pt-2 border-t border-black/[0.045] dark:border-white/[0.06] space-y-1.5">
            {redAlerts.map((text, idx) => (
              <p
                key={`r-${idx}`}
                className="flex items-start gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400 leading-relaxed"
              >
                <ShieldAlert className="size-3.5 shrink-0 mt-0.5" />
                <span>{text}</span>
              </p>
            ))}
            {cautionAlerts.map((text, idx) => (
              <p
                key={`c-${idx}`}
                className="flex items-start gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 leading-relaxed"
              >
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span>{text}</span>
              </p>
            ))}
            <button
              type="button"
              onClick={() => {
                setIsAlertsOpen(false);
                onSelectTab('history');
              }}
              className="compact-btn text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              {bi('تعديل في السجل المرضي ←', 'Edit in History →', 'دەستکاری لە مێژوو ←')}
            </button>
          </div>
        )}
      </div>

      {/* Re-Evaluation Due Nudge (orange text on neutral surface) */}
      {reEvalStatus.isDue && (
        <div
          data-testid="reeval-due-banner"
          className="pr-surface px-4 py-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-start gap-2">
            <Clock className="size-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold text-orange-600 dark:text-orange-400 block">
                {language === 'en'
                  ? reEvalStatus.reasonEn
                  : language === 'ckb'
                  ? reEvalStatus.reasonCkb
                  : reEvalStatus.reasonAr}
              </span>
              <span className="text-muted-foreground-1">
                {bi(
                  'يمكنك تسجيل لقطة إعادة تقييم جديدة من قسم التقييم والخطة.',
                  'Record a fresh Re-Evaluation Snapshot inside Evaluation & Plan.',
                  'دەتوانیت وێنەگرتنێکی نوێی دووبارە هەڵسەنگاندن تۆمار بکەیت.'
                )}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab('comparison')}
            className="min-h-[32px] px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold cursor-pointer shrink-0"
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
            className="pr-surface p-3.5 sm:p-4 rounded-2xl space-y-3 text-xs"
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
                  <span className="text-orange-600 dark:text-orange-400 font-bold tabular-nums">
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
                className={`text-xs font-bold flex items-center justify-between gap-2 ${
                  followUpFeedback.kind === 'error'
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-emerald-700 dark:text-emerald-400'
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
              <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06]">
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
                      className="py-2.5 first:pt-0 last:pb-0 space-y-2.5"
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
                          className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold cursor-pointer shrink-0"
                        >
                          {isEditing
                            ? bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')
                            : bi('تسجيل NPRS / PSFS', 'Log NPRS / PSFS', 'تۆمارکردنی NPRS / PSFS')}
                        </button>
                      </div>

                      {isEditing && (
                        <form
                          onSubmit={onSavePostDischargeFollowUp}
                          className="pt-2 border-t border-black/[0.045] dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
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
                              className="w-full px-3 py-1.5 rounded-xl bg-surface/80 text-xs text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/25"
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
                              className="w-full px-3 py-1.5 rounded-xl bg-surface/80 text-xs text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/25"
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
                              className="w-full px-3 py-1.5 rounded-xl bg-surface/80 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <button
                              type="submit"
                              className="w-full min-h-[36px] py-1.5 px-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
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
                        className="p-2.5 rounded-xl bg-surface/70 flex flex-wrap items-center justify-between gap-2 text-xs"
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
                            <span className="px-2 py-0.5 rounded-md bg-card">NPRS: {rec.nprsScore}/10</span>
                          )}
                          {rec.psfsScore !== undefined && (
                            <span className="px-2 py-0.5 rounded-md bg-card">PSFS: {rec.psfsScore}/10</span>
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

      {/* 4 Underline Tabs — always one line, even at 360px */}
      <div
        role="tablist"
        data-tour="chart-tabs"
        aria-label={bi('أقسام ملف المريض', 'Patient chart sections', 'بەشەکانی تۆماری نەخۆش')}
        className="grid grid-cols-4 sm:flex sm:items-center sm:justify-start sm:gap-6 border-b border-black/[0.06] dark:border-white/[0.08]"
      >
        {navigationTabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tour={`chart-tab-${tab.id}`}
              aria-selected={isSelected}
              onClick={() => onSelectTab(tab.id)}
              className={`compact-btn h-10 px-1 sm:px-2.5 text-xs border-b-2 inline-flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                isSelected
                  ? 'border-primary text-primary font-extrabold'
                  : 'border-transparent text-muted-foreground-1 hover:text-foreground font-semibold'
              }`}
            >
              <Icon className="size-3.5 hidden sm:inline shrink-0" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`hidden sm:inline text-xs font-mono tabular-nums ${
                    isSelected ? 'text-primary font-extrabold' : 'text-muted-foreground-2'
                  }`}
                >
                  (<Num value={tab.count} />)
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export type { PrintableDocumentType, EpisodeScopedClinicalStore };
