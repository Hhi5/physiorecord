// =======================================================================
// PhysioRecord — Clinical Session Modal (Phase 2B.2)
// Creation & Editing of Clinical Sessions with Active Episode Binding
// =======================================================================

import React, { useState, useEffect } from 'react';
import { GeometricHeaderBackdrop } from '../ui/Dialog';
import { 
  X, 
  Calendar, 
  Clock, 
  FileText, 
  UserCheck, 
  AlertCircle, 
  Activity, 
  Save,
  Hash
} from 'lucide-react';
import { 
  SESSION_TYPES, 
  ATTENDANCE_STATUSES, 
  type SessionRecord, 
  type SessionClinicalData, 
  type SessionType, 
  type AttendanceStatus,
  type EpisodeRecord 
} from '../../types/clinical';
import { useLanguage } from '../../context/LanguageContext';
import {
  localDate,
  formatDateDDMMYYYY,
  commitDurationDraft,
  sanitizeDurationDraft,
} from '../../utils/date';
import { AutoResizeTextarea, DatePickerInput, TimePickerInput } from '../ui/Primitives';

interface SessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<SessionClinicalData>) => Promise<void>;
  episode: EpisodeRecord;
  sessionToEdit?: SessionRecord | null;
  existingSessionCount: number;
  nextSessionNumber?: number;
}

