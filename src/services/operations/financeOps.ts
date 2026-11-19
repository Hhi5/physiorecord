// =======================================================================
// PhysioRecord — Financial Ledger, Z-Reports, FX, Expenses,
// SessionFinalized Event Handler & Synthetic Demo Seeding Operations
// =======================================================================

import type { SessionFinalizedEventPayload } from '../sessionService';
import type {
  AppointmentStatus,
  CashCloseZReportRecord,
  ClinicAppointment,
  ClinicExpenseIQD,
  CreditNoteEntry,
  CurrencyBreakdownBucket,
  ExpenseCategoryIQD,
  FinancialInvoiceIQD,
  FinancialSequencesData,
  FinishUndoSnapshot,
  InvoiceInstallmentItem,
  IraqiPaymentMethod,
  MonthlyFinanceSummary,
  PaymentTransactionIQD,
  WaitingListEntry,
} from '../../types/clinicManagement';
import { getCurrencyConfig, DEFAULT_CURRENCY_CODE } from '../../utils/currencies';
import { localDate } from '../../utils/date';
import { buildDemoOperationsSeed } from '../clinicDemoSeed';
import {
  formatIQD,
  reconcileInstallmentsWithPaidTotal,
} from './operationsConstants';
import type { BatchEncryptedWriteItem, OperationsRuntime } from './operationsTypes';

// ---------------------------------------------------------------------
// Daily & Monthly Cash Summaries and Z-Reports
// ---------------------------------------------------------------------
export function getFinanceSummaryForDateOps(
  rt: OperationsRuntime,
  dateKey: string
): {
  totalCollectedIQD: number;
  totalReversedIQD: number;
  netCollectedIQD: number;
  paymentCount: number;
  byMethod: Record<IraqiPaymentMethod, number>;
  expensesIQD: number;
  netCashIQD: number;
} {
  const byMethod: Record<IraqiPaymentMethod, number> = {
    cash: 0,
    zain_cash: 0,
    qi_card: 0,
    other: 0,
  };
  let totalCollectedIQD = 0;
  let totalReversedIQD = 0;
  let paymentCount = 0;

  const cache = rt.getCache();
  for (const inv of cache.invoices) {
    for (const pay of inv.payments || []) {
      if (pay.date !== dateKey) continue;
      const m: IraqiPaymentMethod =
        pay.method === 'zain_cash' || pay.method === 'qi_card' || pay.method === 'other'
          ? pay.method
          : 'cash';
      if (pay.amountIQD > 0) {
        totalCollectedIQD += pay.amountIQD;
        paymentCount += 1;
        byMethod[m] += pay.amountIQD;
      } else if (pay.amountIQD < 0) {
        totalReversedIQD += Math.abs(pay.amountIQD);
        byMethod[m] += pay.amountIQD;
      }
    }
  }

  const expensesIQD = cache.expenses
    .filter((e) => e.date === dateKey)
    .reduce((acc, e) => acc + (e.amountIQD || 0), 0);
  const netCollectedIQD = totalCollectedIQD - totalReversedIQD;

  return {
    totalCollectedIQD,
    totalReversedIQD,
    netCollectedIQD,
    paymentCount,
    byMethod,
    expensesIQD,
    netCashIQD: netCollectedIQD - expensesIQD,
  };
}

export function getCashClosesOps(rt: OperationsRuntime): CashCloseZReportRecord[] {
  return [...rt.getCache().cashCloses];
}

