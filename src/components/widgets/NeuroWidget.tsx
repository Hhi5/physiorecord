// =======================================================================
// PhysioRecord — Modern Expansive Neurological Screening Widget
// 1. Dermatomes: ASIA / ISNCSCI (2019) Bilateral LT & PP + Key Points + DAP
// 2. Myotomes: Dual Protocol — Comprehensive Clinical PT (C1–S2 primary +
//    secondary differential movements) AND Strict ASIA/ISNCSCI 10 Key Muscles
//    (UEMS /50, LEMS /50, Total /100, VAC)
// 3. Reflexes: NINDS DTR (with toggle-clear & NT) + UMN Pathological Signs
// =======================================================================

import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Info, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  AsiaSacralFinding,
  DermatomeSensoryEntry,
  MmtGradeValue,
  NeuroScreeningBatteryData,
  PathologicalSignResult,
  ReflexGradeValue,
  SensoryTableModalityGrade,
} from '../../types/clinical';
import { AsiaSensoryTable } from '../toolkit/AsiaSensoryTable';
import { AsiaClassificationCard } from '../toolkit/AsiaClassificationCard';
import { classifyAsiaIsncsci2019 } from '../../utils/asiaIsncsciClassifier';
import {
  ASIA_ISNCSCI_KEY_MUSCLES,
  CLINICAL_PT_MYOTOMES,
  computeAsiaMotorTotals,
  findMyotomeEntry,
  type AsiaKeyMuscleDefinition,
  type ClinicalMyotomeMovementTest,
} from '../../data/clinicalToolkit/myotomesData';
import {
  DTR_DEFINITIONS,
  PATHOLOGICAL_REFLEX_DEFINITIONS,
} from '../../data/clinicalToolkit/dtrData';

interface NeuroWidgetProps {
  value: NeuroScreeningBatteryData | undefined;
  onChange: (updated: NeuroScreeningBatteryData) => void;
  readOnly?: boolean;
}

const MYOTOME_GRADES: Array<MmtGradeValue | 'NT'> = ['5', '4', '3', '2', '1', '0', 'NT'];
const REFLEX_GRADES: ReflexGradeValue[] = ['0', '1+', '2+', '3+', '4+', 'NT'];

