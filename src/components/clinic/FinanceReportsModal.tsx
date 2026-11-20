import React, { useState } from 'react';
import {
  Download,
  FileText,
  MapPin,
  Printer,
  TrendingUp,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { formatDateDDMMYYYY, localDate } from '../../utils/date';
import {
  buildExpensesCsv,
  buildInvoicesCsv,
  buildMonthlySummaryCsv,
  buildPaymentsCsv,
  downloadCsvFile,
} from '../../utils/csvExport';
import { summarizeInvoicesByLocation } from '../../utils/iraqFinanceC4C5';
import type {
  CashCloseZReportRecord,
  ClinicExpenseIQD,
  FinancialInvoiceIQD,
  PracticeLocationItem,
} from '../../types/clinicManagement';
import { ModalDialog } from '../ui/Dialog';
import { DatePickerInput, Money, Num } from '../ui/Primitives';

export interface FinanceReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'z_report' | 'monthly';
  invoices: FinancialInvoiceIQD[];
  expenses: ClinicExpenseIQD[];
  cashCloses: CashCloseZReportRecord[];
  practiceLocationsEnabled: boolean;
  practiceLocations: PracticeLocationItem[];
  onCashClosesUpdated: (next: CashCloseZReportRecord[]) => void;
  onPrintZReport: (report: CashCloseZReportRecord) => void;
}

