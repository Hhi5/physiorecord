// =======================================================================
// PhysioRecord — Patient Creation & Editing Modal
// =======================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { usePatients } from '../context/PatientContext';
import { useLanguage } from '../context/LanguageContext';
import type {
  PatientClinicalData,
  PatientRecord,
  Gender,
  DominantHand,
  StructuredPrecautionId,
} from '../types/clinical';
import type {
  ReferralSourceType,
  ReferringDoctorEntry,
} from '../types/clinicManagement';
import {
  computePatientAge,
  formatIraqiPhoneDisplay,
  normalizeIraqiPhoneStorage,
} from '../utils/date';
import { AutoResizeTextarea, DatePickerInput, PhoneInput } from './ui/Primitives';
import { DrawerDialog } from './ui/Dialog';
import { RedFlagChecklistPanel } from './workspace/RedFlagChecklistPanel';
import {
  getPatientDisplayName,
  getPatientMrn,
  hasPatientRedFlagsOrContraindications,
} from '../utils/mrn';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import { STRUCTURED_PRECAUTIONS_CATALOG } from '../utils/modalitySafetyChecker';
import {
  detectPatientDuplicates,
  type DuplicatePatientMatch,
} from '../utils/dataQualityPhaseD';
import {
  searchBilingualGlossary,
  type BilingualGlossaryEntry,
} from '../data/terminology';
import {
  REFERRAL_SOURCE_LABELS,
  REFERRAL_SOURCE_TYPES,
  resolveDoctorDisplayName,
  resolveDoctorFacility,
  resolveDoctorSpecialty,
} from '../utils/iraqReferralsRetentionC6C7';
import { 
  X, 
  Save, 
  AlertTriangle, 
  User, 
  FileText, 
  ShieldAlert,
  ChevronDown,
  GitMerge,
  ExternalLink,
  BookOpen,
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
  const isRtlLang = language !== 'en';
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
      });
    }
    setError(null);
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, patientToEditId]);

  // Calculate age automatically when DOB changes
  const handleDobChange = (dob: string) => {
    const calculatedAge = computePatientAge(dob, undefined);
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

    if (!formData.fullNameAr?.trim()) {
      const msg = t('errArabicNameRequired');
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
      const cleanArName = formData.fullNameAr.trim();
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
      ariaLabel={
        patientToEdit ? bi('تعديل ملف المريض', 'Edit Patient') : bi('تسجيل مريض جديد', 'New Patient')
      }
      closeLabel={bi('إغلاق', 'Close')}
      bodyClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
    >
        {/* Sheet Header */}
        <div className="px-5 py-4 border-b border-card-divider flex items-center justify-between bg-muted/40 shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">
              {patientToEdit ? bi('تعديل ملف المريض', 'Edit Patient') : bi('تسجيل مريض جديد', 'New Patient')}
            </h2>
            <p className="text-xs text-muted-foreground-1">
              {bi('أدخل البيانات الأساسية أولاً، والتفاصيل السريرية اختيارية', 'Enter essential details first; clinical history is optional')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={bi('إغلاق', 'Close')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sheet Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Minimal First Step: Arabic Name, Phone, Sex, Age or DOB */}
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {bi('اسم المريض الثلاثي بالعربية', 'Patient Arabic Full Name')} <span className="text-rose-500">*</span>
              </label>
              <input
                ref={arabicNameInputRef}
                type="text"
                value={formData.fullNameAr || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, fullNameAr: val });
                  if (val.trim() && fieldErrors.fullNameAr) {
                    setFieldErrors({});
                    setError(null);
                  }
                }}
                aria-invalid={Boolean(fieldErrors.fullNameAr)}
                placeholder="مثال: أحمد فهد الشمري"
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
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {bi('رقم الهاتف العراقي', 'Iraqi Phone Number')}
                </label>
                <PhoneInput
                  value={formData.phoneNumber || ''}
                  onChange={(val) => setFormData({ ...formData, phoneNumber: val })}
                  placeholder="0770 123 4567"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {bi('الجنس', 'Gender')}
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value as Gender })}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="male">{bi('ذكر', 'Male')}</option>
                  <option value="female">{bi('أنثى', 'Female')}</option>
                  <option value="other">{bi('أخرى', 'Other')}</option>
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
                  className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-950 dark:text-amber-100 space-y-2.5"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        {bi(
                          'تنبيه تطابق محتمل: يوجد ملف مريض مشابه مسجّل مسبقاً',
                          'Potential Duplicate Patient Detected'
                        )}
                      </div>
                      <div className="text-xs flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="font-bold text-foreground">
                          {getPatientDisplayName(topMatch.patient.data, language)}
                        </span>
                        <bdi dir="ltr" className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface/80 border border-amber-500/30">
                          {getPatientMrn(topMatch.patient)}
                        </bdi>
                        <bdi dir="ltr" className="tabular-nums text-muted-foreground-1">
                          {matchPhone}
                        </bdi>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-xs font-semibold text-amber-800 dark:text-amber-200">
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
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {bi('العمر (سنوات)', 'Age (Years)')}
                </label>
                <input
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
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {bi('أو تاريخ الميلاد', 'Or Date of Birth')}
                </label>
                <DatePickerInput
                  value={formData.dateOfBirth || ''}
                  onChange={(dob) => handleDobChange(dob)}
                />
              </div>
            </div>

            {isPediatricMinor && (
              <div
                data-testid="pediatric-guardian-section"
                className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 space-y-2.5"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-200">
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
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      {bi('اسم ولي الأمر الكامل *', 'Guardian Full Name *')}
                    </label>
                    <input
                      type="text"
                      data-testid="pediatric-guardian-name-input"
                      value={formData.guardianName || ''}
                      onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                      placeholder={bi('مثال: محمد حسن الجبوري', 'e.g., Mohammed Hassan')}
                      className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-foreground text-xs focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div data-testid="pediatric-guardian-phone-wrap">
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      {bi('هاتف ولي الأمر *', 'Guardian Phone *')}
                    </label>
                    <PhoneInput
                      value={formData.guardianPhone || ''}
                      onChange={(val) => setFormData({ ...formData, guardianPhone: val })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      {bi('صلة القرابة', 'Guardian Relation')}
                    </label>
                    <select
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

              <div className="flex flex-wrap gap-1.5">
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
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-layer border-layer-line text-foreground hover:bg-layer-hover'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground-1 mb-1">
                    {bi('اختيار طبيب محيل من الدليل', 'Select Referring Doctor from Directory')}
                  </label>
                  <select
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
                      <label className="block text-xs font-medium text-muted-foreground-1 mb-1">
                        {bi('اسم الطبيب المحيل', 'Referring Physician Name')}
                      </label>
                      <input
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
                      <label className="block text-xs font-medium text-muted-foreground-1 mb-1">
                        {bi('المستشفى / المركز المحيل', 'Referring Hospital / Clinic')}
                      </label>
                      <input
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
                  <label className="block text-xs font-medium text-muted-foreground-1 mb-1">
                    {bi('ملاحظات الإحالة', 'Referral Notes')}
                  </label>
                  <input
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
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {bi('الاسم بالإنجليزية (اختياري)', 'Full Name in English (Optional)')}
                </label>
                <input
                  type="text"
                  value={formData.fullName || ''}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="e.g., Ahmed Fahad Al-Shammari"
                  className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary text-left font-sans"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {bi('المهنة ونمط العمل', 'Occupation')}
                  </label>
                  <input
                    type="text"
                    value={formData.occupation || ''}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    placeholder={bi('مثال: مهندس، معلم', 'e.g., Engineer, Teacher')}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {bi('اليد المهيمنة', 'Dominant Hand')}
                  </label>
                  <select
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
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {bi('عنوان السكن (المحافظة والمنطقة)', 'Residential Address')}
                </label>
                <input
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
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {glossarySuggestions.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      data-testid={`glossary-suggestion-${entry.id}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectGlossarySuggestion(entry)}
                      className="text-start px-2.5 py-1.5 rounded-lg bg-layer hover:bg-primary/10 border border-layer-line hover:border-primary/40 text-xs text-foreground transition-colors cursor-pointer"
                    >
                      <span className="font-semibold">{entry.ar}</span>
                      <span className="text-muted-foreground-1"> · {entry.en}</span>
                    </button>
                  ))}
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
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {bi('التاريخ المرضي العام وطبيعة الشكوى الحالية', 'General Medical History & Chief Complaint')}
                </label>
                <AutoResizeTextarea
                  minRows={2}
                  value={formData.medicalHistory || ''}
                  onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
                  placeholder={bi('وصف الإصابة، آلية الحدوث، التاريخ الزمني...', 'Injury mechanism, onset, initial diagnosis...')}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {bi('العمليات الجراحية السابقة', 'Previous Surgeries')}
                  </label>
                  <AutoResizeTextarea
                    minRows={2}
                    value={formData.previousSurgeries || ''}
                    onChange={(e) => setFormData({ ...formData, previousSurgeries: e.target.value })}
                    placeholder={bi('أي جراحات سابقة مع تواريخها...', 'Prior surgeries and dates...')}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {bi('الأدوية الحالية المستمرة', 'Current Medications')}
                  </label>
                  <AutoResizeTextarea
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
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {bi('الحساسية المعروفة', 'Known Allergies')}
                  </label>
                  <input
                    type="text"
                    value={formData.allergies || ''}
                    onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                    placeholder={bi('حساسية دوائية، لاصقات طبية...', 'Drug allergies, tape, latex...')}
                    className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1">
                    {bi('الأمراض المصاحبة', 'Comorbidities')}
                  </label>
                  <input
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
          <details className="group rounded-xl border border-rose-500/30 bg-rose-500/5 overflow-hidden">
            <summary className="px-4 py-3 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center justify-between cursor-pointer select-none hover:bg-rose-500/10">
              <span className="inline-flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>{bi('الأعلام الحمراء والمحاذير السريرية', 'Red flags & contraindications')}</span>
                {hasPatientRedFlagsOrContraindications(formData) && (
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                )}
              </span>
              <ChevronDown className="w-4 h-4 text-rose-600 dark:text-rose-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="p-4 pt-2 border-t border-rose-500/20 space-y-3">
              <RedFlagChecklistPanel
                checklist={formData.redFlagChecklist}
                onChange={(next) => setFormData({ ...formData, redFlagChecklist: next })}
                redFlagsText={formData.redFlags || ''}
                onRedFlagsTextChange={(val) => setFormData({ ...formData, redFlags: val })}
              />

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {bi('المحاذير وموانع العلاج أثناء التأهيل', 'Clinical Precautions & Contraindications')}
                </label>
                <AutoResizeTextarea
                  minRows={2}
                  value={formData.precautions || ''}
                  onChange={(e) => setFormData({ ...formData, precautions: e.target.value })}
                  placeholder={bi('مثال: قيود تحميل الوزن، محاذير التواء الكتف...', 'e.g., Weight-bearing restrictions, post-op precautions...')}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                />
                <div className="mt-2 pt-2 border-t border-rose-500/20">
                  <span className="block text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1.5">
                    {bi(
                      'المحاذير السريرية المهيكلة (لتنبيهات سلامة الأجهزة):',
                      'Structured Precautions (Modality Safety Alerts):'
                    )}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {STRUCTURED_PRECAUTIONS_CATALOG.map((item) => {
                      const selected = (formData.structuredPrecautions || []).includes(item.id);
                      return (
                        <label
                          key={item.id}
                          data-testid={`modal-precaution-${item.id}`}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            selected
                              ? 'bg-rose-500/15 border-rose-500 text-rose-800 dark:text-rose-200 font-bold'
                              : 'bg-surface border-layer-line text-foreground hover:bg-muted/40'
                          }`}
                        >
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
                            className="size-3.5 accent-rose-600 rounded"
                          />
                          <span>{bi(item.labelAr, item.labelEn, item.labelCkb)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {bi('العوامل النفسية الاجتماعية والبيئية', 'Psychosocial Factors & Yellow Flags')}
                </label>
                <AutoResizeTextarea
                  minRows={2}
                  value={formData.psychosocialFactors || ''}
                  onChange={(e) => setFormData({ ...formData, psychosocialFactors: e.target.value })}
                  placeholder={bi('مستوى الدافعية، مخاوف الحركة، الدعم الأسري...', 'Motivation, kinesiophobia, family support...')}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {bi('ملاحظات عامة للمعالج', 'General Clinical Notes')}
                </label>
                <AutoResizeTextarea
                  minRows={2}
                  value={formData.generalNotes || ''}
                  onChange={(e) => setFormData({ ...formData, generalNotes: e.target.value })}
                  placeholder={bi('أي توجيهات أو ملاحظات إضافية...', 'Additional clinical notes...')}
                  className="w-full px-3.5 py-2 rounded-lg bg-surface border border-layer-line text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </details>

          {/* Sheet Footer Controls */}
          <div className="pt-4 border-t border-card-divider flex items-center justify-between">
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
