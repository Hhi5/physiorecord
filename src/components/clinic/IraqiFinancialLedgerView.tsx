// =======================================================================
// PhysioRecord — Iraqi Clinic Financial Ledger & Expense Management
// Primary Currency: Iraqi Dinar (IQD / د.ع) | Packages, Partial Payments, Debt & Expenses
// =======================================================================

import React, { Suspense, lazy, useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { usePatients } from '../../context/PatientContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useVault } from '../../context/VaultContext';
import { DraftRecoveryService } from '../../services/draftRecoveryService';
import {
  ClinicOperationsService,
  ROLE_PERMISSIONS,
} from '../../services/clinicOperationsService';
import { localDate, formatDateDDMMYYYY } from '../../utils/date';
import { DrawerDialog, ModalDialog } from '../ui/Dialog';
import { getPatientMrn, isDemoPatient } from '../../utils/mrn';
import {
  Num,
  Fraction,
  Money,
  MoneyInput,
  DemoBadge,
  DatePickerInput,
} from '../ui/Primitives';
import {
  buildInstallmentAgingSummary,
  generateEqualInstallmentSchedule,
  getExpenseCategoryDisplayLabel,
  summarizeInvoicesByLocation,
} from '../../utils/iraqFinanceC4C5';
import {
  buildExpensesCsv,
  buildInvoicesCsv,
  buildMonthlySummaryCsv,
  buildPaymentsCsv,
  downloadCsvFile,
  formatPaymentCurrencySnapshot,
} from '../../utils/csvExport';
import { WORLD_CURRENCIES } from '../../utils/currencies';
import {
  buildReceiptWhatsAppText,
  buildUserInitiatedWhatsAppHref,
} from '../../utils/whatsappTemplates';
import type { PrintableDocumentType } from '../print/PrintDocumentModal';

const PrintDocumentModal = lazy(() =>
  import('../print/PrintDocumentModal').then((m) => ({ default: m.PrintDocumentModal }))
);
import type {
  CashCloseZReportRecord,
  FinancialInvoiceIQD,
  IraqiPaymentMethod,
  ClinicExpenseIQD,
  ExpenseCategoryIQD,
  PaymentTransactionIQD,
  PracticeLocationItem,
} from '../../types/clinicManagement';
import {
  Plus,
  Receipt,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Trash2,
  RotateCcw,
  X,
  Printer,
  Download,
  Ban,
  MessageSquare,
  Copy,
  History,
  FileText,
  CalendarClock,
  MapPin,
  Wallet,
  ChevronLeft,
  ChevronRight,
  User,
} from 'lucide-react';

const InstallmentPlansAgingPanel = lazy(() =>
  import('./InstallmentPlansAgingPanel').then((m) => ({
    default: m.InstallmentPlansAgingPanel,
  }))
);
const InstallmentPlanBuilderModal = lazy(() =>
  import('./InstallmentPlansAgingPanel').then((m) => ({
    default: m.InstallmentPlanBuilderModal,
  }))
);
const RecurringExpensesPanel = lazy(() =>
  import('./RecurringExpensesPanel').then((m) => ({
    default: m.RecurringExpensesPanel,
  }))
);

export const IraqiFinancialLedgerView: React.FC = () => {
  const { language, isRtl, bi } = useLanguage();
  const { currency } = useCurrency();
  const { dek, refreshRecoveredDrafts } = useVault();
  const { activePatients } = usePatients();

  const [activeTab, setActiveTab] = useState<
    'invoices' | 'debts' | 'installments' | 'expenses' | 'z_report' | 'monthly'
  >('invoices');
  const [invoices, setInvoices] = useState<FinancialInvoiceIQD[]>([]);
  const [expenses, setExpenses] = useState<ClinicExpenseIQD[]>([]);
  const [cashCloses, setCashCloses] = useState<CashCloseZReportRecord[]>([]);
  const [showNewInvoiceForm, setShowNewInvoiceForm] = useState(false);
  const [showNewExpenseForm, setShowNewExpenseForm] = useState(false);

  // Phase C Module Flags & Practice Locations
  const [homeVisitsEnabled, setHomeVisitsEnabled] = useState(() =>
    ClinicOperationsService.isHomeVisitsEnabled()
  );
  const [practiceLocationsEnabled, setPracticeLocationsEnabled] = useState(() =>
    ClinicOperationsService.isPracticeLocationsEnabled()
  );
  const [installmentPlansEnabled, setInstallmentPlansEnabled] = useState(() =>
    ClinicOperationsService.isInstallmentPlansEnabled()
  );
  const [recurringExpensesEnabled, setRecurringExpensesEnabled] = useState(() =>
    ClinicOperationsService.isRecurringExpensesEnabled()
  );
  const [practiceLocations, setPracticeLocations] = useState<PracticeLocationItem[]>(
    () => ClinicOperationsService.getPracticeLocations()
  );
  const [installmentBuilderInvoice, setInstallmentBuilderInvoice] =
    useState<FinancialInvoiceIQD | null>(null);
  const [locationSummaryScope, setLocationSummaryScope] = useState<
    'all' | 'month'
  >('all');

  // Partial Payment Collection Modal State (4.2 FX supported)
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] =
    useState<FinancialInvoiceIQD | null>(null);
  const [paymentAmountIQD, setPaymentAmountIQD] = useState<number>(0);
  const [paymentCurrency, setPaymentCurrency] = useState<string>(currency.code);
  const [paymentOrigAmount, setPaymentOrigAmount] = useState<string>('');
  const [paymentFxRate, setPaymentFxRate] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<IraqiPaymentMethod>('cash');
  const [paymentCustomMethod, setPaymentCustomMethod] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // New Invoice Form State (blank defaults preserved per R2)
  const [invPatientId, setInvPatientId] = useState('');
  const [invType, setInvType] = useState<FinancialInvoiceIQD['invoiceType']>('single_session');
  const [invTitle, setInvTitle] = useState('جلسة مفردة');
  const [invLocationId, setInvLocationId] = useState('');
  const [invTravelFeeIQD, setInvTravelFeeIQD] = useState<number>(0);
  const [invTotalIQD, setInvTotalIQD] = useState<number>(0);
  const [invDiscountIQD, setInvDiscountIQD] = useState<number>(0);
  const [invPaidIQD, setInvPaidIQD] = useState<number>(0);
  const [invPayCurrency, setInvPayCurrency] = useState<string>(currency.code);
  const [invPayOrigAmount, setInvPayOrigAmount] = useState<string>('');
  const [invPayFxRate, setInvPayFxRate] = useState<string>('');
  const [invError, setInvError] = useState<string | null>(null);
  const [invMethod, setInvMethod] = useState<IraqiPaymentMethod>('cash');
  const [invCustomMethod, setInvCustomMethod] = useState('');
  const [invPackageSessions, setInvPackageSessions] = useState<number | ''>('');
  const [invInstallmentEnabled, setInvInstallmentEnabled] = useState(false);
  const [invInstallmentCount, setInvInstallmentCount] = useState<number>(2);
  const [invInstallmentStartDate, setInvInstallmentStartDate] = useState<string>(
    () => localDate()
  );
  const [invInstallmentIntervalDays, setInvInstallmentIntervalDays] =
    useState<number>(30);
  const [invNotes, setInvNotes] = useState('');

  // New Expense Form State (blank zero default per R2)
  const [expCategory, setExpCategory] = useState<ExpenseCategoryIQD>('medical_consumables');
  const [expCustomCategoryLabel, setExpCustomCategoryLabel] = useState('');
  const [expPatientId, setExpPatientId] = useState('');
  const [expTitle, setExpTitle] = useState('');
  const [expAmountIQD, setExpAmountIQD] = useState<number>(0);
  const [expNotes, setExpNotes] = useState('');

  // Void / Credit Note Modal State (4.1)
  const [voidTargetInvoice, setVoidTargetInvoice] = useState<FinancialInvoiceIQD | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);

  // Invoice Payment History & Reversal Modal State (4.1 / 4.6 / 4.7)
  const [historyInvoice, setHistoryInvoice] = useState<FinancialInvoiceIQD | null>(null);
  const [reversingPayId, setReversingPayId] = useState<string | null>(null);
  const [reversePayReason, setReversePayReason] = useState('');
  const [reversePayError, setReversePayError] = useState<string | null>(null);
  const [copiedWaReceiptId, setCopiedWaReceiptId] = useState<string | null>(null);

  // Z-Report & Monthly Summary State (4.3)
  const [zReportDate, setZReportDate] = useState<string>(localDate());
  const [zCountedCashInput, setZCountedCashInput] = useState<string>('');
  const [zNotes, setZNotes] = useState<string>('');
  const [zSaving, setZSaving] = useState(false);
  const [monthlyMonthKey, setMonthlyMonthKey] = useState<string>(localDate().slice(0, 7));

  // Print Document Modal State (4.6)
  const [printDoc, setPrintDoc] = useState<{
    type: PrintableDocumentType;
    invoice?: FinancialInvoiceIQD;
    payment?: PaymentTransactionIQD;
    zReport?: CashCloseZReportRecord;
  } | null>(null);

  // 8-Second Undo Toast State (Expenses only; invoices use Credit Note void per 4.1)
  const [undoItem, setUndoItem] = useState<{ type: 'expense'; data: ClinicExpenseIQD } | null>(null);

  // Admin Manual Package Visit Adjustment Modal State (Phase 3.6)
  const [pkgAdjustInvoice, setPkgAdjustInvoice] = useState<FinancialInvoiceIQD | null>(null);
  const [pkgAdjustDelta, setPkgAdjustDelta] = useState<1 | -1>(1);
  const [pkgAdjustReason, setPkgAdjustReason] = useState('');
  const [pkgAdjustError, setPkgAdjustError] = useState<string | null>(null);

  // Selected Patient Card -> Details Modal
  const [selectedPatientLedgerKey, setSelectedPatientLedgerKey] = useState<string | null>(null);

  const [activeStaff, setActiveStaff] = useState(() => ClinicOperationsService.getActiveStaff());
  const perms = ROLE_PERMISSIONS[activeStaff.role];
  const isAdmin = activeStaff.role === 'admin';

  const reloadFinance = () => {
    const nextInvoices = ClinicOperationsService.getInvoicesIQD();
    setInvoices(nextInvoices);
    setExpenses(ClinicOperationsService.getExpensesIQD());
    setCashCloses(ClinicOperationsService.getCashCloses());
    setActiveStaff(ClinicOperationsService.getActiveStaff());
    setHomeVisitsEnabled(ClinicOperationsService.isHomeVisitsEnabled());
    setPracticeLocationsEnabled(ClinicOperationsService.isPracticeLocationsEnabled());
    setInstallmentPlansEnabled(ClinicOperationsService.isInstallmentPlansEnabled());
    setRecurringExpensesEnabled(ClinicOperationsService.isRecurringExpensesEnabled());
    setPracticeLocations(ClinicOperationsService.getPracticeLocations());
    setHistoryInvoice((prev) =>
      prev ? nextInvoices.find((i) => i.id === prev.id) || null : null
    );
    setInstallmentBuilderInvoice((prev) =>
      prev ? nextInvoices.find((i) => i.id === prev.id) || null : null
    );
  };

  useEffect(() => {
    reloadFinance();
    const unsubOps = ClinicOperationsService.subscribe(reloadFinance);
    window.addEventListener('physiorecord-demo-updated', reloadFinance);
    window.addEventListener('physiorecord-modules-updated', reloadFinance);
    return () => {
      unsubOps();
      window.removeEventListener('physiorecord-demo-updated', reloadFinance);
      window.removeEventListener('physiorecord-modules-updated', reloadFinance);
    };
  }, []);

  useEffect(() => {
    if (!installmentPlansEnabled && activeTab === 'installments') {
      setActiveTab('invoices');
    }
  }, [installmentPlansEnabled, activeTab]);

  useEffect(() => {
    if (!dek) return;
    void DraftRecoveryService.getDraftAsync<Record<string, any>>(dek, 'invoice', 'new').then(
      (recovered) => {
        if (!recovered) return;
        const p = recovered.payload;
        if (typeof p.invPatientId === 'string') setInvPatientId(p.invPatientId);
        if (p.invType === 'single_session' || p.invType === 'rehab_package' || p.invType === 'evaluation') {
          setInvType(p.invType);
        }
        if (typeof p.invTitle === 'string') setInvTitle(p.invTitle);
        if (typeof p.invLocationId === 'string') setInvLocationId(p.invLocationId);
        if (typeof p.invTravelFeeIQD === 'number') setInvTravelFeeIQD(p.invTravelFeeIQD);
        if (typeof p.invTotalIQD === 'number') setInvTotalIQD(p.invTotalIQD);
        if (typeof p.invDiscountIQD === 'number') setInvDiscountIQD(p.invDiscountIQD);
        if (typeof p.invPaidIQD === 'number') setInvPaidIQD(p.invPaidIQD);
        if (typeof p.invMethod === 'string') setInvMethod(p.invMethod as IraqiPaymentMethod);
        if (typeof p.invCustomMethod === 'string') setInvCustomMethod(p.invCustomMethod);
        if (typeof p.invInstallmentEnabled === 'boolean') {
          setInvInstallmentEnabled(p.invInstallmentEnabled);
        }
        if (typeof p.invInstallmentCount === 'number') {
          setInvInstallmentCount(p.invInstallmentCount);
        }
        if (typeof p.invInstallmentStartDate === 'string') {
          setInvInstallmentStartDate(p.invInstallmentStartDate);
        }
        if (typeof p.invInstallmentIntervalDays === 'number') {
          setInvInstallmentIntervalDays(p.invInstallmentIntervalDays);
        }
        if (typeof p.invNotes === 'string') setInvNotes(p.invNotes);
        setShowNewInvoiceForm(true);
      }
    );
  }, [dek]);

  useEffect(() => {
    if (!dek || !showNewInvoiceForm) return;
    const hasContent = Boolean(
      invPatientId ||
        invTotalIQD > 0 ||
        invTravelFeeIQD > 0 ||
        invDiscountIQD > 0 ||
        invPaidIQD > 0 ||
        invCustomMethod.trim() ||
        invNotes.trim() ||
        invInstallmentEnabled
    );
    if (!hasContent) return;
    const matched = activePatients.find((p) => p.id === invPatientId);
    const draftInput = {
      draftType: 'invoice' as const,
      entityId: 'new',
      patientId: invPatientId || undefined,
      patientName: matched ? matched.data.fullNameAr || matched.data.fullName : undefined,
      summaryLabel: invTitle || undefined,
      payload: {
        invPatientId,
        invType,
        invTitle,
        invLocationId,
        invTravelFeeIQD,
        invTotalIQD,
        invDiscountIQD,
        invPaidIQD,
        invMethod,
        invCustomMethod,
        invInstallmentEnabled,
        invInstallmentCount,
        invInstallmentStartDate,
        invInstallmentIntervalDays,
        invNotes,
      },
    };
    DraftRecoveryService.scheduleDebouncedDraftSave(dek, draftInput);
    return DraftRecoveryService.registerDraftFlushSource('invoice:new', () => draftInput);
  }, [
    dek,
    showNewInvoiceForm,
    activePatients,
    invPatientId,
    invType,
    invTitle,
    invLocationId,
    invTravelFeeIQD,
    invTotalIQD,
    invDiscountIQD,
    invPaidIQD,
    invMethod,
    invCustomMethod,
    invInstallmentEnabled,
    invInstallmentCount,
    invInstallmentStartDate,
    invInstallmentIntervalDays,
    invNotes,
  ]);

  useEffect(() => {
    if (!undoItem) return;
    const timer = setTimeout(() => setUndoItem(null), 8000);
    return () => clearTimeout(timer);
  }, [undoItem]);

  useEffect(() => {
    const hasModal =
      showNewInvoiceForm ||
      showNewExpenseForm ||
      Boolean(pkgAdjustInvoice) ||
      Boolean(voidTargetInvoice) ||
      Boolean(historyInvoice);
    if (!hasModal) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (historyInvoice) {
        setHistoryInvoice(null);
        return;
      }
      if (voidTargetInvoice) {
        setVoidTargetInvoice(null);
        return;
      }
      if (pkgAdjustInvoice) {
        setPkgAdjustInvoice(null);
        return;
      }
      if (showNewExpenseForm) {
        setShowNewExpenseForm(false);
        return;
      }
      if (showNewInvoiceForm) {
        setShowNewInvoiceForm(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [
    showNewInvoiceForm,
    showNewExpenseForm,
    pkgAdjustInvoice,
    voidTargetInvoice,
    historyInvoice,
  ]);

  const handleUndoDelete = () => {
    if (!undoItem) return;
    setExpenses(ClinicOperationsService.restoreExpenseIQD(undoItem.data));
    setUndoItem(null);
  };

  const handleInvoicePresetChange = (type: FinancialInvoiceIQD['invoiceType']) => {
    setInvType(type);
    setInvTravelFeeIQD(0);
    setInvTotalIQD(0);
    setInvDiscountIQD(0);
    setInvPaidIQD(0);
    setInvPayCurrency(currency.code);
    setInvPayOrigAmount('');
    setInvPayFxRate('');
    setInvInstallmentEnabled(false);
    setInvInstallmentCount(2);
    setInvInstallmentStartDate(localDate());
    setInvInstallmentIntervalDays(30);
    const defaultLoc = practiceLocations.find(
      (loc) => loc.isDefault && loc.isActive !== false
    );
    setInvLocationId(defaultLoc?.id || '');
    setInvError(null);
    if (type === 'single_session') {
      setInvPackageSessions('');
      setInvTitle(bi('جلسة مفردة', 'Single Session', 'دانیشتنی تاک'));
    } else if (type === 'rehab_package') {
      setInvPackageSessions('');
      setInvTitle(bi('كورس', 'Course', 'کۆرس'));
    } else {
      setInvPackageSessions('');
      setInvTitle(bi('فحص', 'Evaluation', 'پشکنین'));
    }
  };

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    setInvError(null);
    const matched = activePatients.find((p) => p.id === invPatientId);
    if (!matched) return;

    const finalNotes =
      invMethod === 'other' && invCustomMethod.trim()
        ? `[وسيلة الدفع: ${invCustomMethod.trim()}] ${invNotes}`.trim()
        : invNotes;

    const isFxPayment = invPayCurrency !== currency.code;
    const origNum = Number(invPayOrigAmount || 0);
    const fxRateNum = Number(invPayFxRate || 0);
    const effectiveTravelFee = homeVisitsEnabled
      ? Math.max(0, invTravelFeeIQD)
      : 0;
    const effectiveTotalIQD = Math.max(0, invTotalIQD) + effectiveTravelFee;
    const effectiveNetDue = Math.max(0, effectiveTotalIQD - Math.max(0, invDiscountIQD));
    const effectiveInitialPaid = isFxPayment
      ? origNum > 0 && fxRateNum > 0
        ? Math.round(origNum * fxRateNum)
        : 0
      : Math.max(0, invPaidIQD);

    const installmentPlan =
      installmentPlansEnabled &&
      invInstallmentEnabled &&
      effectiveNetDue > 0
        ? generateEqualInstallmentSchedule({
            netAmountIQD: effectiveNetDue,
            paidAmountIQD: Math.min(effectiveNetDue, effectiveInitialPaid),
            count: invInstallmentCount,
            firstDueDate: invInstallmentStartDate,
            intervalDays: invInstallmentIntervalDays,
            isAr: language !== 'en',
          })
        : undefined;

    try {
      ClinicOperationsService.createInvoiceIQD({
        patientId: matched.id,
        patientName: matched.data.fullNameAr || matched.data.fullName,
        locationId:
          practiceLocationsEnabled && invLocationId ? invLocationId : undefined,
        travelFeeIQD: effectiveTravelFee > 0 ? effectiveTravelFee : undefined,
        invoiceType: invType,
        titleAr:
          invTitle ||
          (invType === 'rehab_package' ? 'كورس' : invType === 'evaluation' ? 'فحص' : 'جلسة مفردة'),
        titleEn:
          invTitle ||
          (invType === 'rehab_package'
            ? 'Course'
            : invType === 'evaluation'
              ? 'Evaluation'
              : 'Single Session'),
        totalAmountIQD: effectiveTotalIQD,
        discountIQD: invDiscountIQD,
        initialPaidIQD: isFxPayment ? 0 : invPaidIQD,
        paymentMethod: invMethod,
        currencyCode: currency.code,
        paymentCurrencyCode: invPayCurrency,
        ...(isFxPayment && origNum > 0
          ? { originalPaidAmount: origNum, exchangeRateToPrimary: fxRateNum }
          : {}),
        packageTotalSessions:
          invType === 'rehab_package' && typeof invPackageSessions === 'number' && invPackageSessions > 0
            ? invPackageSessions
            : undefined,
        installmentPlan,
        notes: finalNotes,
        isDemo: isDemoPatient(matched),
      });

      setInvoices(ClinicOperationsService.getInvoicesIQD());
      setShowNewInvoiceForm(false);
      void DraftRecoveryService.deleteDraftAsync('invoice', 'new').then(() =>
        refreshRecoveredDrafts()
      );
      setInvPatientId('');
      setInvLocationId('');
      setInvTravelFeeIQD(0);
      setInvInstallmentEnabled(false);
      setInvInstallmentCount(2);
      setInvInstallmentStartDate(localDate());
      setInvInstallmentIntervalDays(30);
      setInvCustomMethod('');
      setInvPayOrigAmount('');
      setInvPayFxRate('');
      setInvNotes('');
    } catch (err) {
      setInvError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCollectPartialPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForPayment) return;
    setPaymentError(null);

    const finalPaymentNote =
      paymentMethod === 'other' && paymentCustomMethod.trim()
        ? `[وسيلة الدفع: ${paymentCustomMethod.trim()}] ${paymentNote}`.trim()
        : paymentNote;

    const isFx = paymentCurrency !== currency.code;
    const origNum = Number(paymentOrigAmount || 0);
    const rateNum = Number(paymentFxRate || 0);

    try {
      const updated = ClinicOperationsService.recordPaymentOnInvoiceIQD(
        selectedInvoiceForPayment.id,
        isFx ? 0 : paymentAmountIQD,
        paymentMethod,
        finalPaymentNote,
        isFx
          ? {
              primaryCurrencyCode: currency.code,
              paymentCurrencyCode: paymentCurrency,
              originalAmount: origNum,
              exchangeRateToPrimary: rateNum,
            }
          : { primaryCurrencyCode: currency.code }
      );
      setInvoices(updated);
      setSelectedInvoiceForPayment(null);
      setPaymentCustomMethod('');
      setPaymentOrigAmount('');
      setPaymentFxRate('');
      setPaymentNote('');
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim() || expAmountIQD <= 0) return;
    const matchedPatient = expPatientId
      ? activePatients.find((p) => p.id === expPatientId)
      : undefined;

    const updated = ClinicOperationsService.addExpenseIQD({
      date: localDate(),
      category: expCategory,
      customCategoryLabel:
        expCategory === 'marketing_other' && expCustomCategoryLabel.trim()
          ? expCustomCategoryLabel.trim()
          : undefined,
      titleAr: expTitle.trim(),
      titleEn: expTitle.trim(),
      amountIQD: expAmountIQD,
      paidBy: activeStaff.nameAr,
      notes: expNotes,
      patientId: matchedPatient?.id,
      patientName: matchedPatient
        ? matchedPatient.data.fullNameAr || matchedPatient.data.fullName
        : undefined,
      isDemo: matchedPatient ? isDemoPatient(matchedPatient) : false,
    });
    setExpenses(updated);
    setShowNewExpenseForm(false);
    setExpPatientId('');
    setExpCustomCategoryLabel('');
    setExpTitle('');
    setExpAmountIQD(0);
    setExpNotes('');
  };

  const activeInvoices = invoices.filter((i) => i.status !== 'void');
  const totalBilledIQD = activeInvoices.reduce((s, i) => s + i.netAmountIQD, 0);
  const totalCollectedIQD = activeInvoices.reduce((s, i) => s + i.paidAmountIQD, 0);
  const totalDebtIQD = activeInvoices.reduce((s, i) => s + i.balanceDueIQD, 0);

  const displayedInvoices = useMemo(
    () =>
      activeTab === 'debts'
        ? invoices.filter((i) => i.status !== 'void' && i.balanceDueIQD > 0)
        : invoices,
    [activeTab, invoices]
  );

  const patientInvoiceGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        patientId: string;
        patientName: string;
        isDemo: boolean;
        invoices: FinancialInvoiceIQD[];
        totalNetIQD: number;
        totalPaidIQD: number;
        totalDueIQD: number;
        activeCount: number;
        voidCount: number;
        latestDate: string;
        activePackage: FinancialInvoiceIQD | null;
      }
    >();

    for (const inv of displayedInvoices) {
      const key = inv.patientId || inv.patientName;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          patientId: inv.patientId,
          patientName: inv.patientName,
          isDemo: Boolean(inv.isDemo),
          invoices: [],
          totalNetIQD: 0,
          totalPaidIQD: 0,
          totalDueIQD: 0,
          activeCount: 0,
          voidCount: 0,
          latestDate: inv.date,
          activePackage: null,
        };
        groups.set(key, g);
      }
      g.invoices.push(inv);
      if (inv.isDemo) g.isDemo = true;
      if (inv.date > g.latestDate) g.latestDate = inv.date;
      if (inv.status === 'void') {
        g.voidCount += 1;
      } else {
        g.activeCount += 1;
        g.totalNetIQD += inv.netAmountIQD;
        g.totalPaidIQD += inv.paidAmountIQD;
        g.totalDueIQD += inv.balanceDueIQD;
        if (!g.activePackage && inv.packageTotalSessions && inv.packageTotalSessions > 0) {
          g.activePackage = inv;
        }
      }
    }

    return Array.from(groups.values());
  }, [displayedInvoices]);

  const selectedPatientGroup = useMemo(
    () =>
      selectedPatientLedgerKey
        ? patientInvoiceGroups.find((g) => g.key === selectedPatientLedgerKey) || null
        : null,
    [patientInvoiceGroups, selectedPatientLedgerKey]
  );
  const totalExpensesIQD = expenses.reduce((s, e) => s + e.amountIQD, 0);
  const netCashFlowIQD = totalCollectedIQD - totalExpensesIQD;

  const agingSummary = useMemo(
    () => buildInstallmentAgingSummary(invoices),
    [invoices]
  );

  const locationNameById = useMemo(() => {
    const map = new Map<string, PracticeLocationItem>();
    for (const loc of practiceLocations) {
      map.set(loc.id, loc);
    }
    return map;
  }, [practiceLocations]);

  const activePracticeLocations = useMemo(
    () => practiceLocations.filter((loc) => loc.isActive !== false),
    [practiceLocations]
  );

  const locationBreakdown = useMemo(() => {
    const scopedInvoices =
      locationSummaryScope === 'month'
        ? invoices.filter((inv) => (inv.date || '').startsWith(monthlyMonthKey))
        : invoices;
    return summarizeInvoicesByLocation(scopedInvoices, practiceLocations).filter(
      (item) => item.isActive || item.invoiceCount > 0
    );
  }, [invoices, practiceLocations, locationSummaryScope, monthlyMonthKey]);

  const monthlySummary = ClinicOperationsService.getMonthlyFinanceSummary(
    monthlyMonthKey,
    currency.code
  );
  const zDraft = ClinicOperationsService.buildDailyCashZReportDraft(
    zReportDate,
    currency.code,
    zCountedCashInput.trim() === '' ? undefined : Number(zCountedCashInput),
    zNotes
  );

  const handleCloseZReport = async () => {
    setZSaving(true);
    try {
      const closed = await ClinicOperationsService.closeDailyCashZReportAsync({
        dateKey: zReportDate,
        primaryCurrencyCode: currency.code,
        countedCashActual: zCountedCashInput.trim() === '' ? undefined : Number(zCountedCashInput),
        notes: zNotes,
      });
      setCashCloses(ClinicOperationsService.getCashCloses());
      setZCountedCashInput('');
      setZNotes('');
      setPrintDoc({ type: 'z_report', zReport: closed });
    } finally {
      setZSaving(false);
    }
  };

  const handleVoidInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTargetInvoice) return;
    setVoidError(null);
    try {
      const updated = ClinicOperationsService.voidInvoiceWithReasonIQD(
        voidTargetInvoice.id,
        voidReason
      );
      setInvoices(updated);
      setVoidTargetInvoice(null);
      setVoidReason('');
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleReversePaymentSubmit = (invoiceId: string, paymentId: string) => {
    setReversePayError(null);
    try {
      const updated = ClinicOperationsService.reversePaymentIQD(
        invoiceId,
        paymentId,
        reversePayReason
      );
      setInvoices(updated);
      setReversingPayId(null);
      setReversePayReason('');
    } catch (err) {
      setReversePayError(err instanceof Error ? err.message : String(err));
    }
  };

  const paymentMethodLabels: Record<IraqiPaymentMethod, { ar: string; en: string; ckb: string }> = {
    cash: { ar: 'نقداً', en: 'Cash', ckb: 'نەقد' },
    zain_cash: { ar: 'محفظة زين كاش', en: 'ZainCash Wallet', ckb: 'جزدانی ZainCash' },
    qi_card: { ar: 'كي كارد / ماستر كارد', en: 'QiCard / POS', ckb: 'QiCard / ماستەرکارد' },
    other: { ar: 'أخرى (تحديد يدوي)', en: 'Other (Custom)', ckb: 'هیتر (دیاریکردنی دەستی)' },
  };

  const EXPENSE_CATEGORY_CKB: Record<string, string> = {
    medical_consumables: 'پێداویستی پزیشکی و بەکاربراو',
    equipment_maintenance: 'چاککردنەوە و کڕینی ئامێری چارەسەری سروشتی',
    electricity_generator: 'کارەبا و ئابوونەی موەلیدە',
    rent: 'کرێی کلینیک',
    staff_salaries: 'مووچە و پاداشتی ستاف',
    marketing_other: 'خەرجیی کارگێڕی تر',
  };

  return (
    <div
      className="max-w-[85rem] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Page Header: Title + max 2 actions */}
      <div className="pr-page-header">
        <div className="space-y-1 min-w-0">
          <span className="pr-eyebrow">
            <Wallet className="size-3.5" />
            {bi('الإدارة المالية', 'Finance', 'کارگێڕی دارایی')}
          </span>
          <h1 className="pr-page-title">
            {bi(
              `السجل المالي وحسابات العيادة (${currency.symbolAr})`,
              `Clinic Financial Ledger (${currency.code})`,
              `تۆماری دارایی و هەژمارەکانی کلینیک (${currency.symbolAr})`
            )}
          </h1>
          <p className="pr-page-subtitle">
            {bi(
              'الفواتير، الكورسات، الديون والتحصيل — كله محسوب على هذا الجهاز.',
              'Invoices, packages, debt and collection — calculated on this device.',
              'پسوولە، کۆرس، قەرز و وەرگرتن — هەمووی لەم ئامێرەدا هەژمار دەکرێت.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setExpCategory('medical_consumables');
              setExpCustomCategoryLabel('');
              setExpPatientId('');
              setExpTitle('');
              setExpAmountIQD(0);
              setExpNotes('');
              setShowNewExpenseForm(true);
              setShowNewInvoiceForm(false);
            }}
            className="pr-btn pr-btn-ghost"
          >
            <TrendingDown className="size-3.5 text-rose-700 dark:text-rose-400" />
            <span>{bi('+ تسجيل مصروف', '+ Log Expense', '+ تۆمارکردنی خەرجی')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleInvoicePresetChange('single_session');
              setShowNewInvoiceForm(true);
              setShowNewExpenseForm(false);
            }}
            className="pr-btn pr-btn-primary"
          >
            <Plus className="size-4" />
            <span>
              {bi(
                '+ إصدار فاتورة / كورس',
                '+ New Invoice / Package',
                '+ دەرکردنی پسوولە / کۆرس'
              )}
            </span>
          </button>
        </div>
      </div>

      {/* 8-Second Undo Toast (Expenses only — Invoices use Credit Note Void per 4.1) */}
      {undoItem && (
        <div className="p-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between gap-3 text-xs shadow-lg">
          <span>
            {bi(
              `تم حذف المصروف (${undoItem.data.titleAr}).`,
              `Deleted expense (${undoItem.data.titleEn}).`,
              `خەرجیی (${undoItem.data.titleAr}) سڕایەوە.`
            )}
          </span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>{bi('تراجع (8 ثوانٍ)', 'Undo (8s)', 'گەڕاندنەوە (8 چرکە)')}</span>
          </button>
        </div>
      )}

      {/* 4-Column Iraqi Dinar Financial KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="pr-kpi p-4 sm:p-5">
          <div className="min-w-0">
            <span className="pr-kpi-label block">
              {bi(
                'إجمالي الفواتير الصادرة (الصافي)',
                `Total Net Billed (${currency.code})`,
                'کۆی پسوولە دەرچووەکان (سافی)'
              )}
            </span>
            <p className="pr-kpi-value mt-1 break-words">
              <Money amount={totalBilledIQD} />
            </p>
            <p className="text-xs text-muted-foreground-1 mt-1 tabular-nums">
              <Num value={activeInvoices.length} />{' '}
              {bi('فاتورة سارية', 'active invoices', 'پسوولەی کارا')}
            </p>
          </div>
          <div className="size-10 rounded-xl bg-surface/65 text-primary flex items-center justify-center shrink-0">
            <Receipt className="size-5" />
          </div>
        </div>

        <div className="pr-kpi p-4 sm:p-5">
          <div className="min-w-0">
            <span className="pr-kpi-label block">
              {bi(
                'المقبوضات الفعلية بالصندوق',
                `Total Cash Collected (${currency.code})`,
                'کۆی پارەی وەرگیراو لە سندووق'
              )}
            </span>
            <p className="pr-kpi-value mt-1 break-words text-emerald-700 dark:text-emerald-300">
              <Money amount={totalCollectedIQD} colorize={false} />
            </p>
            <p className="text-xs text-muted-foreground-1 mt-1 leading-snug">
              {bi(
                'نقداً + زين كاش + كي كارد',
                'Cash + ZainCash + QiCard',
                'نەقد + زەین کاش + کی کارد'
              )}
            </p>
          </div>
          <div className="size-10 rounded-xl bg-surface/65 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
            <CheckCircle2 className="size-5" />
          </div>
        </div>

        <div className="pr-kpi p-4 sm:p-5">
          <div className="min-w-0">
            <span className="pr-kpi-label block">
              {bi(
                'إجمالي ديون المرضى المتبقية',
                `Outstanding Debt (${currency.code})`,
                'کۆی قەرزی ماوەی نەخۆشەکان'
              )}
            </span>
            <p
              className={`pr-kpi-value mt-1 break-words ${
                totalDebtIQD > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'
              }`}
            >
              <Money amount={totalDebtIQD} colorize={false} />
            </p>
            <p className="text-xs text-muted-foreground-1 mt-1 tabular-nums leading-snug">
              <Num value={activeInvoices.filter((i) => i.balanceDueIQD > 0).length} />{' '}
              {bi(
                'حسابات بذمتها مبالغ متبقية',
                'accounts with balance due',
                'هەژمارە قەرزارەکان'
              )}
            </p>
          </div>
          <div className="size-10 rounded-xl bg-surface/65 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <AlertCircle className="size-5" />
          </div>
        </div>

        <div className="pr-kpi p-4 sm:p-5">
          <div className="min-w-0">
            <span className="pr-kpi-label block">
              {bi(
                'صافي التدفق النقدي (بعد المصاريف)',
                `Net Cash Flow (${currency.code})`,
                'سافی ڕەوتی نەقد (دوای خەرجییەکان)'
              )}
            </span>
            <p
              className={`pr-kpi-value mt-1 break-words ${
                netCashFlowIQD < 0
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-foreground'
              }`}
            >
              <Money amount={netCashFlowIQD} />
            </p>
            <p className="text-xs text-rose-700 dark:text-rose-400 mt-1 tabular-nums leading-snug">
              {bi('المصاريف: ', 'Expenses: ', 'خەرجییەکان: ')}
              <Money amount={totalExpensesIQD} colorize={false} />
            </p>
          </div>
          <div className="size-10 rounded-xl bg-surface/65 text-primary flex items-center justify-center shrink-0">
            <TrendingUp className="size-5" />
          </div>
        </div>
      </div>

      {/* Right-Side Sheet: New Invoice / Rehab Package Form */}
      <DrawerDialog
        isOpen={showNewInvoiceForm}
        onOpenChange={(open) => {
          if (!open) setShowNewInvoiceForm(false);
        }}
        side="end"
        dir={isRtl ? 'rtl' : 'ltr'}
        maxWidthClassName="max-w-md"
        className="bg-card"
        ariaLabel={bi(
          'إصدار فاتورة علاج طبيعي أو باقة (IQD)',
          'Create IQD Invoice or Package',
          'دەرکردنی پسوولەی چارەسەری سروشتی یان پاکێج (IQD)'
        )}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        bodyClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <form
          onSubmit={handleCreateInvoice}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-card-divider flex items-center justify-between bg-muted/40 shrink-0">
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'إصدار فاتورة علاج طبيعي أو باقة (IQD)',
                'Create IQD Invoice or Package',
                'دەرکردنی پسوولەی چارەسەری سروشتی یان پاکێج (IQD)'
              )}
            </h2>
            <button
              type="button"
              onClick={() => setShowNewInvoiceForm(false)}
              className="min-h-[36px] min-w-[36px] p-1.5 rounded-lg text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center cursor-pointer"
              aria-label={bi('إغلاق', 'Close', 'داخستن')}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <span className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('نوع الفاتورة:', 'Invoice Type:', 'جۆری پسوولە:')}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'single_session', ar: 'جلسة مفردة', en: 'Single Session', ckb: 'دانیشتنی تاک' },
                      { id: 'rehab_package', ar: 'كورس', en: 'Course', ckb: 'کۆرس' },
                      { id: 'evaluation', ar: 'فحص', en: 'Evaluation', ckb: 'پشکنین' },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleInvoicePresetChange(preset.id)}
                      className={`min-h-[36px] py-2 px-3 rounded-xl text-xs font-semibold text-center transition-all cursor-pointer ${
                        invType === preset.id
                          ? 'bg-primary text-primary-foreground shadow-2xs font-bold'
                          : 'bg-surface/65 text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                      }`}
                    >
                      {bi(preset.ar, preset.en, preset.ckb)}
                    </button>
                  ))}
                </div>
              </div>

              {invType === 'rehab_package' && (
                <div>
                  <label htmlFor="fin-inv-pkg-sessions" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('عدد جلسات الكورس:', 'Course Sessions Count:', 'ژمارەی دانیشتنەکانی کۆرس:')}
                  </label>
                  <input
                    id="fin-inv-pkg-sessions"
                    type="number"
                    min="1"
                    max="100"
                    dir="ltr"
                    value={invPackageSessions}
                    onChange={(e) =>
                      setInvPackageSessions(e.target.value ? parseInt(e.target.value, 10) : '')
                    }
                    placeholder={bi(
                      'أدخل عدد الجلسات (مثال: 10)',
                      'e.g. 10',
                      'ژمارەی دانیشتنەکان بنووسە (نموونە: 10)'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground tabular-nums focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              <div>
                <label htmlFor="fin-inv-patient" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi(
                    'اختيار مريض مسجل (إلزامي):',
                    'Select Registered Patient (Required):',
                    'هەڵبژاردنی نەخۆشی تۆمارکراو (پێویستە):'
                  )}
                </label>
                <select
                  id="fin-inv-patient"
                  required
                  value={invPatientId}
                  onChange={(e) => setInvPatientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="">
                    {bi(
                      '-- اختر مريضاً مسجلاً --',
                      '-- Select registered patient --',
                      '-- نەخۆشێکی تۆمارکراو هەڵبژێرە --'
                    )}
                  </option>
                  {activePatients.map((p, idx) => (
                    <option key={p.id} value={p.id}>
                      {p.data.fullNameAr || p.data.fullName} ({getPatientMrn(p, idx)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="fin-inv-title" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('بيان الخدمة العلاجية:', 'Service Description:', 'بەیانی خزمەتگوزاریی چارەسەر:')}
                </label>
                <input
                  id="fin-inv-title"
                  type="text"
                  value={invTitle}
                  onChange={(e) => setInvTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              {practiceLocationsEnabled && activePracticeLocations.length > 0 && (
                <div>
                  <label htmlFor="fin-inv-location" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi(
                      'موقع تقديم الخدمة (اختياري):',
                      'Practice Location (Optional):',
                      'شوێنی پێشکەشکردنی خزمەتگوزاری (ئارەزوومەندانە):'
                    )}
                  </label>
                  <select
                    id="fin-inv-location"
                    value={invLocationId}
                    onChange={(e) => setInvLocationId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="">
                      {bi('-- غير محدد / عام --', '-- Unassigned / General --', '-- دیارینەکراو / گشتی --')}
                    </option>
                    {activePracticeLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {bi(loc.nameAr, loc.nameEn || loc.nameAr)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fin-inv-total" className="text-xs font-semibold text-foreground block mb-1.5">
                    {homeVisitsEnabled
                      ? bi('رسوم الخدمة العلاجية:', 'Service Amount:', 'کرێی خزمەتگوزاریی چارەسەر:')
                      : bi('المبلغ الكلي (د.ع):', 'Total Amount (IQD):', 'کۆی بڕی پارە (د.ع):')}
                  </label>
                  <MoneyInput
                    id="fin-inv-total"
                    ariaLabel={
                      homeVisitsEnabled
                        ? bi('رسوم الخدمة العلاجية', 'Service Amount', 'کرێی خزمەتگوزاریی چارەسەر')
                        : bi('المبلغ الكلي', 'Total Amount', 'کۆی بڕی پارە')
                    }
                    value={invTotalIQD}
                    onChange={setInvTotalIQD}
                  />
                </div>

                <div>
                  <label htmlFor="fin-inv-discount" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('الخصم الممنوح (د.ع):', 'Discount (IQD):', 'داشکاندن (د.ع):')}
                  </label>
                  <MoneyInput
                    id="fin-inv-discount"
                    ariaLabel={bi('الخصم الممنوح', 'Discount', 'داشکاندن')}
                    value={invDiscountIQD}
                    onChange={setInvDiscountIQD}
                  />
                </div>
              </div>

              {homeVisitsEnabled && (
                <div>
                  <label htmlFor="fin-inv-travel" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi(
                      'أجرة التنقل / الزيارة المنزلية (اختياري):',
                      'Home Visit Travel Fee (Optional):',
                      'کرێی هاتوچۆ / سەردانی ماڵەوە (ئارەزوومەندانە):'
                    )}
                  </label>
                  <MoneyInput
                    id="fin-inv-travel"
                    ariaLabel={bi('أجرة التنقل', 'Home Visit Travel Fee', 'کرێی هاتوچۆ')}
                    value={invTravelFeeIQD}
                    onChange={setInvTravelFeeIQD}
                  />
                  <p className="text-xs text-muted-foreground-1 mt-1">
                    {bi(
                      'تترك فارغة افتراضياً وتُضاف إلى إجمالي الفاتورة عند الإدخال.',
                      'Blank by default; added to invoice total when entered.',
                      'بە شێوەی بنەڕەتی بەتاڵە و لە کاتی نووسیندا بۆ کۆی پسوولە زیاد دەکرێت.'
                    )}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="fin-inv-pay-currency" className="text-xs font-semibold text-foreground block mb-1.5">
                      {bi('عملة الدفعة المستلمة:', 'Payment Currency:', 'دراوی پارەدانی وەرگیراو:')}
                    </label>
                    <select
                      id="fin-inv-pay-currency"
                      value={invPayCurrency}
                      onChange={(e) => {
                        setInvPayCurrency(e.target.value);
                        setInvPayFxRate('');
                        setInvError(null);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value={currency.code}>
                        {currency.code} ({bi(currency.symbolAr, currency.symbolEn)})
                      </option>
                      {WORLD_CURRENCIES.filter((c) => c.code !== currency.code).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} ({bi(c.nameAr, c.nameEn)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="fin-inv-pay-method" className="text-xs font-semibold text-foreground block mb-1.5">
                      {bi('طريقة الدفع:', 'Payment Method:', 'شێوازی پارەدان:')}
                    </label>
                    <select
                      id="fin-inv-pay-method"
                      value={invMethod}
                      onChange={(e) => setInvMethod(e.target.value as IraqiPaymentMethod)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                    >
                      {Object.entries(paymentMethodLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {bi(v.ar, v.en, v.ckb)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {invPayCurrency === currency.code ? (
                  <div>
                    <label htmlFor="fin-inv-paid" className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 block mb-1.5">
                      {bi(
                        `المبلغ المقبوض الآن (${currency.symbolAr}):`,
                        `Paid Today (${currency.code}):`,
                        `بڕی وەرگیراوی ئێستا (${currency.symbolAr}):`
                      )}
                    </label>
                    <MoneyInput
                      id="fin-inv-paid"
                      ariaLabel={bi('المبلغ المقبوض الآن', 'Paid Today', 'بڕی وەرگیراوی ئێستا')}
                      value={invPaidIQD}
                      onChange={setInvPaidIQD}
                      className="w-full py-2 text-xs rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-foreground font-bold tabular-nums focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/25">
                    <div>
                      <label htmlFor="fin-inv-fx-amt" className="text-xs font-semibold text-foreground block mb-1">
                        {bi(
                          `المبلغ بعملة (${invPayCurrency}):`,
                          `Paid (${invPayCurrency}):`,
                          `بڕ بە دراوی (${invPayCurrency}):`
                        )}
                      </label>
                      <input
                        id="fin-inv-fx-amt"
                        type="number"
                        step="any"
                        min={0}
                        value={invPayOrigAmount}
                        onChange={(e) => setInvPayOrigAmount(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-mono font-bold tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor="fin-inv-fx-rate" className="text-xs font-semibold text-foreground block mb-1">
                        {bi(
                          `سعر الصرف (1 ${invPayCurrency} = ? ${currency.code}):`,
                          `FX Rate (1 ${invPayCurrency} = ? ${currency.code}):`,
                          `نرخی گۆڕینەوە (1 ${invPayCurrency} = ? ${currency.code}):`
                        )}
                      </label>
                      <input
                        id="fin-inv-fx-rate"
                        type="number"
                        step="any"
                        min={0}
                        value={invPayFxRate}
                        onChange={(e) => setInvPayFxRate(e.target.value)}
                        placeholder={invPayCurrency === 'USD' && currency.code === 'IQD' ? '1500' : '1'}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-mono font-bold tabular-nums"
                      />
                    </div>
                  </div>
                )}

                {invError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                    {invError}
                  </div>
                )}
              </div>

              {invMethod === 'other' && (
                <div>
                  <label htmlFor="fin-inv-custom-method" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi(
                      'أدخل وسيلة الدفع الأخرى:',
                      'Enter Custom Payment Method:',
                      'شێوازی پارەدانی تر بنووسە:'
                    )}
                  </label>
                  <input
                    id="fin-inv-custom-method"
                    type="text"
                    value={invCustomMethod}
                    onChange={(e) => setInvCustomMethod(e.target.value)}
                    placeholder={bi(
                      'مثال: شيك مصرفي، تحويل ويسترن يونيون، إلخ',
                      'e.g. Bank Check, Wire, etc.',
                      'نموونە: چەکی بانکی، حەواڵە، هتد'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {installmentPlansEnabled && (() => {
                const effPaidPreview =
                  invPayCurrency === currency.code
                    ? invPaidIQD
                    : Math.round(Number(invPayOrigAmount || 0) * Number(invPayFxRate || 0));
                const effTravelPreview = homeVisitsEnabled
                  ? Math.max(0, invTravelFeeIQD)
                  : 0;
                const effTotalPreview = Math.max(0, invTotalIQD) + effTravelPreview;
                const netDuePreview = Math.max(
                  0,
                  effTotalPreview - Math.max(0, invDiscountIQD)
                );
                const previewSchedule =
                  invInstallmentEnabled && netDuePreview > 0
                    ? generateEqualInstallmentSchedule({
                        netAmountIQD: netDuePreview,
                        paidAmountIQD: Math.min(netDuePreview, Math.max(0, effPaidPreview)),
                        count: invInstallmentCount,
                        firstDueDate: invInstallmentStartDate,
                        intervalDays: invInstallmentIntervalDays,
                        isAr: language !== 'en',
                      })
                    : [];

                return (
                  <div className="p-3.5 rounded-xl bg-surface border border-line-2 space-y-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={invInstallmentEnabled}
                        onChange={(e) => setInvInstallmentEnabled(e.target.checked)}
                        className="rounded border-layer-line text-primary focus:ring-primary"
                      />
                      <CalendarClock className="size-4 text-primary" />
                      <span>
                        {bi(
                          'تفعيل خطة الأقساط لهذه الفاتورة (اختياري)',
                          'Enable Installment Plan (Optional)',
                          'چالاککردنی پلانی قیست بۆ ئەم پسوولەیە (ئارەزوومەندانە)'
                        )}
                      </span>
                    </label>

                    {invInstallmentEnabled && (
                      <div className="space-y-3 pt-1 border-t border-card-divider">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label htmlFor="fin-inv-inst-count" className="text-xs font-semibold text-foreground block mb-1">
                              {bi('عدد الأقساط:', 'Installments:', 'ژمارەی قیستەکان:')}
                            </label>
                            <select
                              id="fin-inv-inst-count"
                              value={invInstallmentCount}
                              onChange={(e) =>
                                setInvInstallmentCount(Number(e.target.value))
                              }
                              className="w-full px-2.5 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                            >
                              {Array.from({ length: 11 }, (_, idx) => idx + 2).map(
                                (num) => (
                                  <option key={num} value={num}>
                                    {num}
                                  </option>
                                )
                              )}
                            </select>
                          </div>

                          <div>
                            <label htmlFor="fin-inv-inst-interval" className="text-xs font-semibold text-foreground block mb-1">
                              {bi('الفاصل الزمني:', 'Interval:', 'ماوەی نێوان قیستەکان:')}
                            </label>
                            <select
                              id="fin-inv-inst-interval"
                              value={invInstallmentIntervalDays}
                              onChange={(e) =>
                                setInvInstallmentIntervalDays(Number(e.target.value))
                              }
                              className="w-full px-2.5 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                            >
                              <option value={7}>
                                {bi('كل 7 أيام', 'Every 7 days', 'هەموو 7 ڕۆژ جارێک')}
                              </option>
                              <option value={14}>
                                {bi('كل 14 يوماً', 'Every 14 days', 'هەموو 14 ڕۆژ جارێک')}
                              </option>
                              <option value={30}>
                                {bi('كل 30 يوماً', 'Every 30 days', 'هەموو 30 ڕۆژ جارێک')}
                              </option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="fin-inv-inst-start" className="text-xs font-semibold text-foreground block mb-1">
                            {bi(
                              'تاريخ استحقاق القسط الأول:',
                              'First Due Date:',
                              'بەرواری گەیشتنی قیستی یەکەم:'
                            )}
                          </label>
                          <DatePickerInput
                            id="fin-inv-inst-start"
                            ariaLabel={bi(
                              'تاريخ استحقاق القسط الأول',
                              'First Due Date',
                              'بەرواری گەیشتنی قیستی یەکەم'
                            )}
                            value={invInstallmentStartDate}
                            onChange={setInvInstallmentStartDate}
                          />
                        </div>

                        {previewSchedule.length > 0 ? (
                          <div className="space-y-1 text-xs bg-card border border-line-2 rounded-lg p-2.5">
                            {previewSchedule.slice(0, 4).map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between gap-2 text-muted-foreground-1 tabular-nums"
                              >
                                <span>
                                  {bi(item.labelAr, item.labelEn)} (
                                  <bdi dir="ltr">{formatDateDDMMYYYY(item.dueDate)}</bdi>)
                                </span>
                                <Money amount={item.amountIQD} colorize={false} />
                              </div>
                            ))}
                            {previewSchedule.length > 4 && (
                              <div className="text-xs text-muted-foreground-1">
                                {bi(
                                  `+ ${previewSchedule.length - 4} أقساط أخرى`,
                                  `+ ${previewSchedule.length - 4} more installments`,
                                  `+ ${previewSchedule.length - 4} قیستی تر`
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground-1">
                            {bi(
                              'أدخل المبلغ الصافي أعلاه لمعاينة جدول الأقساط.',
                              'Enter net amount above to preview installment schedule.',
                              'بڕی سافی سەرەوە بنووسە بۆ بینینی خشتەی قیستەکان.'
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Invoice Summary Block */}
              {(() => {
                const effPaid =
                  invPayCurrency === currency.code
                    ? invPaidIQD
                    : Math.round(Number(invPayOrigAmount || 0) * Number(invPayFxRate || 0));
                const effTravel = homeVisitsEnabled ? Math.max(0, invTravelFeeIQD) : 0;
                const effTotal = Math.max(0, invTotalIQD) + effTravel;
                const netDue = Math.max(0, effTotal - Math.max(0, invDiscountIQD));
                return (
                  <div className="p-3.5 rounded-xl bg-surface border border-line-2 space-y-1.5 text-xs font-mono tabular-nums">
                    {effTravel > 0 && (
                      <>
                        <div className="flex justify-between text-muted-foreground-1">
                          <span>{bi('رسوم الخدمة:', 'Service:', 'کرێی خزمەتگوزاری:')}</span>
                          <Money amount={Math.max(0, invTotalIQD)} />
                        </div>
                        <div className="flex justify-between text-muted-foreground-1">
                          <span>{bi('أجرة التنقل:', 'Travel Fee:', 'کرێی هاتوچۆ:')}</span>
                          <Money amount={effTravel} />
                        </div>
                      </>
                    )}
                    <div className="flex justify-between text-muted-foreground-1">
                      <span>{bi('المبلغ الإجمالي:', 'Total:', 'کۆی گشتی:')}</span>
                      <Money amount={effTotal} />
                    </div>
                    <div className="flex justify-between text-muted-foreground-1">
                      <span>{bi('الخصم:', 'Discount:', 'داشکاندن:')}</span>
                      <Money amount={invDiscountIQD} />
                    </div>
                    <div className="flex justify-between font-bold text-foreground border-t border-card-divider pt-1.5">
                      <span>{bi('الصافي المطلوب:', 'Net Due:', 'بڕی سافی داواکراو:')}</span>
                      <Money amount={netDue} />
                    </div>
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-300">
                      <span>{bi('المدفوع الآن:', 'Paid Now:', 'پارەی دراوی ئێستا:')}</span>
                      <Money amount={Math.min(netDue, Math.max(0, effPaid))} />
                    </div>
                    <div className="flex justify-between font-bold text-amber-700 dark:text-amber-300 border-t border-card-divider pt-1.5">
                      <span>{bi('المتبقي بذمة المريض:', 'Remaining:', 'بڕی ماوە لەسەر نەخۆش:')}</span>
                      <Money amount={Math.max(0, netDue - Math.max(0, effPaid))} />
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 border-t border-card-divider bg-muted/30 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNewInvoiceForm(false);
                  void DraftRecoveryService.deleteDraftAsync('invoice', 'new').then(() =>
                    refreshRecoveredDrafts()
                  );
                }}
                className="min-h-[36px] py-2 px-4 rounded-xl bg-layer border border-layer-line text-layer-foreground text-xs font-semibold cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="submit"
                className="min-h-[36px] py-2 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold shadow-xs cursor-pointer"
              >
                {bi(
                  'إصدار الفاتورة وحفظ الوصل',
                  'Issue Invoice & Receipt',
                  'دەرکردنی پسوولە و پاشەکەوتکردنی وەسڵ'
                )}
              </button>
            </div>
          </form>
      </DrawerDialog>

      {/* Right-Side Sheet: New Clinic Expense Form */}
      <DrawerDialog
        isOpen={showNewExpenseForm}
        onOpenChange={(open) => {
          if (!open) setShowNewExpenseForm(false);
        }}
        side="end"
        dir={isRtl ? 'rtl' : 'ltr'}
        maxWidthClassName="max-w-md"
        className="bg-card"
        ariaLabel={bi(
          'تسجيل مصروف تشغيلي للعيادة (IQD)',
          'Log Clinic Operating Expense (IQD)',
          'تۆمارکردنی خەرجیی کارپێکردنی کلینیک (IQD)'
        )}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        bodyClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <form
          onSubmit={handleAddExpense}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-card-divider flex items-center justify-between bg-muted/40 shrink-0">
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'تسجيل مصروف تشغيلي للعيادة (IQD)',
                'Log Clinic Operating Expense (IQD)',
                'تۆمارکردنی خەرجیی کارپێکردنی کلینیک (IQD)'
              )}
            </h2>
            <button
              type="button"
              onClick={() => setShowNewExpenseForm(false)}
              className="min-h-[36px] min-w-[36px] p-1.5 rounded-lg text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center cursor-pointer"
              aria-label={bi('إغلاق', 'Close', 'داخستن')}
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label htmlFor="fin-exp-cat" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('تبويب المصروف:', 'Category:', 'پۆلی خەرجی:')}
                </label>
                <select
                  id="fin-exp-cat"
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExpenseCategoryIQD)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="medical_consumables">
                    {bi(
                      'مستلزمات طبية واستهلاكية',
                      'Medical Consumables',
                      'پێداویستی پزیشکی و بەکاربراو'
                    )}
                  </option>
                  <option value="equipment_maintenance">
                    {bi(
                      'صيانة وشراء أجهزة علاج طبيعي',
                      'Equipment & Maintenance',
                      'چاککردنەوە و کڕینی ئامێری چارەسەری سروشتی'
                    )}
                  </option>
                  <option value="electricity_generator">
                    {bi(
                      'كهرباء واشتراك المولدة',
                      'Electricity & Generator',
                      'کارەبا و ئابوونەی موەلیدە'
                    )}
                  </option>
                  <option value="rent">
                    {bi('إيجار العيادة', 'Clinic Rent', 'کرێی کلینیک')}
                  </option>
                  <option value="staff_salaries">
                    {bi('رواتب ومكافآت الكادر', 'Staff Salaries', 'مووچە و پاداشتی ستاف')}
                  </option>
                  <option value="marketing_other">
                    {bi('مصاريف إدارية أخرى', 'Other Admin Expenses', 'خەرجیی کارگێڕی تر')}
                  </option>
                </select>
              </div>
              {expCategory === 'marketing_other' && (
                <div>
                  <label htmlFor="fin-exp-custom-cat" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi(
                      'تسمية فئة مخصصة (اختياري):',
                      'Custom Category Label (Optional):',
                      'ناوی پۆلی تایبەت (ئارەزوومەندانە):'
                    )}
                  </label>
                  <input
                    id="fin-exp-custom-cat"
                    type="text"
                    value={expCustomCategoryLabel}
                    onChange={(e) => setExpCustomCategoryLabel(e.target.value)}
                    placeholder={bi(
                      'مثال: اشتراك برامج، تسويق رقمي، نثريات...',
                      'e.g., Software subscription, digital ads, petty cash...',
                      'نموونە: ئابوونەی بەرنامە، ڕێکلامی دیجیتاڵی، خەرجی وردە...'
                    )}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              )}
              <div>
                <label htmlFor="fin-exp-patient" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('ربط بمريض (اختياري):', 'Link to Patient (Optional):', 'بەستنەوە بە نەخۆش (ئارەزوومەندانە):')}
                </label>
                <select
                  id="fin-exp-patient"
                  value={expPatientId}
                  onChange={(e) => setExpPatientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="">
                    {bi('-- مصروف عام للعيادة --', '-- General clinic expense --', '-- خەرجیی گشتی کلینیک --')}
                  </option>
                  {activePatients.map((p, idx) => (
                    <option key={p.id} value={p.id}>
                      {p.data.fullNameAr || p.data.fullName} ({getPatientMrn(p, idx)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="fin-exp-title" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('بيان المصروف:', 'Description:', 'بەیانی خەرجی:')}
                </label>
                <input
                  id="fin-exp-title"
                  type="text"
                  required
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder={bi(
                    'مثال: شراء لفافات مطاطية TheraBand...',
                    'e.g., TheraBand rolls...',
                    'نموونە: کڕینی لاستیکی ڕاهێنانی TheraBand...'
                  )}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="fin-exp-amt" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('المبلغ (د.ع):', 'Amount (IQD):', 'بڕی پارە (د.ع):')}
                </label>
                <MoneyInput
                  id="fin-exp-amt"
                  ariaLabel={bi('مبلغ المصروف', 'Expense amount', 'بڕی خەرجی')}
                  value={expAmountIQD}
                  onChange={setExpAmountIQD}
                />
              </div>
              <div>
                <label htmlFor="fin-exp-notes" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('ملاحظات (اختياري):', 'Notes (Optional):', 'تێبینی (ئارەزوومەندانە):')}
                </label>
                <input
                  id="fin-exp-notes"
                  type="text"
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder={bi(
                    'تفاصيل إضافية أو رقم وصل...',
                    'Additional details or receipt ref...',
                    'وردەکاریی زیاتر یان ژمارەی وەسڵ...'
                  )}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="p-4 border-t border-card-divider bg-muted/30 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewExpenseForm(false)}
                className="min-h-[36px] py-2 px-4 rounded-xl bg-layer border border-layer-line text-layer-foreground text-xs font-semibold cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="submit"
                className="min-h-[36px] py-2 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold cursor-pointer"
              >
                <span>{bi('حفظ المصروف', 'Save Expense', 'پاشەکەوتکردنی خەرجی')}</span>
              </button>
            </div>
          </form>
      </DrawerDialog>

      {/* Segmented Navigation & Table Container */}
      <div className="bg-card rounded-2xl border border-card-line shadow-2xs overflow-hidden">
        <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-card-divider bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="rounded-2xl border border-line-2 bg-surface p-1 overflow-hidden w-full sm:w-auto min-w-0">
            <div className="pr-hscroll overflow-x-auto flex items-center gap-1 whitespace-nowrap pb-1 pt-0.5 px-0.5">
              {(
                [
                  {
                    id: 'invoices',
                    ar: 'سجل الفواتير وباقات الجلسات',
                    en: 'Invoices & Packages',
                    ckb: 'تۆماری پسوولە و پاکێجەکان',
                  },
                  {
                    id: 'debts',
                    ar: 'دفتر ديون وذمم المرضى',
                    en: 'Patient Debts',
                    ckb: 'دەفتەری قەرزی نەخۆشەکان',
                  },
                  ...(installmentPlansEnabled
                    ? [
                        {
                          id: 'installments' as const,
                          ar: 'الأقساط وتقادم الديون',
                          en: 'Installments & Aging',
                          ckb: 'قیستەکان و دواکەوتنی قەرز',
                        },
                      ]
                    : []),
                  {
                    id: 'expenses',
                    ar: 'مصاريف العيادة',
                    en: 'Expenses',
                    ckb: 'خەرجییەکانی کلینیک',
                  },
                  {
                    id: 'z_report',
                    ar: 'الإغلاق اليومي (Z-Report)',
                    en: 'Daily Cash Close',
                    ckb: 'داخستنی ڕۆژانە (Z-Report)',
                  },
                  {
                    id: 'monthly',
                    ar: 'الملخص الشهري والتصدير',
                    en: 'Monthly & CSV',
                    ckb: 'پوختەی مانگانە و هەناردەکردن',
                  },
                ] as Array<{ id: typeof activeTab; ar: string; en: string; ckb: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={activeTab === tab.id}
                  onClick={(e) => {
                    setActiveTab(tab.id);
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                  }}
                  className={`min-h-[34px] py-1.5 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground-1 hover:text-foreground hover:bg-card/70'
                  }`}
                >
                  <span>{bi(tab.ar, tab.en, tab.ckb)}</span>
                  {tab.id === 'installments' && agingSummary.totalOverdueCount > 0 && (
                    <span className={`text-xs font-bold tabular-nums ${activeTab === tab.id ? 'text-primary-foreground' : 'text-rose-700 dark:text-rose-400'}`}>
                      (<Num value={agingSummary.totalOverdueCount} />)
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                downloadCsvFile(
                  `physiorecord-invoices-${localDate()}.csv`,
                  buildInvoicesCsv(invoices, currency.code)
                )
              }
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Download className="size-3.5 text-primary" />
              <span>{bi('CSV الفواتير', 'Invoices CSV', 'CSV پسوولەکان')}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                downloadCsvFile(
                  `physiorecord-payments-${localDate()}.csv`,
                  buildPaymentsCsv(invoices, currency.code)
                )
              }
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Download className="size-3.5 text-primary" />
              <span>{bi('CSV الدفعات', 'Payments CSV', 'CSV پارەدانەکان')}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                downloadCsvFile(
                  `physiorecord-expenses-${localDate()}.csv`,
                  buildExpensesCsv(expenses, currency.code)
                )
              }
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Download className="size-3.5 text-primary" />
              <span>{bi('CSV المصاريف', 'Expenses CSV', 'CSV خەرجییەکان')}</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'z_report' ? (
          <div className="p-5 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Live Draft & Close Cash Form */}
              <div className="p-4 rounded-2xl bg-surface border border-card-line space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-foreground">
                    {bi(
                      'مسودة إغلاق الصندوق اليومي (Z-Report)',
                      'Daily Cash Close Draft',
                      'ڕەشنووسی داخستنی سندووقی ڕۆژانە (Z-Report)'
                    )}
                  </h2>
                  <input
                    id="fin-z-date"
                    type="date"
                    aria-label={bi('تاريخ تقرير الإغلاق اليومي', 'Z-Report date', 'بەرواری ڕاپۆرتی داخستن')}
                    value={zReportDate}
                    onChange={(e) => setZReportDate(e.target.value || localDate())}
                    className="px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line text-xs font-mono text-foreground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-card border border-line-2">
                    <div className="text-muted-foreground-1">
                      {bi('المقبوضات', 'Collected', 'پارەی وەرگیراو')}
                    </div>
                    <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-0.5 tabular-nums">
                      <Money amount={zDraft.totalCollectedPrimary} />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-line-2">
                    <div className="text-muted-foreground-1">
                      {bi('العكوسات', 'Reversed', 'گەڕاوەکان')}
                    </div>
                    <div className="text-sm font-bold text-rose-700 dark:text-rose-300 mt-0.5 tabular-nums">
                      <Money amount={zDraft.totalReversedPrimary} />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-line-2">
                    <div className="text-muted-foreground-1">
                      {bi('المصاريف', 'Expenses', 'خەرجییەکان')}
                    </div>
                    <div className="text-sm font-bold text-amber-700 dark:text-amber-300 mt-0.5 tabular-nums">
                      <Money amount={zDraft.totalExpensesPrimary} />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-card border border-line-2">
                    <div className="text-muted-foreground-1">
                      {bi('صافي التدفق النقدي', 'Net Cash Flow', 'سافی ڕەوتی نەقد')}
                    </div>
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
                        `النقد الفعلي المعدود في الدرج (${currency.symbolAr}):`,
                        `Counted Physical Cash (${currency.code}):`,
                        `نەقدی ژمێردراوی ڕاستەقینە لە سندووق (${currency.symbolAr}):`
                      )}
                    </label>
                    <input
                      id="fin-z-counted-cash"
                      type="number"
                      step="any"
                      value={zCountedCashInput}
                      onChange={(e) => setZCountedCashInput(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="fin-z-notes" className="block font-semibold text-foreground mb-1">
                      {bi('ملاحظات الإغلاق (اختياري):', 'Closing Notes (Optional):', 'تێبینیی داخستن (ئارەزوومەندانە):')}
                    </label>
                    <input
                      id="fin-z-notes"
                      type="text"
                      value={zNotes}
                      onChange={(e) => setZNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
                    />
                  </div>
                </div>

                {typeof zDraft.cashVariance === 'number' && (
                  <div className="p-2.5 rounded-xl bg-layer border border-layer-line text-xs flex justify-between">
                    <span className="font-semibold text-muted-foreground-1">
                      {bi(
                        'فرق الصندوق المتوقع (الفعلي − النقد المحصّل):',
                        'Cash Drawer Variance:',
                        'جیاوازیی پێشبینیکراوی سندووق:'
                      )}
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
                  className="w-full min-h-[40px] py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
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
              <div className="p-4 rounded-2xl bg-surface border border-card-line space-y-3">
                <h2 className="text-sm font-bold text-foreground">
                  {bi(
                    `سجل تقارير الإغلاق (${cashCloses.length})`,
                    `Closed Z-Reports (${cashCloses.length})`,
                    `تۆماری ڕاپۆرتەکانی داخستن (${cashCloses.length})`
                  )}
                </h2>
                {cashCloses.length === 0 ? (
                  <p className="text-xs text-muted-foreground-1 py-6 text-center">
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
                    aria-label={bi('سجل تقارير الإغلاق اليومي', 'Closed Z-Reports history', 'تۆماری ڕاپۆرتەکانی داخستنی ڕۆژانە')}
                    className="space-y-2 max-h-80 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-primary rounded-xl"
                  >
                    {cashCloses.map((rep) => (
                      <div
                        key={rep.id}
                        className="p-3 rounded-xl bg-card border border-line-2 flex flex-wrap items-center justify-between gap-2 text-xs"
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
                          onClick={() => setPrintDoc({ type: 'z_report', zReport: rep })}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
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
          </div>
        ) : activeTab === 'monthly' ? (
          <div className="p-5 space-y-5">
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
                  className="px-3 py-1.5 rounded-xl bg-layer border border-layer-line text-xs font-mono text-foreground"
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
                  {bi(
                    'تصدير الملخص الشهري CSV',
                    'Export Monthly Summary CSV',
                    'هەناردەکردنی پوختەی مانگانە CSV'
                  )}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-surface border border-line-2">
                <div className="text-muted-foreground-1">{bi('إجمالي الفوترة', 'Monthly Billed', 'کۆی پسوولەکراو')}</div>
                <div className="text-sm font-bold text-foreground mt-1 tabular-nums">
                  <Money amount={monthlySummary.totalBilledPrimary} />
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-surface border border-line-2">
                <div className="text-muted-foreground-1">{bi('صافي التحصيل', 'Net Collected', 'پوختەی وەرگیراو')}</div>
                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
                  <Money amount={monthlySummary.netCollectedPrimary} />
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-surface border border-line-2">
                <div className="text-muted-foreground-1">{bi('المصاريف الشهرية', 'Monthly Expenses', 'خەرجیی مانگانە')}</div>
                <div className="text-sm font-bold text-rose-700 dark:text-rose-300 mt-1 tabular-nums">
                  <Money amount={monthlySummary.totalExpensesPrimary} />
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-surface border border-line-2">
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
              <div className="p-4 rounded-xl bg-surface border border-card-line space-y-2 text-xs">
                <h2 className="font-bold text-foreground">
                  {bi(
                    'توزيع المقبوضات حسب العملة:',
                    'Collected Breakdown by Payment Currency:',
                    'دابەشبوونی وەرگیراوەکان بەپێی دراو:'
                  )}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {Object.entries(monthlySummary.byCurrency).map(([code, bucket]) => (
                    <div key={code} className="p-2.5 rounded-lg bg-card border border-line-2">
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
              <div className="p-4 rounded-xl bg-surface border border-card-line space-y-3 text-xs">
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
                      className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
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
                      className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
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
                      className="p-3 rounded-xl bg-card border border-line-2 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-foreground">
                          {loc.locationId === '__unassigned__'
                            ? bi('غير محدد / عام', 'Unassigned / General', 'دیارینەکراو / گشتی')
                            : language === 'en'
                              ? loc.nameEn || loc.nameAr
                              : loc.nameAr}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground-1 text-xs font-semibold tabular-nums">
                          <Num value={loc.invoiceCount} />{' '}
                          {bi('فاتورة', 'inv', 'پسوولە')}
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground-1 tabular-nums">
                        <span>{bi('الصافي المفوتر:', 'Billed Net:', 'پوختەی پسوولەکراو:')}</span>
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
          </div>
        ) : activeTab === 'installments' && installmentPlansEnabled ? (
          <div className="p-5">
            <Suspense fallback={null}>
              <InstallmentPlansAgingPanel
                invoices={invoices}
                patients={activePatients}
                onCollectPayment={(inv, suggestedAmountIQD) => {
                  setSelectedInvoiceForPayment(inv);
                  setPaymentAmountIQD(
                    typeof suggestedAmountIQD === 'number' && suggestedAmountIQD > 0
                      ? suggestedAmountIQD
                      : inv.balanceDueIQD
                  );
                  setPaymentCurrency(currency.code);
                  setPaymentOrigAmount('');
                  setPaymentFxRate('');
                  setPaymentError(null);
                }}
                onInvoicesUpdated={setInvoices}
              />
            </Suspense>
          </div>
        ) : activeTab === 'expenses' ? (
          <div className="space-y-4">
            {recurringExpensesEnabled && (
              <div className="p-5 pb-0">
                <Suspense fallback={null}>
                  <RecurringExpensesPanel
                    expenses={expenses}
                    onExpensesUpdated={setExpenses}
                  />
                </Suspense>
              </div>
            )}
            <div
              tabIndex={0}
              role="region"
              aria-label={bi('جدول مصاريف العيادة', 'Clinic expenses table', 'خشتەی خەرجییەکانی کلینیک')}
              className="overflow-x-auto focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <table className="pr-responsive-table min-w-full divide-y divide-card-divider text-start text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-muted-foreground-1 font-semibold text-xs">
                    <th className="py-3.5 px-4 text-start">{bi('التاريخ', 'Date', 'بەروار')}</th>
                    <th className="py-3.5 px-4 text-start">{bi('البيان', 'Description', 'وردەکاری')}</th>
                    <th className="py-3.5 px-4 text-start">{bi('المسجل', 'Recorded By', 'تۆمارکراو لەلایەن')}</th>
                    <th className="py-3.5 px-4 text-end">{bi('المبلغ (د.ع)', 'Amount (IQD)', 'بڕ (د.ع)')}</th>
                    <th className="py-3.5 px-4 text-end">{bi('إجراء', 'Action', 'کردار')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-divider">
                  {expenses.length === 0 ? (
                    <tr className="pr-empty-row">
                      <td colSpan={5} className="py-8 px-4 text-center text-muted-foreground-1">
                        {bi('لا توجد مصاريف مسجلة (0 د.ع).', 'No clinic expenses recorded (0 IQD).', 'هیچ خەرجییەک تۆمار نەکراوە (0 د.ع).')}
                      </td>
                    </tr>
                  ) : (
                    expenses.map((exp) => (
                      <tr key={exp.id} className="tabular-nums hover:bg-muted/30 transition-colors">
                        <td
                          data-label={bi('التاريخ', 'Date', 'بەروار')}
                          className="py-3.5 px-4 tabular-nums text-muted-foreground-1"
                        >
                          <bdi dir="ltr">{formatDateDDMMYYYY(exp.date)}</bdi>
                        </td>
                        <td
                          data-label={bi('البيان', 'Description', 'وردەکاری')}
                          className="py-3.5 px-4 font-bold text-foreground pr-cell-primary md:table-cell"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{language === 'en' ? exp.titleEn : exp.titleAr}</span>
                            {exp.isDemo && <DemoBadge />}
                            <span className="px-2 py-0.5 rounded-full bg-surface border border-line-2 text-xs font-semibold text-muted-foreground-1">
                              {bi(
                                getExpenseCategoryDisplayLabel(exp, true),
                                getExpenseCategoryDisplayLabel(exp, false),
                                exp.customCategoryLabel?.trim() ||
                                  EXPENSE_CATEGORY_CKB[exp.category] ||
                                  EXPENSE_CATEGORY_CKB.marketing_other
                              )}
                            </span>
                            {exp.recurringTemplateId && (
                              <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                                {bi('متكرر', 'Recurring', 'دووبارەبوو')}
                              </span>
                            )}
                          </div>
                          {exp.patientName && (
                            <div className="text-xs font-normal text-muted-foreground-1 mt-0.5">
                              {bi('المريض: ', 'Patient: ', 'نەخۆش: ')}
                              {exp.patientName}
                            </div>
                          )}
                          {exp.notes && (
                            <div className="text-xs font-normal text-muted-foreground-1 mt-0.5">
                              {exp.notes}
                            </div>
                          )}
                        </td>
                        <td
                          data-label={bi('المسجل', 'Recorded By', 'تۆمارکراو لەلایەن')}
                          className="py-3.5 px-4 text-muted-foreground-1"
                        >
                          {exp.paidBy}
                        </td>
                        <td
                          data-label={bi('المبلغ (د.ع)', 'Amount (IQD)', 'بڕ (د.ع)')}
                          className="py-3.5 px-4 text-end font-bold text-rose-700 dark:text-rose-300 tabular-nums"
                        >
                          <Money amount={exp.amountIQD} colorize={false} />
                        </td>
                        <td
                          data-label={bi('إجراء', 'Action', 'کردار')}
                          className="py-3.5 px-4 text-end"
                        >
                          {perms.canDeleteFinancialRecords && (
                            <button
                              type="button"
                              onClick={() => {
                                setUndoItem({ type: 'expense', data: exp });
                                setExpenses(ClinicOperationsService.deleteExpenseIQD(exp.id));
                              }}
                              className="min-h-[36px] min-w-[36px] text-muted-foreground-1 hover:text-rose-700 dark:hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer"
                              title={bi('حذف المصروف', 'Delete expense', 'سڕینەوەی خەرجی')}
                              aria-label={bi(
                                `حذف المصروف ${exp.titleAr}`,
                                `Delete expense ${exp.titleEn}`,
                                `سڕینەوەی خەرجی ${exp.titleAr || exp.titleEn}`
                              )}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-label={bi('بطاقات المرضى المالية', 'Patient financial cards', 'کارتە داراییەکانی نەخۆش')}
            data-testid="financial-invoices-list"
            className="p-3 sm:p-4 focus:outline-none"
          >
            {patientInvoiceGroups.length === 0 ? (
              <div
                data-testid="finance-invoices-empty-state"
                className="py-10 px-4 text-center text-muted-foreground-1 space-y-3"
              >
                <p className="text-xs font-semibold text-foreground">
                  {bi(
                    'لا توجد فواتير أو باقات علاجية مسجلة بعد — أنشئ أول فاتورة جلسة أو كورس علاجي لمتابعة المقبوضات والديون.',
                    'No invoices or treatment packages recorded yet — issue your first session or course invoice to track collections and balances.',
                    'هێشتا هیچ پسوولە یان پاکێجێکی چارەسەری تۆمار نەکراوە — یەکەم پسوولەی دانیشتن یان کۆرس دروست بکە بۆ بەدواداچوونی وەرگیراوەکان و قەرزەکان.'
                  )}
                </p>
                <div className="mt-2">
                  <button
                    type="button"
                    data-testid="finance-empty-primary-btn"
                    onClick={() => {
                      handleInvoicePresetChange('single_session');
                      setShowNewInvoiceForm(true);
                      setShowNewExpenseForm(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>{bi('+ إصدار فاتورة / كورس', '+ New Invoice / Package', '+ دەرکردنی پسوولە / کۆرس')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {patientInvoiceGroups.map((group) => {
                  const hasDebt = group.totalDueIQD > 0;
                  const allVoided = group.activeCount === 0 && group.voidCount > 0;
                  const pkg = group.activePackage;
                  const pkgUsed = pkg?.packageUsedSessions || 0;
                  const pkgTotal = pkg?.packageTotalSessions || 0;
                  const pkgPct = pkgTotal > 0 ? Math.min(100, Math.round((pkgUsed / pkgTotal) * 100)) : 0;

                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setSelectedPatientLedgerKey(group.key)}
                      className={`w-full text-start p-3.5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between gap-2.5 shadow-2xs hover:shadow-sm ${
                        allVoided
                          ? 'bg-rose-500/5 border-rose-500/20 opacity-75'
                          : hasDebt
                          ? 'bg-card border-card-line hover:border-primary/40'
                          : 'bg-card border-card-line hover:border-emerald-500/40'
                      }`}
                    >
                      {/* Top Row: Avatar + Name + Debt/Status Pill */}
                      <div className="flex items-start justify-between gap-2 w-full">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="size-9 rounded-full bg-primary/10 border border-primary/20 text-primary font-black text-xs flex items-center justify-center shrink-0">
                            {group.patientName.trim().slice(0, 1) || <User className="size-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs sm:text-sm font-bold text-foreground truncate max-w-[160px] sm:max-w-[190px]">
                                {group.patientName}
                              </span>
                              {group.isDemo && <DemoBadge />}
                            </div>
                            <div className="text-[11px] text-muted-foreground-1 flex items-center gap-1.5 tabular-nums mt-0.5">
                              <span>
                                {bi(
                                  `${group.invoices.length} ${group.invoices.length === 1 ? 'فاتورة' : 'فواتير'}`,
                                  `${group.invoices.length} ${group.invoices.length === 1 ? 'invoice' : 'invoices'}`,
                                  `${group.invoices.length} پسوولە`
                                )}
                              </span>
                              <span>·</span>
                              <bdi dir="ltr">{formatDateDDMMYYYY(group.latestDate)}</bdi>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {allVoided ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/12 text-rose-700 dark:text-rose-400 text-[11px] font-bold">
                              {bi('ملغاة', 'Voided', 'هەڵوەشاوە')}
                            </span>
                          ) : hasDebt ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/12 text-rose-700 dark:text-rose-400 text-[11px] font-bold tabular-nums">
                              <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
                              <Money amount={group.totalDueIQD} />
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold">
                              <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
                              {bi('مسدد', 'Paid', 'دراوە')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle Compact 3-Column Financial Totals */}
                      <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-surface border border-line-2/60 text-center tabular-nums w-full">
                        <div className="min-w-0">
                          <div className="text-[10px] text-muted-foreground-1 font-medium">
                            {bi('الصافي', 'Net', 'پوختە')}
                          </div>
                          <div className="text-xs font-bold text-foreground truncate">
                            <Money amount={group.totalNetIQD} colorize={false} />
                          </div>
                        </div>
                        <div className="min-w-0 border-x border-line-2/60 px-1">
                          <div className="text-[10px] text-muted-foreground-1 font-medium">
                            {bi('المدفوع', 'Paid', 'دراو')}
                          </div>
                          <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 truncate">
                            <Money amount={group.totalPaidIQD} colorize={false} />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] text-muted-foreground-1 font-medium">
                            {bi('المتبقي', 'Due', 'ماوە')}
                          </div>
                          <div className={`text-xs font-bold truncate ${hasDebt ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                            <Money amount={group.totalDueIQD} colorize={false} />
                          </div>
                        </div>
                      </div>

                      {/* Optional Active Package Slim Progress + Tap Hint */}
                      <div className="flex items-center justify-between gap-2 text-[11px] w-full pt-0.5">
                        {pkgTotal > 0 ? (
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono font-bold text-primary shrink-0">
                              <Fraction value={pkgUsed} total={pkgTotal} />
                            </span>
                            <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden max-w-[100px]">
                              <div
                                className="h-full rounded-full bg-primary transition-all duration-300"
                                style={{ width: `${pkgPct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground-2 truncate">
                            {language === 'en' ? group.invoices[0]?.titleEn : group.invoices[0]?.titleAr}
                          </span>
                        )}

                        <span className="inline-flex items-center gap-0.5 font-bold text-primary shrink-0 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform">
                          <span>{bi('التفاصيل', 'Details', 'وردەکاری')}</span>
                          {isRtl ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Patient Financial Details Modal (Bottom Sheet on Mobile, Centered on Tablet/Desktop) */}
      <ModalDialog
        isOpen={Boolean(selectedPatientGroup)}
        onOpenChange={(open) => {
          if (!open) setSelectedPatientLedgerKey(null);
        }}
        title={
          selectedPatientGroup ? (
            <div className="flex items-center gap-2.5 flex-wrap">
              <span>{selectedPatientGroup.patientName}</span>
              {selectedPatientGroup.isDemo && <DemoBadge />}
            </div>
          ) : (
            ''
          )
        }
        subtitle={
          selectedPatientGroup
            ? bi(
                `سجل الفواتير والمدفوعات (${selectedPatientGroup.invoices.length})`,
                `Invoices & Payment Breakdown (${selectedPatientGroup.invoices.length})`,
                `تۆماری پسوولە و پارەدانەکان (${selectedPatientGroup.invoices.length})`
              )
            : undefined
        }
        ariaLabel={bi('تفاصيل المريض المالية', 'Patient Financial Details', 'وردەکاری دارایی نەخۆش')}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        size="lg"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {selectedPatientGroup && (
          <div className="space-y-4">
            {/* Patient Overall Totals Strip */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-surface border border-card-line text-center tabular-nums">
              <div>
                <div className="text-[11px] text-muted-foreground-1 font-medium">
                  {bi('إجمالي الصافي', 'Total Net', 'کۆی پوختە')}
                </div>
                <div className="text-sm font-black text-foreground mt-0.5">
                  <Money amount={selectedPatientGroup.totalNetIQD} colorize={false} />
                </div>
              </div>
              <div className="border-x border-line-2/60 px-2">
                <div className="text-[11px] text-muted-foreground-1 font-medium">
                  {bi('إجمالي المدفوع', 'Total Paid', 'کۆی پارەدراو')}
                </div>
                <div className="text-sm font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                  <Money amount={selectedPatientGroup.totalPaidIQD} colorize={false} />
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground-1 font-medium">
                  {bi('المتبقي / الدين', 'Balance Due', 'ماوە / قەرز')}
                </div>
                <div className={`text-sm font-black mt-0.5 ${selectedPatientGroup.totalDueIQD > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  <Money amount={selectedPatientGroup.totalDueIQD} colorize={false} />
                </div>
              </div>
            </div>

            {/* Individual Invoices List */}
            <div className="space-y-3">
              {selectedPatientGroup.invoices.map((inv) => {
                const used = inv.packageUsedSessions || 0;
                const total = inv.packageTotalSessions || 0;
                const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
                const isVoided = inv.status === 'void';
                const latestPostedPayment = [...(inv.payments || [])]
                  .reverse()
                  .find((p) => !p.isReversal && p.status !== 'reversed' && p.amountIQD > 0);
                const patientRecord = activePatients.find((p) => p.id === inv.patientId);
                const patientPhone = patientRecord?.data.phone || patientRecord?.data.phoneNumber;
                const rowLocation = inv.locationId ? locationNameById.get(inv.locationId) : undefined;

                return (
                  <div
                    key={inv.id}
                    className={`p-3.5 sm:p-4 rounded-2xl border space-y-3 tabular-nums ${
                      isVoided
                        ? 'bg-rose-500/5 border-rose-500/25 opacity-80'
                        : 'bg-surface border-line-2'
                    }`}
                  >
                    {/* Invoice Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs text-foreground">
                            <bdi dir="ltr">{inv.invoiceNumber}</bdi>
                          </span>
                          <span className="text-xs text-muted-foreground-1">
                            <bdi dir="ltr">{formatDateDDMMYYYY(inv.date)}</bdi>
                          </span>
                          {isVoided && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400 text-[11px] font-bold">
                              {bi(
                                `ملغاة (${inv.creditNoteNumber || ''})`,
                                `Void (${inv.creditNoteNumber || ''})`,
                                `هەڵوەشاوە (${inv.creditNoteNumber || ''})`
                              )}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-foreground mt-1">
                          {language === 'en' ? inv.titleEn : inv.titleAr}
                        </div>
                      </div>

                      <div className="text-end shrink-0">
                        {isVoided ? (
                          <span className="text-rose-700 dark:text-rose-400 font-bold text-xs">
                            {bi('إشعار دائن', 'Credit Note', 'ئاگاداری دائن')}
                          </span>
                        ) : inv.balanceDueIQD > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/12 text-rose-700 dark:text-rose-400 text-xs font-bold">
                            <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
                            <span>{bi('متبقي: ', 'Due: ', 'ماوە: ')}</span>
                            <Money amount={inv.balanceDueIQD} />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                            <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
                            <span>{bi('مسدد بالكامل', 'Paid in Full', 'بە تەواوی دراوە')}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metadata Tags (Location, Travel, Installments, Void Reason) */}
                    {((practiceLocationsEnabled && rowLocation) ||
                      (inv.travelFeeIQD && inv.travelFeeIQD > 0) ||
                      (installmentPlansEnabled &&
                        inv.installmentPlan &&
                        inv.installmentPlan.length > 0) ||
                      (isVoided && inv.voidReason)) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {practiceLocationsEnabled && rowLocation && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-line-2 text-[11px] text-muted-foreground-1">
                            <MapPin className="size-3" />
                            <span>
                              {language === 'en'
                                ? rowLocation.nameEn || rowLocation.nameAr
                                : rowLocation.nameAr}
                            </span>
                          </span>
                        )}
                        {inv.travelFeeIQD && inv.travelFeeIQD > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-card border border-line-2 text-[11px] text-muted-foreground-1">
                            <span>{bi('تنقل:', 'Travel:', 'هاتوچۆ:')}</span>
                            <Money amount={inv.travelFeeIQD} colorize={false} />
                          </span>
                        ) : null}
                        {installmentPlansEnabled &&
                          inv.installmentPlan &&
                          inv.installmentPlan.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                              <CalendarClock className="size-3" />
                              <span>
                                {bi(
                                  `${inv.installmentPlan.length} أقساط`,
                                  `${inv.installmentPlan.length} installments`,
                                  `${inv.installmentPlan.length} قیست`
                                )}
                              </span>
                            </span>
                          )}
                        {isVoided && inv.voidReason && (
                          <span className="text-xs text-rose-700 dark:text-rose-300">
                            {bi('سبب الإلغاء: ', 'Void reason: ', 'هۆکاری هەڵوەشاندنەوە: ')}
                            {inv.voidReason}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Amounts Row */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-card border border-card-line text-xs">
                      <div>
                        <span className="text-[11px] text-muted-foreground-1 block">
                          {bi('الصافي', 'Net', 'پوختە')}
                        </span>
                        <span className="font-mono font-bold text-foreground">
                          <Money amount={inv.netAmountIQD} />
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-muted-foreground-1 block">
                          {bi('المدفوع', 'Paid', 'پارەدراو')}
                        </span>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                          <Money amount={inv.paidAmountIQD} />
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-muted-foreground-1 block">
                          {bi('المتبقي', 'Balance Due', 'ماوە / قەرز')}
                        </span>
                        <span className={`font-mono font-bold ${inv.balanceDueIQD > 0 && !isVoided ? 'text-rose-700 dark:text-rose-400' : 'text-foreground'}`}>
                          <Money amount={inv.balanceDueIQD} />
                        </span>
                      </div>
                    </div>

                    {/* Course Visits Progress */}
                    {inv.packageTotalSessions ? (
                      <div className="p-2.5 rounded-xl bg-card border border-card-line space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground-1 font-medium">
                              {bi('استهلاك الكورس:', 'Package Visits:', 'سەردانەکانی کۆرس:')}
                            </span>
                            <span className="font-mono font-bold text-primary">
                              <Fraction value={used} total={total} />
                            </span>
                          </div>
                          {isAdmin && !isVoided ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPkgAdjustInvoice(inv);
                                setPkgAdjustDelta(used < total ? 1 : -1);
                                setPkgAdjustReason('');
                                setPkgAdjustError(null);
                              }}
                              className="min-h-[32px] py-1 px-2.5 rounded-lg bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary border border-primary/20 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              {bi('تعديل إداري', 'Admin Adjust', 'دەستکاری کارگێڕی')}
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground-1">
                              {bi('تلقائي عند الاعتماد', 'Auto on Finalize', 'خۆکار لە کاتی پەسەندکردندا')}
                            </span>
                          )}
                        </div>
                        <div className="flex w-full h-1.5 bg-surface rounded-full overflow-hidden">
                          <div
                            className="flex flex-col justify-center rounded-full overflow-hidden bg-primary transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Actions Toolbar */}
                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1 border-t border-card-divider">
                      {!isVoided && inv.balanceDueIQD > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedInvoiceForPayment(inv);
                            setPaymentAmountIQD(inv.balanceDueIQD);
                            setPaymentCurrency(currency.code);
                            setPaymentOrigAmount('');
                            setPaymentFxRate('');
                            setPaymentError(null);
                          }}
                          className="min-h-[36px] py-1.5 px-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {bi('قبض دفعة', 'Collect', 'وەرگرتنی پارە')}
                        </button>
                      )}

                      {installmentPlansEnabled && !isVoided && inv.balanceDueIQD > 0 && (
                        <button
                          type="button"
                          onClick={() => setInstallmentBuilderInvoice(inv)}
                          className="min-h-[36px] py-1.5 px-2.5 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
                        >
                          <CalendarClock className="size-3.5" />
                          <span>
                            {inv.installmentPlan && inv.installmentPlan.length > 0
                              ? bi('الأقساط', 'Plan', 'قیستەکان')
                              : bi('إعداد أقساط', 'Setup Installments', 'دانانی قیستەکان')}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPrintDoc({ type: 'invoice', invoice: inv })}
                        className="min-h-[36px] min-w-[36px] px-2.5 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                        title={bi('طباعة الفاتورة', 'Print Invoice', 'چاپکردنی پسوولە')}
                      >
                        <Printer className="size-3.5" />
                        <span>{bi('طباعة', 'Print', 'چاپ')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setHistoryInvoice(inv);
                          setReversingPayId(null);
                          setReversePayReason('');
                          setReversePayError(null);
                        }}
                        className="min-h-[36px] min-w-[36px] px-2.5 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                        title={bi('الدفعات / عكس دفعة / وصولات', 'Payments, Receipts & Reversals', 'پارەدانەکان / پێچەوانەکردنەوە / پسوولەکان')}
                      >
                        <History className="size-3.5" />
                        <span>{bi('الدفعات', 'History', 'تۆمار')}</span>
                      </button>

                      {latestPostedPayment && patientPhone && (() => {
                        const waTemplates = ClinicOperationsService.getWhatsAppTemplates();
                        const clinicProf = ClinicOperationsService.getClinicProfile();
                        const langKey = language === 'en' ? 'en' : 'ar';
                        const waMsg = buildReceiptWhatsAppText({
                          template: waTemplates.paymentReceipt[langKey],
                          invoice: inv,
                          payment: latestPostedPayment,
                          clinicProfile: clinicProf,
                          primaryCurrencyCode: currency.code,
                          lang: langKey,
                        });
                        const waHref = buildUserInitiatedWhatsAppHref(patientPhone, waMsg);
                        if (!waHref) return null;
                        return (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[36px] min-w-[36px] p-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 inline-flex items-center justify-center"
                            title={bi('إرسال الوصل عبر واتساب', 'Send Receipt via WhatsApp', 'ناردنی پسوولە لە ڕێگەی WhatsApp')}
                          >
                            <MessageSquare className="size-3.5" />
                          </a>
                        );
                      })()}

                      {!isVoided && perms.canDeleteFinancialRecords && (
                        <button
                          type="button"
                          onClick={() => {
                            setVoidTargetInvoice(inv);
                            setVoidReason('');
                            setVoidError(null);
                          }}
                          className="min-h-[36px] min-w-[36px] text-muted-foreground-1 hover:text-rose-700 dark:hover:text-rose-300 p-1.5 rounded-xl hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer"
                          title={bi('إلغاء فاتورة بإشعار دائن', 'Void with Credit Note', 'هەڵوەشاندنەوەی پسوولە بە ئاگاداری دائن')}
                        >
                          <Ban className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Collect Payment Modal (Bottom Sheet on Mobile, Centered on Tablet/Desktop) */}
      <ModalDialog
        isOpen={Boolean(selectedInvoiceForPayment)}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoiceForPayment(null);
        }}
        title={
          selectedInvoiceForPayment
            ? bi(
                `استلام دفعة مالية: ${selectedInvoiceForPayment.patientName}`,
                `Collect Payment: ${selectedInvoiceForPayment.patientName}`,
                `وەرگرتنی پارە: ${selectedInvoiceForPayment.patientName}`
              )
            : ''
        }
        subtitle={
          selectedInvoiceForPayment ? (
            <span className="font-mono">
              <bdi dir="ltr">{selectedInvoiceForPayment.invoiceNumber}</bdi> ·{' '}
              {bi('المتبقي بالذمة: ', 'Balance Due: ', 'بڕی ماوە لەسەر نەخۆش: ')}
              <Money amount={selectedInvoiceForPayment.balanceDueIQD} />
            </span>
          ) : undefined
        }
        ariaLabel={bi('استلام دفعة مالية', 'Collect Payment', 'وەرگرتنی پارە')}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        size="md"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {selectedInvoiceForPayment && (
          <form onSubmit={handleCollectPartialPayment} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="fin-pay-currency" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('عملة الدفع:', 'Currency:', 'دراوی پارەدان:')}
                </label>
                <select
                  id="fin-pay-currency"
                  value={paymentCurrency}
                  onChange={(e) => {
                    setPaymentCurrency(e.target.value);
                    setPaymentFxRate('');
                    setPaymentError(null);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line text-foreground"
                >
                  <option value={currency.code}>
                    {currency.code} ({bi(currency.symbolAr, currency.symbolEn)})
                  </option>
                  {WORLD_CURRENCIES.filter((c) => c.code !== currency.code).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({bi(c.symbolAr, c.symbolEn)})
                    </option>
                  ))}
                </select>
              </div>

              {paymentCurrency === currency.code ? (
                <div>
                  <label htmlFor="fin-pay-amt" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi(
                      `المبلغ المستلم اليوم (${currency.symbolAr}):`,
                      `Payment Amount (${currency.code}):`,
                      `بڕی وەرگیراوی ئەمڕۆ (${currency.symbolAr}):`
                    )}
                  </label>
                  <MoneyInput
                    id="fin-pay-amt"
                    ariaLabel={bi('المبلغ المستلم اليوم', 'Payment Amount', 'بڕی وەرگیراوی ئەمڕۆ')}
                    value={paymentAmountIQD}
                    onChange={(val) =>
                      setPaymentAmountIQD(
                        Math.min(val, selectedInvoiceForPayment.balanceDueIQD)
                      )
                    }
                    className="w-full py-2 text-xs rounded-xl bg-surface border border-layer-line tabular-nums font-bold text-foreground"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="fin-pay-fx-amt" className="text-xs font-semibold text-foreground block mb-1.5">
                      {bi(
                        `المبلغ بعملة (${paymentCurrency}):`,
                        `Amount (${paymentCurrency}):`,
                        `بڕ بە دراوی (${paymentCurrency}):`
                      )}
                    </label>
                    <input
                      id="fin-pay-fx-amt"
                      type="number"
                      step="any"
                      min={0}
                      value={paymentOrigAmount}
                      onChange={(e) => setPaymentOrigAmount(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line tabular-nums font-mono font-bold text-foreground"
                    />
                  </div>
                  <div>
                    <label htmlFor="fin-pay-fx-rate" className="text-xs font-semibold text-foreground block mb-1.5">
                      {bi(
                        `سعر الصرف (1 ${paymentCurrency} = ? ${currency.code}):`,
                        `FX Rate (1 ${paymentCurrency} = ? ${currency.code}):`,
                        `نرخی گۆڕینەوە (1 ${paymentCurrency} = ? ${currency.code}):`
                      )}
                    </label>
                    <input
                      id="fin-pay-fx-rate"
                      type="number"
                      step="any"
                      min={0}
                      value={paymentFxRate}
                      onChange={(e) => setPaymentFxRate(e.target.value)}
                      placeholder={paymentCurrency === 'USD' && currency.code === 'IQD' ? '1500' : '1'}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line tabular-nums font-mono font-bold text-foreground"
                    />
                  </div>
                </>
              )}

              <div>
                <label htmlFor="fin-pay-method" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('وسيلة الدفع:', 'Payment Method:', 'شێوازی پارەدان:')}
                </label>
                <select
                  id="fin-pay-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as IraqiPaymentMethod)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line text-foreground"
                >
                  {Object.entries(paymentMethodLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {bi(v.ar, v.en, v.ckb)}
                    </option>
                  ))}
                </select>
              </div>

              {paymentMethod === 'other' && (
                <div>
                  <label htmlFor="fin-pay-custom-method" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('حدد وسيلة الدفع الأخرى:', 'Specify Custom Method:', 'شێوازی پارەدانی تر دیاری بکە:')}
                  </label>
                  <input
                    id="fin-pay-custom-method"
                    type="text"
                    value={paymentCustomMethod}
                    onChange={(e) => setPaymentCustomMethod(e.target.value)}
                    placeholder={bi('مثال: شيك، حوالة خاصة...', 'e.g. Check, custom transfer...', 'نموونە: چەک، حەواڵەی تایبەت...')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line text-foreground"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label htmlFor="fin-pay-note" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('ملاحظات الوصل:', 'Receipt Notes:', 'تێبینیی وەسڵ:')}
                </label>
                <input
                  id="fin-pay-note"
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder={bi('مثال: الدفعة الثانية من الكورس...', 'Second installment...', 'نموونە: قیستی دووەمی کۆرس...')}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line text-foreground"
                />
              </div>
            </div>

            {paymentCurrency !== currency.code && Number(paymentOrigAmount) > 0 && Number(paymentFxRate) > 0 && (
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
                {bi('المعادل المسجل بالعيادة: ', 'Converted Ledger Equivalent: ', 'هاوتای تۆمارکراو لە کلینیک: ')}
                <Money
                  amount={Math.min(
                    selectedInvoiceForPayment.balanceDueIQD,
                    Math.round(Number(paymentOrigAmount) * Number(paymentFxRate))
                  )}
                />
              </div>
            )}

            {paymentError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {paymentError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-card-divider">
              <button
                type="button"
                onClick={() => setSelectedInvoiceForPayment(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="submit"
                className="min-h-[38px] py-2 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-xs cursor-pointer"
              >
                {bi(
                  'تأكيد استلام الدفعة وإصدار وصل قبض',
                  'Confirm Payment & Issue Receipt',
                  'دڵنیاکردنەوەی وەرگرتنی پارە و دەرکردنی وەسڵ'
                )}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Admin-Only Manual Package Adjustment Modal (Phase 3.6) */}
      <ModalDialog
        isOpen={Boolean(pkgAdjustInvoice)}
        onOpenChange={(open) => {
          if (!open) setPkgAdjustInvoice(null);
        }}
        title={bi(
          'تعديل إداري لعدد جلسات الكورس',
          'Admin Manual Package Visit Adjustment',
          'دەستکاریکردنی کارگێڕی ژمارەی دانیشتنەکانی کۆرس'
        )}
        ariaLabel={bi(
          'تعديل إداري لعدد جلسات الكورس',
          'Admin Manual Package Visit Adjustment',
          'دەستکاریکردنی کارگێڕی ژمارەی دانیشتنەکانی کۆرس'
        )}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {pkgAdjustInvoice && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-surface border border-line-2 text-xs text-muted-foreground-1 space-y-1">
              <div>
                <strong className="text-foreground">{pkgAdjustInvoice.patientName}</strong> —{' '}
                <bdi dir="ltr">{pkgAdjustInvoice.invoiceNumber}</bdi>
              </div>
              <div>
                {bi('الرصيد الحالي:', 'Current usage:', 'باڵانسی ئێستا:')}{' '}
                <Fraction
                  value={pkgAdjustInvoice.packageUsedSessions || 0}
                  total={pkgAdjustInvoice.packageTotalSessions || 0}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPkgAdjustDelta(1)}
                className={`flex-1 min-h-[36px] py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  pkgAdjustDelta === 1
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface text-foreground border-layer-line'
                }`}
              >
                {bi('+1 خصم جلسة إضافية', '+1 Used Visit', '+1 کەمکردنەوەی دانیشتنێکی زیادە')}
              </button>
              <button
                type="button"
                onClick={() => setPkgAdjustDelta(-1)}
                className={`flex-1 min-h-[36px] py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  pkgAdjustDelta === -1
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface text-foreground border-layer-line'
                }`}
              >
                {bi('-1 استعادة جلسة', '-1 Refund Visit', '-1 گەڕاندنەوەی دانیشتن')}
              </button>
            </div>

            <div>
              <label htmlFor="fin-pkg-adj-reason" className="block text-xs font-bold text-foreground mb-1">
                {bi(
                  'سبب التعديل (إلزامي لسجل التدقيق) *',
                  'Adjustment Reason (Required for Audit Log) *',
                  'هۆکاری دەستکاری (ناچارییە بۆ تۆماری وردبینی) *'
                )}
              </label>
              <input
                id="fin-pkg-adj-reason"
                type="text"
                value={pkgAdjustReason}
                onChange={(e) => {
                  setPkgAdjustReason(e.target.value);
                  setPkgAdjustError(null);
                }}
                placeholder={bi('مثال: تصحيح خصم جلسة ملغاة...', 'e.g., Correct miscounted visit...', 'بۆ نموونە: چاککردنەوەی ژماردنی دانیشتنێکی هەڵوەشاوە...')}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-foreground text-xs"
              />
            </div>

            {pkgAdjustError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-700 dark:text-rose-300">
                {pkgAdjustError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPkgAdjustInvoice(null)}
                className="min-h-[36px] px-3.5 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const updated = ClinicOperationsService.adjustPackageSessionAdmin(
                      pkgAdjustInvoice.id,
                      pkgAdjustDelta,
                      pkgAdjustReason
                    );
                    setInvoices(updated);
                    setPkgAdjustInvoice(null);
                  } catch (err) {
                    setPkgAdjustError(err instanceof Error ? err.message : 'Failed');
                  }
                }}
                className="min-h-[36px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {bi('حفظ التعديل', 'Confirm Adjustment', 'پاشەکەوتکردنی دەستکاری')}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Void Invoice with Reason / Credit Note Modal (4.1) */}
      <ModalDialog
        isOpen={Boolean(voidTargetInvoice)}
        onOpenChange={(open) => {
          if (!open) setVoidTargetInvoice(null);
        }}
        title={
          <span className="flex items-center gap-2 text-sm sm:text-base font-bold text-primary-foreground">
            <span className="size-7 rounded-lg bg-rose-500/25 border border-rose-200/40 flex items-center justify-center shrink-0">
              <Ban className="size-4 text-primary-foreground" />
            </span>
            <span>
              {bi(
                'إلغاء فاتورة وإصدار إشعار دائن',
                'Void Invoice & Issue Credit Note',
                'هەڵوەشاندنەوەی پسوولە و دەرکردنی ئاگاداری دائن'
              )}
            </span>
          </span>
        }
        ariaLabel={bi(
          'إلغاء فاتورة وإصدار إشعار دائن',
          'Void Invoice & Issue Credit Note',
          'هەڵوەشاندنەوەی پسوولە و دەرکردنی ئاگاداری دائن'
        )}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {voidTargetInvoice && (
          <form onSubmit={handleVoidInvoiceSubmit} className="space-y-4 text-xs">

            <div className="p-3 rounded-xl bg-surface border border-line-2 space-y-1">
              <div className="font-mono font-bold text-foreground">
                <bdi dir="ltr">{voidTargetInvoice.invoiceNumber}</bdi> — {voidTargetInvoice.patientName}
              </div>
              <p className="text-muted-foreground-1">
                {bi(
                  'لا يتم حذف السجلات المالية نهائياً؛ سيتم إصدار إشعار دائن متسلسل وعكس جميع الدفعات المسجلة على هذه الفاتورة.',
                  'Financial invoices are never hard-deleted. Voiding issues a sequential Credit Note and creates reversal entries for all posted payments.',
                  'تۆمارە داراییەکان بە یەکجاری ناسڕدرێنەوە؛ ئاگاداری دائنێکی زنجیرەیی دەردەکرێت و هەموو پارەدانە تۆمارکراوەکانی ئەم پسوولەیە پێچەوانە دەکرێنەوە.'
                )}
              </p>
            </div>

            <div>
              <label htmlFor="fin-void-reason" className="block font-bold text-foreground mb-1">
                {bi(
                  'سبب الإلغاء (إلزامي لسجل التدقيق) *',
                  'Void Reason (Mandatory) *',
                  'هۆکاری هەڵوەشاندنەوە (ناچارییە بۆ تۆماری وردبینی) *'
                )}
              </label>
              <input
                id="fin-void-reason"
                type="text"
                required
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder={bi(
                  'مثال: إصدار لمريض بالخطأ / إلغاء خطة العلاج...',
                  'e.g., Billed to wrong patient...',
                  'بۆ نموونە: دەرکردن بۆ نەخۆشێکی تر بە هەڵە / هەڵوەشاندنەوەی پلانی چارەسەر...'
                )}
                className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
              />
            </div>

            {voidError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {voidError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidTargetInvoice(null)}
                className="min-h-[36px] px-3.5 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground cursor-pointer"
              >
                {bi('تراجع', 'Cancel', 'پاشگەزبوونەوە')}
              </button>
              <button
                type="submit"
                disabled={!voidReason.trim()}
                className="min-h-[36px] px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
              >
                {bi(
                  'تأكيد الإلغاء وإصدار إشعار دائن',
                  'Confirm Void & Issue CN',
                  'پشتڕاستکردنەوەی هەڵوەشاندنەوە و دەرکردنی ئاگاداری دائن'
                )}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Invoice Payment History, Receipts, Reversals & WhatsApp Drawer (4.1 / 4.6 / 4.7) */}
      <ModalDialog
        isOpen={Boolean(historyInvoice)}
        onOpenChange={(open) => {
          if (!open) setHistoryInvoice(null);
        }}
        title={
          historyInvoice ? (
            <div>
              <div className="text-sm sm:text-base font-bold text-primary-foreground">
                {bi(
                  'سجل الدفعات والوصولات والعكوسات',
                  'Payments, Receipts & Reversals',
                  'تۆماری پارەدان و پسوولە و پێچەوانەکردنەوەکان'
                )}
              </div>
              <p className="text-xs text-primary-foreground/85 font-mono font-normal mt-0.5">
                <bdi dir="ltr">{historyInvoice.invoiceNumber}</bdi> · {historyInvoice.patientName}
              </p>
            </div>
          ) : (
            ''
          )
        }
        ariaLabel={bi(
          'سجل الدفعات والوصولات والعكوسات',
          'Payments, Receipts & Reversals',
          'تۆماری پارەدان و پسوولە و پێچەوانەکردنەوەکان'
        )}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        size="lg"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {historyInvoice && (
          <div className="space-y-2.5 text-xs">
              {(historyInvoice.payments || []).length === 0 ? (
                <p className="text-center text-muted-foreground-1 py-6">
                  {bi(
                    'لا توجد دفعات مسجلة على هذه الفاتورة.',
                    'No payment entries on this invoice.',
                    'هیچ پارەدانێک لەسەر ئەم پسوولەیە تۆمار نەکراوە.'
                  )}
                </p>
              ) : (
                historyInvoice.payments.map((pay) => {
                  const patientObj = activePatients.find((p) => p.id === historyInvoice.patientId);
                  const phone = patientObj?.data.phone || patientObj?.data.phoneNumber;
                  const waTemplates = ClinicOperationsService.getWhatsAppTemplates();
                  const clinicProf = ClinicOperationsService.getClinicProfile();
                  const langKey = language === 'en' ? 'en' : 'ar';
                  const waText = buildReceiptWhatsAppText({
                    template: waTemplates.paymentReceipt[langKey],
                    invoice: historyInvoice,
                    payment: pay,
                    clinicProfile: clinicProf,
                    primaryCurrencyCode: currency.code,
                    lang: langKey,
                  });
                  const waHref = phone ? buildUserInitiatedWhatsAppHref(phone, waText) : null;

                  return (
                    <div
                      key={pay.id}
                      className="p-3.5 rounded-xl bg-surface border border-card-line space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-mono font-bold text-foreground flex items-center gap-2 flex-wrap">
                            <bdi dir="ltr">{pay.receiptNumber}</bdi>
                            {pay.status === 'reversed' && (
                              <span className="text-rose-700 dark:text-rose-400 font-sans font-bold text-xs">
                                · {bi('تم عكسها', 'Reversed', 'پێچەوانەکرایەوە')}
                              </span>
                            )}
                            {pay.isReversal && (
                              <span className="text-amber-700 dark:text-amber-300 font-sans font-bold text-xs">
                                · {bi('قيد عكس', 'Reversal Entry', 'تۆماری پێچەوانە')}
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground-1 mt-0.5">
                            <bdi dir="ltr">{formatDateDDMMYYYY(pay.date)}</bdi> ·{' '}
                            {bi(
                              paymentMethodLabels[pay.method].ar,
                              paymentMethodLabels[pay.method].en,
                              paymentMethodLabels[pay.method].ckb
                            )}{' '}
                            · <bdi dir="ltr">{formatPaymentCurrencySnapshot(pay, currency.code)}</bdi>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setPrintDoc({ type: 'receipt', invoice: historyInvoice, payment: pay })
                            }
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-foreground font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Printer className="size-3.5" />
                            <span>{bi('وصل', 'Receipt', 'پسوولە')}</span>
                          </button>

                          {!pay.isReversal && waHref && (
                            <a
                              href={waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold inline-flex items-center gap-1"
                            >
                              <MessageSquare className="size-3.5" />
                              <span>{bi('واتساب', 'WhatsApp', 'WhatsApp')}</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(waText);
                              setCopiedWaReceiptId(pay.id);
                              setTimeout(() => setCopiedWaReceiptId(null), 1800);
                            }}
                            className="min-h-[36px] px-2 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="size-3.5" />
                            <span>
                              {copiedWaReceiptId === pay.id
                                ? bi('نُسخ', 'Copied', 'کۆپی کرا')
                                : bi('نسخ', 'Copy', 'کۆپیکردن')}
                            </span>
                          </button>

                          {!pay.isReversal &&
                            pay.status !== 'reversed' &&
                            historyInvoice.status !== 'void' &&
                            perms.canDeleteFinancialRecords && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReversingPayId(pay.id);
                                  setReversePayReason('');
                                  setReversePayError(null);
                                }}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold cursor-pointer"
                              >
                                {bi('عكس الدفعة', 'Reverse', 'پێچەوانەکردنەوەی پارەدان')}
                              </button>
                            )}
                        </div>
                      </div>

                      {reversingPayId === pay.id && (
                        <div className="pt-2 border-t border-line-2 flex flex-wrap items-center gap-2">
                          <label htmlFor={`fin-rev-reason-${pay.id}`} className="sr-only">
                            {bi('سبب عكس الدفعة', 'Payment reversal reason', 'هۆکاری پێچەوانەکردنەوەی پارەدان')}
                          </label>
                          <input
                            id={`fin-rev-reason-${pay.id}`}
                            type="text"
                            aria-label={bi('سبب عكس الدفعة', 'Payment reversal reason', 'هۆکاری پێچەوانەکردنەوەی پارەدان')}
                            value={reversePayReason}
                            onChange={(e) => setReversePayReason(e.target.value)}
                            placeholder={bi(
                              'اكتب سبب عكس هذه الدفعة (إلزامي)...',
                              'Mandatory reversal reason...',
                              'هۆکاری پێچەوانەکردنەوەی ئەم پارەدانە بنووسە (ناچارییە)...'
                            )}
                            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground"
                          />
                          <button
                            type="button"
                            disabled={!reversePayReason.trim()}
                            onClick={() => handleReversePaymentSubmit(historyInvoice.id, pay.id)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
                          >
                            {bi('تأكيد العكس', 'Confirm Reverse', 'پشتڕاستکردنەوەی پێچەوانە')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReversingPayId(null)}
                            className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-layer-line text-muted-foreground-1 cursor-pointer"
                          >
                            {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                          </button>
                          {reversePayError && (
                            <div className="w-full text-rose-700 dark:text-rose-300">
                              {reversePayError}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
          </div>
        )}
      </ModalDialog>

      {installmentPlansEnabled && installmentBuilderInvoice && (
        <Suspense fallback={null}>
          <InstallmentPlanBuilderModal
            invoice={installmentBuilderInvoice}
            onClose={() => setInstallmentBuilderInvoice(null)}
            onSaved={setInvoices}
          />
        </Suspense>
      )}

      {/* Printable Financial Document Modal (4.6) */}
      {Boolean(printDoc) && (
        <Suspense fallback={null}>
          <PrintDocumentModal
            isOpen={Boolean(printDoc)}
            onClose={() => setPrintDoc(null)}
            documentType={printDoc?.type || 'invoice'}
            invoice={printDoc?.invoice}
            payment={printDoc?.payment}
            zReport={printDoc?.zReport}
            patient={
              printDoc?.invoice
                ? activePatients.find((p) => p.id === printDoc.invoice?.patientId) || null
                : null
            }
            patientName={printDoc?.invoice?.patientName}
          />
        </Suspense>
      )}
    </div>
  );
};
