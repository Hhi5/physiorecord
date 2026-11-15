// =======================================================================
// PhysioRecord — Gait, Posture & Balance Assessment Widget
// TUG Test (Timed Up & Go), Postural Deviations, and Gait Mechanics
// =======================================================================

import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { GaitPostureData, TugPopulationProfile } from '../../types/clinicalWidgets';
import { TUG_POPULATION_NORMS } from '../../utils/outcomeMeasures';
import { Num } from '../ui/Primitives';
import { Timer, Info } from 'lucide-react';

interface GaitPostureWidgetProps {
  value: GaitPostureData | undefined;
  onChange: (updated: GaitPostureData) => void;
  readOnly?: boolean;
}

const POSTURE_DEVIATIONS_LIST = [
  { id: 'forward_head', ar: 'بروز الرأس للأمام (Forward Head Posture)', en: 'Forward Head Posture' },
  { id: 'thoracic_kyphosis', ar: 'حداب صدري زائد (Thoracic Kyphosis)', en: 'Increased Thoracic Kyphosis' },
  { id: 'lumbar_hyperlordosis', ar: 'بزل قطني مفرط (Lumbar Hyperlordosis)', en: 'Lumbar Hyperlordosis' },
  { id: 'scoliosis_curve', ar: 'انحراف جانبي / جنف (Scoliotic Curve)', en: 'Scoliotic Deviation' },
  { id: 'pelvic_anterior_tilt', ar: 'ميل الحوض للأمام (Anterior Pelvic Tilt)', en: 'Anterior Pelvic Tilt' },
  { id: 'pelvic_posterior_tilt', ar: 'ميل الحوض للخلف (Posterior Pelvic Tilt)', en: 'Posterior Pelvic Tilt' },
  { id: 'shoulder_elevation_asymmetry', ar: 'عدم تناظر ارتفاع الكتفين', en: 'Shoulder Elevation Asymmetry' },
  { id: 'genu_valgum', ar: 'تقارب الركبتين (روح الركبة Genu Valgum)', en: 'Genu Valgum (Knock Knees)' },
  { id: 'genu_varum', ar: 'تباعد الركبتين (فحج الركبة Genu Varum)', en: 'Genu Varum (Bow Legs)' },
];

