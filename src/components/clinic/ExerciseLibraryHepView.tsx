// =======================================================================
// PhysioRecord — Searchable PT Exercise Library & HEP Builder
// Filter by Region, Goal, and Equipment with Printable Bilingual HEP Sheet
// =======================================================================

import React, { Suspense, lazy, useState, useMemo } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  ClinicOperationsService,
  PT_EXERCISE_CATALOG,
} from '../../services/clinicOperationsService';
import { localDate, formatDateDDMMYYYY } from '../../utils/date';
import {
  buildHepWhatsAppText,
  buildUserInitiatedWhatsAppHref,
} from '../../utils/whatsappTemplates';
import { ClinicalAbbr, Num } from '../ui/Primitives';
const PrintDocumentModal = lazy(() =>
  import('../print/PrintDocumentModal').then((m) => ({ default: m.PrintDocumentModal }))
);
import type { EpisodeRecord, PatientRecord } from '../../types/clinical';
import type {
  ExerciseAnatomicalRegion,
  ExerciseTherapeuticGoal,
  ExerciseLibraryItem,
  HepPrescriptionItem,
} from '../../types/clinicManagement';
import {
  Search,
  Plus,
  Printer,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  Copy,
  Check,
  MessageCircle,
} from 'lucide-react';

interface ExerciseLibraryHepViewProps {
  embeddedHepProgram?: HepPrescriptionItem[];
  onUpdateEmbeddedHep?: (updated: HepPrescriptionItem[]) => void;
  patientName?: string;
  patientPhone?: string;
  episodeTitle?: string;
  patient?: PatientRecord | null;
  episode?: EpisodeRecord | null;
}

