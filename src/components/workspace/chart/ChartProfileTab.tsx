import React, { Suspense, lazy } from 'react';
import {
  Calendar,
  Download,
  Edit3,
  MapPin,
  Phone,
  Printer,
  Save,
  Send,
  User,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { useVault } from '../../../context/VaultContext';
import { ClinicOperationsService } from '../../../services/clinicOperationsService';
import { SoapService } from '../../../services/soapService';
import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../../../types/clinical';
import type {
  EpisodeScopedClinicalStore,
  ReferralSourceType,
  ReferringDoctorEntry,
} from '../../../types/clinicManagement';
import {
  formatClinicalDate,
  formatIraqiPhoneDisplay,
  localDate as getTodayIso,
} from '../../../utils/date';
import { buildPatientFhirR4Bundle } from '../../../utils/fhirExport';
import {
  REFERRAL_SOURCE_LABELS,
  REFERRAL_SOURCE_TYPES,
  resolveDoctorDisplayName,
  resolveDoctorFacility,
} from '../../../utils/iraqReferralsRetentionC6C7';
import { getPatientDisplayName } from '../../../utils/mrn';
import type { PrintableDocumentType } from '../../print/PrintDocumentModal';
import { Money, Num, PhoneInput } from '../../ui/Primitives';

const ConsentSignaturePanel = lazy(() =>
  import('../../clinic/ConsentSignaturePanel').then((m) => ({
    default: m.ConsentSignaturePanel,
  }))
);

export interface ChartProfileTabProps {
  patient: PatientRecord;
  patientAge?: number;
  genderLabel?: string;
  episodes: EpisodeRecord[];
  activeEpisode: EpisodeRecord | null;
  sessions: SessionRecord[];
  episodeStore: EpisodeScopedClinicalStore;
  financialSummary: {
    invoices: unknown[];
    totalBilledIQD: number;
    totalPaidIQD: number;
    totalDebtIQD: number;
  };
  enableScheduleVisitCardPrint: boolean;
  onAllPatientSoapsLoaded: (soaps: SoapNoteRecord[]) => void;
  onOpenPrintDoc: (docType: PrintableDocumentType) => void;
  // Non-clinical Personal, Emergency & Referral fields
  onOpenEditPersonalInfo?: () => void;
  enableReferralsModule?: boolean;
  referringDoctors?: ReferringDoctorEntry[];
  referralSourceType?: ReferralSourceType | '';
  setReferralSourceType?: (v: ReferralSourceType | '') => void;
  referringDoctorId?: string;
  setReferringDoctorId?: (v: string) => void;
  referralNotes?: string;
  setReferralNotes?: (v: string) => void;
  referringPhysician?: string;
  setReferringPhysician?: (v: string) => void;
  referringClinic?: string;
  setReferringClinic?: (v: string) => void;
  emergencyContactName?: string;
  setEmergencyContactName?: (v: string) => void;
  emergencyContactPhone?: string;
  setEmergencyContactPhone?: (v: string) => void;
  onOpenReportBackModal?: () => void;
  onSaveMasterAndEpisode?: () => void;
  isSaving?: boolean;
  saveSuccess?: boolean;
}

export const ChartProfileTab: React.FC<ChartProfileTabProps> = ({
  patient,
  patientAge,
  genderLabel,
  episodes,
  activeEpisode,
  sessions,
  episodeStore,
  financialSummary,
  enableScheduleVisitCardPrint,
  onAllPatientSoapsLoaded,
  onOpenPrintDoc,
  onOpenEditPersonalInfo,
  enableReferralsModule = false,
  referringDoctors = [],
  referralSourceType = '',
  setReferralSourceType,
  referringDoctorId = '',
  setReferringDoctorId,
  referralNotes = '',
  setReferralNotes,
  referringPhysician = '',
  setReferringPhysician,
  referringClinic = '',
  setReferringClinic,
  emergencyContactName = '',
  setEmergencyContactName,
  emergencyContactPhone = '',
  setEmergencyContactPhone,
  onOpenReportBackModal,
  onSaveMasterAndEpisode,
  isSaving = false,
  saveSuccess = false,
}) => {
  const { language, bi } = useLanguage();
  const isRtlLang = language !== 'en';
  const { dek } = useVault();

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* 1. Patient Iraqi Financial Summary Strip (IQD — Debt in Orange Text, Zero Harsh Borders) */}
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-3.5">
        <div className="flex items-center justify-between border-b border-black/[0.045] dark:border-white/[0.06] pb-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Wallet className="size-4 text-primary" />
            <span>
              {bi(
                'الملخص المالي للمريض بالدينار العراقي',
                'Patient Financial Summary (IQD)',
                'پوختەی دارایی نەخۆش بە دیناری عێراقی'
              )}
            </span>
          </h2>
          <span className="text-xs text-muted-foreground-1 tabular-nums">
            <Num value={financialSummary.invoices.length} /> {bi('فواتير', 'invoices', 'پسوولە')}
          </span>
        </div>

        <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06] sm:divide-y-0 sm:grid sm:grid-cols-3 sm:gap-3 tabular-nums">
          <div className="flex items-center justify-between gap-3 py-2.5 sm:block sm:p-3.5 sm:rounded-2xl sm:bg-surface/65">
            <span className="text-xs text-muted-foreground-1 font-sans sm:block">
              {bi('إجمالي المبالغ المفوترة', 'Total Billed', 'کۆی گشتیی پسوولەکراو')}
            </span>
            <span className="text-sm sm:text-base font-bold text-foreground sm:mt-0.5 sm:block shrink-0">
              <Money amount={financialSummary.totalBilledIQD} />
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5 sm:block sm:p-3.5 sm:rounded-2xl sm:bg-surface/65">
            <span className="text-xs text-muted-foreground-1 font-sans sm:block">
              {bi('إجمالي المدفوع نقداً / إلكترونياً', 'Total Paid', 'کۆی پارەی دراو (نەقد / ئەلیکترۆنی)')}
            </span>
            <span className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-400 sm:mt-0.5 sm:block shrink-0">
              <Money amount={financialSummary.totalPaidIQD} />
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5 sm:block sm:p-3.5 sm:rounded-2xl sm:bg-surface/65">
            <span className="text-xs text-muted-foreground-1 font-sans sm:block">
              {bi('الرصيد المتبقي بذمة المريض (دين)', 'Balance Due (Debt)', 'پارەی ماوە لەسەر نەخۆش (قەرز)')}
            </span>
            <span
              className={`text-sm sm:text-base font-bold sm:mt-0.5 sm:block shrink-0 ${
                financialSummary.totalDebtIQD > 0
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-muted-foreground-1'
              }`}
            >
              <Money amount={financialSummary.totalDebtIQD} />
            </span>
          </div>
        </div>
      </div>

      {/* 2. Personal Information, Emergency Contacts & Referral Attribution (Non-Clinical Hub) */}
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.045] dark:border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <User className="size-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'المعلومات الشخصية، جهات الاتصال، والإحالة',
                'Personal Information, Contacts & Referral',
                'زانیاری کەسی، پەیوەندی و ڕەوانەکردن'
              )}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {onOpenEditPersonalInfo && (
              <button
                type="button"
                onClick={onOpenEditPersonalInfo}
                className="compact-btn h-8 px-2.5 sm:px-3 rounded-xl bg-surface/80 hover:bg-surface text-xs font-bold text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Edit3 className="size-3.5 shrink-0" />
                <span className="sm:hidden">{bi('تعديل', 'Edit', 'دەستکاری')}</span>
                <span className="hidden sm:inline">{bi('تعديل البيانات الأساسية', 'Edit Basic Info', 'دەستکاری زانیاری کەسی')}</span>
              </button>
            )}

            {enableReferralsModule && onOpenReportBackModal && (
              <button
                type="button"
                onClick={onOpenReportBackModal}
                className="compact-btn h-8 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-xl bg-surface/80 hover:bg-surface text-foreground text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Send className="size-3.5 text-primary shrink-0" />
                <span className="sm:hidden">{bi('تقرير محيل', 'Report', 'ڕاپۆرت')}</span>
                <span className="hidden sm:inline">{bi('إعداد تقرير للطبيب المحيل', 'Report Back to Doctor', 'ئامادەکردنی ڕاپۆرت')}</span>
              </button>
            )}

            {onSaveMasterAndEpisode && (
              <button
                type="button"
                onClick={onSaveMasterAndEpisode}
                disabled={isSaving}
                className={`compact-btn h-8 px-2.5 sm:px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap ${
                  saveSuccess
                    ? 'bg-emerald-700 text-white'
                    : 'bg-primary hover:bg-primary-hover text-primary-foreground'
                }`}
              >
                <Save className="size-3.5 shrink-0" />
                <span className="sm:hidden">
                  {isSaving
                    ? bi('حفظ...', 'Saving...', 'پاشەکەوت...')
                    : saveSuccess
                    ? bi('تم الحفظ', 'Saved', 'پاشەکەوتکرا')
                    : bi('حفظ', 'Save', 'پاشەکەوت')}
                </span>
                <span className="hidden sm:inline">
                  {isSaving
                    ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                    : saveSuccess
                    ? bi('تم حفظ الملف', 'Saved', 'پاشەکەوتکرا')
                    : bi('حفظ بيانات الملف', 'Save Profile', 'پاشەکەوتکردن')}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Basic Personal Info Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-surface/55 p-3.5 rounded-2xl">
          <div className="space-y-1">
            <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
              <User className="size-3 text-muted-foreground-1" />
              {bi('الاسم الكامل', 'Full Name', 'ناوی تەواو')}
            </span>
            <span className="font-bold text-foreground block truncate">
              {getPatientDisplayName(patient.data, language)}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
              <Phone className="size-3 text-muted-foreground-1" />
              {bi('رقم الهاتف', 'Phone', 'ژمارەی تەلەفۆن')}
            </span>
            <bdi dir="ltr" className="font-bold text-foreground font-mono inline-block truncate max-w-full">
              {patient.data.phone ? formatIraqiPhoneDisplay(patient.data.phone) : '—'}
            </bdi>
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
              <Calendar className="size-3 text-muted-foreground-1" />
              {bi('العمر / تاريخ الميلاد', 'Age / DOB', 'تەمەن / لەدایکبوون')}
            </span>
            <span className="font-bold text-foreground block">
              {patient.data.dateOfBirth
                ? formatClinicalDate(patient.data.dateOfBirth)
                : patientAge
                ? `${patientAge} ${bi('سنة', 'Years', 'ساڵ')}`
                : '—'}
              {genderLabel ? ` · ${genderLabel}` : ''}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground-1 flex items-center gap-1 font-medium">
              <MapPin className="size-3 text-muted-foreground-1" />
              {bi('العنوان والمدينة', 'Address', 'ناونیشان')}
            </span>
            <span className="font-bold text-foreground block truncate">
              {patient.data.address || bi('غير مسجل', 'Not set', 'تۆمار نەکراوە')}
            </span>
          </div>
        </div>

        {/* Referral Source & Emergency Contacts Form */}
        {enableReferralsModule && setReferralSourceType && setReferringDoctorId && setReferralNotes && (
          <div className="p-3.5 rounded-2xl bg-surface/55 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label htmlFor="profile-referral-source" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('مصدر الإحالة:', 'Referral Source:', 'سەرچاوەی ڕەوانەکردن:')}
              </label>
              <select
                id="profile-referral-source"
                value={referralSourceType}
                onChange={(e) => setReferralSourceType((e.target.value as ReferralSourceType) || '')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              >
                <option value="">{bi('— غير محدد —', '— Unspecified —', '— دیارینەکراو —')}</option>
                {REFERRAL_SOURCE_TYPES.map((sourceType) => (
                  <option key={sourceType} value={sourceType}>
                    {bi(REFERRAL_SOURCE_LABELS[sourceType].ar, REFERRAL_SOURCE_LABELS[sourceType].en)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="profile-referring-doctor-id" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('الطبيب المحيل (من الدليل):', 'Directory Doctor:', 'پزیشکی ڕەوانەکار (لە ڕێبەرەوە):')}
              </label>
              <select
                id="profile-referring-doctor-id"
                value={referringDoctorId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const doc = referringDoctors.find((entry) => entry.id === nextId);
                  setReferringDoctorId(nextId);
                  if (doc && setReferringPhysician && setReferringClinic) {
                    setReferringPhysician(resolveDoctorDisplayName(doc, isRtlLang));
                    const docFacility = resolveDoctorFacility(doc, isRtlLang);
                    if (docFacility) setReferringClinic(docFacility);
                    if (!referralSourceType) setReferralSourceType('doctor');
                  }
                }}
                className="w-full px-3 py-2 text-xs rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              >
                <option value="">
                  {bi(
                    '— اختياري: اختر من الدليل —',
                    '— Optional: Pick from Directory —',
                    '— دڵخوازانە: لە ڕێبەر هەڵبژێرە —'
                  )}
                </option>
                {referringDoctors.map((doc) => {
                  const docFacility = resolveDoctorFacility(doc, isRtlLang);
                  return (
                    <option key={doc.id} value={doc.id}>
                      {resolveDoctorDisplayName(doc, isRtlLang)}
                      {docFacility ? ` (${docFacility})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label htmlFor="profile-referral-notes" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('ملاحظات الإحالة:', 'Referral Notes:', 'تێبینییەکانی ڕەوانەکردن:')}
              </label>
              <input
                id="profile-referral-notes"
                type="text"
                value={referralNotes}
                onChange={(e) => setReferralNotes(e.target.value)}
                placeholder={bi(
                  'مثال: كتاب إحالة / اسم المُعرِّف...',
                  'e.g., Referral ref / recommender...',
                  'نموونە: نووسراوی ڕەوانەکردن / ناوی پێشنیارکەر...'
                )}
                className="w-full px-3 py-2 text-xs rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>
          </div>
        )}

        {setReferringPhysician && setReferringClinic && setEmergencyContactName && setEmergencyContactPhone && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label htmlFor="profile-referring-physician" className="text-xs font-semibold text-foreground block mb-1.5">
                <UserCheck className="size-3.5 inline me-1 text-primary" />
                {bi('الطبيب الاستشاري المحيل:', 'Referring Physician:', 'پزیشکی ڕاوێژکاری ڕەوانەکار:')}
              </label>
              <input
                id="profile-referring-physician"
                type="text"
                value={referringPhysician}
                onChange={(e) => setReferringPhysician(e.target.value)}
                placeholder={bi('مثال: د. حيدر العبيدي (جراحة عظام)', 'e.g., Dr. Haider Al-Obaidi', 'نموونە: د. حەیدەر عوبەیدی')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <div>
              <label htmlFor="profile-referring-clinic" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('المستشفى / المركز المحيل:', 'Referring Hospital / Clinic:', 'نەخۆشخانە / سەنتەری ڕەوانەکار:')}
              </label>
              <input
                id="profile-referring-clinic"
                type="text"
                value={referringClinic}
                onChange={(e) => setReferringClinic(e.target.value)}
                placeholder={bi('مستشفى الكفيل / عيادة الحارثية...', 'Hospital / Medical Center...', 'نەخۆشخانە / سەنتەری پزیشکی...')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <div>
              <label htmlFor="profile-emergency-name" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('اسم قريب الطوارئ وصلة القرابة:', 'Emergency Contact & Relation:', 'ناوی خزمی فریاگوزاری:')}
              </label>
              <input
                id="profile-emergency-name"
                type="text"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                placeholder={bi('مثال: محمد عبد الله (الأخ)', 'Name & Relationship', 'ناو و پەیوەندیی خزمایەتی')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <div>
              <label htmlFor="profile-emergency-phone" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('هاتف الطوارئ:', 'Emergency Phone:', 'ژمارەی تەلەفۆنی فریاگوزاری:')}
              </label>
              <PhoneInput
                id="profile-emergency-phone"
                value={emergencyContactPhone}
                onChange={setEmergencyContactPhone}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Printable Clinical Reports Portal & HL7 FHIR Export */}
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.045] dark:border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <Printer className="size-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'التقارير الطبية والطباعة الرسمية (PDF)',
                'Official Printable Clinical Reports (PDF)',
                'ڕاپۆرتە پزیشکییەکان و چاپکردنی فەرمی (PDF)'
              )}
            </h2>
          </div>
          <span className="text-xs text-muted-foreground-1">
            {bi(
              'بترويسة وشعار وختم العيادة المشفر محلياً',
              'With encrypted clinic letterhead, logo & stamp',
              'بە سەردێڕ و لۆگۆ و مۆری کلینیکی کۆدکراوی ناوخۆیی'
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(
            [
              {
                type: 'progress_report',
                ar: 'تقرير متابعة التقدم',
                en: 'Progress Report',
                ckb: 'ڕاپۆرتی بەدواداچوونی پێشکەوتن',
              },
              {
                type: 'discharge_summary',
                ar: 'ملخص التخريج',
                en: 'Discharge Summary',
                ckb: 'پوختەی دەرچوون',
              },
              {
                type: 'referral_letter',
                ar: 'كتاب إحالة طبية',
                en: 'Referral Letter',
                ckb: 'نامەی ڕەوانەکردنی پزیشکی',
              },
              {
                type: 'medical_report',
                ar: 'تقرير علاج طبيعي',
                en: 'Medical Report',
                ckb: 'ڕاپۆرتی چارەسەری سروشتی',
              },
              {
                type: 'patient_dossier',
                ar: 'الملف السريري الكامل (PDF)',
                en: 'Full Patient Dossier (PDF)',
                ckb: 'دۆسیەی کلینیکیی تەواو (PDF)',
              },
              ...(episodeStore.hepProgram.length > 0
                ? [
                    {
                      type: 'hep_sheet' as PrintableDocumentType,
                      ar: 'ورقة التمارين المنزلية (HEP)',
                      en: 'HEP Exercise Sheet',
                      ckb: 'لاپەڕەی ڕاهێنانی ماڵەوە (HEP)',
                    },
                  ]
                : []),
              ...(enableScheduleVisitCardPrint
                ? [
                    {
                      type: 'patient_visit_card' as PrintableDocumentType,
                      ar: 'بطاقة مواعيد المريض ورصيد الجلسات',
                      en: 'Patient Visit Card',
                      ckb: 'کارتی وادەکانی نەخۆش و ژمارەی دانیشتنەکان',
                      testId: 'print-patient-visit-card-btn',
                    },
                  ]
                : []),
            ] satisfies Array<{
              type: PrintableDocumentType;
              ar: string;
              en: string;
              ckb: string;
              testId?: string;
            }>
          ).map((item) => (
            <button
              key={item.type}
              type="button"
              data-testid={item.testId}
              onClick={async () => {
                if (item.type === 'patient_dossier' && dek) {
                  const loaded: SoapNoteRecord[] = [];
                  for (const s of sessions) {
                    try {
                      const note = await SoapService.getSoapNoteBySession(s.id, dek);
                      if (note) loaded.push(note);
                    } catch {
                      // skip unreadable draft
                    }
                  }
                  onAllPatientSoapsLoaded(loaded);
                }
                onOpenPrintDoc(item.type);
              }}
              className="py-2 px-3.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-foreground inline-flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Printer className="size-3.5 text-primary" />
              <span>{bi(item.ar, item.en, item.ckb)}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={async () => {
              if (!dek) return;
              const allSoaps: SoapNoteRecord[] = [];
              for (const s of sessions) {
                const note = await SoapService.getSoapNoteBySession(s.id, dek);
                if (note) allSoaps.push(note);
              }
              const stores = episodes.map((ep) =>
                ClinicOperationsService.getEpisodeClinicalStore(ep.id, patient.id)
              );
              const profile = ClinicOperationsService.getClinicProfile();
              const bundle = buildPatientFhirR4Bundle({
                patient,
                episodes,
                sessions,
                soaps: allSoaps,
                episodeStores: stores,
                clinicName: bi(profile.clinicNameAr, profile.clinicNameEn),
              });
              const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                type: 'application/fhir+json;charset=utf-8',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `patient-${patient.data.mrn || patient.id}-fhir-r4-${getTodayIso()}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
            className="py-2 px-3.5 rounded-xl bg-primary/10 hover:bg-primary/15 text-xs font-bold text-primary inline-flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>{bi('تصدير HL7 FHIR R4 JSON', 'Export FHIR R4 JSON', 'هەناردەکردنی HL7 FHIR R4 JSON')}</span>
          </button>
        </div>
      </div>

      {/* 4. Informed Consent & Encrypted Signature Pad */}
      <Suspense fallback={null}>
        <ConsentSignaturePanel patient={patient} episode={activeEpisode} />
      </Suspense>
    </div>
  );
};
