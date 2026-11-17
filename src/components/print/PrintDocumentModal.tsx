// =======================================================================
// PhysioRecord — Printable Clinical & Financial Documents Portal (4.6)
// Zero-dependency @media print + browser "Save as PDF" renderer with
// encrypted clinic letterhead, logo, stamp/signature, and RTL/LTR toggle.
// =======================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog as AriaDialog,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import {
  X,
  Printer,
  Languages,
  ShieldAlert,
  CheckCircle2,
  Share2,
  Copy,
  Check,
  MessageCircle,
  Download,
  Calendar,
  Clock,
  Home,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { GeometricHeaderBackdrop } from '../ui/Dialog';
import {
  getPrintDocumentGlossaryLabels,
  type PrintDocumentGlossaryLabels,
} from '../../data/terminology';
import {
  addDaysToDateStr,
  formatClinicalDate,
  formatDateDDMMYYYY,
  formatIraqiPhoneDisplay,
  formatTimeIraq,
  formatWeekdaysSummary,
  localDate,
} from '../../utils/date';
import {
  formatHijriDate,
  formatHomeVisitAddressDisplay,
  getPracticeLocationLabel,
} from '../../utils/iraqScheduleLocationsC1C3';
import {
  buildDocumentShareSummaryText,
  buildDocumentWhatsAppFallbackUrl,
  buildShareableDocumentHtmlFile,
  computePatientVisitCardSummary,
  formatNextVisitBriefText,
  shareDocumentViaWebShareOrFallback,
} from '../../utils/sharingInteropPhaseE';
import { formatPaymentCurrencySnapshot } from '../../utils/csvExport';
import { isValidEncryptedImageDataUrl } from '../../utils/imageUtils';
import { getCurrencyConfig } from '../../utils/currencies';
import {
  exportPlatformPdfDirect,
  getElectronDesktopBridge,
  openSafeExternalUrl,
  saveTextFilePortable,
  triggerPlatformPrint,
} from '../../platform/nativeBridge';
import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SessionType,
  SoapNoteRecord,
} from '../../types/clinical';
import type {
  CashCloseZReportRecord,
  ClinicAppointment,
  EpisodeScopedClinicalStore,
  FinancialInvoiceIQD,
  HepPrescriptionItem,
  PatientConsentRecord,
  PatientVisitCardSummary,
  PaymentTransactionIQD,
} from '../../types/clinicManagement';

export type PrintableDocumentType =
  | 'receipt'
  | 'invoice'
  | 'z_report'
  | 'progress_report'
  | 'discharge_summary'
  | 'referral_letter'
  | 'medical_report'
  | 'hep_sheet'
  | 'consent'
  | 'patient_dossier'
  | 'tomorrow_schedule'
  | 'patient_visit_card';

export interface PrintDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: PrintableDocumentType;
  patient?: PatientRecord | null;
  patientName?: string;
  patientPhone?: string;
  patientMrn?: string;
  episode?: EpisodeRecord | null;
  allEpisodes?: EpisodeRecord[];
  allPatientConsents?: PatientConsentRecord[];
  clinicalStore?: EpisodeScopedClinicalStore | null;
  sessions?: SessionRecord[];
  soaps?: SoapNoteRecord[];
  invoice?: FinancialInvoiceIQD | null;
  payment?: PaymentTransactionIQD | null;
  zReport?: CashCloseZReportRecord | null;
  hepProgram?: HepPrescriptionItem[];
  consent?: PatientConsentRecord | null;
  scheduleDate?: string;
  scheduleAppointments?: ClinicAppointment[];
  visitCardSummary?: PatientVisitCardSummary | null;
}

const DOC_TITLES: Record<PrintableDocumentType, { ar: string; en: string; ckb: string }> = {
  receipt: {
    ar: 'وصل قبض / استلام مالي',
    en: 'Payment Receipt',
    ckb: 'پسووڵەی وەرگرتنی پارە',
  },
  invoice: {
    ar: 'فاتورة خدمات علاج طبيعي',
    en: 'Physiotherapy Invoice',
    ckb: 'پسووڵەی خزمەتگوزاریی چارەسەری سروشتی',
  },
  z_report: {
    ar: 'تقرير الإغلاق اليومي للصندوق (Z-Report)',
    en: 'Daily Cash Close Report (Z-Report)',
    ckb: 'ڕاپۆرتی داخستنی ڕۆژانەی سندوق (Z-Report)',
  },
  progress_report: {
    ar: 'تقرير متابعة التقدم العلاجي',
    en: 'Clinical Progress Report',
    ckb: 'ڕاپۆرتی بەدواداچوونی پێشکەوتنی چارەسەر',
  },
  discharge_summary: {
    ar: 'ملخص التخريج وإنهاء الخطة العلاجية',
    en: 'Discharge Summary',
    ckb: 'پوختەی دەرچوون و تەواوکردنی پلانی چارەسەر',
  },
  referral_letter: {
    ar: 'كتاب إحالة طبية متخصصة',
    en: 'Medical Referral Letter',
    ckb: 'نووسراوی ڕەوانەکردنی پزیشکیی پسپۆڕ',
  },
  medical_report: {
    ar: 'تقرير علاج طبيعي وتأهيل حركي',
    en: 'Physiotherapy Medical Report',
    ckb: 'ڕاپۆرتی پزیشکیی چارەسەری سروشتی و شیاندنەوە',
  },
  hep_sheet: {
    ar: 'برنامج التمارين العلاجية المنزلية (HEP)',
    en: 'Home Exercise Program (HEP)',
    ckb: 'بەرنامەی ڕاهێنانی چارەسەری ماڵەوە (HEP)',
  },
  consent: {
    ar: 'نموذج موافقة المريض المستنيرة',
    en: 'Signed Patient Informed Consent',
    ckb: 'فۆڕمی ڕەزامەندیی ئاگادارانەی واژۆکراوی نەخۆش',
  },
  patient_dossier: {
    ar: 'الملف السريري الكامل للمريض (Dossier)',
    en: 'Complete Patient Clinical Dossier',
    ckb: 'دۆسیەی پزیشکیی تەواوی نەخۆش (Dossier)',
  },
  tomorrow_schedule: {
    ar: 'جدول مواعيد الغد / اليوم',
    en: 'Schedule Sheet',
    ckb: 'خشتەی کاتەکانی سبەینێ / ئەمڕۆ',
  },
  patient_visit_card: {
    ar: 'بطاقة مواعيد المريض ورصيد الجلسات',
    en: 'Patient Visit & Package Card',
    ckb: 'کارتی سەردانەکان و باڵانسی دانیشتنەکانی نەخۆش',
  },
};

function formatPrimaryAmount(amount: number, currencyCode: string, isDocAr: boolean): string {
  const cfg = getCurrencyConfig(currencyCode);
  const symbol = isDocAr ? cfg.symbolAr : cfg.symbolEn;
  const formatted = new Intl.NumberFormat(isDocAr ? 'ar-IQ-u-nu-latn' : 'en-US', {
    maximumFractionDigits: cfg.decimals,
    minimumFractionDigits: cfg.decimals > 0 && Math.abs(amount) % 1 !== 0 ? 2 : 0,
  }).format(Math.abs(amount));
  const prefix = amount < 0 ? '−' : '';
  return `${prefix}${formatted} ${symbol}`;
}

