import React, { Suspense, lazy } from 'react';
import { Award, Target } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import { ClinicOperationsService } from '../../../services/clinicOperationsService';
import type {
  EpisodeRecord,
  MmtAssessmentBatteryData,
  NeuroScreeningBatteryData,
  PatientRecord,
  RomAssessmentBatteryData,
  SessionRecord,
  SoapNoteRecord,
} from '../../../types/clinical';
import type {
  EpisodeScopedClinicalStore,
  ReferringDoctorEntry,
} from '../../../types/clinicManagement';
import type { FunctionalScaleEntry, OrthopedicSpecialTestItem } from '../../../types/clinicalWidgets';
import type { PrintableDocumentType } from '../../print/PrintDocumentModal';
import { ModalDialog } from '../../ui/Dialog';

const ExamWidgetShelf = lazy(() =>
  import('../ExamWidgetShelf').then((m) => ({ default: m.ExamWidgetShelf }))
);
const CustomWidgetStudioModal = lazy(() =>
  import('../CustomWidgetStudioModal').then((m) => ({
    default: m.CustomWidgetStudioModal,
  }))
);
const PrintDocumentModal = lazy(() =>
  import('../../print/PrintDocumentModal').then((m) => ({
    default: m.PrintDocumentModal,
  }))
);
const RomWidget = lazy(() =>
  import('../../widgets/RomWidget').then((m) => ({ default: m.RomWidget }))
);
const MmtWidget = lazy(() =>
  import('../../widgets/MmtWidget').then((m) => ({ default: m.MmtWidget }))
);
const NeuroWidget = lazy(() =>
  import('../../widgets/NeuroWidget').then((m) => ({ default: m.NeuroWidget }))
);
const SpecialTestsWidget = lazy(() =>
  import('../../widgets/SpecialTestsWidget').then((m) => ({
    default: m.SpecialTestsWidget,
  }))
);
const FunctionalScalesWidget = lazy(() =>
  import('../../widgets/FunctionalScalesWidget').then((m) => ({
    default: m.FunctionalScalesWidget,
  }))
);
const DoctorReportBackLetterModal = lazy(() =>
  import('../../clinic/ReferralsAndRetentionPanel').then((m) => ({
    default: m.DoctorReportBackLetterModal,
  }))
);

export interface ChartModalsProps {
  patient: PatientRecord;
  patientAge: number | undefined;
  episodes: EpisodeRecord[];
  activeEpisode: EpisodeRecord | null;
  sessions: SessionRecord[];
  episodeSessions: SessionRecord[];
  episodeStore: EpisodeScopedClinicalStore;
  episodeSoaps: SoapNoteRecord[];
  allPatientSoaps: SoapNoteRecord[];
  isSaving: boolean;

  isExamShelfModalOpen: boolean;
  setIsExamShelfModalOpen: (open: boolean) => void;
  onAddWidget: (widgetId: string) => void;

  activePrintDoc: PrintableDocumentType | null;
  setActivePrintDoc: (doc: PrintableDocumentType | null) => void;

  isCustomStudioOpen: boolean;
  setIsCustomStudioOpen: (open: boolean) => void;

  isEditPersonalInfoOpen: boolean;
  setIsEditPersonalInfoOpen: (open: boolean) => void;
  editFullName: string;
  setEditFullName: (v: string) => void;
  editPhone: string;
  setEditPhone: (v: string) => void;
  editGender: 'male' | 'female' | 'other';
  setEditGender: (v: 'male' | 'female' | 'other') => void;
  editDob: string;
  setEditDob: (v: string) => void;
  editAddress: string;
  setEditAddress: (v: string) => void;
  editEmergencyName: string;
  setEditEmergencyName: (v: string) => void;
  editEmergencyPhone: string;
  setEditEmergencyPhone: (v: string) => void;
  onSavePersonalInfo: () => void;

  isEditClinicalSummaryOpen: boolean;
  setIsEditClinicalSummaryOpen: (open: boolean) => void;
  editEpisodeTitle: string;
  setEditEpisodeTitle: (v: string) => void;
  editDiagnosis: string;
  setEditDiagnosis: (v: string) => void;
  editChiefComplaint: string;
  setEditChiefComplaint: (v: string) => void;
  editClinicalImpression: string;
  setEditClinicalImpression: (v: string) => void;
  editGoals: string;
  setEditGoals: (v: string) => void;
  onSaveClinicalSummary: () => void;

