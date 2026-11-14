// =======================================================================
// PhysioRecord — Phase C4: Installment Plans Builder & 30/60/90+ Aging
// Local-first installment scheduling, aging breakdown & WhatsApp deep-links
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { formatDateDDMMYYYY, localDate } from '../../utils/date';
import {
  buildInstallmentAgingSummary,
  buildInstallmentWhatsAppReminderUrl,
  generateEqualInstallmentSchedule,
  type InstallmentAgingBucketId,
  type InstallmentAgingRow,
} from '../../utils/iraqFinanceC4C5';
import {
  DatePickerInput,
  DemoBadge,
  Money,
  MoneyInput,
  Num,
} from '../ui/Primitives';
import type { PatientRecord } from '../../types/clinical';
import type {
  FinancialInvoiceIQD,
  InvoiceInstallmentItem,
} from '../../types/clinicManagement';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Edit3,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

export interface InstallmentPlanBuilderModalProps {
  invoice: FinancialInvoiceIQD | null;
  onClose: () => void;
  onSaved?: (updatedInvoices: FinancialInvoiceIQD[]) => void;
}

export const InstallmentPlanBuilderModal: React.FC<
  InstallmentPlanBuilderModalProps
> = ({ invoice, onClose, onSaved }) => {
  const { language, isRtl, bi } = useLanguage();
  const useArabicScheduleLabels = language !== 'en';

  const [count, setCount] = useState<number>(2);
  const [firstDueDate, setFirstDueDate] = useState<string>(localDate());
  const [intervalDays, setIntervalDays] = useState<number>(30);
  const [draftRows, setDraftRows] = useState<InvoiceInstallmentItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice) return;
    setErrorMsg(null);
    const existing = invoice.installmentPlan;
    if (existing && existing.length > 0) {
      setCount(Math.min(12, Math.max(2, existing.length)));
      setFirstDueDate(existing[0]?.dueDate || localDate());
      setDraftRows(existing.map((item) => ({ ...item })));
    } else {
      const initialCount = 2;
      const start = localDate();
      setCount(initialCount);
      setFirstDueDate(start);
      setIntervalDays(30);
      setDraftRows(
        generateEqualInstallmentSchedule({
          netAmountIQD: invoice.netAmountIQD,
          paidAmountIQD: invoice.paidAmountIQD,
          count: initialCount,
          firstDueDate: start,
          intervalDays: 30,
          isAr: useArabicScheduleLabels,
        })
      );
    }
  }, [invoice, useArabicScheduleLabels]);

  useEffect(() => {
    if (!invoice) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [invoice, onClose]);

  if (!invoice) return null;

  const draftSum = draftRows.reduce(
    (sum, item) => sum + (Number.isFinite(item.amountIQD) ? item.amountIQD : 0),
    0
  );
  const netTarget = Math.max(0, invoice.netAmountIQD || 0);
  const difference = Math.round((netTarget - draftSum) * 100) / 100;
  const isBalanced = Math.abs(difference) < 0.01;
  const hasInvalidRow = draftRows.some(
    (r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate) || (Number(r.amountIQD) || 0) <= 0
  );

  const handleRegenerateSchedule = (
    nextCount = count,
    nextStart = firstDueDate,
    nextInterval = intervalDays
  ) => {
    setErrorMsg(null);
    const clampedCount = Math.min(12, Math.max(2, Math.round(nextCount) || 2));
    setCount(clampedCount);
    setDraftRows(
      generateEqualInstallmentSchedule({
        netAmountIQD: netTarget,
        paidAmountIQD: invoice.paidAmountIQD,
        count: clampedCount,
        firstDueDate: nextStart,
        intervalDays: nextInterval,
        isAr: useArabicScheduleLabels,
      })
    );
  };

  const handleUpdateRow = (
    idx: number,
    patch: Partial<InvoiceInstallmentItem>
  ) => {
    setErrorMsg(null);
    setDraftRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  };

  const handleAdjustLastInstallment = () => {
    if (draftRows.length === 0) return;
    const lastIdx = draftRows.length - 1;
    const sumWithoutLast = draftRows
      .slice(0, lastIdx)
      .reduce((s, r) => s + (Number(r.amountIQD) || 0), 0);
    const adjustedLast = Math.max(0, Math.round((netTarget - sumWithoutLast) * 100) / 100);
    handleUpdateRow(lastIdx, { amountIQD: adjustedLast });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (draftRows.length < 2 || draftRows.length > 12) {
      setErrorMsg(
        bi(
          'يجب أن يتراوح عدد الأقساط بين 2 و 12 قسطاً.',
          'Installment count must be between 2 and 12.',
          'ژمارەی قیستەکان دەبێت لە نێوان ٢ بۆ ١٢ قیستدا بێت.'
        )
      );
      return;
    }
    if (hasInvalidRow) {
      setErrorMsg(
        bi(
          'تأكد من تحديد تاريخ استحقاق صحيح ومبلغ أكبر من 0 لكل قسط.',
          'Ensure every installment has a valid due date and amount greater than 0.',
          'دڵنیا ببەرەوە لە دیاریکردنی ڕێکەوتی دروست و بڕێکی گەورەتر لە ٠ بۆ هەر قیستێک.'
        )
      );
      return;
    }
    if (!isBalanced) {
      setErrorMsg(
        bi(
          'يجب أن يساوي مجموع الأقساط صافي الفاتورة المطلوب تماماً.',
          'The sum of installments must match the invoice net amount exactly.',
          'کۆی گشتی قیستەکان دەبێت ڕێک یەکسان بێت بە صافی پسوڵەکە.'
        )
      );
      return;
    }

    const updated = ClinicOperationsService.saveInvoiceInstallmentPlan(
      invoice.id,
      draftRows
    );
    onSaved?.(updated);
    onClose();
  };

  const handleRemovePlan = () => {
    const updated = ClinicOperationsService.saveInvoiceInstallmentPlan(
      invoice.id,
      []
    );
    onSaved?.(updated);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSave}
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full max-w-3xl max-h-[90vh] rounded-2xl bg-card border border-card-line shadow-2xl flex flex-col overflow-hidden text-xs"
      >
        <div className="px-5 py-4 border-b border-card-divider bg-muted/40 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
              <CalendarClock className="size-4 text-primary shrink-0" />
              <span>
                {bi(
                  'إعداد وتعديل خطة الأقساط',
                  'Installment Plan Builder',
                  'ڕێکخستن و گۆڕینی پلانی قیستەکان'
                )}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground-1 mt-0.5 truncate">
              <bdi dir="ltr">{invoice.invoiceNumber}</bdi> · {invoice.patientName} ·{' '}
              {bi(invoice.titleAr, invoice.titleEn)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={bi('إغلاق', 'Close', 'داخستن')}
            className="p-1.5 rounded-lg text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Invoice Balance Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-surface border border-line-2">
              <div className="text-muted-foreground-1">
                {bi('صافي الفاتورة:', 'Invoice Net:', 'صافی پسوڵە:')}
              </div>
              <div className="text-sm font-bold text-foreground mt-0.5">
                <Money amount={netTarget} />
              </div>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-line-2">
              <div className="text-muted-foreground-1">
                {bi('المدفوع مسبقاً:', 'Already Paid:', 'پێشتر دراوە:')}
              </div>
              <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                <Money amount={invoice.paidAmountIQD} colorize={false} />
              </div>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-line-2">
              <div className="text-muted-foreground-1">
                {bi('المتبقي للجدولة:', 'Remaining Balance:', 'ماوە بۆ خشتەکردن:')}
              </div>
              <div className="text-sm font-bold text-amber-700 dark:text-amber-300 mt-0.5">
                <Money amount={invoice.balanceDueIQD} colorize={false} />
              </div>
            </div>
          </div>

          {/* Generator Controls */}
          <div className="p-3.5 rounded-xl bg-surface border border-card-line space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block font-semibold text-foreground mb-1">
                  {bi('عدد الأقساط (2–12):', 'Installments (2–12):', 'ژمارەی قیستەکان (٢–١٢):')}
                </label>
                <select
                  value={count}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    handleRegenerateSchedule(next, firstDueDate, intervalDays);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-bold"
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} {bi('أقساط', 'installments', 'قیست')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1">
                  {bi('تاريخ أول قسط:', 'First Due Date:', 'ڕێکەوتی یەکەم قیست:')}
                </label>
                <DatePickerInput
                  value={firstDueDate}
                  onChange={(val) => {
                    setFirstDueDate(val);
                  }}
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground mb-1">
                  {bi('الفاصل الزمني:', 'Interval:', 'ماوەی نێوان قیستەکان:')}
                </label>
                <select
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground"
                >
                  <option value={7}>
                    {bi('أسبوعي (7 أيام)', 'Weekly (7 days)', 'هەفتانە (٧ ڕۆژ)')}
                  </option>
                  <option value={14}>
                    {bi(
                      'كل أسبوعين (14 يوماً)',
                      'Bi-weekly (14 days)',
                      'هەموو دوو هەفتە جارێک (١٤ ڕۆژ)'
                    )}
                  </option>
                  <option value={30}>
                    {bi('شهري (30 يوماً)', 'Monthly (30 days)', 'مانگانە (٣٠ ڕۆژ)')}
                  </option>
                </select>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleRegenerateSchedule(count, firstDueDate, intervalDays)
                }
                className="py-2 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="size-3.5" />
                <span>{bi('توزيع متساوٍ', 'Auto-Split', 'دابەشکردنی یەکسان')}</span>
              </button>
            </div>
          </div>

          {/* Editable Installment Rows */}
          <div className="space-y-2.5">
            {draftRows.map((row, idx) => (
              <div
                key={row.id}
                className="p-3 rounded-xl bg-surface border border-line-2 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
              >
                <div className="sm:col-span-4">
                  <label className="block font-semibold text-muted-foreground-1 mb-1">
                    {`${bi('عنوان القسط', 'Label', 'ناونیشانی قیست')} #${idx + 1}`}
                  </label>
                  <input
                    type="text"
                    value={useArabicScheduleLabels ? row.labelAr : row.labelEn}
                    onChange={(e) =>
                      handleUpdateRow(
                        idx,
                        useArabicScheduleLabels
                          ? { labelAr: e.target.value }
                          : { labelEn: e.target.value }
                      )
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block font-semibold text-muted-foreground-1 mb-1">
                    {bi('تاريخ الاستحقاق', 'Due Date', 'ڕێکەوتی شایستەبوون')}
                  </label>
                  <DatePickerInput
                    value={row.dueDate}
                    onChange={(val) => handleUpdateRow(idx, { dueDate: val })}
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block font-semibold text-muted-foreground-1 mb-1">
                    {bi('مبلغ القسط', 'Installment Amount', 'بڕی قیست')}
                  </label>
                  <MoneyInput
                    value={row.amountIQD}
                    onChange={(val) => handleUpdateRow(idx, { amountIQD: val })}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Live Sum Verification Banner */}
          <div
            className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${
              isBalanced
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-800 dark:text-emerald-200'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold">
                {bi('مجموع الأقساط المجدولة: ', 'Scheduled Total: ', 'کۆی قیستە خشتەکراوەکان: ')}
                <Money amount={draftSum} colorize={false} />
              </span>
              {!isBalanced && (
                <span className="font-semibold">
                  ({bi('الفرق عن الصافي: ', 'Difference vs Net: ', 'جیاوازی لە صافی: ')}
                  <Money amount={difference} colorize={false} />)
                </span>
              )}
            </div>
            {!isBalanced && (
              <button
                type="button"
                onClick={handleAdjustLastInstallment}
                className="px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground font-bold hover:bg-layer-hover cursor-pointer"
              >
                {bi(
                  'ضبط القسط الأخير تلقائياً',
                  'Adjust Last Installment',
                  'ڕێکخستنی خۆکاری دوایین قیست'
                )}
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 font-semibold">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-card-divider bg-muted/30 flex flex-wrap items-center justify-between gap-2">
          <div>
            {invoice.installmentPlan && invoice.installmentPlan.length > 0 && (
              <button
                type="button"
                onClick={handleRemovePlan}
                className="py-2 px-3 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="size-3.5" />
                <span>{bi('إزالة خطة الأقساط', 'Remove Plan', 'سڕینەوەی پلانی قیست')}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded-xl bg-layer border border-layer-line text-layer-foreground text-xs font-semibold cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
            </button>
            <button
              type="submit"
              disabled={!isBalanced || hasInvalidRow}
              className="py-2 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-xs cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
            >
              {bi('حفظ خطة الأقساط', 'Save Installment Plan', 'پاشەکەوتکردنی پلانی قیست')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export interface InstallmentPlansAgingPanelProps {
  invoices: FinancialInvoiceIQD[];
  patients: PatientRecord[];
  onCollectPayment: (
    invoice: FinancialInvoiceIQD,
    suggestedAmountIQD?: number
  ) => void;
  onInvoicesUpdated: (updated: FinancialInvoiceIQD[]) => void;
}

const BUCKET_META: Array<{
  id: InstallmentAgingBucketId;
  ar: string;
  en: string;
  ckb: string;
  toneClass: string;
}> = [
  {
    id: 'current',
    ar: 'جاري / قادم',
    en: 'Current / Upcoming',
    ckb: 'ئێستا / داهاتوو',
    toneClass: 'border-card-line bg-surface',
  },
  {
    id: '1_30',
    ar: 'متأخر 1–30 يوم',
    en: '1–30 Days Overdue',
    ckb: 'دواکەوتوو ١–٣٠ ڕۆژ',
    toneClass: 'border-amber-500/30 bg-amber-500/5',
  },
  {
    id: '31_60',
    ar: 'متأخر 31–60 يوم',
    en: '31–60 Days Overdue',
    ckb: 'دواکەوتوو ٣١–٦٠ ڕۆژ',
    toneClass: 'border-orange-500/30 bg-orange-500/5',
  },
  {
    id: '61_90',
    ar: 'متأخر 61–90 يوم',
    en: '61–90 Days Overdue',
    ckb: 'دواکەوتوو ٦١–٩٠ ڕۆژ',
    toneClass: 'border-rose-500/30 bg-rose-500/5',
  },
  {
    id: 'over_90',
    ar: 'متأخر +90 يوم',
    en: '90+ Days Overdue',
    ckb: 'دواکەوتوو +٩٠ ڕۆژ',
    toneClass: 'border-rose-600/40 bg-rose-500/10',
  },
];

export const InstallmentPlansAgingPanel: React.FC<
  InstallmentPlansAgingPanelProps
> = ({ invoices, patients, onCollectPayment, onInvoicesUpdated }) => {
  const { language, isRtl, bi } = useLanguage();
  const { currency } = useCurrency();
  const isArabicWhatsApp = language !== 'en';

  const [filterMode, setFilterMode] = useState<'all' | 'overdue' | 'upcoming'>(
    'all'
  );
  const [selectedBucket, setSelectedBucket] =
    useState<InstallmentAgingBucketId | 'all'>('all');
  const [selectedUnscheduledId, setSelectedUnscheduledId] = useState<string>('');
  const [builderInvoice, setBuilderInvoice] =
    useState<FinancialInvoiceIQD | null>(null);
  const [missingPhoneNotice, setMissingPhoneNotice] = useState<string | null>(
    null
  );

  const summary = useMemo(
    () => buildInstallmentAgingSummary(invoices),
    [invoices]
  );

  useEffect(() => {
    if (
      selectedUnscheduledId &&
      !summary.unscheduledInvoices.some((i) => i.id === selectedUnscheduledId)
    ) {
      setSelectedUnscheduledId('');
    }
  }, [summary.unscheduledInvoices, selectedUnscheduledId]);

  const patientPhoneById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of patients) {
      const phone = p.data.phone || p.data.phoneNumber;
      if (phone) map.set(p.id, phone);
    }
    return map;
  }, [patients]);

  const invoiceById = useMemo(() => {
    const map = new Map<string, FinancialInvoiceIQD>();
    for (const inv of invoices) map.set(inv.id, inv);
    return map;
  }, [invoices]);

  const filteredRows = useMemo(() => {
    const base =
      filterMode === 'overdue'
        ? summary.overdueRows
        : filterMode === 'upcoming'
          ? summary.upcomingRows
          : summary.rows;
    if (selectedBucket === 'all') return base;
    return base.filter((row) => row.bucket === selectedBucket);
  }, [summary, filterMode, selectedBucket]);

  const clinicProfile = ClinicOperationsService.getClinicProfile();
  const clinicName = bi(
    clinicProfile.clinicNameAr || clinicProfile.therapistNameAr,
    clinicProfile.clinicNameEn || clinicProfile.therapistNameEn
  );

  const renderRowStatusBadge = (row: InstallmentAgingRow) => {
    if (row.overdueDays > 0) {
      return (
        <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold text-xs inline-flex items-center gap-1 whitespace-nowrap">
          <AlertCircle className="size-3.5" />
          <span>
            {bi(
              `متأخر ${row.overdueDays} يوم`,
              `${row.overdueDays}d overdue`,
              `${row.overdueDays} ڕۆژ دواکەوتوو`
            )}
          </span>
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold text-xs inline-flex items-center gap-1 whitespace-nowrap">
        <CheckCircle2 className="size-3.5" />
        <span>{bi('مجدول / قادم', 'Scheduled', 'خشتەکراو / داهاتوو')}</span>
      </span>
    );
  };

  return (
    <div className="p-5 space-y-5 text-xs" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* 5-Bucket Aging Summary Strip (Current + 30 / 60 / 90+ Days) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {BUCKET_META.map((meta) => {
          const stat = summary.buckets[meta.id];
          const isSelected = selectedBucket === meta.id;
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() =>
                setSelectedBucket((prev) => (prev === meta.id ? 'all' : meta.id))
              }
              className={`p-3.5 rounded-2xl border text-start transition-all cursor-pointer ${
                meta.toneClass
              } ${isSelected ? 'ring-2 ring-primary border-primary' : ''}`}
            >
              <div className="text-xs font-semibold text-muted-foreground-1">
                {bi(meta.ar, meta.en, meta.ckb)}
              </div>
              <div className="text-base font-extrabold text-foreground mt-1 tabular-nums">
                <Money amount={stat.amountIQD} colorize={false} />
              </div>
              <div className="text-xs text-muted-foreground-1 mt-1 tabular-nums">
                <Num value={stat.count} />{' '}
                {bi('أقساط مستحقة', 'installments', 'قیستی شایستە')}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter Bar + Quick Installment Plan Setup for Unscheduled Invoices */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1.5 bg-surface border border-line-2 rounded-xl p-1">
          {(
            [
              {
                id: 'all',
                ar: 'جميع الأقساط',
                en: 'All Installments',
                ckb: 'هەموو قیستەکان',
                count: summary.totalOpenInstallmentsCount,
              },
              {
                id: 'overdue',
                ar: 'المتأخرة فقط',
                en: 'Overdue',
                ckb: 'تەنها دواکەوتووەکان',
                count: summary.totalOverdueCount,
              },
              {
                id: 'upcoming',
                ar: 'القادمة / الجارية',
                en: 'Upcoming',
                ckb: 'داهاتوو / ئێستا',
                count: summary.upcomingRows.length,
              },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilterMode(f.id);
                setSelectedBucket('all');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                filterMode === f.id && selectedBucket === 'all'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground-1 hover:text-foreground'
              }`}
            >
              <span>{bi(f.ar, f.en, f.ckb)}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-black/10 dark:bg-white/15 text-xs tabular-nums">
                <Num value={f.count} />
              </span>
            </button>
          ))}
        </div>

        {summary.unscheduledInvoices.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedUnscheduledId || summary.unscheduledInvoices[0]?.id || ''}
              onChange={(e) => setSelectedUnscheduledId(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground max-w-[260px]"
            >
              {summary.unscheduledInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — {inv.patientName} ({inv.balanceDueIQD.toLocaleString()})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const targetId =
                  selectedUnscheduledId || summary.unscheduledInvoices[0]?.id;
                const inv = targetId ? invoiceById.get(targetId) : undefined;
                if (inv) setBuilderInvoice(inv);
              }}
              className="py-2 px-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>
                {bi('جدولة أقساط فاتورة', 'Setup Installments', 'خشتەکردنی قیستەکانی پسوڵە')}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Clean feedback banner if patient phone is missing for WhatsApp */}
      {missingPhoneNotice && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2 text-xs">
          <span>{missingPhoneNotice}</span>
          <button
            type="button"
            onClick={() => setMissingPhoneNotice(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
            aria-label={bi('إخفاء', 'Dismiss', 'داخستن')}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Installment Rows Table */}
      <div className="rounded-2xl border border-card-line overflow-x-auto bg-card">
        <table className="min-w-full divide-y divide-card-divider text-start text-xs">
          <thead className="bg-muted/50">
            <tr className="text-muted-foreground-1 font-semibold">
              <th className="py-3 px-4 text-start">
                {bi('المريض والفاتورة', 'Patient & Invoice', 'نەخۆش و پسوڵە')}
              </th>
              <th className="py-3 px-4 text-start">
                {bi('القسط', 'Installment', 'قیست')}
              </th>
              <th className="py-3 px-4 text-start">
                {bi('الاستحقاق والحالة', 'Due & Status', 'کاتی شایستە و دۆخ')}
              </th>
              <th className="py-3 px-4 text-end">
                {bi('قيمة القسط', 'Amount', 'بڕی قیست')}
              </th>
              <th className="py-3 px-4 text-end">
                {bi('المتبقي من القسط', 'Remaining', 'ماوەی قیست')}
              </th>
              <th className="py-3 px-4 text-end">
                {bi('الإجراءات', 'Actions', 'کردارەکان')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-divider">
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-8 px-4 text-center text-muted-foreground-1"
                >
                  {bi(
                    'لا توجد أقساط مطابقة للتصفية الحالية.',
                    'No installments match the selected filter.',
                    'هیچ قیستێک لەگەڵ فلتەری ئێستا ناگونجێت.'
                  )}
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const parentInvoice = invoiceById.get(row.invoiceId);
                const phone = patientPhoneById.get(row.patientId);
                const waUrl = buildInstallmentWhatsAppReminderUrl({
                  phone,
                  patientName: row.patientName,
                  invoiceNumber: row.invoiceNumber,
                  installmentLabel: bi(
                    row.installment.labelAr,
                    row.installment.labelEn
                  ),
                  dueDate: row.installment.dueDate,
                  remainingAmount: row.remainingIQD,
                  overdueDays: row.overdueDays,
                  clinicName,
                  currencyCode: parentInvoice?.currencyCode || currency.code,
                  isAr: isArabicWhatsApp,
                });

                return (
                  <tr
                    key={`${row.invoiceId}_${row.installment.id}`}
                    className="hover:bg-muted/30 transition-colors tabular-nums"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-bold text-foreground">
                        <span>{row.patientName}</span>
                        {row.isDemo && <DemoBadge />}
                      </div>
                      <div className="text-muted-foreground-1 font-mono mt-0.5">
                        <bdi dir="ltr">{row.invoiceNumber}</bdi> ·{' '}
                        {bi(row.invoiceTitleAr, row.invoiceTitleEn)}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground">
                      <div>
                        {bi(
                          row.installment.labelAr,
                          row.installment.labelEn
                        )}
                      </div>
                      {row.installment.paidAmountIQD > 0 && (
                        <div className="text-emerald-700 dark:text-emerald-300 mt-0.5">
                          {bi('مدفوع جزئياً: ', 'Paid: ', 'بەشێکی دراوە: ')}
                          <Money
                            amount={row.installment.paidAmountIQD}
                            colorize={false}
                          />
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-foreground">
                        <bdi dir="ltr">
                          {formatDateDDMMYYYY(row.installment.dueDate)}
                        </bdi>
                      </div>
                      <div className="mt-1">{renderRowStatusBadge(row)}</div>
                    </td>
                    <td className="py-3 px-4 text-end font-mono font-bold text-foreground">
                      <Money amount={row.installment.amountIQD} />
                    </td>
                    <td className="py-3 px-4 text-end font-mono font-bold text-amber-700 dark:text-amber-300">
                      <Money amount={row.remainingIQD} colorize={false} />
                    </td>
                    <td className="py-3 px-4 text-end">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {parentInvoice && (
                          <button
                            type="button"
                            onClick={() =>
                              onCollectPayment(
                                parentInvoice,
                                Math.min(
                                  row.remainingIQD,
                                  parentInvoice.balanceDueIQD
                                )
                              )
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <CreditCard className="size-3.5" />
                            <span>{bi('قبض', 'Collect', 'وەرگرتن')}</span>
                          </button>
                        )}

                        {waUrl ? (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                            title={bi(
                              'إرسال تذكير بالقسط عبر واتساب',
                              'Send installment reminder via WhatsApp',
                              'ناردنی بیرخەرەوەی قیست لە ڕێگەی WhatsApp'
                            )}
                          >
                            <MessageSquare className="size-3.5" />
                            <span>{bi('واتساب', 'WhatsApp', 'WhatsApp')}</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setMissingPhoneNotice(
                                bi(
                                  `لا يوجد رقم هاتف صالح مسجل للمريض (${row.patientName}). أضف رقم الهاتف في ملف المريض لإرسال تذكير واتساب.`,
                                  `No valid phone number is recorded for ${row.patientName}. Add a phone number in the patient profile to send a WhatsApp reminder.`,
                                  `هیچ ژمارە مۆبایلێکی دروست بۆ نەخۆش (${row.patientName}) تۆمار نەکراوە. ژمارەی مۆبایل لە دۆسیەی نەخۆش زیاد بکە بۆ ناردنی بیرخەرەوەی WhatsApp.`
                                )
                              )
                            }
                            className="px-2.5 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-muted-foreground-1 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title={bi(
                              'رقم الهاتف غير متوفر',
                              'Phone number missing',
                              'ژمارەی مۆبایل بەردەست نییە'
                            )}
                          >
                            <MessageSquare className="size-3.5" />
                            <span>{bi('واتساب', 'WhatsApp', 'WhatsApp')}</span>
                          </button>
                        )}

                        {parentInvoice && (
                          <button
                            type="button"
                            onClick={() => setBuilderInvoice(parentInvoice)}
                            className="p-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground cursor-pointer"
                            title={bi(
                              'تعديل خطة الأقساط',
                              'Edit Installment Plan',
                              'دەستکاریکردنی پلانی قیست'
                            )}
                            aria-label={bi(
                              'تعديل خطة الأقساط',
                              'Edit Installment Plan',
                              'دەستکاریکردنی پلانی قیست'
                            )}
                          >
                            <Edit3 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <InstallmentPlanBuilderModal
        invoice={builderInvoice}
        onClose={() => setBuilderInvoice(null)}
        onSaved={onInvoicesUpdated}
      />
    </div>
  );
};

export default InstallmentPlansAgingPanel;
