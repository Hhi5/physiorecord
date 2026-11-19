// =======================================================================
// PhysioRecord — Pure RFC-4180 CSV Exporter with UTF-8 BOM & Formula Guard
// Zero runtime dependencies; Excel-safe Arabic UTF-8 export (Phase 4.3)
// =======================================================================

import type {
  ClinicExpenseIQD,
  FinancialInvoiceIQD,
  MonthlyFinanceSummary,
  PaymentTransactionIQD,
} from '../types/clinicManagement';
import { saveTextFilePortable } from '../platform/nativeBridge';

const PURE_NUMERIC_RE = /^-?\d+(?:\.\d+)?$/;

export function sanitizeCsvFormulaInjection(value: string): string {
  if (!value) return '';
  if (PURE_NUMERIC_RE.test(value.trim())) return value;
  const first = value.charAt(0);
  if (first === '=' || first === '+' || first === '@' || first === '-' || first === '\t' || first === '\r') {
    return `'${value}`;
  }
  return value;
}

export function escapeCsvCell(raw: string | number | boolean | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const str = sanitizeCsvFormulaInjection(String(raw));
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvDocument(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
  includeUtf8Bom = true
): string {
  const lines: string[] = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const body = lines.join('\r\n');
  return includeUtf8Bom ? `\uFEFF${body}` : body;
}

export function buildInvoicesCsv(
  invoices: FinancialInvoiceIQD[],
  primaryCurrencyCode = 'IQD',
  lang: 'ar' | 'en' = 'ar'
): string {
  const headers =
    lang !== 'en'
      ? [
          'رقم الفاتورة',
          'التاريخ',
          'المريض',
          'نوع الفاتورة',
          'البيان',
          'الحالة',
          'العملة',
          'المبلغ الكلي',
          'الخصم',
          'الصافي',
          'المدفوع',
          'المتبقي',
          'رقم إشعار الدائن',
          'سبب الإلغاء',
          'ملاحظات',
        ]
      : [
          'Invoice #',
          'Date',
          'Patient',
          'Type',
          'Description',
          'Status',
          'Currency',
          'Total',
          'Discount',
          'Net Amount',
          'Paid',
          'Balance Due',
          'Credit Note #',
          'Void Reason',
          'Notes',
        ];

  const rows = invoices.map((inv) => [
    inv.invoiceNumber,
    inv.date,
    inv.patientName,
    inv.invoiceType,
    lang !== 'en' ? inv.titleAr : inv.titleEn,
    inv.status,
    inv.currencyCode || primaryCurrencyCode,
    inv.totalAmountIQD,
    inv.discountIQD,
    inv.netAmountIQD,
    inv.paidAmountIQD,
    inv.balanceDueIQD,
    inv.creditNoteNumber || '',
    inv.voidReason || '',
    inv.notes || '',
  ]);

  return buildCsvDocument(headers, rows, true);
}

export function buildPaymentsCsv(
  invoices: FinancialInvoiceIQD[],
  primaryCurrencyCode = 'IQD',
  lang: 'ar' | 'en' = 'ar'
): string {
  const headers =
    lang !== 'en'
      ? [
          'رقم الوصل',
          'التاريخ',
          'رقم الفاتورة',
          'المريض',
          'الطريقة',
          'العملة المستلمة',
          'المبلغ الأصلي',
          'سعر الصرف',
          `المكافئ (${primaryCurrencyCode})`,
          'عكس قيد؟',
          'مستلم الدفعة',
          'ملاحظات',
        ]
      : [
          'Receipt #',
          'Date',
          'Invoice #',
          'Patient',
          'Method',
          'Payment Currency',
          'Original Amount',
          'FX Rate',
          `Equivalent (${primaryCurrencyCode})`,
          'Is Reversal',
          'Received By',
          'Notes',
        ];

  const rows: Array<Array<string | number | boolean | null | undefined>> = [];
  for (const inv of invoices) {
    for (const pay of inv.payments || []) {
      rows.push([
        pay.receiptNumber,
        pay.date,
        inv.invoiceNumber,
        inv.patientName,
        pay.method,
        pay.currencyCode || primaryCurrencyCode,
        pay.originalAmount ?? pay.amountIQD,
        pay.exchangeRateToPrimary ?? 1,
        pay.amountIQD,
        Boolean(pay.isReversal),
        pay.receivedBy,
        pay.reversalReason || pay.notes || '',
      ]);
    }
  }

  return buildCsvDocument(headers, rows, true);
}

export function buildExpensesCsv(
  expenses: ClinicExpenseIQD[],
  primaryCurrencyCode = 'IQD',
  lang: 'ar' | 'en' = 'ar'
): string {
  const headers =
    lang !== 'en'
      ? ['التاريخ', 'الفئة', 'البيان', 'العملة', 'المبلغ', 'دفع بواسطة', 'ملاحظات']
      : ['Date', 'Category', 'Description', 'Currency', 'Amount', 'Paid By', 'Notes'];

  const rows = expenses.map((e) => [
    e.date,
    e.category,
    lang !== 'en' ? e.titleAr : e.titleEn,
    primaryCurrencyCode,
    e.amountIQD,
    e.paidBy,
    e.notes || '',
  ]);

  return buildCsvDocument(headers, rows, true);
}

export function buildMonthlySummaryCsv(
  summary: MonthlyFinanceSummary,
  lang: 'ar' | 'en' = 'ar'
): string {
  const headers =
    lang !== 'en'
      ? ['الشهر', 'البند', `القيمة (${summary.primaryCurrencyCode})`]
      : ['Month', 'Metric', `Amount (${summary.primaryCurrencyCode})`];

  const rows: Array<[string, string, number]> =
    lang !== 'en'
      ? [
          [summary.monthKey, 'عدد الفواتير النشطة', summary.invoiceCount],
          [summary.monthKey, 'الفواتير الملغاة (Void)', summary.voidedInvoiceCount],
          [summary.monthKey, 'إجمالي الفواتير الصافية', summary.totalBilledPrimary],
          [summary.monthKey, 'المقبوضات الإجمالية', summary.totalCollectedPrimary],
          [summary.monthKey, 'القيود العكسية والاستردادات', summary.totalReversedPrimary],
          [summary.monthKey, 'صافي المقبوضات', summary.netCollectedPrimary],
          [summary.monthKey, 'إجمالي المصاريف التشغيلية', summary.totalExpensesPrimary],
          [summary.monthKey, 'صافي التدفق النقدي (المحصّل - المصاريف)', summary.netCashFlowPrimary],
          [summary.monthKey, 'نقداً', summary.byMethod.cash],
          [summary.monthKey, 'زين كاش', summary.byMethod.zain_cash],
          [summary.monthKey, 'كي كارد', summary.byMethod.qi_card],
          [summary.monthKey, 'طرق دفع أخرى', summary.byMethod.other],
        ]
      : [
          [summary.monthKey, 'Active Invoices', summary.invoiceCount],
          [summary.monthKey, 'Voided Invoices', summary.voidedInvoiceCount],
          [summary.monthKey, 'Total Net Billed', summary.totalBilledPrimary],
          [summary.monthKey, 'Gross Collected', summary.totalCollectedPrimary],
          [summary.monthKey, 'Reversed / Refunds', summary.totalReversedPrimary],
          [summary.monthKey, 'Net Collected', summary.netCollectedPrimary],
          [summary.monthKey, 'Total Operating Expenses', summary.totalExpensesPrimary],
          [summary.monthKey, 'Net Cash Flow (Collected - Expenses)', summary.netCashFlowPrimary],
          [summary.monthKey, 'Cash', summary.byMethod.cash],
          [summary.monthKey, 'ZainCash', summary.byMethod.zain_cash],
          [summary.monthKey, 'QiCard', summary.byMethod.qi_card],
          [summary.monthKey, 'Other Methods', summary.byMethod.other],
        ];

  return buildCsvDocument(headers, rows, true);
}

export function downloadCsvFile(filename: string, csvContent: string): void {
  const safeName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  void saveTextFilePortable({
    filename: safeName,
    content: csvContent,
    mimeType: 'text/csv;charset=utf-8;',
    description: 'CSV Spreadsheet (.csv)',
    extensions: ['csv'],
  });
}

export function formatPaymentCurrencySnapshot(pay: PaymentTransactionIQD, primaryCode = 'IQD'): string {
  const code = pay.currencyCode || primaryCode;
  if (!code || code === primaryCode || !pay.originalAmount || !pay.exchangeRateToPrimary) {
    return `${pay.amountIQD} ${primaryCode}`;
  }
  return `${pay.originalAmount} ${code} @ ${pay.exchangeRateToPrimary} = ${pay.amountIQD} ${primaryCode}`;
}
