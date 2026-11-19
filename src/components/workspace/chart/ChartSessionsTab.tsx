import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Pause, Play, Repeat, Trash2 } from 'lucide-react';
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
  onOpenNewSession?: () => void;
}

export const ChartSessionsTab: React.FC<ChartSessionsTabProps> = ({
  patient,
  activeEpisode,
  episodeSessions,
  onOpenSession,
}) => {
  const { language, bi } = useLanguage();

  const chartSessionsVirtual = useVirtualWindow({
    totalCount: episodeSessions.length,
    estimatedRowHeightPx: 76,
    columns: 1,
    overscanRows: 5,
  });

  const orderedSessions = useMemo(
    () =>
      [...episodeSessions].sort((a, b) => {
        const numA = a.sessionNumber ?? a.data?.sessionNumber ?? 0;
        const numB = b.sessionNumber ?? b.data?.sessionNumber ?? 0;
        if (numB !== numA) return numB - numA;
        const dateA = a.sessionDate ?? a.data?.sessionDate ?? '';
        const dateB = b.sessionDate ?? b.data?.sessionDate ?? '';
        return dateB.localeCompare(dateA);
      }),
    [episodeSessions]
  );

  const visibleChartSessions = useMemo(
    () => orderedSessions.slice(chartSessionsVirtual.startIndex, chartSessionsVirtual.endIndex),
    [orderedSessions, chartSessionsVirtual.startIndex, chartSessionsVirtual.endIndex]
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
    <div className="max-w-7xl mx-auto space-y-3.5">
      {/* Unified Sessions & Weekly Schedule Surface */}
      <div className="pr-surface rounded-2xl overflow-hidden divide-y divide-black/[0.045] dark:divide-white/[0.06]">
        {/* Header Bar */}
        <div className="px-4 py-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <Clock className="size-4 text-primary shrink-0" />
            <h2 className="text-sm font-bold text-foreground">
              {bi('سجل الجلسات العلاجية', 'Treatment Sessions Timeline', 'تۆماری دانیشتنە چارەسەرییەکان')}
            </h2>
            <span className="text-xs font-mono font-bold text-muted-foreground-1 tabular-nums">
              (<Num value={episodeSessions.length} />)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRecurringForm((v) => !v)}
              className={`compact-btn h-8 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                showRecurringForm || patientRecurringRules.length > 0
                  ? 'bg-primary/10 text-primary hover:bg-primary/15'
                  : 'bg-surface/80 hover:bg-surface text-muted-foreground-1 hover:text-foreground'
              }`}
            >
              <Repeat className="size-3.5 shrink-0" />
              <span>
                {showRecurringForm
                  ? bi('إغلاق الجدول الأسبوعي', 'Close Weekly Days', 'داخستنی خشتە')
                  : patientRecurringRules.length > 0
                  ? bi('الأيام الأسبوعية', 'Weekly Days', 'ڕۆژە هەفتانەکان')
                  : bi('+ أيام أسبوعية', '+ Weekly Days', '+ ڕۆژە هەفتانەکان')}
              </span>
              {patientRecurringRules.length > 0 && (
                <span className="font-mono tabular-nums">
                  (<Num value={patientRecurringRules.length} />)
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Weekly Recurring Session Days Section */}
        {(showRecurringForm || patientRecurringRules.length > 0) && (
          <div className="px-4 py-3.5 sm:px-5 bg-surface/35 space-y-3">
            {showRecurringForm && (
              <form
                onSubmit={handleSavePatientRecurring}
                className="p-3.5 rounded-2xl bg-card/85 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground">
                    {bi('اختر أيام الحضور الأسبوعية:', 'Select Weekly Session Days:', 'ڕۆژەکانی ئامادەبوونی هەفتانە هەڵبژێرە:')}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRecWeekdays([0, 2, 4])}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface hover:bg-primary/10 text-primary cursor-pointer"
                    >
                      {bi('أحد · ثلاثاء · خميس', 'Sun · Tue · Thu', 'یەکشەممە · سێشەممە · پێنجشەممە')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecWeekdays([6, 1, 3])}
                      className="min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface hover:bg-primary/10 text-primary cursor-pointer"
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
                        className={`min-h-[36px] py-2 px-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer text-center ${
                          activeDay
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-surface/80 text-foreground hover:bg-surface'
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
                          className={`min-h-[36px] py-2 rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer ${
                            !recCustomDurationMode && recDuration === preset
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-surface/80 text-foreground hover:bg-surface'
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
                        className={`min-h-[36px] py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                          recCustomDurationMode
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-surface/80 text-foreground hover:bg-surface'
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
                          className="w-24 px-2.5 py-1.5 text-xs rounded-xl bg-surface text-foreground font-mono font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/25"
                        />
                        <span className="text-xs text-muted-foreground-1 font-semibold">
                          {bi('دقيقة', 'min', 'خولەک')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-muted-foreground-1">
                    {bi(
                      'ينضاف المريض تلقائياً لطابور الاستقبال في الأيام المحددة.',
                      'Patient auto-joins Reception Queue on matching dates.',
                      'لە هەر ڕۆژێکی دیاریکراودا، نەخۆشەکە بە شێوەی خۆکار دەچێتە ناو ڕیزی پێشوازی.'
                    )}
                  </span>
                  <button
                    type="submit"
                    disabled={recWeekdays.length === 0}
                    className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-muted-foreground-2 disabled:cursor-not-allowed text-primary-foreground text-xs font-bold cursor-pointer"
                  >
                    {bi('حفظ الجدول الأسبوعي', 'Save Weekly Schedule', 'پاشەکەوتکردنی خشتەی هەفتانە')}
                  </button>
                </div>
              </form>
            )}

            {patientRecurringRules.length > 0 && (
              <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06]">
                {patientRecurringRules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2 ${
                      rule.isActive ? '' : 'opacity-75'
                    }`}
                  >
                    <div className="min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                      <span className="font-bold text-primary">
                        {formatWeekdaysSummary(rule.weekdays, language)}
                      </span>
                      <span
                        className={`font-bold ${
                          rule.isActive
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-orange-600 dark:text-orange-400'
                        }`}
                      >
                        •{' '}
                        {rule.isActive
                          ? bi('نشط', 'Active', 'چالاک')
                          : bi('متوقف مؤقتاً', 'Paused', 'وەستاو')}
                      </span>
                      <span className="font-bold text-foreground">
                        <TimeDisplay time={rule.startTime} />
                      </span>
                      <span className="text-muted-foreground-1">
                        (<Num value={rule.durationMinutes} /> {bi('دقيقة', 'min', 'خولەک')})
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          ClinicOperationsService.toggleRecurringScheduleActive(rule.id);
                          reloadPatientRecurring();
                        }}
                        className="size-8 rounded-lg text-muted-foreground-1 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer inline-flex items-center justify-center"
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
                        className="size-8 rounded-lg text-muted-foreground-1 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer inline-flex items-center justify-center"
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
        )}

        {/* Sessions Timeline List */}
        {episodeSessions.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Clock className="size-7 text-muted-foreground-2 mx-auto" />
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
            aria-label={
              chartSessionsVirtual.isVirtualized
                ? bi('قائمة الجلسات العلاجية', 'Treatment sessions list')
                : undefined
            }
            className={chartSessionsVirtual.isVirtualized ? 'max-h-[70vh] overflow-y-auto' : ''}
          >
            {chartSessionsVirtual.topSpacerPx > 0 && (
              <div style={{ height: chartSessionsVirtual.topSpacerPx }} aria-hidden="true" />
            )}
            <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06]">
              {visibleChartSessions.map((session) => {
                const sNumber = session.sessionNumber ?? session.data?.sessionNumber ?? 1;
                const sDate = session.sessionDate ?? session.data?.sessionDate ?? '';
                const sStatus = session.status ?? session.data?.status ?? 'draft';
                const sType = session.sessionType ?? session.data?.sessionType ?? 'follow_up';
                const sDuration = session.data?.sessionDurationMinutes || 45;
                const isFinalized = sStatus === 'finalized';

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
                    className="px-4 py-3.5 sm:px-5 hover:bg-surface/60 transition-colors cursor-pointer flex items-center justify-between gap-3 focus:outline-none focus:bg-surface/60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`size-9 rounded-xl flex items-center justify-center shrink-0 font-mono text-xs font-extrabold ${
                          isFinalized
                            ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                            : 'bg-primary/12 text-primary'
                        }`}
                      >
                        <bdi dir="ltr">#{sNumber}</bdi>
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                          <span>
                            {sType === 'initial_evaluation'
                              ? bi('تقييم أولي', 'Initial Evaluation', 'هەڵسەنگاندنی سەرەتایی')
                              : sType === 're_evaluation'
                              ? bi('إعادة تقييم', 'Re-evaluation', 'دووبارە هەڵسەنگاندن')
                              : bi('جلسة علاجية', 'Treatment Session', 'دانیشتنی چارەسەری')}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground-1 tabular-nums">
                            <bdi dir="ltr">{formatDateDDMMYYYY(sDate)}</bdi>
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground-1 tabular-nums">
                          <Num value={sDuration} /> {bi('دقيقة', 'min', 'خولەک')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold ${
                          isFinalized
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-orange-600 dark:text-orange-400'
                        }`}
                      >
                        {isFinalized ? (
                          <>
                            <CheckCircle2 className="size-3.5 shrink-0" />
                            <span>{bi('معتمدة', 'Finalized', 'پەسەندکراو')}</span>
                          </>
                        ) : (
                          <>
                            <span className="size-1.5 rounded-full bg-current shrink-0" />
                            <span>{bi('مسودة', 'Draft', 'ڕەشنووس')}</span>
                          </>
                        )}
                      </span>
                    </div>
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
    </div>
  );
};
