import React from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Keyboard,
  Layers,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Save,
  Timer,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { ClinicOperationsService } from '../../../services/clinicOperationsService';
import type { SessionRecord } from '../../../types/clinical';
import { formatDateDDMMYYYY } from '../../../utils/date';
import { formatElapsedMmSs as formatTimerMmSs } from '../../../utils/sessionTimerState';

export interface SessionTopBarProps {
  session: SessionRecord;
  patientName: string;
  episodeTitle: string;
  isLocked: boolean;
  isDirty: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  autosaveStatus: 'idle' | 'saving' | 'saved';
  lastSavedAt: string | null;
  canFinalizeAndLockNotes: boolean;
  elapsedSeconds: number;
  timerRunning: boolean;
  savedSessionSeconds: number | null;
  latestElapsedRef: React.MutableRefObject<number>;
  setElapsedSeconds: React.Dispatch<React.SetStateAction<number>>;
  setTimerRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setSavedSessionSeconds: React.Dispatch<React.SetStateAction<number | null>>;
  pendingNavAction: 'back' | 'chart' | null;
  onSafeNavigation: (target: 'back' | 'chart') => void;
  onOpenShortcuts: () => void;
  onSaveDraft: () => void;
  onRequestSignAndLock: () => void;
  onConfirmSaveAndLeave: () => void;
  onConfirmDiscardAndLeave: () => void;
  onCancelPendingNav: () => void;
}