export const SessionModal: React.FC<SessionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  episode,
  sessionToEdit,
  existingSessionCount,
  nextSessionNumber,
}) => {
  const { isRtl, bi } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [customSessionNumber, setCustomSessionNumber] = useState<string>('');
  const [sessionType, setSessionType] = useState<SessionType>('follow_up');
  const [sessionDate, setSessionDate] = useState<string>(localDate());
  const [sessionTime, setSessionTime] = useState<string>('10:00');
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState<number>(45);
  const [sessionDurationDraft, setSessionDurationDraft] = useState<string>('45');
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>('attended');
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [therapistName, setTherapistName] = useState<string>('د. المعالج الطبيعي');
  const [administrativeNotes, setAdministrativeNotes] = useState<string>('');

  const sessionToEditId = sessionToEdit?.id ?? null;

  useEffect(() => {
    if (!isOpen) return;

    if (sessionToEdit) {
      const d = sessionToEdit.data;
      setCustomSessionNumber(sessionToEdit.sessionNumber ? String(sessionToEdit.sessionNumber) : '');
      setSessionType(sessionToEdit.sessionType);
      setSessionDate(sessionToEdit.sessionDate);
      setSessionTime(d.sessionTime || '10:00');
      const dur = d.sessionDurationMinutes || 45;
      setSessionDurationMinutes(dur);
      setSessionDurationDraft(String(dur));
      setAttendanceStatus(sessionToEdit.attendanceStatus);
      setCancellationReason(d.cancellationReason || '');
      setTherapistName(d.therapistName || 'د. المعالج الطبيعي');
      setAdministrativeNotes(d.administrativeNotes || '');
    } else {
      // Defaults for new session
      const isFirst = existingSessionCount === 0;
      setCustomSessionNumber('');
      setSessionType(isFirst ? 'initial_evaluation' : 'follow_up');
      setSessionDate(localDate());
      setSessionTime('10:00');
      setSessionDurationMinutes(45);
      setSessionDurationDraft('45');
      setAttendanceStatus('attended');
      setCancellationReason('');
      setTherapistName('د. المعالج الطبيعي');
      setAdministrativeNotes('');
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sessionToEditId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sessionDate) {
      setError(bi('تاريخ الجلسة إلزامي.', 'Session Date is required.'));
      return;
    }

    const epStartDate = (episode.data.startDate || episode.startDate || '').slice(0, 10);
    if (epStartDate && sessionDate < epStartDate) {
      setError(
        bi(
          `تاريخ الجلسة (${formatDateDDMMYYYY(sessionDate)}) لا يمكن أن يسبق تاريخ بدء الحلقة العلاجية (${formatDateDDMMYYYY(epStartDate)}).`,
          `Session date (${formatDateDDMMYYYY(sessionDate)}) cannot be earlier than the episode start date (${formatDateDDMMYYYY(epStartDate)}).`
        )
      );
      return;
    }

    if (attendanceStatus !== 'attended' && !cancellationReason.trim()) {
      setError('سبب عدم الحضور أو الإلغاء إلزامي.');
      return;
    }

    const parsedNumber = customSessionNumber.trim() ? parseInt(customSessionNumber.trim(), 10) : undefined;
    if (parsedNumber !== undefined && (isNaN(parsedNumber) || parsedNumber < 1)) {
      setError('رقم الجلسة يجب أن يكون رقماً صحيحاً أكبر من 0.');
      return;
    }

    setSubmitting(true);
    try {
      const committedDuration = commitDurationDraft(sessionDurationDraft, {
        min: 5,
        max: 240,
        fallback: sessionDurationMinutes || 45,
      });
      const payload: Partial<SessionClinicalData> = {
        sessionNumber: parsedNumber,
        sessionType,
        sessionDate,
        sessionTime,
        sessionDurationMinutes: committedDuration,
        attendanceStatus,
        cancellationReason: attendanceStatus !== 'attended' ? cancellationReason.trim() : undefined,
        therapistName: therapistName.trim(),
        administrativeNotes: administrativeNotes.trim() || undefined,
      };

      await onSave(payload);
      onClose();
    } catch (err: unknown) {
      console.error('Session save error:', err);
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الجلسة.');
    } finally {
      setSubmitting(false);
    }
  };

  const calculatedSessionNumber = sessionToEdit 
    ? sessionToEdit.sessionNumber 
    : (nextSessionNumber ?? existingSessionCount + 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[92dvh] sm:max-h-[88dvh] shadow-2xl border border-card-line overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Modal Header */}
        <div className="relative overflow-hidden px-4 sm:px-6 pt-3 sm:pt-4 pb-3.5 bg-primary text-primary-foreground flex flex-col gap-2.5 shrink-0 shadow-xs">
          <GeometricHeaderBackdrop />
          <div className="relative z-10 w-10 h-1 bg-primary-foreground/40 rounded-full mx-auto sm:hidden" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary-foreground/15 flex items-center justify-center text-primary-foreground shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="session-modal-title" className="text-base font-bold">
                  {sessionToEdit ? bi('تعديل بيانات الجلسة السريرية', 'Edit Session Details') : bi('تسجيل جلسة علاجية جديدة', 'New Clinical Session')}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-primary-foreground/15 text-primary-foreground border border-primary-foreground/25">
                  {bi(`الجلسة #${calculatedSessionNumber}`, `Session #${calculatedSessionNumber}`)}
                </span>
              </div>
              <p className="text-xs text-primary-foreground/85 mt-0.5 truncate">
                {bi('ضمن حلقة:', 'Episode:')} <strong className="text-primary-foreground">{episode.data.title}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={bi('إغلاق', 'Close')}
            className="size-9 !p-0 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
          </div>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div tabIndex={0} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {error && (
            <div className="p-4 bg-surface/75 rounded-xl flex items-start gap-3 text-rose-700 dark:text-rose-400 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Session Type Radio Selection */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-2">
              {bi('نوع الجلسة العلاجية', 'Session Type')} <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.keys(SESSION_TYPES) as SessionType[]).map((typeKey) => {
                const info = SESSION_TYPES[typeKey];
                const isSelected = sessionType === typeKey;

                return (
                  <button
                    key={typeKey}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSessionType(typeKey)}
                    className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-2xs ring-1 ring-primary'
                        : 'border-layer-line hover:bg-layer-hover bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-foreground">{bi(info.ar, info.en)}</span>
                      <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-primary bg-primary' : 'border-layer-line'}`}>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground-1" dir="ltr">{info.en}</span>
                    <span className="text-xs text-muted-foreground-2 mt-1 leading-tight">{bi(info.descriptionAr || info.ar, info.en)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session Number, Date, Time & Duration Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 pt-2">
            <div>
              <label htmlFor="session-number-input" className="block text-xs font-bold text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground-1" />
                  <span>{bi('رقم الجلسة', 'Session #')}</span>
                </span>
              </label>
              <input
                id="session-number-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                dir="ltr"
                lang="en"
                autoComplete="off"
                placeholder={bi(`تلقائي (${calculatedSessionNumber})`, `Auto (${calculatedSessionNumber})`)}
                value={customSessionNumber}
                onChange={(e) => setCustomSessionNumber(sanitizeDurationDraft(e.target.value, 4))}
                className="w-full px-3 py-2 text-xs bg-surface border border-layer-line text-foreground font-mono text-left tabular-nums rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-hidden"
              />
            </div>

            <div>
              <label htmlFor="session-date-input" className="block text-xs font-bold text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground-1" />
                  <span>{bi('تاريخ الجلسة', 'Session Date')}</span>
                </span>
              </label>
              <DatePickerInput
                id="session-date-input"
                min={(episode.data.startDate || episode.startDate || '').slice(0, 10) || undefined}
                value={sessionDate}
                onChange={(val) => setSessionDate(val)}
                ariaLabel={bi('تاريخ الجلسة', 'Session Date')}
                required
              />
            </div>

            <div>
              <label htmlFor="session-time-input" className="block text-xs font-bold text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground-1" />
                  <span>{bi('وقت الانعقاد', 'Session Time')}</span>
                </span>
              </label>
              <TimePickerInput
                id="session-time-input"
                value={sessionTime}
                onChange={(val) => setSessionTime(val)}
              />
            </div>

            <div>
              <label htmlFor="session-duration-input" className="block text-xs font-bold text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground-1" />
                  <span>{bi('المدة (بالدقائق)', 'Duration (min)')}</span>
                </span>
              </label>
              <input
                id="session-duration-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                dir="ltr"
                lang="en"
                autoComplete="off"
                value={sessionDurationDraft}
                placeholder="45"
                onChange={(e) => {
                  const next = sanitizeDurationDraft(e.target.value, 3);
                  setSessionDurationDraft(next);
                  if (next) {
                    const parsed = Number.parseInt(next, 10);
                    if (Number.isFinite(parsed)) setSessionDurationMinutes(parsed);
                  }
                }}
                onBlur={() => {
                  const committed = commitDurationDraft(sessionDurationDraft, {
                    min: 5,
                    max: 240,
                    fallback: 45,
                  });
                  setSessionDurationMinutes(committed);
                  setSessionDurationDraft(String(committed));
                }}
                className="w-full px-3 py-2 text-xs bg-surface border border-layer-line text-foreground font-mono font-bold text-left tabular-nums rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-hidden"
              />
            </div>
          </div>

          {/* Attendance Status */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-2">
              {bi('حالة الحضور والتنفيذ (Attendance Status)', 'Attendance Status')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(ATTENDANCE_STATUSES) as AttendanceStatus[]).map((statusKey) => {
                const info = ATTENDANCE_STATUSES[statusKey];
                const isSelected = attendanceStatus === statusKey;

                return (
                  <button
                    key={statusKey}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setAttendanceStatus(statusKey)}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition-all text-center cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-2xs'
                        : 'border-layer-line hover:bg-layer-hover bg-layer text-foreground'
                    }`}
                  >
                    <span>{bi(info.ar, info.en)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cancellation Reason (if not attended) */}
          {attendanceStatus !== 'attended' && (
            <div className="p-3.5 bg-card shadow-2xs rounded-xl space-y-1">
              <label htmlFor="session-cancel-reason-input" className="block text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">
                {bi('سبب الإلغاء أو التخلف عن الحضور', 'Cancellation / No-Show Reason')} <span className="text-rose-500">*</span>
              </label>
              <AutoResizeTextarea
                id="session-cancel-reason-input"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder={bi('وضح سبب الإلغاء أو عدم الحضور لأرشفته في سجل المريض...', 'State reason for cancellation or no-show...')}
                minRows={2}
                className="w-full px-3 py-2 text-xs border border-line-2 rounded-lg focus:ring-2 focus:ring-primary bg-surface text-foreground"
                required
              />
            </div>
          )}

          {/* Therapist Name */}
          <div>
            <label htmlFor="session-therapist-input" className="block text-xs font-bold text-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-muted-foreground-1" />
                <span>{bi('المعالج الطبيعي المسؤول', 'Treating Physical Therapist')}</span>
              </span>
            </label>
            <input
              id="session-therapist-input"
              type="text"
              value={therapistName}
              onChange={(e) => setTherapistName(e.target.value)}
              placeholder={bi('اسم المعالج الموثق للجلسة...', 'Treating therapist name...')}
              className="w-full px-3 py-2 text-xs bg-surface border border-layer-line text-foreground rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-hidden"
            />
          </div>

          {/* Administrative Notes */}
          <div>
            <label htmlFor="session-admin-notes-input" className="block text-xs font-bold text-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-muted-foreground-1" />
                <span>{bi('ملاحظات إدارية وتنظيمية (اختياري — غير سريرية)', 'Administrative Notes (Optional — Non-clinical)')}</span>
              </span>
            </label>
            <AutoResizeTextarea
              id="session-admin-notes-input"
              value={administrativeNotes}
              onChange={(e) => setAdministrativeNotes(e.target.value)}
              placeholder={bi('أي ملاحظات تخص المواعيد، التأخير، أو الترتيبات الإدارية...', 'Notes regarding scheduling, late arrival, or administrative logistics...')}
              minRows={2}
              className="w-full px-3 py-2 text-xs bg-surface border border-layer-line text-foreground rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-hidden"
            />
          </div>

          </div>

          {/* Sticky Footer Actions Bar */}
          <div className="px-4 sm:px-6 py-3.5 border-t border-card-divider bg-muted/40 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-muted-foreground-1 bg-layer border border-layer-line hover:bg-layer-hover transition-colors cursor-pointer"
            >
              {bi('إلغاء', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold text-primary-foreground bg-primary hover:bg-primary-hover shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? bi('جاري الحفظ المشفر...', 'Saving encrypted...') : bi('حفظ الجلسة كمسودة', 'Save Session Draft')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
