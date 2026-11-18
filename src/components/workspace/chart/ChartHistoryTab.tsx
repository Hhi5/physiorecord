import React, { Suspense, lazy, useState } from 'react';
import { Plus, Save, Send, Trash2, UserCheck } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import type {
  CustomPrecautionItem,
  EpisodeRecord,
  PatientDocumentAttachment,
  PatientRecord,
  PatientRedFlagChecklistItem,
  StructuredPrecautionId,
} from '../../../types/clinical';
import type { ReferralSourceType, ReferringDoctorEntry } from '../../../types/clinicManagement';
import {
  REFERRAL_SOURCE_LABELS,
  REFERRAL_SOURCE_TYPES,
  resolveDoctorDisplayName,
  resolveDoctorFacility,
} from '../../../utils/iraqReferralsRetentionC6C7';
import { STRUCTURED_PRECAUTIONS_CATALOG } from '../../../utils/modalitySafetyChecker';
import { AutoResizeTextarea, PhoneInput } from '../../ui/Primitives';
import { RedFlagChecklistPanel } from '../RedFlagChecklistPanel';

const OrganMedicationSchedule = lazy(() =>
  import('../../organui/OrganMedicationSchedule').then((m) => ({
    default: m.OrganMedicationSchedule,
  }))
);
const PatientImagingReportsPanel = lazy(() =>
  import('../PatientImagingReportsPanel').then((m) => ({
    default: m.PatientImagingReportsPanel,
  }))
);
const PatientAttachmentsPanel = lazy(() =>
  import('../../clinic/PatientAttachmentsPanel').then((m) => ({
    default: m.PatientAttachmentsPanel,
  }))
);

export interface ChartHistoryTabProps {
  patient: PatientRecord;
  activeEpisode: EpisodeRecord | null;
  enableReferralsModule: boolean;
  referringDoctors: ReferringDoctorEntry[];
  referralSourceType: ReferralSourceType | '';
  setReferralSourceType: (v: ReferralSourceType | '') => void;
  referringDoctorId: string;
  setReferringDoctorId: (v: string) => void;
  referralNotes: string;
  setReferralNotes: (v: string) => void;
  referringPhysician: string;
  setReferringPhysician: (v: string) => void;
  referringClinic: string;
  setReferringClinic: (v: string) => void;
  emergencyContactName: string;
  setEmergencyContactName: (v: string) => void;
  emergencyContactPhone: string;
  setEmergencyContactPhone: (v: string) => void;
  contraindications: string;
  setContraindications: (v: string) => void;
  structuredPrecautions: StructuredPrecautionId[];
  setStructuredPrecautions: React.Dispatch<React.SetStateAction<StructuredPrecautionId[]>>;
  customPrecautions: CustomPrecautionItem[];
  setCustomPrecautions: React.Dispatch<React.SetStateAction<CustomPrecautionItem[]>>;
  dismissedPrecautionIds: string[];
  setDismissedPrecautionIds: React.Dispatch<React.SetStateAction<string[]>>;
  redFlags: string;
  setRedFlags: (v: string) => void;
  redFlagChecklist: PatientRedFlagChecklistItem[];
  setRedFlagChecklist: (list: PatientRedFlagChecklistItem[]) => void;
  dismissedRedFlagIds: string[];
  setDismissedRedFlagIds: (ids: string[]) => void;
  currentMedications: string;
  setCurrentMedications: (v: string) => void;
  medicalHistory: string;
  setMedicalHistory: (v: string) => void;
  previousSurgeries: string;
  setPreviousSurgeries: (v: string) => void;
  attachments: PatientDocumentAttachment[];
  onPersistAttachments: (next: PatientDocumentAttachment[]) => Promise<void>;
  onOpenReportBackModal: () => void;
  onSaveMasterAndEpisode: () => void;
  isSaving: boolean;
  saveSuccess: boolean;
}

