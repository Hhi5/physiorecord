// =======================================================================
// PhysioRecord — ASIA / ISNCSCI (2019 Revised) Automatic Classification Card
// Displays live Neurological Level of Injury (NLI), R/L Sensory & Motor Levels,
// Completeness, AIS Grade (A–E), 2019 Revised ZPP, and completion hints.
// =======================================================================

import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  AisGrade,
  AsiaCompleteness,
  AsiaIsncsciClassification,
  AsiaLevelCode,
  AsiaZppValue,
} from '../../utils/asiaIsncsciClassifier';

export interface AsiaClassificationCardProps {
  classification: AsiaIsncsciClassification;
  defaultExpanded?: boolean;
  onJumpToDermatomes?: () => void;
  onJumpToAsiaMotor?: () => void;
}

function formatLevel(val: AsiaLevelCode, bi: (ar: string, en: string) => string): string {
  if (!val) return '—';
  if (val === 'INT') return bi('سليم (INT)', 'INT');
  return val;
}

function formatZpp(val: AsiaZppValue): string {
  if (!val) return '—';
  return val;
}

function getAisToneClasses(ais: AisGrade): string {
  switch (ais) {
    case 'A':
      return 'bg-rose-600 text-white';
    case 'B':
    case 'C':
      return 'bg-amber-500 text-white';
    case 'D':
      return 'bg-primary text-primary-foreground';
    case 'E':
      return 'bg-emerald-600 text-white';
    case 'ND':
      return 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900';
    default:
      return 'bg-card text-muted-foreground-1';
  }
}

function getCompletenessLabel(
  comp: AsiaCompleteness,
  bi: (ar: string, en: string) => string
): string {
  switch (comp) {
    case 'complete':
      return bi('كاملة (Complete)', 'Complete (C)');
    case 'incomplete':
      return bi('غير كاملة (Incomplete)', 'Incomplete (I)');
    case 'intact':
      return bi('سليم (Intact)', 'Intact');
    case 'ND':
      return bi('غير محدد (ND)', 'ND');
    default:
      return '—';
  }
}

