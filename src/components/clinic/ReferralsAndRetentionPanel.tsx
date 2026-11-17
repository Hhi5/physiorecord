// =======================================================================
// PhysioRecord — Phase C6–C7: Referrals, Referring Doctors & Retention Hub
// Offline-only statistics, doctor directory, printable/copyable report-back
// letters, and 4 actionable retention buckets with WhatsApp reminder links.
// =======================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog as AriaDialog,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { usePatients } from '../../context/PatientContext';
import { useCurrency } from '../../context/CurrencyContext';
import { EpisodeService } from '../../services/episodeService';
import { SessionService } from '../../services/sessionService';
import { SoapService } from '../../services/soapService';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import {
  formatDateDDMMYYYY,
  formatIraqiPhoneDisplay,
  localDate,
} from '../../utils/date';
import { getCurrencyConfig } from '../../utils/currencies';
import { isValidEncryptedImageDataUrl } from '../../utils/imageUtils';
import {
  REFERRAL_SOURCE_LABELS,
  buildDoctorReportBackLetter,
  buildRetentionWhatsAppMessage,
  buildRetentionWhatsAppUrl,
  computeReferralStatistics,
  computeRetentionActionLists,
  resolveDoctorDisplayName,
  resolvePatientName,
  resolvePatientReferralSource,
  type PostDischargeFollowUpDueItem,
} from '../../utils/iraqReferralsRetentionC6C7';
import type {
  EpisodeRecord,
  PatientClinicalData,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../../types/clinical';
import type {
  EpisodeScopedClinicalStore,
  ReferralSourceType,
  ReferringDoctorEntry,
} from '../../types/clinicManagement';

const REFERRAL_SOURCE_CKB: Record<ReferralSourceType, string> = {
  doctor: 'پزیشکی نێردەر',
  hospital: 'نەخۆشخانە / ناوەند',
  friend: 'ناسیاو / هاوڕێ',
  social_media: 'تۆڕە کۆمەڵایەتییەکان',
  other: 'سەرچاوەی تر',
};
import {
  AccessibleTab,
  AccessibleTabList,
  AccessibleTabPanel,
  AccessibleTabs,
} from '../ui/Tabs';
import { GeometricHeaderBackdrop } from '../ui/Dialog';
import { ModalDialog } from '../ui/Dialog';
import {
  AutoResizeTextarea,
  Fraction,
  Money,
  Num,
  PhoneInput,
} from '../ui/Primitives';
import {
  Activity,
  Building2,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  FileText,
  Languages,
  MessageCircle,
  Package,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Share2,
  Stethoscope,
  Trash2,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';

// -----------------------------------------------------------------------
// Reusable Printable & Copyable Report-Back Letter Modal
// -----------------------------------------------------------------------

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

  if (!isOpen) return null;

  const logoSafe = isValidEncryptedImageDataUrl(clinicProfile.logoDataUrl)
    ? clinicProfile.logoDataUrl
    : undefined;
  const stampSafe = isValidEncryptedImageDataUrl(clinicProfile.stampSignatureDataUrl)
    ? clinicProfile.stampSignatureDataUrl
    : undefined;

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
      className="fixed inset-0 z-[90] bg-slate-950/65 backdrop-blur-xs flex flex-col outline-none"
    >
      <Modal
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full h-full max-h-[100dvh] flex flex-col outline-none print:h-auto print:max-h-none"
      >
        <AriaDialog
          aria-label={bi(
            'معاينة تقرير المتابعة للطبيب المحيل',
            'Referring Doctor Report-Back Letter',
            'پێشبینینی ڕاپۆرتی بەدواداچوون بۆ پزیشکی نێردەر'
          )}
          className="w-full h-full flex flex-col min-h-0 outline-none print:h-auto overflow-hidden"
        >
          {/* Pinned Screen-only Top Header & Action Strip (Non-shrinking, Always Visible, Zero Clipping) */}
          <header
            className="print-modal-chrome w-full bg-card border-b border-card-line shadow-md shrink-0 print:hidden z-30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative overflow-hidden px-4 sm:px-6 py-3 bg-primary text-primary-foreground">
              <GeometricHeaderBackdrop />
              <div className="relative z-10 max-w-[210mm] mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="size-9 rounded-xl bg-primary-foreground/15 text-primary-foreground border border-primary-foreground/25 flex items-center justify-center shrink-0">
                    <Stethoscope className="size-4.5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black text-primary-foreground truncate">
                      {bi(
                        'تقرير متابعة للطبيب المحيل',
                        'Report-Back Letter to Referring Doctor',
                        'ڕاپۆرتی بەدواداچوون بۆ پزیشکی نێردەر'
                      )}
                    </h2>
                    <p className="text-xs text-primary-foreground/85 truncate">
                      {bi(
                        'قابل للتعديل والنسخ أو الطباعة وحفظ PDF دون إنترنت',
                        'Editable, copyable, and offline A4 printable',
                        'شیاوی دەستکاری، لەبەرگرتنەوە یان چاپکردن و پاشەکەوتکردنی PDF بەبێ ئینتەرنێت'
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

            {/* Unified Horizontally Scrollable Print Action Strip */}
            <div className="px-4 sm:px-6 py-2.5 bg-surface/90 border-t border-card-line/80">
              <div className="max-w-[210mm] mx-auto pr-hscroll overflow-x-auto flex items-center gap-2 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors shrink-0"
                >
                  <Printer className="size-3.5" />
                  <span>{bi('طباعة / حفظ PDF', 'Print / Save PDF', 'چاپ / پاشەکەوتکردنی PDF')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLetterLang(letterLang === 'ar' ? 'en' : 'ar')}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-line-2 bg-card hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                >
                  <Languages className="size-3.5 text-primary" />
                  <span>
                    {isLetterAr
                      ? bi('التحويل للإنجليزية (EN)', 'Switch to English (EN)', 'گۆڕین بۆ ئینگلیزی (EN)')
                      : bi('التحويل للعربية (AR)', 'Switch to Arabic (AR)', 'گۆڕین بۆ عەرەبی (AR)')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl border border-line-2 bg-card hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-700 dark:text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5 text-primary" />
                  )}
                  <span>
                    {copied
                      ? bi('تم النسخ', 'Copied', 'لەبەرگیرا')
                      : bi('نسخ النص', 'Copy', 'لەبەرگرتنەوە')}
                  </span>
                </button>
              </div>
            </div>
          </header>

          <div
            id="physiorecord-print-portal"
            tabIndex={0}
            onClick={onClose}
            className="flex-1 min-h-0 w-full overflow-y-auto overscroll-contain touch-pan-y p-3 sm:p-6 flex flex-col items-center focus:outline-none print:overflow-visible print:p-0 print:block"
          >
      {/* Screen-only Subject & Body Quick Editor */}
      <div
        className="print-modal-chrome w-full max-w-[210mm] mb-4 bg-card border border-card-line rounded-2xl p-4 shadow-sm space-y-3 shrink-0 print:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <label htmlFor="doc-letter-subject" className="block text-xs font-semibold text-foreground mb-1">
            {bi('عنوان الرسالة / الموضوع:', 'Letter Subject:', 'ناونیشانی نامە / بابەت:')}
          </label>
          <input
            id="doc-letter-subject"
            type="text"
            dir={isLetterAr ? 'rtl' : 'ltr'}
            value={subjectText}
            onChange={(e) => setSubjectText(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-layer-line bg-layer text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label htmlFor="doc-letter-body" className="block text-xs font-semibold text-foreground mb-1">
            {bi('نص التقرير السريري للطبيب المحيل:', 'Report Body:', 'دەقی ڕاپۆرتی کلینیکی بۆ پزیشکی نێردەر:')}
          </label>
          <AutoResizeTextarea
            id="doc-letter-body"
            minRows={6}
            dir={isLetterAr ? 'rtl' : 'ltr'}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-layer-line bg-layer text-xs text-foreground leading-relaxed focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Printable A4 Letter Sheet (Full original width with smooth horizontal & vertical pan on mobile) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[210mm] overflow-x-auto overscroll-x-contain touch-auto rounded-2xl shadow-2xl shrink-0 print:overflow-visible print:max-w-none print:shadow-none"
      >
        <div
          dir={isLetterAr ? 'rtl' : 'ltr'}
          className="print-sheet-container w-[210mm] min-w-[210mm] print:w-full print:min-w-0 bg-white text-slate-900 rounded-2xl border border-slate-200 border-t-4 border-t-emerald-700 p-6 sm:p-10 space-y-6 text-xs leading-relaxed"
        >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-emerald-700/20 pb-4 print-break-inside-avoid">
          <div className="flex items-start gap-3">
            {logoSafe && (
              <img
                src={logoSafe}
                alt="Clinic Logo"
                className="h-14 w-14 object-contain rounded-xl border border-emerald-200/80 p-1 bg-white shrink-0"
              />
            )}
            <div className="space-y-0.5">
              <h1 className="text-base font-extrabold text-slate-900">
                {(isLetterAr ? clinicProfile.clinicNameAr : clinicProfile.clinicNameEn) ||
                  clinicProfile.clinicNameAr ||
                  clinicProfile.clinicNameEn}
              </h1>
              <p className="text-xs font-semibold text-emerald-800">
                {(isLetterAr ? clinicProfile.therapistNameAr : clinicProfile.therapistNameEn) ||
                  clinicProfile.therapistNameAr ||
                  clinicProfile.therapistNameEn}
              </p>
              {clinicProfile.phone && (
                <p className="text-xs text-slate-600 tabular-nums">
                  <bdi dir="ltr">{clinicProfile.phone}</bdi>
                </p>
              )}
            </div>
          </div>

          <div className={isLetterAr ? 'text-left' : 'text-right'}>
            <span className="inline-block px-3.5 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-bold shadow-2xs">
              {isLetterAr ? 'تقرير متابعة للطبيب المحيل' : 'Referring Physician Report'}
            </span>
            <p className="text-xs text-slate-600 mt-1 tabular-nums">
              {isLetterAr ? 'التاريخ: ' : 'Date: '}
              <bdi dir="ltr">{formatDateDDMMYYYY(localDate())}</bdi>
            </p>
          </div>
        </header>

        <div className="border border-emerald-200/70 rounded-2xl bg-emerald-50/45 p-4 print-break-inside-avoid">
          <div className="text-xs font-bold text-slate-900">{subjectText}</div>
        </div>

        <div className="whitespace-pre-wrap text-xs leading-7 text-slate-800 font-sans">
          {bodyText}
        </div>

        <footer className="border-t border-slate-200 pt-5 space-y-4 print-break-inside-avoid">
          <div className="flex flex-col sm:flex-row items-end sm:items-end justify-between gap-4">
            <p className="hidden sm:block text-xs text-slate-500">
              {isLetterAr
                ? 'صدر هذا التقرير محلياً من نظام PhysioRecord المشفر.'
                : 'Generated locally inside PhysioRecord.'}
            </p>
            <div className="text-center min-w-[180px] space-y-1 ms-auto">
              {stampSafe && (
                <img
                  src={stampSafe}
                  alt="Clinic Stamp"
                  className="h-14 mx-auto object-contain"
                />
              )}
              <div className="border-t border-slate-400 pt-1 text-xs font-bold text-slate-900">
                {(isLetterAr ? clinicProfile.therapistNameAr : clinicProfile.therapistNameEn) ||
                  clinicProfile.therapistNameAr ||
                  clinicProfile.therapistNameEn}
              </div>
              <div className="text-xs text-slate-500">
                {isLetterAr ? 'التوقيع والختم' : 'Signature & Stamp'}
              </div>
            </div>
          </div>
          <div className="sm:hidden text-center text-[10px] text-slate-400 pt-2 border-t border-slate-100">
            {isLetterAr
              ? 'صدر هذا التقرير محلياً من نظام PhysioRecord المشفر.'
              : 'Generated locally inside PhysioRecord.'}
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

// -----------------------------------------------------------------------
// Main C6–C7 Referrals & Retention Operations Hub
// -----------------------------------------------------------------------

export interface ReferralsAndRetentionPanelProps {
  patients?: PatientRecord[];
  episodes?: EpisodeRecord[];
  sessions?: SessionRecord[];
  clinicalRecordsByPatientId?: Record<string, PatientClinicalData | null>;
  onOpenPatientChart?: (patient: PatientRecord) => void;
  initialSubTab?: 'referrals' | 'retention';
}

interface DoctorFormState {
  id?: string;
  nameAr: string;
  nameEn: string;
  specialtyAr: string;
  specialtyEn: string;
  facilityAr: string;
  facilityEn: string;
  phone: string;
  notes: string;
}

const EMPTY_DOCTOR_FORM: DoctorFormState = {
  nameAr: '',
  nameEn: '',
  specialtyAr: '',
  specialtyEn: '',
  facilityAr: '',
  facilityEn: '',
  phone: '',
  notes: '',
};

export const ReferralsAndRetentionPanel: React.FC<ReferralsAndRetentionPanelProps> = ({
  patients: propsPatients,
  episodes: propsEpisodes,
  sessions: propsSessions,
  clinicalRecordsByPatientId: propsClinicalMap,
  onOpenPatientChart,
  initialSubTab,
}) => {
  const { language, isRtl, bi } = useLanguage();
  const isNonEn = language !== 'en';
  const { dek, isLocked } = useVault();
  const { patients: contextPatients } = usePatients();
  const { currency } = useCurrency();

  const resolvedPatients = propsPatients ?? contextPatients;

  const [opsTick, setOpsTick] = useState(0);
  const [loadedEpisodes, setLoadedEpisodes] = useState<EpisodeRecord[]>([]);
  const [loadedSessions, setLoadedSessions] = useState<SessionRecord[]>([]);
  const [loadingClinical, setLoadingClinical] = useState(false);

  useEffect(() => {
    const bump = () => setOpsTick((n) => n + 1);
    const unsub = ClinicOperationsService.subscribe(bump);
    window.addEventListener('physiorecord-modules-updated', bump);
    window.addEventListener('physiorecord-schedule-updated', bump);
    window.addEventListener('physiorecord-demo-updated', bump);
    return () => {
      unsub();
      window.removeEventListener('physiorecord-modules-updated', bump);
      window.removeEventListener('physiorecord-schedule-updated', bump);
      window.removeEventListener('physiorecord-demo-updated', bump);
    };
  }, []);

  useEffect(() => {
    if (propsEpisodes !== undefined && propsSessions !== undefined) return;
    if (isLocked || !dek || resolvedPatients.length === 0) {
      setLoadedEpisodes([]);
      setLoadedSessions([]);
      return;
    }

    let cancelled = false;
    setLoadingClinical(true);

    void (async () => {
      try {
        const allEps: EpisodeRecord[] = [];
        const allSess: SessionRecord[] = [];
        for (const p of resolvedPatients) {
          if (cancelled) return;
          const eps = await EpisodeService.getEpisodesByPatient(p.id, dek).catch(() => []);
          allEps.push(...eps);
          for (const ep of eps) {
            if (cancelled) return;
            const sess = await SessionService.getSessionsByEpisode(ep.id, dek).catch(() => []);
            allSess.push(...sess);
          }
        }
        if (!cancelled) {
          setLoadedEpisodes(allEps);
          setLoadedSessions(allSess);
        }
      } finally {
        if (!cancelled) setLoadingClinical(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [propsEpisodes, propsSessions, resolvedPatients, dek, isLocked, opsTick]);

  const resolvedEpisodes = propsEpisodes ?? loadedEpisodes;
  const resolvedSessions = propsSessions ?? loadedSessions;

  const referralsEnabled = useMemo(() => {
    void opsTick;
    return ClinicOperationsService.isReferralsModuleEnabled();
  }, [opsTick]);

  const retentionEnabled = useMemo(() => {
    void opsTick;
    return ClinicOperationsService.isRetentionListsEnabled();
  }, [opsTick]);

  const [subTab, setSubTab] = useState<'referrals' | 'retention'>(() => {
    if (initialSubTab) return initialSubTab;
    return referralsEnabled ? 'referrals' : 'retention';
  });

  useEffect(() => {
    if (subTab === 'referrals' && !referralsEnabled && retentionEnabled) {
      setSubTab('retention');
    } else if (subTab === 'retention' && !retentionEnabled && referralsEnabled) {
      setSubTab('referrals');
    }
  }, [referralsEnabled, retentionEnabled, subTab]);

  const doctors = useMemo(() => {
    void opsTick;
    return ClinicOperationsService.getReferringDoctors();
  }, [opsTick]);

  const invoices = useMemo(() => {
    void opsTick;
    return ClinicOperationsService.getInvoicesIQD();
  }, [opsTick]);

  const appointments = useMemo(() => {
    void opsTick;
    return ClinicOperationsService.getAppointments();
  }, [opsTick]);

  const followUps = useMemo(() => {
    void opsTick;
    return ClinicOperationsService.getPostDischargeFollowUps();
  }, [opsTick]);

  const inactiveThreshold = useMemo(() => {
    void opsTick;
    return ClinicOperationsService.getRetentionInactiveDaysThreshold();
  }, [opsTick]);

  const clinicProfile = useMemo(() => {
    void opsTick;
    return ClinicOperationsService.getClinicProfile();
  }, [opsTick]);

  const clinicDisplayName = bi(
    clinicProfile.clinicNameAr || clinicProfile.clinicNameEn,
    clinicProfile.clinicNameEn || clinicProfile.clinicNameAr,
    clinicProfile.clinicNameAr || clinicProfile.clinicNameEn
  );

  const clinicalRecordsByPatientId = useMemo(() => {
    if (propsClinicalMap) return propsClinicalMap;
    const map: Record<string, PatientClinicalData | null> = {};
    for (const p of resolvedPatients) {
      map[p.id] = p.data || null;
    }
    return map;
  }, [propsClinicalMap, resolvedPatients]);

  const patientMap = useMemo(() => {
    const map = new Map<string, PatientRecord>();
    for (const p of resolvedPatients) {
      map.set(p.id, p);
    }
    return map;
  }, [resolvedPatients]);

  // C6 Referral Stats
  const referralStats = useMemo(
    () =>
      computeReferralStatistics({
        patients: resolvedPatients,
        clinicalRecordsByPatientId,
        doctors,
        invoices,
      }),
    [resolvedPatients, clinicalRecordsByPatientId, doctors, invoices]
  );

  // C7 Retention Lists
  const retentionLists = useMemo(
    () =>
      computeRetentionActionLists({
        patients: resolvedPatients,
        episodes: resolvedEpisodes,
        sessions: resolvedSessions,
        invoices,
        appointments,
        followUps,
        inactiveDaysThreshold: inactiveThreshold,
      }),
    [
      resolvedPatients,
      resolvedEpisodes,
      resolvedSessions,
      invoices,
      appointments,
      followUps,
      inactiveThreshold,
    ]
  );

  // --- Referring Doctor CRUD State ---
  const [doctorFormOpen, setDoctorFormOpen] = useState(false);
  const [doctorForm, setDoctorForm] = useState<DoctorFormState>(EMPTY_DOCTOR_FORM);
  const [doctorFormError, setDoctorFormError] = useState<string | null>(null);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);

  const openAddDoctorForm = () => {
    setDoctorForm(EMPTY_DOCTOR_FORM);
    setDoctorFormError(null);
    setDoctorFormOpen(true);
  };

  const openEditDoctorForm = (doc: ReferringDoctorEntry) => {
    setDoctorForm({
      id: doc.id,
      nameAr: doc.nameAr || '',
      nameEn: doc.nameEn || '',
      specialtyAr: doc.specialtyAr || '',
      specialtyEn: doc.specialtyEn || '',
      facilityAr: doc.facilityAr || '',
      facilityEn: doc.facilityEn || '',
      phone: doc.phone || '',
      notes: doc.notes || '',
    });
    setDoctorFormError(null);
    setDoctorFormOpen(true);
  };

  const handleSaveDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAr = doctorForm.nameAr.trim();
    const cleanEn = doctorForm.nameEn.trim() || cleanAr;
    if (!cleanAr) {
      setDoctorFormError(
        bi(
          'يرجى إدخال اسم الطبيب المحيل.',
          'Please enter the referring doctor name.',
          'تکایە ناوی پزیشکی نێردەر بنووسە.'
        )
      );
      return;
    }
    ClinicOperationsService.upsertReferringDoctor({
      id: doctorForm.id,
      nameAr: cleanAr,
      nameEn: cleanEn,
      specialtyAr: doctorForm.specialtyAr.trim() || undefined,
      specialtyEn: doctorForm.specialtyEn.trim() || undefined,
      facilityAr: doctorForm.facilityAr.trim() || undefined,
      facilityEn: doctorForm.facilityEn.trim() || undefined,
      phone: doctorForm.phone.trim() || undefined,
      notes: doctorForm.notes.trim() || undefined,
    });
    setDoctorFormOpen(false);
    setDoctorForm(EMPTY_DOCTOR_FORM);
    setDoctorFormError(null);
  };

  // --- Report-Back Letter Generator State ---
  const sortedPatientsForLetter = useMemo(() => {
    return [...resolvedPatients].sort((a, b) => {
      const aHasRef = resolvePatientReferralSource(a.data) ? 1 : 0;
      const bHasRef = resolvePatientReferralSource(b.data) ? 1 : 0;
      if (aHasRef !== bHasRef) return bHasRef - aHasRef;
      return resolvePatientName(a, a.data, isNonEn).localeCompare(
        resolvePatientName(b, b.data, isNonEn)
      );
    });
  }, [resolvedPatients, isNonEn]);

  const [letterPatientId, setLetterPatientId] = useState<string>('');
  const [letterEpisodeId, setLetterEpisodeId] = useState<string>('');
  const [letterDoctorId, setLetterDoctorId] = useState<string>('');
  const [letterModalOpen, setLetterModalOpen] = useState(false);
  const [letterStore, setLetterStore] = useState<EpisodeScopedClinicalStore | null>(null);
  const [letterSoaps, setLetterSoaps] = useState<SoapNoteRecord[]>([]);
  const [loadingLetterContext, setLoadingLetterContext] = useState(false);

  useEffect(() => {
    if (!letterPatientId && sortedPatientsForLetter.length > 0) {
      setLetterPatientId(sortedPatientsForLetter[0].id);
    }
  }, [letterPatientId, sortedPatientsForLetter]);

  const letterPatient = useMemo(
    () => patientMap.get(letterPatientId) || null,
    [patientMap, letterPatientId]
  );

  const letterPatientEpisodes = useMemo(
    () => resolvedEpisodes.filter((ep) => ep.patientId === letterPatientId),
    [resolvedEpisodes, letterPatientId]
  );

  useEffect(() => {
    if (!letterPatient) {
      setLetterEpisodeId('');
      setLetterDoctorId('');
      return;
    }
    const preferredEp =
      letterPatientEpisodes.find((e) => (e.data.status || e.status) === 'active') ||
      letterPatientEpisodes[0];
    setLetterEpisodeId(preferredEp?.id || '');
    setLetterDoctorId(letterPatient.data.referringDoctorId || '');
  }, [letterPatient, letterPatientEpisodes]);

  const selectedLetterEpisode = useMemo(
    () => letterPatientEpisodes.find((e) => e.id === letterEpisodeId) || null,
    [letterPatientEpisodes, letterEpisodeId]
  );

  const selectedLetterSessions = useMemo(() => {
    if (!letterPatient) return [];
    return selectedLetterEpisode
      ? resolvedSessions.filter((s) => s.episodeId === selectedLetterEpisode.id)
      : resolvedSessions.filter((s) => s.patientId === letterPatient.id);
  }, [letterPatient, selectedLetterEpisode, resolvedSessions]);

  const selectedLetterDoctor = useMemo(
    () => doctors.find((d) => d.id === letterDoctorId) || null,
    [doctors, letterDoctorId]
  );

  const handleOpenReportBackLetter = useCallback(async () => {
    if (!letterPatient) return;
    setLoadingLetterContext(true);
    try {
      if (selectedLetterEpisode) {
        await ClinicOperationsService.ensurePatientColdStoresLoadedAsync(
          letterPatient.id,
          [selectedLetterEpisode.id]
        );
        setLetterStore(
          ClinicOperationsService.getEpisodeClinicalStore(
            selectedLetterEpisode.id,
            letterPatient.id
          )
        );
      } else {
        setLetterStore(null);
      }

      if (dek && selectedLetterSessions.length > 0) {
        const soaps: SoapNoteRecord[] = [];
        for (const sess of selectedLetterSessions) {
          const note = await SoapService.getSoapNoteBySession(sess.id, dek).catch(() => null);
          if (note) soaps.push(note);
        }
        setLetterSoaps(soaps);
      } else {
        setLetterSoaps([]);
      }
    } finally {
      setLoadingLetterContext(false);
      setLetterModalOpen(true);
    }
  }, [dek, letterPatient, selectedLetterEpisode, selectedLetterSessions]);

  // --- C7 Post-Discharge Follow-Up Recording Modal / Inline Form ---
  const [activeFollowUpDue, setActiveFollowUpDue] =
    useState<PostDischargeFollowUpDueItem | null>(null);
  const [fuNprs, setFuNprs] = useState<string>('');
  const [fuPsfs, setFuPsfs] = useState<string>('');
  const [fuNotes, setFuNotes] = useState<string>('');
  const [copiedRowKey, setCopiedRowKey] = useState<string | null>(null);

  const openFollowUpEntry = (item: PostDischargeFollowUpDueItem) => {
    setActiveFollowUpDue(item);
    setFuNprs('');
    setFuPsfs('');
    setFuNotes('');
  };

  const handleSavePostDischargeFollowUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFollowUpDue) return;
    const parsedNprs =
      fuNprs.trim() !== '' && Number.isFinite(Number(fuNprs))
        ? Math.max(0, Math.min(10, Math.round(Number(fuNprs))))
        : undefined;
    const parsedPsfs =
      fuPsfs.trim() !== '' && Number.isFinite(Number(fuPsfs))
        ? Math.max(0, Math.min(10, Number(Number(fuPsfs).toFixed(1))))
        : undefined;

    ClinicOperationsService.recordPostDischargeFollowUp({
      patientId: activeFollowUpDue.patientId,
      episodeId: activeFollowUpDue.episodeId,
      intervalWeeks: activeFollowUpDue.intervalWeeks,
      dischargeDate: activeFollowUpDue.dischargeDate,
      dueDate: activeFollowUpDue.dueDate,
      nprsScore: parsedNprs,
      psfsScore: parsedPsfs,
      notes: fuNotes.trim() || undefined,
    });
    setActiveFollowUpDue(null);
  };

  const handleCopyMessage = async (key: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedRowKey(key);
      setTimeout(() => setCopiedRowKey(null), 2000);
    } catch {
      // Ignore clipboard unavailability
    }
  };

  const formatAmountText = (amount: number, code?: string) => {
    const cfg = getCurrencyConfig(code || currency.code);
    const numStr = new Intl.NumberFormat(isNonEn ? 'ar-IQ-u-nu-latn' : 'en-US', {
      maximumFractionDigits: cfg.decimals,
    }).format(amount);
    return `${numStr} ${isNonEn ? cfg.symbolAr : cfg.symbolEn}`;
  };

  if (!referralsEnabled && !retentionEnabled) {
    return (
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="p-6 rounded-2xl bg-card border border-card-line text-center space-y-2"
      >
        <Share2 className="size-8 text-muted-foreground-1 mx-auto" />
        <p className="text-sm font-bold text-foreground">
          {bi(
            'وحدة الإحالات وقوائم المتابعة معطّلة حالياً',
            'Referrals & Retention Modules Are Currently Disabled',
            'بەشی ئاڕاستەکردن و لیستەکانی بەدواداچوون لە ئێستادا ناچالاکە'
          )}
        </p>
        <p className="text-xs text-muted-foreground-1">
          {bi(
            'يمكنك تفعيل وحدة مصادر الإحالة أو قوائم استبقاء المرضى من الإعدادات.',
            'Enable Referrals or Retention Lists from Clinic Settings.',
            'دەتوانیت بەشی سەرچاوەکانی ئاڕاستەکردن یان لیستەکانی مانەوەی نەخۆش لە ڕێکخستنەکاندا چالاک بکەیت.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-5 pb-6">
      {/* Header Banner */}
      <div className="bg-card border border-card-line rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
            <Share2 className="size-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              {bi(
                'الإحالات الطبية واستبقاء المرضى',
                'Referrals & Patient Retention',
                'ئاڕاستەکردنی پزیشکی و مانەوەی نەخۆشان'
              )}
            </h2>
            <p className="text-xs text-muted-foreground-1 mt-0.5">
              {bi(
                'إحصائيات مصادر الإحالة، دليل الأطباء المحيلين، تقارير المتابعة، وقوائم التواصل دون اتصال',
                'Referral attribution, referring doctors directory, report-back letters, and offline retention queues',
                'ئاماری سەرچاوەکانی ئاڕاستەکردن، ڕێبەری پزیشکانی نێردەر، ڕاپۆرتی بەدواداچوون و لیستەکانی پەیوەندی بەبێ ئینتەرنێت'
              )}
            </p>
          </div>
        </div>

        {loadingClinical && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-line-2 text-xs text-muted-foreground-1">
            <RefreshCw className="size-3.5 animate-spin" />
            <span>
              {bi('جاري فك التشفير محلياً...', 'Decrypting locally...', 'کردنەوەی کۆدەکان بە ناوخۆیی...')}
            </span>
          </span>
        )}
      </div>

      {/* Sub-tabs Navigation */}
      <AccessibleTabs
        selectedKey={subTab}
        onSelectionChange={(k) => setSubTab(String(k) as 'referrals' | 'retention')}
        className="space-y-5"
      >
        <AccessibleTabList
          ariaLabel={bi(
            'أقسام الإحالات والاستبقاء',
            'Referrals and retention sections',
            'بەشەکانی ئاڕاستەکردن و مانەوە'
          )}
        >
          {referralsEnabled && (
            <AccessibleTab id="referrals">
              <Stethoscope className="size-3.5" />
              <span>{bi('الإحالات والأطباء', 'Referrals & Doctors', 'ئاڕاستەکردن و پزیشکان')}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-white/15 text-xs tabular-nums">
                <Num value={referralStats.totalReferredPatients} />
              </span>
            </AccessibleTab>
          )}
          {retentionEnabled && (
            <AccessibleTab id="retention">
              <Activity className="size-3.5" />
              <span>
                {bi('قوائم المتابعة والاستبقاء', 'Retention Action Lists', 'لیستەکانی بەدواداچوون و مانەوە')}
              </span>
              <span className="px-1.5 py-0.5 rounded-full bg-white/15 text-xs tabular-nums">
                <Num
                  value={
                    retentionLists.inactiveActivePlan.length +
                    retentionLists.postDischargeFollowUpsDue.length +
                    retentionLists.packageExpiring.length +
                    retentionLists.unpaidBalances.length
                  }
                />
              </span>
            </AccessibleTab>
          )}
        </AccessibleTabList>

        {/* SUB-TAB 1: C6 REFERRALS & REFERRING DOCTORS */}
        {referralsEnabled && (
          <AccessibleTabPanel id="referrals" className="space-y-5">
            {/* KPI Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="p-4 rounded-2xl bg-card border border-card-line space-y-1">
                <span className="text-xs font-semibold text-muted-foreground-1 block">
                  {bi(
                    'المرضى ذوو مصدر إحالة مسجل',
                    'Attributed Patients',
                    'نەخۆشانی خاوەن سەرچاوەی ئاڕاستەی تۆمارکراو'
                  )}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-foreground">
                    <Num value={referralStats.totalReferredPatients} />
                  </span>
                  <span className="text-xs text-muted-foreground-1">
                    {bi(
                      `من أصل ${referralStats.totalPatients} مريض`,
                      `of ${referralStats.totalPatients} patients`,
                      `لە کۆی ${referralStats.totalPatients} نەخۆش`
                    )}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-card border border-card-line space-y-1">
                <span className="text-xs font-semibold text-muted-foreground-1 block">
                  {bi(
                    'إيرادات المرضى المحالين (الصافي)',
                    'Attributed Billed Revenue',
                    'داهاتی نەخۆشە ئاڕاستەکراوەکان (پوختە)'
                  )}
                </span>
                <div className="text-2xl font-extrabold text-foreground">
                  <Money amount={referralStats.totalReferredBilledRevenueIQD} colorize={false} />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-card border border-card-line space-y-1">
                <span className="text-xs font-semibold text-muted-foreground-1 block">
                  {bi(
                    'الأطباء المحيلون في الدليل',
                    'Directory Physicians',
                    'پزیشکە نێردەرەکان لە ڕێبەردا'
                  )}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-foreground">
                    <Num value={doctors.length} />
                  </span>
                  <span className="text-xs text-muted-foreground-1">
                    {bi('طبيب مسجل', 'registered doctors', 'پزیشکی تۆمارکراو')}
                  </span>
                </div>
              </div>
            </div>

            {/* Source Attribution Breakdown */}
            <div className="bg-card border border-card-line rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  <span>
                    {bi(
                      'إحصائيات مصادر الإحالة والإيرادات',
                      'Referral Source Breakdown & Revenue',
                      'ئاماری سەرچاوەکانی ئاڕاستەکردن و داهات'
                    )}
                  </span>
                </h3>
                {referralStats.unattributedPatientsCount > 0 && (
                  <span className="text-xs text-muted-foreground-1">
                    {bi('غير محدد المصدر: ', 'Unspecified: ', 'سەرچاوە دیارینەکراو: ')}
                    <Num value={referralStats.unattributedPatientsCount} />
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {referralStats.bySource.map((src) => (
                  <div
                    key={src.sourceType}
                    className="p-3.5 rounded-xl bg-surface border border-line-2 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-foreground">
                        {bi(src.labelAr, src.labelEn, REFERRAL_SOURCE_CKB[src.sourceType])}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold tabular-nums">
                        <Num value={src.patientCount} />
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, src.sharePercent))}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground-1 flex items-center justify-between">
                      <span>{bi('الإيراد المفوتر:', 'Billed:', 'پسوولەکراو:')}</span>
                      <span className="font-bold text-foreground">
                        <Money amount={src.billedRevenueIQD} colorize={false} />
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground-1 flex items-center justify-between">
                      <span>{bi('المحصّل:', 'Collected:', 'وەرگیراو:')}</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        <Money amount={src.collectedRevenueIQD} colorize={false} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* One-Click Report-Back Letter Generator Card */}
            <div className="bg-card border border-card-line rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <span>
                      {bi(
                        'إعداد تقرير متابعة للطبيب المحيل',
                        'Generate Report-Back Letter to Referring Doctor',
                        'ئامادەکردنی ڕاپۆرتی بەدواداچوون بۆ پزیشکی نێردەر'
                      )}
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground-1 mt-0.5">
                    {bi(
                      'توليد خطاب متابعة سريري جاهز للنسخ أو الطباعة يتضمن التشخيص وعدد الجلسات وتطور الألم والخطة',
                      'Build a copyable and printable progress letter with diagnosis, session count, pain/functional progress, and plan',
                      'دروستکردنی نامەیەکی بەدواداچوونی کلینیکی ئامادە بۆ لەبەرگرتنەوە یان چاپکردن کە دەستنیشانکردن و ژمارەی دانیشتن و پێشکەوتن و پلان لەخۆدەگرێت'
                    )}
                  </p>
                </div>
              </div>

              {resolvedPatients.length === 0 ? (
                <p className="text-xs text-muted-foreground-1">
                  {bi('لا يوجد مرضى مسجلون بعد.', 'No patients registered yet.', 'هێشتا هیچ نەخۆشێک تۆمار نەکراوە.')}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                  <div>
                    <label htmlFor="ref-letter-patient" className="block text-xs font-semibold text-foreground mb-1">
                      {bi('المريض:', 'Patient:', 'نەخۆش:')}
                    </label>
                    <select
                      id="ref-letter-patient"
                      value={letterPatientId}
                      onChange={(e) => setLetterPatientId(e.target.value)}
                      className="w-full min-h-[36px] px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      {sortedPatientsForLetter.map((p) => {
                        const src = resolvePatientReferralSource(p.data);
                        const srcLabel = src
                          ? ` — ${bi(
                              REFERRAL_SOURCE_LABELS[src].ar,
                              REFERRAL_SOURCE_LABELS[src].en,
                              REFERRAL_SOURCE_CKB[src]
                            )}`
                          : '';
                        return (
                          <option key={p.id} value={p.id}>
                            {resolvePatientName(p, p.data, isNonEn)}
                            {srcLabel}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ref-letter-episode" className="block text-xs font-semibold text-foreground mb-1">
                      {bi('حلقة الرعاية:', 'Episode:', 'قۆناغی چارەسەر:')}
                    </label>
                    <select
                      id="ref-letter-episode"
                      value={letterEpisodeId}
                      onChange={(e) => setLetterEpisodeId(e.target.value)}
                      className="w-full min-h-[36px] px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      {letterPatientEpisodes.length === 0 ? (
                        <option value="">
                          {bi('بدون حلقة محددة', 'No episode', 'بەبێ قۆناغی دیاریکراو')}
                        </option>
                      ) : (
                        letterPatientEpisodes.map((ep) => (
                          <option key={ep.id} value={ep.id}>
                            {ep.data.title || ep.data.medicalDiagnosis}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ref-letter-doctor" className="block text-xs font-semibold text-foreground mb-1">
                      {bi('الطبيب المستلم:', 'Target Doctor:', 'پزیشکی وەرگر:')}
                    </label>
                    <select
                      id="ref-letter-doctor"
                      value={letterDoctorId}
                      onChange={(e) => setLetterDoctorId(e.target.value)}
                      className="w-full min-h-[36px] px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="">
                        {letterPatient?.data.referringPhysician
                          ? `${letterPatient.data.referringPhysician}`
                          : bi(
                              'الطبيب المسجل بملف المريض / عام',
                              'Patient record doctor / General',
                              'پزیشکی تۆمارکراو لە دۆسیەی نەخۆش / گشتی'
                            )}
                      </option>
                      {doctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {resolveDoctorDisplayName(doc, isNonEn)}
                          {doc.specialtyAr || doc.specialtyEn
                            ? ` (${bi(
                                doc.specialtyAr || doc.specialtyEn || '',
                                doc.specialtyEn || doc.specialtyAr || '',
                                doc.specialtyAr || doc.specialtyEn || ''
                              )})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    disabled={!letterPatient || loadingLetterContext}
                    onClick={() => void handleOpenReportBackLetter()}
                    className="min-h-[36px] py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <FileText className="size-3.5" />
                    <span>
                      {loadingLetterContext
                        ? bi('جاري التحضير...', 'Preparing...', 'ئامادە دەکرێت...')
                        : bi('إعداد تقرير للطبيب المحيل', 'Report Back to Doctor', 'ئامادەکردنی ڕاپۆرت بۆ پزیشک')}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* Referring Doctors Directory */}
            <div className="bg-card border border-card-line rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Building2 className="size-4 text-primary" />
                    <span>
                      {bi(
                        'دليل الأطباء والمؤسسات المحيلة',
                        'Referring Doctors Directory',
                        'ڕێبەری پزیشکان و دامەزراوە نێردەرەکان'
                      )}
                    </span>
                  </h3>
                  <p className="text-xs text-muted-foreground-1 mt-0.5">
                    {bi(
                      'إضافة وتعديل وحذف الأطباء المحيلين مع احتساب عدد المرضى والإيرادات لكل طبيب',
                      'Manage referring physicians with live patient count and billed revenue attribution',
                      'زیادکردن، دەستکاری و سڕینەوەی پزیشکە نێردەرەکان لەگەڵ هەژمارکردنی ژمارەی نەخۆش و داهاتی هەر پزیشکێک'
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openAddDoctorForm}
                  className="min-h-[36px] py-2 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{bi('إضافة طبيب محيل', 'Add Doctor', 'زیادکردنی پزیشکی نێردەر')}</span>
                </button>
              </div>

              {referralStats.byDoctor.length === 0 ? (
                <div className="p-8 rounded-xl bg-surface border border-line-2 text-center space-y-2">
                  <Stethoscope className="size-7 text-muted-foreground-1 mx-auto" />
                  <p className="text-xs text-muted-foreground-1">
                    {bi(
                      'لم يتم تسجيل أي طبيب محيل في الدليل بعد.',
                      'No referring doctors registered in the directory yet.',
                      'هێشتا هیچ پزیشکێکی نێردەر لە ڕێبەرەکەدا تۆمار نەکراوە.'
                    )}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {referralStats.byDoctor.map((entry) => {
                    const doc = entry.doctor;
                    const primaryDocName = resolveDoctorDisplayName(doc, isNonEn);
                    const secondaryDocName = isNonEn
                      ? doc.nameEn && doc.nameEn !== doc.nameAr
                        ? doc.nameEn
                        : ''
                      : doc.nameAr && doc.nameAr !== doc.nameEn
                      ? doc.nameAr
                      : '';
                    const spec = bi(
                      doc.specialtyAr || doc.specialtyEn || '',
                      doc.specialtyEn || doc.specialtyAr || '',
                      doc.specialtyAr || doc.specialtyEn || ''
                    );
                    const fac = bi(
                      doc.facilityAr || doc.facilityEn || '',
                      doc.facilityEn || doc.facilityAr || '',
                      doc.facilityAr || doc.facilityEn || ''
                    );
                    const confirmingDelete = confirmDeleteDocId === doc.id;

                    return (
                      <div
                        key={doc.id}
                        className="p-4 rounded-xl bg-surface border border-line-2 flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <div className="text-sm font-bold text-foreground break-words">
                              {primaryDocName}
                            </div>
                            {secondaryDocName && (
                              <div className="text-xs text-muted-foreground-1 break-words">
                                {secondaryDocName}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground-1">
                              {spec && <span>{spec}</span>}
                              {spec && fac && <span>•</span>}
                              {fac && <span>{fac}</span>}
                            </div>
                            {doc.phone && (
                              <div className="text-xs text-primary font-semibold flex items-center gap-1.5 tabular-nums">
                                <Phone className="size-3.5 shrink-0" />
                                <bdi dir="ltr">{formatIraqiPhoneDisplay(doc.phone)}</bdi>
                              </div>
                            )}
                            {doc.notes && (
                              <p className="text-xs text-muted-foreground-1">{doc.notes}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditDoctorForm(doc)}
                              aria-label={bi(`تعديل ${primaryDocName}`, `Edit ${primaryDocName}`, `دەستکاریکردنی ${primaryDocName}`)}
                              className="min-h-[36px] min-w-[36px] p-1.5 rounded-lg border border-layer-line bg-card hover:bg-layer-hover text-foreground inline-flex items-center justify-center cursor-pointer"
                            >
                              <Edit3 className="size-3.5" />
                            </button>

                            {confirmingDelete ? (
                              <button
                                type="button"
                                onClick={() => {
                                  ClinicOperationsService.deleteReferringDoctor(doc.id);
                                  setConfirmDeleteDocId(null);
                                }}
                                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer"
                              >
                                {bi('تأكيد الحذف', 'Confirm', 'دڵنیاکردنەوەی سڕینەوە')}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteDocId(doc.id)}
                                aria-label={bi(`حذف ${primaryDocName}`, `Delete ${primaryDocName}`, `سڕینەوەی ${primaryDocName}`)}
                                className="min-h-[36px] min-w-[36px] p-1.5 rounded-lg border border-layer-line bg-card hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-400 text-muted-foreground-1 inline-flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="pt-2.5 border-t border-card-divider flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground-1">
                            {bi('المرضى المحالون: ', 'Referred Patients: ', 'نەخۆشە نێردراوەکان: ')}
                            <strong className="text-foreground">
                              <Num value={entry.patientCount} />
                            </strong>
                          </span>
                          <span className="text-muted-foreground-1">
                            {bi('الإيرادات: ', 'Revenue: ', 'داهات: ')}
                            <strong className="text-foreground">
                              <Money amount={entry.billedRevenueIQD} colorize={false} />
                            </strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </AccessibleTabPanel>
        )}

        {/* SUB-TAB 2: C7 RETENTION LISTS & POST-DISCHARGE FOLLOW-UPS */}
        {retentionEnabled && (
          <AccessibleTabPanel id="retention" className="space-y-5">
            {/* Configurable Threshold Bar */}
            <div className="bg-card border border-card-line rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Clock className="size-4 text-primary shrink-0" />
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">
                    {bi(
                      'عتبة انقطاع المرضى النشطين (بالأيام)',
                      'Active-Plan Inactivity Threshold (Days)',
                      'ئاستی دابڕانی نەخۆشە چالاکەکان (بە ڕۆژ)'
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground-1">
                    {bi(
                      'يظهر المرضى النشطون دون جلسة منذ N يوماً ودون موعد قادم مجدول',
                      'Flags active episodes with no session for >= N days and no upcoming appointment',
                      'ئەو نەخۆشە چالاکانە پیشان دەدات کە لە ماوەی N ڕۆژدا دانیشتنیان نەبووە و نۆرەی داهاتوویان نییە'
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {([7, 14, 21, 30] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => ClinicOperationsService.setRetentionInactiveDaysThreshold(preset)}
                    className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer tabular-nums ${
                      inactiveThreshold === preset
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-surface border-layer-line text-foreground hover:bg-layer-hover'
                    }`}
                  >
                    <Num value={preset} /> {bi('ي', 'd', 'ڕ')}
                  </button>
                ))}
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={3}
                    max={180}
                    dir="ltr"
                    aria-label={bi('عدد أيام الانقطاع', 'Inactive days threshold', 'ژمارەی ڕۆژانی دابڕان')}
                    value={inactiveThreshold}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!Number.isNaN(val) && val >= 3) {
                        ClinicOperationsService.setRetentionInactiveDaysThreshold(val);
                      }
                    }}
                    className="w-20 px-2.5 py-1.5 rounded-xl bg-surface border border-layer-line text-xs font-bold text-foreground tabular-nums focus:outline-none focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground-1">
                    {bi('يوم', 'days', 'ڕۆژ')}
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Retention Action Lists Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Bucket 1: Inactive Active-Plan */}
              <section className="bg-card border border-card-line rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-card-divider pb-2.5">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-amber-700 dark:text-amber-400" />
                    <h4 className="text-sm font-bold text-foreground">
                      {bi(
                        `منقطعون عن الخطة النشطة (≥ ${inactiveThreshold} يوم)`,
                        `Inactive Active Plans (≥ ${inactiveThreshold} days)`,
                        `دابڕاوانی پلانی چالاک (≥ ${inactiveThreshold} ڕۆژ)`
                      )}
                    </h4>
                  </div>
                  <span className="text-amber-700 dark:text-amber-400 text-xs font-bold tabular-nums">
                    (<Num value={retentionLists.inactiveActivePlan.length} />)
                  </span>
                </div>

                {retentionLists.inactiveActivePlan.length === 0 ? (
                  <p className="text-xs text-muted-foreground-1 py-4 text-center">
                    {bi(
                      'لا يوجد مرضى نشطون منقطعون حالياً.',
                      'No inactive active-plan patients right now.',
                      'لە ئێستادا هیچ نەخۆشێکی چالاکی دابڕاو نییە.'
                    )}
                  </p>
                ) : (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label={bi('قائمة المنقطعين عن الخطة النشطة', 'Inactive active-plan patients list', 'لیستی دابڕاوانی پلانی چالاک')}
                    className="space-y-2.5 max-h-96 overflow-y-auto pe-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
                  >
                    {retentionLists.inactiveActivePlan.map((item) => {
                      const pName = bi(item.patientName, item.patientNameEn, item.patientName);
                      const details = isNonEn
                        ? `آخر نشاط: ${formatDateDDMMYYYY(item.lastActivityDate)} — منذ ${item.daysInactive} يوم`
                        : `Last activity: ${formatDateDDMMYYYY(item.lastActivityDate)} — ${item.daysInactive}d ago`;
                      const waUrl = buildRetentionWhatsAppUrl({
                        bucket: 'inactiveActivePlan',
                        patientPhone: item.patientPhone,
                        patientName: pName,
                        detailsText: details,
                        clinicName: clinicDisplayName,
                        isAr: isNonEn,
                      });
                      const msgText = buildRetentionWhatsAppMessage({
                        bucket: 'inactiveActivePlan',
                        patientName: pName,
                        detailsText: details,
                        clinicName: clinicDisplayName,
                        isAr: isNonEn,
                      });
                      const rowKey = `inact_${item.patientId}`;
                      const pRecord = patientMap.get(item.patientId);

                      return (
                        <div
                          key={rowKey}
                          className="p-3 rounded-xl bg-surface border border-line-2 flex flex-wrap items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-xs font-bold text-foreground break-words">{pName}</div>
                            <div className="text-xs text-muted-foreground-1 break-words">
                              {item.episodeTitle}
                            </div>
                            <div className="text-xs text-amber-800 dark:text-amber-300 font-semibold tabular-nums">
                              {bi('منذ ', '', 'لە ماوەی ')}
                              <Num value={item.daysInactive} />{' '}
                              {bi('يوم', 'days inactive', 'ڕۆژ پێش ئێستا')} ·{' '}
                              <bdi dir="ltr">{formatDateDDMMYYYY(item.lastActivityDate)}</bdi>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {pRecord && onOpenPatientChart && (
                              <button
                                type="button"
                                onClick={() => onOpenPatientChart(pRecord)}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-card hover:bg-layer-hover text-xs font-semibold text-foreground cursor-pointer"
                              >
                                {bi('فتح الملف', 'Chart', 'کردنەوەی دۆسیە')}
                              </button>
                            )}
                            {waUrl ? (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1"
                              >
                                <MessageCircle className="size-3.5" />
                                <span>{bi('واتساب', 'WhatsApp', 'واتساپ')}</span>
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleCopyMessage(rowKey, msgText)}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-card hover:bg-layer-hover text-xs font-semibold text-foreground inline-flex items-center gap-1 cursor-pointer"
                              >
                                {copiedRowKey === rowKey ? (
                                  <Check className="size-3.5 text-emerald-700 dark:text-emerald-400" />
                                ) : (
                                  <Copy className="size-3.5" />
                                )}
                                <span>{bi('نسخ الرسالة', 'Copy', 'لەبەرگرتنەوە')}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Bucket 2: 4w & 12w Post-Discharge Follow-Ups Due */}
              <section className="bg-card border border-card-line rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-card-divider pb-2.5">
                  <div className="flex items-center gap-2">
                    <CalendarCheck2 className="size-4 text-primary" />
                    <h4 className="text-sm font-bold text-foreground">
                      {bi(
                        'متابعة ما بعد التخريج (4 و 12 أسبوعاً)',
                        'Post-Discharge Follow-Ups (4w & 12w)',
                        'بەدواداچوونی دوای تەواوکردنی چارەسەر (٤ و ١٢ هەفتە)'
                      )}
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-bold tabular-nums">
                    <Num value={retentionLists.postDischargeFollowUpsDue.length} />
                  </span>
                </div>

                {retentionLists.postDischargeFollowUpsDue.length === 0 ? (
                  <p className="text-xs text-muted-foreground-1 py-4 text-center">
                    {bi(
                      'لا توجد متابعات ما بعد التخريج مستحقة حالياً.',
                      'No post-discharge 4w/12w follow-ups currently due.',
                      'لە ئێستادا هیچ بەدواداچوونێکی دوای تەواوبوون نییە.'
                    )}
                  </p>
                ) : (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label={bi('قائمة متابعة ما بعد التخريج', 'Post-discharge follow-ups list', 'لیستی بەدواداچوونی دوای تەواوبوون')}
                    className="space-y-2.5 max-h-96 overflow-y-auto pe-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
                  >
                    {retentionLists.postDischargeFollowUpsDue.map((item) => {
                      const pName = bi(item.patientName, item.patientNameEn, item.patientName);
                      const milestoneLabel = bi(
                        `متابعة ${item.intervalWeeks} أسابيع`,
                        `${item.intervalWeeks}-Week Follow-Up`,
                        `بەدواداچوونی ${item.intervalWeeks} هەفتە`
                      );
                      const waMilestone = isNonEn
                        ? `متابعة ${item.intervalWeeks} أسابيع`
                        : `${item.intervalWeeks}-Week Follow-Up`;
                      const details = isNonEn
                        ? `${waMilestone} — تاريخ التخريج ${formatDateDDMMYYYY(item.dischargeDate)}`
                        : `${waMilestone} — discharged ${formatDateDDMMYYYY(item.dischargeDate)}`;
                      const waUrl = buildRetentionWhatsAppUrl({
                        bucket: 'postDischargeFollowUpsDue',
                        patientPhone: item.patientPhone,
                        patientName: pName,
                        detailsText: details,
                        clinicName: clinicDisplayName,
                        isAr: isNonEn,
                      });
                      const rowKey = `pdfu_${item.episodeId}_${item.intervalWeeks}`;

                      return (
                        <div
                          key={rowKey}
                          className="p-3 rounded-xl bg-surface border border-line-2 flex flex-wrap items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-foreground break-words">{pName}</span>
                              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
                                {milestoneLabel}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground-1 break-words">
                              {item.episodeTitle}
                            </div>
                            <div className="text-xs text-muted-foreground-1 tabular-nums">
                              {bi('التخريج: ', 'Discharged: ', 'دەرچوون: ')}
                              <bdi dir="ltr">{formatDateDDMMYYYY(item.dischargeDate)}</bdi> ·{' '}
                              <Num value={item.daysSinceDischarge} /> {bi('يوم', 'd', 'ڕۆژ')}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => openFollowUpEntry(item)}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
                            >
                              {bi('تسجيل النتيجة', 'Record NPRS/PSFS', 'تۆمارکردنی ئەنجام')}
                            </button>
                            {waUrl && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1"
                              >
                                <MessageCircle className="size-3.5" />
                                <span>{bi('واتساب', 'WhatsApp', 'واتساپ')}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {followUps.length > 0 && (
                  <div className="pt-2 border-t border-card-divider space-y-1.5">
                    <div className="text-xs font-bold text-muted-foreground-1 flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-700 dark:text-emerald-400" />
                      <span>
                        {bi(
                          'آخر المتابعات المسجلة:',
                          'Recently Logged Follow-Ups:',
                          'دوایین بەدواداچوونە تۆمارکراوەکان:'
                        )}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {followUps.slice(0, 3).map((fu) => {
                        const p = patientMap.get(fu.patientId);
                        const pLabel = p
                          ? resolvePatientName(p, p.data, isNonEn)
                          : fu.patientId;
                        return (
                          <div
                            key={fu.id}
                            className="text-xs text-muted-foreground-1 flex flex-wrap items-center justify-between gap-2 bg-surface/60 px-2.5 py-1.5 rounded-lg"
                          >
                            <span className="font-semibold text-foreground">
                              {pLabel} ({fu.intervalWeeks}
                              {bi(' أسبوع', 'w', ' هەفتە')})
                            </span>
                            <span className="tabular-nums">
                              {fu.nprsScore !== undefined ? `NPRS: ${fu.nprsScore}/10` : ''}{' '}
                              {fu.psfsScore !== undefined ? `PSFS: ${fu.psfsScore}/10` : ''} ·{' '}
                              <bdi dir="ltr">{formatDateDDMMYYYY(fu.recordedAt)}</bdi>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* Bucket 3: Package Expiring (<= 2 remaining sessions) */}
              <section className="bg-card border border-card-line rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-card-divider pb-2.5">
                  <div className="flex items-center gap-2">
                    <Package className="size-4 text-sky-700 dark:text-sky-400" />
                    <h4 className="text-sm font-bold text-foreground">
                      {bi(
                        'باقات علاجية قاربت على الانتهاء (≤ 2 جلسة)',
                        'Expiring Rehab Packages (≤ 2 sessions left)',
                        'کۆرسە چارەسەرییە نزیک لە تەواوبوونەکان (≤ ٢ دانیشتن)'
                      )}
                    </h4>
                  </div>
                  <span className="text-sky-700 dark:text-sky-400 text-xs font-bold tabular-nums">
                    (<Num value={retentionLists.packageExpiring.length} />)
                  </span>
                </div>

                {retentionLists.packageExpiring.length === 0 ? (
                  <p className="text-xs text-muted-foreground-1 py-4 text-center">
                    {bi(
                      'لا توجد باقات قاربت على النفاد حالياً.',
                      'No rehab packages close to completion.',
                      'لە ئێستادا هیچ کۆرسێک نزیک نییە لە تەواوبوون.'
                    )}
                  </p>
                ) : (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label={bi('قائمة الباقات القريبة من الانتهاء', 'Expiring rehab packages list', 'لیستی کۆرسە نزیک لە تەواوبوونەکان')}
                    className="space-y-2.5 max-h-96 overflow-y-auto pe-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
                  >
                    {retentionLists.packageExpiring.map((item) => {
                      const details = isNonEn
                        ? `متبقي ${item.remainingSessions} من أصل ${item.packageTotalSessions} جلسات — ${item.invoiceNumber}`
                        : `${item.remainingSessions} of ${item.packageTotalSessions} sessions remaining — ${item.invoiceNumber}`;
                      const waUrl = buildRetentionWhatsAppUrl({
                        bucket: 'packageExpiring',
                        patientPhone: item.patientPhone,
                        patientName: item.patientName,
                        detailsText: details,
                        clinicName: clinicDisplayName,
                        isAr: isNonEn,
                      });
                      const msgText = buildRetentionWhatsAppMessage({
                        bucket: 'packageExpiring',
                        patientName: item.patientName,
                        detailsText: details,
                        clinicName: clinicDisplayName,
                        isAr: isNonEn,
                      });
                      const rowKey = `pkg_${item.invoiceId}`;

                      return (
                        <div
                          key={rowKey}
                          className="p-3 rounded-xl bg-surface border border-line-2 flex flex-wrap items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-xs font-bold text-foreground break-words">
                              {item.patientName}
                            </div>
                            <div className="text-xs text-muted-foreground-1">
                              <bdi dir="ltr" className="font-mono">
                                {item.invoiceNumber}
                              </bdi>{' '}
                              ·{' '}
                              {bi('المستخدم: ', 'Used: ', 'بەکارهاتوو: ')}
                              <Fraction
                                value={item.packageUsedSessions}
                                total={item.packageTotalSessions}
                              />
                            </div>
                            <div className="text-xs font-bold text-sky-800 dark:text-sky-300">
                              {bi('متبقي: ', 'Remaining: ', 'ماوە: ')}
                              <Num value={item.remainingSessions} />{' '}
                              {bi('جلسات', 'session(s)', 'دانیشتن')}
                            </div>
                          </div>

                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0"
                            >
                              <MessageCircle className="size-3.5" />
                              <span>{bi('واتساب', 'WhatsApp', 'واتساپ')}</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleCopyMessage(rowKey, msgText)}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-card hover:bg-layer-hover text-xs font-semibold text-foreground inline-flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              {copiedRowKey === rowKey ? (
                                <Check className="size-3.5 text-emerald-700 dark:text-emerald-400" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                              <span>{bi('نسخ الرسالة', 'Copy', 'لەبەرگرتنەوە')}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Bucket 4: Unpaid Balances */}
              <section className="bg-card border border-card-line rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-card-divider pb-2.5">
                  <div className="flex items-center gap-2">
                    <Wallet className="size-4 text-rose-700 dark:text-rose-400" />
                    <h4 className="text-sm font-bold text-foreground">
                      {bi('تذكيرات الأرصدة والذمم المستحقة', 'Unpaid Balance Reminders', 'یادخەرەوەکانی باڵانس و قەرزە ماوەکان')}
                    </h4>
                  </div>
                  <span className="text-rose-700 dark:text-rose-400 text-xs font-bold tabular-nums">
                    (<Num value={retentionLists.unpaidBalances.length} />)
                  </span>
                </div>

                {retentionLists.unpaidBalances.length === 0 ? (
                  <p className="text-xs text-muted-foreground-1 py-4 text-center">
                    {bi(
                      'لا توجد فواتير ذات رصيد غير مدفوع حالياً.',
                      'No unpaid invoice balances right now.',
                      'لە ئێستادا هیچ پسوولەیەکی قەرزدار بوونی نییە.'
                    )}
                  </p>
                ) : (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label={bi('قائمة الأرصدة غير المدفوعة', 'Unpaid invoice balances list', 'لیستی قەرزە ماوەکان')}
                    className="space-y-2.5 max-h-96 overflow-y-auto pe-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
                  >
                    {retentionLists.unpaidBalances.map((item) => {
                      const amountStr = formatAmountText(item.balanceDueIQD, item.currencyCode);
                      const details = isNonEn
                        ? `فاتورة ${item.invoiceNumber} — المتبقي ${amountStr}`
                        : `Invoice ${item.invoiceNumber} — due ${amountStr}`;
                      const waUrl = buildRetentionWhatsAppUrl({
                        bucket: 'unpaidBalances',
                        patientPhone: item.patientPhone,
                        patientName: item.patientName,
                        detailsText: details,
                        clinicName: clinicDisplayName,
                        isAr: isNonEn,
                      });
                      const msgText = buildRetentionWhatsAppMessage({
                        bucket: 'unpaidBalances',
                        patientName: item.patientName,
                        detailsText: details,
                        clinicName: clinicDisplayName,
                        isAr: isNonEn,
                      });
                      const rowKey = `debt_${item.invoiceId}`;

                      return (
                        <div
                          key={rowKey}
                          className="p-3 rounded-xl bg-surface border border-line-2 flex flex-wrap items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-xs font-bold text-foreground break-words">
                              {item.patientName}
                            </div>
                            <div className="text-xs text-muted-foreground-1 tabular-nums">
                              <bdi dir="ltr" className="font-mono">
                                {item.invoiceNumber}
                              </bdi>{' '}
                              · <bdi dir="ltr">{formatDateDDMMYYYY(item.date)}</bdi>
                            </div>
                            <div className="text-xs font-extrabold text-rose-700 dark:text-rose-400">
                              {bi('المتبقي: ', 'Due: ', 'بڕی ماوە: ')}
                              <Money amount={item.balanceDueIQD} colorize={false} />
                            </div>
                          </div>

                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0"
                            >
                              <MessageCircle className="size-3.5" />
                              <span>{bi('واتساب', 'WhatsApp', 'واتساپ')}</span>
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleCopyMessage(rowKey, msgText)}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-layer-line bg-card hover:bg-layer-hover text-xs font-semibold text-foreground inline-flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              {copiedRowKey === rowKey ? (
                                <Check className="size-3.5 text-emerald-700 dark:text-emerald-400" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                              <span>{bi('نسخ الرسالة', 'Copy', 'لەبەرگرتنەوە')}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </AccessibleTabPanel>
        )}
      </AccessibleTabs>

      {/* Add/Edit Referring Doctor Modal */}
      <ModalDialog
        isOpen={doctorFormOpen}
        onOpenChange={setDoctorFormOpen}
        title={
          doctorForm.id
            ? bi('تعديل بيانات الطبيب المحيل', 'Edit Referring Doctor', 'دەستکاریکردنی زانیاری پزیشکی نێردەر')
            : bi('إضافة طبيب محيل جديد', 'Add Referring Doctor', 'زیادکردنی پزیشکی نێردەری نوێ')
        }
        size="md"
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      >
        <form onSubmit={handleSaveDoctor} className="space-y-3.5" dir={isRtl ? 'rtl' : 'ltr'}>
          {doctorFormError && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 font-semibold">
              {doctorFormError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ref-doc-name-ar" className="block text-xs font-semibold text-foreground mb-1">
                {bi('اسم الطبيب بالعربية *', 'Doctor Name (AR) *', 'ناوی پزیشک بە عەرەبی/کوردی *')}
              </label>
              <input
                id="ref-doc-name-ar"
                type="text"
                value={doctorForm.nameAr}
                onChange={(e) => setDoctorForm({ ...doctorForm, nameAr: e.target.value })}
                placeholder="د. حيدر العبيدي"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="ref-doc-name-en" className="block text-xs font-semibold text-foreground mb-1">
                {bi('الاسم بالإنجليزية (اختياري)', 'Doctor Name (EN)', 'ناو بە ئینگلیزی (ئارەزوومەندانە)')}
              </label>
              <input
                id="ref-doc-name-en"
                type="text"
                dir="ltr"
                value={doctorForm.nameEn}
                onChange={(e) => setDoctorForm({ ...doctorForm, nameEn: e.target.value })}
                placeholder="Dr. Haider Al-Obaidi"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="ref-doc-spec-ar" className="block text-xs font-semibold text-foreground mb-1">
                {bi('التخصص الطبي (عربي)', 'Specialty (AR)', 'پسپۆڕیی پزیشکی (عەرەبی/کوردی)')}
              </label>
              <input
                id="ref-doc-spec-ar"
                type="text"
                value={doctorForm.specialtyAr}
                onChange={(e) => setDoctorForm({ ...doctorForm, specialtyAr: e.target.value })}
                placeholder={bi('جراحة العظام والكسور', 'Orthopedic Surgery', 'نەشتەرگەری ئێسک و شکان')}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="ref-doc-spec-en" className="block text-xs font-semibold text-foreground mb-1">
                {bi('التخصص الطبي (إنجليزي)', 'Specialty (EN)', 'پسپۆڕیی پزیشکی (ئینگلیزی)')}
              </label>
              <input
                id="ref-doc-spec-en"
                type="text"
                dir="ltr"
                value={doctorForm.specialtyEn}
                onChange={(e) => setDoctorForm({ ...doctorForm, specialtyEn: e.target.value })}
                placeholder="Orthopedic Surgery"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="ref-doc-fac-ar" className="block text-xs font-semibold text-foreground mb-1">
                {bi('المستشفى / العيادة (عربي)', 'Facility / Hospital (AR)', 'نەخۆشخانە / کلینیک (عەرەبی/کوردی)')}
              </label>
              <input
                id="ref-doc-fac-ar"
                type="text"
                value={doctorForm.facilityAr}
                onChange={(e) => setDoctorForm({ ...doctorForm, facilityAr: e.target.value })}
                placeholder={bi(
                  'مستشفى اليرموك / عيادة المنصور',
                  'Al-Yarmouk Hospital',
                  'نەخۆشخانەی یەرمووک / کلینیکی مەنسوور'
                )}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="ref-doc-fac-en" className="block text-xs font-semibold text-foreground mb-1">
                {bi('المستشفى / العيادة (إنجليزي)', 'Facility / Hospital (EN)', 'نەخۆشخانە / کلینیک (ئینگلیزی)')}
              </label>
              <input
                id="ref-doc-fac-en"
                type="text"
                dir="ltr"
                value={doctorForm.facilityEn}
                onChange={(e) => setDoctorForm({ ...doctorForm, facilityEn: e.target.value })}
                placeholder="Al-Yarmouk Teaching Hospital"
                className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ref-doc-phone" className="block text-xs font-semibold text-foreground mb-1">
              {bi('رقم هاتف الطبيب / السكرتارية', 'Phone Number', 'ژمارە تەلەفۆنی پزیشک / سکرتاریەت')}
            </label>
            <PhoneInput
              id="ref-doc-phone"
              ariaLabel={bi('رقم هاتف الطبيب / السكرتارية', 'Phone Number', 'ژمارە تەلەفۆنی پزیشک / سکرتاریەت')}
              value={doctorForm.phone}
              onChange={(val) => setDoctorForm({ ...doctorForm, phone: val })}
              placeholder="0770 123 4567"
            />
          </div>

          <div>
            <label htmlFor="ref-doc-notes" className="block text-xs font-semibold text-foreground mb-1">
              {bi('ملاحظات', 'Notes', 'تێبینییەکان')}
            </label>
            <AutoResizeTextarea
              id="ref-doc-notes"
              minRows={2}
              value={doctorForm.notes}
              onChange={(e) => setDoctorForm({ ...doctorForm, notes: e.target.value })}
              placeholder={bi(
                'يفضل استلام التقارير عبر واتساب أو مطبوعة...',
                'Communication preferences...',
                'پەسەندی وەرگرتنی ڕاپۆرت لە ڕێگەی واتساپ یان چاپکراو...'
              )}
              className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDoctorFormOpen(false)}
              className="min-h-[36px] px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground-1 hover:bg-layer-hover cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
            </button>
            <button
              type="submit"
              className="min-h-[36px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UserCheck className="size-3.5" />
              <span>{bi('حفظ الطبيب', 'Save Doctor', 'پاشەکەوتکردنی پزیشک')}</span>
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Post-Discharge 4w/12w Outcome Entry Modal */}
      <ModalDialog
        isOpen={activeFollowUpDue !== null}
        onOpenChange={(open) => {
          if (!open) setActiveFollowUpDue(null);
        }}
        title={
          activeFollowUpDue
            ? bi(
                `تسجيل متابعة ${activeFollowUpDue.intervalWeeks} أسابيع بعد التخريج`,
                `Log ${activeFollowUpDue.intervalWeeks}-Week Post-Discharge Follow-Up`,
                `تۆمارکردنی بەدواداچوونی ${activeFollowUpDue.intervalWeeks} هەفتەی دوای تەواوبوون`
              )
            : ''
        }
        subtitle={
          activeFollowUpDue
            ? `${bi(activeFollowUpDue.patientName, activeFollowUpDue.patientNameEn, activeFollowUpDue.patientName)} — ${activeFollowUpDue.episodeTitle}`
            : undefined
        }
        size="sm"
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      >
        {activeFollowUpDue && (
          <form onSubmit={handleSavePostDischargeFollowUp} className="space-y-3.5" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ref-fu-nprs" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('مقياس الألم NPRS (0–10)', 'Pain NPRS (0–10)', 'پێوەری ئازار NPRS (٠–١٠)')}
                </label>
                <input
                  id="ref-fu-nprs"
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  dir="ltr"
                  value={fuNprs}
                  onChange={(e) => setFuNprs(e.target.value)}
                  placeholder="0 – 10"
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground tabular-nums focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label htmlFor="ref-fu-psfs" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('مقياس الوظيفة PSFS (0–10)', 'Function PSFS (0–10)', 'پێوەری کارایی PSFS (٠–١٠)')}
                </label>
                <input
                  id="ref-fu-psfs"
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  dir="ltr"
                  value={fuPsfs}
                  onChange={(e) => setFuPsfs(e.target.value)}
                  placeholder="0 – 10"
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground tabular-nums focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label htmlFor="ref-fu-notes" className="block text-xs font-semibold text-foreground mb-1">
                {bi('ملاحظات المتابعة:', 'Follow-Up Notes:', 'تێبینییەکانی بەدواداچوون:')}
              </label>
              <AutoResizeTextarea
                id="ref-fu-notes"
                minRows={2}
                value={fuNotes}
                onChange={(e) => setFuNotes(e.target.value)}
                placeholder={bi(
                  'حالة الأعراض، الالتزام بالتمارين المنزلية، الحاجة لمراجعة...',
                  'Symptom status, HEP adherence, return-to-activity notes...',
                  'دۆخی نیشانەکان، پابەندبوون بە ڕاهێنانی ماڵەوە، پێویستی سەردانکردنەوە...'
                )}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveFollowUpDue(null)}
                className="min-h-[36px] px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground-1 hover:bg-layer-hover cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="submit"
                className="min-h-[36px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {bi('حفظ المتابعة', 'Save Follow-Up', 'پاشەکەوتکردنی بەدواداچوون')}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Report-Back Letter Modal */}
      {letterPatient && (
        <DoctorReportBackLetterModal
          isOpen={letterModalOpen}
          onClose={() => setLetterModalOpen(false)}
          patient={letterPatient}
          doctor={selectedLetterDoctor}
          doctorNameFallback={letterPatient.data.referringPhysician}
          episode={selectedLetterEpisode}
          sessions={selectedLetterSessions}
          episodeStore={letterStore}
          soaps={letterSoaps}
        />
      )}
    </div>
  );
};

export default ReferralsAndRetentionPanel;