export const SessionTopBar: React.FC<SessionTopBarProps> = ({
  session,
  patientName,
  episodeTitle,
  isLocked,
  isDirty,
  isSaving,
  saveSuccess,
  autosaveStatus,
  lastSavedAt,
  canFinalizeAndLockNotes,
  elapsedSeconds,
  timerRunning,
  savedSessionSeconds,
  latestElapsedRef,
  setElapsedSeconds,
  setTimerRunning,
  setSavedSessionSeconds,
  pendingNavAction,
  onSafeNavigation,
  onOpenShortcuts,
  onSaveDraft,
  onRequestSignAndLock,
  onConfirmSaveAndLeave,
  onConfirmDiscardAndLeave,
  onCancelPendingNav,
}) => {
  const { bi, isRtl } = useLanguage();

  return (
    <>
      <div className="px-3 sm:px-6 py-2.5 bg-card/95 backdrop-blur-xs border-b border-card-line flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => onSafeNavigation('back')}
              aria-label={bi('العودة للسجل العام', 'Back to Episode Chart', 'گەڕانەوە بۆ تۆماری گشتی')}
              title={bi('العودة للسجل العام', 'Back to Episode Chart', 'گەڕانەوە بۆ تۆماری گشتی')}
              className="size-8 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              {isRtl ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
            </button>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs tabular-nums min-w-0">
              <span className="py-1 px-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 font-bold font-mono shrink-0">
                {bi(
                  `جلسة علاجية #${session.data.sessionNumber}`,
                  `Session #${session.data.sessionNumber}`,
                  `دانیشتنی چارەسەر #${session.data.sessionNumber}`
                )}
              </span>
              <span className="hidden md:inline text-muted-foreground-1">·</span>
              <span className="hidden md:inline text-foreground font-bold truncate max-w-[160px]">
                {patientName}
              </span>
              <span className="text-muted-foreground-1">·</span>
              <span className="text-muted-foreground-1 font-medium tabular-nums shrink-0">
                <bdi dir="ltr">{formatDateDDMMYYYY(session.data.sessionDate)}</bdi>
              </span>
              <span className="hidden sm:inline text-muted-foreground-1">·</span>
              <span className="hidden sm:inline text-xs font-bold text-foreground truncate max-w-[240px]">
                {episodeTitle}
              </span>
              {isLocked && (
                <span className="py-0.5 px-2 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 font-bold inline-flex items-center gap-1 shrink-0 text-[11px]">
                  <Lock className="size-3" />
                  {bi('معتمدة ومغلقة', 'Signed & Locked', 'پەسەندکراو و داخراو')}
                </span>
              )}
              {!isLocked && autosaveStatus === 'saving' && (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">
                  {bi('جاري الحفظ...', 'Saving...', 'پاشەکەوتکردن...')}
                </span>
              )}
              {!isLocked && lastSavedAt && !isDirty && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="size-3.5" />
                  <span className="hidden sm:inline">{bi('تم الحفظ ', 'Saved ', 'پاشەکەوت کرا ')}</span>
                  <bdi dir="ltr" className="font-mono tabular-nums">
                    {lastSavedAt}
                  </bdi>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
          {!isLocked && (
            <div
              data-testid="session-timer-widget"
              className="inline-flex items-center gap-1 ps-2.5 pe-1 py-0.5 rounded-xl bg-surface border border-line-2 text-xs font-mono tabular-nums"
              title={bi('مؤقت الجلسة', 'Session Timer', 'کاتژمێری دانیشتن')}
            >
              <Timer className="size-3.5 text-primary" />
              {savedSessionSeconds !== null && !timerRunning ? (
                <>
                  <span
                    data-testid="session-timer-display"
                    className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5"
                  >
                    <bdi dir="ltr">{formatTimerMmSs(savedSessionSeconds)}</bdi>
                    <span className="text-[10px] ms-0.5">{bi('مسجّل', 'saved', 'تۆمارکرا')}</span>
                  </span>
                  <button
                    type="button"
                    data-testid="session-timer-resume-btn"
                    onClick={() => {
                      setElapsedSeconds(savedSessionSeconds);
                      latestElapsedRef.current = savedSessionSeconds;
                      setSavedSessionSeconds(null);
                      setTimerRunning(true);
                    }}
                    className="min-w-[30px] min-h-[30px] inline-flex items-center justify-center rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
                    aria-label={bi('استئناف المؤقت', 'Resume timer', 'بەردەوامبوونی کاتژمێر')}
                    title={bi('استئناف المؤقت', 'Resume timer', 'بەردەوامبوونی کاتژمێر')}
                  >
                    <Play className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    data-testid="session-timer-reset-btn"
                    onClick={() => {
                      ClinicOperationsService.clearSessionTimerSeconds(session.id);
                      latestElapsedRef.current = 0;
                      setSavedSessionSeconds(null);
                      setElapsedSeconds(0);
                      setTimerRunning(true);
                    }}
                    className="min-w-[30px] min-h-[30px] inline-flex items-center justify-center rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
                    aria-label={bi('إعادة التعيين', 'Reset timer', 'سفرکردنەوەی کاتژمێر')}
                    title={bi('إعادة التعيين', 'Reset timer', 'سفرکردنەوەی کاتژمێر')}
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span data-testid="session-timer-display" className="font-bold text-foreground">
                    <bdi dir="ltr">{formatTimerMmSs(elapsedSeconds)}</bdi>
                  </span>
                  <button
                    type="button"
                    data-testid="session-timer-toggle-btn"
                    onClick={() => {
                      if (timerRunning) {
                        setSavedSessionSeconds(elapsedSeconds);
                        if (elapsedSeconds > 0) {
                          ClinicOperationsService.saveSessionTimerSeconds(session.id, elapsedSeconds);
                        }
                      }
                      setTimerRunning((r) => !r);
                    }}
                    className="min-w-[30px] min-h-[30px] inline-flex items-center justify-center rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
                    aria-label={
                      timerRunning
                        ? bi('إيقاف مؤقت وحفظ الوقت', 'Pause & save time', 'وەستاندن و پاشەکەوتکردنی کات')
                        : bi('تشغيل المؤقت', 'Resume timer', 'کارپێکردنەوەی کاتژمێر')
                    }
                  >
                    {timerRunning ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    data-testid="session-timer-reset-btn"
                    onClick={() => {
                      ClinicOperationsService.clearSessionTimerSeconds(session.id);
                      latestElapsedRef.current = 0;
                      setSavedSessionSeconds(null);
                      setElapsedSeconds(0);
                    }}
                    className="min-w-[30px] min-h-[30px] inline-flex items-center justify-center rounded-lg hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
                    aria-label={bi('تصفير المؤقت', 'Reset timer', 'سفرکردنەوەی کاتژمێر')}
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onOpenShortcuts}
            className="hidden sm:inline-flex min-h-[34px] py-1 px-2.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-muted-foreground-1 hover:text-foreground text-xs font-semibold items-center gap-1 cursor-pointer transition-colors"
            title={bi('اختصارات لوحة المفاتيح (?)', 'Keyboard Shortcuts (?)', 'قەدبڕەکانی کیبۆرد (؟)')}
          >
            <Keyboard className="size-3.5" />
            <span className="font-mono">?</span>
          </button>

          <button
            type="button"
            onClick={() => onSafeNavigation('chart')}
            className="hidden sm:inline-flex min-h-[34px] py-1 px-3 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-foreground text-xs font-semibold items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
          >
            <Layers className="size-3.5 text-primary" />
            <span>{bi('السجل العام', 'Episode Chart', 'تۆماری گشتیی بارودۆخ')}</span>
          </button>

          {!isLocked && (
            <div className="flex items-center gap-1.5 ms-auto sm:ms-0">
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={isSaving}
                className={`min-h-[34px] py-1 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
                  saveSuccess
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-primary/10 hover:bg-primary/15 text-primary border border-primary/25'
                }`}
              >
                <Save className="size-3.5" />
                <span>{bi('حفظ', 'Save', 'پاشەکەوتکردن')}</span>
              </button>

              {canFinalizeAndLockNotes && (
                <button
                  type="button"
                  onClick={onRequestSignAndLock}
                  disabled={isSaving}
                  className="min-h-[34px] py-1 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-xs shadow-primary/20 cursor-pointer whitespace-nowrap transition-all"
                >
                  <Lock className="size-3.5" />
                  <span>{bi('إنهاء واعتماد', 'Finish & Sign', 'تەواوکردن و پەسەندکردن')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Unsaved Navigation Guard Banner */}
      {pendingNavAction && (
        <div className="px-4 py-3 bg-card border-b border-card-line shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              {bi(
                'لديك تعديلات سريرية غير محفوظة في هذه الجلسة. هل ترغب في حفظ المسودة قبل المغادرة؟',
                'You have unsaved clinical changes in this session. Save draft before leaving?',
                'گۆڕانکاری کلینیکیی پاشەکەوتنەکراوت لەم دانیشتنەدا هەیە. دەتەوێت پێش ڕۆیشتن ڕەشنووس پاشەکەوت بکەیت؟'
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onConfirmSaveAndLeave}
              className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-semibold cursor-pointer"
            >
              {bi('حفظ المسودة والمغادرة', 'Save & Leave', 'پاشەکەوتکردنی ڕەشنووس و ڕۆیشتن')}
            </button>
            <button
              type="button"
              onClick={onConfirmDiscardAndLeave}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
            >
              {bi('تجاهل التغييرات والمغادرة', 'Discard & Leave', 'پشتگوێخستنی گۆڕانکارییەکان و ڕۆیشتن')}
            </button>
            <button
              type="button"
              onClick={onCancelPendingNav}
              className="px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground font-semibold cursor-pointer"
            >
              {bi('البقاء في الجلسة', 'Stay', 'مانەوە لە دانیشتن')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
