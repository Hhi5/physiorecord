// =======================================================================
// PhysioRecord — Walk-In Quick-Add (~10 Seconds Intake) (Phase 2.2)
// Atomically creates Encrypted Patient + Active Care Episode +
// Today's Appointment + Draft Session and jumps directly to Quick SOAP.
// =======================================================================

import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { EpisodeService } from '../../services/episodeService';
import { SessionService } from '../../services/sessionService';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { ModalDialog } from '../ui/Dialog';
import { PhoneInput, TimePickerInput } from '../ui/Primitives';
import { CLINIC_ROOMS } from './AppointmentScheduleView';
import type { PatientRecord } from '../../types/clinical';
import { localDate } from '../../utils/date';
import { commitDurationDraft, sanitizeDurationDraft } from '../../utils/date';
import { Zap, UserPlus, AlertCircle } from 'lucide-react';

interface WalkInQuickAddModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (result: { patient: PatientRecord; sessionId: string }) => void;
}

export const WalkInQuickAddModal: React.FC<WalkInQuickAddModalProps> = ({
  isOpen,
  onOpenChange,
  onCompleted,
}) => {
  const { bi } = useLanguage();
  const { dek, vaultGeneration } = useVault();
  const { savePatient } = usePatients();

  const smartMemory = ClinicOperationsService.getSmartMemory();
  const activeStaff = ClinicOperationsService.getActiveStaff();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [chiefComplaintOrRegion, setChiefComplaintOrRegion] = useState('');
  const [startTime, setStartTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const initialDuration = smartMemory.lastDurationMinutes || 45;
  const [durationMinutes, setDurationMinutes] = useState<number>(initialDuration);
  const [durationDraft, setDurationDraft] = useState<string>(String(initialDuration));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const freshDefault = ClinicOperationsService.getSmartMemory().lastDurationMinutes || 45;
      setDurationMinutes(freshDefault);
      setDurationDraft(String(freshDefault));
    }
  }, [isOpen]);

  const resetForm = () => {
    setFullName('');
    setPhone('');
    setGender('male');
    setChiefComplaintOrRegion('');
    setDurationMinutes(initialDuration);
    setDurationDraft(String(initialDuration));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!dek) {
      setError(bi('الخزينة مقفلة.', 'Vault is locked.', 'قاسەکە داخراوە.'));
      return;
    }
    const cleanName = fullName.trim();
    if (!cleanName) {
      setError(
        bi('يرجى إدخال اسم المريض.', 'Please enter patient name.', 'تکایە ناوی نەخۆش بنووسە.')
      );
      return;
    }

    setSubmitting(true);
    try {
      const today = localDate();
      const regionText =
        chiefComplaintOrRegion.trim() ||
        bi(
          'تقييم علاج طبيعي عام',
          'General Physiotherapy Evaluation',
          'هەڵسەنگاندنی گشتیی چارەسەری سروشتی'
        );
      const isArabicName = /[\u0600-\u06FF]/.test(cleanName);

      // 1. Create encrypted Patient
      const patient = await savePatient({
        fullName: cleanName,
        ...(isArabicName ? { fullNameAr: cleanName } : {}),
        gender,
        phone: phone.trim() || undefined,
        phoneNumber: phone.trim() || undefined,
      });

      // 2. Create encrypted Active Episode
      const episode = await EpisodeService.createEpisode(
        patient.id,
        {
          title:
            chiefComplaintOrRegion.trim() ||
            bi('حلقة رعاية جديدة', 'New Rehab Episode', 'ئەڵقەی چاودێریی نوێ'),
          medicalDiagnosis: regionText,
          clinicalImpression: chiefComplaintOrRegion.trim()
            ? `${chiefComplaintOrRegion.trim()} — ${bi(
                'تقييم زيارة مباشرة',
                'Walk-in assessment',
                'هەڵسەنگاندنی سەردانی ڕاستەوخۆ'
              )}`
            : bi(
                'زيارة مباشرة — التقييم السريري قيد التوثيق في الجلسة',
                'Walk-in visit — clinical assessment documented in session',
                'سەردانی ڕاستەوخۆ — هەڵسەنگاندنی کلینیکی لە دانیشتنەکەدا تۆمار دەکرێت'
              ),
          primarySpecialty: 'general',
          affectedBodyRegion:
            chiefComplaintOrRegion.trim() || bi('عام', 'General', 'گشتی'),
          rehabilitationGoals: { shortTerm: [], longTerm: [] },
          startDate: today,
          status: 'active',
        },
        dek
      );

      const committedDuration = commitDurationDraft(durationDraft, {
        min: 5,
        max: 240,
        fallback: durationMinutes || 45,
      });

      // 3. Create Today's Appointment marked in_session
      const room = smartMemory.lastRoom || CLINIC_ROOMS[1].ar;
      ClinicOperationsService.saveAppointment({
        patientId: patient.id,
        patientName: cleanName,
        patientPhone: phone.trim() || undefined,
        episodeId: episode.id,
        date: today,
        startTime,
        durationMinutes: committedDuration,
        visitType: 'initial_evaluation',
        therapistName: bi(activeStaff.nameAr, activeStaff.nameEn),
        roomOrBed: room,
        status: 'in_session',
        notes: chiefComplaintOrRegion.trim() || undefined,
      });

      // 4. Create Session #1 draft directly so therapist starts Quick SOAP in 1 step
      const session = await SessionService.createSession(
        patient.id,
        episode.id,
        {
          sessionDate: today,
          sessionTime: startTime,
          sessionDurationMinutes: committedDuration,
          sessionType: 'initial_evaluation',
          attendanceStatus: 'attended',
          therapistName: bi(activeStaff.nameAr, activeStaff.nameEn),
        },
        dek,
        undefined,
        undefined,
        vaultGeneration ?? undefined
      );

      // Remember smart defaults & visit history
      ClinicOperationsService.recordPatientVisitMemory(patient.id);
      void ClinicOperationsService.updateSmartMemoryAsync({
        lastDurationMinutes: committedDuration,
        lastRoom: room,
      }).catch(() => undefined);

      resetForm();
      onOpenChange(false);
      onCompleted({ patient, sessionId: session.id });
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر إنشاء سجل المراجع السريع.',
              'Failed to create walk-in patient and session.',
              'دروستکردنی تۆماری سەردانیکەری خێرا سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) resetForm();
        onOpenChange(open);
      }}
      size="sm"
      title={bi(
        'مراجع سريع — تسجيل وبدء الجلسة (10 ثوانٍ)',
        '10-Second Walk-In Quick Add',
        'سەردانیکەری خێرا — تۆمارکردن و دەستپێکردنی دانیشتن (١٠ چرکە)'
      )}
      subtitle={bi(
        'ينشئ ملف المريض + موعد اليوم + جلسة توثيق مفتوحة بخطوة واحدة',
        'Creates encrypted patient, today visit & active session in one step',
        'دۆسیەی نەخۆش + نۆرەی ئەمڕۆ + دانیشتنی تۆمارکردنی کراوە بە یەک هەنگاو دروست دەکات'
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        <div>
          <label htmlFor="walkin-name-field" className="text-xs font-bold text-foreground block mb-1">
            {bi('اسم المريض الكامل *', 'Patient Full Name *', 'ناوی تەواوی نەخۆش *')}
          </label>
          <input
            id="walkin-name-field"
            type="text"
            required
            autoFocus
            data-testid="walkin-name-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={bi(
              'مثال: أحمد كريم الشمري',
              'e.g. Ahmed Kareem',
              'نموونە: ئەحمەد کەریم'
            )}
            className="w-full px-3 py-2.5 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-semibold focus:outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="walkin-phone-field" className="text-xs font-bold text-foreground block mb-1">
              {bi('رقم الهاتف:', 'Phone Number:', 'ژمارەی مۆبایل:')}
            </label>
            <PhoneInput
              id="walkin-phone-field"
              ariaLabel={bi('رقم الهاتف', 'Phone Number', 'ژمارەی مۆبایل')}
              value={phone}
              onChange={setPhone}
              placeholder="0770 123 4567"
            />
          </div>

          <div>
            <span className="text-xs font-bold text-foreground block mb-1">
              {bi('الجنس:', 'Gender:', 'ڕەگەز:')}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                aria-pressed={gender === 'male'}
                onClick={() => setGender('male')}
                className={`py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                  gender === 'male'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-layer text-foreground border-layer-line'
                }`}
              >
                {bi('ذكر', 'Male', 'نێر')}
              </button>
              <button
                type="button"
                aria-pressed={gender === 'female'}
                onClick={() => setGender('female')}
                className={`py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                  gender === 'female'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-layer text-foreground border-layer-line'
                }`}
              >
                {bi('أنثى', 'Female', 'مێ')}
              </button>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="walkin-complaint-field" className="text-xs font-bold text-foreground block mb-1">
            {bi(
              'الشكوى أو المنطقة المصابة (اختياري):',
              'Chief Complaint / Region (Optional):',
              'سکاڵا یان شوێنی ئازار (بژاردەیی):'
            )}
          </label>
          <input
            id="walkin-complaint-field"
            type="text"
            value={chiefComplaintOrRegion}
            onChange={(e) => setChiefComplaintOrRegion(e.target.value)}
            placeholder={bi(
              'مثال: ألم أسفل الظهر / الكتف الأيمن',
              'e.g. Low Back Pain / Right Shoulder',
              'نموونە: ئازاری خوارەوەی پشت / شانی ڕاست'
            )}
            className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="walkin-start-time" className="text-xs font-bold text-foreground block mb-1">
              {bi('وقت البدء:', 'Start Time:', 'کاتی دەستپێکردن:')}
            </label>
            <TimePickerInput id="walkin-start-time" value={startTime} onChange={setStartTime} />
          </div>
          <div>
            <label htmlFor="walkin-duration-field" className="text-xs font-bold text-foreground block mb-1">
              {bi('المدة (دقيقة):', 'Duration (min):', 'ماوە (خولەک):')}
            </label>
            <input
              id="walkin-duration-field"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              dir="ltr"
              lang="en"
              autoComplete="off"
              spellCheck={false}
              data-testid="walkin-duration-input"
              value={durationDraft}
              placeholder="45"
              onChange={(e) => {
                const next = sanitizeDurationDraft(e.target.value, 3);
                setDurationDraft(next);
                if (next) {
                  const parsed = Number.parseInt(next, 10);
                  if (Number.isFinite(parsed)) setDurationMinutes(parsed);
                }
              }}
              onBlur={() => {
                const committed = commitDurationDraft(durationDraft, {
                  min: 5,
                  max: 240,
                  fallback: 45,
                });
                setDurationMinutes(committed);
                setDurationDraft(String(committed));
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-mono font-bold text-left tabular-nums focus:outline-none focus:border-primary"
            />
            <div className="flex items-center gap-1 mt-1.5" dir="ltr">
              {[30, 45, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    setDurationMinutes(mins);
                    setDurationDraft(String(mins));
                  }}
                  style={{ minHeight: 'unset' }}
                  className={`compact-btn flex-1 py-1 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                    durationDraft === String(mins)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-surface text-foreground border-layer-line hover:bg-layer-hover'
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 font-semibold">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-card-divider">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold cursor-pointer"
          >
            {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            data-testid="walkin-submit-btn"
            className="min-h-[42px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer shadow-sm disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
          >
            <Zap className="size-4" />
            <UserPlus className="size-4" />
            <span>
              {submitting
                ? bi('جاري الإنشاء...', 'Creating...', 'خەریکی دروستکردنە...')
                : bi(
                    'حفظ وبدء التوثيق الآن',
                    'Save & Start Session',
                    'پاشەکەوتکردن و دەستپێکردنی تۆمارکردن ئێستا'
                  )}
            </span>
          </button>
        </div>
      </form>
    </ModalDialog>
  );
};
