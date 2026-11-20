// =======================================================================
// PhysioRecord — Reception Command Center & Live Queue (Batch 3 Simplification)
// - Page header = title + max 2 actions (no repeated hero card or New Patient button)
// - Queue first; KPI row = compact 4-stat strip (horizontal-scroll chip row on mobile)
// - Rows show: time, name, appointment type, room, status action (status chip with menu)
// =======================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { usePatients } from '../../context/PatientContext';
import {
  ClinicOperationsService,
} from '../../services/clinicOperationsService';
import type {
  AppointmentStatus,
  ClinicAppointment,
  WaitingListEntry,
  FinancialInvoiceIQD,
} from '../../types/clinicManagement';
import {
  localDate,
  formatDateDDMMYYYY,
  formatTimeIraq,
  formatIraqiPhoneDisplay,
} from '../../utils/date';
import { Num, Fraction, Money, DemoBadge, TimeDisplay } from '../ui/Primitives';
import {
  Calendar,
  Users,
  CheckCircle2,
  Play,
  Wallet,
  Sparkles,
  ArrowUpRight,
  ArrowUpLeft,
  Filter,
  Eye,
  EyeOff,
  ChevronDown,
  Repeat,
  Stethoscope,
  MonitorCheck,
} from 'lucide-react';

interface ReceptionCommandCenterViewProps {
  onOpenPatient: (patientId: string) => void;
  onNewPatient?: () => void;
  onNavigateTab: (tab: 'schedule' | 'finance' | 'exercises' | 'directory') => void;
}

