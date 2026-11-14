// =======================================================================
// PhysioRecord — Phase E2: Privacy-First Offline .ics Calendar Export Modal
// Lazy-loaded via React.lazy from AppointmentScheduleView.
// Generates RFC 5545 .ics calendar files 100% locally with explicit field toggles.
// =======================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Calendar,
  CheckCircle2,
  Copy,
  Download,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { ClinicAppointment, IcsExportFieldOptions } from '../../types/clinicManagement';
import { formatDateDDMMYYYY, localDate } from '../../utils/date';
import {
  DEFAULT_ICS_EXPORT_OPTIONS,
  buildIcsCalendarContent,
  findNextUpcomingAppointment,
} from '../../utils/sharingInteropPhaseE';
import { ModalDialog } from '../ui/Dialog';
import { Num, TimeDisplay } from '../ui/Primitives';

export interface IcsExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dayDate: string;
  dayAppointments: ClinicAppointment[];
  initialSingleAppointment?: ClinicAppointment | null;
  nextUpcomingAppointment?: ClinicAppointment | null;
}

const ALARM_PRESET_MINUTES = [15, 30, 60] as const;

export const IcsExportModal: React.FC<IcsExportModalProps> = ({
  isOpen,
  onClose,
  dayDate,
  dayAppointments,
  initialSingleAppointment = null,
  nextUpcomingAppointment = null,
}) => {
  const { language, isRtl, bi } = useLanguage();
  const icsLang: 'ar' | 'en' = language === 'en' ? 'en' : 'ar';

  const [scope, setScope] = useState<'next' | 'day'>(() =>
    initialSingleAppointment ? 'next' : dayAppointments.length > 0 ? 'day' : 'next'
  );
  const [options, setOptions] = useState<IcsExportFieldOptions>(() => ({
    ...DEFAULT_ICS_EXPORT_OPTIONS,
  }));
  const [alarmPreset, setAlarmPreset] = useState<number>(
    DEFAULT_ICS_EXPORT_OPTIONS.includeReminderAlarmMinutes ?? 30
  );
  const [copied, setCopied] = useState(false);
  const [downloadedFileName, setDownloadedFileName] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setScope(initialSingleAppointment ? 'next' : dayAppointments.length > 0 ? 'day' : 'next');
    setCopied(false);
    setDownloadedFileName(null);
  }, [isOpen, initialSingleAppointment, dayDate, dayAppointments.length]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const targetSingle = useMemo(
    () =>
      initialSingleAppointment ||
      nextUpcomingAppointment ||
      findNextUpcomingAppointment(dayAppointments),
    [initialSingleAppointment, nextUpcomingAppointment, dayAppointments]
  );

  const exportAppointments = useMemo(() => {
    if (scope === 'next') {
      return targetSingle ? [targetSingle] : [];
    }
    return dayAppointments;
  }, [scope, targetSingle, dayAppointments]);

  const activeExportCount = useMemo(
    () => exportAppointments.filter((a) => a.status !== 'cancelled').length,
    [exportAppointments]
  );

  const dayActiveCount = useMemo(
    () => dayAppointments.filter((a) => a.status !== 'cancelled').length,
    [dayAppointments]
  );

  const icsContent = useMemo(
    () =>
      buildIcsCalendarContent({
        appointments: exportAppointments,
        options,
        lang: icsLang,
      }),
    [exportAppointments, options, icsLang]
  );

  const handleCopyIcs = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(icsContent);
      } else {
        const ta = document.createElement('textarea');
        ta.value = icsContent;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleDownloadIcs = () => {
    const rawDate =
      scope === 'next' && targetSingle
        ? targetSingle.date || dayDate || localDate()
        : dayDate || localDate();
    const safeDate = rawDate.replace(/[^0-9-]+/g, '') || localDate();
    const filename =
      scope === 'next' && targetSingle
        ? `physiorecord-schedule-${safeDate}-appt.ics`
        : `physiorecord-schedule-${safeDate}.ics`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloadedFileName(filename);
  };

  const toggleField = (
    key: Exclude<keyof IcsExportFieldOptions, 'includeReminderAlarmMinutes'>,
    checked: boolean
  ) => {
    setOptions((prev) => ({
      ...prev,
      [key]: checked,
    }));
    setCopied(false);
    setDownloadedFileName(null);
  };

  const privacyFields: Array<{
    testId: string;
    key: Exclude<keyof IcsExportFieldOptions, 'includeReminderAlarmMinutes'>;
    labelAr: string;
    labelEn: string;
    labelCkb: string;
    hintAr: string;
    hintEn: string;
    hintCkb: string;
  }> = [
    {
      testId: 'ics-opt-patient-name',
      key: 'includePatientName',
      labelAr: 'اسم المريض',
      labelEn: 'Patient Name',
      labelCkb: 'ناوی نەخۆش',
      hintAr: 'يُدرج في عنوان الحدث (SUMMARY) لتمييز الموعد',
      hintEn: 'Included in event SUMMARY to identify the patient',
      hintCkb: 'دەخرێتە ناو ناونیشانی چالاکییەکە (SUMMARY) بۆ ناسینەوەی چاوپێکەوتنەکە',
    },
    {
      testId: 'ics-opt-patient-phone',
      key: 'includePatientPhone',
      labelAr: 'رقم هاتف المريض',
      labelEn: 'Patient Phone Number',
      labelCkb: 'ژمارەی مۆبایلی نەخۆش',
      hintAr: 'اختياري (مغلق افتراضياً لحماية الخصوصية)',
      hintEn: 'Optional (off by default to protect privacy)',
      hintCkb: 'ئارەزوومەندانە (بە شێوەی بنەڕەت ناچالاکە بۆ پاراستنی نهێنی)',
    },
    {
      testId: 'ics-opt-therapist',
      key: 'includeTherapistName',
      labelAr: 'اسم المعالج الفيزيائي',
      labelEn: 'Therapist Name',
      labelCkb: 'ناوی چارەسەرکاری فیزیایی',
      hintAr: 'يُدرج ضمن وصف الحدث (DESCRIPTION)',
      hintEn: 'Included inside event DESCRIPTION',
      hintCkb: 'دەخرێتە ناو پێناسەی چالاکییەکە (DESCRIPTION)',
    },
    {
      testId: 'ics-opt-location',
      key: 'includeLocationAndRoom',
      labelAr: 'الموقع / الغرفة / عنوان الزيارة المنزلية',
      labelEn: 'Location / Room / Home Visit Address',
      labelCkb: 'شوێن / ژوور / ناونیشانی سەردانی ماڵەوە',
      hintAr: 'يُدرج في حقل الموقع (LOCATION)',
      hintEn: 'Included in calendar LOCATION field',
      hintCkb: 'دەخرێتە ناو خانەی شوێن (LOCATION)',
    },
    {
      testId: 'ics-opt-notes',
      key: 'includeVisitTypeAndNotes',
      labelAr: 'نوع الزيارة والحالة والملاحظات',
      labelEn: 'Visit Type, Episode & Notes',
      labelCkb: 'جۆری سەردان، خول و تێبینییەکان',
      hintAr: 'مغلق افتراضياً لتجنب نقل تفاصيل سريرية للتقويم',
      hintEn: 'Off by default to keep clinical context out of calendar apps',
      hintCkb: 'بە شێوەی بنەڕەت ناچالاکە بۆ ئەوەی وردەکاری کلینیکی نەچێتە ناو ئەپەکانی ڕۆژژمێر',
    },
  ];

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
      title={bi(
        'تصدير ملف التقويم المحلي (.ics)',
        'Offline Calendar Export (.ics)',
        'هەناردەکردنی فایلی ڕۆژژمێری ناوخۆیی (.ics)'
      )}
      subtitle={bi(
        'تصدير المواعيد كملف RFC 5545 قياسي متوافق مع تقويم Google و Apple و Outlook بدون أي اتصال خارجي.',
        'Generate a standard RFC 5545 .ics file for Google, Apple, or Outlook calendars completely offline.',
        'دروستکردنی فایلی ستانداردی RFC 5545 .ics بۆ ڕۆژژمێرەکانی Google و Apple و Outlook بە تەواوی بێ ئینتەرنێت.'
      )}
      closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      footer={
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="w-full flex flex-wrap items-center justify-between gap-2.5"
        >
          <div className="text-xs text-muted-foreground-1 flex items-center gap-1.5">
            {downloadedFileName ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold">
                <CheckCircle2 className="size-3.5 shrink-0" />
                <span>
                  {bi(
                    `تم تنزيل ${downloadedFileName}`,
                    `Downloaded ${downloadedFileName}`,
                    `${downloadedFileName} داگیرا`
                  )}
                </span>
              </span>
            ) : (
              <span>
                {bi('عدد المواعيد المصدّرة:', 'Events to export:', 'ژمارەی چاوپێکەوتنە هەناردەکراوەکان:')}{' '}
                <strong className="text-foreground tabular-nums">
                  <Num value={activeExportCount} />
                </strong>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-layer border border-layer-line text-foreground text-xs font-semibold hover:bg-layer-hover transition-colors cursor-pointer"
            >
              {bi('إغلاق', 'Close', 'داخستن')}
            </button>

            <button
              type="button"
              data-testid="ics-copy-btn"
              onClick={() => void handleCopyIcs()}
              disabled={activeExportCount === 0}
              className="px-3.5 py-2 rounded-xl bg-surface border border-layer-line hover:bg-layer-hover text-foreground text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{bi('تم النسخ', 'Copied', 'کۆپی کرا')}</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5 text-primary" />
                  <span>{bi('نسخ النص (.ics)', 'Copy .ics', 'کۆپیکردنی دەق (.ics)')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              data-testid="ics-download-confirm-btn"
              onClick={handleDownloadIcs}
              disabled={activeExportCount === 0}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="size-3.5" />
              <span>{bi('تنزيل ملف (.ics)', 'Download .ics', 'داگرتنی فایل (.ics)')}</span>
            </button>
          </div>
        </div>
      }
    >
      <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-4 text-xs">
        {/* Local Privacy Banner */}
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5 leading-relaxed">
          <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="font-medium">
            {bi(
              'بدون إنترنت: يحتوي ملف التقويم (.ics) حصراً على الحقول التي تحددها أدناه ويمكن فتحه في تقويم Google أو Apple أو Outlook محلياً.',
              '100% offline: the generated .ics file includes strictly the fields you choose below.',
              'بە تەواوی بێ ئینتەرنێت: فایلی ڕۆژژمێر (.ics) تەنها ئەو خانانە لەخۆدەگرێت کە لە خوارەوە دیارییان دەکەیت و دەکرێت بە شێوەی ناوخۆیی بکرێتەوە.'
            )}
          </p>
        </div>

        {/* Scope Selector */}
        <div className="space-y-2">
          <div className="font-bold text-foreground flex items-center gap-1.5">
            <Calendar className="size-3.5 text-primary" />
            <span>{bi('نطاق التصدير', 'Export Scope', 'مەودای هەناردەکردن')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              data-testid="ics-scope-next-btn"
              onClick={() => {
                setScope('next');
                setCopied(false);
                setDownloadedFileName(null);
              }}
              className={`p-3 rounded-xl border text-start transition-colors cursor-pointer space-y-1 ${
                scope === 'next'
                  ? 'bg-primary/10 border-primary text-foreground shadow-2xs'
                  : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
              }`}
            >
              <div className="font-bold flex items-center justify-between gap-2">
                <span>{bi('الموعد القادم / المحدد', 'Next / Selected Appointment', 'چاوپێکەوتنی داهاتوو / هەڵبژێردراو')}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
                    scope === 'next'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-layer border border-line-2 text-muted-foreground-1'
                  }`}
                >
                  <Num value={targetSingle && targetSingle.status !== 'cancelled' ? 1 : 0} />
                </span>
              </div>
              <div className="text-muted-foreground-1 flex flex-wrap items-center gap-1.5">
                {targetSingle ? (
                  <>
                    <span className="tabular-nums">{formatDateDDMMYYYY(targetSingle.date)}</span>
                    <span>·</span>
                    <TimeDisplay time={targetSingle.startTime} />
                    <span>·</span>
                    <span className="font-semibold text-foreground truncate">
                      {targetSingle.patientName}
                    </span>
                  </>
                ) : (
                  <span>{bi('لا يوجد موعد قادم متاح', 'No upcoming appointment available', 'هیچ چاوپێکەوتنێکی داهاتوو بەردەست نییە')}</span>
                )}
              </div>
            </button>

            <button
              type="button"
              data-testid="ics-scope-day-btn"
              onClick={() => {
                setScope('day');
                setCopied(false);
                setDownloadedFileName(null);
              }}
              className={`p-3 rounded-xl border text-start transition-colors cursor-pointer space-y-1 ${
                scope === 'day'
                  ? 'bg-primary/10 border-primary text-foreground shadow-2xs'
                  : 'bg-surface border-line-2 text-foreground hover:bg-layer-hover'
              }`}
            >
              <div className="font-bold flex items-center justify-between gap-2">
                <span>{bi('جدول اليوم كاملاً', 'Full Day Schedule', 'خشتەی تەواوی ئەمڕۆ')}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
                    scope === 'day'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-layer border border-line-2 text-muted-foreground-1'
                  }`}
                >
                  <Num value={dayActiveCount} />
                </span>
              </div>
              <div className="text-muted-foreground-1 tabular-nums">
                {formatDateDDMMYYYY(dayDate)}
              </div>
            </button>
          </div>
        </div>

        {/* Privacy Controls */}
        <div className="p-3.5 rounded-xl bg-surface border border-line-2 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-foreground flex items-center gap-1.5">
              <Lock className="size-3.5 text-primary" />
              <span>{bi('حقول الخصوصية المسموح بتضمينها', 'Privacy Field Controls', 'کۆنترۆڵی خانەکانی تایبەتمەندی')}</span>
            </div>
            <span className="text-xs text-muted-foreground-1">
              {bi('يتم تحديث المعاينة فوراً', 'Preview updates live', 'پێشبینین دەستبەجێ نوێ دەبێتەوە')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {privacyFields.map((field) => {
              const checked = options[field.key];
              return (
                <label
                  key={field.testId}
                  className="p-2.5 rounded-xl bg-layer/70 border border-layer-line flex items-start gap-2.5 cursor-pointer hover:bg-layer-hover transition-colors"
                >
                  <input
                    type="checkbox"
                    data-testid={field.testId}
                    checked={checked}
                    onChange={(e) => toggleField(field.key, e.target.checked)}
                    className="mt-0.5 size-4 rounded border-line-2 text-primary focus:ring-primary cursor-pointer shrink-0"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-bold text-foreground">{bi(field.labelAr, field.labelEn, field.labelCkb)}</div>
                    <div className="text-xs text-muted-foreground-1 leading-snug">
                      {bi(field.hintAr, field.hintEn, field.hintCkb)}
                    </div>
                  </div>
                </label>
              );
            })}

            {/* Reminder Alarm Toggle + Minutes Selector */}
            <div className="p-2.5 rounded-xl bg-layer/70 border border-layer-line flex flex-col justify-between gap-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="ics-opt-alarm"
                  checked={options.includeReminderAlarmMinutes !== null}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setOptions((prev) => ({
                      ...prev,
                      includeReminderAlarmMinutes: checked ? alarmPreset : null,
                    }));
                    setCopied(false);
                    setDownloadedFileName(null);
                  }}
                  className="mt-0.5 size-4 rounded border-line-2 text-primary focus:ring-primary cursor-pointer shrink-0"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="font-bold text-foreground flex items-center gap-1">
                    <Bell className="size-3.5 text-primary shrink-0" />
                    <span>{bi('تنبيه تذكير (VALARM)', 'Calendar Reminder Alarm (VALARM)', 'ئاگادارکردنەوەی بیرخستنەوە (VALARM)')}</span>
                  </div>
                  <div className="text-xs text-muted-foreground-1 leading-snug">
                    {bi('إشعار تذكير محلي قبل الموعد', 'Local device reminder before appointment', 'ئاگادارکردنەوەی ناوخۆیی پێش چاوپێکەوتنەکە')}
                  </div>
                </div>
              </label>

              {options.includeReminderAlarmMinutes !== null && (
                <div className="flex items-center justify-between gap-2 ps-6">
                  <span className="text-xs text-muted-foreground-1">
                    {bi('وقت التذكير:', 'Remind before:', 'کاتی بیرخستنەوە:')}
                  </span>
                  <select
                    data-testid="ics-alarm-minutes-select"
                    value={options.includeReminderAlarmMinutes}
                    onChange={(e) => {
                      const mins = Number(e.target.value) || 30;
                      setAlarmPreset(mins);
                      setOptions((prev) => ({
                        ...prev,
                        includeReminderAlarmMinutes: mins,
                      }));
                      setCopied(false);
                      setDownloadedFileName(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-surface border border-layer-line text-xs font-bold text-foreground cursor-pointer"
                  >
                    {ALARM_PRESET_MINUTES.map((mins) => (
                      <option key={mins} value={mins}>
                        {bi(`قبل ${mins} دقيقة`, `${mins} minutes before`, `${mins} خولەک پێشتر`)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Empty Notice when scope has 0 active appointments */}
        {activeExportCount === 0 && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 text-xs font-medium">
            {bi(
              'لا توجد مواعيد نشطة (غير ملغاة) في النطاق المحدد حالياً.',
              'There are no active (non-cancelled) appointments in the currently selected scope.',
              'لە ئێستادا هیچ چاوپێکەوتنێکی چالاک (هەڵنەوەشاوە) لە مەودای هەڵبژێردراودا نییە.'
            )}
          </div>
        )}

        {/* Live .ics Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-foreground">
              {bi('معاينة ملف التقويم (.ics)', 'Live .ics Preview', 'پێشبینینی ڕاستەوخۆی فایلی ڕۆژژمێر (.ics)')}
            </span>
            <span className="text-xs text-muted-foreground-1">RFC 5545</span>
          </div>
          <pre
            data-testid="ics-live-preview"
            dir="ltr"
            className="p-3 rounded-xl bg-surface border border-line-2 text-xs font-mono text-foreground overflow-x-auto max-h-56 overflow-y-auto whitespace-pre leading-relaxed"
          >
            {icsContent}
          </pre>
        </div>
      </div>
    </ModalDialog>
  );
};

export default IcsExportModal;