export const AsiaClassificationCard: React.FC<AsiaClassificationCardProps> = ({
  classification,
  defaultExpanded = false,
  onJumpToDermatomes,
  onJumpToAsiaMotor,
}) => {
  const { bi } = useLanguage();
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);

  const isComputed = Boolean(classification.aisGrade || classification.nli);
  const isExpanded = userExpanded !== null ? userExpanded : defaultExpanded || isComputed;

  const {
    nli,
    aisGrade,
    completeness,
    rightSensoryLevel,
    leftSensoryLevel,
    rightMotorLevel,
    leftMotorLevel,
    rightSensoryZpp,
    leftSensoryZpp,
    rightMotorZpp,
    leftMotorZpp,
    motorBelowNli,
    aisReasonAr,
    aisReasonEn,
    clinicalCautionAr,
    clinicalCautionEn,
    missing,
  } = classification;

  const needsMoreForFullClassification = !aisGrade || !nli;

  return (
    <div
      data-testid="asia-classification-card"
      className="rounded-2xl bg-surface/75 border border-black/[0.05] dark:border-white/[0.07] overflow-hidden"
    >
      {/* Compact Header Strip (always visible) */}
      <button
        type="button"
        onClick={() => setUserExpanded(!isExpanded)}
        className="w-full px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-start hover:bg-surface/90 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          {aisGrade === 'E' ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <Activity className="w-4 h-4 text-primary shrink-0" />
          )}
          <span className="text-xs font-bold text-foreground">
            {bi(
              'تصنيف ASIA / ISNCSCI (2019) التلقائي (NLI · AIS)',
              'ASIA / ISNCSCI (2019) Auto-Classification (NLI · AIS)'
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            data-testid="asia-nli-badge"
            className="px-2 py-0.5 rounded-lg bg-card text-xs font-mono font-bold text-foreground tabular-nums"
            dir="ltr"
          >
            NLI: {nli ?? '—'}
          </span>
          <span
            data-testid="asia-ais-badge"
            className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold tabular-nums ${getAisToneClasses(aisGrade)}`}
            dir="ltr"
          >
            AIS: {aisGrade ?? '—'}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground-1" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground-1" />
          )}
        </div>
      </button>

      {/* Expanded Clinical Classification Details */}
      {isExpanded && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-2.5 border-t border-black/[0.045] dark:border-white/[0.06]">
          {/* Primary Summary Metrics: NLI, Completeness, AIS Grade */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-card flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground-1">
                {bi('المستوى العصبي (NLI)', 'Neurological Level (NLI)')}
              </span>
              <span
                data-testid="asia-nli-value"
                className="text-sm font-mono font-extrabold text-primary tabular-nums"
              >
                {nli === 'INT' ? (
                  <>
                    {bi('سليم ', '')}
                    <bdi dir="ltr">{bi('(INT)', 'INT')}</bdi>
                  </>
                ) : (
                  <bdi dir="ltr">{nli ?? '—'}</bdi>
                )}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-card flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground-1">
                {bi('اكتمال الإصابة', 'Completeness')}
              </span>
              <span
                data-testid="asia-completeness-value"
                className="text-xs font-bold text-foreground"
              >
                {getCompletenessLabel(completeness, bi)}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-card flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground-1">
                {bi('درجة مقياس ASIA', 'ASIA Grade (AIS)')}
              </span>
              <span
                data-testid="asia-ais-value"
                className={`px-2 py-0.5 rounded-lg text-xs font-mono font-extrabold tabular-nums ${getAisToneClasses(aisGrade)}`}
                dir="ltr"
              >
                {aisGrade ? `AIS ${aisGrade}` : '—'}
              </span>
            </div>
          </div>

          {/* Unilateral Neurological Levels (R/L Sensory & Motor) + 2019 Revised ZPP */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {(
              [
                { label: bi('حسي أيمن (R)', 'Sensory R'), val: rightSensoryLevel },
                { label: bi('حسي أيسر (L)', 'Sensory L'), val: leftSensoryLevel },
                { label: bi('حركي أيمن (R)', 'Motor R'), val: rightMotorLevel },
                { label: bi('حركي أيسر (L)', 'Motor L'), val: leftMotorLevel },
              ] as const
            ).map((item) => (
              <div
                key={item.label}
                className="p-2 rounded-xl bg-card/85 flex items-center justify-between gap-1.5"
              >
                <span className="text-muted-foreground-1 font-medium">{item.label}</span>
                <span className="font-mono font-bold text-foreground tabular-nums">
                  {item.val === 'INT' ? (
                    <>
                      {bi('سليم ', '')}
                      <bdi dir="ltr">{bi('(INT)', 'INT')}</bdi>
                    </>
                  ) : (
                    <bdi dir="ltr">{formatLevel(item.val, bi)}</bdi>
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* 2019 Revised ZPP & Motor Below NLI Ratio */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-card/75 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold text-foreground">
                {bi('نطاق الحفظ الجزئي (ZPP · 2019):', 'Zone of Partial Preservation (ZPP · 2019):')}
              </span>
              <span className="text-muted-foreground-1 inline-flex items-center gap-1.5">
                <span>{bi('حسي:', 'Sensory:')}</span>
                <bdi className="font-mono tabular-nums" dir="ltr">
                  R <strong className="text-foreground">{formatZpp(rightSensoryZpp)}</strong> · L{' '}
                  <strong className="text-foreground">{formatZpp(leftSensoryZpp)}</strong>
                </bdi>
              </span>
              <span className="text-muted-foreground-1 inline-flex items-center gap-1.5">
                <span>{bi('حركي:', 'Motor:')}</span>
                <bdi className="font-mono tabular-nums" dir="ltr">
                  R <strong className="text-foreground">{formatZpp(rightMotorZpp)}</strong> · L{' '}
                  <strong className="text-foreground">{formatZpp(leftMotorZpp)}</strong>
                </bdi>
              </span>
            </div>

            {motorBelowNli && motorBelowNli.total > 0 && (
              <span className="font-semibold text-primary inline-flex items-center gap-1.5">
                <span>{bi('العضلات ≥3 دون NLI:', 'Key muscles ≥3 below NLI:')}</span>
                <bdi className="font-mono font-bold tabular-nums" dir="ltr">
                  {motorBelowNli.atLeastGrade3}/{motorBelowNli.total}
                  {motorBelowNli.percentAtLeast3 !== null
                    ? ` (${motorBelowNli.percentAtLeast3}%)`
                    : ''}
                </bdi>
              </span>
            )}
          </div>

          {/* Clinical Rationale for computed AIS Grade */}
          {(aisReasonAr || aisReasonEn) && (
            <div className="flex items-start gap-2 px-2.5 py-2 rounded-xl bg-primary/8 text-xs text-foreground">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {bi(aisReasonAr || '', aisReasonEn || '')}
              </p>
            </div>
          )}

          {/* Clinical Caution (e.g., AIS E follow-up rule or sacral discrepancy) */}
          {(clinicalCautionAr || clinicalCautionEn) && (
            <div className="flex items-start gap-2 px-2.5 py-2 rounded-xl bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {bi(clinicalCautionAr || '', clinicalCautionEn || '')}
              </p>
            </div>
          )}

          {/* Actionable Missing-Requirements Helper when exam is incomplete */}
          {needsMoreForFullClassification && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-card/70 text-xs text-muted-foreground-1">
              <div className="leading-relaxed">
                <strong className="text-foreground">
                  {bi('لاستكمال حساب NLI و AIS تلقائياً: ', 'To complete auto NLI & AIS: ')}
                </strong>
                {[
                  missing.missingSensoryCells > 0
                    ? bi(
                        `القطاعات الحسية (متبقي ${missing.missingSensoryCells})`,
                        `Sensory (${missing.missingSensoryCells} left)`
                      )
                    : null,
                  missing.missingKeyMuscleSides > 0
                    ? bi(
                        `عضلات ASIA العشر (متبقي ${missing.missingKeyMuscleSides})`,
                        `ASIA 10 key muscles (${missing.missingKeyMuscleSides} left)`
                      )
                    : null,
                  missing.missingDap ? bi('الضغط الشرجي DAP', 'DAP') : null,
                  missing.missingVac ? bi('الانقباض الشرجي VAC', 'VAC') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {onJumpToDermatomes && (missing.missingSensoryCells > 0 || missing.missingDap) && (
                  <button
                    type="button"
                    onClick={onJumpToDermatomes}
                    className="compact-btn h-7 px-2.5 rounded-lg bg-surface hover:bg-primary/12 text-primary font-semibold text-xs cursor-pointer transition-colors"
                  >
                    {bi('الحسي و DAP', 'Sensory & DAP')}
                  </button>
                )}
                {onJumpToAsiaMotor && (missing.missingKeyMuscleSides > 0 || missing.missingVac) && (
                  <button
                    type="button"
                    onClick={onJumpToAsiaMotor}
                    className="compact-btn h-7 px-2.5 rounded-lg bg-surface hover:bg-primary/12 text-primary font-semibold text-xs cursor-pointer transition-colors"
                  >
                    {bi('حركي ASIA و VAC', 'ASIA Motor & VAC')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
