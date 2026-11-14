// =======================================================================
// PhysioRecord — Outcome Goal MCID Evaluator & Re-Evaluation Nudge Engine
// Phase B2 (Problem List & Outcome-Linked Goals) + Phase B3 (Re-Eval Nudges)
// =======================================================================

import type { OutcomeLinkedGoal } from '../types/clinicManagement';
import type { FunctionalScaleEntry } from '../types/clinicalWidgets';
import { OUTCOME_INSTRUMENTS } from './outcomeMeasures';
import { localDate } from './date';

export type OutcomeGoalMcidStatus = 'improving' | 'unchanged' | 'worse' | 'pending';

export interface OutcomeGoalEvaluationResult {
  status: OutcomeGoalMcidStatus;
  baselineScore: number;
  currentScore: number | undefined;
  signedImprovement: number | null;
  mcidRequiredRaw: number;
  reachedTarget: boolean;
  labelAr: string;
  labelCkb: string;
  labelEn: string;
}

export function evaluateOutcomeGoalStatus(
  goal: OutcomeLinkedGoal,
  overrideCurrentScore?: number
): OutcomeGoalEvaluationResult {
  const spec = OUTCOME_INSTRUMENTS[goal.linkedInstrumentId];
  const currentScore =
    overrideCurrentScore !== undefined ? overrideCurrentScore : goal.currentScore;

  const scaleWidth = Math.max(1, (spec?.maxRaw ?? 100) - (spec?.minRaw ?? 0));
  const mcidRequiredRaw = spec
    ? spec.mcidUnitIsPercent
      ? Number(((spec.mcidValue / 100) * scaleWidth).toFixed(2))
      : spec.mcidValue
    : 2;

  if (currentScore === undefined || !Number.isFinite(currentScore)) {
    return {
      status: 'pending',
      baselineScore: goal.baselineScore,
      currentScore: undefined,
      signedImprovement: null,
      mcidRequiredRaw,
      reachedTarget: false,
      labelAr: 'بانتظار قياس متابعة',
      labelCkb: 'چاوەڕێی پێوانەی نوێ',
      labelEn: 'Awaiting follow-up score',
    };
  }

  const higherIsBetter = spec ? spec.higherIsBetter : true;
  const signedImprovement = higherIsBetter
    ? currentScore - goal.baselineScore
    : goal.baselineScore - currentScore;

  const reachedTarget = higherIsBetter
    ? currentScore >= goal.targetScore
    : currentScore <= goal.targetScore;

  if (signedImprovement >= mcidRequiredRaw || reachedTarget) {
    return {
      status: 'improving',
      baselineScore: goal.baselineScore,
      currentScore,
      signedImprovement: Number(signedImprovement.toFixed(2)),
      mcidRequiredRaw,
      reachedTarget,
      labelAr: reachedTarget ? 'تحسن وحقق الهدف' : 'تحسن سريري ذو دلالة (MCID)',
      labelCkb: reachedTarget ? 'باشتربوون و گەیشتن بە ئامانج' : 'باشتربوونی کلینیکی (MCID)',
      labelEn: reachedTarget ? 'Target Met / Improving' : 'Improving (MCID met)',
    };
  }

  if (signedImprovement <= -mcidRequiredRaw) {
    return {
      status: 'worse',
      baselineScore: goal.baselineScore,
      currentScore,
      signedImprovement: Number(signedImprovement.toFixed(2)),
      mcidRequiredRaw,
      reachedTarget: false,
      labelAr: 'تراجع سريري ملحوظ',
      labelCkb: 'پاشەکشەی کلینیکی',
      labelEn: 'Worse (beyond MCID)',
    };
  }

  return {
    status: 'unchanged',
    baselineScore: goal.baselineScore,
    currentScore,
    signedImprovement: Number(signedImprovement.toFixed(2)),
    mcidRequiredRaw,
    reachedTarget: false,
    labelAr: 'مستقر / دون تغيير جوهري',
    labelCkb: 'جێگیر / بێ گۆڕانکاری بەرچاو',
    labelEn: 'Unchanged (within MCID)',
  };
}

export interface ReEvalNudgeEvaluation {
  isDue: boolean;
  reasonType: 'sessions' | 'days' | 'both' | 'none';
  sessionsSinceEval: number;
  daysSinceEval: number;
  reasonAr: string;
  reasonCkb: string;
  reasonEn: string;
}

function diffDaysBetweenDates(earlierDateStr: string, laterDateStr: string): number {
  const earlierMs = Date.parse(earlierDateStr.slice(0, 10));
  const laterMs = Date.parse(laterDateStr.slice(0, 10));
  if (Number.isNaN(earlierMs) || Number.isNaN(laterMs)) return 0;
  return Math.max(0, Math.floor((laterMs - earlierMs) / (24 * 60 * 60 * 1000)));
}

