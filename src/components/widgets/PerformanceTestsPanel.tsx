// =======================================================================
// PhysioRecord — Procedural Functional Performance-Test Library (Phase B5)
// LSI, 10MWT, 6MWT, Single-Leg Stance, 30s-CST, 5xSTS, Grip Strength.
// ALL thresholds display "Needs expert verification" until reviewed.
// =======================================================================

import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  PerformanceTestId,
  PerformanceTestResultEntry,
} from '../../types/clinicManagement';
import {
  CHAIR_STAND_30S_CUTOFFS,
  computePerformanceTestResult,
  GRIP_STRENGTH_NORMS_KG,
  PERFORMANCE_TESTS_CATALOG,
} from '../../data/clinicalToolkit/performanceTestsCatalog';
import { formatClinicalDate } from '../../utils/date';
import { Activity, AlertCircle, BookOpen, Plus, Trash2 } from 'lucide-react';

interface PerformanceTestsPanelProps {
  entries: PerformanceTestResultEntry[];
  onChange: (updated: PerformanceTestResultEntry[]) => void;
  patientAge?: number;
  patientGender?: 'male' | 'female' | 'other';
  readOnly?: boolean;
}

export const PerformanceTestsPanel: React.FC<PerformanceTestsPanelProps> = ({
  entries,
  onChange,
  patientAge,
  patientGender,
  readOnly = false,
}) => {
  const { language, bi } = useLanguage();
  const [selectedTestId, setSelectedTestId] = useState<PerformanceTestId>('lsi');
  const [inputs, setInputs] = useState<Record<string, string>>({
    involved: '',
    uninvolved: '',
    distanceMeters: '6',
    timeSeconds: '',
    seconds: '',
    reps: '',
    rightKg: '',
    leftKg: '',
  });
  const [notes, setNotes] = useState('');
  const [showNormsTable, setShowNormsTable] = useState(false);

  const activeDef = useMemo(
    () =>
      PERFORMANCE_TESTS_CATALOG.find((t) => t.id === selectedTestId) ||
      PERFORMANCE_TESTS_CATALOG[0],
    [selectedTestId]
  );

  const livePreview = useMemo(() => {
    const numericMap: Record<string, number> = {};
    for (const [k, v] of Object.entries(inputs)) {
      if (v.trim() !== '' && !Number.isNaN(Number(v))) {
        numericMap[k] = Number(v);
      }
    }
    return computePerformanceTestResult({
      testId: selectedTestId,
      inputs: numericMap,
      age: patientAge,
      gender: patientGender,
    });
  }, [selectedTestId, inputs, patientAge, patientGender]);

  const handleSaveResult = () => {
    if (readOnly) return;
    const entry: PerformanceTestResultEntry = {
      id: `perf_${Date.now()}`,
      testId: selectedTestId,
      recordedAt: new Date().toISOString(),
      inputs: { ...inputs },
      computedValue: livePreview.computedValue,
      unit: livePreview.unit,
      interpretationAr: livePreview.interpretationAr,
      interpretationEn: livePreview.interpretationEn,
      notes: notes.trim() || undefined,
    };
    onChange([entry, ...entries]);
    setNotes('');
  };

  const handleDelete = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  return (
    <div
      data-testid="performance-tests-panel"
      className="p-3.5 sm:p-5 rounded-2xl pr-surface space-y-4 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.045] dark:border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {bi(
                'مكتبة اختبارات الأداء الوظيفي القياسية (Performance Tests)',
                'Procedural Performance-Test Library'
              )}
            </h3>
            <p className="text-xs text-muted-foreground-1">
              LSI · 10MWT · 6MWT · Single-Leg Stance · 30s-CST · 5xSTS · Grip Strength
            </p>
          </div>
        </div>

        <span
          data-testid="perf-expert-verification-badge"
          className="text-amber-700 dark:text-amber-400 text-xs font-semibold inline-flex items-center gap-1"
        >
          <AlertCircle className="size-3.5" />
          <span>
            {bi('العتبات المرجعية تتطلب مراجعة مختص', 'Thresholds need expert verification')}
          </span>
        </span>
      </div>

      {/* Test selector pills (Horizontally scrollable strip) */}
      <div className="rounded-2xl bg-surface/60 p-1 overflow-hidden">
        <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
          {PERFORMANCE_TESTS_CATALOG.map((t) => {
            const active = t.id === selectedTestId;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`perf-test-tab-${t.id}`}
                onClick={(e) => {
                  setSelectedTestId(t.id);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={`compact-btn h-8 px-3 rounded-xl font-bold cursor-pointer transition-all whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-card hover:bg-surface text-foreground'
                }`}
              >
                {t.code}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active test procedure card + inputs */}
      <div className="p-3.5 rounded-2xl bg-surface/65 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-extrabold text-foreground">
              {language === 'en' ? activeDef.nameEn : activeDef.nameAr}
            </p>
            <p className="text-muted-foreground-1 mt-0.5 leading-relaxed">
              {language === 'en' ? activeDef.procedureSummaryEn : activeDef.procedureSummaryAr}
            </p>
          </div>
          <span dir="ltr" className="px-2 py-0.5 rounded-lg bg-card font-mono font-bold">
            {activeDef.formulaDescription}
          </span>
        </div>

        {/* Inputs by test */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {selectedTestId === 'lsi' && (
            <>
              <div>
                <label htmlFor="perf-input-involved" className="font-semibold block mb-1">
                  {bi('الطرف المصاب (Involved)', 'Involved Limb')}
                </label>
                <input
                  id="perf-input-involved"
                  type="number"
                  step="any"
                  dir="ltr"
                  data-testid="perf-input-involved"
                  value={inputs.involved}
                  onChange={(e) => setInputs((p) => ({ ...p, involved: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-foreground"
                />
              </div>
              <div>
                <label htmlFor="perf-input-uninvolved" className="font-semibold block mb-1">
                  {bi('الطرف السليم (Uninvolved)', 'Uninvolved Limb')}
                </label>
                <input
                  id="perf-input-uninvolved"
                  type="number"
                  step="any"
                  dir="ltr"
                  data-testid="perf-input-uninvolved"
                  value={inputs.uninvolved}
                  onChange={(e) => setInputs((p) => ({ ...p, uninvolved: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-foreground"
                />
              </div>
            </>
          )}

          {selectedTestId === 'walk_10m' && (
            <>
              <div>
                <label htmlFor="perf-input-10m-distance" className="font-semibold block mb-1">
                  {bi('المسافة الموقّتة (م)', 'Timed Distance (m)')}
                </label>
                <input
                  id="perf-input-10m-distance"
                  type="number"
                  step="any"
                  dir="ltr"
                  value={inputs.distanceMeters}
                  onChange={(e) => setInputs((p) => ({ ...p, distanceMeters: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-foreground"
                />
              </div>
              <div>
                <label htmlFor="perf-input-timeSeconds" className="font-semibold block mb-1">
                  {bi('الزمن (ثانية)', 'Time (s)')}
                </label>
                <input
                  id="perf-input-timeSeconds"
                  type="number"
                  step="any"
                  dir="ltr"
                  data-testid="perf-input-timeSeconds"
                  value={inputs.timeSeconds}
                  onChange={(e) => setInputs((p) => ({ ...p, timeSeconds: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-foreground"
                />
              </div>
            </>
          )}

          {selectedTestId === 'walk_6m' && (
            <div>
              <label htmlFor="perf-input-6m-distance" className="font-semibold block mb-1">
                {bi('المسافة خلال 6 دقائق (م)', '6-Min Distance (m)')}
              </label>
              <input
                id="perf-input-6m-distance"
                type="number"
                step="any"
                dir="ltr"
                value={inputs.distanceMeters}
                onChange={(e) => setInputs((p) => ({ ...p, distanceMeters: e.target.value }))}
                className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-foreground"
              />
            </div>
          )}

          {(selectedTestId === 'single_leg_stance' || selectedTestId === 'five_x_sts') && (
            <div>
              <label htmlFor="perf-input-seconds" className="font-semibold block mb-1">
                {bi('الزمن (ثانية)', 'Elapsed Seconds')}
              </label>
              <input
                id="perf-input-seconds"
                type="number"
                step="any"
                dir="ltr"
                value={inputs.seconds}
                onChange={(e) => setInputs((p) => ({ ...p, seconds: e.target.value }))}
                className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-foreground"
              />
            </div>
          )}

          {selectedTestId === 'chair_stand_30s' && (
            <div>
              <label htmlFor="perf-input-reps" className="font-semibold block mb-1">
                {bi('عدد التكرارات في 30 ث', 'Repetitions in 30s')}
              </label>
              <input
                id="perf-input-reps"
                type="number"
                dir="ltr"
                value={inputs.reps}
                onChange={(e) => setInputs((p) => ({ ...p, reps: e.target.value }))}
                className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-foreground"
              />
            </div>
          )}

          {selectedTestId === 'grip_strength' && (
            <>
              <div>
                <label htmlFor="perf-input-right-kg" className="font-semibold block mb-1">
                  {bi('اليد اليمنى (كغم)', 'Right Grip (kg)')}
                </label>
                <input
                  id="perf-input-right-kg"
                  type="number"
                  step="any"
                  dir="ltr"
                  value={inputs.rightKg}
                  onChange={(e) => setInputs((p) => ({ ...p, rightKg: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-foreground"
                />
              </div>
              <div>
                <label htmlFor="perf-input-left-kg" className="font-semibold block mb-1">
                  {bi('اليد اليسرى (كغم)', 'Left Grip (kg)')}
                </label>
                <input
                  id="perf-input-left-kg"
                  type="number"
                  step="any"
                  dir="ltr"
                  value={inputs.leftKg}
                  onChange={(e) => setInputs((p) => ({ ...p, leftKg: e.target.value }))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-card font-mono text-foreground"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="perf-input-notes" className="font-semibold block mb-1">
              {bi('ملاحظة سريرية (اختياري)', 'Clinical Note (optional)')}
            </label>
            <input
              id="perf-input-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-card text-foreground"
            />
          </div>
        </div>

        {/* Computed Value + Save Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/[0.045] dark:border-white/[0.06]">
          <div className="space-y-0.5">
            <p data-testid="perf-live-interpretation" className="font-bold text-primary">
              {language === 'en' ? livePreview.interpretationEn : livePreview.interpretationAr}
            </p>
            <p className="text-muted-foreground-1">
              {language === 'en'
                ? activeDef.referenceThresholdsNoteEn
                : activeDef.referenceThresholdsNoteAr}
            </p>
            <p className="text-muted-foreground-2 inline-flex items-center gap-1">
              <BookOpen className="size-3.5 shrink-0" />
              <bdi dir="ltr">{activeDef.citation}</bdi>
            </p>
          </div>

          {!readOnly && (
            <button
              type="button"
              data-testid="perf-save-result-btn"
              onClick={handleSaveResult}
              className="compact-btn h-9 px-4 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="size-3.5" />
              <span>{bi('حفظ القراءة', 'Record Result')}</span>
            </button>
          )}
        </div>

        {/* Normative Tables Drawer for Grip / 30s-CST */}
        {(selectedTestId === 'grip_strength' || selectedTestId === 'chair_stand_30s') && (
          <div>
            <button
              type="button"
              onClick={() => setShowNormsTable((v) => !v)}
              className="compact-btn h-8 text-xs font-bold text-primary underline cursor-pointer"
            >
              {showNormsTable
                ? bi('إخفاء جدول القيم المرجعية', 'Hide Reference Tables')
                : bi(
                    'عرض جدول القيم المرجعية حسب العمر والجنس (يتطلب مراجعة مختص)',
                    'Show Age/Sex Reference Tables (Needs expert verification)'
                  )}
            </button>

            {showNormsTable && selectedTestId === 'grip_strength' && (
              <div className="mt-2 overflow-x-auto rounded-xl bg-card">
                <table className="w-full text-xs text-center" dir="ltr">
                  <thead className="bg-surface/65 font-bold">
                    <tr>
                      <th className="p-2">Age</th>
                      <th className="p-2">Male R (kg)</th>
                      <th className="p-2">Male L (kg)</th>
                      <th className="p-2">Female R (kg)</th>
                      <th className="p-2">Female L (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GRIP_STRENGTH_NORMS_KG.map((row) => (
                      <tr key={row.ageRange} className="border-t border-black/[0.045] dark:border-white/[0.06] font-mono">
                        <td className="p-1.5 font-bold">{row.ageRange}</td>
                        <td className="p-1.5">{row.maleRightMeanKg} ± {row.maleRightSdKg}</td>
                        <td className="p-1.5">{row.maleLeftMeanKg} ± {row.maleLeftSdKg}</td>
                        <td className="p-1.5">{row.femaleRightMeanKg} ± {row.femaleRightSdKg}</td>
                        <td className="p-1.5">{row.femaleLeftMeanKg} ± {row.femaleLeftSdKg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showNormsTable && selectedTestId === 'chair_stand_30s' && (
              <div className="mt-2 overflow-x-auto rounded-xl bg-card">
                <table className="w-full text-xs text-center" dir="ltr">
                  <thead className="bg-surface/65 font-bold">
                    <tr>
                      <th className="p-2">Age</th>
                      <th className="p-2">Men Min Expected</th>
                      <th className="p-2">Women Min Expected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CHAIR_STAND_30S_CUTOFFS.map((row) => (
                      <tr key={row.ageRange} className="border-t border-black/[0.045] dark:border-white/[0.06] font-mono">
                        <td className="p-1.5 font-bold">{row.ageRange}</td>
                        <td className="p-1.5">{row.maleMinExpectedReps}</td>
                        <td className="p-1.5">{row.femaleMinExpectedReps}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recorded Performance History */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-bold text-foreground">
            {bi('السجل المسجل لاختبارات الأداء:', 'Recorded Performance History:')}
          </h4>
          <div className="space-y-1.5">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="p-2.5 rounded-xl bg-surface/65 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-foreground uppercase">
                      {entry.testId}
                    </span>
                    <bdi dir="ltr" className="font-mono font-bold text-primary">
                      {entry.computedValue} {entry.unit}
                    </bdi>
                    <span className="text-muted-foreground-2">
                      {formatClinicalDate(entry.recordedAt)}
                    </span>
                  </div>
                  <p className="text-muted-foreground-1">
                    {language === 'en' ? entry.interpretationEn : entry.interpretationAr}
                  </p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={bi('حذف القراءة', 'Delete measurement')}
                    onClick={() => handleDelete(entry.id)}
                    className="compact-btn size-8 rounded-xl text-rose-600 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