export function buildDailyCashZReportDraftOps(
  rt: OperationsRuntime,
  dateKey: string,
  primaryCurrencyCode = DEFAULT_CURRENCY_CODE,
  countedCashActual?: number,
  notes?: string
): Omit<CashCloseZReportRecord, 'id' | 'zReportNumber' | 'closedAt' | 'closedBy' | 'updatedAt' | 'version'> {
  const primaryCode = (primaryCurrencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
  const byMethod: Record<IraqiPaymentMethod, number> = {
    cash: 0,
    zain_cash: 0,
    qi_card: 0,
    other: 0,
  };
  const byCurrency: Record<string, CurrencyBreakdownBucket> = {};
  let totalCollectedPrimary = 0;
  let totalReversedPrimary = 0;
  let paymentCount = 0;
  let reversalCount = 0;

  const cache = rt.getCache();
  for (const inv of cache.invoices) {
    for (const pay of inv.payments || []) {
      if (pay.date !== dateKey) continue;
      const method: IraqiPaymentMethod =
        pay.method === 'zain_cash' || pay.method === 'qi_card' || pay.method === 'other'
          ? pay.method
          : 'cash';
      const payCode = (pay.currencyCode || primaryCode).toUpperCase();
      if (!byCurrency[payCode]) {
        byCurrency[payCode] = {
          collectedOriginal: 0,
          collectedPrimary: 0,
          reversedOriginal: 0,
          reversedPrimary: 0,
          count: 0,
        };
      }
      const origAmt = Math.abs(pay.originalAmount ?? pay.amountIQD);
      if (pay.amountIQD > 0) {
        totalCollectedPrimary += pay.amountIQD;
        paymentCount += 1;
        byMethod[method] += pay.amountIQD;
        byCurrency[payCode].collectedOriginal += origAmt;
        byCurrency[payCode].collectedPrimary += pay.amountIQD;
        byCurrency[payCode].count += 1;
      } else if (pay.amountIQD < 0) {
        totalReversedPrimary += Math.abs(pay.amountIQD);
        reversalCount += 1;
        byMethod[method] += pay.amountIQD;
        byCurrency[payCode].reversedOriginal += origAmt;
        byCurrency[payCode].reversedPrimary += Math.abs(pay.amountIQD);
      }
    }
  }

  const dayExpenses = cache.expenses.filter((e) => e.date === dateKey);
  const totalExpensesPrimary = dayExpenses.reduce((s, e) => s + (e.amountIQD || 0), 0);
  const netCollectedPrimary = totalCollectedPrimary - totalReversedPrimary;
  const netCashFlowPrimary = netCollectedPrimary - totalExpensesPrimary;
  const expectedCashInDrawer = byMethod.cash - totalExpensesPrimary;
  const cashVariance =
    typeof countedCashActual === 'number' && !Number.isNaN(countedCashActual)
      ? countedCashActual - expectedCashInDrawer
      : undefined;

  return {
    dateKey,
    primaryCurrencyCode: primaryCode,
    totalCollectedPrimary,
    totalReversedPrimary,
    netCollectedPrimary,
    totalExpensesPrimary,
    netCashFlowPrimary,
    paymentCount,
    reversalCount,
    expenseCount: dayExpenses.length,
    byMethod,
    byCurrency,
    ...(typeof countedCashActual === 'number' && !Number.isNaN(countedCashActual)
      ? { countedCashActual }
      : {}),
    ...(typeof cashVariance === 'number' ? { cashVariance } : {}),
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
  };
}

export async function closeDailyCashZReportAsyncOps(
  rt: OperationsRuntime,
  params: {
    dateKey: string;
    primaryCurrencyCode?: string;
    countedCashActual?: number;
    notes?: string;
  }
): Promise<CashCloseZReportRecord> {
  const primaryCode = (params.primaryCurrencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
  const draft = buildDailyCashZReportDraftOps(
    rt,
    params.dateKey,
    primaryCode,
    params.countedCashActual,
    params.notes
  );
  const staff = rt.getActiveStaff();
  const now = new Date().toISOString();
  const zNumber = rt.allocateNextFinancialNumber('zReport');

  const record: CashCloseZReportRecord = {
    ...draft,
    id: `zrep_${params.dateKey}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    zReportNumber: zNumber,
    closedAt: now,
    closedBy: staff.nameAr || staff.nameEn,
    updatedAt: now,
    version: 1,
  };

  const cache = rt.getCache();
  const database = rt.getActiveDb();
  cache.cashCloses = [record, ...cache.cashCloses];
  if (!database.verno || database.verno >= 8) {
    await rt.trackWrite(
      rt.putRecordEncrypted('cashCloses', record.id, [], record, { dateKey: record.dateKey })
    );
  }

  await rt.appendAuditLogAsync({
    actionType: 'z_report_closed',
    entityType: 'cash_close',
    entityId: record.id,
    summaryAr: `إغلاق الصندوق اليومي (${record.zReportNumber}) لتاريخ ${record.dateKey} — صافي التدفق النقدي: ${record.netCashFlowPrimary} ${primaryCode}`,
    summaryEn: `Closed Daily Z-Report (${record.zReportNumber}) for ${record.dateKey} — Net Cash Flow: ${record.netCashFlowPrimary} ${primaryCode}`,
  });

  rt.notifyListeners();
  return record;
}

export function getMonthlyFinanceSummaryOps(
  rt: OperationsRuntime,
  monthKey: string,
  primaryCurrencyCode = DEFAULT_CURRENCY_CODE
): MonthlyFinanceSummary {
  const primaryCode = (primaryCurrencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
  const byMethod: Record<IraqiPaymentMethod, number> = {
    cash: 0,
    zain_cash: 0,
    qi_card: 0,
    other: 0,
  };
  const byExpenseCategory: Record<ExpenseCategoryIQD, number> = {
    rent: 0,
    medical_consumables: 0,
    equipment_maintenance: 0,
    staff_salaries: 0,
    electricity_generator: 0,
    marketing_other: 0,
  };
  const byCurrency: Record<string, CurrencyBreakdownBucket> = {};

  let invoiceCount = 0;
  let voidedInvoiceCount = 0;
  let totalBilledPrimary = 0;
  let totalCollectedPrimary = 0;
  let totalReversedPrimary = 0;

  const cache = rt.getCache();
  for (const inv of cache.invoices) {
    if (inv.date.startsWith(monthKey)) {
      if (inv.status === 'void') {
        voidedInvoiceCount += 1;
      } else {
        invoiceCount += 1;
        totalBilledPrimary += inv.netAmountIQD || 0;
      }
    }
    for (const pay of inv.payments || []) {
      if (!pay.date.startsWith(monthKey)) continue;
      const m: IraqiPaymentMethod =
        pay.method === 'zain_cash' || pay.method === 'qi_card' || pay.method === 'other'
          ? pay.method
          : 'cash';
      const payCode = (pay.currencyCode || primaryCode).toUpperCase();
      if (!byCurrency[payCode]) {
        byCurrency[payCode] = {
          collectedOriginal: 0,
          collectedPrimary: 0,
          reversedOriginal: 0,
          reversedPrimary: 0,
          count: 0,
        };
      }
      const origAmt = Math.abs(pay.originalAmount ?? pay.amountIQD);
      if (pay.amountIQD > 0) {
        totalCollectedPrimary += pay.amountIQD;
        byMethod[m] += pay.amountIQD;
        byCurrency[payCode].collectedOriginal += origAmt;
        byCurrency[payCode].collectedPrimary += pay.amountIQD;
        byCurrency[payCode].count += 1;
      } else if (pay.amountIQD < 0) {
        totalReversedPrimary += Math.abs(pay.amountIQD);
        byMethod[m] += pay.amountIQD;
        byCurrency[payCode].reversedOriginal += origAmt;
        byCurrency[payCode].reversedPrimary += Math.abs(pay.amountIQD);
      }
    }
  }

  let totalExpensesPrimary = 0;
  for (const exp of cache.expenses) {
    if (!exp.date.startsWith(monthKey)) continue;
    totalExpensesPrimary += exp.amountIQD || 0;
    if (exp.category in byExpenseCategory) {
      byExpenseCategory[exp.category] += exp.amountIQD || 0;
    } else {
      byExpenseCategory.marketing_other += exp.amountIQD || 0;
    }
  }

  const netCollectedPrimary = totalCollectedPrimary - totalReversedPrimary;
  return {
    monthKey,
    primaryCurrencyCode: primaryCode,
    invoiceCount,
    voidedInvoiceCount,
    totalBilledPrimary,
    totalCollectedPrimary,
    totalReversedPrimary,
    netCollectedPrimary,
    totalExpensesPrimary,
    netCashFlowPrimary: netCollectedPrimary - totalExpensesPrimary,
    byMethod,
    byExpenseCategory,
    byCurrency,
  };
}

// ---------------------------------------------------------------------
// Financial Sequences, FX, Invoices, Payments & Rehab Courses
// ---------------------------------------------------------------------
export function getFinancialSequencesOps(rt: OperationsRuntime): FinancialSequencesData {
  return { ...rt.getCache().financialSequences };
}

export function allocateNextFinancialNumberOps(
  rt: OperationsRuntime,
  kind: 'invoice' | 'receipt' | 'creditNote' | 'zReport'
): string {
  const cache = rt.getCache();
  const seq = cache.financialSequences;
  const now = new Date().toISOString();
  let field: keyof Pick<
    FinancialSequencesData,
    'invoiceSequence' | 'receiptSequence' | 'creditNoteSequence' | 'zReportSequence'
  >;
  let prefix: string;
  const existingSet = new Set<string>();

  if (kind === 'invoice') {
    field = 'invoiceSequence';
    prefix = 'INV-';
    for (const inv of cache.invoices) {
      if (inv.invoiceNumber) existingSet.add(inv.invoiceNumber);
    }
  } else if (kind === 'receipt') {
    field = 'receiptSequence';
    prefix = 'RCPT-';
    for (const inv of cache.invoices) {
      for (const p of inv.payments || []) {
        if (p.receiptNumber) existingSet.add(p.receiptNumber);
      }
    }
  } else if (kind === 'creditNote') {
    field = 'creditNoteSequence';
    prefix = 'CN-';
    for (const inv of cache.invoices) {
      if (inv.creditNoteNumber) existingSet.add(inv.creditNoteNumber);
      for (const cn of inv.creditNotes || []) {
        if (cn.creditNoteNumber) existingSet.add(cn.creditNoteNumber);
      }
    }
  } else {
    field = 'zReportSequence';
    prefix = 'Z-';
    for (const z of cache.cashCloses) {
      if (z.zReportNumber) existingSet.add(z.zReportNumber);
    }
  }

  let nextNum = (seq[field] || 0) + 1;
  const formatNum = (n: number) => `${prefix}${String(n).padStart(4, '0')}`;
  while (existingSet.has(formatNum(nextNum))) {
    nextNum += 1;
  }

  const updatedSeq: FinancialSequencesData = {
    ...seq,
    [field]: nextNum,
    updatedAt: now,
    version: (seq.version || 0) + 1,
  };
  cache.financialSequences = updatedSeq;
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'clinicSettings',
      'financial_sequences',
      [],
      updatedSeq,
      {},
      { skipConcurrencyCheck: true }
    )
  ).catch(() => undefined);

  return formatNum(nextNum);
}

export function computeFxPaymentSnapshotOps(params: {
  primaryCurrencyCode?: string;
  paymentCurrencyCode?: string;
  originalAmount?: number;
  primaryAmountFallback?: number;
  exchangeRateToPrimary?: number;
  maxPrimaryCap?: number;
}): {
  primaryCurrencyCode: string;
  paymentCurrencyCode: string;
  originalAmount: number;
  exchangeRateToPrimary: number;
  convertedPrimaryAmount: number;
} {
  const primaryCurrencyCode = (params.primaryCurrencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
  const paymentCurrencyCode = (params.paymentCurrencyCode || primaryCurrencyCode).toUpperCase();
  const primaryCfg = getCurrencyConfig(primaryCurrencyCode);
  const payCfg = getCurrencyConfig(paymentCurrencyCode);
  const roundFor = (val: number, decimals: number) => {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  };

  const isSameCurrency = paymentCurrencyCode === primaryCurrencyCode;
  const rawRate = isSameCurrency ? 1 : Number(params.exchangeRateToPrimary ?? 0);
  if (!isSameCurrency && (!Number.isFinite(rawRate) || rawRate <= 0)) {
    throw new Error(
      `Valid positive exchange rate is required when collecting in ${paymentCurrencyCode} for ${primaryCurrencyCode} ledger.`
    );
  }

  let orig = 0;
  let converted = 0;
  if (typeof params.originalAmount === 'number' && Number.isFinite(params.originalAmount) && params.originalAmount > 0) {
    orig = roundFor(params.originalAmount, payCfg.decimals);
    converted = isSameCurrency ? roundFor(orig, primaryCfg.decimals) : roundFor(orig * rawRate, primaryCfg.decimals);
  } else {
    const fallback = Math.max(0, Number(params.primaryAmountFallback ?? 0));
    converted = roundFor(fallback, primaryCfg.decimals);
    orig = isSameCurrency ? converted : roundFor(converted / rawRate, payCfg.decimals);
  }

  if (typeof params.maxPrimaryCap === 'number' && converted > params.maxPrimaryCap) {
    converted = roundFor(Math.max(0, params.maxPrimaryCap), primaryCfg.decimals);
    orig = isSameCurrency ? converted : roundFor(converted / rawRate, payCfg.decimals);
  }

  return {
    primaryCurrencyCode,
    paymentCurrencyCode,
    originalAmount: orig,
    exchangeRateToPrimary: rawRate,
    convertedPrimaryAmount: Math.max(0, converted),
  };
}

export function getInvoicesIQDOps(rt: OperationsRuntime): FinancialInvoiceIQD[] {
  return rt.getCache().invoices.filter((i) => Boolean(i.patientId));
}

export function createInvoiceIQDOps(
  rt: OperationsRuntime,
  params: {
    patientId: string;
    patientName: string;
    episodeId?: string;
    episodeTitle?: string;
    locationId?: string;
    travelFeeIQD?: number;
    invoiceType: FinancialInvoiceIQD['invoiceType'];
    titleAr: string;
    titleEn: string;
    totalAmountIQD: number;
    discountIQD: number;
    initialPaidIQD: number;
    paymentMethod: IraqiPaymentMethod;
    currencyCode?: string;
    paymentCurrencyCode?: string;
    originalPaidAmount?: number;
    exchangeRateToPrimary?: number;
    packageTotalSessions?: number;
    packageUsedSessions?: number;
    installmentPlan?: InvoiceInstallmentItem[];
    notes?: string;
    isDemo?: boolean;
  }
): FinancialInvoiceIQD {
  if (!params.patientId || !params.patientId.trim()) {
    throw new Error('Patient ID is required for every invoice.');
  }
  const cache = rt.getCache();
  const list = getInvoicesIQDOps(rt);
  const staff = rt.getActiveStaff();
  const today = localDate();
  const now = new Date().toISOString();
  const primaryCode = (params.currencyCode || DEFAULT_CURRENCY_CODE).toUpperCase();
  const netAmountIQD = Math.max(0, params.totalAmountIQD - params.discountIQD);

  const hasRequestedPayment =
    params.initialPaidIQD > 0 || (typeof params.originalPaidAmount === 'number' && params.originalPaidAmount > 0);

  let paidAmountIQD = 0;
  let payments: PaymentTransactionIQD[] = [];
  if (hasRequestedPayment && netAmountIQD > 0) {
    const fx = computeFxPaymentSnapshotOps({
      primaryCurrencyCode: primaryCode,
      paymentCurrencyCode: params.paymentCurrencyCode,
      originalAmount: params.originalPaidAmount,
      primaryAmountFallback: params.initialPaidIQD,
      exchangeRateToPrimary: params.exchangeRateToPrimary,
      maxPrimaryCap: netAmountIQD,
    });
    paidAmountIQD = fx.convertedPrimaryAmount;
    if (paidAmountIQD > 0) {
      const invTempId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const receiptNumber = rt.allocateNextFinancialNumber('receipt');
      payments = [
        {
          id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          invoiceId: invTempId,
          patientId: params.patientId.trim(),
          date: today,
          amountIQD: paidAmountIQD,
          currencyCode: fx.paymentCurrencyCode,
          originalAmount: fx.originalAmount,
          exchangeRateToPrimary: fx.exchangeRateToPrimary,
          primaryCurrencyCode: fx.primaryCurrencyCode,
          method: params.paymentMethod,
          receivedBy: staff.nameAr,
          receiptNumber,
          status: 'posted',
          notes: 'دفعة عند إصدار الفاتورة',
          updatedAt: now,
          version: 1,
        },
      ];
    }
  }

  const balanceDueIQD = Math.max(0, netAmountIQD - paidAmountIQD);
  const status: FinancialInvoiceIQD['status'] =
    balanceDueIQD === 0 ? 'paid' : paidAmountIQD > 0 ? 'partial' : 'unpaid';

  const invId = payments[0]?.invoiceId || `inv_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  const invoiceNumber = rt.allocateNextFinancialNumber('invoice');

  const newInvoice: FinancialInvoiceIQD = {
    id: invId,
    invoiceNumber,
    patientId: params.patientId.trim(),
    isDemo: params.isDemo,
    patientName: params.patientName,
    episodeId: params.episodeId,
    episodeTitle: params.episodeTitle,
    locationId: params.locationId,
    travelFeeIQD:
      typeof params.travelFeeIQD === 'number' && params.travelFeeIQD > 0
        ? params.travelFeeIQD
        : undefined,
    date: today,
    invoiceType: params.invoiceType,
    titleAr: params.titleAr,
    titleEn: params.titleEn,
    currencyCode: primaryCode,
    totalAmountIQD: params.totalAmountIQD,
    discountIQD: params.discountIQD,
    netAmountIQD,
    paidAmountIQD,
    balanceDueIQD,
    status,
    installmentPlan:
      params.installmentPlan && params.installmentPlan.length > 0
        ? reconcileInstallmentsWithPaidTotal(params.installmentPlan, paidAmountIQD, today)
        : undefined,
    packageTotalSessions:
      params.invoiceType === 'rehab_package' ? params.packageTotalSessions || 6 : undefined,
    packageUsedSessions:
      params.invoiceType === 'rehab_package' ? Math.max(0, params.packageUsedSessions ?? 0) : undefined,
    payments,
    createdBy: staff.nameAr,
    notes: params.notes,
    updatedAt: now,
    version: 1,
  };

  cache.invoices = [newInvoice, ...list];
  void rt.trackWrite(
    rt.putRecordsEncryptedBatch([
      {
        tableName: 'invoices',
        id: newInvoice.id,
        parentIds: [],
        payload: newInvoice,
        extraColumns: {
          patientId: newInvoice.patientId,
          ...(newInvoice.episodeId ? { episodeId: newInvoice.episodeId } : {}),
        },
      },
      ...payments.map((p) => ({
        tableName: 'payments' as const,
        id: p.id,
        parentIds: [invId],
        payload: p,
        extraColumns: {
          invoiceId: invId,
          patientId: p.patientId,
        },
      })),
    ])
  ).catch(() => undefined);

  rt.appendAuditLog({
    actionType: 'invoice_created',
    entityType: 'invoice',
    entityId: newInvoice.id,
    patientId: newInvoice.patientId,
    episodeId: newInvoice.episodeId,
    summaryAr: `إصدار فاتورة ${invoiceNumber} بقيمة ${netAmountIQD} ${primaryCode} للمريض ${params.patientName}`,
    summaryEn: `Issued invoice ${invoiceNumber} (${netAmountIQD} ${primaryCode}) for ${params.patientName}`,
  });

  rt.notifyListeners();
  return newInvoice;
}

export function rollbackUncommittedFinishInvoiceOps(
  rt: OperationsRuntime,
  id: string
): FinancialInvoiceIQD[] {
  const cache = rt.getCache();
  const existing = cache.invoices.find((i) => i.id === id);
  cache.invoices = cache.invoices.filter((i) => i.id !== id);
  void rt.deleteRecordEncrypted('invoices', id).catch(() => undefined);
  for (const p of existing?.payments || []) {
    void rt.deleteRecordEncrypted('payments', p.id).catch(() => undefined);
  }
  rt.notifyListeners();
  return getInvoicesIQDOps(rt);
}

export function voidInvoiceWithReasonIQDOps(
  rt: OperationsRuntime,
  invoiceId: string,
  reason: string
): FinancialInvoiceIQD[] {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('A mandatory reason is required to void an invoice.');
  }
  const cache = rt.getCache();
  const existing = cache.invoices.find((i) => i.id === invoiceId);
  if (!existing) {
    throw new Error(`Invoice ${invoiceId} was not found.`);
  }
  if (existing.status === 'void') {
    throw new Error(`Invoice ${existing.invoiceNumber} is already voided.`);
  }

  const staff = rt.getActiveStaff();
  const staffName = staff.nameAr || staff.nameEn;
  const today = localDate();
  const now = new Date().toISOString();
  const creditNoteNumber = rt.allocateNextFinancialNumber('creditNote');

  const creditNote: CreditNoteEntry = {
    id: `cn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    creditNoteNumber,
    invoiceId: existing.id,
    patientId: existing.patientId,
    date: today,
    amountIQD: existing.netAmountIQD,
    reason: cleanReason,
    issuedBy: staffName,
    createdAt: now,
  };

  const reversalPayments: PaymentTransactionIQD[] = [];
  const mutatedPayments: PaymentTransactionIQD[] = (existing.payments || []).map((pay) => {
    if (pay.amountIQD > 0 && !pay.isReversal && pay.status !== 'reversed') {
      const revId = `pay_rev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const revReceipt = rt.allocateNextFinancialNumber('receipt');
      const reversalEntry: PaymentTransactionIQD = {
        id: revId,
        invoiceId: existing.id,
        patientId: existing.patientId,
        date: today,
        amountIQD: -Math.abs(pay.amountIQD),
        currencyCode: pay.currencyCode || existing.currencyCode || DEFAULT_CURRENCY_CODE,
        originalAmount:
          typeof pay.originalAmount === 'number'
            ? -Math.abs(pay.originalAmount)
            : -Math.abs(pay.amountIQD),
        exchangeRateToPrimary: pay.exchangeRateToPrimary ?? 1,
        primaryCurrencyCode: pay.primaryCurrencyCode || existing.currencyCode || DEFAULT_CURRENCY_CODE,
        method: pay.method,
        receivedBy: staffName,
        receiptNumber: revReceipt,
        status: 'posted',
        isReversal: true,
        reversalOfPaymentId: pay.id,
        reversalReason: cleanReason,
        notes: `عكس دفعة (${pay.receiptNumber}) عند إصدار إشعار دائن ${creditNoteNumber}`,
        updatedAt: now,
        version: 1,
      };
      reversalPayments.push(reversalEntry);
      return {
        ...pay,
        status: 'reversed' as const,
        reversedByPaymentId: revId,
        reversalReason: cleanReason,
        updatedAt: now,
        version: (pay.version || 0) + 1,
      };
    }
    return pay;
  });

  const updatedPayments = [...mutatedPayments, ...reversalPayments];
  const updatedInvoice: FinancialInvoiceIQD = {
    ...existing,
    paidAmountIQD: 0,
    balanceDueIQD: 0,
    status: 'void',
    voidedAt: now,
    voidReason: cleanReason,
    voidedBy: staffName,
    creditNoteNumber,
    creditNotes: [...(existing.creditNotes || []), creditNote],
    payments: updatedPayments,
    updatedAt: now,
    version: (existing.version || 0) + 1,
  };

  cache.invoices = cache.invoices.map((inv) =>
    inv.id === invoiceId ? updatedInvoice : inv
  );

  const voidBatchItems: BatchEncryptedWriteItem[] = [
    {
      tableName: 'invoices',
      id: updatedInvoice.id,
      parentIds: [],
      payload: updatedInvoice,
      extraColumns: {
        patientId: updatedInvoice.patientId,
        ...(updatedInvoice.episodeId ? { episodeId: updatedInvoice.episodeId } : {}),
      },
    },
    ...mutatedPayments
      .filter((pay) => pay.reversedByPaymentId && reversalPayments.some((r) => r.id === pay.reversedByPaymentId))
      .map((pay) => ({
        tableName: 'payments' as const,
        id: pay.id,
        parentIds: [updatedInvoice.id],
        payload: pay,
        extraColumns: {
          invoiceId: updatedInvoice.id,
          patientId: pay.patientId,
        },
      })),
    ...reversalPayments.map((revPay) => ({
      tableName: 'payments' as const,
      id: revPay.id,
      parentIds: [updatedInvoice.id],
      payload: revPay,
      extraColumns: {
        invoiceId: updatedInvoice.id,
        patientId: revPay.patientId,
      },
    })),
  ];

  void rt.trackWrite(rt.putRecordsEncryptedBatch(voidBatchItems)).catch(() => undefined);

  rt.appendAuditLog({
    actionType: 'invoice_voided',
    entityType: 'invoice',
    entityId: updatedInvoice.id,
    patientId: updatedInvoice.patientId,
    episodeId: updatedInvoice.episodeId,
    summaryAr: `إلغاء الفاتورة ${updatedInvoice.invoiceNumber} وإصدار إشعار دائن ${creditNoteNumber} — السبب: ${cleanReason}`,
    summaryEn: `Voided invoice ${updatedInvoice.invoiceNumber} with Credit Note ${creditNoteNumber} — Reason: ${cleanReason}`,
  });

  rt.notifyListeners();
  return getInvoicesIQDOps(rt);
}

