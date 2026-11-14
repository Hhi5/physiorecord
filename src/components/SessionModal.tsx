// =======================================================================
// PhysioRecord — Clinical Session Modal (Phase 2B.2)
// Creation & Editing of Clinical Sessions with Active Episode Binding
// =======================================================================

import React, { useState, useEffect } from 'react';
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
} from '../types/clinical';
import { useLanguage } from '../context/LanguageContext';
import { localDate, formatDateDDMMYYYY } from '../utils/date';
import { AutoResizeTextarea, DatePickerInput } from './ui/Primitives';

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
      setSessionDurationMinutes(d.sessionDurationMinutes || 45);
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
      const payload: Partial<SessionClinicalData> = {
        sessionNumber: parsedNumber,
        sessionType,
        sessionDate,
        sessionTime,
        sessionDurationMinutes: Number(sessionDurationMinutes),
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
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bg-card rounded-2xl max-w-2xl w-full shadow-2xl border border-card-line overflow-hidden my-6">
        
        {/* Modal Header */}
        <div className="px-6 py-5 bg-primary text-primary-foreground flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold">
                  {sessionToEdit ? bi('تعديل بيانات الجلسة السريرية', 'Edit Session Details') : bi('تسجيل جلسة علاجية جديدة', 'New Clinical Session')}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-white/15 text-white border border-white/25">
                  {bi(`الجلسة #${calculatedSessionNumber}`, `Session #${calculatedSessionNumber}`)}
                </span>
              </div>
              <p className="text-xs text-white/85 mt-0.5">
                {bi('ضمن حلقة:', 'Episode:')} <strong className="text-white">{episode.data.title}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={bi('إغلاق', 'Close')}
            className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-3 text-rose-800 dark:text-rose-300 text-xs sm:text-sm">
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
                    onClick={() => setSessionType(typeKey)}
                    className={`p-3 rounded-xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-2xs ring-1 ring-primary'
                        : 'border-layer-line hover:bg-layer-hover bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-foreground">{info.ar}</span>
                      <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-primary bg-primary' : 'border-layer-line'}`}>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground-1" dir="ltr">{info.en}</span>
                    <span className="text-xs text-muted-foreground-2 mt-1 leading-tight">{info.descriptionAr}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session Number, Date, Time & Duration Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 pt-2">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground-1" />
                  <span>رقم الجلسة</span>
                </span>
              </label>
              <input
                type="number"
                min="1"
                placeholder={`تلقائي (${calculatedSessionNumber})`}
                value={customSessionNumber}
                onChange={(e) => setCustomSessionNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-surface border border-layer-line text-foreground rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground-1" />
                  <span>{bi('تاريخ الجلسة', 'Session Date')}</span>
                </span>
              </label>
              <DatePickerInput
                min={(episode.data.startDate || episode.startDate || '').slice(0, 10) || undefined}
                value={sessionDate}
                onChange={(val) => setSessionDate(val)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground-1" />
                  <span>وقت الانعقاد</span>
                </span>
              </label>
              <input
                type="time"
                value={sessionTime}
                onChange={(e) => setSessionTime(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-surface border border-layer-line text-foreground rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground-1" />
                  <span>المدة (بالدقائق)</span>
                </span>
              </label>
              <input
                type="number"
                min="10"
                max="180"
                step="5"
                value={sessionDurationMinutes}
                onChange={(e) => setSessionDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-surface border border-layer-line text-foreground rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-hidden"
              />
            </div>
          </div>

          {/* Attendance Status */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-2">
              حالة الحضور والتنفيذ (Attendance Status)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(ATTENDANCE_STATUSES) as AttendanceStatus[]).map((statusKey) => {
                const info = ATTENDANCE_STATUSES[statusKey];
                const isSelected = attendanceStatus === statusKey;

                return (
                  <button
                    key={statusKey}
                    type="button"
                    onClick={() => setAttendanceStatus(statusKey)}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition-all text-center cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-2xs'
                        : 'border-layer-line hover:bg-layer-hover bg-layer text-foreground'
                    }`}
                  >
                    <span>{info.ar}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cancellation Reason (if not attended) */}
          {attendanceStatus !== 'attended' && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900">
              <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 mb-1">
                سبب الإلغاء أو التخلف عن الحضور <span className="text-rose-500">*</span>
              </label>
              <AutoResizeTextarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="وضح سبب الإلغاء أو عدم الحضور لأرشفته في سجل المريض..."
                minRows={2}
                className="w-full px-3 py-2 text-xs border border-amber-300 dark:border-amber-800 rounded-lg focus:ring-2 focus:ring-amber-500 bg-surface text-foreground"
                required
              />
            </div>
          )}

          {/* Therapist Name */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-muted-foreground-1" />
                <span>المعالج الطبيعي المسؤول</span>
              </span>
            </label>
            <input
              type="text"
              value={therapistName}
              onChange={(e) => setTherapistName(e.target.value)}
              placeholder="اسم المعالج الموثق للجلسة..."
              className="w-full px-3 py-2 text-xs bg-surface border border-layer-line text-foreground rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-hidden"
            />
          </div>

          {/* Administrative Notes */}
          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-muted-foreground-1" />
                <span>ملاحظات إدارية وتنظيمية (اختياري — غير سريرية)</span>
              </span>
            </label>
            <AutoResizeTextarea
              value={administrativeNotes}
              onChange={(e) => setAdministrativeNotes(e.target.value)}
              placeholder="أي ملاحظات تخص المواعيد، التأخير، أو الترتيبات الإدارية..."
              minRows={2}
              className="w-full px-3 py-2 text-xs bg-surface border border-layer-line text-foreground rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-hidden"
            />
          </div>

          {/* Actions Bar */}
          <div className="pt-4 border-t border-card-divider flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-lg text-xs font-semibold text-muted-foreground-1 bg-layer border border-layer-line hover:bg-layer-hover transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-xs font-bold text-primary-foreground bg-primary hover:bg-primary-hover shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? 'جاري الحفظ المشفر...' : 'حفظ الجلسة كمسودة'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
