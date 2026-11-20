// =======================================================================
// PhysioRecord — Iraqi Clinic Unified Cashbook & Financial Ledger
// Single Cashbook UX: Hero Balance Strip + Search + Quick Filters + Slide-Over Drawer
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
} from '../../utils/iraqFinanceC4C5';
import { formatPaymentCurrencySnapshot } from '../../utils/csvExport';
import { WORLD_CURRENCIES } from '../../utils/currencies';
import {
  buildReceiptWhatsAppText,
  buildUserInitiatedWhatsAppHref,
} from '../../utils/whatsappTemplates';
import type { PrintableDocumentType } from '../print/PrintDocumentModal';
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
  TrendingDown,
  Trash2,
  RotateCcw,
  X,
  Printer,
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
  Search,
  Coins,
  Globe,
} from 'lucide-react';

const PrintDocumentModal = lazy(() =>
  import('../print/PrintDocumentModal').then((m) => ({ default: m.PrintDocumentModal }))
);
const FinanceReportsModal = lazy(() =>
  import('./FinanceReportsModal').then((m) => ({ default: m.FinanceReportsModal }))
);
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

export interface IraqiFinancialLedgerViewProps {
  quickInvoiceNonce?: number;
}

type CashbookFilter = 'all' | 'debts' | 'courses' | 'expenses' | 'installments';