export function reversePaymentIQDOps(
  rt: OperationsRuntime,
  invoiceId: string,
  paymentId: string,
  reason: string
): FinancialInvoiceIQD[] {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('A mandatory reason is required to reverse a payment.');
  }
  const cache = rt.getCache();
  const existing = cache.invoices.find((i) => i.id === invoiceId);
  if (!existing) {
    throw new Error(`Invoice ${invoiceId} was not found.`);
  }
  if (existing.status === 'void') {
    throw new Error(`Invoice ${existing.invoiceNumber} is already voided.`);
  }
  const targetPayment = (existing.payments || []).find((p) => p.id === paymentId);
  if (
    !targetPayment ||
    targetPayment.isReversal ||
    targetPayment.status === 'reversed' ||
    targetPayment.amountIQD <= 0
  ) {
    throw new Error('Target payment is not eligible for reversal.');
  }

  const staff = rt.getActiveStaff();
  const staffName = staff.nameAr || staff.nameEn;
  const today = localDate();
  const now = new Date().toISOString();
  const revId = `pay_rev_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  const revReceipt = rt.allocateNextFinancialNumber('receipt');

  const reversalEntry: PaymentTransactionIQD = {
    id: revId,
    invoiceId: existing.id,
    patientId: existing.patientId,
    date: today,
    amountIQD: -Math.abs(targetPayment.amountIQD),
    currencyCode: targetPayment.currencyCode || existing.currencyCode || DEFAULT_CURRENCY_CODE,
    originalAmount:
      typeof targetPayment.originalAmount === 'number'
        ? -Math.abs(targetPayment.originalAmount)
        : -Math.abs(targetPayment.amountIQD),
    exchangeRateToPrimary: targetPayment.exchangeRateToPrimary ?? 1,
    primaryCurrencyCode:
      targetPayment.primaryCurrencyCode || existing.currencyCode || DEFAULT_CURRENCY_CODE,
    method: targetPayment.method,
    receivedBy: staffName,
    receiptNumber: revReceipt,
    status: 'posted',
    isReversal: true,
    reversalOfPaymentId: targetPayment.id,
    reversalReason: cleanReason,
    notes: `عكس وصل ${targetPayment.receiptNumber}: ${cleanReason}`,
    updatedAt: now,
    version: 1,
  };

  const mutatedOriginal: PaymentTransactionIQD = {
    ...targetPayment,
    status: 'reversed',
    reversedByPaymentId: revId,
    reversalReason: cleanReason,
    updatedAt: now,
    version: (targetPayment.version || 0) + 1,
  };

  const updatedPayments = [
    ...(existing.payments || []).map((p) => (p.id === paymentId ? mutatedOriginal : p)),
    reversalEntry,
  ];
  const netPaid = Math.max(
    0,
    updatedPayments.reduce((sum, p) => sum + (p.amountIQD || 0), 0)
  );
  const newBal = Math.max(0, existing.netAmountIQD - netPaid);
  const newStatus: FinancialInvoiceIQD['status'] =
    newBal === 0 ? 'paid' : netPaid > 0 ? 'partial' : 'unpaid';

  const updatedInvoice: FinancialInvoiceIQD = {
    ...existing,
    paidAmountIQD: netPaid,
    balanceDueIQD: newBal,
    status: newStatus,
    installmentPlan: reconcileInstallmentsWithPaidTotal(
      existing.installmentPlan,
      netPaid,
      localDate()
    ),
    payments: updatedPayments,
    updatedAt: now,
    version: (existing.version || 0) + 1,
  };

  cache.invoices = cache.invoices.map((inv) =>
    inv.id === invoiceId ? updatedInvoice : inv
  );

  void rt.trackWrite(
    rt.putRecordEncrypted('invoices', updatedInvoice.id, [], updatedInvoice, {
      patientId: updatedInvoice.patientId,
      ...(updatedInvoice.episodeId ? { episodeId: updatedInvoice.episodeId } : {}),
    })
  ).catch(() => undefined);

  void rt.trackWrite(
    rt.putRecordEncrypted('payments', mutatedOriginal.id, [updatedInvoice.id], mutatedOriginal, {
      invoiceId: updatedInvoice.id,
      patientId: mutatedOriginal.patientId,
    })
  ).catch(() => undefined);

  void rt.trackWrite(
    rt.putRecordEncrypted('payments', reversalEntry.id, [updatedInvoice.id], reversalEntry, {
      invoiceId: updatedInvoice.id,
      patientId: reversalEntry.patientId,
    })
  ).catch(() => undefined);

  rt.appendAuditLog({
    actionType: 'payment_reversed',
    entityType: 'payment',
    entityId: updatedInvoice.id,
    patientId: updatedInvoice.patientId,
    episodeId: updatedInvoice.episodeId,
    summaryAr: `عكس الدفعة ${targetPayment.receiptNumber} على الفاتورة ${updatedInvoice.invoiceNumber} — السبب: ${cleanReason}`,
    summaryEn: `Reversed payment ${targetPayment.receiptNumber} on invoice ${updatedInvoice.invoiceNumber} — Reason: ${cleanReason}`,
  });

  rt.notifyListeners();
  return getInvoicesIQDOps(rt);
}

export function restoreInvoiceIQDOps(
  rt: OperationsRuntime,
  invoice: FinancialInvoiceIQD
): FinancialInvoiceIQD[] {
  const cache = rt.getCache();
  const rest = cache.invoices.filter((i) => i.id !== invoice.id);
  cache.invoices = [invoice, ...rest];
  void rt.trackWrite(
    rt.putRecordEncrypted(
      'invoices',
      invoice.id,
      [],
      invoice,
      {
        patientId: invoice.patientId,
        ...(invoice.episodeId ? { episodeId: invoice.episodeId } : {}),
      },
      { skipConcurrencyCheck: true }
    )
  ).catch(() => undefined);
  for (const p of invoice.payments || []) {
    void rt.trackWrite(
      rt.putRecordEncrypted(
        'payments',
        p.id,
        [invoice.id],
        p,
        { invoiceId: invoice.id, patientId: p.patientId },
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
  }
  rt.notifyListeners();
  return getInvoicesIQDOps(rt);
}

export function recordPaymentOnInvoiceIQDOps(
  rt: OperationsRuntime,
  invoiceId: string,
  amountIQD: number,
  method: IraqiPaymentMethod,
  notes?: string,
  fx?: {
    paymentCurrencyCode?: string;
    originalAmount?: number;
    exchangeRateToPrimary?: number;
    primaryCurrencyCode?: string;
  }
): FinancialInvoiceIQD[] {
  const cache = rt.getCache();
  const targetInv = cache.invoices.find((inv) => inv.id === invoiceId);
  if (!targetInv) return getInvoicesIQDOps(rt);
  if (targetInv.status === 'void') {
    throw new Error(`Cannot collect payment on voided invoice ${targetInv.invoiceNumber}.`);
  }

  const staff = rt.getActiveStaff();
  const today = localDate();
  const now = new Date().toISOString();

  const snapshot = computeFxPaymentSnapshotOps({
    primaryCurrencyCode: fx?.primaryCurrencyCode || targetInv.currencyCode || DEFAULT_CURRENCY_CODE,
    paymentCurrencyCode: fx?.paymentCurrencyCode,
    originalAmount: fx?.originalAmount,
    primaryAmountFallback: amountIQD,
    exchangeRateToPrimary: fx?.exchangeRateToPrimary,
    maxPrimaryCap: targetInv.balanceDueIQD,
  });

  if (snapshot.convertedPrimaryAmount <= 0) {
    return getInvoicesIQDOps(rt);
  }

  const receiptNumber = rt.allocateNextFinancialNumber('receipt');
  const newPayment: PaymentTransactionIQD = {
    id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    invoiceId: targetInv.id,
    patientId: targetInv.patientId,
    date: today,
    amountIQD: snapshot.convertedPrimaryAmount,
    currencyCode: snapshot.paymentCurrencyCode,
    originalAmount: snapshot.originalAmount,
    exchangeRateToPrimary: snapshot.exchangeRateToPrimary,
    primaryCurrencyCode: snapshot.primaryCurrencyCode,
    method,
    receivedBy: staff.nameAr,
    receiptNumber,
    status: 'posted',
    notes: notes || 'تسديد دفعة',
    updatedAt: now,
    version: 1,
  };

  const newPaid = targetInv.paidAmountIQD + snapshot.convertedPrimaryAmount;
  const newBal = Math.max(0, targetInv.netAmountIQD - newPaid);
  const updatedInvoice: FinancialInvoiceIQD = {
    ...targetInv,
    paidAmountIQD: newPaid,
    balanceDueIQD: newBal,
    status: newBal === 0 ? 'paid' : 'partial',
    installmentPlan: reconcileInstallmentsWithPaidTotal(
      targetInv.installmentPlan,
      newPaid,
      today
    ),
    payments: [...targetInv.payments, newPayment],
    updatedAt: now,
    version: (targetInv.version || 0) + 1,
  };

  cache.invoices = cache.invoices.map((inv) =>
    inv.id === invoiceId ? updatedInvoice : inv
  );

  void rt.trackWrite(
    rt.putRecordsEncryptedBatch([
      {
        tableName: 'invoices',
        id: updatedInvoice.id,
        parentIds: [],
        payload: updatedInvoice,
        extraColumns: {
          patientId: updatedInvoice.patientId,
          ...(updatedInvoice.episodeId ? { episodeId: updatedInvoice.episodeId } : {}),
        },
      },
      {
        tableName: 'payments',
        id: newPayment.id,
        parentIds: [updatedInvoice.id],
        payload: newPayment,
        extraColumns: {
          invoiceId: updatedInvoice.id,
          patientId: newPayment.patientId,
        },
      },
    ])
  ).catch(() => undefined);

  rt.appendAuditLog({
    actionType: 'payment_received',
    entityType: 'payment',
    entityId: updatedInvoice.id,
    patientId: updatedInvoice.patientId,
    episodeId: updatedInvoice.episodeId,
    summaryAr: `استلام دفعة ${newPayment.originalAmount} ${newPayment.currencyCode} (${method}) على الفاتورة ${updatedInvoice.invoiceNumber}`,
    summaryEn: `Collected ${newPayment.originalAmount} ${newPayment.currencyCode} via ${method} for invoice ${updatedInvoice.invoiceNumber}`,
  });

  rt.notifyListeners();
  return getInvoicesIQDOps(rt);
}

export function saveInvoiceInstallmentPlanOps(
  rt: OperationsRuntime,
  invoiceId: string,
  installments: InvoiceInstallmentItem[]
): FinancialInvoiceIQD[] {
  const cache = rt.getCache();
  const targetInv = cache.invoices.find((inv) => inv.id === invoiceId);
  if (!targetInv) return getInvoicesIQDOps(rt);
  const today = localDate();
  const now = new Date().toISOString();
  const reconciled =
    installments.length > 0
      ? reconcileInstallmentsWithPaidTotal(installments, targetInv.paidAmountIQD, today)
      : undefined;
  const updatedInvoice: FinancialInvoiceIQD = {
    ...targetInv,
    installmentPlan: reconciled,
    updatedAt: now,
    version: (targetInv.version || 0) + 1,
  };
  cache.invoices = cache.invoices.map((inv) =>
    inv.id === invoiceId ? updatedInvoice : inv
  );
  void rt.trackWrite(
    rt.putRecordEncrypted('invoices', updatedInvoice.id, [], updatedInvoice, {
      patientId: updatedInvoice.patientId,
      ...(updatedInvoice.episodeId ? { episodeId: updatedInvoice.episodeId } : {}),
    })
  ).catch(() => undefined);
  rt.appendAuditLog({
    actionType: 'invoice_created',
    entityType: 'invoice',
    entityId: updatedInvoice.id,
    patientId: updatedInvoice.patientId,
    episodeId: updatedInvoice.episodeId,
    summaryAr: `تحديث خطة الأقساط للفاتورة ${updatedInvoice.invoiceNumber} (${reconciled?.length || 0} أقساط)`,
    summaryEn: `Updated installment plan on invoice ${updatedInvoice.invoiceNumber} (${reconciled?.length || 0} installments)`,
  });
  rt.notifyListeners();
  return getInvoicesIQDOps(rt);
}

export function incrementPackageSessionUsedOps(
  rt: OperationsRuntime,
  invoiceId: string,
  finalizedSessionId?: string
): FinancialInvoiceIQD[] {
  let target: FinancialInvoiceIQD | null = null;
  const cache = rt.getCache();
  cache.invoices = cache.invoices.map((inv) => {
    if (inv.id !== invoiceId || !inv.packageTotalSessions) return inv;
    if (finalizedSessionId && inv.processedFinalizedSessionIds?.includes(finalizedSessionId)) {
      return inv;
    }
    const current = inv.packageUsedSessions || 0;
    if (current >= inv.packageTotalSessions) return inv;
    const nextProcessed = finalizedSessionId
      ? [...(inv.processedFinalizedSessionIds || []), finalizedSessionId]
      : inv.processedFinalizedSessionIds;
    target = {
      ...inv,
      packageUsedSessions: current + 1,
      ...(nextProcessed ? { processedFinalizedSessionIds: nextProcessed } : {}),
      updatedAt: new Date().toISOString(),
      version: (inv.version || 0) + 1,
    };
    return target;
  });
  if (target) {
    const invRef: FinancialInvoiceIQD = target;
    void rt.trackWrite(
      rt.putRecordEncrypted('invoices', invRef.id, [], invRef, {
        patientId: invRef.patientId,
        ...(invRef.episodeId ? { episodeId: invRef.episodeId } : {}),
      })
    ).catch(() => undefined);
  }
  rt.notifyListeners();
  return getInvoicesIQDOps(rt);
}

export function adjustPackageSessionAdminOps(
  rt: OperationsRuntime,
  invoiceId: string,
  delta: 1 | -1,
  reason: string
): FinancialInvoiceIQD[] {
  const staff = rt.getActiveStaff();
  if (staff.role !== 'admin') {
    throw new Error(
      'تعديل حصص الكورس يدوياً مسموح لدور مدير النظام (Admin) فقط.'
    );
  }
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error(
      'يجب إدخال سبب واضح لتعديل عدد الجلسات المستخدمة في الكورس (Reason is required).'
    );
  }

  const cache = rt.getCache();
  const now = new Date().toISOString();
  let updatedRef: FinancialInvoiceIQD | null = null;
  let previousUsed = 0;
  let nextUsed = 0;

  cache.invoices = cache.invoices.map((inv) => {
    if (inv.id !== invoiceId || !inv.packageTotalSessions) return inv;
    previousUsed = inv.packageUsedSessions || 0;
    nextUsed = Math.max(0, Math.min(inv.packageTotalSessions, previousUsed + delta));
    if (nextUsed === previousUsed) return inv;

    updatedRef = {
      ...inv,
      packageUsedSessions: nextUsed,
      packageAdjustments: [
        ...(inv.packageAdjustments || []),
        {
          timestamp: now,
          delta,
          reason: cleanReason,
          actorName: staff.nameAr,
          actorRole: staff.role,
        },
      ],
      updatedAt: now,
      version: (inv.version || 0) + 1,
    };
    return updatedRef;
  });

  if (updatedRef) {
    const invRef: FinancialInvoiceIQD = updatedRef;
    void rt.trackWrite(
      rt.putRecordEncrypted('invoices', invRef.id, [], invRef, {
        patientId: invRef.patientId,
        ...(invRef.episodeId ? { episodeId: invRef.episodeId } : {}),
      })
    ).catch(() => undefined);

    rt.appendAuditLog({
      actionType: 'package_manual_adjustment',
      entityType: 'invoice',
      entityId: invRef.id,
      patientId: invRef.patientId,
      episodeId: invRef.episodeId,
      summaryAr: `تعديل إداري لعدد جلسات الكورس (${invRef.invoiceNumber}): ${previousUsed} ← ${nextUsed} (${delta > 0 ? '+1' : '-1'}) | السبب: ${cleanReason}`,
      summaryEn: `Admin package visit adjustment (${invRef.invoiceNumber}): ${previousUsed} -> ${nextUsed} (${delta > 0 ? '+1' : '-1'}) | Reason: ${cleanReason}`,
    });
  }

  rt.notifyListeners();
  return getInvoicesIQDOps(rt);
}

export function emitSessionFinalizedEventOps(
  rt: OperationsRuntime,
  event: SessionFinalizedEventPayload & { skipPackageDecrement?: boolean }
): {
  alreadyProcessed: boolean;
  appointmentCompletedId?: string;
  packageInvoiceUpdatedId?: string;
  waitingListCompletedIds: string[];
} {
  const cache = rt.getCache();
  const alreadyLogged = cache.auditLogs.some(
    (entry) => entry.actionType === 'session_finalized_event' && entry.entityId === event.sessionId
  );
  if (alreadyLogged) {
    return {
      alreadyProcessed: true,
      waitingListCompletedIds: [],
    };
  }

  const now = new Date().toISOString();
  const sessionDay = (event.sessionDate || '').slice(0, 10);
  const targetApptStatus: AppointmentStatus =
    event.attendanceStatus === 'no_show'
      ? 'no_show'
      : event.attendanceStatus === 'cancelled_patient' ||
        event.attendanceStatus === 'cancelled_clinic'
      ? 'cancelled'
      : 'completed';

  let matchedAppt: ClinicAppointment | undefined = cache.appointments.find(
    (a) =>
      a.patientId === event.patientId &&
      a.date.slice(0, 10) === sessionDay &&
      a.episodeId === event.episodeId &&
      (a.status === 'scheduled' || a.status === 'arrived' || a.status === 'in_session')
  );
  if (!matchedAppt) {
    matchedAppt = cache.appointments.find(
      (a) =>
        a.patientId === event.patientId &&
        a.date.slice(0, 10) === sessionDay &&
        (a.status === 'scheduled' || a.status === 'arrived' || a.status === 'in_session')
    );
  }

  let appointmentCompletedId: string | undefined;
  if (matchedAppt) {
    const targetId = matchedAppt.id;
    let updatedAppt: ClinicAppointment | null = null;
    cache.appointments = cache.appointments.map((a) => {
      if (a.id !== targetId) return a;
      updatedAppt = {
        ...a,
        status: targetApptStatus,
        updatedAt: now,
        version: (a.version || 0) + 1,
      };
      return updatedAppt;
    });
    if (updatedAppt) {
      const apptRef: ClinicAppointment = updatedAppt;
      appointmentCompletedId = apptRef.id;
      void rt.trackWrite(
        rt.putRecordEncrypted('appointments', apptRef.id, [], apptRef, {
          patientId: apptRef.patientId,
          ...(apptRef.episodeId ? { episodeId: apptRef.episodeId } : {}),
        })
      ).catch(() => undefined);
    }
  }

  let packageInvoiceUpdatedId: string | undefined;
  const isAttended = !event.attendanceStatus || event.attendanceStatus === 'attended';
  if (isAttended && !event.skipPackageDecrement) {
    const candidatePkg =
      cache.invoices.find(
        (inv) =>
          inv.patientId === event.patientId &&
          inv.invoiceType === 'rehab_package' &&
          inv.episodeId === event.episodeId &&
          (inv.packageTotalSessions || 0) > (inv.packageUsedSessions || 0)
      ) ||
      cache.invoices.find(
        (inv) =>
          inv.patientId === event.patientId &&
          inv.invoiceType === 'rehab_package' &&
          (!inv.episodeId || inv.episodeId === event.episodeId) &&
          (inv.packageTotalSessions || 0) > (inv.packageUsedSessions || 0)
      );

    if (candidatePkg && !candidatePkg.processedFinalizedSessionIds?.includes(event.sessionId)) {
      rt.incrementPackageSessionUsed(candidatePkg.id, event.sessionId);
      packageInvoiceUpdatedId = candidatePkg.id;
    }
  }

  const waitingListCompletedIds: string[] = [];
  cache.waitingList = cache.waitingList.map((w) => {
    if (w.patientId !== event.patientId || w.status === 'completed') return w;
    const updatedWait: WaitingListEntry = {
      ...w,
      status: 'completed',
      updatedAt: now,
      version: (w.version || 0) + 1,
    };
    waitingListCompletedIds.push(w.id);
    void rt.trackWrite(
      rt.putRecordEncrypted('waitingList', updatedWait.id, [], updatedWait, {
        patientId: updatedWait.patientId,
      })
    ).catch(() => undefined);
    return updatedWait;
  });

  rt.appendAuditLog({
    actionType: 'session_finalized_event',
    entityType: 'session',
    entityId: event.sessionId,
    patientId: event.patientId,
    episodeId: event.episodeId,
    summaryAr: `تنفيذ حدث اعتماد الجلسة (${event.sessionId}): ${appointmentCompletedId ? 'إغلاق الموعد' : 'دون موعد مرتبط'}${packageInvoiceUpdatedId ? ' + خصم جلسة من الكورس' : ''}${waitingListCompletedIds.length > 0 ? ' + إغلاق قائمة الانتظار' : ''}`,
    summaryEn: `SessionFinalized event (${event.sessionId}): ${appointmentCompletedId ? 'appointment completed' : 'no linked appointment'}${packageInvoiceUpdatedId ? ' + package visit deducted' : ''}${waitingListCompletedIds.length > 0 ? ' + waitlist closed' : ''}`,
  });

  rt.notifyListeners();
  return {
    alreadyProcessed: false,
    appointmentCompletedId,
    packageInvoiceUpdatedId,
    waitingListCompletedIds,
  };
}

export function undoFinishSequenceBillingAndBookingOps(
  rt: OperationsRuntime,
  snapshot: FinishUndoSnapshot
): void {
  if (snapshot.createdAppointmentId) {
    rt.deleteAppointment(snapshot.createdAppointmentId, { bypassRecycleBin: true });
  }
  if (snapshot.createdInvoiceId) {
    rt.rollbackUncommittedFinishInvoice(snapshot.createdInvoiceId);
  }
  if (snapshot.createdPaymentId) {
    void rt.deleteRecordEncrypted('payments', snapshot.createdPaymentId).catch(() => undefined);
  }
  if (snapshot.previousInvoiceState) {
    rt.restoreInvoiceIQD(snapshot.previousInvoiceState);
  }
  if (snapshot.previousAppointmentId && snapshot.previousAppointmentStatus) {
    rt.updateAppointmentStatus(snapshot.previousAppointmentId, snapshot.previousAppointmentStatus);
  }
}

export function getPatientFinancialSummaryIQDOps(
  rt: OperationsRuntime,
  patientId: string,
  _patientName?: string
) {
  const patientInvoices = getInvoicesIQDOps(rt).filter(
    (inv) => inv.patientId === patientId && inv.status !== 'void'
  );
  const totalBilledIQD = patientInvoices.reduce((acc, inv) => acc + inv.netAmountIQD, 0);
  const totalPaidIQD = patientInvoices.reduce((acc, inv) => acc + inv.paidAmountIQD, 0);
  const totalDebtIQD = patientInvoices.reduce((acc, inv) => acc + inv.balanceDueIQD, 0);
  return {
    invoices: getInvoicesIQDOps(rt).filter((inv) => inv.patientId === patientId),
    totalBilledIQD,
    totalPaidIQD,
    totalDebtIQD,
  };
}

// ---------------------------------------------------------------------
// Clinic Expenses
// ---------------------------------------------------------------------
export function getExpensesIQDOps(rt: OperationsRuntime): ClinicExpenseIQD[] {
  return [...rt.getCache().expenses];
}

export function addExpenseIQDOps(
  rt: OperationsRuntime,
  expense: Omit<ClinicExpenseIQD, 'id'>
): ClinicExpenseIQD[] {
  const cache = rt.getCache();
  const record: ClinicExpenseIQD = {
    ...expense,
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  cache.expenses = [record, ...cache.expenses];
  void rt.trackWrite(rt.putRecordEncrypted('expenses', record.id, [], record)).catch(() => undefined);

  rt.appendAuditLog({
    actionType: 'expense_logged',
    entityType: 'expense',
    entityId: record.id,
    patientId: record.patientId,
    summaryAr: `تسجيل مصروف عيادة (${record.titleAr}): ${formatIQD(record.amountIQD)}`,
    summaryEn: `Logged clinic expense (${record.titleEn}): ${formatIQD(record.amountIQD, false)}`,
  });
  rt.notifyListeners();
  return getExpensesIQDOps(rt);
}

export function logRecurringExpenseForMonthOps(
  rt: OperationsRuntime,
  params: {
    templateId: string;
    amountIQD: number;
    date: string;
    customCategoryLabel?: string;
    paidBy?: string;
    notes?: string;
  }
): ClinicExpenseIQD[] {
  const templates = rt.getRecurringExpenseTemplates();
  const tpl = templates.find((t) => t.id === params.templateId);
  if (!tpl) {
    return getExpensesIQDOps(rt);
  }
  const staff = rt.getActiveStaff();
  addExpenseIQDOps(rt, {
    date: params.date,
    category: tpl.category,
    customCategoryLabel: params.customCategoryLabel || tpl.customCategoryLabel,
    recurringTemplateId: tpl.id,
    titleAr: tpl.titleAr,
    titleEn: tpl.titleEn,
    amountIQD: params.amountIQD,
    paidBy: params.paidBy || tpl.paidBy || staff.nameAr,
    notes: params.notes,
  });
  const monthKey = params.date.slice(0, 7);
  const updatedTemplates = templates.map((item) =>
    item.id === tpl.id
      ? {
          ...item,
          lastLoggedMonthKey: monthKey,
        }
      : item
  );
  rt.saveRecurringExpenseTemplates(updatedTemplates);
  return getExpensesIQDOps(rt);
}

export function deleteExpenseIQDOps(
  rt: OperationsRuntime,
  id: string,
  options?: { bypassRecycleBin?: boolean; deletedAtIso?: string }
): ClinicExpenseIQD[] {
  const cache = rt.getCache();
  const target = cache.expenses.find((e) => e.id === id);
  if (target && !target.isDemo && !options?.bypassRecycleBin && rt.isTrashRecycleBinEnabled()) {
    rt.moveRecordToRecycleBin({
      itemType: 'expense',
      originalId: target.id,
      titleAr: `${target.titleAr || target.titleEn} (${target.date})`,
      titleEn: `${target.titleEn || target.titleAr} (${target.date})`,
      subtitleAr: `${target.amountIQD} IQD — ${target.category}`,
      subtitleEn: `${target.amountIQD} IQD — ${target.category}`,
      payload: { ...target },
      nowIso: options?.deletedAtIso,
    });
  }
  cache.expenses = cache.expenses.filter((e) => e.id !== id);
  void rt.deleteRecordEncrypted('expenses', id).catch(() => undefined);
  rt.notifyListeners();
  return getExpensesIQDOps(rt);
}

export function restoreExpenseIQDOps(
  rt: OperationsRuntime,
  expense: ClinicExpenseIQD
): ClinicExpenseIQD[] {
  const cache = rt.getCache();
  const rest = cache.expenses.filter((e) => e.id !== expense.id);
  cache.expenses = [expense, ...rest];
  void rt.trackWrite(
    rt.putRecordEncrypted('expenses', expense.id, [], expense, {}, { skipConcurrencyCheck: true })
  ).catch(() => undefined);
  rt.notifyListeners();
  return getExpensesIQDOps(rt);
}

// ---------------------------------------------------------------------
// Explicit Synthetic Demo Operations Seeding & Cleanup
// ---------------------------------------------------------------------
export function seedDemoOperationsDataOps(rt: OperationsRuntime): void {
  const cache = rt.getCache();
  const bundle = buildDemoOperationsSeed(rt.getStaffRoster());

  const existingAppts = cache.appointments.filter((a) => !a.isDemo);
  const existingWaitlist = cache.waitingList.filter((w) => !w.isDemo);
  const existingInvoices = cache.invoices.filter((i) => !i.isDemo);
  const existingExpenses = cache.expenses.filter((e) => !e.isDemo);

  cache.appointments = [...bundle.appointments, ...existingAppts];
  cache.waitingList = [...bundle.waitlist, ...existingWaitlist];
  cache.invoices = [...bundle.invoices, ...existingInvoices];
  cache.expenses = [...bundle.expenses, ...existingExpenses];

  for (const a of bundle.appointments) {
    void rt.trackWrite(
      rt.putRecordEncrypted('appointments', a.id, [], a, { patientId: a.patientId }, { skipConcurrencyCheck: true })
    ).catch(() => undefined);
  }
  for (const w of bundle.waitlist) {
    void rt.trackWrite(
      rt.putRecordEncrypted('waitingList', w.id, [], w, { patientId: w.patientId }, { skipConcurrencyCheck: true })
    ).catch(() => undefined);
  }
  for (const i of bundle.invoices) {
    void rt.trackWrite(
      rt.putRecordEncrypted(
        'invoices',
        i.id,
        [],
        i,
        { patientId: i.patientId, ...(i.episodeId ? { episodeId: i.episodeId } : {}) },
        { skipConcurrencyCheck: true }
      )
    ).catch(() => undefined);
    for (const p of i.payments || []) {
      void rt.trackWrite(
        rt.putRecordEncrypted(
          'payments',
          p.id,
          [i.id],
          p,
          { invoiceId: i.id, patientId: p.patientId },
          { skipConcurrencyCheck: true }
        )
      ).catch(() => undefined);
    }
  }
  for (const e of bundle.expenses) {
    void rt.trackWrite(
      rt.putRecordEncrypted('expenses', e.id, [], e, {}, { skipConcurrencyCheck: true })
    ).catch(() => undefined);
  }
  rt.notifyListeners();
}

export function deleteAllDemoOperationsDataOps(
  rt: OperationsRuntime,
  updateSmartMemoryAsync: (
    partial: Partial<{ recentPatientIds: string[]; pinnedPatientIds: string[] }>
  ) => Promise<unknown>
): void {
  const cache = rt.getCache();
  const isDemoId = (id: string) => id.startsWith('demo_') || id.startsWith('syn-');
  const removedAppts = cache.appointments.filter((a) => a.isDemo || isDemoId(a.id) || isDemoId(a.patientId));
  const removedWait = cache.waitingList.filter((w) => w.isDemo || isDemoId(w.id) || isDemoId(w.patientId));
  const removedInvs = cache.invoices.filter((i) => i.isDemo || isDemoId(i.id) || isDemoId(i.patientId));
  const removedExps = cache.expenses.filter((e) => e.isDemo || isDemoId(e.id));
  const removedRecs = cache.recurringSchedules.filter((r) => r.isDemo || isDemoId(r.id) || isDemoId(r.patientId));

  cache.appointments = cache.appointments.filter((a) => !removedAppts.includes(a));
  cache.waitingList = cache.waitingList.filter((w) => !removedWait.includes(w));
  cache.invoices = cache.invoices.filter((i) => !removedInvs.includes(i));
  cache.expenses = cache.expenses.filter((e) => !removedExps.includes(e));
  cache.recurringSchedules = cache.recurringSchedules.filter((r) => !removedRecs.includes(r));

  for (const a of removedAppts) void rt.deleteRecordEncrypted('appointments', a.id).catch(() => undefined);
  for (const w of removedWait) void rt.deleteRecordEncrypted('waitingList', w.id).catch(() => undefined);
  for (const i of removedInvs) {
    void rt.deleteRecordEncrypted('invoices', i.id).catch(() => undefined);
    for (const p of i.payments || []) {
      void rt.deleteRecordEncrypted('payments', p.id).catch(() => undefined);
    }
  }
  for (const e of removedExps) void rt.deleteRecordEncrypted('expenses', e.id).catch(() => undefined);
  for (const r of removedRecs) void rt.deleteRecordEncrypted('recurringSchedules', r.id).catch(() => undefined);

  const cleanedRecent = cache.smartMemory.recentPatientIds.filter((id) => !isDemoId(id));
  const cleanedPinned = cache.smartMemory.pinnedPatientIds.filter((id) => !isDemoId(id));
  if (
    cleanedRecent.length !== cache.smartMemory.recentPatientIds.length ||
    cleanedPinned.length !== cache.smartMemory.pinnedPatientIds.length
  ) {
    void updateSmartMemoryAsync({
      recentPatientIds: cleanedRecent,
      pinnedPatientIds: cleanedPinned,
    }).catch(() => undefined);
  }

  rt.notifyListeners();
}

export function hasDemoOperationsDataOps(rt: OperationsRuntime): boolean {
  const cache = rt.getCache();
  const isDemoId = (id: string) => id.startsWith('demo_') || id.startsWith('syn-');
  return (
    cache.appointments.some((a) => Boolean(a.isDemo) || isDemoId(a.id) || isDemoId(a.patientId)) ||
    cache.waitingList.some((w) => Boolean(w.isDemo) || isDemoId(w.id) || isDemoId(w.patientId)) ||
    cache.invoices.some((i) => Boolean(i.isDemo) || isDemoId(i.id) || isDemoId(i.patientId)) ||
    cache.expenses.some((e) => Boolean(e.isDemo) || isDemoId(e.id)) ||
    cache.recurringSchedules.some((r) => Boolean(r.isDemo) || isDemoId(r.id) || isDemoId(r.patientId))
  );
}