export const ExerciseLibraryHepView: React.FC<ExerciseLibraryHepViewProps> = ({
  embeddedHepProgram,
  onUpdateEmbeddedHep,
  patientName,
  patientPhone,
  episodeTitle,
  patient,
  episode,
}) => {
  const { language, isRtl, bi } = useLanguage();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<ExerciseAnatomicalRegion | 'all'>('all');
  const [selectedGoal, setSelectedGoal] = useState<ExerciseTherapeuticGoal | 'all'>('all');
  const [localHepList, setLocalHepList] = useState<HepPrescriptionItem[]>([]);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showOfficialPrint, setShowOfficialPrint] = useState(false);
  const [copiedHep, setCopiedHep] = useState(false);
  const [undoHepItem, setUndoHepItem] = useState<{ item: HepPrescriptionItem; index: number } | null>(null);

  const activeHepList = embeddedHepProgram !== undefined ? embeddedHepProgram : localHepList;
  const resolvedPhone = patientPhone || patient?.data.phoneNumber || patient?.data.phone || '';
  const resolvedPatientName =
    patientName || patient?.data.fullNameAr || patient?.data.fullName || '';

  const whatsAppLang: 'ar' | 'en' = language === 'en' ? 'en' : 'ar';

  const { hepMessageText, hepWhatsAppHref } = useMemo(() => {
    if (activeHepList.length === 0) {
      return { hepMessageText: '', hepWhatsAppHref: null as string | null };
    }
    const profile = ClinicOperationsService.getClinicProfile();
    const templates = ClinicOperationsService.getWhatsAppTemplates();
    const msg = buildHepWhatsAppText({
      template: whatsAppLang === 'ar' ? templates.hepProgram.ar : templates.hepProgram.en,
      patientName: resolvedPatientName,
      hepItems: activeHepList,
      clinicProfile: profile,
      lang: whatsAppLang,
    });
    return {
      hepMessageText: msg,
      hepWhatsAppHref: buildUserInitiatedWhatsAppHref(resolvedPhone, msg),
    };
  }, [activeHepList, whatsAppLang, resolvedPatientName, resolvedPhone]);
  const setHepList = (updated: HepPrescriptionItem[]) => {
    if (onUpdateEmbeddedHep) {
      onUpdateEmbeddedHep(updated);
    } else {
      setLocalHepList(updated);
    }
  };

  const regionLabels: Record<ExerciseAnatomicalRegion | 'all', { ar: string; en: string; ckb: string }> = {
    all: { ar: 'جميع المناطق التشريحية', en: 'All Regions', ckb: 'هەموو ناوچە توێکارییەکان' },
    cervical: { ar: 'الرقبة والعمود العنقي', en: 'Cervical Spine', ckb: 'مل و بڕبڕەی مل' },
    shoulder: { ar: 'الكتف ولوح الكتف', en: 'Shoulder Complex', ckb: 'شان و دەفەی شان' },
    elbow_wrist: { ar: 'المرفق والرسغ واليد', en: 'Elbow, Wrist & Hand', ckb: 'ئانیشک، مەچەک و دەست' },
    thoracic_lumbar: { ar: 'أسفل الظهر والعمود القطني', en: 'Thoracic & Lumbar Spine', ckb: 'بەشی خوارەوەی پشت و بڕبڕەی کەمەر' },
    hip_pelvis: { ar: 'الورك والحوض', en: 'Hip & Pelvis', ckb: 'ران و حەوز' },
    knee: { ar: 'مفصل الركبة', en: 'Knee Joint', ckb: 'جومگەی ئەژنۆ' },
    ankle_foot: { ar: 'الكاحل والقدم', en: 'Ankle & Foot', ckb: 'پاژنە و پێ' },
    neuro_balance: { ar: 'التوازن والتأهيل العصبي', en: 'Neuro & Balance', ckb: 'هاوسەنگی و شیاندنەوەی دەمار' },
  };

  const goalLabels: Record<ExerciseTherapeuticGoal | 'all', { ar: string; en: string; ckb: string }> = {
    all: { ar: 'جميع الأهداف العلاجية', en: 'All Goals', ckb: 'هەموو ئامانجە چارەسەرییەکان' },
    mobility_rom: { ar: 'تحسين المدى الحركي', en: 'ROM & Mobility', ckb: 'باشترکردنی مەودای جووڵە' },
    strengthening: { ar: 'التقوية العضلية المتدرجة', en: 'Progressive Strengthening', ckb: 'بەهێزکردنی پلەبەندی ماسوولکەکان' },
    core_stability: { ar: 'الثبات المحوري والعميق', en: 'Core & Spinal Stability', ckb: 'جێگیری ناوەندی و قووڵ' },
    stretching_flexibility: { ar: 'الاستطالة والمرونة', en: 'Stretching & Flexibility', ckb: 'درێژکردنەوە و نەرمی' },
    neuromuscular_balance: { ar: 'التحكم العصبي العضلي والتوازن', en: 'Neuromuscular & Balance', ckb: 'کۆنترۆڵی دەمار-ماسوولکە و هاوسەنگی' },
    pain_modulation: { ar: 'تخفيف الألم والتمركز المحوري', en: 'Pain Modulation', ckb: 'کەمکردنەوەی ئازار و ڕێکخستنەوەی ناوەندی' },
  };

  const filteredExercises = useMemo(() => {
    return PT_EXERCISE_CATALOG.filter((ex) => {
      const matchRegion = selectedRegion === 'all' || ex.region === selectedRegion;
      const matchGoal = selectedGoal === 'all' || ex.goal === selectedGoal;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        ex.nameAr.toLowerCase().includes(q) ||
        ex.nameEn.toLowerCase().includes(q) ||
        ex.instructionsAr.toLowerCase().includes(q);
      return matchRegion && matchGoal && matchSearch;
    });
  }, [searchQuery, selectedRegion, selectedGoal]);

  const handleAssignToHep = (ex: ExerciseLibraryItem) => {
    if (activeHepList.some((h) => h.exerciseId === ex.id)) return;
    const newItem: HepPrescriptionItem = {
      id: `hep_${Date.now()}_${ex.id}`,
      exerciseId: ex.id,
      nameAr: ex.nameAr,
      nameEn: ex.nameEn,
      region: ex.region,
      sets: ex.defaultSets,
      reps: ex.defaultReps,
      holdSeconds: ex.defaultHoldSeconds,
      frequencyPerDay: 2,
      daysPerWeek: 5,
      loadOrBand: ex.defaultLoadOrBand,
      instructionsAr: ex.instructionsAr,
      instructionsEn: ex.instructionsEn,
      complianceStatus: 'full',
    };
    setHepList([...activeHepList, newItem]);
  };

  const handleUpdateHepDosage = (
    id: string,
    field: keyof HepPrescriptionItem,
    val: number | string
  ) => {
    setHepList(
      activeHepList.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const handleRemoveHepItem = (id: string) => {
    const idx = activeHepList.findIndex((item) => item.id === id);
    if (idx === -1) return;
    setUndoHepItem({ item: activeHepList[idx], index: idx });
    setHepList(activeHepList.filter((item) => item.id !== id));
  };

  const handleUndoRemoveHepItem = () => {
    if (!undoHepItem) return;
    const restored = [...activeHepList];
    if (!restored.some((x) => x.id === undoHepItem.item.id)) {
      restored.splice(Math.min(undoHepItem.index, restored.length), 0, undoHepItem.item);
      setHepList(restored);
    }
    setUndoHepItem(null);
  };

  return (
    <div
      className={
        embeddedHepProgram !== undefined
          ? 'space-y-5'
          : 'pr-container space-y-5'
      }
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Page Header: Title + 1 Action */}
      <div className={embeddedHepProgram !== undefined ? 'flex flex-wrap items-center justify-between gap-3' : 'pr-page-header'}>
        {embeddedHepProgram !== undefined ? (
          <h2 className="pr-section-title text-base sm:text-lg">
            {bi(
              'مكتبة التمارين والبرنامج المنزلي',
              'Exercise Library & HEP Builder',
              'کتێبخانەی ڕاهێنانەکان و بەرنامەی ماڵەوە',
            )}
            {(language === 'ar' || language === 'ckb') && (
              <>
                {' '}
                <ClinicalAbbr code="HEP" className="text-xs text-muted-foreground-1" />
              </>
            )}
          </h2>
        ) : (
          <h1 className="pr-page-title">
            {bi(
              'مكتبة التمارين والبرنامج المنزلي',
              'Exercise Library & HEP Builder',
              'کتێبخانەی ڕاهێنانەکان و بەرنامەی ماڵەوە',
            )}
            {(language === 'ar' || language === 'ckb') && (
              <>
                {' '}
                <ClinicalAbbr code="HEP" className="text-xs text-muted-foreground-1" />
              </>
            )}
          </h1>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPrintPreview(!showPrintPreview)}
            className="py-2 px-3.5 min-h-[36px] rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold inline-flex items-center gap-2 shadow-xs transition-all cursor-pointer"
          >
            <Printer className="size-4" />
            <span>
              {showPrintPreview
                ? bi(
                    'العودة لمكتبة التمارين',
                    'Back to Exercise Library',
                    'گەڕانەوە بۆ کتێبخانەی ڕاهێنانەکان',
                  )
                : bi(
                    `معاينة وطباعة البرنامج المنزلي (${activeHepList.length})`,
                    `Patient HEP Sheet (${activeHepList.length})`,
                    `پێشبینین و چاپکردنی بەرنامەی ماڵەوە (${activeHepList.length})`,
                  )}
            </span>
          </button>

          {activeHepList.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowOfficialPrint(true)}
                className="py-2 px-3 min-h-[36px] rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer className="size-3.5 text-primary" />
                <span>{bi('طباعة رسمية / PDF', 'Official Print / PDF', 'چاپکردنی فەرمی / PDF')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!hepMessageText || typeof navigator === 'undefined' || !navigator.clipboard) {
                    return;
                  }
                  void navigator.clipboard.writeText(hepMessageText).then(() => {
                    setCopiedHep(true);
                    window.setTimeout(() => setCopiedHep(false), 2000);
                  });
                }}
                className="py-2 px-3 min-h-[36px] rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-medium inline-flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {copiedHep ? (
                  <Check className="size-3.5 text-emerald-700 dark:text-emerald-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>
                  {copiedHep
                    ? bi('تم النسخ', 'Copied', 'کۆپی کرا')
                    : bi('نسخ للواتساب', 'Copy HEP', 'کۆپی بۆ واتساپ')}
                </span>
              </button>

              {hepWhatsAppHref && (
                <a
                  href={hepWhatsAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 px-3 min-h-[36px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-all"
                >
                  <MessageCircle className="size-3.5" />
                  <span>{bi('إرسال عبر واتساب', 'Send via WhatsApp', 'ناردن لە ڕێگەی واتساپەوە')}</span>
                </a>
              )}
            </>
          )}

          {showOfficialPrint && (
            <Suspense fallback={null}>
              <PrintDocumentModal
                isOpen={showOfficialPrint}
                onClose={() => setShowOfficialPrint(false)}
                documentType="hep_sheet"
                patient={patient}
                patientName={resolvedPatientName}
                patientPhone={resolvedPhone}
                episode={episode}
                hepProgram={activeHepList}
              />
            </Suspense>
          )}
        </div>
      </div>

      {showPrintPreview ? (
        /* Printable Patient Home Exercise Program (HEP) Card */
        <div className="bg-card p-6 rounded-2xl border border-card-line shadow-2xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-card-divider pb-4">
            <div>
              {embeddedHepProgram !== undefined ? (
                <h3 className="text-lg font-bold text-foreground">
                  {bi(
                    'البرنامج العلاجي المنزلي للمريض',
                    'Patient Home Exercise Program (HEP)',
                    'بەرنامەی چارەسەری ڕاهێنانی ماڵەوەی نەخۆش',
                  )}
                  {(language === 'ar' || language === 'ckb') && (
                    <>
                      {' '}
                      <ClinicalAbbr code="HEP" className="text-xs text-muted-foreground-1" />
                    </>
                  )}
                </h3>
              ) : (
                <h2 className="text-lg font-bold text-foreground">
                  {bi(
                    'البرنامج العلاجي المنزلي للمريض',
                    'Patient Home Exercise Program (HEP)',
                    'بەرنامەی چارەسەری ڕاهێنانی ماڵەوەی نەخۆش',
                  )}
                  {(language === 'ar' || language === 'ckb') && (
                    <>
                      {' '}
                      <ClinicalAbbr code="HEP" className="text-xs text-muted-foreground-1" />
                    </>
                  )}
                </h2>
              )}
              <p className="text-xs text-muted-foreground-1 mt-1">
                {patientName ? `${bi('المريض: ', 'Patient: ', 'نەخۆش: ')}${patientName} · ` : ''}
                {episodeTitle || bi('خطة التأهيل الحركي', 'Rehabilitation Plan', 'پلانی شیاندنەوەی جووڵەیی')}
              </p>
            </div>
            <div className="py-1 px-3 rounded-lg bg-surface border border-line-2 text-xs tabular-nums text-muted-foreground-1">
              <bdi dir="ltr">{formatDateDDMMYYYY(localDate())}</bdi>
            </div>
          </div>

          {activeHepList.length === 0 ? (
            <p className="text-xs text-muted-foreground-1 text-center py-8">
              {bi(
                'لم تتم إضافة تمارين للبرنامج المنزلي بعد. اختر تمارين من المكتبة أدناه.',
                'No exercises assigned to HEP yet.',
                'هێشتا هیچ ڕاهێنانێک بۆ بەرنامەی ماڵەوە زیاد نەکراوە. لە کتێبخانەکەی خوارەوە ڕاهێنان هەڵبژێرە.',
              )}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeHepList.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 rounded-2xl border border-card-line bg-surface/60 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="size-7 rounded-lg bg-primary text-primary-foreground font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        {embeddedHepProgram !== undefined ? (
                          <h4 className="text-xs sm:text-sm font-bold text-foreground">
                            {item.nameAr}
                          </h4>
                        ) : (
                          <h3 className="text-xs sm:text-sm font-bold text-foreground">
                            {item.nameAr}
                          </h3>
                        )}
                        <p className="text-xs text-muted-foreground-1">{item.nameEn}</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground-1 leading-relaxed">
                    {bi(item.instructionsAr, item.instructionsEn)}
                  </p>

                  <div className="pt-2.5 border-t border-card-divider grid grid-cols-4 gap-2 text-center text-xs tabular-nums">
                    <div className="p-2 rounded-xl bg-card border border-card-line">
                      <div className="text-xs text-muted-foreground-1">{bi('جولات', 'Sets', 'گەڕ')}</div>
                      <div className="font-mono font-bold text-primary mt-0.5">{item.sets}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-card border border-card-line">
                      <div className="text-xs text-muted-foreground-1">{bi('تكرار', 'Reps', 'دووبارەبوونەوە')}</div>
                      <div className="font-mono font-bold text-primary mt-0.5">{item.reps}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-card border border-card-line">
                      <div className="text-xs text-muted-foreground-1">{bi('ثبات (ث)', 'Hold (s)', 'ڕاگرتن (چرکە)')}</div>
                      <div className="font-mono font-bold text-primary mt-0.5">
                        {item.holdSeconds}s
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-card border border-card-line">
                      <div className="text-xs text-muted-foreground-1">{bi('يومياً', 'Daily', 'ڕۆژانە')}</div>
                      <div className="font-bold text-primary mt-0.5">
                        {item.frequencyPerDay}x
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Searchable Exercise Catalog */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search & Filters */}
            <div className="bg-card p-4 rounded-2xl border border-card-line shadow-2xs grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label={bi('بحث باسم التمرين', 'Search exercise', 'گەڕان بە ناوی ڕاهێنان')}
                  placeholder={bi('بحث باسم التمرين...', 'Search exercise...', 'گەڕان بە ناوی ڕاهێنان...')}
                  className={`w-full ${
                    isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
                  } py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground placeholder:text-muted-foreground-1 focus:outline-none focus:border-primary`}
                />
                <Search
                  className={`size-4 text-muted-foreground-1 absolute ${
                    isRtl ? 'right-3' : 'left-3'
                  } top-1/2 -translate-y-1/2 pointer-events-none`}
                />
              </div>

              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value as ExerciseAnatomicalRegion | 'all')}
                aria-label={bi('تصفية حسب المنطقة التشريحية', 'Filter by anatomical region', 'پاڵاوتن بەپێی ناوچەی توێکاری')}
                className="px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-semibold focus:outline-none focus:border-primary"
              >
                {Object.entries(regionLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {bi(v.ar, v.en, v.ckb)}
                  </option>
                ))}
              </select>

              <select
                value={selectedGoal}
                onChange={(e) => setSelectedGoal(e.target.value as ExerciseTherapeuticGoal | 'all')}
                aria-label={bi('تصفية حسب الهدف العلاجي', 'Filter by therapeutic goal', 'پاڵاوتن بەپێی ئامانجی چارەسەری')}
                className="px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground font-semibold focus:outline-none focus:border-primary"
              >
                {Object.entries(goalLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {bi(v.ar, v.en, v.ckb)}
                  </option>
                ))}
              </select>
            </div>

            {/* Catalog Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredExercises.map((ex) => {
                const isAdded = activeHepList.some((h) => h.exerciseId === ex.id);
                return (
                  <div
                    key={ex.id}
                    className="bg-card p-5 rounded-2xl border border-card-line hover:border-primary/40 shadow-2xs transition-all flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="py-0.5 px-2 rounded-md bg-primary/10 text-primary font-semibold">
                          {bi(regionLabels[ex.region].ar, regionLabels[ex.region].en, regionLabels[ex.region].ckb)}
                        </span>
                        <span className="py-0.5 px-2 rounded-md bg-surface border border-line-2 text-muted-foreground-1 font-medium">
                          {bi(goalLabels[ex.goal].ar, goalLabels[ex.goal].en, goalLabels[ex.goal].ckb)}
                        </span>
                        {!ex.governance?.reviewedBy && (
                          <span
                            title={ex.governance?.source}
                            className="text-amber-800 dark:text-amber-300 font-semibold text-xs"
                          >
                            {bi('بانتظار المراجعة', 'Pending Review', 'چاوەڕێی پێداچوونەوە')}
                          </span>
                        )}
                      </div>

                      {embeddedHepProgram !== undefined ? (
                        <h3 className="text-xs sm:text-sm font-bold text-foreground pt-0.5">
                          {bi(ex.nameAr, ex.nameEn)}
                        </h3>
                      ) : (
                        <h2 className="text-xs sm:text-sm font-bold text-foreground pt-0.5">
                          {bi(ex.nameAr, ex.nameEn)}
                        </h2>
                      )}

                      <p className="text-xs text-muted-foreground-1 leading-relaxed">
                        {bi(ex.instructionsAr, ex.instructionsEn)}
                      </p>

                      {ex.governance?.source && (
                        <p className="text-xs text-muted-foreground-1">
                          {bi('المصدر: ', 'Source: ', 'سەرچاوە: ')}
                          {ex.governance.source}
                        </p>
                      )}

                      {ex.precautionsAr && (
                        <div className="p-2 rounded-xl bg-surface/75 flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="size-3.5 shrink-0" />
                          <span>{bi(ex.precautionsAr, ex.precautionsEn ?? ex.precautionsAr)}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-card-divider flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground-1 tabular-nums">
                        <bdi dir="ltr" className="font-mono">
                          {ex.defaultSets} × {ex.defaultReps}
                        </bdi>{' '}
                        {ex.defaultHoldSeconds > 0 ? `(${ex.defaultHoldSeconds}s)` : ''} ·{' '}
                        {ex.defaultLoadOrBand}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleAssignToHep(ex)}
                        className={`py-2 px-3 min-h-[36px] rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                          isAdded
                            ? 'bg-emerald-700 text-white shadow-2xs'
                            : 'bg-primary hover:bg-primary-hover text-primary-foreground shadow-2xs'
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <CheckCircle2 className="size-3.5" />
                            <span>{bi('مضاف للبرنامج', 'Assigned', 'زیادکراوە بۆ بەرنامە')}</span>
                          </>
                        ) : (
                          <>
                            <Plus className="size-3.5" />
                            <span>{bi('إضافة لـ HEP', 'Add to HEP', 'زیادکردن بۆ HEP')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active HEP Prescription Builder */}
          <div className="bg-card rounded-2xl border border-card-line shadow-2xs overflow-hidden h-fit">
            <div className="px-5 py-4 border-b border-card-divider bg-muted/30 flex items-center justify-between">
              {embeddedHepProgram !== undefined ? (
                <h3 className="text-sm font-bold text-foreground">
                  {bi('وصفة التمارين المنزلية النشطة', 'Assigned HEP Prescription', 'ڕەچەتەی ڕاهێنانە چالاکەکانی ماڵەوە')}
                </h3>
              ) : (
                <h2 className="text-sm font-bold text-foreground">
                  {bi('وصفة التمارين المنزلية النشطة', 'Assigned HEP Prescription', 'ڕەچەتەی ڕاهێنانە چالاکەکانی ماڵەوە')}
                </h2>
              )}
              <span className="text-xs font-bold text-primary tabular-nums">
                <Num value={activeHepList.length} />
              </span>
            </div>

            {undoHepItem && (
              <div className="m-3 p-2.5 rounded-xl bg-slate-900 text-white text-xs flex items-center justify-between gap-2">
                <span className="truncate">
                  {bi(
                    `تمت إزالة "${undoHepItem.item.nameAr}"`,
                    `Removed "${undoHepItem.item.nameEn}"`,
                    `"${undoHepItem.item.nameAr}" لابرا`,
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleUndoRemoveHepItem}
                  className="px-2.5 py-1 min-h-[36px] rounded-lg bg-primary text-primary-foreground font-bold shrink-0 cursor-pointer"
                >
                  {bi('تراجع', 'Undo', 'پاشگەزبوونەوە')}
                </button>
              </div>
            )}

            {activeHepList.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground-1">
                {bi(
                  'انقر على "إضافة للبرنامج" بجانب أي تمرين لتخصيص الجرعة الحركية للمريض.',
                  'Click "Add to HEP" on any exercise to customize patient dosage.',
                  'کلیک لەسەر "زیادکردن بۆ HEP" بکە لە تەنیشت هەر ڕاهێنانێک بۆ دیاریکردنی بڕی جووڵەی نەخۆش.',
                )}
              </div>
            ) : (
              <div className="divide-y divide-card-divider">
                {activeHepList.map((item) => (
                  <div key={item.id} className="p-4 space-y-2.5 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-foreground">
                        {bi(item.nameAr, item.nameEn)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveHepItem(item.id)}
                        aria-label={bi(
                          `إزالة التمرين ${item.nameAr}`,
                          `Remove exercise ${item.nameEn}`,
                          `لابردنی ڕاهێنانی ${item.nameAr}`,
                        )}
                        title={bi('إزالة التمرين', 'Remove exercise', 'لابردنی ڕاهێنان')}
                        className="text-muted-foreground-1 hover:text-rose-700 dark:hover:text-rose-400 p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-layer-hover cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs tabular-nums">
                      <div>
                        <label htmlFor={`hep-sets-${item.id}`} className="text-xs text-muted-foreground-1 block mb-1">
                          {bi('الجولات', 'Sets', 'گەڕەکان')}
                        </label>
                        <input
                          id={`hep-sets-${item.id}`}
                          type="number"
                          min="1"
                          value={item.sets}
                          onChange={(e) =>
                            handleUpdateHepDosage(item.id, 'sets', Number(e.target.value))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label htmlFor={`hep-reps-${item.id}`} className="text-xs text-muted-foreground-1 block mb-1">
                          {bi('التكرار', 'Reps', 'دووبارەبوونەوە')}
                        </label>
                        <input
                          id={`hep-reps-${item.id}`}
                          type="number"
                          min="1"
                          value={item.reps}
                          onChange={(e) =>
                            handleUpdateHepDosage(item.id, 'reps', Number(e.target.value))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label htmlFor={`hep-hold-${item.id}`} className="text-xs text-muted-foreground-1 block mb-1">
                          {bi('ثبات (ث)', 'Hold (s)', 'ڕاگرتن (چرکە)')}
                        </label>
                        <input
                          id={`hep-hold-${item.id}`}
                          type="number"
                          min="0"
                          value={item.holdSeconds}
                          onChange={(e) =>
                            handleUpdateHepDosage(item.id, 'holdSeconds', Number(e.target.value))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