export const IraqiFinancialLedgerView: React.FC<IraqiFinancialLedgerViewProps> = ({
  quickInvoiceNonce = 0,
}) => {
  const { language, isRtl, bi } = useLanguage();
  const { currency } = useCurrency();
  const { dek, refreshRecoveredDrafts } = useVault();
  const { activePatients } = usePatients();

  const [activeFilter, setActiveFilter] = useState<CashbookFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [invoices, setInvoices] = useState<FinancialInvoiceIQD[]>([]);
  const [expenses, setExpenses] = useState<ClinicExpenseIQD[]>([]);
  const [cashCloses, setCashCloses] = useState<CashCloseZReportRecord[]>([]);
  const [showNewInvoiceForm, setShowNewInvoiceForm] = useState(false);
  const [showNewExpenseForm, setShowNewExpenseForm] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);

  useEffect(() => {
    if (quickInvoiceNonce > 0) {
      setShowNewInvoiceForm(true);
      setShowNewExpenseForm(false);
    }
  }, [quickInvoiceNonce]);

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

  // Collect Payment Modal State (4.2 FX supported with progressive disclosure)
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] =
    useState<FinancialInvoiceIQD | null>(null);
  const [paymentAmountIQD, setPaymentAmountIQD] = useState<number>(0);
  const [paymentCurrency, setPaymentCurrency] = useState<string>(currency.code);
  const [showPayFxOptions, setShowPayFxOptions] = useState(false);
  const [paymentOrigAmount, setPaymentOrigAmount] = useState<string>('');
  const [paymentFxRate, setPaymentFxRate] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<IraqiPaymentMethod>('cash');
  const [paymentCustomMethod, setPaymentCustomMethod] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // New Invoice Form State (blank defaults preserved per R2)
  const [invPatientSearch, setInvPatientSearch] = useState('');
  const [invPatientId, setInvPatientId] = useState('');
  const [invType, setInvType] = useState<FinancialInvoiceIQD['invoiceType']>('single_session');
  const [invTitle, setInvTitle] = useState('جلسة مفردة');
  const [invLocationId, setInvLocationId] = useState('');
  const [invTravelFeeIQD, setInvTravelFeeIQD] = useState<number>(0);
  const [invTotalIQD, setInvTotalIQD] = useState<number>(0);
  const [invDiscountIQD, setInvDiscountIQD] = useState<number>(0);
  const [invPaidIQD, setInvPaidIQD] = useState<number>(0);
  const [invPayCurrency, setInvPayCurrency] = useState<string>(currency.code);
  const [showInvFxOptions, setShowInvFxOptions] = useState(false);
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

  // Slide-Over Patient Financial Details Drawer
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
    if (!installmentPlansEnabled && activeFilter === 'installments') {
      setActiveFilter('all');
    }
  }, [installmentPlansEnabled, activeFilter]);

  // Recover unsaved invoice draft
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

  const handleInvoicePresetChange = (
    type: FinancialInvoiceIQD['invoiceType'],
    preselectedPatientId?: string
  ) => {
    setInvType(type);
    setInvTravelFeeIQD(0);
    setInvTotalIQD(0);
    setInvDiscountIQD(0);
    setInvPaidIQD(0);
    setInvPayCurrency(currency.code);
    setShowInvFxOptions(false);
    setInvPayOrigAmount('');
    setInvPayFxRate('');
    setInvInstallmentEnabled(false);
    setInvInstallmentCount(2);
    setInvInstallmentStartDate(localDate());
    setInvInstallmentIntervalDays(30);
    setInvPatientSearch('');
    if (preselectedPatientId !== undefined) {
      setInvPatientId(preselectedPatientId);
    }
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

  const openCollectPaymentForInvoice = (
    inv: FinancialInvoiceIQD,
    suggestedAmountIQD?: number
  ) => {
    setSelectedInvoiceForPayment(inv);
    setPaymentAmountIQD(
      typeof suggestedAmountIQD === 'number' && suggestedAmountIQD > 0
        ? suggestedAmountIQD
        : inv.balanceDueIQD
    );
    setPaymentCurrency(currency.code);
    setShowPayFxOptions(false);
    setPaymentOrigAmount('');
    setPaymentFxRate('');
    setPaymentError(null);
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
      setInvPatientSearch('');
      setInvLocationId('');
      setInvTravelFeeIQD(0);
      setInvInstallmentEnabled(false);
      setInvInstallmentCount(2);
      setInvInstallmentStartDate(localDate());
      setInvInstallmentIntervalDays(30);
      setInvCustomMethod('');
      setInvPayOrigAmount('');
      setInvPayFxRate('');
      setShowInvFxOptions(false);
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
      setShowPayFxOptions(false);
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

  // --- Computed Cashbook Metrics ---
  const activeInvoices = useMemo(
    () => invoices.filter((i) => i.status !== 'void'),
    [invoices]
  );
  const totalCollectedIQD = useMemo(
    () => activeInvoices.reduce((s, i) => s + i.paidAmountIQD, 0),
    [activeInvoices]
  );
  const totalDebtIQD = useMemo(
    () => activeInvoices.reduce((s, i) => s + i.balanceDueIQD, 0),
    [activeInvoices]
  );
  const totalExpensesIQD = useMemo(
    () => expenses.reduce((s, e) => s + e.amountIQD, 0),
    [expenses]
  );
  const netCashFlowIQD = totalCollectedIQD - totalExpensesIQD;

  // All patient groups (used both for counts & Slide-Over Drawer lookup)
  const allPatientGroups = useMemo(() => {
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
        firstOpenDebtInvoice: FinancialInvoiceIQD | null;
      }
    >();

    for (const inv of invoices) {
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
          firstOpenDebtInvoice: null,
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
        if (!g.firstOpenDebtInvoice && inv.balanceDueIQD > 0) {
          g.firstOpenDebtInvoice = inv;
        }
      }
    }

    return Array.from(groups.values());
  }, [invoices]);

  const debtorsCount = useMemo(
    () => allPatientGroups.filter((g) => g.totalDueIQD > 0).length,
    [allPatientGroups]
  );
  const coursesCount = useMemo(
    () => allPatientGroups.filter((g) => Boolean(g.activePackage)).length,
    [allPatientGroups]
  );

  // Filtered patient groups based on quick filter + search query
  const filteredPatientGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allPatientGroups.filter((g) => {
      if (activeFilter === 'debts' && g.totalDueIQD <= 0) return false;
      if (activeFilter === 'courses' && !g.activePackage) return false;
      if (!q) return true;
      if (g.patientName.toLowerCase().includes(q)) return true;
      return g.invoices.some(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.titleAr.toLowerCase().includes(q) ||
          inv.titleEn.toLowerCase().includes(q)
      );
    });
  }, [allPatientGroups, activeFilter, searchQuery]);

  // Filtered expenses based on search query
  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return expenses;
    return expenses.filter(
      (exp) =>
        exp.titleAr.toLowerCase().includes(q) ||
        exp.titleEn.toLowerCase().includes(q) ||
        (exp.notes || '').toLowerCase().includes(q) ||
        (exp.patientName || '').toLowerCase().includes(q) ||
        getExpenseCategoryDisplayLabel(exp, true).toLowerCase().includes(q) ||
        getExpenseCategoryDisplayLabel(exp, false).toLowerCase().includes(q)
    );
  }, [expenses, searchQuery]);

  const selectedPatientGroup = useMemo(
    () =>
      selectedPatientLedgerKey
        ? allPatientGroups.find((g) => g.key === selectedPatientLedgerKey) || null
        : null,
    [allPatientGroups, selectedPatientLedgerKey]
  );

  const filteredModalPatients = useMemo(() => {
    const q = invPatientSearch.trim().toLowerCase();
    if (!q) return activePatients;
    return activePatients.filter((p, idx) => {
      const nameAr = (p.data.fullNameAr || '').toLowerCase();
      const nameEn = (p.data.fullName || '').toLowerCase();
      const mrn = getPatientMrn(p, idx).toLowerCase();
      const phone = (p.data.phone || '').toLowerCase();
      return (
        p.id === invPatientId ||
        nameAr.includes(q) ||
        nameEn.includes(q) ||
        mrn.includes(q) ||
        phone.includes(q)
      );
    });
  }, [activePatients, invPatientSearch, invPatientId]);

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
      className="max-w-[85rem] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Page Header: Title + 3 Clean Actions */}
      <div className="pr-page-header">
        <div className="space-y-1 min-w-0">
          <span className="pr-eyebrow">
            <Wallet className="size-3.5" />
            {bi('الإدارة المالية', 'Finance', 'کارگێڕی دارایی')}
          </span>
          <h1 className="pr-page-title">
            {bi(
              `دفتر الصندوق والحسابات (${currency.symbolAr})`,
              `Clinic Cashbook & Finance (${currency.code})`,
              `دەفتەری سندووق و هەژمارەکان (${currency.symbolAr})`
            )}
          </h1>
          <p className="pr-page-subtitle">
            {bi(
              'الصندوق، فواتير المرضى، الديون والمصاريف في شاشة واحدة.',
              'Cash balance, patient invoices, debts and expenses in one unified cashbook.',
              'سندووق، پسوولەکان، قەرز و خەرجییەکان لە یەک شاشەدا.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-tour="finance-reports-btn"
            onClick={() => setShowReportsModal(true)}
            className="pr-btn pr-btn-ghost"
          >
            <FileText className="size-3.5 text-primary" />
            <span>{bi('الإغلاق والتقارير', 'Close & Reports', 'داخستن و ڕاپۆرت')}</span>
          </button>

          <button
            type="button"
            data-tour="finance-new-expense-btn"
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
            <span>{bi('+ مصروف', '+ Expense', '+ خەرجی')}</span>
          </button>

          <button
            type="button"
            data-tour="finance-new-invoice-btn"
            onClick={() => {
              handleInvoicePresetChange('single_session', '');
              setShowNewInvoiceForm(true);
              setShowNewExpenseForm(false);
            }}
            className="pr-btn pr-btn-primary"
          >
            <Plus className="size-4" />
            <span>{bi('+ إصدار فاتورة', '+ New Invoice', '+ دەرکردنی پسوولە')}</span>
          </button>
        </div>
      </div>

      {/* 8-Second Undo Toast (Expenses only — Invoices use Credit Note Void per 4.1) */}
      {undoItem && (
        <div className="p-3.5 bg-slate-900 text-white rounded-2xl flex items-center justify-between gap-3 text-xs shadow-lg">
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
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>{bi('تراجع (8 ثوانٍ)', 'Undo (8s)', 'گەڕاندنەوە (8 چرکە)')}</span>
          </button>
        </div>
      )}

      {/* Hero Unified Cashbook Balance Strip (Compact on Mobile & Desktop) */}
      <div className="p-4 sm:p-5 rounded-2xl pr-surface">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Primary Hero Balance */}
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-semibold text-muted-foreground-1 block">
              {bi(
                'صافي الصندوق الحالي (المقبوضات − المصاريف)',
                `Net Cash Balance (${currency.code})`,
                'سافی سندووقی ئێستا (وەرگیراو − خەرجی)'
              )}
            </span>
            <p
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums ${
                netCashFlowIQD < 0
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-foreground'
              }`}
            >
              <Money amount={netCashFlowIQD} />
            </p>
            <p className="text-xs text-muted-foreground-1 tabular-nums">
              <Num value={activeInvoices.length} />{' '}
              {bi('فاتورة سارية', 'active invoices', 'پسوولەی کارا')}
            </p>
          </div>

          {/* 3 Compact Interactive Counters */}
          <div data-tour="finance-balance-strip" className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[460px] tabular-nums">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`text-start p-3 rounded-2xl transition-colors cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-surface ring-1 ring-primary/25'
                  : 'bg-surface/65 hover:bg-surface'
              }`}
            >
              <span className="text-xs text-muted-foreground-1 block truncate">
                {bi('المقبوضات', 'Collected', 'وەرگیراو')}
              </span>
              <span className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block truncate">
                <Money amount={totalCollectedIQD} colorize={false} />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('debts')}
              className={`text-start p-3 rounded-2xl transition-colors cursor-pointer ${
                activeFilter === 'debts'
                  ? 'bg-amber-500/10 ring-1 ring-amber-500/35'
                  : 'bg-surface/65 hover:bg-surface'
              }`}
            >
              <span className="text-xs text-muted-foreground-1 flex items-center justify-between gap-1">
                <span className="truncate">{bi('الذمم', 'Debts', 'قەرزەکان')}</span>
                {debtorsCount > 0 && (
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300 shrink-0">
                    (<Num value={debtorsCount} />)
                  </span>
                )}
              </span>
              <span
                className={`text-sm sm:text-base font-bold mt-0.5 block truncate ${
                  totalDebtIQD > 0
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-muted-foreground-1'
                }`}
              >
                <Money amount={totalDebtIQD} colorize={false} />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('expenses')}
              className={`text-start p-3 rounded-2xl transition-colors cursor-pointer ${
                activeFilter === 'expenses'
                  ? 'bg-rose-500/10 ring-1 ring-rose-500/35'
                  : 'bg-surface/65 hover:bg-surface'
              }`}
            >
              <span className="text-xs text-muted-foreground-1 block truncate">
                {bi('المصاريف', 'Expenses', 'خەرجییەکان')}
              </span>
              <span className="text-sm sm:text-base font-bold text-rose-700 dark:text-rose-400 mt-0.5 block truncate">
                <Money amount={totalExpensesIQD} colorize={false} />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Unified Cashbook Feed Card: Search + Quick Filters + Content */}
      <div className="rounded-2xl pr-surface overflow-hidden">
        {/* Clean Toolbar: Instant Search + Compact Filter Switcher */}
        <div className="p-3 sm:p-4 border-b border-black/[0.045] dark:border-white/[0.06] flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Quick Filter Switcher */}
          <div className="pr-hscroll overflow-x-auto flex items-center gap-1 p-1 rounded-2xl bg-surface/75 whitespace-nowrap shrink-0">
            <button
              type="button"
              aria-pressed={activeFilter === 'all'}
              onClick={() => setActiveFilter('all')}
              className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 inline-flex items-center gap-1.5 ${
                activeFilter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground-1 hover:text-foreground hover:bg-card/70'
              }`}
            >
              <span>{bi('المرضى', 'Patients', 'نەخۆشەکان')}</span>
              {allPatientGroups.length > 0 && (
                <span className={`tabular-nums ${activeFilter === 'all' ? 'opacity-90' : 'text-muted-foreground-1'}`}>
                  (<Num value={allPatientGroups.length} />)
                </span>
              )}
            </button>

            <button
              type="button"
              aria-pressed={activeFilter === 'debts'}
              onClick={() => setActiveFilter('debts')}
              className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 inline-flex items-center gap-1.5 ${
                activeFilter === 'debts'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground-1 hover:text-foreground hover:bg-card/70'
              }`}
            >
              <span>{bi('عليهم ذمة', 'Debts', 'قەرزار')}</span>
              {debtorsCount > 0 && (
                <span
                  className={`tabular-nums ${
                    activeFilter === 'debts'
                      ? 'text-primary-foreground'
                      : 'text-orange-600 dark:text-orange-400'
                  }`}
                >
                  (<Num value={debtorsCount} />)
                </span>
              )}
            </button>

            {coursesCount > 0 && (
              <button
                type="button"
                aria-pressed={activeFilter === 'courses'}
                onClick={() => setActiveFilter('courses')}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 inline-flex items-center gap-1.5 ${
                  activeFilter === 'courses'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground hover:bg-card/70'
                }`}
              >
                <span>{bi('كورسات', 'Courses', 'کۆرسەکان')}</span>
                <span className="tabular-nums opacity-85">
                  (<Num value={coursesCount} />)
                </span>
              </button>
            )}

            <button
              type="button"
              aria-pressed={activeFilter === 'expenses'}
              aria-label={bi('مصاريف العيادة', 'Expenses', 'خەرجییەکانی کلینیک')}
              onClick={() => setActiveFilter('expenses')}
              className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 inline-flex items-center gap-1.5 ${
                activeFilter === 'expenses'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground-1 hover:text-foreground hover:bg-card/70'
              }`}
            >
              <span>{bi('المصاريف', 'Expenses', 'خەرجییەکان')}</span>
              {expenses.length > 0 && (
                <span className="tabular-nums opacity-85">
                  (<Num value={expenses.length} />)
                </span>
              )}
            </button>

            {installmentPlansEnabled && (
              <button
                type="button"
                aria-pressed={activeFilter === 'installments'}
                aria-label={bi('الأقساط وتقادم الديون', 'Installments & Aging', 'قیستەکان و دواکەوتنی قەرز')}
                onClick={() => setActiveFilter('installments')}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 inline-flex items-center gap-1.5 ${
                  activeFilter === 'installments'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground hover:bg-card/70'
                }`}
              >
                <span>{bi('الأقساط', 'Installments', 'قیستەکان')}</span>
                {agingSummary.totalOverdueCount > 0 && (
                  <span
                    className={`tabular-nums ${
                      activeFilter === 'installments'
                        ? 'text-primary-foreground'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    (<Num value={agingSummary.totalOverdueCount} />)
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Instant Search Input (hidden only on Installments panel which has its own controls) */}
          {activeFilter !== 'installments' && (
            <div className="relative flex items-center w-full md:w-72 rounded-xl border border-layer-line bg-layer focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-colors">
              <Search className="size-4 text-muted-foreground-1 ms-3 shrink-0 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeFilter === 'expenses'
                    ? bi('بحث في المصاريف...', 'Search expenses...', 'گەڕان لە خەرجییەکان...')
                    : bi('ابحث باسم المريض أو رقم الفاتورة...', 'Search patient or invoice #...', 'گەڕان بە ناو یان ژمارەی پسوولە...')
                }
                aria-label={bi('بحث في الحسابات', 'Search financial ledger', 'گەڕان لە هەژمارەکان')}
                className="pr-input-bare border-0 flex-1 min-w-0 px-2.5 py-2 text-xs bg-transparent text-foreground placeholder:text-muted-foreground-1 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={bi('مسح البحث', 'Clear search', 'سڕینەوەی گەڕان')}
                  className="p-1.5 me-1 rounded-lg text-muted-foreground-1 hover:text-foreground cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Filter Content */}
        {activeFilter === 'installments' && installmentPlansEnabled ? (
          <div className="p-4 sm:p-5">
            <Suspense fallback={null}>
              <InstallmentPlansAgingPanel
                invoices={invoices}
                patients={activePatients}
                onCollectPayment={(inv, suggestedAmountIQD) =>
                  openCollectPaymentForInvoice(inv, suggestedAmountIQD)
                }
                onInvoicesUpdated={setInvoices}
              />
            </Suspense>
          </div>
        ) : activeFilter === 'expenses' ? (
          <div className="space-y-4">
            {recurringExpensesEnabled && (
              <div className="p-4 sm:p-5 pb-0">
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
                <thead className="bg-surface/65">
                  <tr className="text-muted-foreground-1 font-semibold text-xs">
                    <th className="py-3 px-4 text-start">{bi('التاريخ', 'Date', 'بەروار')}</th>
                    <th className="py-3 px-4 text-start">{bi('البيان', 'Description', 'وردەکاری')}</th>
                    <th className="py-3 px-4 text-start">{bi('المسجل', 'Recorded By', 'تۆمارکراو')}</th>
                    <th className="py-3 px-4 text-end">{bi('المبلغ', 'Amount', 'بڕ')}</th>
                    <th className="py-3 px-4 text-end">{bi('إجراء', 'Action', 'کردار')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-divider">
                  {filteredExpenses.length === 0 ? (
                    <tr className="pr-empty-row">
                      <td colSpan={5} className="py-10 px-4 text-center text-muted-foreground-1">
                        {searchQuery.trim()
                          ? bi('لا توجد مصاريف مطابقة للبحث.', 'No expenses match your search.', 'هیچ خەرجییەک نەدۆزرایەوە.')
                          : bi('لا توجد مصاريف مسجلة (0 د.ع).', 'No clinic expenses recorded (0 IQD).', 'هیچ خەرجییەک تۆمار نەکراوە (0 د.ع).')}
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((exp) => (
                      <tr key={exp.id} className="tabular-nums hover:bg-surface/40 transition-colors">
                        <td
                          data-label={bi('التاريخ', 'Date', 'بەروار')}
                          className="py-3.5 px-4 tabular-nums text-muted-foreground-1 whitespace-nowrap"
                        >
                          <bdi dir="ltr">{formatDateDDMMYYYY(exp.date)}</bdi>
                        </td>
                        <td
                          data-label={bi('البيان', 'Description', 'وردەکاری')}
                          className="py-3.5 px-4 font-bold text-foreground pr-cell-primary md:table-cell"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{language === 'en' ? exp.titleEn : exp.titleAr}</span>
                            {exp.isDemo && <DemoBadge />}
                            <span className="text-xs font-medium text-muted-foreground-1">
                              ·{' '}
                              {bi(
                                getExpenseCategoryDisplayLabel(exp, true),
                                getExpenseCategoryDisplayLabel(exp, false),
                                exp.customCategoryLabel?.trim() ||
                                  EXPENSE_CATEGORY_CKB[exp.category] ||
                                  EXPENSE_CATEGORY_CKB.marketing_other
                              )}
                            </span>
                            {exp.recurringTemplateId && (
                              <span className="text-xs font-semibold text-primary">
                                · {bi('متكرر', 'Recurring', 'دووبارەبوو')}
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
                          data-label={bi('المسجل', 'Recorded By', 'تۆمارکراو')}
                          className="py-3.5 px-4 text-muted-foreground-1"
                        >
                          {exp.paidBy}
                        </td>
                        <td
                          data-label={bi('المبلغ', 'Amount', 'بڕ')}
                          className="py-3.5 px-4 text-end font-bold text-rose-700 dark:text-rose-300 tabular-nums whitespace-nowrap"
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
            {filteredPatientGroups.length === 0 ? (
              <div
                data-testid="finance-invoices-empty-state"
                className="py-10 px-4 text-center text-muted-foreground-1 space-y-3"
              >
                <p className="text-xs font-semibold text-foreground">
                  {searchQuery.trim()
                    ? bi(
                        'لا توجد نتائج مطابقة للبحث.',
                        'No matching patient accounts found.',
                        'هیچ هەژمارێک بەم گەڕانە نەدۆزرایەوە.'
                      )
                    : activeFilter === 'debts'
                      ? bi(
                          'ممتاز! لا توجد أي ذمم أو ديون متبقية على المرضى.',
                          'All clear! No outstanding patient debts.',
                          'هیچ قەرزێکی ماوە لەسەر نەخۆشەکان نییە.'
                        )
                      : bi(
                          'لا توجد فواتير أو باقات علاجية مسجلة بعد — أنشئ أول فاتورة جلسة أو كورس علاجي لمتابعة المقبوضات والديون.',
                          'No invoices or treatment packages recorded yet — issue your first session or course invoice to track collections and balances.',
                          'هێشتا هیچ پسوولە یان پاکێجێکی چارەسەری تۆمار نەکراوە — یەکەم پسوولەی دانیشتن یان کۆرس دروست بکە.'
                        )}
                </p>
                {!searchQuery.trim() && activeFilter === 'all' && (
                  <div className="mt-2">
                    <button
                      type="button"
                      data-testid="finance-empty-primary-btn"
                      onClick={() => {
                        handleInvoicePresetChange('single_session', '');
                        setShowNewInvoiceForm(true);
                        setShowNewExpenseForm(false);
                      }}
                      className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <span>{bi('+ إصدار فاتورة', '+ New Invoice', '+ دەرکردنی پسوولە')}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredPatientGroups.map((group) => {
                  const hasDebt = group.totalDueIQD > 0;
                  const allVoided = group.activeCount === 0 && group.voidCount > 0;
                  const pkg = group.activePackage;
                  const pkgUsed = pkg?.packageUsedSessions || 0;
                  const pkgTotal = pkg?.packageTotalSessions || 0;
                  const pkgPct =
                    pkgTotal > 0 ? Math.min(100, Math.round((pkgUsed / pkgTotal) * 100)) : 0;

                  return (
                    <div
                      key={group.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedPatientLedgerKey(group.key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedPatientLedgerKey(group.key);
                        }
                      }}
                      className={`text-start p-4 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between gap-3 ${
                        allVoided
                          ? 'bg-rose-500/5 border-rose-500/20 opacity-75'
                          : 'bg-card border-card-line/80 hover:border-primary/45 hover:shadow-xs'
                      }`}
                    >
                      {/* Top Row: Avatar + Name + Status */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="size-9 rounded-full bg-primary/10 text-primary font-extrabold text-xs flex items-center justify-center shrink-0">
                            {group.patientName.trim().slice(0, 1) || <User className="size-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold text-foreground truncate max-w-[175px]">
                                {group.patientName}
                              </span>
                              {group.isDemo && <DemoBadge />}
                            </div>
                            <div className="text-xs text-muted-foreground-1 flex items-center gap-1.5 tabular-nums mt-0.5">
                              <span>
                                <Num value={group.invoices.length} />{' '}
                                {bi(
                                  group.invoices.length === 1 ? 'فاتورة' : 'فواتير',
                                  group.invoices.length === 1 ? 'invoice' : 'invoices',
                                  'پسوولە'
                                )}
                              </span>
                              <span>·</span>
                              <bdi dir="ltr">{formatDateDDMMYYYY(group.latestDate)}</bdi>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-end">
                          {allVoided ? (
                            <span className="text-xs font-bold text-rose-700 dark:text-rose-400">
                              {bi('ملغاة', 'Voided', 'هەڵوەشاوە')}
                            </span>
                          ) : hasDebt ? (
                            <span className="text-xs font-extrabold text-orange-600 dark:text-orange-400 tabular-nums inline-flex items-center gap-1">
                              <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
                              <Money amount={group.totalDueIQD} colorize={false} />
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                              <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
                              {bi('مسدد', 'Paid', 'دراوە')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle Clean 3-Stat Strip (Min 12px, Zero Nested Borders) */}
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-surface/65 text-center tabular-nums">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground-1">
                            {bi('الصافي', 'Net', 'پوختە')}
                          </div>
                          <div className="text-xs font-bold text-foreground truncate mt-0.5">
                            <Money amount={group.totalNetIQD} colorize={false} />
                          </div>
                        </div>
                        <div className="min-w-0 border-x border-black/[0.05] dark:border-white/[0.07] px-1">
                          <div className="text-xs text-muted-foreground-1">
                            {bi('المدفوع', 'Paid', 'دراو')}
                          </div>
                          <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 truncate mt-0.5">
                            <Money amount={group.totalPaidIQD} colorize={false} />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground-1">
                            {bi('المتبقي', 'Due', 'ماوە')}
                          </div>
                          <div
                            className={`text-xs font-bold truncate mt-0.5 ${
                              hasDebt
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-muted-foreground-1'
                            }`}
                          >
                            <Money amount={group.totalDueIQD} colorize={false} />
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row: Package Progress OR Latest Service + 1-Tap Collect / Details */}
                      <div className="flex items-center justify-between gap-2 text-xs pt-0.5">
                        {pkgTotal > 0 ? (
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono font-bold text-primary shrink-0">
                              <Fraction value={pkgUsed} total={pkgTotal} />
                            </span>
                            <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden max-w-[90px]">
                              <div
                                className="h-full rounded-full bg-primary transition-all duration-300"
                                style={{ width: `${pkgPct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground-1 truncate min-w-0 flex-1">
                            {language === 'en'
                              ? group.invoices[0]?.titleEn
                              : group.invoices[0]?.titleAr}
                          </span>
                        )}

                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasDebt && group.firstOpenDebtInvoice && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCollectPaymentForInvoice(group.firstOpenDebtInvoice!);
                              }}
                              className="compact-btn h-8 px-2.5 rounded-xl bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Coins className="size-3.5 shrink-0" />
                              <span>{bi('قبض', 'Collect', 'وەرگرتن')}</span>
                            </button>
                          )}

                          <span className="inline-flex items-center gap-0.5 font-bold text-muted-foreground-1 group-hover:text-primary transition-colors">
                            <span>{bi('التفاصيل', 'Details', 'وردەکاری')}</span>
                            {isRtl ? (
                              <ChevronLeft className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slide-Over Drawer: Patient Financial Details (Keeps Cashbook Context Behind) */}
      <DrawerDialog
        isOpen={Boolean(selectedPatientGroup)}
        onOpenChange={(open) => {
          if (!open) setSelectedPatientLedgerKey(null);
        }}
        side="end"
        dir={isRtl ? 'rtl' : 'ltr'}
        maxWidthClassName="max-w-xl"
        className="bg-card"
        title={selectedPatientGroup?.patientName || ''}
        subtitle={
          selectedPatientGroup
            ? bi(
                `سجل الفواتير والمدفوعات (${selectedPatientGroup.invoices.length})`,
                `Invoices & Payments (${selectedPatientGroup.invoices.length})`,
                `تۆماری پسوولە و پارەدانەکان (${selectedPatientGroup.invoices.length})`
              )
            : undefined
        }
        ariaLabel={bi('تفاصيل المريض المالية', 'Patient Financial Details', 'وردەکاری دارایی نەخۆش')}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      >
        {selectedPatientGroup && (
          <div className="space-y-4">
            {/* Patient Overall Totals Strip + Quick Bill Button */}
            <div className="p-3.5 rounded-2xl bg-surface/70 space-y-3 tabular-nums">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-muted-foreground-1">
                    {bi('الصافي', 'Net', 'کۆی پوختە')}
                  </div>
                  <div className="text-sm font-extrabold text-foreground mt-0.5">
                    <Money amount={selectedPatientGroup.totalNetIQD} colorize={false} />
                  </div>
                </div>
                <div className="border-x border-black/[0.06] dark:border-white/[0.08] px-2">
                  <div className="text-xs text-muted-foreground-1">
                    {bi('المدفوع', 'Paid', 'پارەدراو')}
                  </div>
                  <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    <Money amount={selectedPatientGroup.totalPaidIQD} colorize={false} />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground-1">
                    {bi('المتبقي', 'Due', 'ماوە / قەرز')}
                  </div>
                  <div
                    className={`text-sm font-extrabold mt-0.5 ${
                      selectedPatientGroup.totalDueIQD > 0
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    <Money amount={selectedPatientGroup.totalDueIQD} colorize={false} />
                  </div>
                </div>
              </div>

              {selectedPatientGroup.patientId && (
                <button
                  type="button"
                  onClick={() => {
                    const pid = selectedPatientGroup.patientId;
                    setSelectedPatientLedgerKey(null);
                    handleInvoicePresetChange('single_session', pid);
                    setShowNewInvoiceForm(true);
                  }}
                  className="w-full min-h-[36px] py-2 px-3 rounded-xl bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{bi('إصدار فاتورة جديدة لهذا المريض', 'New Invoice for This Patient', 'دەرکردنی پسوولەی نوێ بۆ ئەم نەخۆشە')}</span>
                </button>
              )}
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
                        : 'bg-card border-card-line'
                    }`}
                  >
                    {/* Invoice Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="font-mono font-bold text-foreground">
                            <bdi dir="ltr">{inv.invoiceNumber}</bdi>
                          </span>
                          <span className="text-muted-foreground-1">
                            <bdi dir="ltr">{formatDateDDMMYYYY(inv.date)}</bdi>
                          </span>
                          {isVoided && (
                            <span className="text-rose-700 dark:text-rose-400 font-bold">
                              ·{' '}
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

                      <div className="text-end shrink-0 text-xs font-bold">
                        {isVoided ? (
                          <span className="text-rose-700 dark:text-rose-400">
                            {bi('إشعار دائن', 'Credit Note', 'ئاگاداری دائن')}
                          </span>
                        ) : inv.balanceDueIQD > 0 ? (
                          <span className="text-orange-600 dark:text-orange-400 inline-flex items-center gap-1">
                            <span>{bi('متبقي: ', 'Due: ', 'ماوە: ')}</span>
                            <Money amount={inv.balanceDueIQD} colorize={false} />
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {bi('مسدد بالكامل', 'Paid in Full', 'بە تەواوی دراوە')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metadata Line (Location, Travel, Installments, Void Reason) */}
                    {((practiceLocationsEnabled && rowLocation) ||
                      (inv.travelFeeIQD && inv.travelFeeIQD > 0) ||
                      (installmentPlansEnabled &&
                        inv.installmentPlan &&
                        inv.installmentPlan.length > 0) ||
                      (isVoided && inv.voidReason)) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground-1">
                        {practiceLocationsEnabled && rowLocation && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5 text-primary" />
                            <span>
                              {language === 'en'
                                ? rowLocation.nameEn || rowLocation.nameAr
                                : rowLocation.nameAr}
                            </span>
                          </span>
                        )}
                        {inv.travelFeeIQD && inv.travelFeeIQD > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <span>{bi('تنقل:', 'Travel:', 'هاتوچۆ:')}</span>
                            <Money amount={inv.travelFeeIQD} colorize={false} />
                          </span>
                        ) : null}
                        {installmentPlansEnabled &&
                          inv.installmentPlan &&
                          inv.installmentPlan.length > 0 && (
                            <span className="inline-flex items-center gap-1 font-semibold text-primary">
                              <CalendarClock className="size-3.5" />
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
                          <span className="text-rose-700 dark:text-rose-300">
                            {bi('سبب الإلغاء: ', 'Void reason: ', 'هۆکار: ')}
                            {inv.voidReason}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Amounts Row */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-surface/65 text-xs">
                      <div>
                        <span className="text-muted-foreground-1 block">
                          {bi('الصافي', 'Net', 'پوختە')}
                        </span>
                        <span className="font-mono font-bold text-foreground">
                          <Money amount={inv.netAmountIQD} />
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground-1 block">
                          {bi('المدفوع', 'Paid', 'پارەدراو')}
                        </span>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                          <Money amount={inv.paidAmountIQD} />
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground-1 block">
                          {bi('المتبقي', 'Balance Due', 'ماوە / قەرز')}
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            inv.balanceDueIQD > 0 && !isVoided
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-foreground'
                          }`}
                        >
                          <Money amount={inv.balanceDueIQD} />
                        </span>
                      </div>
                    </div>

                    {/* Course Visits Progress */}
                    {inv.packageTotalSessions ? (
                      <div className="p-2.5 rounded-xl bg-surface/65 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground-1 font-medium">
                              {bi('استهلاك الكورس:', 'Course Visits:', 'سەردانەکانی کۆرس:')}
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
                              className="compact-btn h-7 px-2.5 rounded-lg bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary text-xs font-semibold transition-colors cursor-pointer"
                            >
                              {bi('تعديل', 'Adjust', 'دەستکاری')}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground-1">
                              {bi('تلقائي عند الاعتماد', 'Auto on Finalize', 'خۆکار')}
                            </span>
                          )}
                        </div>
                        <div className="flex w-full h-1.5 bg-card rounded-full overflow-hidden">
                          <div
                            className="flex flex-col justify-center rounded-full overflow-hidden bg-primary transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Actions Toolbar */}
                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-black/[0.045] dark:border-white/[0.06]">
                      {!isVoided && inv.balanceDueIQD > 0 && (
                        <button
                          type="button"
                          onClick={() => openCollectPaymentForInvoice(inv)}
                          className="min-h-[34px] py-1.5 px-3 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {bi('قبض دفعة', 'Collect', 'وەرگرتنی پارە')}
                        </button>
                      )}

                      {installmentPlansEnabled && !isVoided && inv.balanceDueIQD > 0 && (
                        <button
                          type="button"
                          onClick={() => setInstallmentBuilderInvoice(inv)}
                          className="min-h-[34px] py-1.5 px-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
                        >
                          <CalendarClock className="size-3.5" />
                          <span>
                            {inv.installmentPlan && inv.installmentPlan.length > 0
                              ? bi('الأقساط', 'Plan', 'قیستەکان')
                              : bi('أقساط', 'Installments', 'قیست')}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPrintDoc({ type: 'invoice', invoice: inv })}
                        className="min-h-[34px] px-2.5 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
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
                        className="min-h-[34px] px-2.5 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                        title={bi('الدفعات والوصولات', 'Payments & Receipts', 'پارەدانەکان')}
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
                            className="min-h-[34px] min-w-[34px] p-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 inline-flex items-center justify-center"
                            title={bi('إرسال الوصل عبر واتساب', 'Send Receipt via WhatsApp', 'ناردن بە WhatsApp')}
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
                          className="min-h-[34px] min-w-[34px] text-muted-foreground-1 hover:text-rose-700 dark:hover:text-rose-300 p-1.5 rounded-xl hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer"
                          title={bi('إلغاء فاتورة بإشعار دائن', 'Void with Credit Note', 'هەڵوەشاندنەوە')}
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
      </DrawerDialog>

      {/* Right-Side Sheet: Streamlined New Invoice / Rehab Package Form */}
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
          'إصدار فاتورة علاج طبيعي أو كورس',
          'Create Invoice or Course',
          'دەرکردنی پسوولە یان کۆرس'
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
                `إصدار فاتورة جديدة (${currency.symbolAr})`,
                `New Invoice (${currency.code})`,
                `دەرکردنی پسوولەی نوێ (${currency.symbolAr})`
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
            {/* 1. Invoice Type Presets */}
            <div>
              <span className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('نوع الفاتورة:', 'Invoice Type:', 'جۆری پسوولە:')}
              </span>
              <div className="grid grid-cols-3 gap-2">
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
                    className={`min-h-[36px] py-2 px-2.5 rounded-xl text-xs font-semibold text-center transition-all cursor-pointer ${
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
                  placeholder={bi('مثال: 10', 'e.g. 10', 'نموونە: 10')}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground tabular-nums focus:outline-none focus:border-primary"
                />
              </div>
            )}

            {/* 2. Patient Picker (with Instant Filter when >6 patients) */}
            <div className="space-y-1.5">
              <label htmlFor="fin-inv-patient" className="text-xs font-semibold text-foreground block">
                {bi('المريض (إلزامي):', 'Patient (Required):', 'نەخۆش (پێویستە):')}
              </label>
              {activePatients.length > 6 && (
                <div className="relative flex items-center rounded-xl border border-layer-line bg-surface/50 focus-within:border-primary">
                  <Search className="size-3.5 text-muted-foreground-1 ms-2.5 shrink-0" />
                  <input
                    type="text"
                    value={invPatientSearch}
                    onChange={(e) => setInvPatientSearch(e.target.value)}
                    placeholder={bi('تصفية سريعة باسم المريض...', 'Quick filter patient...', 'گەڕانی خێرا بۆ نەخۆش...')}
                    className="pr-input-bare border-0 flex-1 min-w-0 px-2 py-1.5 text-xs bg-transparent text-foreground focus:outline-none"
                  />
                </div>
              )}
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
                {filteredModalPatients.map((p, idx) => (
                  <option key={p.id} value={p.id}>
                    {p.data.fullNameAr || p.data.fullName} ({getPatientMrn(p, idx)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="fin-inv-title" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('بيان الخدمة:', 'Service Description:', 'بەیانی خزمەتگوزاری:')}
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
                  {bi('موقع تقديم الخدمة (اختياري):', 'Practice Location (Optional):', 'شوێنی کار (ئارەزوومەندانە):')}
                </label>
                <select
                  id="fin-inv-location"
                  value={invLocationId}
                  onChange={(e) => setInvLocationId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="">
                    {bi('-- غير محدد / عام --', '-- Unassigned / General --', '-- گشتی --')}
                  </option>
                  {activePracticeLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {bi(loc.nameAr, loc.nameEn || loc.nameAr)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 3. Amounts (Blank/Zero Defaults Preserved per R2) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="fin-inv-total" className="text-xs font-semibold text-foreground block mb-1.5">
                  {homeVisitsEnabled
                    ? bi('رسوم الخدمة:', 'Service Amount:', 'کرێی خزمەتگوزاری:')
                    : bi(`المبلغ الكلي (${currency.symbolAr}):`, `Total (${currency.code}):`, `کۆی بڕ (${currency.symbolAr}):`)}
                </label>
                <MoneyInput
                  id="fin-inv-total"
                  ariaLabel={
                    homeVisitsEnabled
                      ? bi('رسوم الخدمة العلاجية', 'Service Amount', 'کرێی خزمەتگوزاری')
                      : bi('المبلغ الكلي', 'Total Amount', 'کۆی بڕی پارە')
                  }
                  value={invTotalIQD}
                  onChange={setInvTotalIQD}
                />
              </div>

              <div>
                <label htmlFor="fin-inv-discount" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi(`الخصم (${currency.symbolAr}):`, `Discount (${currency.code}):`, `داشکاندن (${currency.symbolAr}):`)}
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
                  {bi('أجرة التنقل / الزيارة المنزلية (اختياري):', 'Home Visit Travel Fee (Optional):', 'کرێی هاتوچۆ (ئارەزوومەندانە):')}
                </label>
                <MoneyInput
                  id="fin-inv-travel"
                  ariaLabel={bi('أجرة التنقل', 'Home Visit Travel Fee', 'کرێی هاتوچۆ')}
                  value={invTravelFeeIQD}
                  onChange={setInvTravelFeeIQD}
                />
              </div>
            )}

            {/* 4. Paid Today + One-Tap "Paid in Full" + Payment Method + Optional FX */}
            {(() => {
              const effTravel = homeVisitsEnabled ? Math.max(0, invTravelFeeIQD) : 0;
              const effTotal = Math.max(0, invTotalIQD) + effTravel;
              const netDue = Math.max(0, effTotal - Math.max(0, invDiscountIQD));

              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {invPayCurrency === currency.code && (
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <label htmlFor="fin-inv-paid" className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            {bi('المقبوض الآن:', 'Paid Now:', 'وەرگیراوی ئێستا:')}
                          </label>
                          {netDue > 0 && invPaidIQD !== netDue && (
                            <button
                              type="button"
                              onClick={() => setInvPaidIQD(netDue)}
                              className="text-xs font-bold text-primary hover:underline cursor-pointer"
                            >
                              {bi('مدفوع بالكامل', 'Pay full', 'تەواوی بڕ')}
                            </button>
                          )}
                        </div>
                        <MoneyInput
                          id="fin-inv-paid"
                          ariaLabel={bi('المبلغ المقبوض الآن', 'Paid Today', 'بڕی وەرگیراوی ئێستا')}
                          value={invPaidIQD}
                          onChange={setInvPaidIQD}
                          className="w-full py-2 text-xs rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-foreground font-bold tabular-nums focus:outline-none"
                        />
                      </div>
                    )}

                    <div className={invPayCurrency !== currency.code ? 'sm:col-span-2' : ''}>
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

                  {invMethod === 'other' && (
                    <div>
                      <label htmlFor="fin-inv-custom-method" className="text-xs font-semibold text-foreground block mb-1.5">
                        {bi('أدخل وسيلة الدفع الأخرى:', 'Enter Custom Payment Method:', 'شێوازی پارەدانی تر:')}
                      </label>
                      <input
                        id="fin-inv-custom-method"
                        type="text"
                        value={invCustomMethod}
                        onChange={(e) => setInvCustomMethod(e.target.value)}
                        placeholder={bi('مثال: شيك، تحويل خاص...', 'e.g. Check, custom transfer...', 'نموونە: چەک، حەواڵە...')}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  )}

                  {/* Progressive Disclosure for Foreign Currency */}
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        if (showInvFxOptions) {
                          setShowInvFxOptions(false);
                          setInvPayCurrency(currency.code);
                          setInvPayOrigAmount('');
                          setInvPayFxRate('');
                        } else {
                          setShowInvFxOptions(true);
                        }
                      }}
                      className="text-xs font-semibold text-muted-foreground-1 hover:text-primary inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Globe className="size-3.5" />
                      <span>
                        {showInvFxOptions
                          ? bi(`العودة للعملة الأساسية (${currency.symbolAr})`, `Use ${currency.code}`, `گەڕانەوە بۆ ${currency.symbolAr}`)
                          : bi('الدفع بعملة أخرى (مثل USD)؟', 'Pay in another currency?', 'پارەدان بە دراوێکی تر؟')}
                      </span>
                    </button>

                    {showInvFxOptions && (
                      <div className="mt-2 p-3 rounded-xl bg-surface/65 border border-line-2 space-y-2.5">
                        <div>
                          <label htmlFor="fin-inv-pay-currency" className="text-xs font-semibold text-foreground block mb-1">
                            {bi('عملة الدفعة المستلمة:', 'Payment Currency:', 'دراوی پارەدان:')}
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

                        {invPayCurrency !== currency.code && (
                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label htmlFor="fin-inv-fx-amt" className="text-xs font-semibold text-foreground block mb-1">
                                {bi(`المبلغ (${invPayCurrency}):`, `Paid (${invPayCurrency}):`, `بڕ (${invPayCurrency}):`)}
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
                                {bi(`سعر الصرف (1 ${invPayCurrency}):`, `FX Rate:`, `نرخی گۆڕینەوە:`)}
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
                      </div>
                    )}
                  </div>

                  {invError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                      {invError}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Optional Installment Plan (Module-Gated) */}
            {installmentPlansEnabled && (() => {
              const effPaidPreview =
                invPayCurrency === currency.code
                  ? invPaidIQD
                  : Math.round(Number(invPayOrigAmount || 0) * Number(invPayFxRate || 0));
              const effTravelPreview = homeVisitsEnabled ? Math.max(0, invTravelFeeIQD) : 0;
              const effTotalPreview = Math.max(0, invTotalIQD) + effTravelPreview;
              const netDuePreview = Math.max(0, effTotalPreview - Math.max(0, invDiscountIQD));
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
                <div className="p-3.5 rounded-xl bg-surface/65 border border-line-2 space-y-3">
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
                        'چالاککردنی پلانی قیست (ئارەزوومەندانە)'
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
                            onChange={(e) => setInvInstallmentCount(Number(e.target.value))}
                            className="w-full px-2.5 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                          >
                            {Array.from({ length: 11 }, (_, idx) => idx + 2).map((num) => (
                              <option key={num} value={num}>
                                {num}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor="fin-inv-inst-interval" className="text-xs font-semibold text-foreground block mb-1">
                            {bi('الفاصل الزمني:', 'Interval:', 'ماوە:')}
                          </label>
                          <select
                            id="fin-inv-inst-interval"
                            value={invInstallmentIntervalDays}
                            onChange={(e) => setInvInstallmentIntervalDays(Number(e.target.value))}
                            className="w-full px-2.5 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                          >
                            <option value={7}>{bi('كل 7 أيام', 'Every 7 days', 'هەموو 7 ڕۆژ')}</option>
                            <option value={14}>{bi('كل 14 يوماً', 'Every 14 days', 'هەموو 14 ڕۆژ')}</option>
                            <option value={30}>{bi('كل 30 يوماً', 'Every 30 days', 'هەموو 30 ڕۆژ')}</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="fin-inv-inst-start" className="text-xs font-semibold text-foreground block mb-1">
                          {bi('تاريخ القسط الأول:', 'First Due Date:', 'بەرواری قیستی یەکەم:')}
                        </label>
                        <DatePickerInput
                          id="fin-inv-inst-start"
                          ariaLabel={bi('تاريخ القسط الأول', 'First Due Date', 'بەرواری قیستی یەکەم')}
                          value={invInstallmentStartDate}
                          onChange={setInvInstallmentStartDate}
                        />
                      </div>

                      {previewSchedule.length > 0 && (
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
                              + {previewSchedule.length - 4} {bi('أقساط أخرى', 'more', 'قیستی تر')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Compact Live Invoice Summary */}
            {(() => {
              const effPaid =
                invPayCurrency === currency.code
                  ? invPaidIQD
                  : Math.round(Number(invPayOrigAmount || 0) * Number(invPayFxRate || 0));
              const effTravel = homeVisitsEnabled ? Math.max(0, invTravelFeeIQD) : 0;
              const effTotal = Math.max(0, invTotalIQD) + effTravel;
              const netDue = Math.max(0, effTotal - Math.max(0, invDiscountIQD));
              const remaining = Math.max(0, netDue - Math.max(0, effPaid));
              return (
                <div className="p-3.5 rounded-xl bg-surface/65 space-y-1.5 text-xs font-mono tabular-nums">
                  <div className="flex justify-between font-bold text-foreground">
                    <span>{bi('الصافي المطلوب:', 'Net Due:', 'بڕی سافی:')}</span>
                    <Money amount={netDue} />
                  </div>
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-300">
                    <span>{bi('المدفوع الآن:', 'Paid Now:', 'دراوی ئێستا:')}</span>
                    <Money amount={Math.min(netDue, Math.max(0, effPaid))} />
                  </div>
                  <div className="flex justify-between font-bold text-orange-600 dark:text-orange-400 border-t border-black/[0.06] dark:border-white/[0.08] pt-1.5">
                    <span>{bi('المتبقي بالذمة:', 'Remaining:', 'بڕی ماوە:')}</span>
                    <Money amount={remaining} colorize={false} />
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
              className="min-h-[36px] py-2 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-xs cursor-pointer"
            >
              {bi(
                'إصدار الفاتورة وحفظ الوصل',
                'Issue Invoice & Receipt',
                'دەرکردنی پسوولە و پاشەکەوتکردن'
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
        ariaLabel={bi('تسجيل مصروف تشغيلي للعيادة', 'Log Clinic Expense', 'تۆمارکردنی خەرجیی کلینیک')}
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
                `تسجيل مصروف (${currency.symbolAr})`,
                `Log Expense (${currency.code})`,
                `تۆمارکردنی خەرجی (${currency.symbolAr})`
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
                  {bi('مستلزمات طبية واستهلاكية', 'Medical Consumables', 'پێداویستی پزیشکی')}
                </option>
                <option value="equipment_maintenance">
                  {bi('صيانة وشراء أجهزة علاج طبيعي', 'Equipment & Maintenance', 'ئامێر و چاککردنەوە')}
                </option>
                <option value="electricity_generator">
                  {bi('كهرباء واشتراك المولدة', 'Electricity & Generator', 'کارەبا و موەلیدە')}
                </option>
                <option value="rent">{bi('إيجار العيادة', 'Clinic Rent', 'کرێی کلینیک')}</option>
                <option value="staff_salaries">{bi('رواتب ومكافآت الكادر', 'Staff Salaries', 'مووچەی ستاف')}</option>
                <option value="marketing_other">{bi('مصاريف إدارية أخرى', 'Other Admin Expenses', 'خەرجیی تر')}</option>
              </select>
            </div>
            {expCategory === 'marketing_other' && (
              <div>
                <label htmlFor="fin-exp-custom-cat" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('تسمية فئة مخصصة (اختياري):', 'Custom Category (Optional):', 'ناوی پۆلی تایبەت:')}
                </label>
                <input
                  id="fin-exp-custom-cat"
                  type="text"
                  value={expCustomCategoryLabel}
                  onChange={(e) => setExpCustomCategoryLabel(e.target.value)}
                  placeholder={bi('مثال: اشتراك برامج، نثريات...', 'e.g., Software, petty cash...', 'نموونە: نەسریە...')}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            )}
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
                placeholder={bi('مثال: شراء لفافات مطاطية TheraBand...', 'e.g., TheraBand rolls...', 'نموونە: کڕینی TheraBand...')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="fin-exp-amt" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi(`المبلغ (${currency.symbolAr}):`, `Amount (${currency.code}):`, `بڕ (${currency.symbolAr}):`)}
              </label>
              <MoneyInput
                id="fin-exp-amt"
                ariaLabel={bi('مبلغ المصروف', 'Expense amount', 'بڕی خەرجی')}
                value={expAmountIQD}
                onChange={setExpAmountIQD}
              />
            </div>
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
              <label htmlFor="fin-exp-notes" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('ملاحظات (اختياري):', 'Notes (Optional):', 'تێبینی (ئارەزوومەندانە):')}
              </label>
              <input
                id="fin-exp-notes"
                type="text"
                value={expNotes}
                onChange={(e) => setExpNotes(e.target.value)}
                placeholder={bi('تفاصيل إضافية أو رقم وصل...', 'Details or receipt ref...', 'وردەکاری یان ژمارەی وەسڵ...')}
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
              className="min-h-[36px] py-2 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
            >
              <span>{bi('حفظ المصروف', 'Save Expense', 'پاشەکەوتکردنی خەرجی')}</span>
            </button>
          </div>
        </form>
      </DrawerDialog>

      {/* Unified Reports, Z-Report & CSV Export Modal */}
      {showReportsModal && (
        <Suspense fallback={null}>
          <FinanceReportsModal
            isOpen={showReportsModal}
            onClose={() => setShowReportsModal(false)}
            invoices={invoices}
            expenses={expenses}
            cashCloses={cashCloses}
            practiceLocationsEnabled={practiceLocationsEnabled}
            practiceLocations={practiceLocations}
            onCashClosesUpdated={setCashCloses}
            onPrintZReport={(rep) => setPrintDoc({ type: 'z_report', zReport: rep })}
          />
        </Suspense>
      )}

      {/* Collect Payment Modal */}
      <ModalDialog
        isOpen={Boolean(selectedInvoiceForPayment)}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoiceForPayment(null);
        }}
        title={
          selectedInvoiceForPayment
            ? bi(
                `استلام دفعة: ${selectedInvoiceForPayment.patientName}`,
                `Collect Payment: ${selectedInvoiceForPayment.patientName}`,
                `وەرگرتنی پارە: ${selectedInvoiceForPayment.patientName}`
              )
            : ''
        }
        subtitle={
          selectedInvoiceForPayment ? (
            <span className="font-mono">
              <bdi dir="ltr">{selectedInvoiceForPayment.invoiceNumber}</bdi> ·{' '}
              {bi('المتبقي: ', 'Balance Due: ', 'ماوە: ')}
              <Money amount={selectedInvoiceForPayment.balanceDueIQD} colorize={false} />
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
              {paymentCurrency === currency.code && (
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
                    className="w-full py-2 text-xs rounded-xl bg-layer border border-layer-line tabular-nums font-bold text-foreground"
                  />
                </div>
              )}

              <div className={paymentCurrency !== currency.code ? 'sm:col-span-2' : ''}>
                <label htmlFor="fin-pay-method" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('وسيلة الدفع:', 'Payment Method:', 'شێوازی پارەدان:')}
                </label>
                <select
                  id="fin-pay-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as IraqiPaymentMethod)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                >
                  {Object.entries(paymentMethodLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {bi(v.ar, v.en, v.ckb)}
                    </option>
                  ))}
                </select>
              </div>

              {paymentMethod === 'other' && (
                <div className="sm:col-span-2">
                  <label htmlFor="fin-pay-custom-method" className="text-xs font-semibold text-foreground block mb-1.5">
                    {bi('حدد وسيلة الدفع الأخرى:', 'Specify Custom Method:', 'شێوازی پارەدانی تر:')}
                  </label>
                  <input
                    id="fin-pay-custom-method"
                    type="text"
                    value={paymentCustomMethod}
                    onChange={(e) => setPaymentCustomMethod(e.target.value)}
                    placeholder={bi('مثال: شيك، حوالة خاصة...', 'e.g. Check, custom transfer...', 'نموونە: چەک...')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label htmlFor="fin-pay-note" className="text-xs font-semibold text-foreground block mb-1.5">
                  {bi('ملاحظات الوصل (اختياري):', 'Receipt Notes (Optional):', 'تێبینیی وەسڵ:')}
                </label>
                <input
                  id="fin-pay-note"
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder={bi('مثال: الدفعة الثانية من الكورس...', 'Second installment...', 'نموونە: قیستی دووەم...')}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground"
                />
              </div>
            </div>

            {/* Progressive Disclosure for Foreign Currency */}
            <div>
              <button
                type="button"
                onClick={() => {
                  if (showPayFxOptions) {
                    setShowPayFxOptions(false);
                    setPaymentCurrency(currency.code);
                    setPaymentOrigAmount('');
                    setPaymentFxRate('');
                  } else {
                    setShowPayFxOptions(true);
                  }
                }}
                className="text-xs font-semibold text-muted-foreground-1 hover:text-primary inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Globe className="size-3.5" />
                <span>
                  {showPayFxOptions
                    ? bi(`العودة للعملة الأساسية (${currency.symbolAr})`, `Use ${currency.code}`, `گەڕانەوە بۆ ${currency.symbolAr}`)
                    : bi('الدفع بعملة أخرى (مثل USD)؟', 'Pay in another currency?', 'پارەدان بە دراوێکی تر؟')}
                </span>
              </button>

              {showPayFxOptions && (
                <div className="mt-2 p-3 rounded-xl bg-surface/65 border border-line-2 space-y-2.5">
                  <div>
                    <label htmlFor="fin-pay-currency" className="text-xs font-semibold text-foreground block mb-1">
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
                      className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground"
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

                  {paymentCurrency !== currency.code && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="fin-pay-fx-amt" className="text-xs font-semibold text-foreground block mb-1">
                          {bi(`المبلغ (${paymentCurrency}):`, `Amount (${paymentCurrency}):`, `بڕ (${paymentCurrency}):`)}
                        </label>
                        <input
                          id="fin-pay-fx-amt"
                          type="number"
                          step="any"
                          min={0}
                          value={paymentOrigAmount}
                          onChange={(e) => setPaymentOrigAmount(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line tabular-nums font-mono font-bold text-foreground"
                        />
                      </div>
                      <div>
                        <label htmlFor="fin-pay-fx-rate" className="text-xs font-semibold text-foreground block mb-1">
                          {bi(`سعر الصرف (1 ${paymentCurrency}):`, `FX Rate:`, `نرخی گۆڕینەوە:`)}
                        </label>
                        <input
                          id="fin-pay-fx-rate"
                          type="number"
                          step="any"
                          min={0}
                          value={paymentFxRate}
                          onChange={(e) => setPaymentFxRate(e.target.value)}
                          placeholder={paymentCurrency === 'USD' && currency.code === 'IQD' ? '1500' : '1'}
                          className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line tabular-nums font-mono font-bold text-foreground"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {paymentCurrency !== currency.code && Number(paymentOrigAmount) > 0 && Number(paymentFxRate) > 0 && (
              <div className="p-2.5 rounded-xl bg-primary/10 text-xs font-semibold text-primary">
                {bi('المعادل المسجل بالعيادة: ', 'Converted Ledger Equivalent: ', 'هاوتای تۆمارکراو: ')}
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
                  'تأكيد استلام الدفعة وإصدار وصل',
                  'Confirm Payment & Receipt',
                  'دڵنیاکردنەوەی وەرگرتن'
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
          'دەستکاریکردنی ژمارەی دانیشتنەکانی کۆرس'
        )}
        ariaLabel={bi('تعديل إداري لعدد جلسات الكورس', 'Admin Manual Package Visit Adjustment', 'دەستکاری کۆرس')}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {pkgAdjustInvoice && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-surface/65 text-xs text-muted-foreground-1 space-y-1">
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
                {bi('+1 خصم جلسة', '+1 Used Visit', '+1 دانیشتن')}
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
                {bi('-1 استعادة جلسة', '-1 Refund Visit', '-1 گەڕاندنەوە')}
              </button>
            </div>

            <div>
              <label htmlFor="fin-pkg-adj-reason" className="block text-xs font-bold text-foreground mb-1">
                {bi('سبب التعديل (إلزامي) *', 'Adjustment Reason (Required) *', 'هۆکاری دەستکاری *')}
              </label>
              <input
                id="fin-pkg-adj-reason"
                type="text"
                value={pkgAdjustReason}
                onChange={(e) => {
                  setPkgAdjustReason(e.target.value);
                  setPkgAdjustError(null);
                }}
                placeholder={bi('مثال: تصحيح خصم جلسة ملغاة...', 'e.g., Correct miscounted visit...', 'بۆ نموونە: چاککردنەوە...')}
                className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground text-xs"
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
                {bi('حفظ التعديل', 'Confirm', 'پاشەکەوتکردن')}
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
        title={bi(
          'إلغاء فاتورة وإصدار إشعار دائن',
          'Void Invoice & Issue Credit Note',
          'هەڵوەشاندنەوەی پسوولە و دەرکردنی ئاگاداری دائن'
        )}
        ariaLabel={bi('إلغاء فاتورة وإصدار إشعار دائن', 'Void Invoice & Issue Credit Note', 'هەڵوەشاندنەوەی پسوولە')}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        size="sm"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {voidTargetInvoice && (
          <form onSubmit={handleVoidInvoiceSubmit} className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-surface/65 space-y-1">
              <div className="font-mono font-bold text-foreground">
                <bdi dir="ltr">{voidTargetInvoice.invoiceNumber}</bdi> — {voidTargetInvoice.patientName}
              </div>
              <p className="text-muted-foreground-1">
                {bi(
                  'لا يتم حذف السجلات المالية نهائياً؛ سيتم إصدار إشعار دائن متسلسل وعكس جميع الدفعات المسجلة على هذه الفاتورة.',
                  'Financial invoices are never hard-deleted. Voiding issues a sequential Credit Note and creates reversal entries for all posted payments.',
                  'تۆمارە داراییەکان بە یەکجاری ناسڕدرێنەوە؛ ئاگاداری دائن دەردەکرێت و پارەدانەکان پێچەوانە دەکرێنەوە.'
                )}
              </p>
            </div>

            <div>
              <label htmlFor="fin-void-reason" className="block font-bold text-foreground mb-1">
                {bi('سبب الإلغاء (إلزامي) *', 'Void Reason (Mandatory) *', 'هۆکاری هەڵوەشاندنەوە *')}
              </label>
              <input
                id="fin-void-reason"
                type="text"
                required
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder={bi('مثال: إصدار لمريض بالخطأ...', 'e.g., Billed to wrong patient...', 'بۆ نموونە: بە هەڵە...')}
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
                className="min-h-[36px] px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {bi('تأكيد الإلغاء', 'Confirm Void', 'پشتڕاستکردنەوە')}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Invoice Payment History, Receipts & Reversals Modal */}
      <ModalDialog
        isOpen={Boolean(historyInvoice)}
        onOpenChange={(open) => {
          if (!open) setHistoryInvoice(null);
        }}
        title={bi('سجل الدفعات والوصولات', 'Payments & Receipts', 'تۆماری پارەدان و پسوولەکان')}
        subtitle={
          historyInvoice ? (
            <span className="font-mono">
              <bdi dir="ltr">{historyInvoice.invoiceNumber}</bdi> · {historyInvoice.patientName}
            </span>
          ) : undefined
        }
        ariaLabel={bi('سجل الدفعات والوصولات', 'Payments & Receipts', 'تۆماری پارەدان')}
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
                  'هیچ پارەدانێک تۆمار نەکراوە.'
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
                    className="p-3.5 rounded-xl bg-surface/65 border border-card-line space-y-2"
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
                          className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-foreground font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="size-3.5" />
                          <span>{bi('وصل', 'Receipt', 'پسوولە')}</span>
                        </button>

                        {!pay.isReversal && waHref && (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold inline-flex items-center gap-1"
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
                          className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
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
                              className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold cursor-pointer"
                            >
                              {bi('عكس', 'Reverse', 'پێچەوانە')}
                            </button>
                          )}
                      </div>
                    </div>

                    {reversingPayId === pay.id && (
                      <div className="pt-2 border-t border-line-2 flex flex-wrap items-center gap-2">
                        <label htmlFor={`fin-rev-reason-${pay.id}`} className="sr-only">
                          {bi('سبب عكس الدفعة', 'Payment reversal reason', 'هۆکاری پێچەوانەکردنەوە')}
                        </label>
                        <input
                          id={`fin-rev-reason-${pay.id}`}
                          type="text"
                          aria-label={bi('سبب عكس الدفعة', 'Payment reversal reason', 'هۆکاری پێچەوانەکردنەوە')}
                          value={reversePayReason}
                          onChange={(e) => setReversePayReason(e.target.value)}
                          placeholder={bi('اكتب سبب عكس الدفعة (إلزامي)...', 'Mandatory reversal reason...', 'هۆکار بنووسە...')}
                          className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground"
                        />
                        <button
                          type="button"
                          disabled={!reversePayReason.trim()}
                          onClick={() => handleReversePaymentSubmit(historyInvoice.id, pay.id)}
                          className="min-h-[34px] px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer disabled:opacity-50"
                        >
                          {bi('تأكيد العكس', 'Confirm', 'پشتڕاستکردنەوە')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReversingPayId(null)}
                          className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-layer-line text-muted-foreground-1 cursor-pointer"
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
