// =======================================================================
// PhysioRecord — Patient Creation & Editing Modal
// =======================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { usePatients } from '../../context/PatientContext';
import { useLanguage } from '../../context/LanguageContext';
import type {
  PatientClinicalData,
  PatientRecord,
  Gender,
  DominantHand,
  StructuredPrecautionId,
  CustomPrecautionItem,
} from '../../types/clinical';
import type {
  ReferralSourceType,
  ReferringDoctorEntry,
} from '../../types/clinicManagement';
import {
  computePatientAge,
  formatIraqiPhoneDisplay,
  normalizeIraqiPhoneStorage,
} from '../../utils/date';
import { AutoResizeTextarea, DatePickerInput, PhoneInput } from '../ui/Primitives';
import { DrawerDialog } from '../ui/Dialog';
import { RedFlagChecklistPanel } from '../workspace/RedFlagChecklistPanel';
import {
  getPatientDisplayName,
  getPatientMrn,
  hasPatientRedFlagsOrContraindications,
} from '../../utils/mrn';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { STRUCTURED_PRECAUTIONS_CATALOG } from '../../utils/modalitySafetyChecker';
import {
  detectPatientDuplicates,
  type DuplicatePatientMatch,
} from '../../utils/dataQualityPhaseD';
import {
  searchBilingualGlossary,
  type BilingualGlossaryEntry,
} from '../../data/terminology';
import {
  REFERRAL_SOURCE_LABELS,
  REFERRAL_SOURCE_TYPES,
  resolveDoctorDisplayName,
  resolveDoctorFacility,
  resolveDoctorSpecialty,
} from '../../utils/iraqReferralsRetentionC6C7';
import { 
  Save, 
  AlertTriangle, 
  User, 
  FileText, 
  ShieldAlert,
  ChevronDown,
  GitMerge,
  ExternalLink,
  BookOpen,
  Plus,
  Trash2,
} from 'lucide-react';

export interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientToEdit?: PatientRecord | null;
  onSavedSuccess?: (patient: PatientRecord) => void;
  onOpenExistingPatient?: (patientId: string) => void;
  onRequestMergeWithExisting?: (existingPatientId: string) => void;
}

