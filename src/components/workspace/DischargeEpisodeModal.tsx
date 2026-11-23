// =======================================================================
// PhysioRecord — Treatment Completion / Discharge & Clinical Journey Modal
// Auto-computes Clinical Journey & Improvement Summary before closing care
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Printer,
  RotateCcw,
  Plus,
  TrendingDown,
  X,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../../types/clinical';
import type { EpisodeScopedClinicalStore } from '../../types/clinicManagement';
import {
  buildClinicalJourneySummary,
  type DischargeReasonCode,
} from '../../utils/treatmentJourneySummary';
import { formatDateDDMMYYYY, localDate } from '../../utils/date';
import { getPatientDisplayName } from '../../utils/mrn';
import { DatePickerInput, Num } from '../ui/Primitives';

export interface DischargeEpisodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientRecord;
  episode: EpisodeRecord | null;
  sessions: SessionRecord[];
  soaps: SoapNoteRecord[];
  episodeStore?: EpisodeScopedClinicalStore | null;
  onConfirmDischarge: (payload: {
    episodeId: string;
    endDate: string;
    dischargeReason: DischargeReasonCode;
    dischargeSummary: string;
    dischargeFinalOutcomeNote?: string;
  }) => Promise<void>;
  onReopenEpisode?: (episodeId: string) => Promise<void>;
  onStartNewEpisode?: () => void;
  onPrintDischargeReport?: () => void;
}

const DISCHARGE_REASONS: Array<{
  code: DischargeReasonCode;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
}> = [
  {
    code: 'goals_met',
    labelAr: 'تحقّق الأهداف العلاجية (شفاء / تحسّن كامل)',
    labelEn: 'Treatment Goals Met',
    descAr: 'أنهى المريض جلساته بنجاح ووصل للأهداف الوظيفية المطلوبة.',
    descEn: 'Patient completed sessions and achieved functional goals.',
  },
  {
    code: 'plateau',
    labelAr: 'وصول لأقصى تحسّن ممكن (استقرار الحالة)',
    labelEn: 'Maximum Benefit / Plateau',
    descAr: 'استقرت الحالة السريرية مع توصية ببرنامج تمارين منزلية للمتابعة.',
    descEn: 'Condition plateaued; transitioning to home maintenance program.',
  },
  {
    code: 'medical_referral',
    labelAr: 'تحويل لطبيب مختص / إجراء طبي',
    labelEn: 'Medical / Specialist Referral',
    descAr: 'تم إيقاف الجلسات لإحالة المريض لتقييم طبي أو جراحي إضافي.',
    descEn: 'Referred back to physician or specialist for further evaluation.',
  },
  {
    code: 'self_discharge',
    labelAr: 'إنهاء برغبة المريض',
    labelEn: 'Patient Self-Discharge',
    descAr: 'رغب المريض بإنهاء الخطة العلاجية في هذه المرحلة.',
    descEn: 'Patient elected to conclude physiotherapy at this stage.',
  },
];

