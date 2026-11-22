// =======================================================================
// PhysioRecord — Printable & Copyable Report-Back Letter Modal
// Extracted from ReferralsAndRetentionPanel for modular maintainability.
// =======================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog as AriaDialog,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { useLanguage } from '../../../context/LanguageContext';
import { ClinicOperationsService } from '../../../services/clinicOperationsService';
import {
  formatDateDDMMYYYY,
  localDate,
} from '../../../utils/date';
import { isValidEncryptedImageDataUrl } from '../../../utils/imageUtils';
import {
  buildShareableDocumentHtmlFile,
  buildShareableDocumentHtmlString,
  shareDocumentViaWebShareOrFallback,
} from '../../../utils/sharingInteropPhaseE';
import { useSinglePagePrintFit } from '../../../utils/printLayoutFit';
import {
  exportPlatformPdfDirect,
  getElectronDesktopBridge,
  saveTextFilePortable,
  triggerPlatformPrint,
} from '../../../platform/nativeBridge';
import { buildDoctorReportBackLetter } from '../../../utils/iraqReferralsRetentionC6C7';
import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../../../types/clinical';
import type {
  EpisodeScopedClinicalStore,
  ReferringDoctorEntry,
} from '../../../types/clinicManagement';
import { GeometricHeaderBackdrop } from '../../ui/Dialog';
import { FloatingA4PreviewStage } from '../../print/FloatingA4PreviewStage';
import type { PrintPreviewZoomMode } from '../../../utils/printLayoutFit';
import { AutoResizeTextarea } from '../../ui/Primitives';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Eye,
  Minimize2,
  Printer,
  Share2,
  Stethoscope,
  X,
} from 'lucide-react';

export interface DoctorReportBackLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: PatientRecord;
  doctor?: ReferringDoctorEntry | null;
  doctorNameFallback?: string;
  episode?: EpisodeRecord | null;
  sessions: SessionRecord[];
  episodeStore?: EpisodeScopedClinicalStore | null;
  soaps?: SoapNoteRecord[];
}