export const ReceptionCommandCenterView: React.FC<ReceptionCommandCenterViewProps> = ({
  onOpenPatient,
  onNavigateTab,
}) => {
  const { bi, isRtl } = useLanguage();
  const { patients } = usePatients();

  const [todayDate] = useState<string>(localDate());
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [waitlist, setWaitlist] = useState<WaitingListEntry[]>([]);
  const [invoices, setInvoices] = useState<FinancialInvoiceIQD[]>([]);
  const [queueFilter, setQueueFilter] = useState<'all' | 'waiting' | 'in_session' | 'completed'>('all');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);
  const [privacyBlur, setPrivacyBlur] = useState<boolean>(() =>
    ClinicOperationsService.getReceptionPrivacyBlur()
  );

  const activeStaff = ClinicOperationsService.getActiveStaff();
  const isReceptionRole = activeStaff.role === 'receptionist';

  const togglePrivacyBlur = () => {
    const next = !privacyBlur;
    setPrivacyBlur(next);
    ClinicOperationsService.setReceptionPrivacyBlur(next);
  };

  const activePatients = useMemo(
    () => patients.filter((p) => !p.isArchived),
    [patients]
  );

  const reloadAll = () => {
    setAppointments(ClinicOperationsService.ensureRecurringAppointmentsForDate(todayDate));
    setWaitlist(ClinicOperationsService.getWaitingList());
    setInvoices(ClinicOperationsService.getInvoicesIQD());
  };

  useEffect(() => {
    reloadAll();
    const handleScheduleUpdate = () => reloadAll();
    window.addEventListener('physiorecord-demo-updated', handleScheduleUpdate);
    window.addEventListener('physiorecord-schedule-updated', handleScheduleUpdate);
    return () => {
      window.removeEventListener('physiorecord-demo-updated', handleScheduleUpdate);
      window.removeEventListener('physiorecord-schedule-updated', handleScheduleUpdate);
    };
  }, [activePatients.length, todayDate]);

  const todayAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.date === todayDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [appointments, todayDate]
  );

  const filteredQueue = useMemo(() => {
    if (queueFilter === 'all') return todayAppointments;
    if (queueFilter === 'waiting') {
      return todayAppointments.filter(
        (a) => a.status === 'scheduled' || a.status === 'arrived'
      );
    }
    if (queueFilter === 'in_session') {
      return todayAppointments.filter((a) => a.status === 'in_session');
    }
    return todayAppointments.filter((a) => a.status === 'completed');
  }, [todayAppointments, queueFilter]);

  const waitingListActive = useMemo(() => waitlist, [waitlist]);

  const unpaidInvoices = useMemo(
    () => invoices.filter((inv) => inv.balanceDueIQD > 0),
    [invoices]
  );

  const totalUnpaidIqd = useMemo(
    () => unpaidInvoices.reduce((acc, inv) => acc + inv.balanceDueIQD, 0),
    [unpaidInvoices]
  );

  const todayPaymentsIqd = useMemo(() => {
    return invoices.reduce((sum, inv) => {
      const todayPaid = (inv.payments || [])
        .filter((p) => p.date === todayDate)
        .reduce((s, p) => s + p.amountIQD, 0);
      return sum + todayPaid;
    }, 0);
  }, [invoices, todayDate]);

  const handleStatusChange = (appointmentId: string, status: AppointmentStatus) => {
    ClinicOperationsService.updateAppointmentStatus(appointmentId, status);
    setOpenStatusMenuId(null);
    reloadAll();
  };

  const handleBookFromWaitlist = (entry: WaitingListEntry) => {
    if (!entry.patientId) return;
    ClinicOperationsService.saveAppointment({
      patientId: entry.patientId,
      patientName: entry.patientName,
      patientPhone: entry.phone,
      episodeTitle: entry.conditionOrRegion,
      therapistName: entry.preferredTherapist || ClinicOperationsService.getStaffRoster()[0]?.nameAr || '',
      date: todayDate,
      startTime: '12:30',
      durationMinutes: 45,
      visitType: 'initial_evaluation',
      status: 'scheduled',
      roomOrBed: bi('غرفة التقييم الأولي 1', 'Room 1', 'ژووری هەڵسەنگاندنی سەرەتایی ١'),
      notes: entry.notes,
      isDemo: entry.isDemo,
    });
    ClinicOperationsService.removeWaitingListEntry(entry.id);
    setActionFeedback(
      bi(
        `تم تثبيت موعد للمريض (${entry.patientName}) بنجاح ونقله إلى جدول اليوم.`,
        `Appointment booked for (${entry.patientName}) from waitlist successfully.`,
        `نۆرە بۆ نەخۆش (${entry.patientName}) بە سەرکەوتوویی تۆمارکرا و گوازرایەوە بۆ خشتەی ئەمڕۆ.`
      )
    );
    reloadAll();
  };

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'scheduled':
        return {
          ar: 'مجدول',
          en: 'Scheduled',
          ckb: 'تۆمارکراو',
          cls: 'text-muted-foreground-1',
          dot: 'bg-slate-400',
        };
      case 'arrived':
        return {
          ar: 'وصل — بالانتظار',
          en: 'Arrived',
          ckb: 'گەیشت — لە چاوەڕوانیدا',
          cls: 'text-amber-700 dark:text-amber-300 font-bold',
          dot: 'bg-amber-500 animate-pulse',
        };
      case 'in_session':
        return {
          ar: 'داخل الجلسة',
          en: 'In Room',
          ckb: 'لەناو دانیشتندایە',
          cls: 'text-primary font-bold',
          dot: 'bg-primary animate-pulse',
        };
      case 'completed':
        return {
          ar: 'مكتمل',
          en: 'Completed',
          ckb: 'تەواوبوو',
          cls: 'text-emerald-700 dark:text-emerald-300 font-bold',
          dot: 'bg-emerald-500',
        };
      case 'no_show':
        return {
          ar: 'لم يحضر',
          en: 'No-Show',
          ckb: 'ئامادە نەبوو',
          cls: 'text-rose-700 dark:text-rose-400 font-bold',
          dot: 'bg-rose-500',
        };
      case 'cancelled':
        return {
          ar: 'ملغى',
          en: 'Cancelled',
          ckb: 'هەڵوەشاوە',
          cls: 'text-muted-foreground-1',
          dot: 'bg-slate-400',
        };
    }
  };

  const getVisitTypeLabel = (visitType: ClinicAppointment['visitType']) => {
    switch (visitType) {
      case 'initial_evaluation':
        return bi('تقييم أولي', 'Initial Eval', 'هەڵسەنگاندنی سەرەتایی');
      case 're_evaluation':
        return bi('إعادة تقييم', 'Re-evaluation', 'دووبارە هەڵسەنگاندنەوە');
      case 'discharge_summary':
        return bi('تخريج', 'Discharge', 'تەواوکردنی چارەسەر');
      default:
        return bi('جلسة متابعة', 'Follow-up', 'دانیشتنی بەدواداچوون');
    }
  };

  const statusOptions: { id: AppointmentStatus; ar: string; en: string; ckb: string }[] = [
    { id: 'scheduled', ar: 'مجدول اليوم', en: 'Scheduled', ckb: 'ئەمڕۆ تۆمارکراوە' },
    { id: 'arrived', ar: 'وصل — بالانتظار', en: 'Arrived / Waiting', ckb: 'گەیشت — لە چاوەڕوانیدا' },
    { id: 'in_session', ar: 'داخل الجلسة الآن', en: 'In Treatment Room', ckb: 'ئێستا لەناو دانیشتندایە' },
    { id: 'completed', ar: 'مكتمل', en: 'Completed', ckb: 'تەواوبوو' },
    { id: 'no_show', ar: 'لم يحضر', en: 'No-Show', ckb: 'ئامادە نەبوو' },
    { id: 'cancelled', ar: 'ملغى', en: 'Cancelled', ckb: 'هەڵوەشاوە' },
  ];

  const waitingCount = todayAppointments.filter((a) => a.status === 'arrived').length;
  const inSessionCount = todayAppointments.filter((a) => a.status === 'in_session').length;
  const completedCount = todayAppointments.filter((a) => a.status === 'completed').length;
  const ArrowOpenIcon = isRtl ? ArrowUpLeft : ArrowUpRight;

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-3 sm:space-y-4">
      {actionFeedback && (
        <div className="p-2.5 sm:p-3 bg-surface/75 rounded-2xl flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-bold">{actionFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
          >
            {bi('إغلاق', 'Dismiss', 'داخستن')}
          </button>
        </div>
      )}

      {/* Batch 3 Item 3: Page Header = Title + Max 2 Actions (No repeated hero card or New Patient button) */}
      <div className="pr-page-header">
        <div className="space-y-1 min-w-0">
          <span className="pr-eyebrow">
            <MonitorCheck className="size-3.5" />
            {bi('الاستقبال', 'Front desk', 'پێشوازی')}
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="pr-page-title">
              {bi('طابور الاستقبال اليومي', "Today's Reception Queue", 'ڕیزی پێشوازیی ئەمڕۆ')}
            </h1>
            <span className="pr-chip">
              <bdi dir="ltr">{formatDateDDMMYYYY(todayDate)}</bdi>
            </span>
          </div>
          <p className="pr-page-subtitle">
            {bi(
              'حرّك المرضى بين الانتظار والغرفة والتحصيل بضغطة واحدة.',
              'Move patients between waiting, room and payment in one tap.',
              'نەخۆشەکان بە یەک کلیک لە نێوان چاوەڕوانی، ژوور و وەرگرتندا بجووڵێنە.'
            )}
          </p>
        </div>

        {/* Max 2 Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-tour="reception-privacy-btn"
            onClick={togglePrivacyBlur}
            className={`pr-btn ${
              privacyBlur
                ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                : 'pr-btn-ghost'
            }`}
          >
            {privacyBlur ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{bi('تمويه الخصوصية', 'Privacy Blur', 'شاردنەوەی نهێنی')}</span>
          </button>

          <button
            type="button"
            data-tour="reception-book-btn"
            onClick={() => onNavigateTab('schedule')}
            className="pr-btn pr-btn-ghost"
          >
            <Calendar className="w-3.5 h-3.5 text-primary" />
            <span>{bi('حجز موعد', 'Book Slot', 'نۆرەگرتن')}</span>
          </button>
        </div>
      </div>

      {/* Batch 3 Item 4: Compact 4-Stat Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 tabular-nums">
        <div className="pr-kpi p-2.5 sm:p-3 flex-col justify-between gap-1">
          <span className="text-xs font-semibold text-muted-foreground-1 leading-snug">
            {bi('مواعيد اليوم', "Today's Queue", 'نۆرەکانی ئەمڕۆ')}
          </span>
          <div className="flex items-baseline justify-between gap-1 mt-0.5 sm:mt-1">
            <span className="text-base sm:text-lg font-extrabold font-mono text-foreground">
              <Num value={todayAppointments.length} />
            </span>
            <span className="text-xs text-emerald-700 dark:text-emerald-300 font-bold">
              (<Num value={completedCount} /> {bi('مكتمل', 'done', 'تەواو')})
            </span>
          </div>
        </div>

        <div className="pr-kpi p-2.5 sm:p-3 flex-col justify-between gap-1">
          <span className="text-xs font-semibold text-muted-foreground-1 leading-snug">
            {bi('الانتظار / الجلسات', 'Waiting / In Room', 'چاوەڕوانی / دانیشتن')}
          </span>
          <div className="flex items-baseline justify-between gap-1 mt-0.5 sm:mt-1 text-xs font-bold">
            <span className="text-amber-800 dark:text-amber-300">
              <Num value={waitingCount} /> {bi('انتظار', 'wait', 'چاوەڕوان')}
            </span>
            <span className="text-muted-foreground-1">·</span>
            <span className="text-primary">
              <Num value={inSessionCount} /> {bi('بالغرفة', 'room', 'لە ژووردا')}
            </span>
          </div>
        </div>

        <div className="pr-kpi p-2.5 sm:p-3 flex-col justify-between gap-1">
          <span className="text-xs font-semibold text-muted-foreground-1 leading-snug">
            {bi('مقبوضات اليوم', 'Collected Today', 'داهاتی ئەمڕۆ')}
          </span>
          <div className="mt-0.5 sm:mt-1">
            <span
              className={`text-xs sm:text-sm font-extrabold text-emerald-700 dark:text-emerald-300 ${
                privacyBlur ? 'blur-xs select-none' : ''
              }`}
            >
              <Money amount={todayPaymentsIqd} colorize={false} />
            </span>
          </div>
        </div>

        <div className="pr-kpi p-2.5 sm:p-3 flex-col justify-between gap-1">
          <span className="text-xs font-semibold text-muted-foreground-1 leading-snug">
            {bi('ذمم متبقية', 'Receivables', 'قەرزە ماوەکان')}
          </span>
          <div className="mt-0.5 sm:mt-1">
            <span
              className={`text-xs sm:text-sm font-extrabold ${
                totalUnpaidIqd > 0
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-foreground'
              } ${privacyBlur || isReceptionRole ? 'blur-xs select-none' : ''}`}
            >
              <Money amount={totalUnpaidIqd} colorize={false} />
            </span>
          </div>
        </div>
      </div>

      {/* Main Split Grid: Queue First (8 cols) + Waitlist & Unpaid Balances (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Live Arrival & Room Queue */}
        <div className="xl:col-span-8 bg-card border border-card-line rounded-2xl shadow-2xs overflow-visible">
          <div className="p-4 border-b border-card-divider flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-foreground">
              {bi('طابور الحضور والغرف العلاجية', 'Live Patient Queue', 'ڕیزی ئامادەبوون و ژوورە چارەسەرییەکان')}
            </h2>

            {/* Segmented Queue Filter */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-muted border border-layer-line text-xs font-semibold overflow-x-auto scrollbar-none">
              {[
                { id: 'all' as const, ar: 'الكل', en: 'All', ckb: 'هەموو', count: todayAppointments.length },
                {
                  id: 'waiting' as const,
                  ar: 'بالانتظار',
                  en: 'Waiting',
                  ckb: 'لە چاوەڕوانیدا',
                  count: todayAppointments.filter(
                    (a) => a.status === 'scheduled' || a.status === 'arrived'
                  ).length,
                },
                { id: 'in_session' as const, ar: 'بالجلسة', en: 'In Room', ckb: 'لە دانیشتندا', count: inSessionCount },
                { id: 'completed' as const, ar: 'مكتمل', en: 'Done', ckb: 'تەواوبوو', count: completedCount },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setQueueFilter(tab.id)}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                    queueFilter === tab.id
                      ? 'bg-layer text-primary font-bold shadow-2xs'
                      : 'text-muted-foreground-1 hover:text-foreground'
                  }`}
                >
                  <span>{bi(tab.ar, tab.en, tab.ckb)}</span>
                  <span className="text-xs font-mono opacity-80">
                    (<Num value={tab.count} />)
                  </span>
                </button>
              ))}
            </div>
          </div>

          {filteredQueue.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Filter className="w-7 h-7 text-muted-foreground-1 mx-auto opacity-60" />
              <p className="text-xs font-semibold text-muted-foreground-1">
                {bi(
                  'لا توجد مواعيد في الطابور لهذا الفلتر اليوم (0).',
                  'No appointments in queue for this filter today (0).',
                  'هیچ نۆرەیەک لە ڕیزدا نییە بۆ ئەم فلتەرە ئەمڕۆ (٠).'
                )}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-card-divider">
              {filteredQueue.map((appt) => {
                const badge = getStatusBadge(appt.status);
                const isMenuOpen = openStatusMenuId === appt.id;

                return (
                  <div
                    key={appt.id}
                    className="p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-layer-hover transition-colors"
                  >
                    {/* 1. Time + 2. Name + 3. Appointment Type + 4. Therapist & Room */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="px-2.5 py-1.5 rounded-xl bg-muted border border-layer-line text-center shrink-0 min-w-[72px]">
                        <TimeDisplay
                          time={appt.startTime}
                          className="text-xs font-extrabold text-primary justify-center"
                        />
                        <span className="text-xs text-muted-foreground-1 block tabular-nums">
                          <Num value={appt.durationMinutes} /> {bi('د', 'm', 'خ')}
                        </span>
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenPatient(appt.patientId)}
                            className={`text-sm font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1 cursor-pointer ${
                              privacyBlur ? 'blur-xs select-none' : ''
                            }`}
                          >
                            <span>{appt.patientName}</span>
                            <ArrowOpenIcon className="w-3.5 h-3.5 text-muted-foreground-1" />
                          </button>
                          {appt.isDemo && <DemoBadge />}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-1">
                          <span className="px-2 py-0.5 rounded-md bg-surface border border-line-2 text-foreground font-semibold text-xs">
                            {getVisitTypeLabel(appt.visitType)}
                          </span>
                          <span
                            data-testid="reception-row-therapist"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted border border-layer-line text-foreground font-semibold text-xs"
                          >
                            <Stethoscope className="size-3 text-primary" />
                            <span>
                              {appt.therapistName ||
                                ClinicOperationsService.getClinicProfile().therapistNameAr ||
                                ClinicOperationsService.getStaffRoster()[0]?.nameAr ||
                                bi('المعالج المسؤول', 'Assigned Therapist', 'چارەسەرکاری بەرپرس')}
                            </span>
                          </span>
                          {appt.recurringScheduleId && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                              <Repeat className="size-3" />
                              <span>{bi('أسبوعي', 'Weekly', 'هەفتانە')}</span>
                            </span>
                          )}
                          {appt.roomOrBed && (
                            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold text-xs">
                              {appt.roomOrBed}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 5. Status Action: Status Chip with Menu + Primary Next-Step Button */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {/* Status Chip with Dropdown Menu (not a <select>) */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenStatusMenuId(isMenuOpen ? null : appt.id)
                          }
                          aria-expanded={isMenuOpen}
                          aria-label={bi('تغيير حالة الموعد', 'Change appointment status', 'گۆڕینی دۆخی نۆرە')}
                          className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${badge.cls}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          <span>{bi(badge.ar, badge.en, badge.ckb)}</span>
                          <ChevronDown className="w-3.5 h-3.5 opacity-75" />
                        </button>

                        {isMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-20"
                              onClick={() => setOpenStatusMenuId(null)}
                            />
                            <div
                              dir={isRtl ? 'rtl' : 'ltr'}
                              className="absolute end-0 mt-1.5 w-44 rounded-xl bg-card border border-card-line shadow-xl py-1 z-30 text-xs"
                            >
                              {statusOptions.map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => handleStatusChange(appt.id, opt.id)}
                                  className={`min-h-[36px] w-full px-3 py-1.5 text-start flex items-center justify-between hover:bg-layer-hover cursor-pointer ${
                                    appt.status === opt.id
                                      ? 'font-bold text-primary bg-primary/5'
                                      : 'text-foreground'
                                  }`}
                                >
                                  <span>{bi(opt.ar, opt.en, opt.ckb)}</span>
                                  {appt.status === opt.id && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                                  )}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Quick 1-click primary transition */}
                      {appt.status === 'scheduled' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(appt.id, 'arrived')}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold cursor-pointer transition-colors"
                        >
                          {bi('وصول', 'Arrived', 'گەیشت')}
                        </button>
                      )}

                      {appt.status === 'arrived' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(appt.id, 'in_session')}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Play className="w-3 h-3" />
                          <span>{bi('بدء الجلسة', 'Start', 'دەستپێکردن')}</span>
                        </button>
                      )}

                      {appt.status === 'in_session' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(appt.id, 'completed')}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{bi('إكمال', 'Done', 'تەواوکردن')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Waiting List & Unpaid IQD Balances */}
        <div className="xl:col-span-4 space-y-5">
          {/* Waiting List Card */}
          <div className="bg-card/95 rounded-2xl shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-card-divider/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <h2 className="text-xs font-bold text-foreground">
                  {bi('قائمة الانتظار', 'Waiting List', 'لیستی چاوەڕوانی')}
                </h2>
              </div>
              <span className="text-xs tabular-nums font-bold text-primary">
                · <Num value={waitingListActive.length} />
              </span>
            </div>

            <div className="p-4 space-y-3">
              {waitingListActive.length === 0 ? (
                <p className="text-xs text-muted-foreground-1 text-center py-4">
                  {bi('قائمة الانتظار فارغة حالياً', 'Waiting list is empty', 'لیستی چاوەڕوانی لە ئێستادا بەتاڵە')}
                </p>
              ) : (
                waitingListActive.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-surface/65 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold text-foreground ${
                            privacyBlur ? 'blur-xs select-none' : ''
                          }`}
                        >
                          {w.patientName}
                        </span>
                        {w.isDemo && <DemoBadge />}
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          w.priority === 'urgent'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-muted-foreground-2'
                        }`}
                      >
                        {w.priority === 'urgent'
                          ? bi('عاجل', 'Urgent', 'بەپەلە')
                          : bi('عادي', 'Standard', 'ئاسایی')}
                      </span>
                    </div>
                    {w.preferredTherapist && (
                      <div className="flex items-center gap-1.5">
                        <span
                          data-testid="reception-waitlist-therapist"
                          className="inline-flex items-center gap-1 text-foreground font-semibold text-xs"
                        >
                          <Stethoscope className="size-3 text-primary" />
                          <span>{w.preferredTherapist}</span>
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <bdi
                        className={`text-xs tabular-nums text-muted-foreground-1 ${
                          privacyBlur ? 'blur-xs select-none' : ''
                        }`}
                        dir="ltr"
                      >
                        {formatIraqiPhoneDisplay(w.phone)}
                      </bdi>
                      <button
                        type="button"
                        onClick={() => handleBookFromWaitlist(w)}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{bi('حجز اليوم', 'Book Today', 'نۆرەگرتنی ئەمڕۆ')}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Unpaid IQD Balances Card */}
          {!isReceptionRole && (
            <div className="bg-card/95 rounded-2xl shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-card-divider flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-rose-700 dark:text-rose-400" />
                  <h2 className="text-xs font-bold text-foreground">
                    {bi('الذمم المالية المتبقية', 'Unpaid Balances', 'قەرزە داراییە ماوەکان')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('finance')}
                  className="min-h-[36px] inline-flex items-center text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  {bi('السجل المالي', 'Ledger', 'تۆماری دارایی')}
                </button>
              </div>

              <div className="p-4 space-y-2.5">
                {unpaidInvoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground-1 text-center py-4">
                    {bi(
                      'لا توجد ذمم مالية متبقية (0 د.ع)',
                      'No unpaid balances (0 IQD)',
                      'هیچ قەرزێکی دارایی ماوە نییە (٠ د.ع)'
                    )}
                  </p>
                ) : (
                  unpaidInvoices.slice(0, 4).map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3 rounded-xl bg-muted/60 border border-layer-line flex items-center justify-between gap-2 tabular-nums"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenPatient(inv.patientId)}
                            className={`text-xs font-bold text-foreground hover:text-primary text-start leading-snug block cursor-pointer ${
                              privacyBlur ? 'blur-xs select-none' : ''
                            }`}
                          >
                            {inv.patientName}
                          </button>
                          {inv.isDemo && <DemoBadge />}
                        </div>
                        <span className="text-xs text-muted-foreground-1 block leading-snug">
                          {bi(inv.titleAr, inv.titleEn)}{' '}
                          {inv.packageTotalSessions ? (
                            <>
                              (
                              <Fraction
                                value={inv.packageUsedSessions || 0}
                                total={inv.packageTotalSessions}
                              />
                              )
                            </>
                          ) : (
                            ''
                          )}
                        </span>
                      </div>
                      <div
                        className={`text-end shrink-0 ${
                          privacyBlur ? 'blur-xs select-none' : ''
                        }`}
                      >
                        <span
                          className={`text-xs font-extrabold block ${
                            inv.balanceDueIQD > 0
                              ? 'text-amber-800 dark:text-amber-300'
                              : 'text-foreground'
                          }`}
                        >
                          <Money amount={inv.balanceDueIQD} colorize={false} />
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
