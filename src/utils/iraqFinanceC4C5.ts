// =======================================================================
// PhysioRecord — Phase C4–C5 Pure Finance Helpers
// Installment Scheduling, 30/60/90+ Aging, Recurring Expenses & Locations
// =======================================================================

import type {
  ClinicExpenseIQD,
  ExpenseCategoryIQD,
  FinancialInvoiceIQD,
  InvoiceInstallmentItem,
  PracticeLocationItem,
  RecurringExpenseTemplate,
} from '../types/clinicManagement';
import { getCurrencyConfig, DEFAULT_CURRENCY_CODE } from './currencies';
import {
  addDaysToDateStr,
  buildWhatsAppReminderUrl,
  formatDateDDMMYYYY,
  localDate,
} from './date';

export type InstallmentAgingBucketId =
  | 'current'
  | '1_30'
  | '31_60'
  | '61_90'
  | 'over_90';

export interface GenerateInstallmentScheduleParams {
  netAmountIQD: number;
  paidAmountIQD?: number;
  count: number;
  firstDueDate: string;
  intervalDays?: number;
  isAr?: boolean;
  paidAtDate?: string;
}

export interface InstallmentAgingRow {
  invoiceId: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  isDemo?: boolean;
  invoiceTitleAr: string;
  invoiceTitleEn: string;
  invoiceNetIQD: number;
  invoiceBalanceDueIQD: number;
  installment: InvoiceInstallmentItem;
  remainingIQD: number;
  overdueDays: number;
  bucket: InstallmentAgingBucketId;
  isOverdue: boolean;
}

export interface InstallmentAgingBucketSummary {
  bucket: InstallmentAgingBucketId;
  count: number;
  amountIQD: number;
}

export interface InstallmentAgingSummary {
  referenceDate: string;
  totalOpenInstallmentsCount: number;
  totalOpenInstallmentsIQD: number;
  totalOverdueCount: number;
  totalOverdueIQD: number;
  buckets: Record<InstallmentAgingBucketId, InstallmentAgingBucketSummary>;
  rows: InstallmentAgingRow[];
  overdueRows: InstallmentAgingRow[];
  upcomingRows: InstallmentAgingRow[];
  unscheduledInvoices: FinancialInvoiceIQD[];
  unscheduledBalanceIQD: number;
}

export interface InstallmentWhatsAppReminderParams {
  phone: string | undefined | null;
  patientName: string;
  invoiceNumber: string;
  installmentLabel: string;
  dueDate: string;
  remainingAmount: number;
  overdueDays?: number;
  clinicName?: string;
  currencyCode?: string;
  isAr?: boolean;
}

export interface DueRecurringExpenseSuggestion extends RecurringExpenseTemplate {
  monthKey: string;
  suggestedDueDate: string;
  isPastScheduledDay: boolean;
}

export interface LocationFinanceSummaryItem {
  locationId: string;
  nameAr: string;
  nameEn: string;
  type: PracticeLocationItem['type'] | 'unassigned';
  isActive: boolean;
  isDefault: boolean;
  invoiceCount: number;
  billedNetIQD: number;
  collectedPaidIQD: number;
  outstandingBalanceIQD: number;
  travelFeeTotalIQD: number;
}

export const EXPENSE_CATEGORY_LABELS: Record<
  ExpenseCategoryIQD,
  { ar: string; en: string }
> = {
  medical_consumables: {
    ar: 'مستلزمات طبية واستهلاكية',
    en: 'Medical Consumables',
  },
  equipment_maintenance: {
    ar: 'صيانة وشراء أجهزة علاج طبيعي',
    en: 'Equipment & Maintenance',
  },
  electricity_generator: {
    ar: 'كهرباء واشتراك المولدة',
    en: 'Electricity & Generator',
  },
  rent: {
    ar: 'إيجار العيادة',
    en: 'Clinic Rent',
  },
  staff_salaries: {
    ar: 'رواتب ومكافآت الكادر',
    en: 'Staff Salaries',
  },
  marketing_other: {
    ar: 'مصاريف إدارية أخرى',
    en: 'Other Admin Expenses',
  },
};

export function getExpenseCategoryDisplayLabel(
  item: { category: ExpenseCategoryIQD; customCategoryLabel?: string },
  isAr: boolean
): string {
  const custom = item.customCategoryLabel?.trim();
  if (custom) return custom;
  const labels = EXPENSE_CATEGORY_LABELS[item.category] || EXPENSE_CATEGORY_LABELS.marketing_other;
  return isAr ? labels.ar : labels.en;
}

