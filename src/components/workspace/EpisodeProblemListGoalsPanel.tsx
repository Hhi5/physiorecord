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
import { CheckCircle2, ChevronDown, ListChecks, Plus, Target, Trash2 } from 'lucide-react';

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
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-black/[0.045] dark:border-white/[0.06] pb-2.5">
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
            aria-label={bi('وصف المشكلة السريرية', 'Clinical problem description', 'وەسفی کێشەی کلینیکی')}
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
            className="flex-1 px-3 py-2 rounded-xl bg-surface/75 text-xs text-foreground"
          />
          <select
            aria-label={bi('تصنيف المشكلة السريرية', 'Problem category', 'پۆلێنکردنی کێشە')}
            value={problemCategory}
            onChange={(e) =>
              setProblemCategory(e.target.value as EpisodeProblemItem['category'])
            }
            className="px-2.5 py-2 rounded-xl bg-surface/75 text-xs text-foreground"
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
            className="compact-btn min-h-[36px] px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="size-3.5" />
            <span>{bi('إضافة', 'Add')}</span>
          </button>
        </div>

        {problems.length === 0 ? (
          <p className="text-xs text-muted-foreground-2 italic py-1.5">
            {bi(
              'لم تُسجل مشاكل بعد. أضف القيود الحركية أو النشاطات المتأثرة.',
              'No problems listed yet. Add key impairments or functional limitations.'
            )}
          </p>
        ) : (
          <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06] rounded-xl bg-surface/55 overflow-hidden">
            {problems.map((prob) => {
              const cat = PROBLEM_CATEGORIES.find((c) => c.id === prob.category);
              const resolved = prob.status === 'resolved';
              return (
                <div
                  key={prob.id}
                  className="p-2.5 flex items-center justify-between gap-2 text-xs"
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
                      <span className="inline-block text-xs text-muted-foreground-1 font-medium">
                        {cat ? bi(cat.ar, cat.en, cat.ckb) : prob.category}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={bi('حذف المشكلة', 'Delete problem')}
                    onClick={() => handleRemoveProblem(prob.id)}
                    className="compact-btn p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10 cursor-pointer shrink-0"
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
      <div className="p-4 sm:p-5 rounded-2xl pr-surface space-y-3">
        <div className="flex items-center justify-between gap-2 border-b border-black/[0.045] dark:border-white/[0.06] pb-2.5">
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

        <div className="space-y-2 p-3 rounded-2xl bg-surface/60 text-xs">
          <input
            type="text"
            aria-label={bi('وصف الهدف الوظيفي', 'Functional goal description', 'وەسفی ئامانجی فەرمانی')}
            data-testid="outcome-goal-title-input"
            value={goalTitle}
            onChange={(e) => setGoalTitle(e.target.value)}
            placeholder={bi(
              'وصف الهدف الوظيفي (مثال: تقليل إعاقة الظهر ODI من 48 إلى 24)...',
              'Goal description (e.g., Reduce ODI from 48 to 24 for pain-free prayer)...'
            )}
            className="w-full px-3 py-1.5 rounded-xl bg-card text-foreground"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label htmlFor="goal-instrument-select" className="text-xs text-muted-foreground-1 block mb-0.5">
                {bi('المقياس', 'Measure')}
              </label>
              <div className="relative flex items-center">
                <select
                  id="goal-instrument-select"
                  data-testid="outcome-goal-instrument-select"
                  value={goalInstrument}
                  onChange={(e) => {
                    const nextId = e.target.value as OutcomeLinkedGoal['linkedInstrumentId'];
                    setGoalInstrument(nextId);
                    const matched = latestScoreByInstrument.get(nextId);
                    if (matched !== undefined) setBaselineInput(String(matched));
                  }}
                  className="w-full px-6 py-1.5 rounded-xl bg-card font-mono font-bold text-center appearance-none text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/25"
                  style={{ textAlign: 'center', textAlignLast: 'center' }}
                >
                  {Object.values(OUTCOME_INSTRUMENTS).map((inst) => (
                    <option key={inst.id} value={inst.id} className="text-center bg-card text-foreground">
                      {inst.code}
                    </option>
                  ))}
                </select>
                <ChevronDown className="size-3 text-muted-foreground-1 absolute start-2 pointer-events-none" />
              </div>
            </div>
            <div>
              <label htmlFor="goal-baseline-input" className="text-xs text-muted-foreground-1 block mb-0.5">
                {bi('الأساس (Baseline)', 'Baseline')}
              </label>
              <input
                id="goal-baseline-input"
                type="number"
                dir="ltr"
                data-testid="outcome-goal-baseline-input"
                value={baselineInput}
                onChange={(e) => setBaselineInput(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl bg-card font-mono text-center text-foreground"
              />
            </div>
            <div>
              <label htmlFor="goal-target-input" className="text-xs text-muted-foreground-1 block mb-0.5">
                {bi('المستهدف (Target)', 'Target')}
              </label>
              <input
                id="goal-target-input"
                type="number"
                dir="ltr"
                data-testid="outcome-goal-target-input"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl bg-card font-mono text-center text-foreground"
              />
            </div>
            <div>
              <label htmlFor="goal-target-date" className="text-xs text-muted-foreground-1 block mb-0.5">
                {bi('تاريخ الاستحقاق', 'Target Date')}
              </label>
              <DatePickerInput
                id="goal-target-date"
                ariaLabel={bi('تاريخ الاستحقاق', 'Target Date')}
                value={targetDate}
                onChange={setTargetDate}
              />
            </div>
          </div>
          <div className="flex justify-end pt-0.5">
            <button
              type="button"
              data-testid="outcome-goal-add-btn"
              onClick={handleAddGoal}
              className="compact-btn min-h-[34px] px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>{bi('إضافة هدف مرتبط بمقياس', 'Add Outcome Goal')}</span>
            </button>
          </div>
        </div>

        {outcomeGoals.length > 0 && (
          <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06] rounded-xl bg-surface/55 overflow-hidden">
            {outcomeGoals.map((goal) => {
              const effectiveCurrent =
                goal.currentScore ?? latestScoreByInstrument.get(goal.linkedInstrumentId);
              const evalRes = evaluateOutcomeGoalStatus(goal, effectiveCurrent);
              const spec = OUTCOME_INSTRUMENTS[goal.linkedInstrumentId];
              const badgeCls =
                evalRes.status === 'improving'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : evalRes.status === 'worse'
                  ? 'text-rose-700 dark:text-rose-400'
                  : evalRes.status === 'unchanged'
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-muted-foreground-1';

              return (
                <div
                  key={goal.id}
                  data-testid={`outcome-goal-card-${goal.id}`}
                  className="p-3 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-foreground">
                      <span className="font-mono text-primary me-1.5">[{spec?.code}]</span>
                      <span>{goal.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        data-testid={`outcome-goal-status-${evalRes.status}`}
                        className={`font-extrabold ${badgeCls}`}
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
                        className="compact-btn size-8 flex items-center justify-center p-1.5 text-rose-600 hover:bg-rose-500/10 rounded-lg cursor-pointer"
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
                        className="w-16 px-2 py-0.5 rounded-lg bg-card font-mono text-center text-foreground"
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