export function evaluateReEvalDueStatus(params: {
  enabled: boolean;
  sessionsSinceLastEval: number;
  lastEvalDateStr?: string;
  todayDateStr?: string;
  thresholdSessions: number;
  thresholdDays: number;
}): ReEvalNudgeEvaluation {
  const today = params.todayDateStr || localDate();
  const sessions = Math.max(0, params.sessionsSinceLastEval);
  const days = params.lastEvalDateStr
    ? diffDaysBetweenDates(params.lastEvalDateStr, today)
    : 0;

  if (!params.enabled) {
    return {
      isDue: false,
      reasonType: 'none',
      sessionsSinceEval: sessions,
      daysSinceEval: days,
      reasonAr: '',
      reasonCkb: '',
      reasonEn: '',
    };
  }

  const sessionsDue = sessions >= Math.max(1, params.thresholdSessions);
  const daysDue = Boolean(params.lastEvalDateStr) && days >= Math.max(1, params.thresholdDays);
  const isDue = sessionsDue || daysDue;

  const reasonType: ReEvalNudgeEvaluation['reasonType'] =
    sessionsDue && daysDue ? 'both' : sessionsDue ? 'sessions' : daysDue ? 'days' : 'none';

  if (!isDue) {
    return {
      isDue: false,
      reasonType: 'none',
      sessionsSinceEval: sessions,
      daysSinceEval: days,
      reasonAr: '',
      reasonCkb: '',
      reasonEn: '',
    };
  }

  return {
    isDue: true,
    reasonType,
    sessionsSinceEval: sessions,
    daysSinceEval: days,
    reasonAr:
      reasonType === 'both'
        ? `استحقت إعادة التقييم (مرت ${sessions} جلسات و ${days} يوماً منذ آخر تقييم)`
        : reasonType === 'sessions'
        ? `استحقت إعادة التقييم (أكمل المريض ${sessions} جلسات منذ آخر تقييم)`
        : `استحقت إعادة التقييم (مرّ ${days} يوماً منذ آخر تقييم)`,
    reasonCkb:
      reasonType === 'both'
        ? `کاتی هەڵسەنگاندنەوە هاتووە (${sessions} دانیشتن و ${days} ڕۆژ تێپەڕیوە)`
        : reasonType === 'sessions'
        ? `کاتی هەڵسەنگاندنەوە هاتووە (${sessions} دانیشتن تەواوبووە)`
        : `کاتی هەڵسەنگاندنەوە هاتووە (${days} ڕۆژ تێپەڕیوە)`,
    reasonEn:
      reasonType === 'both'
        ? `Re-eval due (${sessions} sessions & ${days} days since last evaluation)`
        : reasonType === 'sessions'
        ? `Re-eval due (${sessions} sessions since last evaluation)`
        : `Re-eval due (${days} days since last evaluation)`,
  };
}

export interface NoteCompletenessItem {
  id: 'painRecorded' | 'objectiveFinding' | 'intervention' | 'plan' | 'nextVisit';
  completed: boolean;
  labelAr: string;
  labelCkb: string;
  labelEn: string;
}

export interface NoteCompletenessReport {
  allComplete: boolean;
  missingCount: number;
  items: NoteCompletenessItem[];
}

export function evaluateNoteCompleteness(params: {
  hasPainRecorded: boolean;
  hasObjectiveFinding: boolean;
  hasIntervention: boolean;
  hasPlan: boolean;
  hasNextVisit: boolean;
}): NoteCompletenessReport {
  const items: NoteCompletenessItem[] = [
    {
      id: 'painRecorded',
      completed: params.hasPainRecorded,
      labelAr: 'توثيق شدة الألم (أو تحديد لم يُسجّل)',
      labelCkb: 'تۆمارکردنی ئازار (یان تۆمارنەکراو)',
      labelEn: 'Pain recorded',
    },
    {
      id: 'objectiveFinding',
      completed: params.hasObjectiveFinding,
      labelAr: 'المشاهدات الموضوعية / القياسات / العلامات الحيوية',
      labelCkb: 'تێبینییە بابەتییەکان / نیشانە گرنگەکان',
      labelEn: 'Objective finding',
    },
    {
      id: 'intervention',
      completed: params.hasIntervention,
      labelAr: 'التدخل العلاجي (تمارين / علاج يدوي / وسائل فيزيائية)',
      labelCkb: 'چارەسەری کراو (وەرزش / دەستی / ئامێر)',
      labelEn: 'Intervention documented',
    },
    {
      id: 'plan',
      completed: params.hasPlan,
      labelAr: 'الخطة العلاجية أو التوصيات المنزلية',
      labelCkb: 'پلانی چارەسەر یان ڕێنمایی ماڵەوە',
      labelEn: 'Plan / home instructions',
    },
    {
      id: 'nextVisit',
      completed: params.hasNextVisit,
      labelAr: 'موعد الزيارة القادمة أو خطة الجلسة التالية',
      labelCkb: 'کاتی سەردانی داهاتوو',
      labelEn: 'Next visit / follow-up',
    },
  ];
  const missingCount = items.filter((i) => !i.completed).length;
  return {
    allComplete: missingCount === 0,
    missingCount,
    items,
  };
}

/**
 * Indexes latest recorded raw score by scaleId from history and current summary.
 * Each historical snapshot is keyed by its own scaleId so earlier instruments stay intact.
 */
export function buildLatestScoreByInstrumentMap(
  functionalScales?: FunctionalScaleEntry
): Map<string, number> {
  const map = new Map<string, number>();
  if (!functionalScales) return map;

  if (functionalScales.history) {
    for (const pt of functionalScales.history) {
      if (pt.rawScore !== undefined) {
        map.set(pt.scaleId || functionalScales.scaleId, pt.rawScore);
      }
    }
  }
  if (functionalScales.rawScore !== undefined) {
    map.set(functionalScales.scaleId, functionalScales.rawScore);
  }
  return map;
}