function parseYyyyMmDdUtcMs(dateStr: string | undefined | null): number | null {
  if (!dateStr) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return ms;
}

function normalizeYyyyMmDd(dateStr: string | undefined | null): string {
  const trimmed = (dateStr || '').trim();
  if (parseYyyyMmDdUtcMs(trimmed) !== null) {
    return trimmed.slice(0, 10);
  }
  return localDate();
}

export function generateEqualInstallmentSchedule(
  params: GenerateInstallmentScheduleParams
): InvoiceInstallmentItem[] {
  const safeCount = Math.max(1, Math.min(24, Math.round(Number(params.count) || 2)));
  const safeNet =
    typeof params.netAmountIQD === 'number' && Number.isFinite(params.netAmountIQD)
      ? Math.max(0, params.netAmountIQD)
      : 0;
  const scale = Number.isInteger(safeNet) ? 1 : 100;
  const totalUnits = Math.round(safeNet * scale);
  const baseUnits = Math.floor(totalUnits / safeCount);
  const remainderUnits = totalUnits - baseUnits * safeCount;

  const baseDate = normalizeYyyyMmDd(params.firstDueDate);
  const safeInterval =
    typeof params.intervalDays === 'number' &&
    Number.isFinite(params.intervalDays) &&
    params.intervalDays >= 0
      ? Math.round(params.intervalDays)
      : 30;
  const paidDate = normalizeYyyyMmDd(params.paidAtDate || baseDate);

  let remainingPaid = Math.max(0, Number(params.paidAmountIQD) || 0);
  const seed = Date.now();
  const items: InvoiceInstallmentItem[] = [];

  for (let i = 0; i < safeCount; i += 1) {
    const itemUnits = baseUnits + (i < remainderUnits ? 1 : 0);
    const amountIQD = itemUnits / scale;
    const allocatedPaidRaw = Math.min(amountIQD, remainingPaid);
    const paidAmountIQD = Math.round(allocatedPaidRaw * scale) / scale;
    remainingPaid = Math.max(0, remainingPaid - paidAmountIQD);

    const status: InvoiceInstallmentItem['status'] =
      amountIQD > 0 && paidAmountIQD >= amountIQD
        ? 'paid'
        : paidAmountIQD > 0
          ? 'partial'
          : 'pending';

    items.push({
      id: `inst_${seed}_${i + 1}_${Math.random().toString(36).slice(2, 6)}`,
      labelAr: `القسط ${i + 1} من ${safeCount}`,
      labelEn: `Installment ${i + 1} of ${safeCount}`,
      dueDate: addDaysToDateStr(baseDate, i * safeInterval),
      amountIQD,
      paidAmountIQD,
      status,
      ...(status === 'paid' ? { paidAt: paidDate } : {}),
    });
  }

  return items;
}

export function computeOverdueDays(
  dueDate: string,
  referenceDate: string = localDate()
): number {
  const dueMs = parseYyyyMmDdUtcMs(dueDate);
  const refMs = parseYyyyMmDdUtcMs(referenceDate);
  if (dueMs === null || refMs === null) return 0;
  const diffDays = Math.round((refMs - dueMs) / 86_400_000);
  return Math.max(0, diffDays);
}

export function classifyOverdueBucket(
  dueDate: string,
  referenceDate: string = localDate()
): InstallmentAgingBucketId {
  const overdueDays = computeOverdueDays(dueDate, referenceDate);
  if (overdueDays <= 0) return 'current';
  if (overdueDays <= 30) return '1_30';
  if (overdueDays <= 60) return '31_60';
  if (overdueDays <= 90) return '61_90';
  return 'over_90';
}