export const GaitPostureWidget: React.FC<GaitPostureWidgetProps> = ({
  value,
  onChange,
  readOnly = false,
}) => {
  const { bi } = useLanguage();

  const currentData: GaitPostureData = value || {
    tugSeconds: null,
    postureDeviations: [],
    gaitPattern: 'normal',
    assistiveDevice: 'none',
  };

  const handleUpdate = (updates: Partial<GaitPostureData>) => {
    if (readOnly) return;
    onChange({
      ...currentData,
      ...updates,
    });
  };

  const toggleDeviation = (id: string) => {
    if (readOnly) return;
    const exists = currentData.postureDeviations.includes(id);
    const updated = exists
      ? currentData.postureDeviations.filter((d) => d !== id)
      : [...currentData.postureDeviations, id];
    handleUpdate({ postureDeviations: updated });
  };

  const selectedNorm =
    TUG_POPULATION_NORMS.find((n) => n.profileId === currentData.tugPopulationProfile) ||
    TUG_POPULATION_NORMS[3];

  return (
    <div className="space-y-4">
      {/* TUG Test Section — Measured value + cited population ranges (no bare binary fall-risk label) */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-850 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {bi('اختبار النهوض والمشي الموقوت (Timed Up & Go - TUG)', 'Timed Up & Go (TUG) Test', 'پشکنینی هەستانەوە و ڕۆیشتنی کاتبەند (TUG)')}
            </h3>
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {bi('مسافة 3 أمتار قياسية', 'Standard 3m Walk', 'مەودای ستانداردی ٣ مەتر')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                id="gait-tug-seconds"
                type="number"
                step="0.1"
                min="1"
                max="120"
                disabled={readOnly}
                value={currentData.tugSeconds ?? ''}
                placeholder="0.0"
                aria-label={bi('زمن اختبار النهوض والمشي بالثواني', 'TUG duration in seconds', 'کاتی TUG بە چرکە')}
                onChange={(e) =>
                  handleUpdate({
                    tugSeconds: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="w-24 px-3 py-1.5 font-bold font-mono text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-center focus:ring-2 focus:ring-teal-500"
              />
              <label htmlFor="gait-tug-seconds" className="text-xs font-bold text-slate-600 dark:text-slate-400">
                {bi('ثانية (Seconds)', 'sec', 'چرکە (sec)')}
              </label>
            </div>

            {currentData.tugSeconds !== null && currentData.tugSeconds !== undefined && (
              <div className="px-3 py-1.5 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 text-xs font-semibold text-teal-900 dark:text-teal-200 tabular-nums">
                <span>{bi('الزمن المقاس:', 'Measured time:', 'کاتی پێوراو:')} </span>
                <span className="font-mono font-bold">
                  <Num value={Number(currentData.tugSeconds.toFixed(1))} /> {bi('ث', 's', 'چ')}
                </span>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="gait-tug-norm-select" className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              {bi('الفئة المرجعية للمقارنة السريرية:', 'Reference Cohort Context:', 'پۆلی سەرچاوە بۆ بەراوردکردنی کلینیکی:')}
            </label>
            <select
              id="gait-tug-norm-select"
              disabled={readOnly}
              value={selectedNorm.profileId}
              onChange={(e) =>
                handleUpdate({ tugPopulationProfile: e.target.value as TugPopulationProfile })
              }
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              {TUG_POPULATION_NORMS.map((norm) => (
                <option key={norm.profileId} value={norm.profileId}>
                  {bi(norm.populationAr, norm.populationEn)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cited Population Reference Range Table */}
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
            <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">
                {bi(selectedNorm.referenceRangeAr, selectedNorm.referenceRangeEn)}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {bi(selectedNorm.clinicalContextAr, selectedNorm.clinicalContextEn)}
              </p>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {selectedNorm.citation}
              </p>
            </div>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-teal-700 dark:text-teal-400 select-none">
              {bi('عرض جدول القيم المرجعية الموثقة حسب الفئات السكانية', 'View cited population reference table', 'پیشاندانی خشتەی بەها سەرچاوەپێکراوەکان بەپێی پۆلەکان')}
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                    <th className="py-1.5 px-2 text-start font-bold">
                      {bi('الفئة', 'Population', 'پۆل')}
                    </th>
                    <th className="py-1.5 px-2 text-start font-bold">
                      {bi('المدى المرجعي', 'Reference Range', 'مەودای سەرچاوە')}
                    </th>
                    <th className="py-1.5 px-2 text-start font-bold">
                      {bi('المرجع العلمي', 'Citation', 'سەرچاوەی زانستی')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                  {TUG_POPULATION_NORMS.map((norm) => (
                    <tr
                      key={norm.profileId}
                      className={
                        norm.profileId === selectedNorm.profileId
                          ? 'bg-teal-50/70 dark:bg-teal-950/30 font-semibold'
                          : ''
                      }
                    >
                      <td className="py-1.5 px-2 text-slate-800 dark:text-slate-200">
                        {bi(norm.populationAr, norm.populationEn)}
                      </td>
                      <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">
                        {bi(norm.referenceRangeAr, norm.referenceRangeEn)}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-slate-500 dark:text-slate-400">
                        {norm.citation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </div>

      {/* Gait Pattern & Assistive Device */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gait Pattern */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-850 space-y-2">
          <label htmlFor="gait-pattern-select" className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            {bi('نمط المشي السريري (Gait Pattern):', 'Clinical Gait Pattern:', 'شێوازی ڕۆیشتنی کلینیکی (Gait Pattern):')}
          </label>
          <select
            id="gait-pattern-select"
            disabled={readOnly}
            value={currentData.gaitPattern}
            onChange={(e) => handleUpdate({ gaitPattern: e.target.value as GaitPostureData['gaitPattern'] })}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium"
          >
            <option value="normal">{bi('طبيعي ومتناسق (Normal)', 'Normal', 'ئاسایی و هاوسەنگ (Normal)')}</option>
            <option value="antalgic">{bi('مشية تفادي الألم / أعرج (Antalgic Gait)', 'Antalgic', 'ڕۆیشتنی خۆپاراستن لە ئازار (Antalgic)')}</option>
            <option value="trendelenburg">{bi('مشية ترندلنبورغ / ضعف الألوية (Trendelenburg)', 'Trendelenburg', 'ڕۆیشتنی ترێندێلنبۆرگ (Trendelenburg)')}</option>
            <option value="steppage">{bi('مشية هبوط القدم (Steppage / Foot Drop)', 'Steppage / Foot Drop', 'ڕۆیشتنی کەوتنی پێ (Steppage)')}</option>
            <option value="ataxic">{bi('مشية رنحية غير متزنة (Ataxic)', 'Ataxic', 'ڕۆیشتنی ناهاوسەنگ (Ataxic)')}</option>
            <option value="other">{bi('نمط آخر (Other)', 'Other', 'شێوازی تر (Other)')}</option>
          </select>
        </div>

        {/* Assistive Device */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-850 space-y-2">
          <label htmlFor="gait-device-select" className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            {bi('الأداة المساعدة على المشي:', 'Assistive Device:', 'ئامرازی یارمەتیدەر بۆ ڕۆیشتن:')}
          </label>
          <select
            id="gait-device-select"
            disabled={readOnly}
            value={currentData.assistiveDevice}
            onChange={(e) => handleUpdate({ assistiveDevice: e.target.value as GaitPostureData['assistiveDevice'] })}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium"
          >
            <option value="none">{bi('بدون أداة مساعدة (Independent / None)', 'None (Independent)', 'بەبێ ئامرازی یارمەتیدەر (سەربەخۆ)')}</option>
            <option value="single_cane">{bi('عكاز مفرد (Single Cane)', 'Single Cane', 'دارعەسای تاک (Single Cane)')}</option>
            <option value="crutches">{bi('عكازان كوعيان أو إبطيان (Crutches)', 'Crutches', 'دارعەسای ئانیشک یان بنباڵ (Crutches)')}</option>
            <option value="walker">{bi('مشاية إطار (Walker / Zimmer Frame)', 'Walker', 'ڕێکەری چوارچێوە (Walker)')}</option>
            <option value="other">{bi('أخرى (Other)', 'Other', 'هی تر (Other)')}</option>
          </select>
        </div>
      </div>

      {/* Postural Deviations Multi-Select */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-850 space-y-2.5">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
          {bi('المشاهدات الميكانيكية للقوام (Postural Deviations):', 'Postural Deviations Observed:', 'تێبینییە میکانیکییەکانی شێوازی وەستان (Posture):')}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {POSTURE_DEVIATIONS_LIST.map((dev) => {
            const isSelected = currentData.postureDeviations.includes(dev.id);
            return (
              <button
                key={dev.id}
                type="button"
                disabled={readOnly}
                onClick={() => toggleDeviation(dev.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                  isSelected
                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/80 hover:bg-slate-100'
                }`}
              >
                {bi(dev.ar, dev.en)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