export const FinanceReportsModal: React.FC<FinanceReportsModalProps> = ({
  isOpen,
  onClose,
  initialView = 'z_report',
  invoices,
  expenses,
  cashCloses,
  practiceLocationsEnabled,
  practiceLocations,
  onCashClosesUpdated,
  onPrintZReport,
}) => {
  const { language, isRtl, bi } = useLanguage();
  const { currency } = useCurrency();

  const [view, setView] = useState<'z_report' | 'monthly'>(initialView);
  const [zReportDate, setZReportDate] = useState<string>(() => localDate());
  const [zCountedCashInput, setZCountedCashInput] = useState<string>('');
  const [zNotes, setZNotes] = useState<string>('');
  const [zSaving, setZSaving] = useState(false);

  const [monthlyMonthKey, setMonthlyMonthKey] = useState<string>(() => localDate().slice(0, 7));
  const [locationSummaryScope, setLocationSummaryScope] = useState<'all' | 'month'>('all');

  const zDraft = ClinicOperationsService.buildDailyCashZReportDraft(
    zReportDate,
    currency.code,
    zCountedCashInput.trim() === '' ? undefined : Number(zCountedCashInput),
    zNotes
  );

  const monthlySummary = ClinicOperationsService.getMonthlyFinanceSummary(
    monthlyMonthKey,
    currency.code
  );

  const locationBreakdown = (() => {
    const scopedInvoices =
      locationSummaryScope === 'month'
        ? invoices.filter((inv) => (inv.date || '').startsWith(monthlyMonthKey))
        : invoices;
    return summarizeInvoicesByLocation(scopedInvoices, practiceLocations).filter(
      (item) => item.isActive || item.invoiceCount > 0
    );
  })();

  const handleCloseZReport = async () => {
    setZSaving(true);
    try {
      const closed = await ClinicOperationsService.closeDailyCashZReportAsync({
        dateKey: zReportDate,
        primaryCurrencyCode: currency.code,
        countedCashActual:
          zCountedCashInput.trim() === '' ? undefined : Number(zCountedCashInput),
        notes: zNotes,
      });
      onCashClosesUpdated(ClinicOperationsService.getCashCloses());
      setZCountedCashInput('');
      setZNotes('');
      onPrintZReport(closed);
    } finally {
      setZSaving(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={bi(
        'الإغلاق اليومي والتقارير والتصدير',
        'Daily Close, Reports & Export',
        'داخستنی ڕۆژانە، ڕاپۆرت و هەناردەکردن'
      )}
      subtitle={bi(
        'جرد الصندوق اليومي (Z-Report)، الملخص الشهري، وتصدير ملفات CSV',
        'Daily cash close (Z-Report), monthly summary, and CSV exports',
        'داخستنی سندووقی ڕۆژانە، پوختەی مانگانە و هەناردەکردنی CSV'
      )}
      ariaLabel={bi('الإغلاق اليومي والتقارير', 'Finance Reports & Cash Close', 'داخستن و ڕاپۆرتە داراییەکان')}
      closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      size="lg"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="space-y-5">
        {/* Clean 2-tab internal switcher */}
        <div className="inline-flex p-1 rounded-xl bg-surface border border-line-2/70 gap-1">
          <button
            type="button"
            onClick={() => setView('z_report')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
              view === 'z_report'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            <FileText className="size-3.5" />
            <span>{bi('الإغلاق اليومي (Z-Report)', 'Daily Cash Close', 'داخستنی ڕۆژانە')}</span>
          </button>
          <button
            type="button"
            onClick={() => setView('monthly')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
              view === 'monthly'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            <TrendingUp className="size-3.5" />
            <span>{bi('الملخص الشهري والتصدير', 'Monthly & CSV Export', 'پوختەی مانگانە و CSV')}</span>
          </button>
        </div>

        {view === 'z_report' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Live Draft & Close Cash Form */}
            <div className="p-4 rounded-2xl bg-surface/65 border border-card-line space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  {bi('مسودة إغلاق الصندوق اليومي', 'Daily Cash Close Draft', 'ڕەشنووسی داخستنی ڕۆژانە')}
                </h3>
                <div className="w-40">
                  <DatePickerInput
                    id="fin-z-date"
                    ariaLabel={bi('تاريخ تقرير الإغلاق اليومي', 'Z-Report date', 'بەرواری ڕاپۆرتی داخستن')}
                    value={zReportDate}
                    onChange={(iso) => setZReportDate(iso || localDate())}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-card border border-line-2/70">
                  <div className="text-muted-foreground-1">{bi('المقبوضات', 'Collected', 'پارەی وەرگیراو')}</div>
                  <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-0.5 tabular-nums">
                    <Money amount={zDraft.totalCollectedPrimary} />
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-card border border-line-2/70">
                  <div className="text-muted-foreground-1">{bi('العكوسات', 'Reversed', 'گەڕاوەکان')}</div>
                  <div className="text-sm font-bold text-rose-700 dark:text-rose-300 mt-0.5 tabular-nums">
                    <Money amount={zDraft.totalReversedPrimary} />
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-card border border-line-2/70">
                  <div className="text-muted-foreground-1">{bi('المصاريف', 'Expenses', 'خەرجییەکان')}</div>
                  <div className="text-sm font-bold text-amber-700 dark:text-amber-300 mt-0.5 tabular-nums">
                    <Money amount={zDraft.totalExpensesPrimary} />
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-card border border-line-2/70">
                  <div className="text-muted-foreground-1">{bi('صافي التدفق', 'Net Cash Flow', 'سافی نەقد')}</div>
                  <div
                    className={`text-sm font-extrabold mt-0.5 tabular-nums ${
                      zDraft.netCashFlowPrimary < 0
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-foreground'
                    }`}
                  >
                    <Money amount={zDraft.netCashFlowPrimary} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label htmlFor="fin-z-counted-cash" className="block font-semibold text-foreground mb-1">
                    {bi(
                      `النقد المعدود بالدرج (${currency.symbolAr}):`,
                      `Counted Cash (${currency.code}):`,
                      `نەقدی ژمێردراو (${currency.symbolAr}):`
                    )}
                  </label>
                  <input
                    id="fin-z-counted-cash"
                    type="number"
                    step="any"
                    value={zCountedCashInput}
                    onChange={(e) => setZCountedCashInput(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground tabular-nums focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="fin-z-notes" className="block font-semibold text-foreground mb-1">
                    {bi('ملاحظات الإغلاق (اختياري):', 'Closing Notes:', 'تێبینیی داخستن:')}
                  </label>
                  <input
                    id="fin-z-notes"
                    type="text"
                    value={zNotes}
                    onChange={(e) => setZNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {typeof zDraft.cashVariance === 'number' && (
                <div className="p-2.5 rounded-xl bg-card border border-line-2 text-xs flex justify-between">
                  <span className="font-semibold text-muted-foreground-1">
                    {bi('فرق الصندوق:', 'Cash Drawer Variance:', 'جیاوازیی سندووق:')}
                  </span>
                  <span className="font-bold tabular-nums">
                    <Money amount={zDraft.cashVariance} />
                  </span>
                </div>
              )}

              <button
                type="button"
                disabled={zSaving}
                onClick={() => void handleCloseZReport()}
                className="w-full min-h-[40px] py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <FileText className="size-4" />
                <span>
                  {zSaving
                    ? bi('جاري إغلاق الصندوق...', 'Closing...', 'سندووق دادەخرێت...')
                    : bi(
                        'اعتماد الإغلاق اليومي وإصدار Z-Report',
                        'Close Daily Cash & Issue Z-Report',
                        'پەسەندکردنی داخستنی ڕۆژانە و دەرکردنی Z-Report'
                      )}
                </span>
              </button>
            </div>

            {/* Saved Z-Reports History */}
            <div className="p-4 rounded-2xl bg-surface/65 border border-card-line space-y-3">
              <h3 className="text-sm font-bold text-foreground">
                {bi(
                  `سجل تقارير الإغلاق (${cashCloses.length})`,
                  `Closed Z-Reports (${cashCloses.length})`,
                  `تۆماری ڕاپۆرتەکانی داخستن (${cashCloses.length})`
                )}
              </h3>
              {cashCloses.length === 0 ? (
                <p className="text-xs text-muted-foreground-1 py-8 text-center">
                  {bi(
                    'لم يتم تسجيل أي إغلاق يومي بعد.',
                    'No daily cash closes issued yet.',
                    'هێشتا هیچ داخستنێکی ڕۆژانە تۆمار نەکراوە.'
                  )}
                </p>
              ) : (
                <div
                  tabIndex={0}
                  role="region"
                  aria-label={bi('سجل تقارير الإغلاق اليومي', 'Closed Z-Reports history', 'تۆماری ڕاپۆرتەکانی داخستن')}
                  className="space-y-2 max-h-80 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-primary rounded-xl"
                >
                  {cashCloses.map((rep) => (
                    <div
                      key={rep.id}
                      className="p-3 rounded-xl bg-card border border-line-2/70 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-mono font-bold text-foreground">
                          <bdi dir="ltr">{rep.zReportNumber}</bdi> ·{' '}
                          <bdi dir="ltr">{formatDateDDMMYYYY(rep.dateKey)}</bdi>
                        </div>
                        <div className="text-muted-foreground-1 mt-0.5 tabular-nums">
                          {bi('صافي التدفق: ', 'Net Flow: ', 'سافی ڕەوت: ')}
                          <Money amount={rep.netCashFlowPrimary} /> · {rep.closedBy}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onPrintZReport(rep)}
                        className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="size-3.5" />
                        <span>{bi('طباعة', 'Print', 'چاپکردن')}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <label htmlFor="fin-monthly-month" className="text-xs font-bold text-foreground">
                  {bi('الشهر المطلوب:', 'Select Month:', 'مانگی داواکراو:')}
                </label>
                <input
                  id="fin-monthly-month"
                  type="month"
                  value={monthlyMonthKey}
                  onChange={(e) => setMonthlyMonthKey(e.target.value || localDate().slice(0, 7))}
                  className="px-3 py-1.5 rounded-xl bg-layer border border-layer-line text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadCsvFile(
                    `physiorecord-monthly-${monthlySummary.monthKey}.csv`,
                    buildMonthlySummaryCsv(monthlySummary)
                  )
                }
                className="min-h-[36px] px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="size-3.5" />
                <span>
                  {bi('تصدير الملخص الشهري CSV', 'Export Monthly Summary CSV', 'هەناردەکردنی پوختەی مانگانە CSV')}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-surface/65 border border-line-2/70">
                <div className="text-muted-foreground-1">{bi('إجمالي الفوترة', 'Monthly Billed', 'کۆی پسوولەکراو')}</div>
                <div className="text-sm font-bold text-foreground mt-1 tabular-nums">
                  <Money amount={monthlySummary.totalBilledPrimary} />
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-surface/65 border border-line-2/70">
                <div className="text-muted-foreground-1">{bi('صافي التحصيل', 'Net Collected', 'پوختەی وەرگیراو')}</div>
                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
                  <Money amount={monthlySummary.netCollectedPrimary} />
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-surface/65 border border-line-2/70">
                <div className="text-muted-foreground-1">{bi('المصاريف الشهرية', 'Monthly Expenses', 'خەرجیی مانگانە')}</div>
                <div className="text-sm font-bold text-rose-700 dark:text-rose-300 mt-1 tabular-nums">
                  <Money amount={monthlySummary.totalExpensesPrimary} />
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-surface/65 border border-line-2/70">
                <div className="text-muted-foreground-1">{bi('صافي التدفق النقدي', 'Net Cash Flow', 'پوختەی هاتوچۆی نەقد')}</div>
                <div
                  className={`text-sm font-extrabold mt-1 tabular-nums ${
                    monthlySummary.netCashFlowPrimary < 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-foreground'
                  }`}
                >
                  <Money amount={monthlySummary.netCashFlowPrimary} />
                </div>
              </div>
            </div>

            {Object.keys(monthlySummary.byCurrency).length > 0 && (
              <div className="p-4 rounded-2xl bg-surface/65 border border-card-line space-y-2 text-xs">
                <h3 className="font-bold text-foreground">
                  {bi(
                    'توزيع المقبوضات حسب العملة:',
                    'Collected Breakdown by Payment Currency:',
                    'دابەشبوونی وەرگیراوەکان بەپێی دراو:'
                  )}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {Object.entries(monthlySummary.byCurrency).map(([code, bucket]) => (
                    <div key={code} className="p-2.5 rounded-xl bg-card border border-line-2/70">
                      <div className="font-mono font-bold text-foreground">{code}</div>
                      <div className="text-muted-foreground-1 mt-0.5 tabular-nums">
                        <bdi dir="ltr">{bucket.collectedOriginal} {code}</bdi> ·{' '}
                        <Money amount={bucket.collectedPrimary} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {practiceLocationsEnabled && locationBreakdown.length > 0 && (
              <div className="p-4 rounded-2xl bg-surface/65 border border-card-line space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <MapPin className="size-4 text-primary" />
                    <span>
                      {bi(
                        'التوزيع المالي حسب موقع العمل:',
                        'Financial Breakdown by Practice Location:',
                        'دابەشبوونی دارایی بەپێی شوێنی کار:'
                      )}
                    </span>
                  </div>
                  <div className="inline-flex bg-card border border-line-2 rounded-lg p-0.5 gap-0.5">
                    <button
                      type="button"
                      onClick={() => setLocationSummaryScope('all')}
                      className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                        locationSummaryScope === 'all'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground-1 hover:text-foreground'
                      }`}
                    >
                      {bi('الإجمالي الكلي', 'All Time', 'هەموو کات')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocationSummaryScope('month')}
                      className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                        locationSummaryScope === 'month'
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground-1 hover:text-foreground'
                      }`}
                    >
                      {bi('الشهر المحدد', 'Selected Month', 'مانگی دیاریکراو')}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {locationBreakdown.map((loc) => (
                    <div
                      key={loc.locationId}
                      className="p-3 rounded-xl bg-card border border-line-2/70 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-foreground">
                          {loc.locationId === '__unassigned__'
                            ? bi('غير محدد / عام', 'Unassigned / General', 'دیارینەکراو / گشتی')
                            : language === 'en'
                              ? loc.nameEn || loc.nameAr
                              : loc.nameAr}
                        </span>
                        <span className="text-muted-foreground-1 text-xs font-semibold tabular-nums">
                          <Num value={loc.invoiceCount} /> {bi('فاتورة', 'inv', 'پسوولە')}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground-1 tabular-nums">
                        <span>{bi('الصافي:', 'Billed Net:', 'پوختە:')}</span>
                        <Money amount={loc.billedNetIQD} colorize={false} />
                      </div>
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-300 tabular-nums">
                        <span>{bi('المقبوض:', 'Collected:', 'وەرگیراو:')}</span>
                        <Money amount={loc.collectedPaidIQD} colorize={false} />
                      </div>
                      <div className="flex justify-between font-bold text-amber-700 dark:text-amber-300 border-t border-card-divider pt-1 tabular-nums">
                        <span>{bi('المتبقي:', 'Outstanding:', 'ماوە:')}</span>
                        <Money amount={loc.outstandingBalanceIQD} colorize={false} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Centralized CSV Export Strip */}
            <div className="p-4 rounded-2xl bg-surface/65 border border-card-line space-y-2.5">
              <h3 className="text-xs font-bold text-foreground">
                {bi('تصدير الجداول المالية (Excel / CSV)', 'Export Financial Tables (CSV)', 'هەناردەکردنی خشتە داراییەکان (CSV)')}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadCsvFile(
                      `physiorecord-invoices-${localDate()}.csv`,
                      buildInvoicesCsv(invoices, currency.code)
                    )
                  }
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="size-3.5 text-primary" />
                  <span>{bi('تصدير الفواتير CSV', 'Invoices CSV', 'پسوولەکان CSV')}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsvFile(
                      `physiorecord-payments-${localDate()}.csv`,
                      buildPaymentsCsv(invoices, currency.code)
                    )
                  }
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="size-3.5 text-primary" />
                  <span>{bi('تصدير الدفعات CSV', 'Payments CSV', 'پارەدانەکان CSV')}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsvFile(
                      `physiorecord-expenses-${localDate()}.csv`,
                      buildExpensesCsv(expenses, currency.code)
                    )
                  }
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="size-3.5 text-primary" />
                  <span>{bi('تصدير المصاريف CSV', 'Expenses CSV', 'خەرجییەکان CSV')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalDialog>
  );
};