export function buildInstallmentAgingSummary(
  invoices: FinancialInvoiceIQD[],
  referenceDate: string = localDate()
): InstallmentAgingSummary {
  const refDate = normalizeYyyyMmDd(referenceDate);
  const buckets: Record<InstallmentAgingBucketId, InstallmentAgingBucketSummary> = {
    current: { bucket: 'current', count: 0, amountIQD: 0 },
    '1_30': { bucket: '1_30', count: 0, amountIQD: 0 },
    '31_60': { bucket: '31_60', count: 0, amountIQD: 0 },
    '61_90': { bucket: '61_90', count: 0, amountIQD: 0 },
    over_90: { bucket: 'over_90', count: 0, amountIQD: 0 },
  };

  const rows: InstallmentAgingRow[] = [];
  const unscheduledInvoices: FinancialInvoiceIQD[] = [];
  let unscheduledBalanceIQD = 0;

  for (const inv of invoices) {
    if (inv.status === 'void' || inv.status === 'paid' || (inv.balanceDueIQD || 0) <= 0) {
      continue;
    }

    const plan = inv.installmentPlan;
    if (!plan || plan.length === 0) {
      unscheduledInvoices.push(inv);
      unscheduledBalanceIQD += Math.max(0, inv.balanceDueIQD || 0);
      continue;
    }

    for (const item of plan) {
      const remainingIQD = Math.max(0, (item.amountIQD || 0) - (item.paidAmountIQD || 0));
      if (item.status === 'paid' || remainingIQD <= 0) {
        continue;
      }
      const overdueDays = computeOverdueDays(item.dueDate, refDate);
      const bucket = classifyOverdueBucket(item.dueDate, refDate);
      buckets[bucket].count += 1;
      buckets[bucket].amountIQD += remainingIQD;

      rows.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        patientId: inv.patientId,
        patientName: inv.patientName,
        isDemo: inv.isDemo,
        invoiceTitleAr: inv.titleAr,
        invoiceTitleEn: inv.titleEn,
        invoiceNetIQD: inv.netAmountIQD,
        invoiceBalanceDueIQD: inv.balanceDueIQD,
        installment: item,
        remainingIQD,
        overdueDays,
        bucket,
        isOverdue: overdueDays > 0,
      });
    }
  }

  rows.sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate));

  const overdueRows = rows
    .filter((r) => r.isOverdue)
    .sort((a, b) => b.overdueDays - a.overdueDays || a.installment.dueDate.localeCompare(b.installment.dueDate));
  const upcomingRows = rows.filter((r) => !r.isOverdue);

  const totalOpenInstallmentsCount = rows.length;
  const totalOpenInstallmentsIQD = rows.reduce((sum, r) => sum + r.remainingIQD, 0);
  const totalOverdueCount = overdueRows.length;
  const totalOverdueIQD = overdueRows.reduce((sum, r) => sum + r.remainingIQD, 0);

  return {
    referenceDate: refDate,
    totalOpenInstallmentsCount,
    totalOpenInstallmentsIQD,
    totalOverdueCount,
    totalOverdueIQD,
    buckets,
    rows,
    overdueRows,
    upcomingRows,
    unscheduledInvoices,
    unscheduledBalanceIQD,
  };
}