export const PatientModal: React.FC<PatientModalProps> = ({
  isOpen,
  onClose,
  patientToEdit,
  onSavedSuccess,
  onOpenExistingPatient,
  onRequestMergeWithExisting,
}) => {
  const { patients, savePatient, loadFullPatientById } = usePatients();
  const { bi, t, isRtl, language } = useLanguage();
  const arabicNameInputRef = useRef<HTMLInputElement | null>(null);

  const [referralsModuleEnabled, setReferralsModuleEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isReferralsModuleEnabled()
  );
  const [referringDoctors, setReferringDoctors] = useState<ReferringDoctorEntry[]>(() =>
    ClinicOperationsService.getReferringDoctors()
  );

  // Form State
  const [formData, setFormData] = useState<PatientClinicalData>({
    fullName: '',
    fullNameAr: '',
    dateOfBirth: '',
    age: undefined,
    gender: 'male',
    phoneNumber: '',
    address: '',
    occupation: '',
    dominantHand: 'right',
    medicalHistory: '',
    previousSurgeries: '',
    currentMedications: '',
    allergies: '',
    comorbidities: '',
    precautions: '',
    redFlags: '',
    redFlagChecklist: [],
    psychosocialFactors: '',
    generalNotes: '',
    referringPhysician: '',
    referringClinic: '',
    referralSourceType: undefined,
    referringDoctorId: undefined,
    referralNotes: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ fullNameAr?: string }>({});
  const [dismissedDuplicateBanner, setDismissedDuplicateBanner] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState('');
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [newPrecautionText, setNewPrecautionText] = useState('');

  const patientToEditId = patientToEdit?.id ?? null;

  // Initialize form when opening or editing
  useEffect(() => {
    if (!isOpen) return;

    setDismissedDuplicateBanner(false);
    setGlossaryQuery('');
    setGlossaryOpen(false);
    setReferralsModuleEnabled(ClinicOperationsService.isReferralsModuleEnabled());
    setReferringDoctors(ClinicOperationsService.getReferringDoctors());

    if (patientToEdit) {
      setFormData({
        ...patientToEdit.data,
        fullNameAr: patientToEdit.data.fullNameAr || patientToEdit.data.fullName || '',
        redFlagChecklist: patientToEdit.data.redFlagChecklist || [],
      });
      if (patientToEdit.isSummaryOnly) {
        let active = true;
        void loadFullPatientById(patientToEdit.id).then((full) => {
          if (!active || !full) return;
          setFormData({
            ...full.data,
            fullNameAr: full.data.fullNameAr || full.data.fullName || '',
            redFlagChecklist: full.data.redFlagChecklist || [],
          });
        });
        return () => {
          active = false;
        };
      }
    } else {
      const currentStaff = ClinicOperationsService.getActiveStaff();
      setFormData({
        fullName: '',
        fullNameAr: '',
        dateOfBirth: '',
        age: undefined,
        gender: 'male',
        phoneNumber: '',
        address: '',
        occupation: '',
        dominantHand: 'right',
        medicalHistory: '',
        previousSurgeries: '',
        currentMedications: '',
        allergies: '',
        comorbidities: '',
        precautions: '',
        structuredPrecautions: [],
        redFlags: '',
        redFlagChecklist: [],
        psychosocialFactors: '',
        generalNotes: '',
        guardianName: '',
        guardianPhone: '',
        guardianRelation: 'parent',
        pediatricConsentGranted: false,
        referringPhysician: '',
        referringClinic: '',
        referralSourceType: undefined,
        referringDoctorId: undefined,
        referralNotes: '',
        assignedStaffId: currentStaff?.id,
        assignedTherapistName: currentStaff?.nameAr || currentStaff?.nameEn,
      });
    }
    setError(null);
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, patientToEditId]);

  // Calculate age automatically when DOB changes
  const handleDobChange = (dob: string) => {
    const calculatedAge = computePatientAge(dob);
    setFormData(prev => ({
      ...prev,
      dateOfBirth: dob,
      age: dob ? calculatedAge : prev.age,
    }));
  };

  const effectiveAge = computePatientAge(formData.dateOfBirth, formData.age);
  const isPediatricMinor =
    effectiveAge !== undefined &&
    effectiveAge < 18 &&
    ClinicOperationsService.isPediatricSafeguardsEnabled();

  useEffect(() => {
    setDismissedDuplicateBanner(false);
  }, [isOpen, patientToEditId, formData.fullNameAr, formData.fullName, formData.phoneNumber]);

  const duplicateMatches = useMemo<DuplicatePatientMatch[]>(() => {
    if (!isOpen) return [];
    return detectPatientDuplicates(
      {
        id: patientToEdit?.id,
        fullNameAr: formData.fullNameAr,
        fullName: formData.fullName,
        phoneNumber: formData.phoneNumber || formData.phone,
      },
      patients
    );
  }, [
    isOpen,
    patientToEdit?.id,
    formData.fullNameAr,
    formData.fullName,
    formData.phoneNumber,
    formData.phone,
    patients,
  ]);

  const glossaryEnabled = ClinicOperationsService.isBilingualTerminologyGlossaryEnabled();
  const glossarySuggestions = useMemo<BilingualGlossaryEntry[]>(() => {
    if (!glossaryEnabled) return [];
    return searchBilingualGlossary(glossaryQuery, undefined, 6);
  }, [glossaryEnabled, glossaryQuery]);

  const formatDuplicateReason = (match: DuplicatePatientMatch): string => {
    if (match.matchedByName && match.matchedByPhoneSuffix) {
      return bi('تطابق الاسم ورقم الهاتف', 'Exact name & phone match');
    }
    if (match.matchedByPhoneSuffix) {
      return bi('تطابق رقم الهاتف', 'Phone number match');
    }
    return bi('تشابه الاسم الكامل', 'Similar full name');
  };

  const handleSelectGlossarySuggestion = (entry: BilingualGlossaryEntry) => {
    const formatted = `${entry.ar} (${entry.en})`;
    setFormData((prev) => {
      const existing = (prev.medicalHistory || '').trim();
      if (existing.includes(entry.ar) && existing.includes(entry.en)) {
        return prev;
      }
      return {
        ...prev,
        medicalHistory: existing ? `${existing}\n${formatted}` : formatted,
      };
    });
    setGlossaryQuery('');
    setGlossaryOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const primaryNameValue =
      language === 'en'
        ? (formData.fullName?.trim() || formData.fullNameAr?.trim() || '')
        : (formData.fullNameAr?.trim() || formData.fullName?.trim() || '');

    if (!primaryNameValue) {
      const msg = bi(
        t('errArabicNameRequired'),
        'Patient full name is required.',
        'نووسینی ناوی تەواوی نەخۆش پێویستە.'
      );
      setError(msg);
      setFieldErrors({ fullNameAr: msg });
      setTimeout(() => {
        arabicNameInputRef.current?.focus();
      }, 20);
      return;
    }

    if (isPediatricMinor) {
      if (!formData.guardianName?.trim() || !formData.guardianPhone?.trim()) {
        setError(
          bi(
            'حماية الأطفال (< 18 سنة): يجب إدخال اسم ولي الأمر ورقم هاتفه قبل حفظ الملف.',
            'Pediatric Safeguard (< 18 yrs): Guardian name and guardian phone are required.'
          )
        );
        return;
      }
      if (!formData.pediatricConsentGranted) {
        setError(
          bi(
            'حماية الأطفال (< 18 سنة): يرجى تأكيد موافقة ولي الأمر على التقييم والعلاج.',
            'Pediatric Safeguard (< 18 yrs): Please confirm Parent/Guardian consent checkbox.'
          )
        );
        return;
      }
    }

    setSaving(true);
    try {
      const computedAgeFromDob = computePatientAge(formData.dateOfBirth, formData.age);
      const cleanArName = formData.fullNameAr?.trim() || formData.fullName?.trim() || '';
      const cleanEnName = formData.fullName?.trim() || cleanArName;
      const canonicalPhone = formData.phoneNumber
        ? normalizeIraqiPhoneStorage(formData.phoneNumber)
        : '';

      const stampedFormData: PatientClinicalData = {
        ...formData,
        fullNameAr: cleanArName,
        fullName: cleanEnName,
        phone: canonicalPhone,
        phoneNumber: canonicalPhone,
        age: formData.dateOfBirth ? computedAgeFromDob : formData.age,
        profileSummaryUpdatedAt: new Date().toISOString(),
      };
      const saved = await savePatient(stampedFormData, patientToEdit?.id);
      if (onSavedSuccess) onSavedSuccess(saved);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل حفظ بيانات المريض.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <DrawerDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      side="end"
      dir={isRtl ? 'rtl' : 'ltr'}
      maxWidthClassName="max-w-lg"
      className="bg-card border-card-line"
      title={
        patientToEdit
          ? bi('تعديل ملف المريض', 'Edit Patient', 'دەستکاریکردنی پەڕگەی نەخۆش')
          : bi('تسجيل مريض جديد', 'New Patient', 'تۆمارکردنی نەخۆشی نوێ')
      }
      subtitle={bi(
        'أدخل البيانات الأساسية أولاً، والتفاصيل السريرية اختيارية',
        'Enter essential details first; clinical history is optional',
        'سەرەتا زانیارییە سەرەکییەکان بنووسە، وردەکارییە کلینیکییەکان ئارەزوومەندانەیە'
      )}
      ariaLabel={
        patientToEdit ? bi('تعديل ملف المريض', 'Edit Patient') : bi('تسجيل مريض جديد', 'New Patient')
      }
      closeLabel={bi('إغلاق', 'Close')}
      bodyClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
    >
        {/* Sheet Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div tabIndex={0} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 bg-surface/75 rounded-xl text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Minimal First Step: Patient Name, Phone, Sex, Age or DOB */}
          <div className="space-y-3.5">
            <div>
              <label htmlFor="patient-fullname-ar" className="block text-xs font-semibold text-foreground mb-1">
                {bi('اسم المريض الثلاثي بالعربية', 'Patient Full Name', 'ناوی سیانیی نەخۆش')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                id="patient-fullname-ar"
                ref={arabicNameInputRef}
                type="text"
                value={
                  language === 'en'
                    ? (formData.fullName ?? '')
                    : (formData.fullNameAr || '')
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (language === 'en') {
                    setFormData((prev) => ({
                      ...prev,
                      fullName: val,
                      ...(prev.fullNameAr === prev.fullName ? { fullNameAr: val } : {}),
                    }));
                  } else {
                    setFormData((prev) => ({ ...prev, fullNameAr: val }));
                  }
                  if (val.trim() && fieldErrors.fullNameAr) {
                    setFieldErrors({});
                    setError(null);
                  }
                }}
                aria-invalid={Boolean(fieldErrors.fullNameAr)}
                placeholder={bi(
                  'مثال: أحمد فهد الشمري',
                  'e.g., Ahmed Fahad Al-Shammari',
                  'نموونە: ئەحمەد فەهد ئەلشەمەری'
                )}
                className={`w-full px-3.5 py-2 rounded-xl bg-surface border text-foreground text-sm focus:outline-none focus:ring-2 ${
                  fieldErrors.fullNameAr
                    ? 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-500'
                    : 'border-layer-line focus:ring-primary/20 focus:border-primary'
                }`}
              />
              {fieldErrors.fullNameAr && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1">
                  {fieldErrors.fullNameAr}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="patient-phone-input" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('رقم الهاتف العراقي', 'Iraqi Phone Number', 'ژمارەی تەلەفۆن')}
                </label>
                <PhoneInput
                  id="patient-phone-input"
                  ariaLabel={bi('رقم الهاتف العراقي', 'Iraqi Phone Number', 'ژمارەی تەلەفۆن')}
                  value={formData.phoneNumber || ''}
                  onChange={(val) => setFormData({ ...formData, phoneNumber: val })}
                  placeholder="0770 123 4567"
                />
              </div>

              <div>
                <label htmlFor="patient-gender-select" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('الجنس', 'Gender', 'ڕەگەز')}
                </label>
                <select
                  id="patient-gender-select"
                  value={formData.gender === 'female' ? 'female' : 'male'}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="male">{bi('ذكر', 'Male', 'نێر')}</option>
                  <option value="female">{bi('أنثى', 'Female', 'مێ')}</option>
                </select>
              </div>
            </div>

            {duplicateMatches.length > 0 && !dismissedDuplicateBanner && (() => {
              const topMatch = duplicateMatches[0];
              const matchPhone = formatIraqiPhoneDisplay(
                topMatch.patient.data.phoneNumber || topMatch.patient.data.phone
              );
              return (
                <div
                  data-testid="duplicate-patient-guard-banner"
                  role="alert"
                  className="p-3.5 rounded-xl bg-card shadow-2xs space-y-2.5"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs font-bold text-amber-700 dark:text-amber-400">
                        {bi(
                          'تنبيه تطابق محتمل: يوجد ملف مريض مشابه مسجّل مسبقاً',
                          'Potential Duplicate Patient Detected'
                        )}
                      </div>
                      <div className="text-xs flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="font-bold text-foreground">
                          {getPatientDisplayName(topMatch.patient.data, language)}
                        </span>
                        <bdi dir="ltr" className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface/80">
                          {getPatientMrn(topMatch.patient)}
                        </bdi>
                        <bdi dir="ltr" className="tabular-nums text-muted-foreground-1">
                          {matchPhone}
                        </bdi>
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                          {formatDuplicateReason(topMatch)}
                        </span>
                      </div>
                      {duplicateMatches.length > 1 && (
                        <div className="text-xs text-muted-foreground-1">
                          {bi(
                            `يوجد أيضاً ${duplicateMatches.length - 1} تطابق آخر في الدليل.`,
                            `${duplicateMatches.length - 1} additional potential match(es) found.`
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      data-testid="duplicate-open-existing-btn"
                      onClick={() => {
                        if (onOpenExistingPatient) {
                          onOpenExistingPatient(topMatch.patient.id);
                          onClose();
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{bi('فتح الملف الحالي', 'Open Existing')}</span>
                    </button>

                    {(patientToEdit || onRequestMergeWithExisting) && (
                      <button
                        type="button"
                        data-testid="duplicate-open-merge-btn"
                        onClick={() => onRequestMergeWithExisting?.(topMatch.patient.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <GitMerge className="w-3.5 h-3.5" />
                        <span>{bi('دمج', 'Merge')}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid="duplicate-save-anyway-btn"
                      onClick={() => setDismissedDuplicateBanner(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-layer-line hover:bg-layer-hover text-foreground text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <span>{bi('حفظ على أي حال', 'Save Anyway')}</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="patient-age-input" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('العمر (سنوات)', 'Age (Years)')}
                </label>
                <input
                  id="patient-age-input"
                  type="number"
                  min="0"
                  max="125"
                  dir="ltr"
                  value={formData.age !== undefined ? formData.age : ''}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                  placeholder={bi('مثال: 32', 'e.g., 32')}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface border border-layer-line text-foreground text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label htmlFor="patient-dob-input" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('أو تاريخ الميلاد', 'Or Date of Birth')}
                </label>
                <DatePickerInput
                  id="patient-dob-input"
                  ariaLabel={bi('تاريخ الميلاد', 'Date of Birth')}
                  value={formData.dateOfBirth || ''}
                  onChange={(dob) => handleDobChange(dob)}
                />
              </div>
            </div>

            {(() => {
              const staffRoster = ClinicOperationsService.getStaffRoster();
              const isTeamClinic = !ClinicOperationsService.isSoloMode() || staffRoster.length > 1;
              if (!isTeamClinic || staffRoster.length === 0) return null;
              return (
                <div>
                  <label
                    htmlFor="patient-assigned-therapist-select"
                    className="block text-xs font-semibold text-foreground mb-1"
                  >
                    {bi('المعالج المسؤول عن المريض', 'Assigned Therapist')}
                  </label>
                  <select
                    id="patient-assigned-therapist-select"
                    data-testid="patient-assigned-therapist-select"
                    value={formData.assignedStaffId || ''}
                    onChange={(e) => {
                      const chosen = staffRoster.find((s) => s.id === e.target.value);
                      setFormData({
                        ...formData,
                        assignedStaffId: chosen?.id || undefined,
                        assignedTherapistName: chosen
                          ? language === 'en'
                            ? chosen.nameEn
                            : chosen.nameAr
                          : undefined,
                      });
                    }}
                    className="w-full h-10 px-3 rounded-xl bg-surface border border-layer-line text-foreground text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">{bi('— غير محدد —', '— Unassigned —')}</option>
                    {staffRoster.map((member) => (
                      <option key={member.id} value={member.id}>
                        {language === 'en' ? member.nameEn : member.nameAr}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {isPediatricMinor && (
              <div
                data-testid="pediatric-guardian-section"
                className="p-3.5 rounded-xl bg-card shadow-2xs space-y-2.5"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    {bi(
                      'حماية القُصّر (< 18 سنة): بيانات وموافقة ولي الأمر مطلوبة',
                      'Pediatric Safeguard (< 18 yrs): Guardian Info & Consent Required'
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="patient-guardian-name" className="block text-xs font-semibold text-foreground mb-1">
                      {bi('اسم ولي الأمر الكامل *', 'Guardian Full Name *')}
                    </label>
                    <input
                      id="patient-guardian-name"
                      type="text"
                      data-testid="pediatric-guardian-name-input"
                      value={formData.guardianName || ''}
                      onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                      placeholder={bi('مثال: محمد حسن الجبوري', 'e.g., Mohammed Hassan')}
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-foreground text-xs focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div data-testid="pediatric-guardian-phone-wrap">
                    <label htmlFor="patient-guardian-phone" className="block text-xs font-semibold text-foreground mb-1">
                      {bi('هاتف ولي الأمر *', 'Guardian Phone *')}
                    </label>
                    <PhoneInput
                      id="patient-guardian-phone"
                      ariaLabel={bi('هاتف ولي الأمر', 'Guardian Phone')}
                      value={formData.guardianPhone || ''}
                      onChange={(val) => setFormData({ ...formData, guardianPhone: val })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                  <div>
                    <label htmlFor="patient-guardian-relation" className="block text-xs font-semibold text-foreground mb-1">
                      {bi('صلة القرابة', 'Guardian Relation')}
                    </label>
                    <select
                      id="patient-guardian-relation"
                      value={formData.guardianRelation || 'parent'}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          guardianRelation: e.target.value as PatientClinicalData['guardianRelation'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-foreground text-xs focus:outline-none focus:border-primary"
                    >
                      <option value="parent">{bi('الأب / الأم', 'Parent')}</option>
                      <option value="legal_guardian">{bi('وصي قانوني', 'Legal Guardian')}</option>
                      <option value="other_family">{bi('قريب مرافق', 'Family Member')}</option>
                    </select>
                  </div>

                  <label className="flex items-start gap-2 pt-2 sm:pt-4 text-xs font-semibold text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      data-testid="pediatric-guardian-consent-checkbox"
                      checked={Boolean(formData.pediatricConsentGranted)}
                      onChange={(e) =>
                        setFormData({ ...formData, pediatricConsentGranted: e.target.checked })
                      }
                      className="mt-0.5 size-4 rounded border-layer-line accent-amber-600"
                    />
                    <span>
                      {bi(
                        'تأكيد موافقة ولي الأمر على التقييم والعلاج *',
                        'Confirm Guardian Informed Consent *'
                      )}
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* C6: Referral Source & Referring Doctor (when Referrals module enabled) */}
          {referralsModuleEnabled && (
            <div
              data-testid="patient-modal-referral-section"
              className="p-4 rounded-xl border border-card-line bg-surface/60 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-foreground">
                  {bi('مصدر الإحالة والطبيب المحيل (اختياري)', 'Referral Source & Referring Doctor (Optional)')}
                </label>
                {formData.referralSourceType && (
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        referralSourceType: undefined,
                        referringDoctorId: undefined,
                        referringPhysician: '',
                        referringClinic: '',
                      }))
                    }
                    className="text-xs font-semibold text-muted-foreground-1 hover:text-foreground cursor-pointer"
                  >
                    {bi('مسح', 'Clear')}
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-line-2 bg-surface/60 p-1 overflow-hidden">
                <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
                  {REFERRAL_SOURCE_TYPES.map((sourceType: ReferralSourceType) => {
                    const selected = formData.referralSourceType === sourceType;
                    const label = bi(
                      REFERRAL_SOURCE_LABELS[sourceType].ar,
                      REFERRAL_SOURCE_LABELS[sourceType].en
                    );
                    return (
                      <button
                        key={sourceType}
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            referralSourceType:
                              prev.referralSourceType === sourceType ? undefined : sourceType,
                          }))
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                            : 'bg-card border-line-2/70 text-foreground hover:bg-layer-hover'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label htmlFor="patient-ref-doc-select" className="block text-xs font-medium text-muted-foreground-1 mb-1">
                    {bi('اختيار طبيب محيل من الدليل', 'Select Referring Doctor from Directory')}
                  </label>
                  <select
                    id="patient-ref-doc-select"
                    value={formData.referringDoctorId || ''}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      const doc = referringDoctors.find((entry) => entry.id === nextId);
                      const isRtlLang = language !== 'en';
                      setFormData((prev) => ({
                        ...prev,
                        referringDoctorId: nextId || undefined,
                        referralSourceType:
                          doc && !prev.referralSourceType ? 'doctor' : prev.referralSourceType,
                        referringPhysician: doc
                          ? resolveDoctorDisplayName(doc, isRtlLang)
                          : nextId
                          ? prev.referringPhysician
                          : prev.referringDoctorId
                          ? ''
                          : prev.referringPhysician,
                        referringClinic: doc
                          ? resolveDoctorFacility(doc, isRtlLang)
                          : nextId
                          ? prev.referringClinic
                          : prev.referringDoctorId
                          ? ''
                          : prev.referringClinic,
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="">
                      {referringDoctors.length > 0
                        ? bi('— اختر طبيباً محيلاً أو اكتب يدوياً أدناه —', '— Choose a referring doctor or type below —')
                        : bi('— لا يوجد أطباء في الدليل بعد (أدخل يدوياً أدناه) —', '— No doctors in directory yet (enter manually below) —')}
                    </option>
                    {referringDoctors.map((doc) => {
                      const isRtlLang = language !== 'en';
                      const meta = [
                        resolveDoctorSpecialty(doc, isRtlLang),
                        resolveDoctorFacility(doc, isRtlLang),
                      ]
                        .filter(Boolean)
                        .join(' • ');
                      return (
                        <option key={doc.id} value={doc.id}>
                          {resolveDoctorDisplayName(doc, isRtlLang)}
                          {meta ? ` (${meta})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {(formData.referralSourceType === 'doctor' ||
                  formData.referralSourceType === 'hospital' ||
                  Boolean(formData.referringDoctorId) ||
                  Boolean(formData.referringPhysician) ||
                  Boolean(formData.referringClinic)) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="patient-ref-physician" className="block text-xs font-medium text-muted-foreground-1 mb-1">
                        {bi('اسم الطبيب المحيل', 'Referring Physician Name')}
                      </label>
                      <input
                        id="patient-ref-physician"
                        type="text"
                        value={formData.referringPhysician || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            referringPhysician: e.target.value,
                          }))
                        }
                        placeholder={bi('د. حيدر العبيدي...', 'Dr. Haider Al-Obaidi...')}
                        className="w-full px-3 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label htmlFor="patient-ref-clinic" className="block text-xs font-medium text-muted-foreground-1 mb-1">
                        {bi('المستشفى / المركز المحيل', 'Referring Hospital / Clinic')}
                      </label>
                      <input
                        id="patient-ref-clinic"
                        type="text"
                        value={formData.referringClinic || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            referringClinic: e.target.value,
                          }))
                        }
                        placeholder={bi('مستشفى الكفيل / عيادة...', 'Hospital / Medical Center...')}
                        className="w-full px-3 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="patient-ref-notes" className="block text-xs font-medium text-muted-foreground-1 mb-1">
                    {bi('ملاحظات الإحالة', 'Referral Notes')}
                  </label>
                  <input
                    id="patient-ref-notes"
                    type="text"
                    value={formData.referralNotes || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        referralNotes: e.target.value,
                      }))
                    }
                    placeholder={bi('مثال: رقم كتاب الإحالة أو اسم المُعرِّف...', 'e.g., Referral letter ref or recommender...')}
                    className="w-full px-3 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Accordion 1: More Details */}
          <details className="group rounded-xl border border-card-line bg-surface/40 overflow-hidden">
            <summary className="px-4 py-3 text-xs font-bold text-foreground flex items-center justify-between cursor-pointer select-none hover:bg-muted/40">
              <span className="inline-flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <span>{bi('تفاصيل إضافية (الاسم الإنجليزي، المهنة، السكن)', 'More details (English name, occupation, address)')}</span>
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground-1 transition-transform group-open:rotate-180" />
            </summary>
            <div className="p-4 pt-2 border-t border-card-divider space-y-3">
              <div>
                <label htmlFor="patient-fullname-en" className="block text-xs font-semibold text-foreground mb-1">
                  {bi(
                    'الاسم بالإنجليزية (اختياري)',
                    'Full Name in Arabic / Kurdish (Optional)',
                    'ناو بە ئینگلیزی (ئارەزوومەندانە)'
                  )}
                </label>
                <input
                  id="patient-fullname-en"
                  type="text"
                  value={language === 'en' ? (formData.fullNameAr || '') : (formData.fullName || '')}
                  onChange={(e) =>
                    language === 'en'
                      ? setFormData({ ...formData, fullNameAr: e.target.value })
                      : setFormData({ ...formData, fullName: e.target.value })
                  }
                  placeholder={
                    language === 'en'
                      ? 'مثال: أحمد فهد الشمري'
                      : 'e.g., Ahmed Fahad Al-Shammari'
                  }
                  className={`w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary font-sans ${
                    language === 'en' ? 'text-right' : 'text-left'
                  }`}
                  dir={language === 'en' ? 'rtl' : 'ltr'}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="patient-occupation" className="block text-xs font-semibold text-foreground mb-1">
                    {bi('المهنة ونمط العمل', 'Occupation')}
                  </label>
                  <input
                    id="patient-occupation"
                    type="text"
                    value={formData.occupation || ''}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    placeholder={bi('مثال: مهندس، معلم', 'e.g., Engineer, Teacher')}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="patient-dominant-hand" className="block text-xs font-semibold text-foreground mb-1">
                    {bi('اليد المهيمنة', 'Dominant Hand')}
                  </label>
                  <select
                    id="patient-dominant-hand"
                    value={formData.dominantHand}
                    onChange={(e) => setFormData({ ...formData, dominantHand: e.target.value as DominantHand })}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="right">{bi('اليمنى', 'Right')}</option>
                    <option value="left">{bi('اليسرى', 'Left')}</option>
                    <option value="ambidextrous">{bi('كلتا اليدين', 'Ambidextrous')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="patient-address" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('عنوان السكن (المحافظة والمنطقة)', 'Residential Address')}
                </label>
                <input
                  id="patient-address"
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder={bi('مثال: بغداد — المنصور', 'e.g., Baghdad — Al-Mansour')}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </details>

          {/* D5: Bilingual Diagnosis / Clinical Condition Glossary Autocomplete */}
          {glossaryEnabled && (
            <div className="p-3.5 rounded-xl border border-card-line bg-surface/60 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="patient-glossary-autocomplete-input"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground"
                >
                  <BookOpen className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    {bi(
                      'التشخيص الأولي / القاموس السريري الثنائي (اختياري)',
                      'Primary Diagnosis / Bilingual Clinical Glossary (Optional)'
                    )}
                  </span>
                </label>
                {glossaryOpen && (
                  <button
                    type="button"
                    onClick={() => setGlossaryOpen(false)}
                    className="text-xs font-semibold text-muted-foreground-1 hover:text-foreground cursor-pointer"
                  >
                    {bi('إخفاء', 'Hide')}
                  </button>
                )}
              </div>

              <input
                id="patient-glossary-autocomplete-input"
                type="text"
                data-testid="patient-glossary-autocomplete-input"
                value={glossaryQuery}
                onFocus={() => setGlossaryOpen(true)}
                onChange={(e) => {
                  setGlossaryQuery(e.target.value);
                  setGlossaryOpen(true);
                }}
                placeholder={bi(
                  'ابحث لإدراج تشخيص ثنائي اللغة (مثال: انزلاق، خشونة، lumbar، stroke)...',
                  'Search bilingual clinical diagnosis (e.g., lumbar, knee, انزلاق)...'
                )}
                className="w-full px-3 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
              />

              {(glossaryOpen || glossaryQuery.trim().length > 0) && glossarySuggestions.length > 0 && (
                <div className="rounded-2xl border border-line-2 bg-surface/60 p-1 overflow-hidden">
                  <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
                    {glossarySuggestions.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        data-testid={`glossary-suggestion-${entry.id}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectGlossarySuggestion(entry)}
                        className="text-start px-3 py-1.5 rounded-xl bg-card hover:bg-primary/10 border border-line-2/70 hover:border-primary/40 text-xs text-foreground transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span className="font-semibold">{entry.ar}</span>
                        <span className="text-muted-foreground-1"> · {entry.en}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formData.medicalHistory?.trim() && (
                <div className="text-xs text-muted-foreground-1 bg-muted/40 rounded-lg px-2.5 py-1.5 border border-card-divider whitespace-pre-wrap">
                  <strong className="text-foreground">
                    {bi('التاريخ المرضي / التشخيص المسجّل:', 'Recorded Diagnosis / History:')}{' '}
                  </strong>
                  <span>{formData.medicalHistory}</span>
                </div>
              )}
            </div>
          )}

          {/* Accordion 2: Medical History */}
          <details className="group rounded-xl border border-card-line bg-surface/40 overflow-hidden">
            <summary className="px-4 py-3 text-xs font-bold text-foreground flex items-center justify-between cursor-pointer select-none hover:bg-muted/40">
              <span className="inline-flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <span>{bi('التاريخ المرضي والجراحي والأدوية', 'Medical history, surgeries & medications')}</span>
              </span>
              <ChevronDown className="w-4 h-4 text-muted-foreground-1 transition-transform group-open:rotate-180" />
            </summary>
            <div className="p-4 pt-2 border-t border-card-divider space-y-3">
              <div>
                <label htmlFor="patient-medical-history" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('التاريخ المرضي العام وطبيعة الشكوى الحالية', 'General Medical History & Chief Complaint')}
                </label>
                <AutoResizeTextarea
                  id="patient-medical-history"
                  minRows={2}
                  value={formData.medicalHistory || ''}
                  onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
                  placeholder={bi('وصف الإصابة، آلية الحدوث، التاريخ الزمني...', 'Injury mechanism, onset, initial diagnosis...')}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="patient-prev-surgeries" className="block text-xs font-semibold text-foreground mb-1">
                    {bi('العمليات الجراحية السابقة', 'Previous Surgeries')}
                  </label>
                  <AutoResizeTextarea
                    id="patient-prev-surgeries"
                    minRows={2}
                    value={formData.previousSurgeries || ''}
                    onChange={(e) => setFormData({ ...formData, previousSurgeries: e.target.value })}
                    placeholder={bi('أي جراحات سابقة مع تواريخها...', 'Prior surgeries and dates...')}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="patient-curr-meds" className="block text-xs font-semibold text-foreground mb-1">
                    {bi('الأدوية الحالية المستمرة', 'Current Medications')}
                  </label>
                  <AutoResizeTextarea
                    id="patient-curr-meds"
                    minRows={2}
                    value={formData.currentMedications || ''}
                    onChange={(e) => setFormData({ ...formData, currentMedications: e.target.value })}
                    placeholder={bi('المسكنات، مميعات الدم، أدوية الضغط...', 'Analgesics, anticoagulants, etc.')}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="patient-allergies" className="block text-xs font-semibold text-foreground mb-1">
                    {bi('الحساسية المعروفة', 'Known Allergies')}
                  </label>
                  <input
                    id="patient-allergies"
                    type="text"
                    value={formData.allergies || ''}
                    onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                    placeholder={bi('حساسية دوائية، لاصقات طبية...', 'Drug allergies, tape, latex...')}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label htmlFor="patient-comorbidities" className="block text-xs font-semibold text-foreground mb-1">
                    {bi('الأمراض المصاحبة', 'Comorbidities')}
                  </label>
                  <input
                    id="patient-comorbidities"
                    type="text"
                    value={formData.comorbidities || ''}
                    onChange={(e) => setFormData({ ...formData, comorbidities: e.target.value })}
                    placeholder={bi('سكري، ضغط، هشاشة عظام...', 'Diabetes, HTN, osteoporosis...')}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          </details>

          {/* Accordion 3: Red Flags & Contraindications */}
          <details className="group rounded-xl bg-card shadow-2xs overflow-hidden">
            <summary className="px-4 py-3 text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center justify-between cursor-pointer select-none hover:bg-surface/80">
              <span className="inline-flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>{bi('الأعلام الحمراء والمحاذير السريرية', 'Red flags & contraindications')}</span>
                {hasPatientRedFlagsOrContraindications(formData) && (
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                )}
              </span>
              <ChevronDown className="w-4 h-4 text-rose-600 dark:text-rose-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="p-4 pt-2 border-t border-card-line space-y-3">
              <RedFlagChecklistPanel
                checklist={formData.redFlagChecklist}
                onChange={(next) => setFormData({ ...formData, redFlagChecklist: next })}
                redFlagsText={formData.redFlags || ''}
                onRedFlagsTextChange={(val) => setFormData({ ...formData, redFlags: val })}
                dismissedItemIds={formData.dismissedRedFlagIds}
                onDismissedItemIdsChange={(ids) => setFormData({ ...formData, dismissedRedFlagIds: ids })}
              />

              <div>
                <label htmlFor="patient-precautions" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('المحاذير وموانع العلاج أثناء التأهيل', 'Clinical Precautions & Contraindications')}
                </label>
                <AutoResizeTextarea
                  id="patient-precautions"
                  minRows={2}
                  value={formData.precautions || ''}
                  onChange={(e) => setFormData({ ...formData, precautions: e.target.value })}
                  placeholder={bi('مثال: قيود تحميل الوزن، محاذير التواء الكتف...', 'e.g., Weight-bearing restrictions, post-op precautions...')}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                />
                <div className="mt-2 pt-2 border-t border-card-line space-y-2">
                  <span className="block text-xs font-semibold text-rose-700 dark:text-rose-400">
                    {bi(
                      'المحاذير السريرية المهيكلة (لتنبيهات سلامة الأجهزة):',
                      'Structured Precautions (Modality Safety Alerts):'
                    )}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {STRUCTURED_PRECAUTIONS_CATALOG.filter(
                      (item) => !(formData.dismissedPrecautionIds || []).includes(item.id)
                    ).map((item) => {
                      const selected = (formData.structuredPrecautions || []).includes(item.id);
                      return (
                        <div
                          key={item.id}
                          data-testid={`modal-precaution-${item.id}`}
                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                            selected
                              ? 'bg-rose-500/15 border-rose-500 text-rose-800 dark:text-rose-200 font-bold'
                              : 'bg-surface border-layer-line text-foreground hover:bg-muted/40'
                          }`}
                        >
                          <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                const curr = formData.structuredPrecautions || [];
                                const next: StructuredPrecautionId[] = curr.includes(item.id)
                                  ? curr.filter((x) => x !== item.id)
                                  : [...curr, item.id];
                                setFormData({ ...formData, structuredPrecautions: next });
                              }}
                              className="size-3.5 accent-rose-600 rounded shrink-0"
                            />
                            <span className="truncate">{bi(item.labelAr, item.labelEn, item.labelCkb)}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const currDismissed = formData.dismissedPrecautionIds || [];
                              const currSelected = formData.structuredPrecautions || [];
                              setFormData({
                                ...formData,
                                dismissedPrecautionIds: [...currDismissed, item.id],
                                structuredPrecautions: currSelected.filter((x) => x !== item.id),
                              });
                            }}
                            title={bi('حذف هذا المحذور', 'Delete this precaution')}
                            className="p-1 text-muted-foreground-2 hover:text-rose-600 rounded transition-colors shrink-0 cursor-pointer"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      );
                    })}

                    {(formData.customPrecautions || []).map((item) => {
                      const selected = (formData.structuredPrecautions || []).includes(item.id);
                      return (
                        <div
                          key={item.id}
                          data-testid={`modal-precaution-${item.id}`}
                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                            selected
                              ? 'bg-rose-500/15 border-rose-500 text-rose-800 dark:text-rose-200 font-bold'
                              : 'bg-surface border-layer-line text-foreground hover:bg-muted/40'
                          }`}
                        >
                          <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                const curr = formData.structuredPrecautions || [];
                                const next: StructuredPrecautionId[] = curr.includes(item.id)
                                  ? curr.filter((x) => x !== item.id)
                                  : [...curr, item.id];
                                setFormData({ ...formData, structuredPrecautions: next });
                              }}
                              className="size-3.5 accent-rose-600 rounded shrink-0"
                            />
                            <span className="truncate font-semibold">{bi(item.labelAr, item.labelEn || item.labelAr, item.labelCkb || item.labelAr)}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const currCustom = formData.customPrecautions || [];
                              const currSelected = formData.structuredPrecautions || [];
                              setFormData({
                                ...formData,
                                customPrecautions: currCustom.filter((x) => x.id !== item.id),
                                structuredPrecautions: currSelected.filter((x) => x !== item.id),
                              });
                            }}
                            title={bi('حذف هذا المحذور المخصص', 'Delete this custom precaution')}
                            className="p-1 text-muted-foreground-2 hover:text-rose-600 rounded transition-colors shrink-0 cursor-pointer"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Custom Precaution row */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newPrecautionText}
                      onChange={(e) => setNewPrecautionText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const trimmed = newPrecautionText.trim();
                          if (!trimmed) return;
                          const newId = `custom_prec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                          const newItem: CustomPrecautionItem = {
                            id: newId,
                            labelAr: trimmed,
                            labelEn: trimmed,
                            createdAt: new Date().toISOString(),
                          };
                          const currCustom = formData.customPrecautions || [];
                          const currSelected = formData.structuredPrecautions || [];
                          setFormData({
                            ...formData,
                            customPrecautions: [...currCustom, newItem],
                            structuredPrecautions: [...currSelected, newId],
                          });
                          setNewPrecautionText('');
                        }
                      }}
                      placeholder={bi('إضافة محذور مخصص جديد...', 'Add new custom precaution...')}
                      className="flex-1 min-w-0 w-full px-3 py-1.5 text-xs rounded-xl bg-surface border border-layer-line text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = newPrecautionText.trim();
                        if (!trimmed) return;
                        const newId = `custom_prec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                        const newItem: CustomPrecautionItem = {
                          id: newId,
                          labelAr: trimmed,
                          labelEn: trimmed,
                          createdAt: new Date().toISOString(),
                        };
                        const currCustom = formData.customPrecautions || [];
                        const currSelected = formData.structuredPrecautions || [];
                        setFormData({
                          ...formData,
                          customPrecautions: [...currCustom, newItem],
                          structuredPrecautions: [...currSelected, newId],
                        });
                        setNewPrecautionText('');
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shrink-0"
                    >
                      <Plus className="size-3.5" />
                      <span>{bi('إضافة', 'Add')}</span>
                    </button>
                  </div>

                  {(formData.dismissedPrecautionIds || []).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, dismissedPrecautionIds: [] })}
                      className="text-xs text-rose-700 dark:text-rose-400 hover:underline font-semibold block pt-1 cursor-pointer"
                    >
                      {bi('استعادة المحاذير الافتراضية المحذوفة', 'Restore default precautions')}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="patient-psychosocial" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('العوامل النفسية الاجتماعية والبيئية', 'Psychosocial Factors & Yellow Flags')}
                </label>
                <AutoResizeTextarea
                  id="patient-psychosocial"
                  minRows={2}
                  value={formData.psychosocialFactors || ''}
                  onChange={(e) => setFormData({ ...formData, psychosocialFactors: e.target.value })}
                  placeholder={bi('مستوى الدافعية، مخاوف الحركة، الدعم الأسري...', 'Motivation, kinesiophobia, family support...')}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label htmlFor="patient-general-notes" className="block text-xs font-semibold text-foreground mb-1">
                  {bi('ملاحظات عامة للمعالج', 'General Clinical Notes')}
                </label>
                <AutoResizeTextarea
                  id="patient-general-notes"
                  minRows={2}
                  value={formData.generalNotes || ''}
                  onChange={(e) => setFormData({ ...formData, generalNotes: e.target.value })}
                  placeholder={bi('أي توجيهات أو ملاحظات إضافية...', 'Additional clinical notes...')}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </details>
          </div>

          {/* Sticky Sheet Footer Controls */}
          <div className="px-5 py-3.5 border-t border-card-divider bg-muted/40 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover rounded-xl transition-colors cursor-pointer"
            >
              {bi('إلغاء', 'Cancel')}
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold rounded-xl transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? bi('جاري التشفير والحفظ...', 'Encrypting & Saving...') : bi('حفظ بيانات المريض', 'Save Patient Record')}</span>
            </button>
          </div>
        </form>
    </DrawerDialog>
  );
};