export const PrintDocumentModal: React.FC<PrintDocumentModalProps> = ({
  isOpen,
  onClose,
  documentType,
  patient,
  patientName,
  patientPhone,
  patientMrn,
  episode,
  allEpisodes = [],
  allPatientConsents = [],
  clinicalStore,
  sessions = [],
  soaps = [],
  invoice,
  payment,
  zReport,
  hepProgram,
  consent,
  scheduleDate,
  scheduleAppointments,
  visitCardSummary,
}) => {
  const { language, isRtl, bi } = useLanguage();
  const { currency } = useCurrency();
  const globalCurrencyCode = currency.code;
  const [docLang, setDocLang] = useState<'ar' | 'en'>(language === 'en' ? 'en' : 'ar');
  const [recipientDoctor, setRecipientDoctor] = useState('');
  const [customRecommendation, setCustomRecommendation] = useState('');
  const [opsVersion, setOpsVersion] = useState(0);
  const [shareFeedback, setShareFeedback] = useState<{
    kind: 'shared' | 'copied' | 'downloaded';
    text: string;
  } | null>(null);
  const shareFeedbackTimerRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDocLang(language === 'en' ? 'en' : 'ar');
    setShareFeedback(null);
  }, [language, isOpen, documentType]);

  useEffect(() => {
    return () => {
      if (shareFeedbackTimerRef.current !== null) {
        window.clearTimeout(shareFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const sync = () => setOpsVersion((v) => v + 1);
    const unsub = ClinicOperationsService.subscribe(sync);
    window.addEventListener('physiorecord-modules-updated', sync);
    return () => {
      unsub();
      window.removeEventListener('physiorecord-modules-updated', sync);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('printing-clinical-doc');
    return () => {
      document.body.classList.remove('printing-clinical-doc');
    };
  }, [isOpen]);

  const clinicProfile = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.getClinicProfile();
  }, [isOpen, opsVersion]);

  const effectiveVisitCard = useMemo<PatientVisitCardSummary | null>(() => {
    void opsVersion;
    if (visitCardSummary) return visitCardSummary;
    if (!isOpen) return null;
    const resolvedId = patient?.id || invoice?.patientId || '';
    if (!resolvedId && documentType !== 'patient_visit_card') return null;
    const nameForCard =
      patientName ||
      (docLang === 'ar'
        ? patient?.data.fullNameAr || patient?.data.fullName
        : patient?.data.fullName || patient?.data.fullNameAr) ||
      invoice?.patientName ||
      '—';
    const mrnForCard = patientMrn || patient?.data.mrn || '';
    const phoneForCard =
      patientPhone || patient?.data.phone || patient?.data.phoneNumber || '';
    return computePatientVisitCardSummary({
      patientId: resolvedId,
      patientName: nameForCard,
      patientMrn: mrnForCard || undefined,
      patientPhone: phoneForCard || undefined,
      appointments: ClinicOperationsService.getAppointments(),
      invoices: ClinicOperationsService.getInvoicesIQD(),
    });
  }, [
    opsVersion,
    visitCardSummary,
    isOpen,
    documentType,
    patient,
    patientName,
    patientMrn,
    patientPhone,
    invoice,
    docLang,
  ]);

  if (!isOpen) return null;

  const isDocAr = docLang === 'ar';
  const docDir = isDocAr ? 'rtl' : 'ltr';
  const resolvedPatientName =
    patientName ||
    (isDocAr
      ? patient?.data.fullNameAr || patient?.data.fullName
      : patient?.data.fullName || patient?.data.fullNameAr) ||
    invoice?.patientName ||
    '—';
  const resolvedPhone = patientPhone || patient?.data.phone || patient?.data.phoneNumber || '';
  const resolvedMrn = patientMrn || patient?.data.mrn || '';
  const effectivePhone =
    documentType === 'z_report' || documentType === 'tomorrow_schedule'
      ? ''
      : effectiveVisitCard?.patientPhone || resolvedPhone;
  const snapshots = clinicalStore?.snapshots || [];
  const baselineSnap = snapshots[0] || null;
  const latestSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const finalizedSessions = sessions.filter((s) => s.status === 'finalized');
  const effectiveHep = hepProgram || clinicalStore?.hepProgram || [];
  const docTitle = DOC_TITLES[documentType][docLang];
  const uiDocTitle = bi(
    DOC_TITLES[documentType].ar,
    DOC_TITLES[documentType].en,
    DOC_TITLES[documentType].ckb,
  );
  const primaryLedgerCode = invoice?.currencyCode || zReport?.primaryCurrencyCode || globalCurrencyCode;
  const logoSafe = isValidEncryptedImageDataUrl(clinicProfile.logoDataUrl)
    ? clinicProfile.logoDataUrl
    : undefined;
  const stampSafe = isValidEncryptedImageDataUrl(clinicProfile.stampSignatureDataUrl)
    ? clinicProfile.stampSignatureDataUrl
    : undefined;
  const glossaryEnabled = ClinicOperationsService.isBilingualTerminologyGlossaryEnabled();
  const glossaryLabels: PrintDocumentGlossaryLabels | null = glossaryEnabled
    ? getPrintDocumentGlossaryLabels(docLang)
    : null;
  const glossaryCounterpartLabels: PrintDocumentGlossaryLabels | null = glossaryEnabled
    ? getPrintDocumentGlossaryLabels(docLang === 'ar' ? 'en' : 'ar')
    : null;
  const webShareEnabled = ClinicOperationsService.isWebShareInteropEnabled();
  const hijriDisplayEnabled = ClinicOperationsService.isHijriDateDisplayEnabled();
  const practiceLocations = ClinicOperationsService.getPracticeLocations();

  const effectiveScheduleDate = scheduleDate || addDaysToDateStr(localDate(), 1);
  const rawScheduleAppointments =
    scheduleAppointments !== undefined
      ? scheduleAppointments
      : documentType === 'tomorrow_schedule'
        ? ClinicOperationsService.ensureRecurringAppointmentsForDate(effectiveScheduleDate)
        : [];
  const activeScheduleAppointments = rawScheduleAppointments
    .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const homeVisitsCount = activeScheduleAppointments.filter(
    (a) => a.appointmentMode === 'home_visit'
  ).length;
  const scheduleHijriDate =
    documentType === 'tomorrow_schedule' && hijriDisplayEnabled
      ? formatHijriDate(effectiveScheduleDate, docLang)
      : '';

  const methodLabel = (method: string): string => {
    const labels: Record<string, { ar: string; en: string }> = {
      cash: { ar: 'نقداً', en: 'Cash' },
      zain_cash: { ar: 'زين كاش (ZainCash)', en: 'ZainCash' },
      qi_card: { ar: 'كي كارد (QiCard)', en: 'QiCard' },
      other: { ar: 'وسيلة أخرى', en: 'Other' },
    };
    return labels[method]?.[docLang] || method;
  };

  const invoiceTypeLabel = (t: FinancialInvoiceIQD['invoiceType']): string => {
    if (t === 'single_session') return isDocAr ? 'جلسة مفردة' : 'Single Session';
    if (t === 'rehab_package') return isDocAr ? 'كورس علاجي' : 'Rehab Package';
    return isDocAr ? 'فحص وتقييم' : 'Evaluation';
  };

  const visitTypeLabel = (vt: SessionType): string => {
    if (vt === 'initial_evaluation') return isDocAr ? 'تقييم أولي' : 'Initial Evaluation';
    if (vt === 're_evaluation') return isDocAr ? 'إعادة تقييم' : 'Re-evaluation';
    if (vt === 'discharge_summary') return isDocAr ? 'جلسة تخريج' : 'Discharge';
    return isDocAr ? 'جلسة متابعة' : 'Follow-up';
  };

  const clinicDisplayName =
    (isDocAr ? clinicProfile.clinicNameAr : clinicProfile.clinicNameEn) ||
    clinicProfile.clinicNameAr ||
    clinicProfile.clinicNameEn ||
    'PhysioRecord';

  const summaryText = buildDocumentShareSummaryText({
    docTitle:
      documentType === 'tomorrow_schedule' && effectiveScheduleDate
        ? `${docTitle} (${formatDateDDMMYYYY(effectiveScheduleDate)})`
        : docTitle,
    clinicName: clinicDisplayName,
    patientName:
      documentType !== 'z_report' &&
      documentType !== 'tomorrow_schedule' &&
      (effectiveVisitCard?.patientName || resolvedPatientName) !== '—'
        ? documentType === 'patient_visit_card'
          ? effectiveVisitCard?.patientName || resolvedPatientName
          : resolvedPatientName
        : undefined,
    amountFormatted:
      documentType === 'receipt' && payment
        ? formatPrimaryAmount(payment.amountIQD, primaryLedgerCode, isDocAr)
        : documentType === 'invoice' && invoice
          ? formatPrimaryAmount(invoice.netAmountIQD, primaryLedgerCode, isDocAr)
          : documentType === 'z_report' && zReport
            ? formatPrimaryAmount(zReport.netCashFlowPrimary, zReport.primaryCurrencyCode, isDocAr)
            : documentType === 'patient_visit_card' &&
                effectiveVisitCard &&
                effectiveVisitCard.totalBalanceDueIQD > 0
              ? formatPrimaryAmount(effectiveVisitCard.totalBalanceDueIQD, primaryLedgerCode, isDocAr)
              : undefined,
    nextAppointmentText:
      documentType === 'patient_visit_card' && effectiveVisitCard?.nextAppointment
        ? formatNextVisitBriefText(effectiveVisitCard.nextAppointment, docLang)
        : undefined,
    remainingSessions:
      documentType === 'patient_visit_card' &&
      effectiveVisitCard &&
      effectiveVisitCard.packageTotalSessions > 0
        ? effectiveVisitCard.packageRemainingSessions
        : undefined,
    lang: docLang,
  });

  const whatsappFallbackUrl = buildDocumentWhatsAppFallbackUrl(effectivePhone, summaryText);

  const shareFileNameBase =
    documentType === 'tomorrow_schedule'
      ? `physiorecord-schedule-${effectiveScheduleDate}`
      : invoice?.invoiceNumber
        ? `physiorecord-${documentType}-${invoice.invoiceNumber}`
        : payment?.receiptNumber
          ? `physiorecord-${documentType}-${payment.receiptNumber}`
          : zReport?.zReportNumber
            ? `physiorecord-${documentType}-${zReport.zReportNumber}`
            : resolvedMrn
              ? `physiorecord-${documentType}-${resolvedMrn}`
              : `physiorecord-${documentType}-${localDate()}`;

  const triggerShareFeedback = (
    kind: 'shared' | 'copied' | 'downloaded',
    text: string
  ) => {
    setShareFeedback({ kind, text });
    if (shareFeedbackTimerRef.current !== null) {
      window.clearTimeout(shareFeedbackTimerRef.current);
    }
    shareFeedbackTimerRef.current = window.setTimeout(() => {
      setShareFeedback(null);
      shareFeedbackTimerRef.current = null;
    }, 4000);
  };

  const handleWebShareFile = async () => {
    const file = buildShareableDocumentHtmlFile({
      title: docTitle,
      docType: documentType,
      sheetHtml: sheetRef.current?.innerHTML || '',
      dir: docDir,
      lang: docLang,
      fileNameBase: shareFileNameBase,
    });
    const result = await shareDocumentViaWebShareOrFallback({
      title: docTitle,
      text: summaryText,
      file,
      patientPhone: effectivePhone || null,
    });
    if (result.method === 'web_share_file' || result.method === 'web_share_text') {
      triggerShareFeedback(
        'shared',
        bi('تمت مشاركة المستند بنجاح', 'Shared successfully', 'بەڵگەنامەکە بە سەرکەوتوویی هاوبەشکرا')
      );
      return;
    }
    triggerShareFeedback(
      'copied',
      bi(
        'تم نسخ الملخص (استخدم واتساب أو تنزيل الملف على سطح المكتب)',
        'Summary copied (use WhatsApp or Download on desktop)',
        'پوختە کۆپی کرا (لە کۆمپیوتەر واتساپ یان داگرتنی پەڕگە بەکاربهێنە)'
      )
    );
  };

  const handleCopySummary = async () => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(summaryText);
      }
    } catch {
      // Fallback status indicator still reflects copy attempt cleanly
    }
    triggerShareFeedback('copied', bi('تم نسخ الملخص', 'Summary copied', 'پوختە کۆپی کرا'));
  };

  const handleDownloadShareFile = async () => {
    const file = buildShareableDocumentHtmlFile({
      title: docTitle,
      docType: documentType,
      sheetHtml: sheetRef.current?.innerHTML || '',
      dir: docDir,
      lang: docLang,
      fileNameBase: shareFileNameBase,
    });
    const htmlText =
      typeof file.text === 'function'
        ? await file.text()
        : sheetRef.current?.innerHTML || '';
    try {
      await saveTextFilePortable({
        filename: file.name,
        content: htmlText,
        mimeType: 'text/html;charset=utf-8',
        description: 'HTML Printable Document (.html)',
        extensions: ['html'],
      });
      triggerShareFeedback(
        'downloaded',
        bi('تم تنزيل ملف المشاركة (.html)', 'Share HTML file downloaded', 'پەڕگەی هاوبەشکردن (.html) داگیرا')
      );
    } catch {
      // User cancelled native dialog
    }
  };

  const handlePrint = () => {
    void triggerPlatformPrint(shareFileNameBase || 'PhysioRecord_Document');
  };

  const canDirectExportPdf = Boolean(getElectronDesktopBridge()?.exportCurrentPageToPdf);
  const handleDirectExportPdf = async () => {
    const ok = await exportPlatformPdfDirect(`${shareFileNameBase || 'physiorecord-document'}.pdf`);
    if (ok) {
      triggerShareFeedback(
        'downloaded',
        bi('تم حفظ ملف PDF بنجاح', 'PDF file saved successfully', 'پەڕگەی PDF بە سەرکەوتوویی پاشەکەوت کرا')
      );
    }
  };

  const isClinicalLetter =
    documentType === 'progress_report' ||
    documentType === 'discharge_summary' ||
    documentType === 'referral_letter' ||
    documentType === 'medical_report';

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      className="fixed inset-0 z-[90] bg-slate-950/65 backdrop-blur-xs flex flex-col outline-none"
    >
      <Modal
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full h-full max-h-[100dvh] flex flex-col outline-none print:h-auto print:max-h-none overflow-hidden"
      >
        <AriaDialog
          aria-label={uiDocTitle}
          className="w-full h-full flex flex-col min-h-0 outline-none print:h-auto overflow-hidden"
        >
          {/* Pinned Screen-only Top Header & Action Strip (Non-shrinking, Always Visible, Zero Clipping) */}
          <header className="print-modal-chrome w-full bg-card border-b border-card-line shadow-md shrink-0 print:hidden z-30">
            <div className="relative overflow-hidden px-4 sm:px-6 py-3 bg-primary text-primary-foreground">
              <GeometricHeaderBackdrop />
              <div className="relative z-10 max-w-[210mm] mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="size-9 rounded-xl bg-primary-foreground/15 text-primary-foreground border border-primary-foreground/25 flex items-center justify-center shrink-0">
                    <Printer className="size-4.5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-primary-foreground truncate">{uiDocTitle}</h2>
                    <p className="text-xs text-primary-foreground/85 truncate">
                      {bi(
                        'معاينة قبل الطباعة أو الحفظ بصيغة PDF عبر المتصفح (يعمل بدون إنترنت)',
                        'A4 print preview — use Print or Save as PDF (100% offline)',
                        'پێشبینینی پێش چاپکردن یان پاشەکەوتکردن وەک PDF لە ڕێگەی وێبگەڕەوە (بێ ئینتەرنێت کاردەکات)'
                      )}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label={bi('إغلاق', 'Close', 'داخستن')}
                  className="size-9 !p-0 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground inline-flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Unified Horizontally Scrollable Print & Share Action Strip */}
            <div className="px-4 sm:px-6 py-2.5 bg-surface/90 border-t border-card-line/80">
              <div className="max-w-[210mm] mx-auto pr-hscroll overflow-x-auto flex items-center gap-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors shrink-0"
                >
                  <Printer className="size-3.5" />
                  <span>{bi('طباعة / حفظ PDF', 'Print / Save PDF', 'چاپکردن / پاشەکەوتکردنی PDF')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDocLang(docLang === 'ar' ? 'en' : 'ar')}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-line-2 bg-card hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                >
                  <Languages className="size-3.5 text-primary" />
                  <span>
                    {isDocAr
                      ? bi('التحويل للإنجليزية (EN)', 'Switch to English (EN)', 'گۆڕین بۆ ئینگلیزی (EN)')
                      : bi('التحويل للعربية (AR)', 'Switch to Arabic (AR)', 'گۆڕین بۆ عەرەبی (AR)')}
                  </span>
                </button>

                {canDirectExportPdf && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleDirectExportPdf();
                    }}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                  >
                    <Download className="size-3.5" />
                    <span>{bi('تصدير PDF مباشر', 'Direct Save PDF', 'پاشەکەوتکردنی ڕاستەوخۆی PDF')}</span>
                  </button>
                )}

                {webShareEnabled && (
                  <>
                    <span className="h-5 w-px bg-card-divider mx-0.5 shrink-0" aria-hidden="true" />

                    <button
                      type="button"
                      data-testid="print-web-share-file-btn"
                      onClick={() => {
                        void handleWebShareFile();
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl border border-primary/25 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                    >
                      <Share2 className="size-3.5" />
                      <span>{bi('مشاركة الملف', 'Share File', 'هاوبەشکردنی پەڕگە')}</span>
                    </button>

                    <button
                      type="button"
                      data-testid="print-copy-summary-btn"
                      onClick={() => {
                        void handleCopySummary();
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl border border-line-2 bg-card hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                    >
                      {shareFeedback?.kind === 'copied' ? (
                        <Check className="size-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="size-3.5 text-primary" />
                      )}
                      <span>{bi('نسخ الملخص', 'Copy Summary', 'کۆپیکردنی پوختە')}</span>
                    </button>

                    <a
                      data-testid="print-whatsapp-fallback-link"
                      href={whatsappFallbackUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (whatsappFallbackUrl && getElectronDesktopBridge()?.openExternalUrl) {
                          e.preventDefault();
                          void openSafeExternalUrl(whatsappFallbackUrl);
                        }
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
                    >
                      <MessageCircle className="size-3.5" />
                      <span>{bi('إرسال عبر واتساب', 'WhatsApp', 'واتساپ')}</span>
                    </a>

                    <button
                      type="button"
                      data-testid="print-download-share-file-btn"
                      onClick={() => {
                        void handleDownloadShareFile();
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl border border-line-2 bg-card hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                    >
                      <Download className="size-3.5 text-primary" />
                      <span>{bi('تنزيل ملف للمشاركة', 'Download Share File', 'داگرتنی پەڕگە بۆ هاوبەشکردن')}</span>
                    </button>

                    {shareFeedback && (
                      <span
                        data-testid="print-share-status-notice"
                        role="status"
                        className="text-emerald-700 dark:text-emerald-400 text-xs font-semibold inline-flex items-center gap-1.5 px-1 shrink-0"
                      >
                        <CheckCircle2 className="size-3.5 shrink-0" />
                        <span>{shareFeedback.text}</span>
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </header>

          <div
            id="physiorecord-print-portal"
            tabIndex={0}
            className="flex-1 min-h-0 w-full overflow-y-auto overscroll-contain touch-pan-y p-3 sm:p-6 flex flex-col items-center focus:outline-none print:overflow-visible print:p-0 print:block"
          >
      {/* Screen-only Optional Personalization Bar for Clinical Reports/Letters */}
      {isClinicalLetter && (
        <div className="print-modal-chrome w-full max-w-[210mm] mb-4 bg-card border border-card-line rounded-2xl p-3.5 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0 print:hidden">
          {documentType === 'referral_letter' && (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {bi(
                  'إلى الطبيب / التخصص المُحال إليه:',
                  'Referred To (Physician / Specialty):',
                  'بۆ پزیشک / پسپۆڕیی ڕەوانەکراو:'
                )}
              </label>
              <input
                type="text"
                value={recipientDoctor}
                onChange={(e) => setRecipientDoctor(e.target.value)}
                placeholder={
                  patient?.data.referringPhysician ||
                  bi(
                    'د. اختصاص جراحة العظام والكسور...',
                    'Dr. Orthopedic Specialist...',
                    'د. پسپۆڕی نەشتەرگەریی ئێسک و شکان...'
                  )
                }
                className="w-full px-3 py-1.5 rounded-xl border border-layer-line bg-layer text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          )}
          <div className={documentType === 'referral_letter' ? '' : 'md:col-span-2'}>
            <label className="block text-xs font-semibold text-foreground mb-1">
              {bi(
                'ملاحظات أو توصيات سريرية إضافية قبل الطباعة (اختياري):',
                'Additional Clinical Remarks / Recommendations (Optional):',
                'تێبینی یان پێشنیازی پزیشکیی زیاتر پێش چاپکردن (ئیختیاری):'
              )}
            </label>
            <input
              type="text"
              value={customRecommendation}
              onChange={(e) => setCustomRecommendation(e.target.value)}
              placeholder={bi(
                'مثال: يُنصح بالاستمرار على الجلسات التأهيلية وتقييم الصور الشعاعية...',
                'e.g., Recommend continuing structured rehabilitation and follow-up imaging...',
                'بۆ نموونە: پێشنیاز دەکرێت بەردەوام بێت لە دانیشتنەکانی شیاندنەوە و هەڵسەنگاندنی وێنەی تیشک...'
              )}
              className="w-full px-3 py-1.5 rounded-xl border border-layer-line bg-layer text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      )}

      {/* Printable A4 Sheet (Full original width with smooth horizontal & vertical pan on mobile) */}
      <div className="w-full max-w-[210mm] overflow-x-auto overscroll-x-contain touch-auto rounded-2xl shadow-2xl shrink-0 print:overflow-visible print:max-w-none print:shadow-none">
        <div
          ref={sheetRef}
          dir={docDir}
          className="print-sheet-container w-[210mm] min-w-[210mm] print:w-full print:min-w-0 bg-white text-slate-900 rounded-2xl border border-slate-200 border-t-4 border-t-emerald-700 p-6 sm:p-10 space-y-6 text-xs leading-relaxed"
        >
        {/* Clinic Letterhead */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-emerald-700/20 pb-5 print-break-inside-avoid">
          <div className="flex items-start gap-3.5">
            {logoSafe && (
              <img
                src={logoSafe}
                alt="Clinic Logo"
                className="h-16 w-16 object-contain rounded-xl border border-emerald-200/80 p-1 bg-white shrink-0"
              />
            )}
            <div className="space-y-1">
              <h1 className="text-lg font-extrabold text-slate-900">
                {(isDocAr ? clinicProfile.clinicNameAr : clinicProfile.clinicNameEn) ||
                  clinicProfile.clinicNameAr ||
                  clinicProfile.clinicNameEn}
              </h1>
              <p className="text-xs font-semibold text-emerald-800">
                {isDocAr ? 'المعالج الفيزيائي: ' : 'Physiotherapist: '}
                {(isDocAr ? clinicProfile.therapistNameAr : clinicProfile.therapistNameEn) ||
                  clinicProfile.therapistNameAr ||
                  clinicProfile.therapistNameEn}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                {clinicProfile.licenseNumber && (
                  <span>
                    {isDocAr ? 'رقم الإجازة: ' : 'License #: '}
                    <bdi dir="ltr">{clinicProfile.licenseNumber}</bdi>
                  </span>
                )}
                {clinicProfile.phone && (
                  <span>
                    {isDocAr ? 'الهاتف: ' : 'Phone: '}
                    <bdi dir="ltr">{clinicProfile.phone}</bdi>
                  </span>
                )}
              </div>
              {(clinicProfile.addressAr || clinicProfile.addressEn) && (
                <p className="text-xs text-slate-600">
                  {isDocAr
                    ? clinicProfile.addressAr || clinicProfile.addressEn
                    : clinicProfile.addressEn || clinicProfile.addressAr}
                </p>
              )}
            </div>
          </div>

          <div className={`space-y-1.5 ${isDocAr ? 'text-left' : 'text-right'}`}>
            <div className="inline-block px-3.5 py-1.5 rounded-xl bg-emerald-700 text-white font-bold text-xs shadow-2xs">
              {docTitle}
            </div>
            <p className="text-xs text-slate-600">
              {isDocAr ? 'تاريخ الإصدار: ' : 'Issue Date: '}
              <bdi dir="ltr" className="font-semibold tabular-nums">
                {formatDateDDMMYYYY(localDate())}
              </bdi>
            </p>
            {invoice?.invoiceNumber && (
              <p className="text-xs font-mono font-bold text-emerald-800">
                <bdi dir="ltr">{invoice.invoiceNumber}</bdi>
              </p>
            )}
            {zReport?.zReportNumber && (
              <p className="text-xs font-mono font-bold text-emerald-800">
                <bdi dir="ltr">{zReport.zReportNumber}</bdi>
              </p>
            )}
          </div>
        </header>

        {/* Patient Metadata Band (where applicable) */}
        {documentType !== 'z_report' &&
          documentType !== 'tomorrow_schedule' &&
          documentType !== 'patient_visit_card' && (
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-emerald-50/45 border border-emerald-200/70 rounded-2xl p-4 print-break-inside-avoid">
            <div>
              <div className="text-xs text-slate-500">{isDocAr ? 'اسم المريض' : 'Patient Name'}</div>
              <div className="text-xs font-bold text-slate-900 mt-0.5">{resolvedPatientName}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{isDocAr ? 'رقم الملف (MRN)' : 'MRN'}</div>
              <div className="text-xs font-mono font-semibold text-slate-800 mt-0.5">
                <bdi dir="ltr">{resolvedMrn || '—'}</bdi>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">{isDocAr ? 'الهاتف' : 'Phone'}</div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5 tabular-nums">
                <bdi dir="ltr">{resolvedPhone || '—'}</bdi>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">
                {isDocAr ? 'العمر / الجنس' : 'Age / Gender'}
              </div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5">
                {patient?.data.age ? `${patient.data.age} ${isDocAr ? 'سنة' : 'yrs'}` : '—'}
                {patient?.data.gender
                  ? ` · ${
                      patient.data.gender === 'male'
                        ? isDocAr
                          ? 'ذكر'
                          : 'Male'
                        : patient.data.gender === 'female'
                          ? isDocAr
                            ? 'أنثى'
                            : 'Female'
                          : isDocAr
                            ? 'أخرى'
                            : 'Other'
                    }`
                  : ''}
              </div>
            </div>
          </section>
        )}

        {/* 1. RECEIPT */}
        {documentType === 'receipt' && payment && (
          <section className="space-y-4">
            <div className="border border-slate-300 rounded-xl overflow-hidden print-break-inside-avoid">
              <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-300 flex items-center justify-between">
                <span className="font-bold text-slate-900">
                  {isDocAr ? 'تفاصيل وصل القبض' : 'Receipt Details'}
                </span>
                <span className="font-mono font-bold text-slate-900">
                  <bdi dir="ltr">{payment.receiptNumber}</bdi>
                </span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">{isDocAr ? 'تاريخ الدفع: ' : 'Payment Date: '}</span>
                  <strong className="tabular-nums">
                    <bdi dir="ltr">{formatDateDDMMYYYY(payment.date)}</bdi>
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">{isDocAr ? 'رقم الفاتورة المرجعي: ' : 'Invoice Ref: '}</span>
                  <strong className="font-mono">
                    <bdi dir="ltr">{invoice?.invoiceNumber || payment.invoiceId}</bdi>
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">{isDocAr ? 'طريقة الدفع: ' : 'Payment Method: '}</span>
                  <strong>{methodLabel(payment.method)}</strong>
                </div>
                <div>
                  <span className="text-slate-500">{isDocAr ? 'المستلم: ' : 'Received By: '}</span>
                  <strong>{payment.receivedBy}</strong>
                </div>
                <div className="sm:col-span-2 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    {payment.isReversal
                      ? isDocAr
                        ? 'مبلغ العكس المالي:'
                        : 'Reversed Amount:'
                      : isDocAr
                        ? 'المبلغ المستلم:'
                        : 'Amount Received:'}
                  </span>
                  <div className={isDocAr ? 'text-left' : 'text-right'}>
                    <div className="text-base font-extrabold text-slate-900 tabular-nums">
                      <bdi dir="ltr">{formatPrimaryAmount(payment.amountIQD, primaryLedgerCode, isDocAr)}</bdi>
                    </div>
                    {payment.currencyCode &&
                      payment.currencyCode !== primaryLedgerCode &&
                      typeof payment.originalAmount === 'number' && (
                        <div className="text-xs text-slate-600 tabular-nums">
                          <bdi dir="ltr">{formatPaymentCurrencySnapshot(payment, primaryLedgerCode)}</bdi>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            </div>

            {invoice && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap justify-between gap-3 text-xs print-break-inside-avoid">
                <div>
                  <span className="text-slate-500">{isDocAr ? 'الخدمة: ' : 'Service: '}</span>
                  <strong>{isDocAr ? invoice.titleAr : invoice.titleEn}</strong>
                </div>
                <div>
                  <span className="text-slate-500">{isDocAr ? 'المتبقي على الفاتورة: ' : 'Remaining Balance: '}</span>
                  <strong className="tabular-nums">
                    <bdi dir="ltr">{formatPrimaryAmount(invoice.balanceDueIQD, primaryLedgerCode, isDocAr)}</bdi>
                  </strong>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 2. INVOICE */}
        {documentType === 'invoice' && invoice && (
          <section className="space-y-4">
            {invoice.status === 'void' && (
              <div className="p-3 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 text-xs flex items-start gap-2 print-break-inside-avoid">
                <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                <div>
                  <strong>
                    {isDocAr
                      ? `فاتورة ملغاة بإشعار دائن (${invoice.creditNoteNumber || ''})`
                      : `VOIDED INVOICE — Credit Note (${invoice.creditNoteNumber || ''})`}
                  </strong>
                  {invoice.voidReason && (
                    <p className="mt-0.5">
                      {isDocAr ? 'السبب: ' : 'Reason: '}
                      {invoice.voidReason}
                    </p>
                  )}
                </div>
              </div>
            )}

            <table className="w-full border-collapse border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-300 px-3 py-2 text-start">
                    {isDocAr ? 'الوصف / الخدمة' : 'Description'}
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-start">
                    {isDocAr ? 'النوع' : 'Type'}
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-end">
                    {isDocAr ? 'الإجمالي' : 'Gross'}
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-end">
                    {isDocAr ? 'الخصم' : 'Discount'}
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-end">
                    {isDocAr ? 'الصافي' : 'Net'}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-3 py-2.5 font-semibold">
                    {isDocAr ? invoice.titleAr : invoice.titleEn}
                    {invoice.invoiceType === 'rehab_package' && invoice.packageTotalSessions && (
                      <div className="text-xs text-slate-500 font-normal mt-0.5">
                        {isDocAr ? 'الكورس: ' : 'Package: '}
                        <bdi dir="ltr">
                          {invoice.packageUsedSessions || 0}/{invoice.packageTotalSessions}
                        </bdi>{' '}
                        {isDocAr ? 'جلسات مستخدمة' : 'sessions used'}
                      </div>
                    )}
                  </td>
                  <td className="border border-slate-300 px-3 py-2.5">
                    {invoiceTypeLabel(invoice.invoiceType)}
                  </td>
                  <td className="border border-slate-300 px-3 py-2.5 text-end tabular-nums">
                    <bdi dir="ltr">{formatPrimaryAmount(invoice.totalAmountIQD, primaryLedgerCode, isDocAr)}</bdi>
                  </td>
                  <td className="border border-slate-300 px-3 py-2.5 text-end tabular-nums">
                    <bdi dir="ltr">{formatPrimaryAmount(invoice.discountIQD, primaryLedgerCode, isDocAr)}</bdi>
                  </td>
                  <td className="border border-slate-300 px-3 py-2.5 text-end font-bold tabular-nums">
                    <bdi dir="ltr">{formatPrimaryAmount(invoice.netAmountIQD, primaryLedgerCode, isDocAr)}</bdi>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 print-break-inside-avoid">
              <div>
                <span className="text-slate-500">{isDocAr ? 'إجمالي المدفوع: ' : 'Total Paid: '}</span>
                <strong className="tabular-nums">
                  <bdi dir="ltr">{formatPrimaryAmount(invoice.paidAmountIQD, primaryLedgerCode, isDocAr)}</bdi>
                </strong>
              </div>
              <div className={isDocAr ? 'text-left' : 'text-right'}>
                <span className="text-slate-500">{isDocAr ? 'الرصيد المتبقي: ' : 'Balance Due: '}</span>
                <strong className="tabular-nums">
                  <bdi dir="ltr">{formatPrimaryAmount(invoice.balanceDueIQD, primaryLedgerCode, isDocAr)}</bdi>
                </strong>
              </div>
            </div>

            {invoice.payments.length > 0 && (
              <div className="space-y-1.5 print-break-inside-avoid">
                <h3 className="text-xs font-bold text-slate-800">
                  {isDocAr ? 'سجل الدفعات والعكوسات:' : 'Payment & Reversal Ledger:'}
                </h3>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                        {isDocAr ? 'الوصل' : 'Receipt'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                        {isDocAr ? 'التاريخ' : 'Date'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                        {isDocAr ? 'الطريقة' : 'Method'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-1.5 text-end">
                        {isDocAr ? 'تفاصيل العملة' : 'FX / Ledger'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="border border-slate-300 px-2.5 py-1.5 font-mono">
                          <bdi dir="ltr">{p.receiptNumber}</bdi>
                          {p.status === 'reversed' && (
                            <span className="ms-1 text-rose-700 font-sans">
                              ({isDocAr ? 'معكوسة' : 'Reversed'})
                            </span>
                          )}
                          {p.isReversal && (
                            <span className="ms-1 text-amber-700 font-sans">
                              ({isDocAr ? 'قيد عكس' : 'Reversal'})
                            </span>
                          )}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1.5 tabular-nums">
                          <bdi dir="ltr">{formatDateDDMMYYYY(p.date)}</bdi>
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1.5">{methodLabel(p.method)}</td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-end tabular-nums">
                          <bdi dir="ltr">{formatPaymentCurrencySnapshot(p, primaryLedgerCode)}</bdi>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* 3. Z-REPORT */}
        {documentType === 'z_report' && zReport && (
          <section className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 print-break-inside-avoid">
              <div>
                <div className="text-slate-500">{isDocAr ? 'التاريخ المشمول' : 'Date'}</div>
                <div className="font-bold tabular-nums">
                  <bdi dir="ltr">{formatDateDDMMYYYY(zReport.dateKey)}</bdi>
                </div>
              </div>
              <div>
                <div className="text-slate-500">{isDocAr ? 'أغلق بواسطة' : 'Closed By'}</div>
                <div className="font-bold">{zReport.closedBy}</div>
              </div>
              <div>
                <div className="text-slate-500">{isDocAr ? 'عدد الدفعات / العكوسات' : 'Payments / Reversals'}</div>
                <div className="font-bold tabular-nums">
                  <bdi dir="ltr">
                    {zReport.paymentCount} / {zReport.reversalCount}
                  </bdi>
                </div>
              </div>
              <div>
                <div className="text-slate-500">{isDocAr ? 'صافي التدفق النقدي' : 'Net Cash Flow'}</div>
                <div className="font-extrabold tabular-nums">
                  <bdi dir="ltr">
                    {formatPrimaryAmount(zReport.netCashFlowPrimary, zReport.primaryCurrencyCode, isDocAr)}
                  </bdi>
                </div>
              </div>
            </div>

            <table className="w-full border-collapse border border-slate-300 text-xs print-break-inside-avoid">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-3 py-2 text-start">
                    {isDocAr ? 'البند' : 'Summary Line'}
                  </th>
                  <th className="border border-slate-300 px-3 py-2 text-end">
                    {isDocAr ? 'المبلغ' : 'Amount'}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-3 py-2">
                    {isDocAr ? 'إجمالي المقبوضات' : 'Total Collected'}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-end tabular-nums font-semibold">
                    <bdi dir="ltr">
                      {formatPrimaryAmount(zReport.totalCollectedPrimary, zReport.primaryCurrencyCode, isDocAr)}
                    </bdi>
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2">
                    {isDocAr ? 'إجمالي العكوسات والإشعارات الدائنة' : 'Total Reversed'}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-end tabular-nums">
                    <bdi dir="ltr">
                      {formatPrimaryAmount(zReport.totalReversedPrimary, zReport.primaryCurrencyCode, isDocAr)}
                    </bdi>
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2">
                    {isDocAr ? 'صافي التحصيل' : 'Net Collected'}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-end tabular-nums font-bold">
                    <bdi dir="ltr">
                      {formatPrimaryAmount(zReport.netCollectedPrimary, zReport.primaryCurrencyCode, isDocAr)}
                    </bdi>
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-300 px-3 py-2">
                    {isDocAr ? 'المصاريف المسجلة' : 'Recorded Expenses'} ({zReport.expenseCount})
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-end tabular-nums">
                    <bdi dir="ltr">
                      {formatPrimaryAmount(zReport.totalExpensesPrimary, zReport.primaryCurrencyCode, isDocAr)}
                    </bdi>
                  </td>
                </tr>
                <tr className="bg-slate-50 font-bold">
                  <td className="border border-slate-300 px-3 py-2">
                    {isDocAr ? 'صافي التدفق النقدي' : 'Net Cash Flow'}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-end tabular-nums">
                    <bdi dir="ltr">
                      {formatPrimaryAmount(zReport.netCashFlowPrimary, zReport.primaryCurrencyCode, isDocAr)}
                    </bdi>
                  </td>
                </tr>
                {typeof zReport.countedCashActual === 'number' && (
                  <>
                    <tr>
                      <td className="border border-slate-300 px-3 py-2">
                        {isDocAr ? 'النقد الفعلي المعدود في الصندوق' : 'Counted Physical Cash'}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-end tabular-nums">
                        <bdi dir="ltr">
                          {formatPrimaryAmount(zReport.countedCashActual, zReport.primaryCurrencyCode, isDocAr)}
                        </bdi>
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-3 py-2">
                        {isDocAr ? 'فرق الصندوق (فعلي − دفتري)' : 'Cash Drawer Variance'}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 text-end tabular-nums font-bold">
                        <bdi dir="ltr">
                          {formatPrimaryAmount(zReport.cashVariance || 0, zReport.primaryCurrencyCode, isDocAr)}
                        </bdi>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            {Object.keys(zReport.byCurrency || {}).length > 0 && (
              <div className="space-y-1.5 print-break-inside-avoid">
                <h3 className="text-xs font-bold text-slate-800">
                  {isDocAr ? 'تفصيل العملات المستلمة:' : 'Per-Currency Breakdown:'}
                </h3>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                        {isDocAr ? 'العملة' : 'Currency'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-1.5 text-end">
                        {isDocAr ? 'المبلغ الأصلي المحصّل' : 'Original Collected'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-1.5 text-end">
                        {isDocAr ? 'المعادل بعملة العيادة' : 'Ledger Equivalent'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(zReport.byCurrency).map(([code, bucket]) => (
                      <tr key={code}>
                        <td className="border border-slate-300 px-2.5 py-1.5 font-mono font-bold">
                          {code}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-end tabular-nums">
                          <bdi dir="ltr">{formatPrimaryAmount(bucket.collectedOriginal, code, isDocAr)}</bdi>
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-end tabular-nums">
                          <bdi dir="ltr">
                            {formatPrimaryAmount(bucket.collectedPrimary, zReport.primaryCurrencyCode, isDocAr)}
                          </bdi>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* 4. CLINICAL REPORTS: PROGRESS / DISCHARGE / REFERRAL / MEDICAL REPORT */}
        {isClinicalLetter && (
          <section className="space-y-4">
            {documentType === 'referral_letter' && (
              <div className="border border-slate-300 rounded-xl p-3.5 bg-slate-50 print-break-inside-avoid">
                <span className="text-slate-500">{isDocAr ? 'إلى: ' : 'To: '}</span>
                <strong className="text-slate-900">
                  {recipientDoctor.trim() ||
                    patient?.data.referringPhysician ||
                    (isDocAr ? 'السيد/ة الطبيب المختص المحترم' : 'Dear Consulting Specialist')}
                </strong>
              </div>
            )}

            <div className="border border-slate-200 rounded-xl p-4 space-y-2 print-break-inside-avoid">
              <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                {isDocAr ? 'ملخص الحالة والتشخيص' : 'Clinical Summary & Diagnosis'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <span className="text-slate-500">{isDocAr ? 'الحالة / الخطة: ' : 'Episode: '}</span>
                  <strong>{episode?.data.title || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">{isDocAr ? 'التشخيص الطبي: ' : 'Diagnosis: '}</span>
                  <strong>
                    {episode?.data.medicalDiagnosis || '—'}
                    {episode?.data.icd10Code ? ` (${episode.data.icd10Code})` : ''}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">{isDocAr ? 'تاريخ بدء الخطة: ' : 'Episode Start: '}</span>
                  <strong className="tabular-nums">
                    <bdi dir="ltr">
                      {episode?.startDate ? formatDateDDMMYYYY(episode.startDate) : '—'}
                    </bdi>
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">{isDocAr ? 'عدد الجلسات المعتمدة: ' : 'Finalized Sessions: '}</span>
                  <strong className="tabular-nums">{finalizedSessions.length}</strong>
                </div>
              </div>
              {(clinicalStore?.chiefComplaint || episode?.data.chiefComplaint) && (
                <p className="pt-1 text-slate-800">
                  <strong>{isDocAr ? 'الشكوى الرئيسية: ' : 'Chief Complaint: '}</strong>
                  {clinicalStore?.chiefComplaint || episode?.data.chiefComplaint}
                </p>
              )}
              {(clinicalStore?.clinicalImpression || episode?.data.clinicalImpression) && (
                <p className="text-slate-800">
                  <strong>{isDocAr ? 'الانطباع السريري: ' : 'Clinical Impression: '}</strong>
                  {clinicalStore?.clinicalImpression || episode?.data.clinicalImpression}
                </p>
              )}
            </div>

            {baselineSnap && (
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 print-break-inside-avoid">
                <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                  {isDocAr ? 'مقارنة القياسات والتقدم السريري' : 'Objective Progress & Measurements'}
                </h3>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                        {isDocAr ? 'المقياس' : 'Metric'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-1.5 text-center">
                        {isDocAr ? 'التقييم الأولي' : 'Baseline'} ({formatDateDDMMYYYY(baselineSnap.recordedDate)})
                      </th>
                      {latestSnap && latestSnap.id !== baselineSnap.id && (
                        <th className="border border-slate-300 px-2.5 py-1.5 text-center">
                          {isDocAr ? 'آخر تقييم' : 'Latest'} ({formatDateDDMMYYYY(latestSnap.recordedDate)})
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 px-2.5 py-1.5 font-semibold">
                        {isDocAr ? 'شدة الألم أثناء الراحة (NPRS 0–10)' : 'Pain at Rest (NPRS 0–10)'}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums">
                        <bdi dir="ltr">{baselineSnap.painNrsRest}/10</bdi>
                      </td>
                      {latestSnap && latestSnap.id !== baselineSnap.id && (
                        <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums font-bold">
                          <bdi dir="ltr">{latestSnap.painNrsRest}/10</bdi>
                        </td>
                      )}
                    </tr>
                    <tr>
                      <td className="border border-slate-300 px-2.5 py-1.5 font-semibold">
                        {isDocAr ? 'شدة الألم مع الحركة (NPRS 0–10)' : 'Pain on Activity (NPRS 0–10)'}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums">
                        <bdi dir="ltr">{baselineSnap.painNrsActivity}/10</bdi>
                      </td>
                      {latestSnap && latestSnap.id !== baselineSnap.id && (
                        <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums font-bold">
                          <bdi dir="ltr">{latestSnap.painNrsActivity}/10</bdi>
                        </td>
                      )}
                    </tr>
                    {(latestSnap?.outcomeScale || baselineSnap.outcomeScale) && (
                      <tr>
                        <td className="border border-slate-300 px-2.5 py-1.5 font-semibold">
                          {(isDocAr
                            ? latestSnap?.outcomeScale?.scaleNameAr || baselineSnap.outcomeScale?.scaleNameAr
                            : latestSnap?.outcomeScale?.scaleNameEn || baselineSnap.outcomeScale?.scaleNameEn) ||
                            (isDocAr ? 'المقياس الوظيفي' : 'Functional Outcome')}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums">
                          {baselineSnap.outcomeScale
                            ? `${baselineSnap.outcomeScale.scorePercentage}%`
                            : '—'}
                        </td>
                        {latestSnap && latestSnap.id !== baselineSnap.id && (
                          <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums font-bold">
                            {latestSnap.outcomeScale
                              ? `${latestSnap.outcomeScale.scorePercentage}%`
                              : '—'}
                          </td>
                        )}
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Active ROM entries WITHOUT normative normalRanges (preserving clinic customization) */}
                {(latestSnap?.romSummary.length || baselineSnap.romSummary.length) ? (
                  <div className="pt-2">
                    <div className="font-bold text-slate-800 mb-1">
                      {isDocAr ? 'قياسات المدى الحركي المسجلة (ROM):' : 'Measured Range of Motion (ROM):'}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {(latestSnap?.romSummary || baselineSnap.romSummary).slice(0, 8).map((r, idx) => (
                        <div key={idx} className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 flex justify-between">
                          <span>{isDocAr ? r.labelAr || r.labelEn : r.labelEn || r.labelAr}</span>
                          <span className="font-mono font-bold">
                            <bdi dir="ltr">{r.aromDegrees !== null ? `${r.aromDegrees}°` : '—'}</bdi>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {soaps.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-4 space-y-2 print-break-inside-avoid">
                <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                  {isDocAr ? 'أحدث ملاحظة سريرية موثقة (SOAP)' : 'Latest Documented SOAP Summary'}
                </h3>
                {(() => {
                  const latestSoap = soaps[soaps.length - 1];
                  return (
                    <div className="space-y-1 text-slate-800">
                      {latestSoap.data.assessment?.clinicalImpressionCurrent && (
                        <p>
                          <strong>{isDocAr ? 'التقييم (A): ' : 'Assessment (A): '}</strong>
                          {latestSoap.data.assessment.clinicalImpressionCurrent}
                        </p>
                      )}
                      {(latestSoap.data.plan?.homeInstructions ||
                        latestSoap.data.plan?.nextSessionPlan) && (
                        <p>
                          <strong>{isDocAr ? 'الخطة والتثقيف (P): ' : 'Plan & Education (P): '}</strong>
                          {latestSoap.data.plan.homeInstructions ||
                            latestSoap.data.plan.nextSessionPlan}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {documentType === 'discharge_summary' && (
              <div className="border border-slate-200 rounded-xl p-4 space-y-2 bg-slate-50 print-break-inside-avoid">
                <h3 className="font-bold text-slate-900">
                  {isDocAr ? 'ملخص وتوصيات التخريج' : 'Discharge Disposition & Summary'}
                </h3>
                {episode?.data.dischargeReason && (
                  <p>
                    <strong>{isDocAr ? 'سبب التخريج: ' : 'Discharge Reason: '}</strong>
                    {episode.data.dischargeReason}
                  </p>
                )}
                {episode?.data.dischargeSummary && <p>{episode.data.dischargeSummary}</p>}
                {episode?.data.dischargeFinalOutcomeNote && (
                  <p className="text-slate-700">{episode.data.dischargeFinalOutcomeNote}</p>
                )}
              </div>
            )}

            {customRecommendation.trim() && (
              <div className="border border-slate-300 rounded-xl p-3.5 bg-slate-50 print-break-inside-avoid">
                <strong>{isDocAr ? 'توصيات المعالج: ' : 'Clinician Recommendations: '}</strong>
                {customRecommendation}
              </div>
            )}
          </section>
        )}

        {/* 5. HEP SHEET */}
        {documentType === 'hep_sheet' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900">
                {episode?.data.title || (isDocAr ? 'خطة التأهيل الحركي' : 'Rehabilitation Program')}
              </span>
              <span className="text-slate-600 tabular-nums">
                {effectiveHep.length} {isDocAr ? 'تمارين موصوفة' : 'prescribed exercises'}
              </span>
            </div>

            {effectiveHep.length === 0 ? (
              <p className="text-slate-500 text-center py-6">
                {isDocAr ? 'لا توجد تمارين مضافة إلى البرنامج المنزلي.' : 'No exercises assigned to HEP yet.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {effectiveHep.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-slate-300 space-y-2 print-break-inside-avoid"
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-6 rounded-lg bg-emerald-700 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900">
                          {isDocAr ? item.nameAr : item.nameEn}
                        </div>
                        <div className="text-xs text-slate-500">
                          {isDocAr ? item.nameEn : item.nameAr}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700">
                      {isDocAr ? item.instructionsAr : item.instructionsEn}
                    </p>
                    <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-200 text-center font-mono text-xs tabular-nums">
                      <div className="bg-slate-50 rounded p-1">
                        <div className="text-slate-500 font-sans">{isDocAr ? 'جولات' : 'Sets'}</div>
                        <div className="font-bold">{item.sets}</div>
                      </div>
                      <div className="bg-slate-50 rounded p-1">
                        <div className="text-slate-500 font-sans">{isDocAr ? 'تكرار' : 'Reps'}</div>
                        <div className="font-bold">{item.reps}</div>
                      </div>
                      <div className="bg-slate-50 rounded p-1">
                        <div className="text-slate-500 font-sans">{isDocAr ? 'ثبات' : 'Hold'}</div>
                        <div className="font-bold">{item.holdSeconds}s</div>
                      </div>
                      <div className="bg-slate-50 rounded p-1">
                        <div className="text-slate-500 font-sans">{isDocAr ? 'يومياً' : 'Daily'}</div>
                        <div className="font-bold">{item.frequencyPerDay}x</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs print-break-inside-avoid">
              {isDocAr
                ? 'تنبيه أمان: توقف فوراً عن أداء التمرين وتواصل مع العيادة إذا ظهر ألم حاد غير معتاد أو تنميل أو دوار.'
                : 'Safety note: Stop exercising immediately and contact the clinic if you experience sharp unusual pain, numbness, or dizziness.'}
            </div>
          </section>
        )}

        {/* 6. SIGNED CONSENT */}
        {documentType === 'consent' && consent && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 print-break-inside-avoid">
              <div className="font-bold text-slate-900">
                {isDocAr ? consent.titleAr : consent.titleEn}{' '}
                <span className="font-mono text-slate-500">(v{consent.templateVersion})</span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                  consent.revokedAt
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                <CheckCircle2 className="size-3.5" />
                {consent.revokedAt
                  ? isDocAr
                    ? 'تم سحب الموافقة'
                    : 'Revoked'
                  : isDocAr
                    ? 'موافقة موقعة'
                    : 'Signed & Active'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 whitespace-pre-wrap print-break-inside-avoid">
              {isDocAr ? consent.bodySnapshotAr : consent.bodySnapshotEn}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center border border-slate-300 rounded-xl p-4 print-break-inside-avoid">
              <div className="space-y-1">
                <div>
                  <span className="text-slate-500">{isDocAr ? 'اسم الموقّع: ' : 'Signed By: '}</span>
                  <strong>{consent.signerName}</strong> ({consent.signerRelation})
                </div>
                <div>
                  <span className="text-slate-500">{isDocAr ? 'تاريخ التوقيع: ' : 'Signed At: '}</span>
                  <strong className="tabular-nums">
                    <bdi dir="ltr">{formatDateDDMMYYYY(consent.signedAt.slice(0, 10))}</bdi>
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">{isDocAr ? 'المعالج الشاهد: ' : 'Therapist Witness: '}</span>
                  <strong>{consent.therapistWitnessName}</strong>
                </div>
                {consent.revokedAt && consent.revokeReason && (
                  <div className="text-rose-700 font-semibold pt-1">
                    {isDocAr ? 'سبب السحب: ' : 'Revocation Reason: '}
                    {consent.revokeReason}
                  </div>
                )}
              </div>
              {isValidEncryptedImageDataUrl(consent.signatureDataUrl) && (
                <div className="border border-slate-200 rounded-lg p-2 bg-white text-center">
                  <img
                    src={consent.signatureDataUrl}
                    alt="Patient Signature"
                    className="h-20 mx-auto object-contain"
                  />
                  <div className="text-xs text-slate-500 mt-1">
                    {isDocAr ? 'توقيع المريض / الوصي' : 'Patient / Guardian Signature'}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 7. COMPLETE PATIENT DOSSIER (5.1 Portability PDF) */}
        {documentType === 'patient_dossier' && patient && (
          <section className="space-y-4">
            <div className="border border-slate-200 rounded-xl p-4 space-y-2 print-break-inside-avoid">
              <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                {isDocAr ? 'التاريخ الطبي والعلامات التحذيرية' : 'Medical History & Precautions'}
              </h3>
              <p className="text-slate-800">
                <strong>{isDocAr ? 'التاريخ المرضي: ' : 'Medical History: '}</strong>
                {patient.data.medicalHistory || (isDocAr ? 'لا يوجد ما يُذكر' : 'None documented')}
              </p>
              {patient.data.redFlags && (
                <p className="text-rose-700 font-semibold">
                  <strong>{isDocAr ? 'العلامات الحمراء / الاحتياطات: ' : 'Red Flags / Precautions: '}</strong>
                  {patient.data.redFlags}
                </p>
              )}
              {patient.data.occupation && (
                <p className="text-slate-700">
                  <strong>{isDocAr ? 'المهنة: ' : 'Occupation: '}</strong>
                  {patient.data.occupation}
                </p>
              )}
              {patient.data.address && (
                <p className="text-slate-700">
                  <strong>{isDocAr ? 'العنوان: ' : 'Address: '}</strong>
                  {patient.data.address}
                </p>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl p-4 space-y-2 print-break-inside-avoid">
              <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                {isDocAr ? 'ملخص الحلقات العلاجية' : 'Care Episodes Overview'} (
                {(allEpisodes.length > 0 ? allEpisodes : episode ? [episode] : []).length})
              </h3>
              {(allEpisodes.length > 0 ? allEpisodes : episode ? [episode] : []).map((ep) => (
                <div key={ep.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-0.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-slate-900">{ep.data.title}</strong>
                    <span className="tabular-nums text-slate-600">
                      <bdi dir="ltr">{formatDateDDMMYYYY(ep.startDate)}</bdi> • {ep.data.status || 'active'}
                    </span>
                  </div>
                  <div className="text-slate-700">
                    {ep.data.medicalDiagnosis}
                    {ep.data.icd10Code ? ` (${ep.data.icd10Code})` : ''}
                  </div>
                </div>
              ))}
            </div>

            {soaps.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-4 space-y-2.5">
                <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                  {isDocAr ? 'ملخص جلسات SOAP الموثقة' : 'Documented SOAP Sessions'} ({soaps.length})
                </h3>
                {soaps.map((s) => {
                  const matchedSession = sessions.find((sess) => sess.id === s.sessionId);
                  return (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1 print-break-inside-avoid"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-slate-900">
                        <span>
                          {matchedSession?.sessionDate
                            ? formatDateDDMMYYYY(matchedSession.sessionDate)
                            : formatDateDDMMYYYY(s.createdAt.slice(0, 10))}
                        </span>
                        <span>
                          {typeof s.data.subjective?.painNrsScore === 'number'
                            ? `NPRS: ${s.data.subjective.painNrsScore}/10`
                            : ''}
                        </span>
                      </div>
                      {s.data.subjective?.chiefComplaint && (
                        <p className="text-slate-700">
                          <strong>S:</strong> {s.data.subjective.chiefComplaint}
                        </p>
                      )}
                      {s.data.objective?.dailyInterventionsSummary && (
                        <p className="text-slate-700">
                          <strong>O:</strong> {s.data.objective.dailyInterventionsSummary}
                        </p>
                      )}
                      {s.data.assessment?.clinicalImpressionCurrent && (
                        <p className="text-slate-700">
                          <strong>A:</strong> {s.data.assessment.clinicalImpressionCurrent}
                        </p>
                      )}
                      {(s.data.plan?.nextSessionPlan || s.data.plan?.homeInstructions) && (
                        <p className="text-slate-700">
                          <strong>P:</strong>{' '}
                          {[s.data.plan?.nextSessionPlan, s.data.plan?.homeInstructions]
                            .filter(Boolean)
                            .join(' • ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {allPatientConsents.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-4 space-y-1.5 print-break-inside-avoid">
                <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                  {isDocAr ? 'سجل الموافقات الموقعة' : 'Signed Informed Consents'} ({allPatientConsents.length})
                </h3>
                {allPatientConsents.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-800">
                    <span>
                      <strong>{isDocAr ? c.titleAr : c.titleEn}</strong> — {c.signerName}
                    </span>
                    <span className="tabular-nums text-slate-600">
                      <bdi dir="ltr">{formatDateDDMMYYYY(c.signedAt.slice(0, 10))}</bdi>
                      {c.revokedAt ? ` (${isDocAr ? 'مسحوبة' : 'Revoked'})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 8. TOMORROW'S / DAILY SCHEDULE SHEET (Phase E3) */}
        {documentType === 'tomorrow_schedule' && (
          <section data-testid="print-tomorrow-schedule-section" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 print-break-inside-avoid">
              <div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="size-3.5 text-slate-600" />
                  <span>{isDocAr ? 'تاريخ الجدول' : 'Schedule Date'}</span>
                </div>
                <div className="text-xs font-bold text-slate-900 mt-0.5 tabular-nums">
                  <bdi dir="ltr">{formatDateDDMMYYYY(effectiveScheduleDate)}</bdi>
                  {' · '}
                  <span>{formatClinicalDate(effectiveScheduleDate, docLang)}</span>
                </div>
                {scheduleHijriDate && (
                  <div className="text-xs text-slate-600 mt-0.5">{scheduleHijriDate}</div>
                )}
              </div>

              <div>
                <div className="text-xs text-slate-500">
                  {isDocAr ? 'إجمالي المواعيد النشطة' : 'Total Active Appointments'}
                </div>
                <div className="text-base font-extrabold text-slate-900 mt-0.5 tabular-nums">
                  <bdi dir="ltr">{activeScheduleAppointments.length}</bdi>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Home className="size-3.5 text-slate-600" />
                  <span>{isDocAr ? 'الزيارات المنزلية' : 'Home Visits'}</span>
                </div>
                <div className="text-base font-extrabold text-slate-900 mt-0.5 tabular-nums">
                  <bdi dir="ltr">{homeVisitsCount}</bdi>
                </div>
              </div>
            </div>

            {activeScheduleAppointments.length === 0 ? (
              <div className="p-6 rounded-xl border border-slate-300 bg-slate-50 text-center text-xs text-slate-600">
                {isDocAr
                  ? 'لا توجد مواعيد نشطة مجدولة لهذا التاريخ.'
                  : 'No active appointments scheduled for this date.'}
              </div>
            ) : (
              <table className="w-full border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800">
                    <th className="border border-slate-300 px-2.5 py-2 text-start">
                      {isDocAr ? 'الوقت' : 'Time'}
                    </th>
                    <th className="border border-slate-300 px-2.5 py-2 text-start">
                      {isDocAr ? 'المريض والهاتف' : 'Patient & Phone'}
                    </th>
                    <th className="border border-slate-300 px-2.5 py-2 text-start">
                      {isDocAr ? 'نوع الزيارة / العنوان' : 'Visit Type / Address'}
                    </th>
                    <th className="border border-slate-300 px-2.5 py-2 text-start">
                      {isDocAr ? 'المعالج' : 'Therapist'}
                    </th>
                    <th className="border border-slate-300 px-2.5 py-2 text-start">
                      {isDocAr ? 'الغرفة / الموقع' : 'Room / Location'}
                    </th>
                    <th className="border border-slate-300 px-2.5 py-2 text-start">
                      {isDocAr ? 'ملاحظات' : 'Notes'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeScheduleAppointments.map((appt) => {
                    const isHomeVisit = appt.appointmentMode === 'home_visit';
                    const homeAddr = formatHomeVisitAddressDisplay(appt.homeVisitAddress);
                    const locLabel = appt.locationId
                      ? getPracticeLocationLabel(appt.locationId, practiceLocations, isDocAr)
                      : '';
                    const roomLocationText =
                      [appt.roomOrBed, locLabel].filter(Boolean).join(' · ') || '—';

                    return (
                      <tr key={appt.id} className="print-break-inside-avoid">
                        <td className="border border-slate-300 px-2.5 py-2 align-top font-semibold tabular-nums whitespace-nowrap">
                          <div>
                            <bdi dir="ltr">{formatTimeIraq(appt.startTime, docLang)}</bdi>
                          </div>
                          {appt.durationMinutes > 0 && (
                            <div className="text-xs text-slate-500 font-normal">
                              <bdi dir="ltr">
                                {appt.durationMinutes} {isDocAr ? 'د' : 'min'}
                              </bdi>
                            </div>
                          )}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 align-top">
                          <div className="font-bold text-slate-900">{appt.patientName}</div>
                          {appt.patientPhone && (
                            <div className="text-xs text-slate-600 font-mono tabular-nums mt-0.5">
                              <bdi dir="ltr">{formatIraqiPhoneDisplay(appt.patientPhone)}</bdi>
                            </div>
                          )}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 align-top space-y-1">
                          <div className="font-semibold text-slate-800">
                            {visitTypeLabel(appt.visitType)}
                          </div>
                          {isHomeVisit && (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800">
                                <Home className="size-3" />
                                <span>{isDocAr ? 'زيارة منزلية' : 'Home Visit'}</span>
                              </span>
                              {homeAddr && (
                                <div className="text-xs text-slate-700">{homeAddr}</div>
                              )}
                              {appt.homeVisitAddress?.notes && (
                                <div className="text-xs text-slate-500">
                                  {appt.homeVisitAddress.notes}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 align-top text-slate-800">
                          {appt.therapistName || '—'}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 align-top text-slate-700">
                          {roomLocationText}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-2 align-top text-slate-700">
                          {appt.notes || appt.episodeTitle || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* 9. PATIENT VISIT & PACKAGE CARD (Phase E3) */}
        {documentType === 'patient_visit_card' && (
          <section data-testid="print-patient-visit-card-section" className="space-y-4">
            {/* Patient & Clinic Contact/Hours Header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 print-break-inside-avoid">
              <div>
                <div className="text-xs text-slate-500">{isDocAr ? 'اسم المريض' : 'Patient Name'}</div>
                <div className="text-xs font-bold text-slate-900 mt-0.5">
                  {effectiveVisitCard?.patientName || resolvedPatientName}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{isDocAr ? 'رقم الملف (MRN)' : 'MRN'}</div>
                <div className="text-xs font-mono font-semibold text-slate-800 mt-0.5">
                  <bdi dir="ltr">{effectiveVisitCard?.patientMrn || resolvedMrn || '—'}</bdi>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{isDocAr ? 'هاتف المريض' : 'Patient Phone'}</div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5 tabular-nums">
                  <bdi dir="ltr">
                    {(effectiveVisitCard?.patientPhone || resolvedPhone)
                      ? formatIraqiPhoneDisplay(effectiveVisitCard?.patientPhone || resolvedPhone)
                      : '—'}
                  </bdi>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">
                  {isDocAr ? 'دوام العيادة والتواصل' : 'Clinic Hours & Contact'}
                </div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5 space-y-0.5">
                  {clinicProfile.workHoursStart && clinicProfile.workHoursEnd ? (
                    <div className="tabular-nums">
                      <bdi dir="ltr">
                        {formatTimeIraq(clinicProfile.workHoursStart, docLang)} –{' '}
                        {formatTimeIraq(clinicProfile.workHoursEnd, docLang)}
                      </bdi>
                    </div>
                  ) : null}
                  {clinicProfile.workingDays && clinicProfile.workingDays.length > 0 && (
                    <div className="text-xs text-slate-600 font-normal">
                      {formatWeekdaysSummary(clinicProfile.workingDays, docLang)}
                    </div>
                  )}
                  {clinicProfile.phone && (
                    <div className="font-mono tabular-nums">
                      <bdi dir="ltr">{formatIraqiPhoneDisplay(clinicProfile.phone)}</bdi>
                    </div>
                  )}
                  {!clinicProfile.workHoursStart && !clinicProfile.phone && (
                    <div className="text-xs text-slate-600 font-normal">
                      {isDocAr
                        ? 'يرجى التواصل مع العيادة عند الحاجة لتغيير الموعد.'
                        : 'Please contact the clinic if you need to reschedule.'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Highlighted Next Appointment Box */}
            <div
              data-testid="visit-card-next-appointment"
              className="border-2 border-emerald-700/35 rounded-2xl p-4 bg-emerald-50/40 space-y-2 print-break-inside-avoid"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 pb-2">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Calendar className="size-4 text-emerald-700" />
                  <span>{isDocAr ? 'الموعد القادم' : 'Next Appointment'}</span>
                </h3>
                {effectiveVisitCard?.nextAppointment && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-700 text-white text-xs font-bold">
                    {visitTypeLabel(effectiveVisitCard.nextAppointment.visitType)}
                  </span>
                )}
              </div>

              {effectiveVisitCard?.nextAppointment ? (
                (() => {
                  const nextAppt = effectiveVisitCard.nextAppointment;
                  const nextHijri = hijriDisplayEnabled
                    ? formatHijriDate(nextAppt.date, docLang)
                    : '';
                  const isNextHome = nextAppt.appointmentMode === 'home_visit';
                  const nextHomeAddr = formatHomeVisitAddressDisplay(nextAppt.homeVisitAddress);
                  const nextLocation = nextAppt.locationId
                    ? getPracticeLocationLabel(nextAppt.locationId, practiceLocations, isDocAr)
                    : '';
                  const nextRoomText = isNextHome
                    ? nextHomeAddr || (isDocAr ? 'زيارة منزلية' : 'Home Visit')
                    : [nextAppt.roomOrBed, nextLocation].filter(Boolean).join(' · ') || '—';

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs pt-1">
                      <div>
                        <div className="text-xs text-slate-500">{isDocAr ? 'التاريخ' : 'Date'}</div>
                        <div className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                          <bdi dir="ltr">{formatDateDDMMYYYY(nextAppt.date)}</bdi>
                        </div>
                        {nextHijri && (
                          <div className="text-xs text-slate-600 mt-0.5">{nextHijri}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="size-3.5 text-slate-600" />
                          <span>{isDocAr ? 'الوقت' : 'Time'}</span>
                        </div>
                        <div className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                          <bdi dir="ltr">{formatTimeIraq(nextAppt.startTime, docLang)}</bdi>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">{isDocAr ? 'المعالج' : 'Therapist'}</div>
                        <div className="text-xs font-bold text-slate-900 mt-0.5">
                          {nextAppt.therapistName || '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">
                          {isNextHome
                            ? isDocAr
                              ? 'عنوان الزيارة المنزلية'
                              : 'Home Visit Address'
                            : isDocAr
                              ? 'الغرفة / الموقع'
                              : 'Room / Location'}
                        </div>
                        <div className="text-xs font-bold text-slate-900 mt-0.5">
                          {isNextHome && (
                            <span className="inline-flex items-center gap-1 me-1.5 text-xs font-bold text-amber-800">
                              {isDocAr ? 'زيارة منزلية' : 'Home Visit'}
                            </span>
                          )}
                          <span>{nextRoomText}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-xs font-semibold text-slate-600 py-1">
                  {isDocAr
                    ? 'لا يوجد موعد قادم مجدول حالياً'
                    : 'No upcoming appointment scheduled'}
                </p>
              )}
            </div>

            {/* Remaining Package Sessions Box */}
            {(() => {
              const pkgTotal = effectiveVisitCard?.packageTotalSessions || 0;
              const pkgUsed = effectiveVisitCard?.packageUsedSessions || 0;
              const pkgRemaining =
                effectiveVisitCard?.packageRemainingSessions ?? Math.max(0, pkgTotal - pkgUsed);
              const courseInvoices = effectiveVisitCard?.activeCourseInvoiceNumbers || [];
              const balanceDue = effectiveVisitCard?.totalBalanceDueIQD || 0;
              const visibleSlotsCount = Math.min(pkgTotal, 24);

              return (
                <div
                  data-testid="visit-card-remaining-sessions"
                  className="border border-slate-300 rounded-xl p-4 space-y-3 print-break-inside-avoid"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <h3 className="font-bold text-slate-900">
                      {isDocAr ? 'رصيد جلسات الكورس العلاجي' : 'Rehab Package Session Balance'}
                    </h3>
                    <span className="text-emerald-800 text-xs font-extrabold tabular-nums">
                      {isDocAr ? 'المتبقي: ' : 'Remaining: '}
                      <bdi dir="ltr">{pkgRemaining}</bdi>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-xs text-slate-500">
                        {isDocAr ? 'إجمالي الكورس' : 'Total Package'}
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                        <bdi dir="ltr">{pkgTotal}</bdi>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-xs text-slate-500">
                        {isDocAr ? 'الجلسات المكتملة' : 'Completed'}
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                        <bdi dir="ltr">{pkgUsed}</bdi>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-xs text-slate-500">
                        {isDocAr ? 'أرقام فواتير الكورس' : 'Course Invoices'}
                      </div>
                      <div className="text-xs font-mono font-bold text-slate-800 mt-0.5">
                        <bdi dir="ltr">
                          {courseInvoices.length > 0 ? courseInvoices.join(', ') : '—'}
                        </bdi>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-xs text-slate-500">
                        {isDocAr ? 'الرصيد المالي المستحق' : 'Balance Due'}
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5">
                        <bdi dir="ltr">
                          {formatPrimaryAmount(balanceDue, primaryLedgerCode, isDocAr)}
                        </bdi>
                      </div>
                    </div>
                  </div>

                  {pkgTotal > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-xs font-semibold text-slate-700">
                        {isDocAr
                          ? 'مربعات متابعة الجلسات (مكتمل ✓ / متبقٍ):'
                          : 'Session Tracking Checkboxes (Completed ✓ / Remaining):'}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: visibleSlotsCount }, (_, idx) => {
                          const slotNumber = idx + 1;
                          const isCompleted = slotNumber <= pkgUsed;
                          return (
                            <div
                              key={slotNumber}
                              aria-label={
                                isDocAr
                                  ? `جلسة ${slotNumber} ${isCompleted ? 'مكتملة' : 'متبقية'}`
                                  : `Session ${slotNumber} ${isCompleted ? 'completed' : 'remaining'}`
                              }
                              className={`min-w-8 h-8 px-1.5 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-0.5 tabular-nums ${
                                isCompleted
                                  ? 'bg-emerald-100 border-emerald-500 text-emerald-900'
                                  : 'bg-white border-slate-300 text-slate-700'
                              }`}
                            >
                              {isCompleted && <Check className="size-3 shrink-0" />}
                              <span>{slotNumber}</span>
                            </div>
                          );
                        })}
                        {pkgTotal > 24 && (
                          <span className="px-2.5 h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center">
                            <bdi dir="ltr">+{pkgTotal - 24}</bdi>
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600">
                      {isDocAr
                        ? 'لا يوجد كورس جلسات متعدد مسجل حالياً (الفوترة بالجلسة المفردة).'
                        : 'No active multi-session package recorded (single-session billing).'}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Upcoming Scheduled Visits List (up to 6 upcoming visits) */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-2.5 print-break-inside-avoid">
              <h3 className="font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                {isDocAr ? 'قائمة المواعيد القادمة المجدولة' : 'Upcoming Scheduled Visits'}
              </h3>
              {(effectiveVisitCard?.upcomingAppointments || []).length === 0 ? (
                <p className="text-xs text-slate-600">
                  {isDocAr
                    ? 'لا توجد مواعيد قادمة مجدولة حالياً.'
                    : 'No upcoming scheduled visits.'}
                </p>
              ) : (
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800">
                      <th className="border border-slate-300 px-2.5 py-1.5 text-start">#</th>
                      <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                        {isDocAr ? 'التاريخ' : 'Date'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                        {isDocAr ? 'الوقت' : 'Time'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                        {isDocAr ? 'النوع / المكان' : 'Type / Location'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                        {isDocAr ? 'المعالج' : 'Therapist'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(effectiveVisitCard?.upcomingAppointments || []).slice(0, 6).map((appt, idx) => {
                      const isHome = appt.appointmentMode === 'home_visit';
                      const homeAddr = formatHomeVisitAddressDisplay(appt.homeVisitAddress);
                      const locName = appt.locationId
                        ? getPracticeLocationLabel(appt.locationId, practiceLocations, isDocAr)
                        : '';
                      const placeText = isHome
                        ? homeAddr || (isDocAr ? 'زيارة منزلية' : 'Home Visit')
                        : [appt.roomOrBed, locName].filter(Boolean).join(' · ') || '—';
                      return (
                        <tr key={appt.id}>
                          <td className="border border-slate-300 px-2.5 py-1.5 font-mono tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 tabular-nums font-semibold">
                            <bdi dir="ltr">{formatDateDDMMYYYY(appt.date)}</bdi>
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 tabular-nums font-semibold">
                            <bdi dir="ltr">{formatTimeIraq(appt.startTime, docLang)}</bdi>
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5">
                            <span className="font-semibold">{visitTypeLabel(appt.visitType)}</span>
                            <span className="text-slate-500"> · {placeText}</span>
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5">
                            {appt.therapistName || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* Clinic Footer + Stamp / Signature */}
        <footer className="pt-6 border-t border-emerald-700/20 space-y-4 print-break-inside-avoid">
          <div className="flex flex-col sm:flex-row items-end justify-between gap-4">
            <div className="max-w-md space-y-1 text-xs text-slate-600 hidden sm:block">
              {(clinicProfile.receiptFooterAr || clinicProfile.receiptFooterEn) && (
                <p className="font-medium text-slate-800">
                  {isDocAr
                    ? clinicProfile.receiptFooterAr || clinicProfile.receiptFooterEn
                    : clinicProfile.receiptFooterEn || clinicProfile.receiptFooterAr}
                </p>
              )}
              <p className="text-slate-500">
                {isDocAr
                  ? 'تم إنشاء هذا المستند محلياً داخل عيادة PhysioRecord المشفرة على الجهاز.'
                  : 'Generated locally inside PhysioRecord — encrypted on-device clinical workstation.'}
              </p>
            </div>

            <div className="text-center min-w-[160px] space-y-1 ms-auto">
              {stampSafe && (
                <img
                  src={stampSafe}
                  alt="Clinic Stamp"
                  className="h-16 mx-auto object-contain"
                />
              )}
              <div className="border-t border-emerald-700/40 pt-1 font-semibold text-slate-800">
                {(isDocAr ? clinicProfile.therapistNameAr : clinicProfile.therapistNameEn) ||
                  clinicProfile.therapistNameAr ||
                  clinicProfile.therapistNameEn}
              </div>
              <div className="text-xs text-slate-500">
                {isDocAr ? 'توقيع وختم العيادة' : 'Clinic Stamp & Signature'}
              </div>
            </div>
          </div>

          {/* On mobile / small screens, disclaimer footnote renders at the very bottom below signature */}
          <div className="sm:hidden text-center text-[10px] text-slate-400 pt-2 border-t border-slate-100 space-y-0.5">
            {(clinicProfile.receiptFooterAr || clinicProfile.receiptFooterEn) && (
              <p className="font-medium text-slate-600">
                {isDocAr
                  ? clinicProfile.receiptFooterAr || clinicProfile.receiptFooterEn
                  : clinicProfile.receiptFooterEn || clinicProfile.receiptFooterAr}
              </p>
            )}
            <p>
              {isDocAr
                ? 'تم إنشاء هذا المستند محلياً داخل عيادة PhysioRecord المشفرة على الجهاز.'
                : 'Generated locally inside PhysioRecord — encrypted on-device clinical workstation.'}
            </p>
          </div>
        </footer>
      </div>
      </div>
          </div>
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
};
