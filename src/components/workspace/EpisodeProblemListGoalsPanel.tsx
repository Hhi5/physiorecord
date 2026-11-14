// =======================================================================
// PhysioRecord — Episode Problem List & Outcome-Linked Goals (Phase B2)
// Free-text + ICF-style tags + outcome-linked goals with automatic MCID
// evaluation (improving / unchanged / worse).
// =======================================================================

import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  EpisodeProblemItem,
  EpisodeScopedClinicalStore,
  OutcomeLinkedGoal,
} from '../../types/clinicManagement';
import { OUTCOME_INSTRUMENTS } from '../../utils/outcomeMeasures';
import {
  buildLatestScoreByInstrumentMap,
  evaluateOutcomeGoalStatus,
} from '../../utils/reEvalNudge';
import { DatePickerInput, Num } from '../ui/Primitives';
import { formatClinicalDate } from '../../utils/date';
import { CheckCircle2, ListChecks, Plus, Target, Trash2 } from 'lucide-react';

interface EpisodeProblemListGoalsPanelProps {
  episodeStore: EpisodeScopedClinicalStore;
  onUpdateStore: (patch: Partial<EpisodeScopedClinicalStore>) => void;
}

const PROBLEM_CATEGORIES: Array<{
  id: EpisodeProblemItem['category'];
  ar: string;
  en: string;
  ckb: string;
}> = [
  { id: 'impairment', ar: 'خلل بنيوي/وظيفي', en: 'Impairment', ckb: 'کەموكوڕی پێکهاتەیی/فرمانی' },
  { id: 'activity_limitation', ar: 'صعوبة نشاط يومي', en: 'Activity Limitation', ckb: 'سەختی چالاکی ڕۆژانە' },
  { id: 'participation_restriction', ar: 'قيد مشاركة/عمل/رياضة', en: 'Participation Restriction', ckb: 'سنوورداری بەشداریکردن/کار/وەرزش' },
];