export const NeuroWidget: React.FC<NeuroWidgetProps> = ({
  value,
  onChange,
  readOnly = false,
}) => {
  const { bi } = useLanguage();

  const [activeTab, setActiveTab] = useState<'dermatomes' | 'myotomes' | 'reflexes'>('dermatomes');
  const [myotomeRegionFilter, setMyotomeRegionFilter] = useState<'all' | 'cervical' | 'lumbar_sacral'>('all');
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});

  const dermatomes = value?.dermatomes || [];
  const sensoryTable = value?.sensoryTable || {};
  const myotomes = value?.myotomes || [];
  const myotomeMode: 'clinical' | 'asia' = value?.myotomeMode || 'clinical';
  const reflexes = value?.reflexes || [];
  const pathologicalSigns = value?.pathologicalSigns || [];
  const asiaSacral = value?.asiaSacral || {};
  const clinicalNotes = value?.clinicalNotes || '';

  const emitChange = (patch: Partial<NeuroScreeningBatteryData>) => {
    if (readOnly) return;
    onChange({
      batteryVersion: '1.0.0',
      dermatomes,
      sensoryTable,
      myotomes,
      myotomeMode,
      reflexes,
      pathologicalSigns,
      asiaSacral,
      clinicalNotes,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateDermatomes = (
    updatedDermatomes: DermatomeSensoryEntry[],
    updatedSensoryTable: Record<string, SensoryTableModalityGrade>
  ) => {
    emitChange({
      dermatomes: updatedDermatomes,
      sensoryTable: updatedSensoryTable,
    });
  };

  const handleUpdateSacral = (field: 'vac' | 'dap', nextVal: AsiaSacralFinding | null) => {
    emitChange({
      asiaSacral: {
        ...asiaSacral,
        [field]: nextVal,
      },
    });
  };

  // --- Myotome Update (Handles both Clinical PT & ASIA ISNCSCI seamlessly) ---
  const handleUpdateMyotomeTest = (params: {
    testId: string;
    linkedTestId?: string;
    rootLevel: string;
    protocol: 'clinical' | 'asia';
    isPrimary: boolean;
    movementLabelEn: string;
    movementLabelAr: string;
    muscleLabelEn: string;
    muscleLabelAr: string;
    allowLegacyFallback?: boolean;
    side: 'right' | 'left';
    grade: MmtGradeValue | 'NT' | null;
  }) => {
    if (readOnly) return;
    const {
      testId,
      linkedTestId,
      rootLevel,
      protocol,
      isPrimary,
      movementLabelEn,
      movementLabelAr,
      muscleLabelEn,
      muscleLabelAr,
      allowLegacyFallback = false,
      side,
      grade,
    } = params;

    const updated = [...myotomes];
    let existingIndex = updated.findIndex((m) => m.testId === testId);
    if (existingIndex < 0 && linkedTestId) {
      existingIndex = updated.findIndex((m) => m.testId === linkedTestId);
    }
    if (existingIndex < 0 && allowLegacyFallback) {
      existingIndex = updated.findIndex((m) => !m.testId && m.rootLevel === rootLevel);
    }

    if (existingIndex >= 0) {
      const current = updated[existingIndex];
      const nextRight = side === 'right' ? grade : current.rightGrade;
      const nextLeft = side === 'left' ? grade : current.leftGrade;
      if (nextRight === null && nextLeft === null && !current.notes) {
        updated.splice(existingIndex, 1);
      } else {
        updated[existingIndex] = {
          ...current,
          testId: current.testId || testId,
          rootLevel,
          movementLabelEn: current.movementLabelEn || movementLabelEn,
          movementLabelAr: current.movementLabelAr || movementLabelAr,
          muscleLabelEn: current.muscleLabelEn || muscleLabelEn,
          muscleLabelAr: current.muscleLabelAr || muscleLabelAr,
          rightGrade: nextRight,
          leftGrade: nextLeft,
        };
      }
    } else if (grade !== null) {
      updated.push({
        rootLevel,
        testId,
        protocol,
        isPrimary,
        movementLabelEn,
        movementLabelAr,
        muscleLabelEn,
        muscleLabelAr,
        rightGrade: side === 'right' ? grade : null,
        leftGrade: side === 'left' ? grade : null,
      });
    }

    emitChange({ myotomes: updated });
  };

  // --- Reflex Update (Supports tap-to-deselect + NT) ---
  const handleUpdateReflex = (
    reflexId: 'biceps' | 'brachioradialis' | 'triceps' | 'patellar' | 'achilles',
    side: 'right' | 'left',
    grade: ReflexGradeValue
  ) => {
    if (readOnly) return;
    const refConfig = DTR_DEFINITIONS.find((r) => r.reflexId === reflexId);
    const rootLabel = refConfig
      ? refConfig.contributingRoots.length > 1
        ? `${refConfig.contributingRoots[0]}–${refConfig.contributingRoots[refConfig.contributingRoots.length - 1]}`
        : refConfig.primaryRoot
      : '';
    const existingIndex = reflexes.findIndex((r) => r.reflexId === reflexId);
    const updatedReflexes = [...reflexes];

    if (existingIndex >= 0) {
      const cur = updatedReflexes[existingIndex];
      const currentVal = side === 'right' ? cur.rightGrade : cur.leftGrade;
      const nextVal: ReflexGradeValue | null = currentVal === grade ? null : grade;
      const nextRight = side === 'right' ? nextVal : cur.rightGrade;
      const nextLeft = side === 'left' ? nextVal : cur.leftGrade;
      if (nextRight === null && nextLeft === null && !cur.notes) {
        updatedReflexes.splice(existingIndex, 1);
      } else {
        updatedReflexes[existingIndex] = {
          ...cur,
          reflexLabelEn: refConfig?.nameEn || cur.reflexLabelEn,
          reflexLabelAr: refConfig?.nameAr || cur.reflexLabelAr,
          rootLevel: rootLabel || cur.rootLevel,
          rightGrade: nextRight,
          leftGrade: nextLeft,
        };
      }
    } else {
      updatedReflexes.push({
        reflexId,
        reflexLabelEn: refConfig?.nameEn || reflexId,
        reflexLabelAr: refConfig?.nameAr || reflexId,
        rootLevel: rootLabel,
        rightGrade: side === 'right' ? grade : null,
        leftGrade: side === 'left' ? grade : null,
      });
    }

    emitChange({ reflexes: updatedReflexes });
  };

  // --- Pathological UMN Sign Update ---
  const handleUpdatePathologicalSign = (
    signId: 'babinski' | 'hoffmann' | 'clonus',
    side: 'right' | 'left',
    result: PathologicalSignResult
  ) => {
    if (readOnly) return;
    const def = PATHOLOGICAL_REFLEX_DEFINITIONS.find((p) => p.signId === signId);
    const existingIndex = pathologicalSigns.findIndex((p) => p.signId === signId);
    const updated = [...pathologicalSigns];

    if (existingIndex >= 0) {
      const cur = updated[existingIndex];
      const currentVal = side === 'right' ? cur.rightResult : cur.leftResult;
      const nextVal: PathologicalSignResult | null = currentVal === result ? null : result;
      const nextRight = side === 'right' ? nextVal : cur.rightResult;
      const nextLeft = side === 'left' ? nextVal : cur.leftResult;
      if (nextRight === null && nextLeft === null && !cur.notes) {
        updated.splice(existingIndex, 1);
      } else {
        updated[existingIndex] = {
          ...cur,
          rightResult: nextRight,
          leftResult: nextLeft,
        };
      }
    } else {
      updated.push({
        signId,
        labelEn: def?.nameEn || signId,
        labelAr: def?.nameAr || signId,
        rightResult: side === 'right' ? result : null,
        leftResult: side === 'left' ? result : null,
      });
    }

    emitChange({ pathologicalSigns: updated });
  };

  const getReflexGrade = (
    reflexId: 'biceps' | 'brachioradialis' | 'triceps' | 'patellar' | 'achilles',
    side: 'right' | 'left'
  ): ReflexGradeValue | null => {
    const found = reflexes.find((r) => r.reflexId === reflexId);
    return side === 'right' ? found?.rightGrade ?? null : found?.leftGrade ?? null;
  };

  const getPathologicalResult = (
    signId: 'babinski' | 'hoffmann' | 'clonus',
    side: 'right' | 'left'
  ): PathologicalSignResult | null => {
    const found = pathologicalSigns.find((p) => p.signId === signId);
    return side === 'right' ? found?.rightResult ?? null : found?.leftResult ?? null;
  };

  const asiaMotorTotals = useMemo(() => computeAsiaMotorTotals(myotomes), [myotomes]);

  const asiaClassification = useMemo(
    () =>
      classifyAsiaIsncsci2019({
        sensoryTable,
        dermatomes,
        myotomes,
        asiaSacral,
      }),
    [sensoryTable, dermatomes, myotomes, asiaSacral]
  );

  const handleSetAllAsiaMotorNormal = () => {
    if (readOnly) return;
    const updated = [...myotomes];
    for (const km of ASIA_ISNCSCI_KEY_MUSCLES) {
      let existingIndex = updated.findIndex((m) => m.testId === km.testId);
      if (existingIndex < 0) {
        existingIndex = updated.findIndex((m) => m.testId === km.linkedClinicalTestId);
      }
      if (existingIndex < 0 && km.rootLevel !== 'C5') {
        existingIndex = updated.findIndex((m) => !m.testId && m.rootLevel === km.rootLevel);
      }
      if (existingIndex >= 0) {
        updated[existingIndex] = {
          ...updated[existingIndex],
          testId: updated[existingIndex].testId || km.testId,
          rootLevel: km.rootLevel,
          rightGrade: '5',
          leftGrade: '5',
        };
      } else {
        updated.push({
          rootLevel: km.rootLevel,
          testId: km.testId,
          protocol: 'asia',
          isPrimary: true,
          movementLabelEn: km.functionEn,
          movementLabelAr: km.functionAr,
          muscleLabelEn: km.musclesEn,
          muscleLabelAr: km.musclesAr,
          rightGrade: '5',
          leftGrade: '5',
        });
      }
    }
    emitChange({ myotomes: updated });
  };

  const filteredClinicalMyotomes = useMemo(() => {
    if (myotomeRegionFilter === 'all') return CLINICAL_PT_MYOTOMES;
    return CLINICAL_PT_MYOTOMES.filter((g) => g.regionGroup === myotomeRegionFilter);
  }, [myotomeRegionFilter]);

  const upperAsiaMuscles = useMemo(
    () => ASIA_ISNCSCI_KEY_MUSCLES.filter((m) => m.extremity === 'upper'),
    []
  );
  const lowerAsiaMuscles = useMemo(
    () => ASIA_ISNCSCI_KEY_MUSCLES.filter((m) => m.extremity === 'lower'),
    []
  );

  const renderGradeRow = (
    rGrade: MmtGradeValue | 'NT' | null,
    lGrade: MmtGradeValue | 'NT' | null,
    onSelect: (side: 'right' | 'left', grade: MmtGradeValue | 'NT' | null) => void
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div className="flex items-center justify-between gap-2 p-1.5 bg-card rounded-xl text-xs">
        <span className="text-xs font-bold text-muted-foreground-1 shrink-0">
          {bi('R (أيمن):', 'R:')}
        </span>
        <div className="flex flex-wrap items-center gap-1 font-mono tabular-nums" dir="ltr">
          {MYOTOME_GRADES.map((g) => {
            const active = rGrade === g;
            const tone =
              active && g === '5'
                ? 'bg-emerald-600 text-white'
                : active && (g === '0' || g === '1' || g === '2')
                  ? 'bg-rose-600 text-white'
                  : active && (g === '3' || g === '4')
                    ? 'bg-amber-500 text-white'
                    : active
                      ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'bg-surface/75 text-muted-foreground-1 hover:bg-surface';
            return (
              <button
                key={g}
                type="button"
                disabled={readOnly}
                onClick={() => onSelect('right', active ? null : g)}
                className={`compact-btn min-w-[28px] h-7 px-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${tone}`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 p-1.5 bg-card rounded-xl text-xs">
        <span className="text-xs font-bold text-muted-foreground-1 shrink-0">
          {bi('L (أيسر):', 'L:')}
        </span>
        <div className="flex flex-wrap items-center gap-1 font-mono tabular-nums" dir="ltr">
          {MYOTOME_GRADES.map((g) => {
            const active = lGrade === g;
            const tone =
              active && g === '5'
                ? 'bg-emerald-600 text-white'
                : active && (g === '0' || g === '1' || g === '2')
                  ? 'bg-rose-600 text-white'
                  : active && (g === '3' || g === '4')
                    ? 'bg-amber-500 text-white'
                    : active
                      ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                      : 'bg-surface/75 text-muted-foreground-1 hover:bg-surface';
            return (
              <button
                key={g}
                type="button"
                disabled={readOnly}
                onClick={() => onSelect('left', active ? null : g)}
                className={`compact-btn min-w-[28px] h-7 px-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${tone}`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderAsiaKeyMuscleCard = (km: AsiaKeyMuscleDefinition) => {
    const found = findMyotomeEntry(
      myotomes,
      km.testId,
      km.rootLevel,
      km.linkedClinicalTestId,
      km.rootLevel !== 'C5'
    );
    const rGrade = found?.rightGrade ?? null;
    const lGrade = found?.leftGrade ?? null;

    return (
      <div key={km.testId} className="p-3 rounded-2xl bg-surface/65 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <span className="min-w-[36px] h-6 px-1.5 rounded-md font-bold font-mono text-xs flex items-center justify-center bg-primary/10 text-primary shrink-0 mt-0.5">
              {km.rootLevel}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-foreground">
                {bi(km.functionAr, km.functionEn, km.functionCkb)}
              </div>
              <div className="text-xs text-muted-foreground-1 leading-snug">
                {bi(km.musclesAr, km.musclesEn)}
              </div>
            </div>
          </div>
        </div>

        {renderGradeRow(rGrade, lGrade, (side, grade) =>
          handleUpdateMyotomeTest({
            testId: km.testId,
            linkedTestId: km.linkedClinicalTestId,
            rootLevel: km.rootLevel,
            protocol: 'asia',
            isPrimary: true,
            movementLabelEn: km.functionEn,
            movementLabelAr: km.functionAr,
            muscleLabelEn: km.musclesEn,
            muscleLabelAr: km.musclesAr,
            allowLegacyFallback: km.rootLevel !== 'C5',
            side,
            grade,
          })
        )}
      </div>
    );
  };

  const getClinicalTestGrades = (root: string, test: ClinicalMyotomeMovementTest, isPrimary: boolean) => {
    // Allow legacy root fallback for primary movements whose root matches legacy C5-S1 (note: legacy C5 was Shoulder Abduction)
    const allowLegacy = isPrimary && (root === 'C5' || root === 'C6' || root === 'C7' || root === 'C8' || root === 'T1' || root === 'L3' || root === 'L4' || root === 'L5' || root === 'S1');
    const found = findMyotomeEntry(myotomes, test.testId, root, test.asiaTestId, allowLegacy);
    return {
      rGrade: found?.rightGrade ?? null,
      lGrade: found?.leftGrade ?? null,
    };
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher */}
      <div className="rounded-2xl bg-surface/60 p-1.5 space-y-1.5 overflow-hidden">
        <div className="pr-hscroll overflow-x-auto flex items-center gap-1 whitespace-nowrap pb-1 pt-0.5 px-0.5">
          <button
            type="button"
            onClick={(e) => {
              setActiveTab('dermatomes');
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
            className={`compact-btn h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'dermatomes'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:bg-card hover:text-foreground'
            }`}
          >
            {bi('القطاعات الجلدية (C2–S4-5)', 'Dermatomes (C2–S4-5)', 'دێرماتۆمەکان (C2–S4-5)')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              setActiveTab('myotomes');
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
            className={`compact-btn h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'myotomes'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:bg-card hover:text-foreground'
            }`}
          >
            {bi('القطع العضلية العصبية (Myotomes)', 'Motor Myotomes', 'مایۆتۆمەکان (Myotomes)')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              setActiveTab('reflexes');
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
            className={`compact-btn h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'reflexes'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:bg-card hover:text-foreground'
            }`}
          >
            {bi('المنعكسات الوترية (DTR) و UMN', 'Reflexes (DTR) & UMN', 'پەرچەکردارەکان (DTR) و UMN')}
          </button>
        </div>

        <div className="text-xs text-primary font-semibold px-2">
          {activeTab === 'dermatomes'
            ? bi('معيار ASIA / ISNCSCI (2019) الحسي ثنائي الجانب مع نقاط الفحص التشريحية', 'ASIA / ISNCSCI (2019) bilateral sensory mapping & landmarks', 'پێوانەی هەستەوەری ASIA (2019)')
            : activeTab === 'myotomes'
              ? myotomeMode === 'asia'
                ? bi('معيار ASIA / ISNCSCI (2019) — العضلات العشر الأساسية (C5–T1 · L2–S1) وحساب UEMS / LEMS', 'ASIA / ISNCSCI (2019) — 10 Key Muscles (C5–T1, L2–S1) with UEMS/LEMS scoring')
                : bi('الفحص السريري الشامل للمايوتوم (C1–S2) — الحركة الأساسية مع الحركات الثانوية للتفريق العصبي', 'Comprehensive PT myotome screening (C1–S2) — primary + secondary differential tests')
              : bi('2+ طبيعي · اضغط مرة أخرى لإلغاء الاختيار · يتضمن علامات العصبون المحرك العلوي (UMN)', '2+ is normal · tap again to clear · includes Upper Motor Neuron (UMN) signs')}
        </div>
      </div>

      {/* Automatic ASIA / ISNCSCI (2019) NLI & AIS A–E Classification Summary */}
      {(activeTab === 'dermatomes' || activeTab === 'myotomes') &&
        (asiaClassification.hasAnyAsiaData || (activeTab === 'myotomes' && myotomeMode === 'asia')) && (
          <AsiaClassificationCard
            classification={asiaClassification}
            defaultExpanded={activeTab === 'myotomes' && myotomeMode === 'asia'}
            onJumpToDermatomes={() => setActiveTab('dermatomes')}
            onJumpToAsiaMotor={() => {
              setActiveTab('myotomes');
              if (myotomeMode !== 'asia' && !readOnly) {
                emitChange({ myotomeMode: 'asia' });
              }
            }}
          />
        )}

      {/* Tab 1: Table-First ASIA / ISNCSCI (2019) Sensory Screening */}
      {activeTab === 'dermatomes' && (
        <AsiaSensoryTable
          dermatomes={dermatomes}
          sensoryTable={sensoryTable}
          dap={asiaSacral.dap ?? null}
          onChangeDap={(nextDap) => handleUpdateSacral('dap', nextDap)}
          onChange={handleUpdateDermatomes}
          readOnly={readOnly}
        />
      )}

      {/* Tab 2: Dual-Protocol Myotomes (Comprehensive Clinical PT C1–S2 + Strict ASIA ISNCSCI 2019) */}
      {activeTab === 'myotomes' && (
        <div className="space-y-3">
          {/* Protocol Toggle: Clinical PT vs ASIA ISNCSCI 2019 */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-2xl bg-surface/65">
            <div className="inline-flex items-center gap-1 bg-card p-1 rounded-xl">
              <button
                type="button"
                onClick={() => emitChange({ myotomeMode: 'clinical' })}
                className={`compact-btn h-8 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  myotomeMode === 'clinical'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground-1 hover:text-foreground'
                }`}
              >
                {bi('الفحص السريري الشامل (C1–S2)', 'Clinical PT Screening (C1–S2)')}
              </button>
              <button
                type="button"
                onClick={() => emitChange({ myotomeMode: 'asia' })}
                className={`compact-btn h-8 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  myotomeMode === 'asia'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground-1 hover:text-foreground'
                }`}
              >
                {bi('معيار ASIA / ISNCSCI (10 عضلات)', 'ASIA / ISNCSCI (10 Key Muscles)')}
              </button>
            </div>

            {myotomeMode === 'clinical' && (
              <div className="inline-flex items-center gap-1">
                {(
                  [
                    { id: 'all', ar: 'الكل (C1–S2)', en: 'All (C1–S2)' },
                    { id: 'cervical', ar: 'عنقي وعلوي (C1–T1)', en: 'Cervical / UE (C1–T1)' },
                    { id: 'lumbar_sacral', ar: 'قطني وعجزي (L1–S2)', en: 'Lumbar / LE (L1–S2)' },
                  ] as const
                ).map((reg) => (
                  <button
                    key={reg.id}
                    type="button"
                    onClick={() => setMyotomeRegionFilter(reg.id)}
                    className={`compact-btn h-8 px-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      myotomeRegionFilter === reg.id
                        ? 'bg-primary/15 text-primary'
                        : 'bg-card text-muted-foreground-1 hover:text-foreground'
                    }`}
                  >
                    {bi(reg.ar, reg.en)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* MODE A: Comprehensive Clinical PT Myotome Screening (C1–S2, Primary + Secondary Movements) */}
          {myotomeMode === 'clinical' && (
            <div className="space-y-2.5">
              <div className="flex items-start gap-2 px-3 py-2 rounded-2xl bg-surface/55 text-xs text-muted-foreground-1">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  {bi(
                    'كل جذر يعرض الحركة الأساسية للفحص السريع، ويمكنك فتح «الحركات الثانوية» لتقييم عضلات إضافية لنفس الجذر عبر أعصاب محيطية مختلفة (مثل تبعيد الكتف + ثني المرفق في C5، أو بسط الإبهام + تبعيد الورك في L5) للتفريق بين اعتلال الجذر وانضغاط العصب المحيطي.',
                    'Each root lists its primary screening movement plus expandable secondary tests across distinct peripheral nerves (e.g., C5 Deltoid + Biceps, L5 EHL + Gluteus medius) to differentiate radiculopathy from peripheral nerve entrapment.'
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {filteredClinicalMyotomes.map((group) => {
                  const primaryGrades = getClinicalTestGrades(group.root, group.primaryTest, true);
                  const isExpanded = Boolean(expandedRoots[group.root]);
                  const recordedSecondaryCount = group.secondaryTests.filter((st) => {
                    const g = getClinicalTestGrades(group.root, st, false);
                    return g.rGrade !== null || g.lGrade !== null;
                  }).length;

                  return (
                    <div key={group.root} className="p-3 rounded-2xl bg-surface/65 space-y-2.5">
                      {/* Primary Movement Header */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="min-w-[48px] h-6 px-1.5 rounded-md font-bold font-mono text-xs flex items-center justify-center bg-primary/10 text-primary shrink-0 mt-0.5">
                            {group.root}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-foreground">
                              {bi(group.primaryTest.movementAr, group.primaryTest.movementEn)}
                            </div>
                            <div className="text-xs text-muted-foreground-1 leading-snug">
                              {bi(group.primaryTest.muscleAr, group.primaryTest.muscleEn)} ·{' '}
                              <span className="text-foreground/80">
                                {bi(group.primaryTest.peripheralNerveAr, group.primaryTest.peripheralNerveEn)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {group.secondaryTests.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRoots((prev) => ({ ...prev, [group.root]: !prev[group.root] }))
                            }
                            className={`compact-btn h-7 px-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                              isExpanded || recordedSecondaryCount > 0
                                ? 'bg-primary/12 text-primary'
                                : 'bg-card text-muted-foreground-1 hover:text-foreground'
                            }`}
                          >
                            <span>
                              {bi(
                                `حركات ثانوية (${group.secondaryTests.length})${recordedSecondaryCount > 0 ? ` · ${recordedSecondaryCount} مسجّل` : ''}`,
                                `Secondary (${group.secondaryTests.length})${recordedSecondaryCount > 0 ? ` · ${recordedSecondaryCount} scored` : ''}`
                              )}
                            </span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      {/* Primary R/L Grades */}
                      {renderGradeRow(primaryGrades.rGrade, primaryGrades.lGrade, (side, grade) =>
                        handleUpdateMyotomeTest({
                          testId: group.primaryTest.testId,
                          linkedTestId: group.primaryTest.asiaTestId,
                          rootLevel: group.root,
                          protocol: 'clinical',
                          isPrimary: true,
                          movementLabelEn: group.primaryTest.movementEn,
                          movementLabelAr: group.primaryTest.movementAr,
                          muscleLabelEn: group.primaryTest.muscleEn,
                          muscleLabelAr: group.primaryTest.muscleAr,
                          allowLegacyFallback: true,
                          side,
                          grade,
                        })
                      )}

                      {/* Expandable Secondary / Differential Movements */}
                      {isExpanded && group.secondaryTests.length > 0 && (
                        <div className="pt-2 border-t border-black/[0.05] dark:border-white/[0.06] space-y-2">
                          {group.secondaryTests.map((sec) => {
                            const secGrades = getClinicalTestGrades(group.root, sec, false);
                            return (
                              <div key={sec.testId} className="p-2.5 rounded-xl bg-card/70 space-y-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-foreground">
                                    {bi(sec.movementAr, sec.movementEn)}
                                  </div>
                                  <div className="text-xs text-muted-foreground-1">
                                    {bi(sec.muscleAr, sec.muscleEn)} ·{' '}
                                    <span className="text-foreground/80">
                                      {bi(sec.peripheralNerveAr, sec.peripheralNerveEn)}
                                    </span>
                                  </div>
                                </div>
                                {renderGradeRow(secGrades.rGrade, secGrades.lGrade, (side, grade) =>
                                  handleUpdateMyotomeTest({
                                    testId: sec.testId,
                                    linkedTestId: sec.asiaTestId,
                                    rootLevel: group.root,
                                    protocol: 'clinical',
                                    isPrimary: false,
                                    movementLabelEn: sec.movementEn,
                                    movementLabelAr: sec.movementAr,
                                    muscleLabelEn: sec.muscleEn,
                                    muscleLabelAr: sec.muscleAr,
                                    allowLegacyFallback: false,
                                    side,
                                    grade,
                                  })
                                )}
                              </div>
                            );
                          })}

                          <p className="text-xs text-muted-foreground-1 px-1 leading-relaxed">
                            <strong className="text-primary">{bi('ملاحظة سريرية: ', 'Clinical pearl: ')}</strong>
                            {bi(group.clinicalPearlAr, group.clinicalPearlEn)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MODE B: Strict Official ASIA / ISNCSCI (2019 Revised) — 10 Key Muscles + UEMS/LEMS + VAC */}
          {myotomeMode === 'asia' && (
            <div className="space-y-3">
              {/* ASIA Motor Score Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded-2xl bg-surface/65 flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-foreground">
                    {bi('الطرف العلوي (UEMS)', 'Upper Extremity (UEMS)')}
                  </span>
                  <span className="font-mono font-bold text-primary tabular-nums" dir="ltr">
                    {asiaMotorTotals.rightUEMSRecorded === 0 && asiaMotorTotals.leftUEMSRecorded === 0
                      ? '—/50'
                      : `R ${asiaMotorTotals.rightUEMSRecorded > 0 ? asiaMotorTotals.rightUEMS : '—'}/25 · L ${asiaMotorTotals.leftUEMSRecorded > 0 ? asiaMotorTotals.leftUEMS : '—'}/25 (${asiaMotorTotals.totalUEMS}/50${asiaMotorTotals.rightUEMSHasNT || asiaMotorTotals.leftUEMSHasNT ? ' NT' : ''})`}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-surface/65 flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-foreground">
                    {bi('الطرف السفلي (LEMS)', 'Lower Extremity (LEMS)')}
                  </span>
                  <span className="font-mono font-bold text-primary tabular-nums" dir="ltr">
                    {asiaMotorTotals.rightLEMSRecorded === 0 && asiaMotorTotals.leftLEMSRecorded === 0
                      ? '—/50'
                      : `R ${asiaMotorTotals.rightLEMSRecorded > 0 ? asiaMotorTotals.rightLEMS : '—'}/25 · L ${asiaMotorTotals.leftLEMSRecorded > 0 ? asiaMotorTotals.leftLEMS : '—'}/25 (${asiaMotorTotals.totalLEMS}/50${asiaMotorTotals.rightLEMSHasNT || asiaMotorTotals.leftLEMSHasNT ? ' NT' : ''})`}
                  </span>
                </div>
                <div className="p-2.5 rounded-2xl bg-primary/10 flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-primary">
                    {bi('مجموع ASIA الحركي', 'ASIA Total Motor')}
                  </span>
                  <span className="font-mono font-bold text-primary tabular-nums" dir="ltr">
                    {asiaMotorTotals.recordedMuscles === 0
                      ? '—/100'
                      : `${asiaMotorTotals.totalMotor}/100${asiaMotorTotals.anyNT ? ' (NT)' : ''}`}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 px-3 py-2 rounded-2xl bg-surface/55 text-xs text-muted-foreground-1">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  {bi(
                    'وفق معيار ASIA / ISNCSCI (2019) الرسمي، يعتمد التقييم الحركي حصراً على 10 عضلات أساسية معيارية (C5 = ثني المرفق، C6 = بسط الرسغ، C7 = بسط المرفق، C8 = ثني السلامى البعيدة للإصبع الأوسط، T1 = تبعيد الخنصر؛ و L2–S1 للطرف السفلي). لإضافة فحوصات أخرى كـ تبعيد الكتف أو تبعيد الورك استخدم وضع «الفحص السريري الشامل».',
                    'Per official ASIA / ISNCSCI (2019 Revised) standards, motor scoring uses strictly 10 standardized key muscles (C5 = Elbow flexors, C6 = Wrist extensors, C7 = Elbow extensors, C8 = Finger DIP flexors, T1 = Little finger abductors; L2–S1 lower extremity). Switch to Clinical PT Screening for additional roots and non-key muscles.'
                  )}
                </p>
              </div>

              {/* Upper Extremity (C5–T1) */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <h4 className="text-xs font-bold text-foreground">
                    {bi('الطرف العلوي — UEMS (C5–T1 · الحد الأقصى 25 لكل جهة)', 'Upper Extremity — UEMS (C5–T1 · max 25/side)')}
                  </h4>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={handleSetAllAsiaMotorNormal}
                      className="compact-btn h-7 inline-flex items-center gap-1 px-2.5 rounded-xl text-xs font-semibold bg-surface/75 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 cursor-pointer whitespace-nowrap transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{bi('تعيين العضلات الـ 10 = 5 (طبيعي)', 'Set All 10 = 5')}</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {upperAsiaMuscles.map(renderAsiaKeyMuscleCard)}
                </div>
              </div>

              {/* Lower Extremity (L2–S1) */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-foreground px-1">
                  {bi('الطرف السفلي — LEMS (L2–S1 · الحد الأقصى 25 لكل جهة)', 'Lower Extremity — LEMS (L2–S1 · max 25/side)')}
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  {lowerAsiaMuscles.map(renderAsiaKeyMuscleCard)}
                </div>
              </div>

              {/* Voluntary Anal Contraction (VAC) — Official ASIA Motor Sacral Sparing */}
              <div className="p-3 rounded-2xl bg-surface/65 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-foreground">
                      {bi(
                        'الانقباض الإرادي للمصرة الشرجية — VAC (ASIA Motor Sacral Sparing)',
                        'Voluntary Anal Contraction — VAC (ASIA Motor Sacral Sparing)'
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground-1 mt-0.5">
                      {bi(
                        'عنصر حاسم في ISNCSCI لتحديد الإبقاء الحركي العجزي (Motor Incomplete vs. Complete SCI).',
                        'Required in ISNCSCI to establish motor sacral sparing (complete vs. motor-incomplete SCI).'
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(
                    [
                      { value: 'yes', ar: 'نعم (موجود)', en: 'Yes' },
                      { value: 'no', ar: 'لا (غائب)', en: 'No' },
                      { value: 'NT', ar: 'NT', en: 'NT' },
                    ] as const
                  ).map((opt) => {
                    const active = asiaSacral.vac === opt.value;
                    const cls =
                      active && opt.value === 'yes'
                        ? 'bg-emerald-600 text-white'
                        : active && opt.value === 'no'
                          ? 'bg-rose-600 text-white'
                          : active && opt.value === 'NT'
                            ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                            : 'bg-card text-muted-foreground-1 hover:bg-surface';
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleUpdateSacral('vac', active ? null : opt.value)}
                        className={`compact-btn h-8 px-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${cls}`}
                      >
                        {bi(opt.ar, opt.en)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Deep Tendon Reflexes (NINDS) + Upper Motor Neuron (UMN) Signs */}
      {activeTab === 'reflexes' && (
        <div className="space-y-4">
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-foreground px-1">
              {bi('المنعكسات الوترية العميقة (NINDS: 0 غائب · 1+ خامل · 2+ طبيعي · 3+ نشط · 4+ مع رمع)', 'Deep Tendon Reflexes (NINDS: 0 Absent · 1+ Diminished · 2+ Normal · 3+ Brisk · 4+ Clonus)')}
            </h4>
            {DTR_DEFINITIONS.map((ref) => {
              const rGrade = getReflexGrade(ref.reflexId, 'right');
              const lGrade = getReflexGrade(ref.reflexId, 'left');
              const rootLabel =
                ref.contributingRoots.length > 1
                  ? `${ref.contributingRoots[0]}–${ref.contributingRoots[ref.contributingRoots.length - 1]}`
                  : ref.primaryRoot;

              return (
                <div
                  key={ref.reflexId}
                  className="p-3 rounded-2xl bg-surface/65 flex flex-col gap-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-primary/10 text-primary font-mono shrink-0">
                        {rootLabel}
                      </span>
                      <h3 className="text-xs font-bold text-foreground">
                        {bi(ref.nameAr, ref.nameEn)}
                      </h3>
                    </div>
                    <span className="text-xs text-muted-foreground-1">
                      {bi(ref.peripheralNerveAr, ref.peripheralNerveEn)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Right */}
                    <div className="flex items-center justify-between gap-1.5 p-1.5 bg-card rounded-xl">
                      <span className="text-xs font-bold text-muted-foreground-1 px-1 shrink-0">
                        {bi('الأيمن (R):', 'Right:', 'ڕاست (R):')}
                      </span>
                      <div className="flex items-center gap-0.5 flex-wrap" dir="ltr">
                        {REFLEX_GRADES.map((g) => (
                          <button
                            key={g}
                            type="button"
                            disabled={readOnly}
                            onClick={() => handleUpdateReflex(ref.reflexId, 'right', g)}
                            className={`compact-btn h-8 min-w-[30px] px-1.5 text-xs font-mono font-bold rounded-lg transition-colors cursor-pointer tabular-nums ${
                              rGrade === g
                                ? g === '2+'
                                  ? 'bg-emerald-600 text-white'
                                  : g === '0' || g === '4+'
                                    ? 'bg-rose-600 text-white'
                                    : g === 'NT'
                                      ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                                      : 'bg-primary text-primary-foreground'
                                : 'bg-surface/75 text-muted-foreground-1 hover:bg-surface'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Left */}
                    <div className="flex items-center justify-between gap-1.5 p-1.5 bg-card rounded-xl">
                      <span className="text-xs font-bold text-muted-foreground-1 px-1 shrink-0">
                        {bi('الأيسر (L):', 'Left:', 'چەپ (L):')}
                      </span>
                      <div className="flex items-center gap-0.5 flex-wrap" dir="ltr">
                        {REFLEX_GRADES.map((g) => (
                          <button
                            key={g}
                            type="button"
                            disabled={readOnly}
                            onClick={() => handleUpdateReflex(ref.reflexId, 'left', g)}
                            className={`compact-btn h-8 min-w-[30px] px-1.5 text-xs font-mono font-bold rounded-lg transition-colors cursor-pointer tabular-nums ${
                              lGrade === g
                                ? g === '2+'
                                  ? 'bg-emerald-600 text-white'
                                  : g === '0' || g === '4+'
                                    ? 'bg-rose-600 text-white'
                                    : g === 'NT'
                                      ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                                      : 'bg-primary text-primary-foreground'
                                : 'bg-surface/75 text-muted-foreground-1 hover:bg-surface'
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upper Motor Neuron (UMN) / Pathological Reflex Screening */}
          <div className="space-y-2.5 pt-1">
            <h4 className="text-xs font-bold text-foreground px-1">
              {bi(
                'علامات العصبون المحرك العلوي والمنعكسات المرضية (UMN Signs)',
                'Upper Motor Neuron (UMN) / Pathological Signs'
              )}
            </h4>
            {PATHOLOGICAL_REFLEX_DEFINITIONS.map((sign) => {
              const rRes = getPathologicalResult(sign.signId, 'right');
              const lRes = getPathologicalResult(sign.signId, 'left');
              const opts: Array<{ value: PathologicalSignResult; ar: string; en: string }> = [
                { value: 'negative', ar: 'سلبي (-)', en: 'Neg (-)' },
                { value: 'positive', ar: 'إيجابي (+)', en: 'Pos (+)' },
                { value: 'equivocal', ar: 'غير حاسم', en: 'Equiv' },
                { value: 'NT', ar: 'NT', en: 'NT' },
              ];

              const btnCls = (active: boolean, val: PathologicalSignResult) => {
                if (!active) return 'bg-surface/75 text-muted-foreground-1 hover:bg-surface';
                if (val === 'negative') return 'bg-emerald-600 text-white';
                if (val === 'positive') return 'bg-rose-600 text-white';
                if (val === 'equivocal') return 'bg-amber-500 text-white';
                return 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900';
              };

              return (
                <div key={sign.signId} className="p-3 rounded-2xl bg-surface/65 space-y-2">
                  <div>
                    <div className="text-xs font-bold text-foreground">
                      {bi(sign.nameAr, sign.nameEn, sign.nameCkb)}
                    </div>
                    <div className="text-xs text-muted-foreground-1 leading-snug">
                      {bi(sign.positiveMeaningAr, sign.positiveMeaningEn)}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex items-center justify-between gap-1.5 p-1.5 bg-card rounded-xl">
                      <span className="text-xs font-bold text-muted-foreground-1 px-1 shrink-0">
                        {bi('الأيمن (R):', 'Right:')}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {opts.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            disabled={readOnly}
                            onClick={() => handleUpdatePathologicalSign(sign.signId, 'right', o.value)}
                            className={`compact-btn h-7 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${btnCls(
                              rRes === o.value,
                              o.value
                            )}`}
                          >
                            {bi(o.ar, o.en)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 p-1.5 bg-card rounded-xl">
                      <span className="text-xs font-bold text-muted-foreground-1 px-1 shrink-0">
                        {bi('الأيسر (L):', 'Left:')}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {opts.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            disabled={readOnly}
                            onClick={() => handleUpdatePathologicalSign(sign.signId, 'left', o.value)}
                            className={`compact-btn h-7 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${btnCls(
                              lRes === o.value,
                              o.value
                            )}`}
                          >
                            {bi(o.ar, o.en)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Clinical Notes */}
      <div>
        <label htmlFor="neuro-clinical-notes" className="text-xs font-semibold text-foreground block mb-1">
          {bi(
            'ملاحظات الفحص العصبي السريري (نمط الاعتلال الجذري / العصب المحيطي / ملاحظات إضافية):',
            'Neurological Findings Notes:'
          )}
        </label>
        <textarea
          id="neuro-clinical-notes"
          rows={2}
          value={clinicalNotes}
          disabled={readOnly}
          onChange={(e) => emitChange({ clinicalNotes: e.target.value })}
          placeholder={bi(
            'مثال: ضعف 4/5 في EHL والألوية الوسطى بالجهة اليمنى مع نقص حس L5، يرجّح اعتلال جذر L5 وليس العصب الشظوي...',
            'e.g., 4/5 weakness in right EHL and Gluteus medius with L5 hypoesthesia, favoring L5 radiculopathy over fibular nerve...'
          )}
          className="w-full px-3 py-2 text-xs rounded-xl bg-surface/75 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
      </div>
    </div>
  );
};
