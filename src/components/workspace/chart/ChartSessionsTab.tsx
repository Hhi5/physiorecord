import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Pause, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { useVirtualWindow } from '../../../hooks/useVirtualWindow';
import { ClinicOperationsService } from '../../../services/clinicOperationsService';
import type { EpisodeRecord, PatientRecord, SessionRecord } from '../../../types/clinical';
import type { RecurringPatientSchedule, WeekdayIndex } from '../../../types/clinicManagement';
import {
  WEEKDAYS_IRAQI_ORDER,
  formatDateDDMMYYYY,
  formatWeekdaysSummary,
  localDate,
} from '../../../utils/date';
import { isDemoPatient } from '../../../utils/mrn';
import { DatePickerInput, Num, TimeDisplay, TimePickerInput } from '../../ui/Primitives';

export interface ChartSessionsTabProps {
  patient: PatientRecord;
  activeEpisode: EpisodeRecord | null;
  episodeSessions: SessionRecord[];
  onOpenSession: (sessionId: string) => void;
  onOpenNewSession: () => void;
}

export const ChartSessionsTab: React.FC<ChartSessionsTabProps> = ({
  patient,
  activeEpisode,
  episodeSessions,
  onOpenSession,
  onOpenNewSession,
}) => {
  const { language, bi } = useLanguage();

  const [sessionGridCols, setSessionGridCols] = useState<number>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 2 : 1
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setSessionGridCols(window.innerWidth >= 768 ? 2 : 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const chartSessionsVirtual = useVirtualWindow({
    totalCount: episodeSessions.length,
    estimatedRowHeightPx: 96,
    columns: sessionGridCols,
    overscanRows: 4,
  });

  const visibleChartSessions = useMemo(
    () => episodeSessions.slice(chartSessionsVirtual.startIndex, chartSessionsVirtual.endIndex),
    [episodeSessions, chartSessionsVirtual.startIndex, chartSessionsVirtual.endIndex]
  );

  const [patientRecurringRules, setPatientRecurringRules] = useState<RecurringPatientSchedule[]>(
    () => ClinicOperationsService.getRecurringSchedulesForPatient(patient.id)
  );
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recWeekdays, setRecWeekdays] = useState<WeekdayIndex[]>([0, 2, 4]);
  const [recStartTime, setRecStartTime] = useState('10:00');
  const [recDuration, setRecDuration] = useState<number>(45);
  const [recCustomDurationMode, setRecCustomDurationMode] = useState(false);
  const [recCustomDurationDraft, setRecCustomDurationDraft] = useState('45');
  const [recStartDate, setRecStartDate] = useState(localDate());

  const reloadPatientRecurring = () => {
    setPatientRecurringRules(ClinicOperationsService.getRecurringSchedulesForPatient(patient.id));
  };

  useEffect(() => {
    reloadPatientRecurring();
    const onScheduleUpdate = () => reloadPatientRecurring();
    window.addEventListener('physiorecord-schedule-updated', onScheduleUpdate);
    window.addEventListener('physiorecord-demo-updated', onScheduleUpdate);
    return () => {
      window.removeEventListener('physiorecord-schedule-updated', onScheduleUpdate);
      window.removeEventListener('physiorecord-demo-updated', onScheduleUpdate);
    };
  }, [patient.id]);

  const handleToggleRecWeekday = (day: WeekdayIndex) => {
    setRecWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSavePatientRecurring = (e: React.FormEvent) => {
    e.preventDefault();
    if (recWeekdays.length === 0) return;
    const resolvedDuration = Math.max(5, Math.min(480, Math.round(Number(recDuration) || 45)));
    ClinicOperationsService.saveRecurringSchedule({
      patientId: patient.id,
      patientName: patient.data.fullNameAr || patient.data.fullName,
      patientPhone: patient.data.phoneNumber || patient.data.phone || '',
      episodeTitle:
        activeEpisode?.data.title ||
        bi('جلسات تأهيل وعلاج طبيعي', 'PT Rehabilitation Sessions', 'دانیشتنەکانی شیاندنەوە و چارەسەری سروشتی'),
      therapistName: ClinicOperationsService.getActiveStaff().nameAr,
      weekdays: recWeekdays,
      startTime: recStartTime,
      durationMinutes: resolvedDuration,
      visitType: 'follow_up',
      roomOrBed: bi('وحدة العلاج الطبيعي 1', 'PT Treatment Room 1', 'یەکەی چارەسەری سروشتی ١'),
      startDate: recStartDate || localDate(),
      isActive: true,
      isDemo: isDemoPatient(patient),
    });
    reloadPatientRecurring();
    setRecCustomDurationMode(false);
    setRecDuration(45);
    setRecCustomDurationDraft('45');
    setShowRecurringForm(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-foreground">
            {bi(
              'سجل الجلسات العلاجية لحلقة الرعاية الحالية:',
              'Episode Treatment Sessions:',
              'تۆماری دانیشتنە چارەسەرییەکانی قۆناغی چاودێری ئێستا:'
            )}
          </h2>
          <p className="text-xs text-muted-foreground-1">
            {bi(
              'افتح أي جلسة لتوثيق جدول التمارين اليومي، العلاج اليدوي، والأجهزة.',
              'Click any session to open its structured Exercise & Modality Flowsheet.',
              'هەر دانیشتنێک بکەرەوە بۆ تۆمارکردنی خشتەی ڕاهێنانی ڕۆژانە، چارەسەری دەستی و ئامێرەکان.'
            )}
          </p>
        </div>

        {activeEpisode && (
          <button
            type="button"
            onClick={onOpenNewSession}
            className="min-h-[36px] py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs inline-flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Plus className="size-4" />
            <span>{bi('بدء جلسة علاجية جديدة', 'New Treatment Session', 'دەستپێکردنی دانیشتنێکی چارەسەری نوێ')}</span>
          </button>
        )}
      </div>

      {/* Weekly Recurring Session Days Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Repeat className="size-4 text-primary" />
            <h3 className="text-xs sm:text-sm font-bold text-foreground">
              {bi(
                'مواعيد الجلسات الأسبوعية (إضافة تلقائية للطابور)',
                'Weekly Recurring Sessions (Auto-Queue)',
                'کاتی دانیشتنە هەفتانەکان (زیادکردنی خۆکار بۆ ڕیز)'
              )}
            </h3>
            <span className="py-0.5 px-2 rounded-full text-xs font-mono font-bold bg-primary/10 text-primary tabular-nums">
              <Num value={patientRecurringRules.length} />
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowRecurringForm(!showRecurringForm)}
            className="min-h-[36px] py-1.5 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-semibold transition-colors cursor-pointer"
          >
            {showRecurringForm
              ? bi('إغلاق النموذج', 'Close Form', 'داخستنی فۆرم')
              : bi('+ تحديد أيام أسبوعية', '+ Set Weekly Days', '+ دیاریکردنی ڕۆژە هەفتانەکان')}
          </button>
        </div>

        {showRecurringForm && (
          <form
            onSubmit={handleSavePatientRecurring}
            className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground">
                {bi('اختر أيام الحضور الأسبوعية:', 'Select Weekly Session Days:', 'ڕۆژەکانی ئامادەبوونی هەفتانە هەڵبژێرە:')}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRecWeekdays([0, 2, 4])}
                  className="min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold bg-card border border-line-2 text-primary hover:bg-primary/10 cursor-pointer"
                >
                  {bi('أحد · ثلاثاء · خميس', 'Sun · Tue · Thu', 'یەکشەممە · سێشەممە · پێنجشەممە')}
                </button>
                <button
                  type="button"
                  onClick={() => setRecWeekdays([6, 1, 3])}
                  className="min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold bg-card border border-line-2 text-primary hover:bg-primary/10 cursor-pointer"
                >
                  {bi('سبت · إثنين · أربعاء', 'Sat · Mon · Wed', 'شەممە · دووشەممە · چوارشەممە')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {WEEKDAYS_IRAQI_ORDER.map((day) => {
                const activeDay = recWeekdays.includes(day.index);
                return (
                  <button
                    key={day.index}
                    type="button"
                    onClick={() => handleToggleRecWeekday(day.index)}
                    className={`min-h-[36px] py-2 px-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer text-center ${
                      activeDay
                        ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                        : 'bg-card text-foreground border-layer-line hover:bg-layer-hover'
                    }`}
                  >
                    {bi(day.ar, day.shortEn, day.ckb)}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="rec-start-time" className="text-xs font-semibold text-foreground block mb-1">
                  {bi('وقت الجلسة:', 'Session Time:', 'کاتی دانیشتن:')}
                </label>
                <TimePickerInput id="rec-start-time" value={recStartTime} onChange={setRecStartTime} />
              </div>
              <div>
                <label htmlFor="rec-start-date" className="text-xs font-semibold text-foreground block mb-1">
                  {bi('يبدأ من تاريخ:', 'Starts On:', 'دەستپێدەکات لە بەرواری:')}
                </label>
                <DatePickerInput id="rec-start-date" value={recStartDate} onChange={setRecStartDate} />
              </div>
              <div>
                <label htmlFor="rec-custom-duration" className="text-xs font-semibold text-foreground block mb-1">
                  {bi('المدة (بالدقائق):', 'Duration (min):', 'ماوە (بە خولەک):')}
                </label>
                <div className="grid grid-cols-4 gap-1" dir="ltr">
                  {([30, 45, 60] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setRecCustomDurationMode(false);
                        setRecDuration(preset);
                      }}
                      className={`min-h-[36px] py-2 rounded-xl text-xs font-mono font-bold border transition-colors cursor-pointer ${
                        !recCustomDurationMode && recDuration === preset
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-foreground border-layer-line'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setRecCustomDurationMode(true);
                      setRecCustomDurationDraft(String(recDuration || 45));
                    }}
                    className={`min-h-[36px] py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      recCustomDurationMode
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground border-layer-line'
                    }`}
                  >
                    {bi('يدوي', 'Custom', 'دەستی')}
                  </button>
                </div>
                {recCustomDurationMode && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      id="rec-custom-duration"
                      type="number"
                      min={5}
                      max={480}
                      step={1}
                      dir="ltr"
                      aria-label={bi('مدة الجلسة المخصصة بالدقائق', 'Custom session duration in minutes')}
                      value={recCustomDurationDraft}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setRecCustomDurationDraft(raw);
                        const parsed = parseInt(raw, 10);
                        if (!Number.isNaN(parsed) && parsed >= 5) {
                          setRecDuration(Math.min(480, parsed));
                        }
                      }}
                      placeholder="75"
                      className="w-24 px-2.5 py-1.5 text-xs rounded-lg bg-card border border-layer-line text-foreground font-mono font-bold tabular-nums focus:outline-none focus:border-primary"
                    />
                    <span className="text-xs text-muted-foreground-1 font-semibold">
                      {bi('دقيقة', 'min', 'خولەک')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-primary/90 font-medium">
                {bi(
                  'عند حلول كل يوم محدد، ينضاف المريض تلقائياً لطابور الاستقبال.',
                  'Patient auto-joins Reception Queue on matching dates.',
                  'لە هەر ڕۆژێکی دیاریکراودا، نەخۆشەکە بە شێوەی خۆکار دەچێتە ناو ڕیزی پێشوازی.'
                )}
              </span>
              <button
                type="submit"
                disabled={recWeekdays.length === 0}
                className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed text-primary-foreground text-xs font-bold cursor-pointer compact-btn"
                style={{ minHeight: 'unset' }}
              >
                {bi('حفظ الجدول الأسبوعي', 'Save Weekly Schedule', 'پاشەکەوتکردنی خشتەی هەفتانە')}
              </button>
            </div>
          </form>
        )}

        {patientRecurringRules.length === 0 ? (
          !showRecurringForm && (
            <p className="text-xs text-muted-foreground-2">
              {bi(
                'لا توجد أيام أسبوعية محددة لهذا المريض حالياً.',
                'No weekly recurring session days configured for this patient yet.',
                'لە ئێستادا هیچ ڕۆژێکی هەفتانە بۆ ئەم نەخۆشە دیاری نەکراوە.'
              )}
            </p>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {patientRecurringRules.map((rule) => (
              <div
                key={rule.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                  rule.isActive
                    ? 'bg-layer border-layer-line'
                    : 'bg-muted/40 border-line-2 opacity-75'
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-primary">
                      {formatWeekdaysSummary(rule.weekdays, language)}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                        rule.isActive
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {rule.isActive
                        ? bi('نشط', 'Active', 'چالاک')
                        : bi('متوقف', 'Paused', 'وەستاو')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground-1 flex items-center gap-2">
                    <span className="font-bold text-foreground">
                      <TimeDisplay time={rule.startTime} />
                    </span>
                    <span>•</span>
                    <span>
                      <Num value={rule.durationMinutes} /> {bi('دقيقة', 'min', 'خولەک')}
                    </span>
                    <span>•</span>
                    <span>
                      {bi('من ', 'From ', 'لە ')}
                      <bdi dir="ltr">{formatDateDDMMYYYY(rule.startDate)}</bdi>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      ClinicOperationsService.toggleRecurringScheduleActive(rule.id);
                      reloadPatientRecurring();
                    }}
                    className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-muted-foreground-1 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer inline-flex items-center justify-center"
                    aria-label={
                      rule.isActive
                        ? bi('إيقاف مؤقت للجدول الأسبوعي', 'Pause weekly schedule', 'وەستاندنی کاتی')
                        : bi('تفعيل الجدول الأسبوعي', 'Resume weekly schedule', 'کاراکردن')
                    }
                    title={
                      rule.isActive
                        ? bi('إيقاف مؤقت', 'Pause', 'وەستاندنی کاتی')
                        : bi('تفعيل', 'Resume', 'کاراکردن')
                    }
                  >
                    {rule.isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      ClinicOperationsService.deleteRecurringSchedule(rule.id);
                      reloadPatientRecurring();
                    }}
                    className="min-w-[36px] min-h-[36px] p-1.5 rounded-lg text-muted-foreground-1 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer inline-flex items-center justify-center"
                    aria-label={bi('حذف الجدول الأسبوعي', 'Delete weekly schedule', 'سڕینەوە')}
                    title={bi('حذف', 'Delete', 'سڕینەوە')}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {episodeSessions.length === 0 ? (
        <div className="p-12 rounded-2xl bg-card border border-card-line text-center space-y-3 shadow-2xs">
          <Clock className="size-8 text-muted-foreground-1 mx-auto" />
          <p className="text-xs text-muted-foreground-1">
            {bi(
              'لا توجد جلسات مسجلة في حلقة الرعاية هذه بعد.',
              'No treatment sessions recorded in this episode yet.',
              'هێشتا هیچ دانیشتنێک لەم قۆناغەدا تۆمار نەکراوە.'
            )}
          </p>
        </div>
      ) : (
        <div
          ref={chartSessionsVirtual.containerRef}
          onScroll={chartSessionsVirtual.onScroll}
          data-testid="chart-sessions-list"
          tabIndex={chartSessionsVirtual.isVirtualized ? 0 : undefined}
          aria-label={chartSessionsVirtual.isVirtualized ? bi('قائمة الجلسات العلاجية', 'Treatment sessions list') : undefined}
          className={chartSessionsVirtual.isVirtualized ? 'max-h-[70vh] overflow-y-auto pe-1' : ''}
        >
          {chartSessionsVirtual.topSpacerPx > 0 && (
            <div style={{ height: chartSessionsVirtual.topSpacerPx }} aria-hidden="true" />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {visibleChartSessions.map((session) => {
              const sNumber = session.sessionNumber ?? session.data?.sessionNumber ?? 1;
              const sDate = session.sessionDate ?? session.data?.sessionDate ?? '';
              const sStatus = session.status ?? session.data?.status ?? 'draft';
              const sType = session.sessionType ?? session.data?.sessionType ?? 'follow_up';
              const sDuration = session.data?.sessionDurationMinutes || 45;

              return (
                <div
                  key={session.id}
                  onClick={() => onOpenSession(session.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenSession(session.id);
                    }
                  }}
                  className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line hover:border-primary/60 shadow-2xs transition-all cursor-pointer space-y-2 group focus:outline-none focus:ring-2 focus:ring-primary/25"
                >
                  <div className="flex items-center justify-between tabular-nums">
                    <span className="font-bold text-foreground text-xs sm:text-sm flex items-center gap-2">
                      <span className="text-primary font-mono font-bold">
                        <bdi dir="ltr">#{sNumber}</bdi>
                      </span>
                      <bdi dir="ltr">{formatDateDDMMYYYY(sDate)}</bdi>
                    </span>
                    <span
                      className={`py-0.5 px-2.5 rounded-full text-xs font-semibold border ${
                        sStatus === 'finalized'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                          : 'bg-surface text-muted-foreground-1 border-line-2'
                      }`}
                    >
                      {sStatus === 'finalized'
                        ? bi('معتمدة ومغلقة', 'Finalized', 'پەسەندکراو و داخراو')
                        : bi('مسودة', 'Draft', 'ڕەشنووس')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground-1 tabular-nums">
                    {sType === 'initial_evaluation'
                      ? bi('تقييم أولي', 'Initial Evaluation', 'هەڵسەنگاندنی سەرەتایی')
                      : sType === 're_evaluation'
                      ? bi('إعادة تقييم', 'Re-evaluation', 'دووبارە هەڵسەنگاندن')
                      : bi('جلسة متابعة', 'Follow-up', 'دانیشتنی بەدواداچوون')}{' '}
                    · {sDuration}m
                  </p>
                </div>
              );
            })}
          </div>
          {chartSessionsVirtual.bottomSpacerPx > 0 && (
            <div style={{ height: chartSessionsVirtual.bottomSpacerPx }} aria-hidden="true" />
          )}
        </div>
      )}
    </div>
  );
};
