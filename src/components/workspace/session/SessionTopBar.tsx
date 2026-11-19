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
      <div className="px-3 sm:px-6 py-2 bg-card/95 backdrop-blur-xs border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onSafeNavigation('back')}
            aria-label={bi('العودة للسجل العام', 'Back to Episode Chart', 'گەڕانەوە بۆ تۆماری گشتی')}
            title={bi('العودة للسجل العام', 'Back to Episode Chart', 'گەڕانەوە بۆ تۆماری گشتی')}
            className="compact-btn size-8 rounded-xl bg-surface/80 hover:bg-surface text-foreground flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            {isRtl ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 text-xs tabular-nums min-w-0 overflow-hidden">
            <span className="py-1 px-2 sm:px-2.5 rounded-xl bg-primary/10 text-primary font-bold font-mono shrink-0 truncate">
              {session.data.sessionType === 'initial_evaluation'
                ? bi(
                    `تقييم أولي #${session.data.sessionNumber}`,
                    `Initial Eval #${session.data.sessionNumber}`,
                    `هەڵسەنگاندنی سەرەتایی #${session.data.sessionNumber}`
                  )
                : session.data.sessionType === 're_evaluation'
                  ? bi(
                      `إعادة تقييم #${session.data.sessionNumber}`,
                      `Re-Eval #${session.data.sessionNumber}`,
                      `دووبارە هەڵسەنگاندن #${session.data.sessionNumber}`
                    )
                  : session.data.sessionType === 'discharge_summary'
                    ? bi(
                        `تقييم تخريج #${session.data.sessionNumber}`,
                        `Discharge #${session.data.sessionNumber}`,
                        `هەڵسەنگاندنی دەرچوون #${session.data.sessionNumber}`
                      )
                    : bi(
                        `جلسة علاجية #${session.data.sessionNumber}`,
                        `Session #${session.data.sessionNumber}`,
                        `دانیشتنی چارەسەر #${session.data.sessionNumber}`
                      )}
            </span>
            <span className="hidden lg:inline text-muted-foreground-1">·</span>
            <span className="hidden lg:inline text-foreground font-bold truncate max-w-[160px]">
              {patientName}
            </span>
            <span className="text-muted-foreground-1 shrink-0">·</span>
            <span className="text-muted-foreground-1 font-medium tabular-nums shrink-0">
              <bdi dir="ltr">{formatDateDDMMYYYY(session.data.sessionDate)}</bdi>
            </span>
            <span className="hidden md:inline text-muted-foreground-1">·</span>
            <span className="hidden md:inline text-xs font-bold text-foreground truncate max-w-[220px]">
              {episodeTitle}
            </span>
            {isLocked && (
              <span className="py-0.5 px-2 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 font-bold inline-flex items-center gap-1 shrink-0 text-xs">
                <Lock className="size-3" />
                <span className="hidden sm:inline">
                  {bi('معتمدة ومغلقة', 'Signed & Locked', 'پەسەندکراو و داخراو')}
                </span>
              </span>
            )}
            {!isLocked && autosaveStatus === 'saving' && (
              <span className="hidden sm:inline text-xs text-amber-600 dark:text-amber-400 font-medium shrink-0">
                {bi('جاري الحفظ...', 'Saving...', 'پاشەکەوتکردن...')}
              </span>
            )}
            {!isLocked && lastSavedAt && !isDirty && (
              <span className="hidden sm:inline-flex text-xs text-emerald-600 dark:text-emerald-400 font-medium items-center gap-1 shrink-0">
                <CheckCircle2 className="size-3.5" />
                <span>{bi('تم الحفظ ', 'Saved ', 'پاشەکەوت کرا ')}</span>
                <bdi dir="ltr" className="font-mono tabular-nums">
                  {lastSavedAt}
                </bdi>
              </span>
            )}
          </div>
        </div>

        {/* Actions (Timer on all widths; Save & Sign in TopBar on md+ only — mobile uses thumb-reach sticky bottom bar) */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
          {!isLocked && (
            <div
              data-testid="session-timer-widget"
              className="inline-flex items-center gap-0.5 sm:gap-1 ps-2 pe-1 py-0.5 rounded-xl bg-surface/80 text-xs font-mono tabular-nums"
              title={bi('مؤقت الجلسة', 'Session Timer', 'کاتژمێری دانیشتن')}
            >
              <Timer className="size-3.5 text-primary shrink-0" />
              {savedSessionSeconds !== null && !timerRunning ? (
                <>
                  <span
                    data-testid="session-timer-display"
                    className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5"
                  >
                    <bdi dir="ltr">{formatTimerMmSs(savedSessionSeconds)}</bdi>
                    <span className="hidden sm:inline text-xs ms-0.5">{bi('مسجّل', 'saved', 'تۆمارکرا')}</span>
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
                    className="compact-btn size-7 inline-flex items-center justify-center rounded-lg hover:bg-card text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
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
                    className="compact-btn size-7 inline-flex items-center justify-center rounded-lg hover:bg-card text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
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
                    className="compact-btn size-7 inline-flex items-center justify-center rounded-lg hover:bg-card text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
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
                    className="hidden sm:inline-flex compact-btn size-7 items-center justify-center rounded-lg hover:bg-card text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
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
            className="hidden sm:inline-flex compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-muted-foreground-1 hover:text-foreground text-xs font-semibold items-center gap-1 cursor-pointer transition-colors"
            title={bi('اختصارات لوحة المفاتيح (?)', 'Keyboard Shortcuts (?)', 'قەدبڕەکانی کیبۆرد (؟)')}
          >
            <Keyboard className="size-3.5" />
            <span className="font-mono">?</span>
          </button>

          <button
            type="button"
            onClick={() => onSafeNavigation('chart')}
            className="hidden sm:inline-flex compact-btn h-8 px-3 rounded-xl bg-surface/80 hover:bg-surface text-foreground text-xs font-semibold items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
          >
            <Layers className="size-3.5 text-primary" />
            <span>{bi('السجل العام', 'Episode Chart', 'تۆماری گشتیی بارودۆخ')}</span>
          </button>

          {!isLocked && (
            <div className="hidden md:flex items-center gap-1.5">
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={isSaving}
                className={`compact-btn h-8 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-all ${
                  saveSuccess
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-primary/10 hover:bg-primary/15 text-primary'
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
                  className="compact-btn h-8 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-xs shadow-primary/20 cursor-pointer whitespace-nowrap transition-all"
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
