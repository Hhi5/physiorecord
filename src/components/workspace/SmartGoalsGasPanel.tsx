// =======================================================================
// PhysioRecord — Optional SMART Goals & Goal Attainment Scaling (GAS) Panel
// Phase 3.3 | Off by default per R6 (Settings > Modules -> enableSmartGoalsGas)
// Supports S/M/A/R/T breakdown fields and GAS -2 to +2 scoring per goal.
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { GoalAttainmentScore, StructuredRehabGoal } from '../../types/clinical';
import { Num } from '../ui/Primitives';
import { Target, Plus, Trash2, CheckCircle2, Sparkles } from 'lucide-react';

export interface SmartGoalsGasPanelProps {
  goals: StructuredRehabGoal[];
  onChange: (nextGoals: StructuredRehabGoal[]) => void;
  readOnly?: boolean;
}

export const GAS_LEVEL_LABELS: Array<{
  score: GoalAttainmentScore;
  badge: string;
  ar: string;
  en: string;
}> = [
  { score: -2, badge: '-2', ar: 'أقل بكثير (الأساس الأسوأ)', en: 'Much less than expected' },
  { score: -1, badge: '-1', ar: 'أقل من المتوقع', en: 'Somewhat less than expected' },
  { score: 0, badge: '0', ar: 'المتوقع (الهدف الأساسي)', en: 'Expected outcome' },
  { score: 1, badge: '+1', ar: 'أفضل من المتوقع', en: 'Somewhat more than expected' },
  { score: 2, badge: '+2', ar: 'أفضل بكثير من المتوقع', en: 'Much more than expected' },
];

export function computeSmartGoalsGasSummary(goals: StructuredRehabGoal[]): {
  totalGoals: number;
  gasScoredCount: number;
  meanGasScore: number | null;
  achievedCount: number;
} {
  const gasGoals = goals.filter((g) => typeof g.gasScore === 'number');
  const achievedCount = goals.filter(
    (g) => g.status === 'achieved' || (typeof g.gasScore === 'number' && g.gasScore >= 0)
  ).length;
  const meanGasScore =
    gasGoals.length > 0
      ? Number(
          (
            gasGoals.reduce((sum, g) => sum + (g.gasScore ?? 0), 0) / gasGoals.length
          ).toFixed(2)
        )
      : null;

  return {
    totalGoals: goals.length,
    gasScoredCount: gasGoals.length,
    meanGasScore,
    achievedCount,
  };
}