export function buildInstallmentWhatsAppReminderText(
  params: InstallmentWhatsAppReminderParams
): string {
  const isAr = params.isAr !== false;
  const code = (params.currencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
  const cfg = getCurrencyConfig(code);
  const symbol = isAr ? cfg.symbolAr : cfg.symbolEn;
  const safeAmt = Math.max(0, Number(params.remainingAmount) || 0);
  const formattedNumber = new Intl.NumberFormat(
    isAr ? 'ar-IQ-u-nu-latn' : 'en-US',
    {
      maximumFractionDigits: cfg.decimals,
      minimumFractionDigits: cfg.decimals > 0 && Math.abs(safeAmt) % 1 !== 0 ? 2 : 0,
    }
  ).format(safeAmt);
  const amountDisplay = `${formattedNumber} ${symbol}`;
  const dueDisplay = formatDateDDMMYYYY(params.dueDate);
  const clinic =
    params.clinicName?.trim() ||
    (isAr ? 'عيادة العلاج الطبيعي' : 'Physiotherapy Clinic');
  const overdueDays = Math.max(0, Math.round(Number(params.overdueDays) || 0));

  if (isAr) {
    if (overdueDays > 0) {
      return `السلام عليكم ${params.patientName}، تذكير من ${clinic} بخصوص (${params.installmentLabel}) على الفاتورة رقم ${params.invoiceNumber} المستحق بتاريخ ${dueDisplay} (متأخر ${overdueDays} يوم) بمبلغ متبقٍ قدره ${amountDisplay}. نرجو المراجعة أو التواصل معنا، مع تمنياتنا لكم بالشفاء العاجل.`;
    }
    return `السلام عليكم ${params.patientName}، تذكير ودي من ${clinic} بموعد استحقاق (${params.installmentLabel}) على الفاتورة رقم ${params.invoiceNumber} بتاريخ ${dueDisplay} بمبلغ ${amountDisplay}. نتمنى لكم الشفاء العاجل.`;
  }

  if (overdueDays > 0) {
    return `Hello ${params.patientName}, reminder from ${clinic} regarding (${params.installmentLabel}) on invoice ${params.invoiceNumber}, due on ${dueDisplay} (${overdueDays} days overdue) with a remaining balance of ${amountDisplay}. Please contact us at your convenience.`;
  }
  return `Hello ${params.patientName}, friendly reminder from ${clinic} that (${params.installmentLabel}) on invoice ${params.invoiceNumber} is due on ${dueDisplay} for ${amountDisplay}. Thank you.`;
}

export function buildInstallmentWhatsAppReminderUrl(
  params: InstallmentWhatsAppReminderParams
): string | null {
  const message = buildInstallmentWhatsAppReminderText(params);
  return buildWhatsAppReminderUrl(params.phone, message);
}

export function getDueRecurringExpenseSuggestions(
  templates: RecurringExpenseTemplate[],
  expenses: ClinicExpenseIQD[],
  referenceDate: string = localDate()
): DueRecurringExpenseSuggestion[] {
  const refDate = normalizeYyyyMmDd(referenceDate);
  const monthKey = refDate.slice(0, 7);
  const monthExpenses = expenses.filter((exp) => (exp.date || '').startsWith(monthKey));

  const due: DueRecurringExpenseSuggestion[] = [];

  for (const tpl of templates) {
    if (!tpl.isActive) continue;
    const alreadyLogged = monthExpenses.some(
      (exp) =>
        exp.recurringTemplateId === tpl.id ||
        (exp.category === tpl.category &&
          ((tpl.titleAr && exp.titleAr.trim() === tpl.titleAr.trim()) ||
            (tpl.titleEn && exp.titleEn.trim() === tpl.titleEn.trim())))
    );
    if (alreadyLogged) continue;

    const clampedDay = Math.max(1, Math.min(28, Math.round(Number(tpl.dayOfMonth) || 1)));
    const suggestedDueDate = `${monthKey}-${String(clampedDay).padStart(2, '0')}`;

    due.push({
      ...tpl,
      monthKey,
      suggestedDueDate,
      isPastScheduledDay: suggestedDueDate <= refDate,
    });
  }

  return due.sort((a, b) => a.dayOfMonth - b.dayOfMonth);
}

export function summarizeInvoicesByLocation(
  invoices: FinancialInvoiceIQD[],
  locations: PracticeLocationItem[]
): LocationFinanceSummaryItem[] {
  const byId = new Map<string, LocationFinanceSummaryItem>();

  for (const loc of locations) {
    byId.set(loc.id, {
      locationId: loc.id,
      nameAr: loc.nameAr,
      nameEn: loc.nameEn,
      type: loc.type,
      isActive: loc.isActive !== false,
      isDefault: Boolean(loc.isDefault),
      invoiceCount: 0,
      billedNetIQD: 0,
      collectedPaidIQD: 0,
      outstandingBalanceIQD: 0,
      travelFeeTotalIQD: 0,
    });
  }

  const unassigned: LocationFinanceSummaryItem = {
    locationId: 'unassigned',
    nameAr: 'غير محدد الموقع',
    nameEn: 'Unassigned Location',
    type: 'unassigned',
    isActive: true,
    isDefault: false,
    invoiceCount: 0,
    billedNetIQD: 0,
    collectedPaidIQD: 0,
    outstandingBalanceIQD: 0,
    travelFeeTotalIQD: 0,
  };

  for (const inv of invoices) {
    if (inv.status === 'void') continue;
    const target =
      (inv.locationId && byId.get(inv.locationId)) || unassigned;
    target.invoiceCount += 1;
    target.billedNetIQD += inv.netAmountIQD || 0;
    target.collectedPaidIQD += inv.paidAmountIQD || 0;
    target.outstandingBalanceIQD += inv.balanceDueIQD || 0;
    target.travelFeeTotalIQD += inv.travelFeeIQD || 0;
  }

  const result = Array.from(byId.values());
  if (unassigned.invoiceCount > 0) {
    result.push(unassigned);
  }
  return result;
}