export const ChartHistoryTab: React.FC<ChartHistoryTabProps> = ({
  patient,
  activeEpisode,
  enableReferralsModule,
  referringDoctors,
  referralSourceType,
  setReferralSourceType,
  referringDoctorId,
  setReferringDoctorId,
  referralNotes,
  setReferralNotes,
  referringPhysician,
  setReferringPhysician,
  referringClinic,
  setReferringClinic,
  emergencyContactName,
  setEmergencyContactName,
  emergencyContactPhone,
  setEmergencyContactPhone,
  contraindications,
  setContraindications,
  structuredPrecautions,
  setStructuredPrecautions,
  customPrecautions,
  setCustomPrecautions,
  dismissedPrecautionIds,
  setDismissedPrecautionIds,
  redFlags,
  setRedFlags,
  redFlagChecklist,
  setRedFlagChecklist,
  dismissedRedFlagIds,
  setDismissedRedFlagIds,
  currentMedications,
  setCurrentMedications,
  medicalHistory,
  setMedicalHistory,
  previousSurgeries,
  setPreviousSurgeries,
  attachments,
  onPersistAttachments,
  onOpenReportBackModal,
  onSaveMasterAndEpisode,
  isSaving,
  saveSuccess,
}) => {
  const { language, bi } = useLanguage();
  const isRtlLang = language !== 'en';
  const [newPrecautionText, setNewPrecautionText] = useState('');

  const addCustomPrecaution = () => {
    const trimmed = newPrecautionText.trim();
    if (!trimmed) return;
    const newId = `custom_prec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setCustomPrecautions((prev) => [
      ...prev,
      { id: newId, labelAr: trimmed, labelEn: trimmed, createdAt: new Date().toISOString() },
    ]);
    setStructuredPrecautions((prev) => [...prev, newId]);
    setNewPrecautionText('');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Referral Physician & Emergency Contact Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-bold text-primary">
            <UserCheck className="size-4" />
            <span>
              {bi(
                'الطبيب المحيل وجهات الاتصال للطوارئ',
                'Referring Physician & Emergency Contact',
                'پزیشکی ڕەوانەکار و پەیوەندیی فریاگوزاری'
              )}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {enableReferralsModule && (
              <button
                type="button"
                onClick={onOpenReportBackModal}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-layer border border-layer-line hover:bg-layer-hover text-foreground text-xs font-semibold cursor-pointer"
              >
                <Send className="size-3.5 text-primary" />
                <span>{bi('إعداد تقرير للطبيب المحيل', 'Report Back to Doctor', 'ئامادەکردنی ڕاپۆرت بۆ پزیشکی ڕەوانەکار')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onSaveMasterAndEpisode}
              disabled={isSaving}
              className={`min-h-[36px] py-1.5 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
                saveSuccess
                  ? 'bg-emerald-700 text-white'
                  : 'bg-primary hover:bg-primary-hover text-primary-foreground'
              }`}
            >
              <Save className="size-3.5" />
              <span>
                {isSaving
                  ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                  : saveSuccess
                  ? bi('تم حفظ الملف', 'Saved', 'پاشەکەوتکرا')
                  : bi('حفظ بيانات الملف', 'Save Profile', 'پاشەکەوتکردن')}
              </span>
            </button>
          </div>
        </div>

        {enableReferralsModule && (
          <div className="p-3.5 rounded-xl bg-surface/60 border border-card-line grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label htmlFor="profile-referral-source" className="text-xs font-semibold text-foreground block mb-1.5">
                {bi('مصدر الإحالة:', 'Referral Source:', 'سەرچاوەی ڕەوانەکردن:')}
              </label>
              <select
                id="profile-referral-source"
                value={referralSourceType}
                onChange={(e) => setReferralSourceType((e.target.value as ReferralSourceType) || '')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
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
                  if (doc) {
                    setReferringPhysician(resolveDoctorDisplayName(doc, isRtlLang));
                    const docFacility = resolveDoctorFacility(doc, isRtlLang);
                    if (docFacility) setReferringClinic(docFacility);
                    if (!referralSourceType) setReferralSourceType('doctor');
                  }
                }}
                className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
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
                className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label htmlFor="profile-referring-physician" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('الطبيب الاستشاري المحيل:', 'Referring Physician:', 'پزیشکی ڕاوێژکاری ڕەوانەکار:')}
            </label>
            <input
              id="profile-referring-physician"
              type="text"
              value={referringPhysician}
              onChange={(e) => setReferringPhysician(e.target.value)}
              placeholder={bi('مثال: د. حيدر العبيدي (جراحة عظام)', 'e.g., Dr. Haider Al-Obaidi', 'نموونە: د. حەیدەر عوبەیدی (نەشتەرگەری ئێسک)')}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
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
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label htmlFor="profile-emergency-name" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('اسم قريب الطوارئ وصلة القرابة:', 'Emergency Contact & Relation:', 'ناوی خزمی فریاگوزاری و پەیوەندی:')}
            </label>
            <input
              id="profile-emergency-name"
              type="text"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              placeholder={bi('مثال: محمد عبد الله (الأخ)', 'Name & Relationship', 'ناو و پەیوەندیی خزمایەتی')}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
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

          <div className="sm:col-span-2">
            <label htmlFor="profile-contraindications" className="text-xs font-semibold text-rose-700 dark:text-rose-400 block mb-1.5">
              {bi(
                'موانع الاستعمال والمحاذير الطبية:',
                'Contraindications & Precautions:',
                'قەدەغەکراوە پزیشکییەکان و ئاگادارییەکان:'
              )}
            </label>
            <AutoResizeTextarea
              id="profile-contraindications"
              minRows={2}
              value={contraindications}
              onChange={(e) => setContraindications(e.target.value)}
              placeholder={bi(
                'مثال: منظم ضربات قلب (يمنع TENS/Diathermy)، تثبيت فقرات، هشاشة عظام...',
                'e.g., Pacemaker, recent DVT, weight-bearing restriction...',
                'نموونە: ڕێکخەری لێدانی دڵ (TENS قەدەغەیە)، جێگیرکردنی بڕبڕە، پووکانەوەی ئێسک...'
              )}
              className="w-full px-3 py-2 text-xs rounded-xl bg-rose-500/10 border border-rose-500/30 text-foreground focus:outline-none"
            />
            <div className="mt-2.5 pt-2.5 border-t border-rose-500/20 space-y-2">
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 block">
                {bi(
                  'المحاذير السريرية المهيكلة (لتنبيهات سلامة الأجهزة):',
                  'Structured Clinical Precautions (Modality Safety Alerts):',
                  'ئاگادارییە کلینیکییە ڕێکخراوەکان (بۆ سەلامەتی ئامێرەکان):'
                )}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {STRUCTURED_PRECAUTIONS_CATALOG.filter(
                  (item) => !dismissedPrecautionIds.includes(item.id)
                ).map((item) => {
                  const checked = structuredPrecautions.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      data-testid={`chart-precaution-${item.id}`}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        checked
                          ? 'bg-rose-500/20 border-rose-500 text-rose-800 dark:text-rose-200 font-bold'
                          : 'bg-surface/70 border-layer-line text-foreground hover:bg-muted/40'
                      }`}
                    >
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setStructuredPrecautions((prev) =>
                              prev.includes(item.id)
                                ? prev.filter((id) => id !== item.id)
                                : [...prev, item.id]
                            )
                          }
                          className="size-3.5 accent-rose-600 rounded shrink-0"
                        />
                        <span className="truncate">
                          {bi(item.labelAr, item.labelEn, item.labelCkb)}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setDismissedPrecautionIds((prev) => [...prev, item.id]);
                          setStructuredPrecautions((prev) => prev.filter((id) => id !== item.id));
                        }}
                        title={bi('حذف هذا المحذور', 'Delete this precaution', 'سڕینەوەی ئەم ئاگادارییە')}
                        className="p-1 text-muted-foreground-2 hover:text-rose-600 rounded transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  );
                })}

                {customPrecautions.map((item) => {
                  const checked = structuredPrecautions.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      data-testid={`chart-precaution-${item.id}`}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        checked
                          ? 'bg-rose-500/20 border-rose-500 text-rose-800 dark:text-rose-200 font-bold'
                          : 'bg-surface/70 border-layer-line text-foreground hover:bg-muted/40'
                      }`}
                    >
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setStructuredPrecautions((prev) =>
                              prev.includes(item.id)
                                ? prev.filter((id) => id !== item.id)
                                : [...prev, item.id]
                            )
                          }
                          className="size-3.5 accent-rose-600 rounded shrink-0"
                        />
                        <span className="truncate">
                          {bi(item.labelAr, item.labelEn || item.labelAr, item.labelCkb || item.labelAr)}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomPrecautions((prev) => prev.filter((p) => p.id !== item.id));
                          setStructuredPrecautions((prev) => prev.filter((id) => id !== item.id));
                        }}
                        title={bi('حذف هذا المحذور المخصص', 'Delete this custom precaution', 'سڕینەوەی ئەم ئاگادارییە')}
                        className="p-1 text-muted-foreground-2 hover:text-rose-600 rounded transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newPrecautionText}
                  onChange={(e) => setNewPrecautionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomPrecaution();
                    }
                  }}
                  placeholder={bi(
                    'إضافة محذور سريري مخصص جديد...',
                    'Add new custom clinical precaution...',
                    'زیادکردنی ئاگاداری کلینیکی نوێ...'
                  )}
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-card border border-layer-line text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:border-rose-500"
                />
                <button
                  type="button"
                  onClick={addCustomPrecaution}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="size-3.5" />
                  <span>{bi('إضافة', 'Add', 'زیادکردن')}</span>
                </button>
              </div>

              {dismissedPrecautionIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDismissedPrecautionIds([])}
                  className="text-xs text-rose-700 dark:text-rose-400 hover:underline font-semibold block pt-1 cursor-pointer"
                >
                  {bi('استعادة المحاذير الافتراضية المحذوفة', 'Restore default precautions', 'گەڕاندنەوەی ئاگادارییە سەرەتاییەکان')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Red Flags Alert Box & Structured Screening Checklist (3.4) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
        <RedFlagChecklistPanel
          checklist={redFlagChecklist}
          onChange={setRedFlagChecklist}
          redFlagsText={redFlags}
          onRedFlagsTextChange={setRedFlags}
          dismissedItemIds={dismissedRedFlagIds}
          onDismissedItemIdsChange={setDismissedRedFlagIds}
        />
      </div>

      {/* Patient Medication Schedule */}
      <Suspense fallback={null}>
        <OrganMedicationSchedule
          patientId={patient.id}
          currentMedicationsText={currentMedications}
          onUpdateMedicationsText={(summary) => setCurrentMedications(summary)}
        />
      </Suspense>

      {/* Medical History & Surgeries */}
      <div className="p-5 sm:p-6 rounded-2xl bg-card border border-card-line shadow-2xs space-y-4">
        <h2 className="text-xs font-bold text-primary uppercase tracking-wider">
          {bi(
            'التاريخ المرضي والعمليات الجراحية والحساسية:',
            'Medical History, Surgeries & Allergies:',
            'مێژووی نەخۆشی، نەشتەرگەرییەکان و هەستیاری:'
          )}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="profile-medical-history" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('الأمراض المزمنة والتاريخ المرضي:', 'Medical History:', 'نەخۆشییە درێژخایەنەکان و مێژووی نەخۆشی:')}
            </label>
            <AutoResizeTextarea
              id="profile-medical-history"
              minRows={3}
              value={medicalHistory}
              onChange={(e) => setMedicalHistory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="profile-previous-surgeries" className="text-xs font-semibold text-foreground block mb-1.5">
              {bi('العمليات الجراحية السابقة:', 'Previous Surgeries:', 'نەشتەرگەرییەکانی پێشوو:')}
            </label>
            <AutoResizeTextarea
              id="profile-previous-surgeries"
              minRows={3}
              value={previousSurgeries}
              onChange={(e) => setPreviousSurgeries(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onSaveMasterAndEpisode}
            disabled={isSaving}
            className={`min-h-[36px] py-1.5 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
              saveSuccess
                ? 'bg-emerald-700 text-white'
                : 'bg-primary hover:bg-primary-hover text-primary-foreground'
            }`}
          >
            <Save className="size-3.5" />
            <span>
              {isSaving
                ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                : saveSuccess
                ? bi('تم الحفظ', 'Saved', 'پاشەکەوتکرا')
                : bi('حفظ التغييرات', 'Save Changes', 'پاشەکەوتکردن')}
            </span>
          </button>
        </div>
      </div>

      {/* Clinical Attachments & Imaging Reports */}
      <Suspense fallback={null}>
        <PatientImagingReportsPanel
          patientId={patient.id}
          episodeId={activeEpisode?.id}
          attachments={attachments}
          onPersistAttachments={onPersistAttachments}
        />
        <PatientAttachmentsPanel patientId={patient.id} episodeId={activeEpisode?.id} />
      </Suspense>
    </div>
  );
};