export const DoctorReportBackLetterModal: React.FC<DoctorReportBackLetterModalProps> = ({
  isOpen,
  onClose,
  patient,
  doctor,
  doctorNameFallback,
  episode,
  sessions,
  episodeStore,
  soaps,
}) => {
  const { language, isRtl, bi } = useLanguage();
  const [letterLang, setLetterLang] = useState<'ar' | 'en'>(language === 'en' ? 'en' : 'ar');
  const [copied, setCopied] = useState(false);
  const [shareStatusText, setShareStatusText] = useState<string | null>(null);
  const [fitSinglePage, setFitSinglePage] = useState(true);
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');
  const [zoomMode, setZoomMode] = useState<PrintPreviewZoomMode>('mini');
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  const sheetFooterRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setLetterLang(language === 'en' ? 'en' : 'ar');
  }, [language, isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    document.body.classList.add('printing-clinical-doc');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('printing-clinical-doc');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const clinicProfile = useMemo(
    () => (isOpen ? ClinicOperationsService.getClinicProfile() : ClinicOperationsService.getClinicProfile()),
    [isOpen]
  );

  const isLetterAr = letterLang === 'ar';
  const generated = useMemo(() => {
    const clinicName = isLetterAr
      ? clinicProfile.clinicNameAr || clinicProfile.clinicNameEn
      : clinicProfile.clinicNameEn || clinicProfile.clinicNameAr;
    const therapistName = isLetterAr
      ? clinicProfile.therapistNameAr || clinicProfile.therapistNameEn
      : clinicProfile.therapistNameEn || clinicProfile.therapistNameAr;

    return buildDoctorReportBackLetter({
      doctor,
      doctorNameFallback,
      patient,
      clinicalData: patient.data,
      episode,
      sessions,
      clinicName,
      therapistName,
      episodeStore,
      soaps,
      isAr: isLetterAr,
    });
  }, [
    clinicProfile,
    doctor,
    doctorNameFallback,
    episode,
    episodeStore,
    isLetterAr,
    patient,
    sessions,
    soaps,
  ]);

  const [subjectText, setSubjectText] = useState(generated.subject);
  const [bodyText, setBodyText] = useState(generated.body);

  useEffect(() => {
    setSubjectText(generated.subject);
    setBodyText(generated.body);
  }, [generated]);

  useEffect(() => {
    if (isOpen) {
      setFitSinglePage(true);
      setViewMode('preview');
      setZoomMode('mini');
    }
  }, [isOpen]);

  const { printScale, isScaled } = useSinglePagePrintFit({
    enabled: isOpen && fitSinglePage,
    bodyRef: sheetBodyRef,
    footerRef: sheetFooterRef,
    deps: [isOpen, letterLang, subjectText, bodyText],
  });

  if (!isOpen) return null;

  const logoSafe = isValidEncryptedImageDataUrl(clinicProfile.logoDataUrl)
    ? clinicProfile.logoDataUrl
    : undefined;
  const stampSafe = isValidEncryptedImageDataUrl(clinicProfile.stampSignatureDataUrl)
    ? clinicProfile.stampSignatureDataUrl
    : undefined;

  const resolvedClinicName =
    (isLetterAr ? clinicProfile.clinicNameAr : clinicProfile.clinicNameEn) ||
    clinicProfile.clinicNameAr ||
    clinicProfile.clinicNameEn ||
    (isLetterAr
      ? 'عيادة العلاج الطبيعي والتأهيل الطبي'
      : 'Physical Therapy & Medical Rehabilitation Clinic');

  const resolvedTherapistName =
    (isLetterAr ? clinicProfile.therapistNameAr : clinicProfile.therapistNameEn) ||
    clinicProfile.therapistNameAr ||
    clinicProfile.therapistNameEn ||
    (isLetterAr ? 'المعالج الفيزيائي المشرف' : 'Supervising Physiotherapist');

  const resolvedDoctorLabel =
    (doctor ? (isLetterAr ? doctor.nameAr || doctor.nameEn : doctor.nameEn || doctor.nameAr) : '') ||
    doctorNameFallback ||
    patient.data.referringPhysician ||
    (isLetterAr ? 'السيد/ة الطبيب المختص المحترم' : 'Dear Referring Physician');

  const resolvedPatientLabel = isLetterAr
    ? patient.data.fullNameAr || patient.data.fullName
    : patient.data.fullName || patient.data.fullNameAr;

  const fileNameBase = `physiorecord-referral-report-${patient.data.mrn || patient.id}-${localDate()}`;
  const canDirectExportPdf = Boolean(getElectronDesktopBridge()?.exportCurrentPageToPdf);

  const handlePrint = () => {
    void triggerPlatformPrint(fileNameBase);
  };

  const handleDirectExportPdf = async () => {
    const ok = await exportPlatformPdfDirect(`${fileNameBase}.pdf`);
    if (ok) {
      setShareStatusText(bi('تم حفظ ملف PDF بنجاح', 'PDF saved successfully', 'پەڕگەی PDF پاشەکەوت کرا'));
      setTimeout(() => setShareStatusText(null), 3000);
    }
  };

  const handleShareFile = async () => {
    const file = buildShareableDocumentHtmlFile({
      title: subjectText,
      docType: 'referral_letter',
      sheetHtml: sheetRef.current?.innerHTML || '',
      dir: isLetterAr ? 'rtl' : 'ltr',
      lang: letterLang,
      fileNameBase,
    });
    const result = await shareDocumentViaWebShareOrFallback({
      title: subjectText,
      text: `${subjectText}\n\n${bodyText}`,
      file,
      patientPhone: doctor?.phone || null,
    });
    if (result.method === 'web_share_file' || result.method === 'web_share_text') {
      setShareStatusText(bi('تمت مشاركة التقرير بنجاح', 'Report shared successfully', 'ڕاپۆرتەکە هاوبەشکرا'));
    } else {
      setShareStatusText(bi('تم نسخ التقرير للمشاركة', 'Report copied for sharing', 'ڕاپۆرتەکە کۆپی کرا'));
    }
    setTimeout(() => setShareStatusText(null), 3000);
  };

  const handleDownloadFile = async () => {
    const shareParams = {
      title: subjectText,
      docType: 'referral_letter',
      sheetHtml: sheetRef.current?.innerHTML || '',
      dir: (isLetterAr ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
      lang: letterLang,
      fileNameBase,
    };
    const file = buildShareableDocumentHtmlFile(shareParams);
    const htmlText = buildShareableDocumentHtmlString(shareParams);
    try {
      await saveTextFilePortable({
        filename: file.name,
        content: htmlText,
        mimeType: 'text/html;charset=utf-8',
        description: 'HTML Printable Document (.html)',
        extensions: ['html'],
      });
      setShareStatusText(bi('تم تنزيل ملف التقرير', 'Report file downloaded', 'پەڕگەی ڕاپۆرت داگیرا'));
      setTimeout(() => setShareStatusText(null), 3000);
    } catch {
      // User cancelled native dialog
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${subjectText}\n\n${bodyText}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      className="react-aria-ModalOverlay print-modal-overlay fixed inset-0 z-[90] bg-slate-950/90 flex flex-col outline-none print:static print:inset-auto print:!bg-white print:block"
    >
      <Modal
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full h-full max-h-[100dvh] flex flex-col outline-none print:h-auto print:max-h-none print:!bg-white print:block overflow-hidden print:overflow-visible"
      >
        <AriaDialog
          aria-label={bi(
            'معاينة تقرير المتابعة للطبيب المحيل',
            'Referring Doctor Report-Back Letter',
            'پێشبینینی ڕاپۆرتی بەدواداچوون بۆ پزیشکی نێردەر'
          )}
          className="w-full h-full flex flex-col min-h-0 outline-none print:h-auto print:!bg-white print:block overflow-hidden print:overflow-visible"
        >
          {/* Clean Compact Top Header & Zero-Overflow Mode/Language Bar */}
          <header
            className="print-modal-chrome w-full bg-card border-b border-card-line shadow-sm shrink-0 print:hidden z-30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative overflow-hidden px-3.5 sm:px-6 py-2.5 bg-primary text-primary-foreground">
              <GeometricHeaderBackdrop />
              <div className="relative z-10 max-w-4xl mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="size-8 rounded-xl bg-primary-foreground/15 text-primary-foreground border border-primary-foreground/25 flex items-center justify-center shrink-0">
                    <Stethoscope className="size-4" />
                  </span>
                  <h2 className="text-sm font-black text-primary-foreground truncate">
                    {bi(
                      'تقرير متابعة للطبيب المحيل',
                      'Report-Back Letter to Referring Doctor',
                      'ڕاپۆرتی بەدواداچوون بۆ پزیشکی نێردەر'
                    )}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label={bi('إغلاق', 'Close', 'داخستن')}
                  className="size-8 !p-0 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground inline-flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Clean Segmented Control Bar: Preview A4 / Edit + Language + 1-Page Fit */}
            <div className="px-3.5 sm:px-6 py-2 bg-surface/95 border-t border-card-line/80">
              <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label={bi('وضع العرض', 'View mode', 'شێوازی پیشاندان')}
                  className="inline-flex items-center rounded-xl bg-layer border border-line-2 p-0.5"
                >
                  <button
                    type="button"
                    data-testid="referral-mode-preview-btn"
                    aria-pressed={viewMode === 'preview'}
                    onClick={() => setViewMode('preview')}
                    className={`min-h-[30px] px-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      viewMode === 'preview'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground-1 hover:text-foreground'
                    }`}
                  >
                    <Eye className="size-3.5 shrink-0" />
                    <span>{bi('معاينة A4', 'A4 Preview', 'پێشبینینی A4')}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="referral-mode-edit-btn"
                    aria-pressed={viewMode === 'edit'}
                    onClick={() => setViewMode('edit')}
                    className={`min-h-[30px] px-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      viewMode === 'edit'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground-1 hover:text-foreground'
                    }`}
                  >
                    <Edit3 className="size-3.5 shrink-0" />
                    <span>{bi('تعديل النص', 'Edit Text', 'دەستکاری')}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <div
                    role="group"
                    aria-label={bi('لغة التقرير', 'Report language', 'زمانی ڕاپۆرت')}
                    className="inline-flex items-center rounded-xl bg-layer border border-line-2 p-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => setLetterLang('ar')}
                      aria-pressed={isLetterAr}
                      className={`min-h-[30px] px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        isLetterAr
                          ? 'bg-primary text-primary-foreground shadow-2xs'
                          : 'text-muted-foreground-1 hover:text-foreground'
                      }`}
                    >
                      عربي
                    </button>
                    <button
                      type="button"
                      onClick={() => setLetterLang('en')}
                      aria-pressed={!isLetterAr}
                      className={`min-h-[30px] px-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        !isLetterAr
                          ? 'bg-primary text-primary-foreground shadow-2xs'
                          : 'text-muted-foreground-1 hover:text-foreground'
                      }`}
                    >
                      EN
                    </button>
                  </div>

                  <button
                    type="button"
                    aria-pressed={fitSinglePage}
                    onClick={() => setFitSinglePage((v) => !v)}
                    aria-label={bi('ملاءمة بصفحة واحدة (A4)', 'Fit to 1 A4 Page', 'گونجاندن لە یەک لاپەڕە')}
                    title={bi('ملاءمة بصفحة واحدة (A4)', 'Fit to 1 A4 Page', 'گونجاندن لە یەک لاپەڕە')}
                    className={`min-h-[32px] px-2.5 py-1 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      fitSinglePage
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-line-2 bg-card hover:bg-layer-hover text-foreground'
                    }`}
                  >
                    <Minimize2 className="size-3.5 shrink-0" />
                    <span className="hidden sm:inline">
                      {bi('صفحة واحدة', '1-Page A4', 'یەک لاپەڕە')}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Screen-only Edit Mode Panel */}
          {viewMode === 'edit' && (
            <div
              onClick={onClose}
              className="print-modal-chrome print:hidden flex-1 min-h-0 w-full overflow-y-auto overscroll-contain p-3.5 sm:p-6 bg-slate-200/80 dark:bg-slate-950/90 flex flex-col items-center"
            >
              <div
                className="w-full max-w-2xl bg-card border border-card-line rounded-2xl p-4 sm:p-5 shadow-md space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div>
                  <label htmlFor="doc-letter-subject" className="block text-xs font-bold text-foreground mb-1.5">
                    {bi('عنوان الرسالة / الموضوع:', 'Letter Subject:', 'ناونیشانی نامە / بابەت:')}
                  </label>
                  <input
                    id="doc-letter-subject"
                    type="text"
                    dir={isLetterAr ? 'rtl' : 'ltr'}
                    value={subjectText}
                    onChange={(e) => setSubjectText(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-layer-line bg-layer text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="doc-letter-body" className="block text-xs font-bold text-foreground mb-1.5">
                    {bi('نص التقرير السريري للطبيب المحيل:', 'Report Body:', 'دەقی ڕاپۆرتی کلینیکی بۆ پزیشکی نێردەر:')}
                  </label>
                  <AutoResizeTextarea
                    id="doc-letter-body"
                    minRows={10}
                    dir={isLetterAr ? 'rtl' : 'ltr'}
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-layer-line bg-layer text-xs text-foreground leading-relaxed focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('preview')}
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-primary/12 hover:bg-primary/18 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Eye className="size-4" />
                    <span>{bi('معاينة الورقة (A4)', 'Preview A4 Sheet', 'پێشبینینی پەڕەی A4')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Floating Miniature A4 Paper Preview Stage (Always mounted for @media print & Share HTML) */}
          <FloatingA4PreviewStage
            zoomMode={zoomMode}
            onZoomModeChange={setZoomMode}
            onBackdropClick={onClose}
            className={viewMode === 'edit' ? 'hidden print:block' : ''}
          >
            <div
              ref={sheetRef}
              dir={isLetterAr ? 'rtl' : 'ltr'}
              data-print-fit-scaled={isScaled ? 'true' : undefined}
              style={{ ['--pr-print-zoom' as string]: String(printScale) }}
              className="print-sheet-container w-[794px] min-w-[794px] min-h-[1123px] print:w-full print:min-w-0 bg-white text-slate-900 border border-slate-300 border-t-4 border-t-slate-900 p-8 sm:p-11 flex flex-col justify-between text-xs leading-relaxed"
            >
              <div ref={sheetBodyRef} className="space-y-5 print:space-y-2.5">
                {/* Formal Institutional Header */}
                <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4 print:pb-2.5 print-break-inside-avoid">
                  <div className="flex items-start gap-3.5">
                    {logoSafe && (
                      <img
                        src={logoSafe}
                        alt="Clinic Logo"
                        className="h-16 w-16 print:h-12 print:w-12 object-contain rounded-lg border border-slate-300 p-1 bg-white shrink-0"
                      />
                    )}
                    <div className="space-y-1 print:space-y-0.5">
                      <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
                        {resolvedClinicName}
                      </h1>
                      <p className="text-xs font-bold text-slate-800">
                        {isLetterAr ? 'المعالج الفيزيائي المشرف: ' : 'Supervising Physiotherapist: '}
                        {resolvedTherapistName}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                        {clinicProfile.licenseNumber && (
                          <span>
                            {isLetterAr ? 'رقم الإجازة: ' : 'License #: '}
                            <bdi dir="ltr">{clinicProfile.licenseNumber}</bdi>
                          </span>
                        )}
                        {clinicProfile.phone && (
                          <span>
                            {isLetterAr ? 'الهاتف: ' : 'Phone: '}
                            <bdi dir="ltr">{clinicProfile.phone}</bdi>
                          </span>
                        )}
                      </div>
                      {(clinicProfile.addressAr || clinicProfile.addressEn) && (
                        <p className="text-xs text-slate-600">
                          {isLetterAr
                            ? clinicProfile.addressAr || clinicProfile.addressEn
                            : clinicProfile.addressEn || clinicProfile.addressAr}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="border border-slate-300 bg-slate-50 rounded-lg px-3.5 py-2 print:py-1.5 text-xs space-y-1 print:space-y-0.5 shrink-0">
                    <div className="font-bold text-slate-900">
                      {isLetterAr ? 'كتاب رسمي / تقرير سريري' : 'Official Clinical Report'}
                    </div>
                    <div className="text-slate-600">
                      {isLetterAr ? 'تاريخ الإصدار: ' : 'Issue Date: '}
                      <bdi dir="ltr" className="font-bold text-slate-900 tabular-nums">
                        {formatDateDDMMYYYY(localDate())}
                      </bdi>
                    </div>
                    <div className="text-slate-600">
                      {isLetterAr ? 'رقم الملف: ' : 'MRN: '}
                      <bdi dir="ltr" className="font-mono font-bold text-slate-900">
                        {patient.data.mrn || '—'}
                      </bdi>
                    </div>
                  </div>
                </header>

                {/* Formal Centered Title Banner */}
                <div className="border-y border-slate-400 bg-slate-100 py-2 print:py-1.5 px-4 text-center print-break-inside-avoid">
                  <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                    {isLetterAr
                      ? 'تقرير متابعة سريري للطبيب المحيل — Referring Physician Progress Report'
                      : 'Referring Physician Clinical Follow-Up Report'}
                  </h2>
                </div>

                {/* Formal Word-Style Bordered Metadata Table */}
                <table className="w-full border-collapse border border-slate-400 text-xs print-break-inside-avoid">
                  <tbody>
                    <tr>
                      <th className="border border-slate-300 bg-slate-100 px-3 py-2 print:py-1.5 text-start font-bold text-slate-800 w-[18%]">
                        {isLetterAr ? 'إلى حضرة الطبيب' : 'Referred By / To'}
                      </th>
                      <td className="border border-slate-300 px-3 py-2 print:py-1.5 font-bold text-slate-900 w-[32%]">
                        {resolvedDoctorLabel}
                        {(isLetterAr ? doctor?.specialtyAr || doctor?.specialtyEn : doctor?.specialtyEn || doctor?.specialtyAr)
                          ? ` (${isLetterAr ? doctor?.specialtyAr || doctor?.specialtyEn : doctor?.specialtyEn || doctor?.specialtyAr})`
                          : ''}
                      </td>
                      <th className="border border-slate-300 bg-slate-100 px-3 py-2 print:py-1.5 text-start font-bold text-slate-800 w-[18%]">
                        {isLetterAr ? 'اسم المريض' : 'Patient Name'}
                      </th>
                      <td className="border border-slate-300 px-3 py-2 print:py-1.5 font-bold text-slate-900 w-[32%]">
                        {resolvedPatientLabel}
                      </td>
                    </tr>
                    <tr>
                      <th className="border border-slate-300 bg-slate-100 px-3 py-2 print:py-1.5 text-start font-bold text-slate-800">
                        {isLetterAr ? 'العمر / الجنس' : 'Age / Gender'}
                      </th>
                      <td className="border border-slate-300 px-3 py-2 print:py-1.5 font-semibold text-slate-800">
                        {patient.data.age ? `${patient.data.age} ${isLetterAr ? 'سنة' : 'yrs'}` : '—'}
                        {patient.data.gender
                          ? ` · ${
                              patient.data.gender === 'male'
                                ? isLetterAr
                                  ? 'ذكر'
                                  : 'Male'
                                : patient.data.gender === 'female'
                                  ? isLetterAr
                                    ? 'أنثى'
                                    : 'Female'
                                  : ''
                            }`
                          : ''}
                      </td>
                      <th className="border border-slate-300 bg-slate-100 px-3 py-2 print:py-1.5 text-start font-bold text-slate-800">
                        {isLetterAr ? 'رقم الهاتف' : 'Phone'}
                      </th>
                      <td className="border border-slate-300 px-3 py-2 print:py-1.5 font-semibold text-slate-800 tabular-nums">
                        <bdi dir="ltr">{patient.data.phone || patient.data.phoneNumber || '—'}</bdi>
                      </td>
                    </tr>
                    <tr>
                      <th className="border border-slate-300 bg-slate-100 px-3 py-2 print:py-1.5 text-start font-bold text-slate-800">
                        {isLetterAr ? 'الموضوع' : 'Subject'}
                      </th>
                      <td colSpan={3} className="border border-slate-300 px-3 py-2 print:py-1.5 font-bold text-slate-900">
                        {subjectText}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Formal Clinical Narrative Box */}
                <div className="border border-slate-300 rounded-md overflow-hidden">
                  <div className="bg-slate-100 border-b border-slate-300 px-3.5 py-2 print:py-1.5 font-bold text-slate-900">
                    {isLetterAr
                      ? 'تفاصيل التقييم السريري وخطة التأهيل المتبعة'
                      : 'Clinical Evaluation & Rehabilitation Summary'}
                  </div>
                  <div className="p-4 print:p-3 whitespace-pre-wrap text-xs leading-6 print:leading-snug text-slate-900 font-sans min-h-[82mm] print:min-h-0">
                    {bodyText}
                  </div>
                </div>
              </div>

              {/* Official Bottom-Anchored Signature & Stamp Footer */}
              <footer ref={sheetFooterRef} className="mt-auto pt-4 print:pt-2.5 border-t-2 border-slate-800 print-break-inside-avoid">
                <div className="flex flex-row items-end justify-between gap-6">
                  <div className="max-w-md space-y-1 text-xs text-slate-600">
                    <p className="font-bold text-slate-800">
                      {isLetterAr
                        ? 'وتفضلوا بقبول فائق الاحترام والتقدير،'
                        : 'Sincerely, Physical Therapy & Rehabilitation Department'}
                    </p>
                    <p className="text-slate-500">
                      {isLetterAr
                        ? 'وثيقة سريرية رسمية صادرة محلياً من نظام العيادة المشفر PhysioRecord.'
                        : 'Official clinical document generated locally inside PhysioRecord.'}
                    </p>
                  </div>

                  <div className="border border-slate-300 bg-slate-50/70 rounded-lg px-5 py-2.5 print:py-2 text-center min-w-[210px] space-y-1 ms-auto">
                    <div className="text-xs font-bold text-slate-600">
                      {isLetterAr ? 'المعالج الفيزيائي المشرف' : 'Supervising Physiotherapist'}
                    </div>
                    {stampSafe ? (
                      <img
                        src={stampSafe}
                        alt="Clinic Stamp"
                        className="h-14 print:h-11 mx-auto object-contain"
                      />
                    ) : (
                      <div className="h-8 print:h-6" />
                    )}
                    <div className="border-t border-slate-400 pt-1 text-xs font-extrabold text-slate-900">
                      {resolvedTherapistName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {isLetterAr ? 'التوقيع والختم الرسمي' : 'Official Signature & Stamp'}
                    </div>
                  </div>
                </div>
              </footer>
            </div>
          </FloatingA4PreviewStage>

          {/* Clean Sticky Bottom Action Bar (Zero Horizontal Clipping on Mobile & Desktop) */}
          <footer
            onClick={(e) => e.stopPropagation()}
            className="print-modal-chrome print:hidden shrink-0 w-full bg-card border-t border-card-line px-3 sm:px-6 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] z-30 shadow-[0_-6px_24px_-12px_rgba(15,23,42,0.18)]"
          >
            <div className="max-w-4xl mx-auto space-y-2">
              {shareStatusText && (
                <div
                  role="status"
                  className="text-emerald-700 dark:text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span>{shareStatusText}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 sm:flex-none min-w-0">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex-1 sm:flex-none min-h-[40px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  >
                    <Printer className="size-4 shrink-0" />
                    <span className="truncate">
                      {bi('طباعة / حفظ PDF', 'Print / Save PDF', 'چاپ / پاشەکەوتکردنی PDF')}
                    </span>
                  </button>

                  {canDirectExportPdf && (
                    <button
                      type="button"
                      onClick={() => void handleDirectExportPdf()}
                      className="min-h-[40px] px-3 py-2 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                    >
                      <Download className="size-4 shrink-0" />
                      <span className="hidden sm:inline">
                        {bi('PDF مباشر', 'Direct PDF', 'PDF ڕاستەوخۆ')}
                      </span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label={bi('مشاركة التقرير', 'Share Report', 'هاوبەشکردنی ڕاپۆرت')}
                    title={bi('مشاركة التقرير', 'Share Report', 'هاوبەشکردنی ڕاپۆرت')}
                    onClick={() => void handleShareFile()}
                    className="size-10 sm:w-auto sm:px-3 rounded-xl border border-primary/25 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
                  >
                    <Share2 className="size-4 shrink-0" />
                    <span className="hidden sm:inline">
                      {bi('مشاركة', 'Share', 'هاوبەشکردن')}
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label={copied ? bi('تم النسخ', 'Copied', 'لەبەرگیرا') : bi('نسخ النص', 'Copy', 'لەبەرگرتنەوە')}
                    title={copied ? bi('تم النسخ', 'Copied', 'لەبەرگیرا') : bi('نسخ النص', 'Copy', 'لەبەرگرتنەوە')}
                    onClick={() => void handleCopy()}
                    className="size-10 sm:w-auto sm:px-3 rounded-xl border border-line-2 bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
                  >
                    {copied ? (
                      <Check className="size-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Copy className="size-4 text-primary shrink-0" />
                    )}
                    <span className="hidden sm:inline">
                      {copied ? bi('تم النسخ', 'Copied', 'لەبەرگیرا') : bi('نسخ', 'Copy', 'کۆپی')}
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label={bi('تنزيل ملف (.html)', 'Download File', 'داگرتنی پەڕگە')}
                    title={bi('تنزيل ملف (.html)', 'Download File', 'داگرتنی پەڕگە')}
                    onClick={() => void handleDownloadFile()}
                    className="size-10 sm:w-auto sm:px-3 rounded-xl border border-line-2 bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
                  >
                    <Download className="size-4 text-primary shrink-0" />
                    <span className="hidden sm:inline">HTML</span>
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
};
