import React, { Suspense, lazy, useState } from 'react';
import { AlertTriangle, Plus, Save, ShieldAlert, Trash2 } from 'lucide-react';
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
import { STRUCTURED_PRECAUTIONS_CATALOG } from '../../../utils/modalitySafetyChecker';
import { AutoResizeTextarea } from '../../ui/Primitives';
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
  onOpenReportBackModal?: () => void;
  onSaveMasterAndEpisode: () => void;
  isSaving: boolean;
  saveSuccess: boolean;
}

export const ChartHistoryTab: React.FC<ChartHistoryTabProps> = ({
  patient,
  activeEpisode,
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
  onSaveMasterAndEpisode,
  isSaving,
  saveSuccess,
}) => {
  const { bi } = useLanguage();
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
    <div className="max-w-5xl mx-auto space-y-4">
      {/* 1. Clinical Safety, Contraindications & Structured Precautions (Zero Red/Amber Boxes) */}
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.045] dark:border-white/[0.06] pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-rose-700 dark:text-rose-400 shrink-0" />
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'السلامة السريرية، موانع الاستعمال، والمحاذير الطبية',
                'Clinical Safety, Contraindications & Precautions',
                'سەلامەتی کلینیکی، قەدەغەکراوەکان و ئاگادارییەکان'
              )}
            </h2>
          </div>

          <button
            type="button"
            onClick={onSaveMasterAndEpisode}
            disabled={isSaving}
            className={`compact-btn h-8 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
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
                : bi('حفظ', 'Save', 'پاشەکەوتکردن')}
            </span>
          </button>
        </div>

        {/* Contraindications Free-Text (Red Label Text, Neutral Surface Input) */}
        <div>
          <label
            htmlFor="profile-contraindications"
            className="text-xs font-bold text-rose-700 dark:text-rose-400 block mb-1.5"
          >
            {bi(
              'موانع الاستعمال والمحاذير الطبية الحرجة:',
              'Contraindications & Critical Warnings:',
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
            className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>

        {/* Structured Clinical Precautions (Orange Text for Cautions, Solid Primary or Distinct Surface for Checked) */}
        <div className="pt-3 border-t border-black/[0.045] dark:border-white/[0.06] space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600 dark:text-orange-400">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>
              {bi(
                'المحاذير السريرية المهيكلة (لتنبيهات سلامة الأجهزة):',
                'Structured Clinical Precautions (Modality Safety Alerts):',
                'ئاگادارییە کلینیکییە ڕێکخراوەکان (بۆ سەلامەتی ئامێرەکان):'
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {STRUCTURED_PRECAUTIONS_CATALOG.filter(
              (item) => !dismissedPrecautionIds.includes(item.id)
            ).map((item) => {
              const checked = structuredPrecautions.includes(item.id);
              return (
                <div
                  key={item.id}
                  data-testid={`chart-precaution-${item.id}`}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${
                    checked
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'bg-surface/70 text-foreground hover:bg-surface'
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
                      className="size-3.5 accent-primary rounded shrink-0"
                    />
                    <span className="leading-snug">
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
                    className={`p-1 rounded transition-colors shrink-0 cursor-pointer ${
                      checked
                        ? 'text-primary-foreground/80 hover:text-primary-foreground'
                        : 'text-muted-foreground-2 hover:text-rose-600'
                    }`}
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
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${
                    checked
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'bg-surface/70 text-foreground hover:bg-surface'
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
                      className="size-3.5 accent-primary rounded shrink-0"
                    />
                    <span className="leading-snug">
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
                    className={`p-1 rounded transition-colors shrink-0 cursor-pointer ${
                      checked
                        ? 'text-primary-foreground/80 hover:text-primary-foreground'
                        : 'text-muted-foreground-2 hover:text-rose-600'
                    }`}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1 min-w-0">
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
              className="flex-1 min-w-0 w-0 px-3 py-1.5 text-xs rounded-xl bg-surface/80 text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
            <button
              type="button"
              onClick={addCustomPrecaution}
              className="compact-btn h-9 inline-flex items-center gap-1 px-3 rounded-xl text-xs font-bold bg-surface/90 hover:bg-surface text-orange-600 dark:text-orange-400 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Plus className="size-3.5" />
              <span>{bi('إضافة', 'Add', 'زیادکردن')}</span>
            </button>
          </div>

          {dismissedPrecautionIds.length > 0 && (
            <button
              type="button"
              onClick={() => setDismissedPrecautionIds([])}
              className="text-xs text-primary hover:underline font-semibold block pt-1 cursor-pointer"
            >
              {bi('استعادة المحاذير الافتراضية المحذوفة', 'Restore default precautions', 'گەڕاندنەوەی ئاگادارییە سەرەتاییەکان')}
            </button>
          )}
        </div>
      </div>

      {/* 2. Red Flags Screening Checklist (Clean Neutral Surface — Zero Amber Box) */}
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-3">
        <RedFlagChecklistPanel
          checklist={redFlagChecklist}
          onChange={setRedFlagChecklist}
          redFlagsText={redFlags}
          onRedFlagsTextChange={setRedFlags}
          dismissedItemIds={dismissedRedFlagIds}
          onDismissedItemIdsChange={setDismissedRedFlagIds}
        />
      </div>

      {/* 3. Chronic Medical History & Previous Surgeries */}
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-4">
        <div className="flex items-center justify-between border-b border-black/[0.045] dark:border-white/[0.06] pb-3">
          <h2 className="text-sm font-bold text-foreground">
            {bi(
              'التاريخ المرضي والعمليات الجراحية السابقة',
              'Chronic Medical History & Previous Surgeries',
              'مێژووی نەخۆشی و نەشتەرگەرییەکانی پێشوو'
            )}
          </h2>
        </div>

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
              className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
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
              className="w-full px-3 py-2 text-xs rounded-xl bg-surface/80 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>
      </div>

      {/* 4. Patient Medication Schedule */}
      <Suspense fallback={null}>
        <OrganMedicationSchedule
          patientId={patient.id}
          currentMedicationsText={currentMedications}
          onUpdateMedicationsText={(summary) => setCurrentMedications(summary)}
        />
      </Suspense>

      {/* 5. Clinical Attachments, Posture Studio & Diagnostic Imaging Reports */}
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