export const SmartGoalsGasPanel: React.FC<SmartGoalsGasPanelProps> = ({
  goals,
  onChange,
  readOnly = false,
}) => {
  const { bi, isRtl } = useLanguage();
  const [moduleEnabled, setModuleEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isSmartGoalsGasEnabled()
  );

  // New SMART Goal Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<StructuredRehabGoal['horizon']>('short_term');
  const [description, setDescription] = useState('');
  const [specific, setSpecific] = useState('');
  const [measurable, setMeasurable] = useState('');
  const [achievable, setAchievable] = useState('');
  const [relevant, setRelevant] = useState('');
  const [timeBound, setTimeBound] = useState('');
  const [gasScore, setGasScore] = useState<GoalAttainmentScore>(0);

  useEffect(() => {
    const sync = () => setModuleEnabled(ClinicOperationsService.isSmartGoalsGasEnabled());
    const unsub = ClinicOperationsService.subscribe(sync);
    window.addEventListener('physiorecord-modules-updated', sync);
    return () => {
      unsub();
      window.removeEventListener('physiorecord-modules-updated', sync);
    };
  }, []);

  const summary = useMemo(() => computeSmartGoalsGasSummary(goals), [goals]);

  const handleEnableModule = () => {
    ClinicOperationsService.setSmartGoalsGasEnabled(true);
    setModuleEnabled(true);
  };

  const handleCreateGoal = () => {
    if (readOnly) return;
    const summaryDesc = description.trim() || specific.trim();
    if (!summaryDesc) return;

    const newGoal: StructuredRehabGoal = {
      id: `smart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      horizon,
      description: summaryDesc,
      targetMetric: measurable.trim() || undefined,
      progressPercent: gasScore >= 0 ? 100 : gasScore === -1 ? 50 : 10,
      status: gasScore >= 0 ? 'achieved' : 'in_progress',
      smart: {
        specific: specific.trim() || summaryDesc,
        measurable: measurable.trim(),
        achievable: achievable.trim(),
        relevant: relevant.trim(),
        timeBound: timeBound.trim(),
      },
      gasScore,
      gasEvaluatedAt: new Date().toISOString().slice(0, 10),
    };

    onChange([...goals, newGoal]);
    setDescription('');
    setSpecific('');
    setMeasurable('');
    setAchievable('');
    setRelevant('');
    setTimeBound('');
    setGasScore(0);
    setShowAddForm(false);
  };

  const handleUpdateGas = (goalId: string, nextScore: GoalAttainmentScore) => {
    if (readOnly) return;
    onChange(
      goals.map((g) =>
        g.id !== goalId
          ? g
          : {
              ...g,
              gasScore: nextScore,
              status: nextScore >= 0 ? 'achieved' : 'in_progress',
              progressPercent:
                nextScore >= 2
                  ? 100
                  : nextScore === 1
                  ? 100
                  : nextScore === 0
                  ? 100
                  : nextScore === -1
                  ? 50
                  : 10,
              gasEvaluatedAt: new Date().toISOString().slice(0, 10),
            }
      )
    );
  };

  const handleDeleteGoal = (goalId: string) => {
    if (readOnly) return;
    onChange(goals.filter((g) => g.id !== goalId));
  };

  if (!moduleEnabled && goals.length === 0) {
    return (
      <div
        className="p-3.5 rounded-xl bg-surface border border-dashed border-layer-line flex flex-wrap items-center justify-between gap-2.5"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground-1">
          <Target className="size-4 text-primary shrink-0" />
          <span>
            {bi(
              'أهداف SMART التفصيلية ومقياس GAS (-2 إلى +2) مخفية لتبسيط الإدخال اليومي.',
              'Structured SMART Goals & GAS (-2 to +2) are optional and hidden by default.'
            )}
          </span>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={handleEnableModule}
            className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Sparkles className="size-3.5" />
            <span>
              {bi('تفعيل أهداف SMART ومقياس GAS', 'Enable SMART Goals & GAS')}
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="p-4 rounded-xl bg-surface border border-card-line space-y-3"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-primary" />
          <h5 className="text-xs font-bold text-foreground">
            {bi(
              'أهداف SMART السريرية ومقياس تحقيق الهدف (GAS -2 إلى +2)',
              'SMART Rehabilitation Goals & Goal Attainment Scaling (GAS -2 to +2)'
            )}
          </h5>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {summary.meanGasScore !== null && (
            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25 text-xs font-bold tabular-nums">
              {bi('متوسط GAS:', 'Mean GAS:')}{' '}
              <Num value={summary.meanGasScore > 0 ? `+${summary.meanGasScore}` : summary.meanGasScore} />
            </span>
          )}
          {!moduleEnabled && !readOnly && (
            <button
              type="button"
              onClick={handleEnableModule}
              className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold cursor-pointer"
            >
              {bi('تفعيل التحرير الدائم', 'Enable Module')}
            </button>
          )}
          {moduleEnabled && !readOnly && (
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Plus className="size-3.5" />
              <span>{bi('إضافة هدف SMART', 'Add SMART Goal')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Structured Add SMART Goal Builder */}
      {moduleEnabled && showAddForm && !readOnly && (
        <div className="p-3.5 rounded-xl bg-layer border border-layer-line space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">
                {bi('المدى الزمني', 'Goal Horizon')}
              </label>
              <select
                value={horizon}
                onChange={(e) => setHorizon(e.target.value as StructuredRehabGoal['horizon'])}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs"
              >
                <option value="short_term">{bi('قصير المدى (2-4 أسابيع)', 'Short-Term (2-4 wks)')}</option>
                <option value="long_term">{bi('طويل المدى (6-12 أسبوعاً)', 'Long-Term (6-12 wks)')}</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-foreground mb-1">
                {bi('ملخص الهدف الوظيفي *', 'Goal Statement Summary *')}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={bi(
                  'مثال: صعود الدرج دون ألم وبلوغ ثني الركبة 120° خلال 4 أسابيع',
                  'e.g., Ascend stairs pain-free with >= 120° knee flexion in 4 weeks'
                )}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <div>
              <label className="block text-xs font-bold text-primary mb-1">
                S — {bi('محدد', 'Specific')}
              </label>
              <input
                type="text"
                value={specific}
                onChange={(e) => setSpecific(e.target.value)}
                placeholder={bi('المهمة أو الحركة', 'Target activity')}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-primary mb-1">
                M — {bi('قابل للقياس', 'Measurable')}
              </label>
              <input
                type="text"
                value={measurable}
                onChange={(e) => setMeasurable(e.target.value)}
                placeholder={bi('NPRS ≤ 2 أو ROM 120°', 'e.g., NPRS <= 2 / 120°')}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-primary mb-1">
                A — {bi('واقعي', 'Achievable')}
              </label>
              <input
                type="text"
                value={achievable}
                onChange={(e) => setAchievable(e.target.value)}
                placeholder={bi('مناسب لحالة المريض', 'Realistic baseline')}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-primary mb-1">
                R — {bi('ذي صلة', 'Relevant')}
              </label>
              <input
                type="text"
                value={relevant}
                onChange={(e) => setRelevant(e.target.value)}
                placeholder={bi('الصلاة / العمل / المشي', 'ADLs / Prayer / Work')}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-primary mb-1">
                T — {bi('بوقت محدد', 'Time-bound')}
              </label>
              <input
                type="text"
                value={timeBound}
                onChange={(e) => setTimeBound(e.target.value)}
                placeholder={bi('4 أسابيع / 12 جلسة', '4 weeks / 12 visits')}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground">
                {bi('مقياس GAS الأولي:', 'Initial GAS Score:')}
              </span>
              {GAS_LEVEL_LABELS.map((lvl) => (
                <button
                  key={lvl.score}
                  type="button"
                  onClick={() => setGasScore(lvl.score)}
                  title={bi(lvl.ar, lvl.en)}
                  className={`px-2 py-1 rounded-md text-xs font-mono font-bold border cursor-pointer ${
                    gasScore === lvl.score
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-surface text-foreground border-layer-line hover:bg-layer-hover'
                  }`}
                >
                  {lvl.badge}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 rounded-lg bg-surface border border-layer-line text-xs font-semibold text-muted-foreground-1 cursor-pointer"
              >
                {bi('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreateGoal}
                className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {bi('حفظ الهدف', 'Save Goal')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing SMART / GAS Goal Cards */}
      {goals.length > 0 ? (
        <div className="space-y-2">
          {goals.map((g) => (
            <div
              key={g.id}
              className="p-3 rounded-xl bg-card border border-layer-line space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold">
                      {g.horizon === 'short_term'
                        ? bi('قصير المدى', 'Short-Term')
                        : bi('طويل المدى', 'Long-Term')}
                    </span>
                    {g.status === 'achieved' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                        <CheckCircle2 className="size-3" />
                        <span>{bi('محقق', 'Achieved')}</span>
                      </span>
                    )}
                    <span className="text-xs font-bold text-foreground">{g.description}</span>
                  </div>
                  {g.smart && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground-1">
                      {g.smart.measurable && (
                        <span>
                          <strong className="text-foreground">M:</strong> {g.smart.measurable}
                        </span>
                      )}
                      {g.smart.achievable && (
                        <span>
                          <strong className="text-foreground">A:</strong> {g.smart.achievable}
                        </span>
                      )}
                      {g.smart.relevant && (
                        <span>
                          <strong className="text-foreground">R:</strong> {g.smart.relevant}
                        </span>
                      )}
                      {g.smart.timeBound && (
                        <span>
                          <strong className="text-foreground">T:</strong> {g.smart.timeBound}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {!readOnly &&
                  (confirmDeleteGoalId === g.id ? (
                    <div className="inline-flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          handleDeleteGoal(g.id);
                          setConfirmDeleteGoalId(null);
                        }}
                        className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-xs font-bold cursor-pointer"
                      >
                        {bi('تأكيد', 'Confirm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteGoalId(null)}
                        className="px-2 py-0.5 rounded-md bg-surface border border-line-2 text-xs text-muted-foreground-1 cursor-pointer"
                      >
                        {bi('إلغاء', 'Cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteGoalId(g.id)}
                      aria-label={bi('حذف الهدف', 'Remove goal')}
                      className="p-1 text-muted-foreground-2 hover:text-rose-600 cursor-pointer shrink-0"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ))}
              </div>

              {/* GAS (-2..+2) Selector Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-layer-line/60">
                <span className="text-xs font-semibold text-muted-foreground-1">
                  {bi('تقييم تحقيق الهدف (GAS):', 'Goal Attainment Scale (GAS):')}
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {GAS_LEVEL_LABELS.map((lvl) => {
                    const active = g.gasScore === lvl.score;
                    return (
                      <button
                        key={lvl.score}
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleUpdateGas(g.id, lvl.score)}
                        title={bi(lvl.ar, lvl.en)}
                        className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold border transition-colors cursor-pointer disabled:cursor-default ${
                          active
                            ? lvl.score >= 0
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-amber-600 text-white border-amber-600'
                            : 'bg-surface text-foreground border-layer-line hover:bg-layer-hover'
                        }`}
                      >
                        {lvl.badge}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground-1">
          {bi(
            'لم تُضف أهداف SMART مهيكلة لهذه الحلقة بعد.',
            'No structured SMART goals documented for this episode yet.'
          )}
        </p>
      )}
    </div>
  );
};