export const DischargeEpisodeModal: React.FC<DischargeEpisodeModalProps> = ({
  isOpen,
  onClose,
  patient,
  episode,
  sessions,
  soaps,
  episodeStore,
  onConfirmDischarge,
  onReopenEpisode,
  onStartNewEpisode,
  onPrintDischargeReport,
}) => {
  const { bi, language } = useLanguage();
  const isRtl = language !== 'en';
  const isCompleted = episode?.status === 'completed';

  const [endDate, setEndDate] = useState<string>(() => episode?.endDate || localDate());
  const [dischargeReason, setDischargeReason] = useState<DischargeReasonCode>(
    episode?.data.dischargeReason || 'goals_met'
  );
  const [dischargeSummary, setDischargeSummary] = useState<string>('');
  const [homeMaintenanceNote, setHomeMaintenanceNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const journey = useMemo(() => {
    if (!episode) return null;
    return buildClinicalJourneySummary({
      episode,
      sessions,
      soaps,
      episodeStore,
      dischargeDateOverride: endDate,
    });
  }, [episode, sessions, soaps, episodeStore, endDate]);

  useEffect(() => {
    if (!isOpen || !episode || !journey) return;
    setErrorMsg(null);
    setEndDate(episode.endDate || episode.data.endDate || localDate());
    setDischargeReason(episode.data.dischargeReason || 'goals_met');
    const existingSummary = episode.data.dischargeSummary?.trim();
    setDischargeSummary(
      existingSummary ||
        (language === 'en' ? journey.suggestedSummaryEn : journey.suggestedSummaryAr)
    );
    setHomeMaintenanceNote(episode.data.dischargeFinalOutcomeNote || '');
  }, [isOpen, episode?.id, episode?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !episode || !journey) return null;

  const patientName = getPatientDisplayName(patient.data, language);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dischargeSummary.trim()) {
      setErrorMsg(
        bi(
          'يرجى كتابة ملخص المسيرة العلاجية والتخريج قبل التأكيد.',
          'Please enter a discharge summary before confirming.'
        )
      );
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirmDischarge({
        episodeId: episode.id,
        endDate: endDate || localDate(),
        dischargeReason,
        dischargeSummary: dischargeSummary.trim(),
        dischargeFinalOutcomeNote: homeMaintenanceNote.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : bi('تعذّر إغلاق الحلقة العلاجية.', 'Failed to complete treatment episode.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async () => {
    if (!onReopenEpisode) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onReopenEpisode(episode.id);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : bi('تعذّر إعادة فتح الحلقة.', 'Failed to reopen episode.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const improvementLabel =
    journey.improvementBadge === 'significant'
      ? bi('تحسّن ملحوظ وممتاز', 'Significant Improvement')
      : journey.improvementBadge === 'moderate'
        ? bi('تحسّن جيد ومستقر', 'Good Progress')
        : journey.improvementBadge === 'stable'
          ? bi('حالة مستقرة', 'Stable Condition')
          : bi('اكتملت الخطة', 'Course Completed');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discharge-modal-title"
      data-testid="discharge-episode-modal"
    >
      <div className="w-full max-w-2xl max-h-[92vh] bg-card border border-card-line rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-card-divider flex items-center justify-between gap-3 bg-surface/50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-9 rounded-xl bg-emerald-600/12 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Award className="size-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="discharge-modal-title"
                className="text-sm sm:text-base font-black text-foreground truncate"
              >
                {isCompleted
                  ? bi('ملخص المسيرة العلاجية والتخريج', 'Treatment Journey & Discharge Summary')
                  : bi('إنهاء العلاج وتخريج المريض', 'Complete Treatment & Discharge')}
              </h2>
              <p className="text-xs text-muted-foreground-1 truncate">
                {patientName} · {journey.episodeTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={bi('إغلاق', 'Close')}
            className="size-8 rounded-xl hover:bg-surface text-muted-foreground-1 hover:text-foreground flex items-center justify-center cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Auto-Computed Clinical Journey & Improvement Card */}
          <div
            data-testid="clinical-journey-summary-card"
            className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                <ClipboardCheck className="size-4 shrink-0" />
                <span>{bi('ملخص المسيرة العلاجية والتحسّن (محسوب تلقائياً)', 'Auto-Computed Clinical Journey & Progress')}</span>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                {improvementLabel}
              </span>
            </div>

            {/* Key KPI Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-xl bg-card border border-card-line">
                <div className="text-xs text-muted-foreground-1">{bi('مجموع الجلسات', 'Total Sessions')}</div>
                <div className="text-base font-black text-foreground mt-0.5 tabular-nums">
                  <Num value={journey.totalSessions} />{' '}
                  <span className="text-xs font-semibold text-muted-foreground-1">
                    {bi('جلسة', 'sessions')}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-card border border-card-line">
                <div className="text-xs text-muted-foreground-1">{bi('مدة العلاج', 'Care Duration')}</div>
                <div className="text-base font-black text-foreground mt-0.5 tabular-nums">
                  <Num value={journey.durationDays} />{' '}
                  <span className="text-xs font-semibold text-muted-foreground-1">
                    {bi('يوم', 'days')}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-card border border-card-line">
                <div className="text-xs text-muted-foreground-1">{bi('مسار الألم (NPRS)', 'Pain Trajectory')}</div>
                <div className="text-sm font-black text-foreground mt-0.5 tabular-nums flex items-center gap-1">
                  {journey.painFirst !== null && journey.painLatest !== null ? (
                    <>
                      <bdi dir="ltr">{journey.painFirst}/10</bdi>
                      <span className="text-muted-foreground-1">{isRtl ? '←' : '→'}</span>
                      <bdi dir="ltr" className="text-emerald-700 dark:text-emerald-400">
                        {journey.painLatest}/10
                      </bdi>
                    </>
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground-1">
                      {bi('غير مسجّل', 'Not logged')}
                    </span>
                  )}
                </div>
                {journey.painImprovementPercent !== null && journey.painDelta !== null && journey.painDelta > 0 && (
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                    <TrendingDown className="size-3 shrink-0" />
                    <span>
                      {bi(`تحسّن ${journey.painImprovementPercent}%`, `${journey.painImprovementPercent}% better`)}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-card border border-card-line">
                <div className="text-xs text-muted-foreground-1">{bi('فترة الحلقة', 'Timeline')}</div>
                <div className="text-xs font-bold text-foreground mt-1 font-mono tabular-nums space-y-0.5">
                  {journey.startDate === journey.endDate ? (
                    <div className="text-emerald-700 dark:text-emerald-400">
                      <bdi dir="ltr">{formatDateDDMMYYYY(journey.endDate)}</bdi>
                    </div>
                  ) : (
                    <>
                      <div>
                        <bdi dir="ltr">{formatDateDDMMYYYY(journey.startDate)}</bdi>
                      </div>
                      <div className="text-emerald-700 dark:text-emerald-400">
                        {isRtl ? '← ' : '→ '}
                        <bdi dir="ltr">{formatDateDDMMYYYY(journey.endDate)}</bdi>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Outcome Scales & ROM / MMT Highlights */}
            {(journey.outcomeScales.length > 0 ||
              journey.romHighlights.length > 0 ||
              journey.totalGoalsCount > 0) && (
              <div className="pt-2 border-t border-emerald-500/15 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {journey.outcomeScales.map((scale) => (
                  <div
                    key={scale.scaleName}
                    className="px-2.5 py-2 rounded-xl bg-card/90 border border-card-line flex items-center justify-between gap-2"
                  >
                    <span className="font-bold text-foreground truncate">{scale.scaleName}</span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                      {scale.firstScore}
                      {scale.unit || ''} → {scale.latestScore}
                      {scale.unit || ''}
                    </span>
                  </div>
                ))}
                {journey.romHighlights.slice(0, 2).map((rom) => (
                  <div
                    key={`rom-${rom.label}`}
                    className="px-2.5 py-2 rounded-xl bg-card/90 border border-card-line flex items-center justify-between gap-2"
                  >
                    <span className="font-semibold text-foreground truncate flex items-center gap-1">
                      <Activity className="size-3.5 text-primary shrink-0" />
                      {rom.label}
                    </span>
                    <span className="font-mono font-bold text-primary shrink-0">
                      {rom.firstDegrees !== undefined ? `${rom.firstDegrees}° → ` : ''}
                      {rom.latestDegrees}°
                    </span>
                  </div>
                ))}
                {journey.totalGoalsCount > 0 && (
                  <div className="px-2.5 py-2 rounded-xl bg-card/90 border border-card-line flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {bi('الأهداف التأهيلية المتحققة', 'Rehab Goals Met')}
                    </span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {journey.goalsAchievedCount} / {journey.totalGoalsCount}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-700 dark:text-rose-400">
              {errorMsg}
            </div>
          )}

          {/* Discharge Date & Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5 flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" />
                <span>{bi('تاريخ إنهاء العلاج (التخريج)', 'Discharge Date')}</span>
              </label>
              <DatePickerInput
                value={endDate}
                onChange={(val) => setEndDate(val)}
                disabled={isCompleted}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                {bi('سبب إنهاء العلاج', 'Discharge Reason')}
              </label>
              <select
                value={dischargeReason}
                disabled={isCompleted}
                onChange={(e) => setDischargeReason(e.target.value as DischargeReasonCode)}
                className="w-full h-10 px-3 rounded-xl bg-surface border border-line-2 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-70"
              >
                {DISCHARGE_REASONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {bi(r.labelAr, r.labelEn)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Clinical Discharge Summary Textarea */}
          <div>
            <label
              htmlFor="discharge-summary-input"
              className="block text-xs font-bold text-foreground mb-1.5"
            >
              {bi('ملخص المسيرة العلاجية والنتيجة النهائية', 'Clinical Journey & Discharge Summary')}
            </label>
            <textarea
              id="discharge-summary-input"
              data-testid="discharge-summary-textarea"
              rows={4}
              readOnly={isCompleted}
              value={dischargeSummary}
              onChange={(e) => setDischargeSummary(e.target.value)}
              placeholder={bi(
                'اكتب ملخص التحسن والنتيجة النهائية للمريض...',
                'Summarize clinical progress and final outcome...'
              )}
              className="w-full p-3 rounded-xl bg-surface border border-line-2 text-xs leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 read-only:opacity-85"
            />
          </div>

          {/* Home Maintenance / Follow-Up Recommendations */}
          <div>
            <label
              htmlFor="discharge-home-note-input"
              className="block text-xs font-bold text-foreground mb-1.5"
            >
              {bi(
                'توصيات التمارين المنزلية والمتابعة (اختياري)',
                'Home Maintenance & Follow-Up Advice (Optional)'
              )}
            </label>
            <input
              id="discharge-home-note-input"
              type="text"
              readOnly={isCompleted}
              value={homeMaintenanceNote}
              onChange={(e) => setHomeMaintenanceNote(e.target.value)}
              placeholder={bi(
                'مثال: الاستمرار بتمارين التقوية 3 مرات أسبوعياً والمراجعة عند الحاجة...',
                'e.g., Continue strengthening 3x/week and return if symptoms recur...'
              )}
              className="w-full h-10 px-3 rounded-xl bg-surface border border-line-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 read-only:opacity-85"
            />
          </div>

          {!isCompleted && (
            <p className="text-xs text-muted-foreground-1 bg-surface/70 rounded-xl px-3 py-2">
              {bi(
                'عند تأكيد إنهاء العلاج سيُحفظ هذا الملخص في ملف المريض وينتقل تلقائياً إلى قسم «أنهوا العلاج» في سجل المرضى (ويمكنك إعادة فتحه أو بدء حلقة جديدة له في أي وقت).',
                'Confirming discharge saves this summary and moves the patient to the "Completed" section in Patient Directory. You can reopen or start a new episode anytime.'
              )}
            </p>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-card-divider flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {onPrintDischargeReport && (
                <button
                  type="button"
                  onClick={onPrintDischargeReport}
                  className="h-9 px-3 rounded-xl bg-surface hover:bg-surface/80 border border-line-2 text-xs font-bold text-foreground inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="size-3.5 text-primary" />
                  <span>{bi('طباعة ملخص التخريج', 'Print Discharge Report')}</span>
                </button>
              )}
              {isCompleted && onReopenEpisode && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleReopen}
                  className="h-9 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="size-3.5" />
                  <span>{bi('إعادة فتح الحلقة', 'Reopen Episode')}</span>
                </button>
              )}
              {isCompleted && onStartNewEpisode && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onStartNewEpisode();
                  }}
                  className="h-9 px-3 rounded-xl bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{bi('بدء حلقة جديدة', 'Start New Episode')}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 ms-auto">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-3.5 rounded-xl bg-surface hover:bg-surface/80 text-xs font-bold text-foreground cursor-pointer"
              >
                {bi('إغلاق', 'Close')}
              </button>
              {!isCompleted && (
                <button
                  type="submit"
                  data-testid="confirm-discharge-btn"
                  disabled={submitting}
                  className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60"
                >
                  <CheckCircle2 className="size-4" />
                  <span>
                    {submitting
                      ? bi('جاري الحفظ...', 'Saving...')
                      : bi('تأكيد إنهاء العلاج والتخريج', 'Confirm Treatment Completion')}
                  </span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