  isMmtModalOpen: boolean;
  setIsMmtModalOpen: (open: boolean) => void;
  onUpdateObjectiveMmt: (mmt: MmtAssessmentBatteryData) => void;

  isRomModalOpen: boolean;
  setIsRomModalOpen: (open: boolean) => void;
  onUpdateObjectiveRom: (rom: RomAssessmentBatteryData) => void;

  isNeuroModalOpen: boolean;
  setIsNeuroModalOpen: (open: boolean) => void;
  onUpdateObjectiveNeuro: (neuro: NeuroScreeningBatteryData) => void;

  isSpecialTestsModalOpen: boolean;
  setIsSpecialTestsModalOpen: (open: boolean) => void;
  onUpdateSpecialTests: (list: OrthopedicSpecialTestItem[]) => void;
  onUpdateFunctionalScales: (scales: FunctionalScaleEntry) => void;

  onSaveMasterAndEpisode: () => void;

  isReportBackModalOpen: boolean;
  setIsReportBackModalOpen: (open: boolean) => void;
  patientWithReferralEdits: PatientRecord;
  resolvedDoctor: ReferringDoctorEntry | null;
  referringPhysician: string;
  referringClinic: string;
}

export const ChartModals: React.FC<ChartModalsProps> = ({
  patient,
  patientAge,
  episodes,
  activeEpisode,
  sessions,
  episodeSessions,
  episodeStore,
  episodeSoaps,
  allPatientSoaps,
  isSaving,
  isExamShelfModalOpen,
  setIsExamShelfModalOpen,
  onAddWidget,
  activePrintDoc,
  setActivePrintDoc,
  isCustomStudioOpen,
  setIsCustomStudioOpen,
  isEditPersonalInfoOpen,
  setIsEditPersonalInfoOpen,
  editFullName,
  setEditFullName,
  editPhone,
  setEditPhone,
  editGender,
  setEditGender,
  editDob,
  setEditDob,
  editAddress,
  setEditAddress,
  editEmergencyName,
  setEditEmergencyName,
  editEmergencyPhone,
  setEditEmergencyPhone,
  onSavePersonalInfo,
  isEditClinicalSummaryOpen,
  setIsEditClinicalSummaryOpen,
  editEpisodeTitle,
  setEditEpisodeTitle,
  editDiagnosis,
  setEditDiagnosis,
  editChiefComplaint,
  setEditChiefComplaint,
  editClinicalImpression,
  setEditClinicalImpression,
  editGoals,
  setEditGoals,
  onSaveClinicalSummary,
  isMmtModalOpen,
  setIsMmtModalOpen,
  onUpdateObjectiveMmt,
  isRomModalOpen,
  setIsRomModalOpen,
  onUpdateObjectiveRom,
  isNeuroModalOpen,
  setIsNeuroModalOpen,
  onUpdateObjectiveNeuro,
  isSpecialTestsModalOpen,
  setIsSpecialTestsModalOpen,
  onUpdateSpecialTests,
  onUpdateFunctionalScales,
  onSaveMasterAndEpisode,
  isReportBackModalOpen,
  setIsReportBackModalOpen,
  patientWithReferralEdits,
  resolvedDoctor,
  referringPhysician,
  referringClinic,
}) => {
  const { bi } = useLanguage();

  return (
    <>
      {/* Assessment Tools Shelf Modal */}
      <ModalDialog
        isOpen={isExamShelfModalOpen}
        onOpenChange={setIsExamShelfModalOpen}
        size="xl"
        title={bi('رف الفحوصات والأدوات السريرية', 'Clinical Examination Shelf', 'ڕەفەی پشکنین و ئامرازە کلینیکییەکان')}
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsExamShelfModalOpen(false)}
              className="py-1.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold cursor-pointer"
            >
              {bi('تم', 'Done', 'تەواو')}
            </button>
          </div>
        }
      >
        <Suspense
          fallback={
            <div className="p-6 text-center text-xs text-muted-foreground-1">
              {bi('جاري تحميل أدوات الفحص...', 'Loading assessment tools...', 'ئامرازەکانی پشکنین بار دەکرێن...')}
            </div>
          }
        >
          <ExamWidgetShelf
            onAddWidget={onAddWidget}
            onOpenCustomStudio={() => {
              setIsExamShelfModalOpen(false);
              setIsCustomStudioOpen(true);
            }}
            activeWidgetIds={episodeStore.activeWidgetIds}
          />
        </Suspense>
      </ModalDialog>

      {/* Printable Clinical & Financial Documents Modal */}
      {activePrintDoc !== null && (
        <Suspense fallback={null}>
          <PrintDocumentModal
            isOpen={activePrintDoc !== null}
            onClose={() => setActivePrintDoc(null)}
            documentType={activePrintDoc || 'progress_report'}
            patient={patient}
            episode={activeEpisode}
            allEpisodes={episodes}
            allPatientConsents={ClinicOperationsService.getConsentsForPatient(patient.id)}
            clinicalStore={episodeStore}
            sessions={activePrintDoc === 'patient_dossier' ? sessions : episodeSessions}
            soaps={activePrintDoc === 'patient_dossier' ? allPatientSoaps : episodeSoaps}
            hepProgram={episodeStore.hepProgram}
          />
        </Suspense>
      )}

      {/* Custom Widget Studio Modal */}
      {isCustomStudioOpen && (
        <Suspense fallback={null}>
          <CustomWidgetStudioModal
            isOpen={isCustomStudioOpen}
            onClose={() => setIsCustomStudioOpen(false)}
            onWidgetCreated={(newWidget) => {
              onAddWidget(newWidget.id);
            }}
          />
        </Suspense>
      )}

      {/* 1. Modal: Edit Personal Information */}
      <ModalDialog
        isOpen={isEditPersonalInfoOpen}
        onOpenChange={setIsEditPersonalInfoOpen}
        size="md"
        title={bi('تعديل المعلومات الشخصية للمريض', 'Edit Patient Personal Information', 'دەستکاری زانیاری کەسیی نەخۆش')}
      >
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('الاسم الكامل', 'Full Name', 'ناوی تەواو')}
            </label>
            <input
              type="text"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {bi('رقم الهاتف', 'Phone Number', 'ژمارەی تەلەفۆن')}
              </label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {bi('الجنس', 'Gender', 'ڕەگەز')}
              </label>
              <select
                value={editGender}
                onChange={(e) => setEditGender(e.target.value as 'male' | 'female' | 'other')}
                className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none"
              >
                <option value="male">{bi('ذكر', 'Male', 'نێر')}</option>
                <option value="female">{bi('أنثى', 'Female', 'مێ')}</option>
                <option value="other">{bi('أخرى', 'Other', 'هی تر')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('تاريخ الميلاد', 'Date of Birth', 'بەرواری لەدایکبوون')}
            </label>
            <input
              type="date"
              value={editDob}
              onChange={(e) => setEditDob(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('العنوان التفصيلي', 'Detailed Address', 'ناونیشانی ورد')}
            </label>
            <input
              type="text"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              placeholder={bi('المدينة، المنطقة، أقرب نقطة دالة', 'City, Area, Landmark', 'شار، ناوچە، نزیکترین خاڵ')}
              className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none"
            />
          </div>

          <div className="pt-2 border-t border-black/[0.045] dark:border-white/[0.06] space-y-3">
            <h4 className="text-xs font-bold text-primary">
              {bi('جهة الاتصال للطوارئ', 'Emergency Contact', 'پەیوەندیی فریاگوزاری')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  {bi('اسم جهة الطوارئ', 'Emergency Contact Name', 'ناوی کەسی پەیوەندی')}
                </label>
                <input
                  type="text"
                  value={editEmergencyName}
                  onChange={(e) => setEditEmergencyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">
                  {bi('هاتف الطوارئ', 'Emergency Phone', 'تەلەفۆنی فریاگوزاری')}
                </label>
                <input
                  type="tel"
                  value={editEmergencyPhone}
                  onChange={(e) => setEditEmergencyPhone(e.target.value)}
                  dir="ltr"
                  className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-black/[0.045] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => setIsEditPersonalInfoOpen(false)}
              className="px-4 py-2 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold transition-colors cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
            </button>
            <button
              type="button"
              onClick={onSavePersonalInfo}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {isSaving
                ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                : bi('حفظ التعديلات', 'Save Changes', 'پاشەکەوتی دەستکاری')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* 2. Modal: Edit Clinical Summary & Goals */}
      <ModalDialog
        isOpen={isEditClinicalSummaryOpen}
        onOpenChange={setIsEditClinicalSummaryOpen}
        size="md"
        title={bi('ملخص الحالة السريرية والأهداف', 'Clinical Summary & Goals', 'پوختەی کلینیکی و ئامانجەکان')}
      >
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('عنوان الحلقة / الحالة الرئيسية', 'Condition / Episode Title', 'ناونیشانی حاڵەت')}
            </label>
            <input
              type="text"
              value={editEpisodeTitle}
              onChange={(e) => setEditEpisodeTitle(e.target.value)}
              placeholder={bi('مثال: التهاب محفظة الكتف اللاصق / الكتف المتجمد', 'e.g. Frozen Shoulder', 'وەک: شانی بەستوو')}
              className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('التشخيص الطبي الأولي', 'Medical Diagnosis', 'دەستنیشانکردنی پزیشکی')}
            </label>
            <input
              type="text"
              value={editDiagnosis}
              onChange={(e) => setEditDiagnosis(e.target.value)}
              placeholder={bi('مثال: Adhesive Capsulitis', 'e.g. Adhesive Capsulitis', 'دەستنیشانکردن')}
              className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('الشكوى الرئيسية للمريض', 'Chief Complaint', 'سکاڵای سەرەکی')}
            </label>
            <textarea
              rows={2}
              value={editChiefComplaint}
              onChange={(e) => setEditChiefComplaint(e.target.value)}
              placeholder={bi('وصف ألم المريض وموقع الإصابة وتأثيرها على الحركة', 'Patient complaint & pain description', 'وەسفی ئازار')}
              className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('الانطباع السريري للمعالج الطبيعي', 'Clinical Impression', 'تێگەیشتنی کلینیکی')}
            </label>
            <textarea
              rows={2}
              value={editClinicalImpression}
              onChange={(e) => setEditClinicalImpression(e.target.value)}
              placeholder={bi('الانطباع السريري والملاحظات الفسيولوجية', 'Physical therapist clinical impression', 'تێگەیشتن')}
              className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              {bi('الأهداف التأهيلية للمريض (Goals)', 'Rehabilitation Goals', 'ئامانجەکانی چارەسەر')}
            </label>
            <textarea
              rows={2}
              value={editGoals}
              onChange={(e) => setEditGoals(e.target.value)}
              placeholder={bi('مثال: تقليل الألم واستعادة المدى الحركي والقدرة على رفع الذراع', 'e.g. Reduce pain and improve ROM', 'ئامانجەکان')}
              className="w-full px-3 py-2 rounded-xl bg-surface/80 text-sm text-foreground focus:ring-2 focus:ring-primary/25 outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-black/[0.045] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => setIsEditClinicalSummaryOpen(false)}
              className="px-4 py-2 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold transition-colors cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
            </button>
            <button
              type="button"
              onClick={onSaveClinicalSummary}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {isSaving
                ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                : bi('حفظ التعديلات', 'Save Changes', 'پاشەکەوتی دەستکاری')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* 3. Modal: MMT */}
      <ModalDialog
        isOpen={isMmtModalOpen}
        onOpenChange={setIsMmtModalOpen}
        size="lg"
        title={bi('تقييم القوة العضلية اليدوي (MMT)', 'Manual Muscle Testing (MMT)', 'پشکنینی هێزی ماسولکەکان')}
      >
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <Suspense
            fallback={
              <div className="p-8 text-center text-xs text-muted-foreground-1">
                {bi('جاري تحميل وحدة فحص القوة العضلية...', 'Loading MMT widget...', 'باردەکرێت...')}
              </div>
            }
          >
            <MmtWidget value={episodeStore.objective?.mmtBattery} onChange={onUpdateObjectiveMmt} />
          </Suspense>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-black/[0.045] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setIsMmtModalOpen(false);
                onSaveMasterAndEpisode();
              }}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
            >
              {bi('إغلاق وتأكيد الحفظ', 'Save & Close', 'پاشەکەوت و داخستن')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* 4. Modal: ROM */}
      <ModalDialog
        isOpen={isRomModalOpen}
        onOpenChange={setIsRomModalOpen}
        size="lg"
        title={bi('قياس المدى الحركي للمفاصل (ROM)', 'Range of Motion (ROM)', 'پێوانی مەودای جووڵەی جومگەکان')}
      >
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <Suspense
            fallback={
              <div className="p-8 text-center text-xs text-muted-foreground-1">
                {bi('جاري تحميل وحدة فحص المدى الحركي...', 'Loading ROM widget...', 'باردەکرێت...')}
              </div>
            }
          >
            <RomWidget value={episodeStore.objective?.romBattery} onChange={onUpdateObjectiveRom} />
          </Suspense>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-black/[0.045] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setIsRomModalOpen(false);
                onSaveMasterAndEpisode();
              }}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
            >
              {bi('إغلاق وتأكيد الحفظ', 'Save & Close', 'پاشەکەوت و داخستن')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* 5. Modal: Neuro Screening */}
      <ModalDialog
        isOpen={isNeuroModalOpen}
        onOpenChange={setIsNeuroModalOpen}
        size="lg"
        title={bi('الفحص العصبي (الإحساس والمنعكسات)', 'Neurological Screening', 'پشکنینی دەمار و ڕەفڵەکس')}
      >
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <Suspense
            fallback={
              <div className="p-8 text-center text-xs text-muted-foreground-1">
                {bi('جاري تحميل وحدة الفحص العصبي...', 'Loading Neuro widget...', 'باردەکرێت...')}
              </div>
            }
          >
            <NeuroWidget
              value={episodeStore.objective?.neuroScreening}
              onChange={onUpdateObjectiveNeuro}
            />
          </Suspense>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-black/[0.045] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setIsNeuroModalOpen(false);
                onSaveMasterAndEpisode();
              }}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
            >
              {bi('إغلاق وتأكيد الحفظ', 'Save & Close', 'پاشەکەوت و داخستن')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* 6. Modal: Special Tests & Functional Scales */}
      <ModalDialog
        isOpen={isSpecialTestsModalOpen}
        onOpenChange={setIsSpecialTestsModalOpen}
        size="lg"
        title={bi('الفحوصات السريرية الخاصة والمقاييس الوظيفية', 'Special Tests & Functional Scales', 'پشکنینە تایبەتەکان و پێوەرەکان')}
      >
        <div className="p-4 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          <Suspense
            fallback={
              <div className="p-8 text-center text-xs text-muted-foreground-1">
                {bi('جاري تحميل الفحوصات الخاصة...', 'Loading Special Tests...', 'باردەکرێت...')}
              </div>
            }
          >
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-primary flex items-center gap-2">
                <Award className="size-4" />
                <span>
                  {bi('الفحوصات السريرية الاستفزازية (Special Tests)', 'Orthopedic Special Tests', 'پشکنینە تایبەتەکان')}
                </span>
              </h4>
              <SpecialTestsWidget
                value={episodeStore.specialTests}
                onChange={onUpdateSpecialTests}
              />
            </div>

            <div className="pt-4 border-t border-black/[0.045] dark:border-white/[0.06] space-y-3">
              <h4 className="text-xs font-bold text-primary flex items-center gap-2">
                <Target className="size-4" />
                <span>
                  {bi('المقاييس والدرجات الوظيفية (Functional Scales)', 'Functional Outcome Measures', 'پێوەرە فەنکشنەڵەکان')}
                </span>
              </h4>
              <FunctionalScalesWidget
                value={episodeStore.functionalScales}
                onChange={onUpdateFunctionalScales}
                patientAge={patientAge}
                patientGender={patient.data.gender}
              />
            </div>
          </Suspense>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-black/[0.045] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setIsSpecialTestsModalOpen(false);
                onSaveMasterAndEpisode();
              }}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
            >
              {bi('إغلاق وتأكيد الحفظ', 'Save & Close', 'پاشەکەوت و داخستن')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* C6: Printable & Copyable Report-Back Letter to Referring Doctor */}
      {isReportBackModalOpen && (
        <Suspense fallback={null}>
          <DoctorReportBackLetterModal
            isOpen={isReportBackModalOpen}
            onClose={() => setIsReportBackModalOpen(false)}
            patient={patientWithReferralEdits}
            doctor={resolvedDoctor}
            doctorNameFallback={referringPhysician.trim() || referringClinic.trim() || undefined}
            episode={activeEpisode}
            sessions={episodeSessions.length > 0 ? episodeSessions : sessions}
            episodeStore={episodeStore}
            soaps={allPatientSoaps}
          />
        </Suspense>
      )}
    </>
  );
};