export const EpisodeProblemListGoalsPanel: React.FC<EpisodeProblemListGoalsPanelProps> = ({
  episodeStore,
  onUpdateStore,
}) => {
  const { language, bi } = useLanguage();
  const [problemText, setProblemText] = useState('');
  const [problemCategory, setProblemCategory] =
    useState<EpisodeProblemItem['category']>('activity_limitation');

  const [goalTitle, setGoalTitle] = useState('');
  const [goalInstrument, setGoalInstrument] =
    useState<OutcomeLinkedGoal['linkedInstrumentId']>(
      (episodeStore.functionalScales?.scaleId &&
      episodeStore.functionalScales.scaleId !== 'oswestry' &&
      episodeStore.functionalScales.scaleId !== 'custom'
        ? episodeStore.functionalScales.scaleId
        : 'nprs') as OutcomeLinkedGoal['linkedInstrumentId']
    );
  const [baselineInput, setBaselineInput] = useState<string>(() => {
    if (episodeStore.functionalScales?.rawScore !== undefined) {
      return String(episodeStore.functionalScales.rawScore);
    }
    return String(episodeStore.painOnActivityNrs ?? 6);
  });
  const [targetInput, setTargetInput] = useState<string>('2');
  const [targetDate, setTargetDate] = useState<string>('');

  const problems = episodeStore.problemList || [];
  const outcomeGoals = episodeStore.outcomeGoals || [];

  // Map latest recorded score per instrument from functionalScales history / current
  const latestScoreByInstrument = useMemo(
    () => buildLatestScoreByInstrumentMap(episodeStore.functionalScales),
    [episodeStore.functionalScales]
  );

  const handleAddProblem = () => {
    const clean = problemText.trim();
    if (!clean) return;
    const item: EpisodeProblemItem = {
      id: `prob_${Date.now()}`,
      text: clean,
      category: problemCategory,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    onUpdateStore({ problemList: [...problems, item] });
    setProblemText('');
  };

  const handleToggleProblemStatus = (id: string) => {
    onUpdateStore({
      problemList: problems.map((p) =>
        p.id === id ? { ...p, status: p.status === 'active' ? 'resolved' : 'active' } : p
      ),
    });
  };

  const handleRemoveProblem = (id: string) => {
    onUpdateStore({ problemList: problems.filter((p) => p.id !== id) });
  };

  const handleAddGoal = () => {
    const cleanTitle = goalTitle.trim();
    const baseline = Number(baselineInput);
    const target = Number(targetInput);
    if (!cleanTitle || Number.isNaN(baseline) || Number.isNaN(target)) return;

    const current = latestScoreByInstrument.get(goalInstrument);
    const item: OutcomeLinkedGoal = {
      id: `goal_${Date.now()}`,
      title: cleanTitle,
      linkedInstrumentId: goalInstrument,
      baselineScore: baseline,
      ...(current !== undefined ? { currentScore: current } : {}),
      targetScore: target,
      targetDate,
      createdAt: new Date().toISOString(),
    };
    onUpdateStore({ outcomeGoals: [...outcomeGoals, item] });
    setGoalTitle('');
  };

  const handleUpdateGoalCurrentScore = (goalId: string, val: string) => {
    const num = val.trim() === '' ? undefined : Number(val);
    onUpdateStore({
      outcomeGoals: outcomeGoals.map((g) =>
        g.id === goalId
          ? { ...g, currentScore: num !== undefined && !Number.isNaN(num) ? num : undefined }
          : g
      ),
    });
  };

  const handleRemoveGoal = (goalId: string) => {
    onUpdateStore({ outcomeGoals: outcomeGoals.filter((g) => g.id !== goalId) });
  };

  return (
    <div
      data-testid="problem-list-goals-panel"
      className="grid grid-cols-1 lg:grid-cols-2 gap-4"
    >
      {/* Left: Episode Problem List */}
      <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-card-divider pb-2.5">
          <div className="flex items-center gap-2 text-xs font-extrabold text-foreground">
            <ListChecks className="size-4 text-primary" />
            <span>
              {bi(
                'قائمة مشاكل الحلقة السريرية (Problem List)',
                'Episode Problem List'
              )}
            </span>
          </div>
          <span className="text-xs text-muted-foreground-1 font-semibold">
            <Num value={problems.filter((p) => p.status === 'active').length} />{' '}
            {bi('نشطة', 'Active')}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            data-testid="problem-list-input"
            value={problemText}
            onChange={(e) => setProblemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddProblem();
              }
            }}
            placeholder={bi(
              'مثال: صعوبة صعود الدرج بسبب ضعف الرباعية...',
              'e.g., Difficulty climbing stairs due to quad weakness...'
            )}
            className="flex-1 px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
          />
          <select
            value={problemCategory}
            onChange={(e) =>
              setProblemCategory(e.target.value as EpisodeProblemItem['category'])
            }
            className="px-2.5 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
          >
            {PROBLEM_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {bi(cat.ar, cat.en, cat.ckb)}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="problem-list-add-btn"
            onClick={handleAddProblem}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="size-3.5" />
            <span>{bi('إضافة', 'Add')}</span>
          </button>
        </div>

        {problems.length === 0 ? (
          <p className="text-xs text-muted-foreground-2 italic py-2">
            {bi(
              'لم تُسجل مشاكل بعد. أضف القيود الحركية أو النشاطات المتأثرة.',
              'No problems listed yet. Add key impairments or functional limitations.'
            )}
          </p>
        ) : (
          <div className="space-y-2">
            {problems.map((prob) => {
              const cat = PROBLEM_CATEGORIES.find((c) => c.id === prob.category);
              const resolved = prob.status === 'resolved';
              return (
                <div
                  key={prob.id}
                  className="p-2.5 rounded-xl bg-surface border border-line-2 flex items-center justify-between gap-2 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleProblemStatus(prob.id)}
                    className="flex items-start gap-2 text-start flex-1 cursor-pointer"
                  >
                    <CheckCircle2
                      className={`size-4 shrink-0 mt-0.5 ${
                        resolved ? 'text-emerald-600' : 'text-muted-foreground-2'
                      }`}
                    />
                    <div className="space-y-0.5">
                      <span
                        className={`font-semibold block ${
                          resolved ? 'line-through text-muted-foreground-2' : 'text-foreground'
                        }`}
                      >
                        {prob.text}
                      </span>
                      <span className="inline-block px-2 py-0.5 rounded-md bg-layer border border-layer-line text-xs text-muted-foreground-1">
                        {cat ? bi(cat.ar, cat.en, cat.ckb) : prob.category}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={bi('حذف المشكلة', 'Delete problem')}
                    onClick={() => handleRemoveProblem(prob.id)}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10 cursor-pointer shrink-0"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Outcome-Linked Goals with Target Date & Auto MCID Status */}
      <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-card-divider pb-2.5">
          <div className="flex items-center gap-2 text-xs font-extrabold text-foreground">
            <Target className="size-4 text-primary" />
            <span>
              {bi(
                'الأهداف المرتبطة بالمقاييس (Outcome-Linked Goals)',
                'Outcome-Linked Goals (Auto MCID)'
              )}
            </span>
          </div>
          <span className="text-xs text-muted-foreground-1 font-semibold">
            <Num value={outcomeGoals.length} /> {bi('هدف', 'Goals')}
          </span>
        </div>

        <div className="space-y-2 p-3 rounded-xl bg-surface border border-line-2 text-xs">
          <input
            type="text"
            data-testid="outcome-goal-title-input"
            value={goalTitle}
            onChange={(e) => setGoalTitle(e.target.value)}
            placeholder={bi(
              'وصف الهدف الوظيفي (مثال: تقليل إعاقة الظهر ODI من 48 إلى 24)...',
              'Goal description (e.g., Reduce ODI from 48 to 24 for pain-free prayer)...'
            )}
            className="w-full px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-xs text-muted-foreground-1 block mb-0.5">
                {bi('المقياس', 'Measure')}
              </label>
              <select
                data-testid="outcome-goal-instrument-select"
                value={goalInstrument}
                onChange={(e) => {
                  const nextId = e.target.value as OutcomeLinkedGoal['linkedInstrumentId'];
                  setGoalInstrument(nextId);
                  const matched = latestScoreByInstrument.get(nextId);
                  if (matched !== undefined) setBaselineInput(String(matched));
                }}
                className="w-full px-2 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground"
              >
                {Object.values(OUTCOME_INSTRUMENTS).map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground-1 block mb-0.5">
                {bi('الأساس (Baseline)', 'Baseline')}
              </label>
              <input
                type="number"
                dir="ltr"
                data-testid="outcome-goal-baseline-input"
                value={baselineInput}
                onChange={(e) => setBaselineInput(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-layer border border-layer-line font-mono text-center text-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground-1 block mb-0.5">
                {bi('المستهدف (Target)', 'Target')}
              </label>
              <input
                type="number"
                dir="ltr"
                data-testid="outcome-goal-target-input"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-layer border border-layer-line font-mono text-center text-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground-1 block mb-0.5">
                {bi('تاريخ الاستحقاق', 'Target Date')}
              </label>
              <DatePickerInput
                value={targetDate}
                onChange={setTargetDate}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="outcome-goal-add-btn"
              onClick={handleAddGoal}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>{bi('إضافة هدف مرتبط بمقياس', 'Add Outcome Goal')}</span>
            </button>
          </div>
        </div>

        {outcomeGoals.length > 0 && (
          <div className="space-y-2">
            {outcomeGoals.map((goal) => {
              const effectiveCurrent =
                goal.currentScore ?? latestScoreByInstrument.get(goal.linkedInstrumentId);
              const evalRes = evaluateOutcomeGoalStatus(goal, effectiveCurrent);
              const spec = OUTCOME_INSTRUMENTS[goal.linkedInstrumentId];
              const badgeCls =
                evalRes.status === 'improving'
                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : evalRes.status === 'worse'
                  ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30'
                  : evalRes.status === 'unchanged'
                  ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30'
                  : 'bg-muted text-muted-foreground-1 border-line-2';

              return (
                <div
                  key={goal.id}
                  data-testid={`outcome-goal-card-${goal.id}`}
                  className="p-3 rounded-xl bg-surface border border-line-2 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-foreground">
                      <span className="font-mono text-primary me-1.5">[{spec?.code}]</span>
                      <span>{goal.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        data-testid={`outcome-goal-status-${evalRes.status}`}
                        className={`px-2.5 py-0.5 rounded-full font-bold border ${badgeCls}`}
                      >
                        {language === 'en'
                          ? evalRes.labelEn
                          : language === 'ckb'
                          ? evalRes.labelCkb
                          : evalRes.labelAr}
                      </span>
                      <button
                        type="button"
                        aria-label={bi('حذف الهدف', 'Delete goal')}
                        onClick={() => handleRemoveGoal(goal.id)}
                        className="p-1 text-rose-600 hover:bg-rose-500/10 rounded cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-muted-foreground-1">
                    <span>
                      {bi('الأساس:', 'Baseline:')}{' '}
                      <bdi dir="ltr" className="font-mono font-bold text-foreground">
                        {goal.baselineScore}
                      </bdi>
                    </span>
                    <label className="inline-flex items-center gap-1.5">
                      <span>{bi('الحالي:', 'Current:')}</span>
                      <input
                        type="number"
                        dir="ltr"
                        aria-label={bi('النتيجة الحالية للهدف', 'Current goal score')}
                        value={effectiveCurrent ?? ''}
                        onChange={(e) => handleUpdateGoalCurrentScore(goal.id, e.target.value)}
                        className="w-16 px-2 py-0.5 rounded bg-layer border border-layer-line font-mono text-center text-foreground"
                      />
                    </label>
                    <span>
                      {bi('المستهدف:', 'Target:')}{' '}
                      <bdi dir="ltr" className="font-mono font-bold text-foreground">
                        {goal.targetScore}
                      </bdi>
                    </span>
                    {goal.targetDate && (
                      <span>
                        {bi('الموعد:', 'Due:')}{' '}
                        <bdi dir="ltr" className="font-mono">
                          {formatClinicalDate(goal.targetDate)}
                        </bdi>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
