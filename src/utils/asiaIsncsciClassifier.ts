// =======================================================================
// PhysioRecord — Official ASIA / ISNCSCI (2019 Revised) Classification Engine
// Pure, deterministic clinical logic computing:
//   - Sensory Levels (Right & Left)
//   - Motor Levels (Right & Left)
//   - Single Neurological Level of Injury (NLI)
//   - Completeness (Complete vs. Incomplete via Sacral Sparing: S4-5 LT/PP, DAP, VAC)
//   - ASIA Impairment Scale (AIS Grade A, B, C, D, E, or ND)
//   - Zone of Partial Preservation (ZPP — 2019 Revised rules: Sensory R/L & Motor R/L)
//
// Reference: ASIA and ISCoS International Standards Committee.
// "The 2019 revision of the International Standards for Neurological
// Classification of Spinal Cord Injury (ISNCSCI)." Spinal Cord / Top SCI Rehabil (2021).
// =======================================================================

import type {
  AsiaSacralFinding,
  AsiaSacralSparingData,
  DermatomeSensoryEntry,
  MyotomeMotorEntry,
  SensoryTableModalityGrade,
} from '../types/clinical';
import {
  ASIA_ISNCSCI_LEVEL_CODES,
  computeAsiaSensoryTotals,
  getAsiaSensoryCellKey,
  type AsiaSensoryTotals,
} from '../data/clinicalToolkit/dermatomesData';
import {
  ASIA_ISNCSCI_KEY_MUSCLES,
  computeAsiaMotorTotals,
  findMyotomeEntry,
  type AsiaMotorTotals,
} from '../data/clinicalToolkit/myotomesData';

export type AsiaLevelCode =
  | 'C1'
  | (typeof ASIA_ISNCSCI_LEVEL_CODES)[number]
  | 'INT'
  | 'ND'
  | null;

export type AsiaZppValue =
  | 'C1'
  | (typeof ASIA_ISNCSCI_LEVEL_CODES)[number]
  | 'NA'
  | 'ND'
  | null;

export type AsiaCompleteness = 'complete' | 'incomplete' | 'intact' | 'ND' | null;
export type AisGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'ND' | null;

export interface AsiaMotorBelowNliStats {
  total: number;
  atLeastGrade3: number;
  lessThanGrade3: number;
  ntCount: number;
  missingCount: number;
  percentAtLeast3: number | null;
}

export interface AsiaMissingRequirements {
  missingSensoryCells: number;
  missingKeyMuscleSides: number;
  missingS45Sensory: boolean;
  missingDap: boolean;
  missingVac: boolean;
}

export interface AsiaIsncsciClassification {
  hasAnyAsiaData: boolean;
  sensoryTotals: AsiaSensoryTotals;
  motorTotals: AsiaMotorTotals;

  rightSensoryLevel: AsiaLevelCode;
  leftSensoryLevel: AsiaLevelCode;
  rightMotorLevel: AsiaLevelCode;
  leftMotorLevel: AsiaLevelCode;
  nli: AsiaLevelCode;

  completeness: AsiaCompleteness;
  aisGrade: AisGrade;
  aisReasonAr: string | null;
  aisReasonEn: string | null;
  clinicalCautionAr: string | null;
  clinicalCautionEn: string | null;

  /** 2019 Revised ZPP: NA when sacral sparing is present for that domain/side */
  rightSensoryZpp: AsiaZppValue;
  leftSensoryZpp: AsiaZppValue;
  rightMotorZpp: AsiaZppValue;
  leftMotorZpp: AsiaZppValue;

  /** Motor stats strictly below NLI (used to explain AIS C vs D) */
  motorBelowNli: AsiaMotorBelowNliStats | null;

  /** Sacral sparing flags */
  hasSensorySacralSparing: boolean | null;
  hasMotorSacralSparing: boolean | null;

  /** What still needs recording to finalize full ISNCSCI classification */
  missing: AsiaMissingRequirements;
}

const LEVELS = ASIA_ISNCSCI_LEVEL_CODES; // 0: C2 .. 27: S4-5
const INTACT_IDX = LEVELS.length; // 28 => 'INT'

const UPPER_KEY_INDICES = [3, 4, 5, 6, 7] as const; // C5, C6, C7, C8, T1
const LOWER_KEY_INDICES = [20, 21, 22, 23, 24] as const; // L2, L3, L4, L5, S1
const ALL_KEY_INDICES = [...UPPER_KEY_INDICES, ...LOWER_KEY_INDICES] as const;

type KeyMuscleRoot = (typeof ASIA_ISNCSCI_KEY_MUSCLES)[number]['rootLevel'];

const IDX_TO_KEY_ROOT: Partial<Record<number, KeyMuscleRoot>> = {
  3: 'C5',
  4: 'C6',
  5: 'C7',
  6: 'C8',
  7: 'T1',
  20: 'L2',
  21: 'L3',
  22: 'L4',
  23: 'L5',
  24: 'S1',
};

function idxToLevelCode(idx: number): AsiaLevelCode {
  if (idx < 0) return 'C1';
  if (idx >= INTACT_IDX) return 'INT';
  return LEVELS[idx];
}

function parseSensoryScore(val?: SensoryTableModalityGrade): number | 'NT' | null {
  if (!val) return null;
  if (val === 'NT') return 'NT';
  if (val === '0') return 0;
  if (val === '1') return 1;
  if (val === '2') return 2;
  return null;
}

function parseMotorScore(
  val: MyotomeMotorEntry['rightGrade'] | undefined
): number | 'NT' | null {
  if (!val) return null;
  if (val === 'NT') return 'NT';
  const n = Number.parseInt(String(val).replace(/[+-]/g, ''), 10);
  if (Number.isNaN(n) || n < 0 || n > 5) return null;
  return n;
}

/** Merge sensoryTable with legacy dermatomes array (same rules as AsiaSensoryTable). */
function buildResolvedSensoryTable(
  sensoryTable: Record<string, SensoryTableModalityGrade> | undefined,
  dermatomes: DermatomeSensoryEntry[] | undefined
): Record<string, SensoryTableModalityGrade> {
  const merged: Record<string, SensoryTableModalityGrade> = { ...(sensoryTable || {}) };
  for (const d of dermatomes || []) {
    const code = d.rootLevel === 'S4' || d.rootLevel === 'S5' ? 'S4-5' : d.rootLevel;
    if (d.rightLightTouch && !merged[getAsiaSensoryCellKey(code, 'R', 'LT')]) {
      merged[getAsiaSensoryCellKey(code, 'R', 'LT')] = d.rightLightTouch;
    }
    if (d.rightPinPrick && !merged[getAsiaSensoryCellKey(code, 'R', 'PP')]) {
      merged[getAsiaSensoryCellKey(code, 'R', 'PP')] = d.rightPinPrick;
    }
    if (d.leftLightTouch && !merged[getAsiaSensoryCellKey(code, 'L', 'LT')]) {
      merged[getAsiaSensoryCellKey(code, 'L', 'LT')] = d.leftLightTouch;
    }
    if (d.leftPinPrick && !merged[getAsiaSensoryCellKey(code, 'L', 'PP')]) {
      merged[getAsiaSensoryCellKey(code, 'L', 'PP')] = d.leftPinPrick;
    }
  }
  return merged;
}

/** Resolve the 10 official ASIA key muscles for both sides. */
function buildAsiaKeyMuscleMap(
  myotomes: MyotomeMotorEntry[]
): Record<'R' | 'L', Record<KeyMuscleRoot, number | 'NT' | null>> {
  const out: Record<'R' | 'L', Record<KeyMuscleRoot, number | 'NT' | null>> = {
    R: { C5: null, C6: null, C7: null, C8: null, T1: null, L2: null, L3: null, L4: null, L5: null, S1: null },
    L: { C5: null, C6: null, C7: null, C8: null, T1: null, L2: null, L3: null, L4: null, L5: null, S1: null },
  };

  for (const km of ASIA_ISNCSCI_KEY_MUSCLES) {
    const found =
      findMyotomeEntry(
        myotomes,
        km.testId,
        km.rootLevel,
        km.linkedClinicalTestId,
        km.rootLevel !== 'C5'
      ) ||
      (km.rootLevel === 'C5'
        ? myotomes.find(
            (e) =>
              !e.testId &&
              e.rootLevel === 'C5' &&
              /elbow|مرفق|biceps/i.test(`${e.movementLabelEn} ${e.movementLabelAr}`)
          )
        : undefined);

    if (!found) continue;
    out.R[km.rootLevel] = parseMotorScore(found.rightGrade);
    out.L[km.rootLevel] = parseMotorScore(found.leftGrade);
  }

  return out;
}

interface LevelResolution {
  status: 'determined' | 'nd' | 'incomplete';
  /** When determined: -1 (C1), 0..27 (C2..S4-5), 28 (INT). */
  idx: number | null;
  /** Highest index confirmed intact (2 for sensory, 5/presumed-5 for motor) before stopping at ND/missing */
  confirmedIntactThroughIdx: number;
  /** Earliest possible level if ND/missing were abnormal (-1..27) */
  earliestPossibleIdx: number;
}

/**
 * Step 1: Sensory Level (one side) per ISNCSCI 2019:
 * Most caudal dermatome with BOTH LT === 2 AND PP === 2 and all rostral levels intact.
 */
function resolveSensoryLevel(
  table: Record<string, SensoryTableModalityGrade>,
  side: 'R' | 'L'
): LevelResolution {
  let confirmedIntactThroughIdx = -1;

  for (let i = 0; i < LEVELS.length; i++) {
    const code = LEVELS[i];
    const lt = parseSensoryScore(table[getAsiaSensoryCellKey(code, side, 'LT')]);
    const pp = parseSensoryScore(table[getAsiaSensoryCellKey(code, side, 'PP')]);

    // If either modality is definitely abnormal (0 or 1), level i is NOT intact -> sensory level = i - 1 (or C1)
    if (lt === 0 || lt === 1 || pp === 0 || pp === 1) {
      return {
        status: 'determined',
        idx: i - 1,
        confirmedIntactThroughIdx,
        earliestPossibleIdx: i - 1,
      };
    }

    // Both intact -> advance
    if (lt === 2 && pp === 2) {
      confirmedIntactThroughIdx = i;
      continue;
    }

    // Otherwise at least one is NT or missing (and neither is 0/1)
    if (lt === 'NT' || pp === 'NT') {
      return {
        status: 'nd',
        idx: null,
        confirmedIntactThroughIdx,
        earliestPossibleIdx: i - 1,
      };
    }

    // Untested / missing cell
    return {
      status: 'incomplete',
      idx: null,
      confirmedIntactThroughIdx,
      earliestPossibleIdx: i - 1,
    };
  }

  // All 28 levels (C2..S4-5) are 2 for both LT and PP
  return {
    status: 'determined',
    idx: INTACT_IDX,
    confirmedIntactThroughIdx: LEVELS.length - 1,
    earliestPossibleIdx: INTACT_IDX,
  };
}

/**
 * Step 2: Motor Level (one side) per ISNCSCI 2019:
 * - Lowest key muscle >= 3 provided all rostral testable/presumed motor levels are 5.
 * - In non-key-muscle segments (C1–C4, T2–L1, S2–S4-5), motor level follows sensory level
 *   when all rostral key muscles are 5.
 */
function resolveMotorLevel(
  sensoryRes: LevelResolution,
  keyMuscles: Record<KeyMuscleRoot, number | 'NT' | null>
): LevelResolution {
  // Check C1..C4 sensory gate:
  // If sensory level is determined and <= C3 (idx <= 1), C4 motor is presumed abnormal -> motor level = sensory level.
  if (sensoryRes.status === 'determined' && sensoryRes.idx !== null && sensoryRes.idx <= 1) {
    return {
      status: 'determined',
      idx: sensoryRes.idx,
      confirmedIntactThroughIdx: sensoryRes.idx,
      earliestPossibleIdx: sensoryRes.idx,
    };
  }

  // If C2..C4 sensory is NOT confirmed intact (stopped at C2..C4 with ND or incomplete),
  // we cannot assume C4 motor is intact.
  if (sensoryRes.confirmedIntactThroughIdx < 2) {
    return {
      status: sensoryRes.status === 'nd' ? 'nd' : 'incomplete',
      idx: null,
      confirmedIntactThroughIdx: sensoryRes.confirmedIntactThroughIdx,
      earliestPossibleIdx: sensoryRes.earliestPossibleIdx,
    };
  }

  // C2..C4 sensory is confirmed intact => C1..C4 motor is presumed intact (5).
  // Evaluate Upper Extremity key muscles C5 (3) .. T1 (7)
  let confirmedIntactThroughIdx = 2; // C4
  for (const k of UPPER_KEY_INDICES) {
    const root = IDX_TO_KEY_ROOT[k]!;
    const g = keyMuscles[root];
    if (g === 5) {
      confirmedIntactThroughIdx = k;
      continue;
    }
    if (g === 3 || g === 4) {
      return {
        status: 'determined',
        idx: k,
        confirmedIntactThroughIdx,
        earliestPossibleIdx: k,
      };
    }
    if (g === 0 || g === 1 || g === 2) {
      return {
        status: 'determined',
        idx: k - 1,
        confirmedIntactThroughIdx,
        earliestPossibleIdx: k - 1,
      };
    }
    if (g === 'NT') {
      return {
        status: 'nd',
        idx: null,
        confirmedIntactThroughIdx,
        earliestPossibleIdx: k - 1,
      };
    }
    return {
      status: 'incomplete',
      idx: null,
      confirmedIntactThroughIdx,
      earliestPossibleIdx: k - 1,
    };
  }

  // All C5..T1 key muscles are 5!
  // Now check Thoracic + L1 region (T2..L1, indices 8..19) via sensory level:
  if (sensoryRes.status === 'determined' && sensoryRes.idx !== null) {
    // If sensory level is C4..T1 (idx 2..7), T2 sensory is abnormal while T1 motor is 5 -> Motor Level = T1 (7)!
    if (sensoryRes.idx <= 7) {
      return {
        status: 'determined',
        idx: 7, // T1
        confirmedIntactThroughIdx: 7,
        earliestPossibleIdx: 7,
      };
    }
    // If sensory level is T2..T12 (idx 8..18), T2..sIdx are presumed 5 and sIdx+1 is abnormal -> Motor Level = sIdx!
    if (sensoryRes.idx <= 18) {
      return {
        status: 'determined',
        idx: sensoryRes.idx,
        confirmedIntactThroughIdx: sensoryRes.idx,
        earliestPossibleIdx: sensoryRes.idx,
      };
    }
  }

  // If sensory wasn't confirmed intact through L1 (idx 19), stop here as ND or incomplete (earliest possible is max(7, earliestPossibleIdx))
  if (sensoryRes.confirmedIntactThroughIdx < 19) {
    return {
      status: sensoryRes.status === 'nd' ? 'nd' : 'incomplete',
      idx: null,
      confirmedIntactThroughIdx: Math.max(7, sensoryRes.confirmedIntactThroughIdx),
      earliestPossibleIdx: Math.max(7, sensoryRes.earliestPossibleIdx),
    };
  }

  // C5..T1 are 5 AND T2..L1 sensory are intact (presumed 5) => evaluate L2 (20) .. S1 (24)
  confirmedIntactThroughIdx = 19; // L1
  for (const k of LOWER_KEY_INDICES) {
    const root = IDX_TO_KEY_ROOT[k]!;
    const g = keyMuscles[root];
    if (g === 5) {
      confirmedIntactThroughIdx = k;
      continue;
    }
    if (g === 3 || g === 4) {
      return {
        status: 'determined',
        idx: k,
        confirmedIntactThroughIdx,
        earliestPossibleIdx: k,
      };
    }
    if (g === 0 || g === 1 || g === 2) {
      return {
        status: 'determined',
        idx: k - 1,
        confirmedIntactThroughIdx,
        earliestPossibleIdx: k - 1,
      };
    }
    if (g === 'NT') {
      return {
        status: 'nd',
        idx: null,
        confirmedIntactThroughIdx,
        earliestPossibleIdx: k - 1,
      };
    }
    return {
      status: 'incomplete',
      idx: null,
      confirmedIntactThroughIdx,
      earliestPossibleIdx: k - 1,
    };
  }

  // All L2..S1 key muscles are 5!
  // Now check S2..S4-5 (25..27) via sensory level:
  if (sensoryRes.status === 'determined' && sensoryRes.idx !== null) {
    if (sensoryRes.idx <= 24) {
      // Sensory abnormal at S2 (or rostral), while S1 motor is 5 -> Motor Level = S1 (24)
      return {
        status: 'determined',
        idx: 24,
        confirmedIntactThroughIdx: 24,
        earliestPossibleIdx: 24,
      };
    }
    if (sensoryRes.idx === 25 || sensoryRes.idx === 26) {
      // S2 or S3
      return {
        status: 'determined',
        idx: sensoryRes.idx,
        confirmedIntactThroughIdx: sensoryRes.idx,
        earliestPossibleIdx: sensoryRes.idx,
      };
    }
    if (sensoryRes.idx >= INTACT_IDX) {
      return {
        status: 'determined',
        idx: INTACT_IDX,
        confirmedIntactThroughIdx: LEVELS.length - 1,
        earliestPossibleIdx: INTACT_IDX,
      };
    }
  }

  return {
    status: sensoryRes.status === 'nd' ? 'nd' : 'incomplete',
    idx: null,
    confirmedIntactThroughIdx: Math.max(24, sensoryRes.confirmedIntactThroughIdx),
    earliestPossibleIdx: Math.max(24, sensoryRes.earliestPossibleIdx),
  };
}

/**
 * Step 3: Single Neurological Level of Injury (NLI) = most cephalad (minimum index)
 * among Right Sensory, Left Sensory, Right Motor, Left Motor.
 */
function resolveNli(
  levels: [LevelResolution, LevelResolution, LevelResolution, LevelResolution]
): LevelResolution {
  const determined = levels.filter((l) => l.status === 'determined' && l.idx !== null);
  const undetermined = levels.filter((l) => l.status !== 'determined');

  if (undetermined.length === 0) {
    const minIdx = Math.min(...determined.map((l) => l.idx!));
    return {
      status: 'determined',
      idx: minIdx,
      confirmedIntactThroughIdx: minIdx,
      earliestPossibleIdx: minIdx,
    };
  }

  // Per ISNCSCI 2019: even if one limb/modality has NT (ND), if a determined level is
  // ALREADY rostral or equal to the earliest possible level of EVERY undetermined channel,
  // NLI is still definitively known!
  if (determined.length > 0) {
    const minDetermined = Math.min(...determined.map((l) => l.idx!));
    const canAnyUndeterminedBeMoreRostral = undetermined.some(
      (u) => u.earliestPossibleIdx < minDetermined
    );
    if (!canAnyUndeterminedBeMoreRostral) {
      return {
        status: 'determined',
        idx: minDetermined,
        confirmedIntactThroughIdx: minDetermined,
        earliestPossibleIdx: minDetermined,
      };
    }
  }

  const anyNd = undetermined.some((u) => u.status === 'nd');
  const anyIncomplete = undetermined.some((u) => u.status === 'incomplete');
  return {
    status: anyIncomplete ? 'incomplete' : anyNd ? 'nd' : 'incomplete',
    idx: null,
    confirmedIntactThroughIdx: Math.min(...levels.map((l) => l.confirmedIntactThroughIdx)),
    earliestPossibleIdx: Math.min(...levels.map((l) => l.earliestPossibleIdx)),
  };
}

/**
 * Sensory ZPP (2019 Revised):
 * Applicable on a given side ONLY when DAP === 'no' AND S4-5 LT === 0 AND S4-5 PP === 0 on that side.
 */
function resolveSensoryZpp(
  table: Record<string, SensoryTableModalityGrade>,
  side: 'R' | 'L',
  dap: AsiaSacralFinding | null | undefined,
  sensoryLevel: LevelResolution
): AsiaZppValue {
  const s45Lt = parseSensoryScore(table[getAsiaSensoryCellKey('S4-5', side, 'LT')]);
  const s45Pp = parseSensoryScore(table[getAsiaSensoryCellKey('S4-5', side, 'PP')]);

  // If sacral sensation is present on this side OR DAP is yes -> NA per ISNCSCI 2019
  if (dap === 'yes' || s45Lt === 1 || s45Lt === 2 || s45Pp === 1 || s45Pp === 2) {
    return 'NA';
  }
  // Need DAP === 'no' AND S4-5 LT === 0 AND S4-5 PP === 0 to confirm applicability
  if (dap === 'NT' || s45Lt === 'NT' || s45Pp === 'NT') {
    return 'ND';
  }
  if (dap !== 'no' || s45Lt !== 0 || s45Pp !== 0) {
    return null;
  }

  // Walk caudally from S3 (26) up to C2 (0) to find the most caudal dermatome with LT > 0 or PP > 0
  let encounteredNtAboveZero = false;
  let encounteredMissingAboveZero = false;

  for (let i = LEVELS.length - 2; i >= 0; i--) {
    const code = LEVELS[i];
    const lt = parseSensoryScore(table[getAsiaSensoryCellKey(code, side, 'LT')]);
    const pp = parseSensoryScore(table[getAsiaSensoryCellKey(code, side, 'PP')]);

    if (lt === 1 || lt === 2 || pp === 1 || pp === 2) {
      if (encounteredMissingAboveZero) return null;
      if (encounteredNtAboveZero) return 'ND';
      return code;
    }
    if (lt === 'NT' || pp === 'NT') {
      encounteredNtAboveZero = true;
    } else if (lt === null || pp === null) {
      encounteredMissingAboveZero = true;
    }
  }

  if (encounteredMissingAboveZero) return null;
  if (encounteredNtAboveZero) return 'ND';
  // No sensation anywhere from C2..S4-5 -> C1 (same as sensory level C1)
  if (sensoryLevel.status === 'determined' && sensoryLevel.idx !== null) {
    return idxToLevelCode(sensoryLevel.idx) as AsiaZppValue;
  }
  return 'C1';
}

/**
 * Motor ZPP (2019 Revised):
 * Applicable ONLY when VAC === 'no' (even in AIS B/C/D!).
 * Most caudal key muscle on that side with grade >= 1; if none caudal to motor level, equals motor level.
 */
function resolveMotorZpp(
  keyMuscles: Record<KeyMuscleRoot, number | 'NT' | null>,
  vac: AsiaSacralFinding | null | undefined,
  motorLevel: LevelResolution
): AsiaZppValue {
  if (vac === 'yes') return 'NA';
  if (vac === 'NT') return 'ND';
  if (vac !== 'no') return null;

  // Walk caudal key muscles S1 (24) up to C5 (3)
  let encounteredNt = false;
  let encounteredMissing = false;
  let lowestPreservedKeyIdx: number | null = null;

  for (let i = ALL_KEY_INDICES.length - 1; i >= 0; i--) {
    const k = ALL_KEY_INDICES[i];
    const root = IDX_TO_KEY_ROOT[k]!;
    const g = keyMuscles[root];
    if (typeof g === 'number' && g >= 1) {
      lowestPreservedKeyIdx = k;
      break;
    }
    if (g === 'NT') {
      encounteredNt = true;
    } else if (g === null) {
      encounteredMissing = true;
    }
  }

  if (encounteredMissing && lowestPreservedKeyIdx === null) return null;
  if (encounteredNt) return 'ND';

  if (motorLevel.status === 'determined' && motorLevel.idx !== null) {
    if (lowestPreservedKeyIdx !== null && lowestPreservedKeyIdx > motorLevel.idx) {
      if (encounteredMissing) return null;
      return LEVELS[lowestPreservedKeyIdx];
    }
    return idxToLevelCode(motorLevel.idx) as AsiaZppValue;
  }

  return motorLevel.status === 'nd' ? 'ND' : null;
}

export interface ClassifyAsiaInput {
  sensoryTable?: Record<string, SensoryTableModalityGrade>;
  dermatomes?: DermatomeSensoryEntry[];
  myotomes?: MyotomeMotorEntry[];
  asiaSacral?: AsiaSacralSparingData;
}

/**
 * Computes complete official ASIA / ISNCSCI (2019 Revised) classification from
 * PhysioRecord's neurological exam battery.
 */
export function classifyAsiaIsncsci2019(
  input: ClassifyAsiaInput
): AsiaIsncsciClassification {
  const resolvedSensory = buildResolvedSensoryTable(input.sensoryTable, input.dermatomes);
  const myotomes = input.myotomes || [];
  const keyMuscles = buildAsiaKeyMuscleMap(myotomes);
  const vac = input.asiaSacral?.vac ?? null;
  const dap = input.asiaSacral?.dap ?? null;

  const sensoryTotals = computeAsiaSensoryTotals(resolvedSensory);
  const motorTotals = computeAsiaMotorTotals(myotomes);

  const hasAnyAsiaData =
    sensoryTotals.recordedCells > 0 ||
    motorTotals.recordedMuscles > 0 ||
    vac !== null ||
    dap !== null;

  // Missing counters
  const missingSensoryCells = Math.max(0, LEVELS.length * 4 - sensoryTotals.recordedCells);
  const recordedKeyMuscleSides =
    motorTotals.rightUEMSRecorded +
    motorTotals.leftUEMSRecorded +
    motorTotals.rightLEMSRecorded +
    motorTotals.leftLEMSRecorded;
  const missingKeyMuscleSides = Math.max(0, 20 - recordedKeyMuscleSides);

  const s45RLt = parseSensoryScore(resolvedSensory[getAsiaSensoryCellKey('S4-5', 'R', 'LT')]);
  const s45RPp = parseSensoryScore(resolvedSensory[getAsiaSensoryCellKey('S4-5', 'R', 'PP')]);
  const s45LLt = parseSensoryScore(resolvedSensory[getAsiaSensoryCellKey('S4-5', 'L', 'LT')]);
  const s45LPp = parseSensoryScore(resolvedSensory[getAsiaSensoryCellKey('S4-5', 'L', 'PP')]);

  const missingS45Sensory =
    s45RLt === null || s45RPp === null || s45LLt === null || s45LPp === null;
  const missingDap = dap === null;
  const missingVac = vac === null;

  const missing: AsiaMissingRequirements = {
    missingSensoryCells,
    missingKeyMuscleSides,
    missingS45Sensory,
    missingDap,
    missingVac,
  };

  // Step 1 & 2: Unilateral Sensory and Motor Levels
  const rSensory = resolveSensoryLevel(resolvedSensory, 'R');
  const lSensory = resolveSensoryLevel(resolvedSensory, 'L');
  const rMotor = resolveMotorLevel(rSensory, keyMuscles.R);
  const lMotor = resolveMotorLevel(lSensory, keyMuscles.L);

  const toCode = (res: LevelResolution): AsiaLevelCode => {
    if (res.status === 'determined' && res.idx !== null) return idxToLevelCode(res.idx);
    if (res.status === 'nd') return 'ND';
    return null;
  };

  const rightSensoryLevel = toCode(rSensory);
  const leftSensoryLevel = toCode(lSensory);
  const rightMotorLevel = toCode(rMotor);
  const leftMotorLevel = toCode(lMotor);

  // Step 3: NLI
  const nliRes = resolveNli([rSensory, lSensory, rMotor, lMotor]);
  const nli = toCode(nliRes);

  // Step 4: Sacral Sparing & Completeness
  const s45Values = [s45RLt, s45RPp, s45LLt, s45LPp];
  const anyS45Preserved = s45Values.some((v) => v === 1 || v === 2);
  const allS45Zero = s45Values.every((v) => v === 0);
  const anyS45Nt = s45Values.some((v) => v === 'NT');

  let hasSensorySacralSparing: boolean | null = null;
  if (anyS45Preserved || dap === 'yes') {
    hasSensorySacralSparing = true;
  } else if (allS45Zero && dap === 'no') {
    hasSensorySacralSparing = false;
  }

  let hasMotorSacralSparing: boolean | null = null;
  if (vac === 'yes') hasMotorSacralSparing = true;
  else if (vac === 'no') hasMotorSacralSparing = false;

  const isFullyIntact =
    rSensory.status === 'determined' &&
    rSensory.idx === INTACT_IDX &&
    lSensory.status === 'determined' &&
    lSensory.idx === INTACT_IDX &&
    rMotor.status === 'determined' &&
    rMotor.idx === INTACT_IDX &&
    lMotor.status === 'determined' &&
    lMotor.idx === INTACT_IDX;

  let completeness: AsiaCompleteness = null;
  let aisGrade: AisGrade = null;
  let aisReasonAr: string | null = null;
  let aisReasonEn: string | null = null;
  let clinicalCautionAr: string | null = null;
  let clinicalCautionEn: string | null = null;
  let motorBelowNli: AsiaMotorBelowNliStats | null = null;

  // Step 5: AIS Grade (A / B / C / D / E / ND)
  if (isFullyIntact) {
    if (vac === 'no' || dap === 'no') {
      // Edge safety: all dermatomes 2 & key muscles 5, yet VAC or DAP explicitly marked absent
      completeness = 'incomplete';
      aisGrade = 'ND';
      clinicalCautionAr =
        'جميع القطاعات الجلدية (2/2) والعضلات الأساسية (5/5) طبيعية لكن تم تسجيل غياب VAC أو DAP — يرجى مراجعة فحص المنطقة العجزية قبل اعتماد التصنيف.';
      clinicalCautionEn =
        'All dermatomes (2/2) and key muscles (5/5) are normal, yet VAC or DAP was marked absent — review sacral findings before finalizing AIS.';
    } else {
      completeness = 'intact';
      aisGrade = 'E';
      aisReasonAr = 'الوظيفة الحسية والحركية طبيعية بالكامل في جميع المستويات (LT 112/112 · PP 112/112 · Motor 100/100).';
      aisReasonEn = 'Sensory and motor function are normal in all segments (LT 112/112, PP 112/112, Motor 100/100).';
      clinicalCautionAr =
        'ملاحظة معيار ASIA: تُستخدم الدرجة AIS E حصراً للمتابعة عند شخص لديه إصابة نخاع شوكي موثّقة سابقاً واستعاد الوظيفة الطبيعية؛ ولا تُطلق على شخص سليم دون إصابة سابقة.';
      clinicalCautionEn =
        'ISNCSCI rule: AIS E is used ONLY in follow-up testing when an individual with a documented prior SCI has recovered normal function.';
    }
  } else if (hasSensorySacralSparing === false && hasMotorSacralSparing === false) {
    // Complete injury (AIS A) — no sacral sparing
    completeness = 'complete';
    aisGrade = 'A';
    aisReasonAr = 'إصابة كاملة: غياب كامل للإحساس والحركة في القطاعين العجزيين S4-5 (LT/PP = 0 و DAP = لا و VAC = لا).';
    aisReasonEn = 'Complete injury: no sensory or motor function preserved in sacral segments S4-5 (S4-5 LT/PP = 0, DAP = No, VAC = No).';
  } else if (hasSensorySacralSparing === true || hasMotorSacralSparing === true) {
    // Incomplete injury (AIS B, C, or D)
    completeness = 'incomplete';

    // Check Motor Incomplete criteria:
    // (1) VAC === 'yes' OR
    // (2) Sensory sacral sparing present AND motor function (key OR non-key muscle) spared > 3 levels below motor level on EITHER side
    const checkMotorSparingMoreThan3Below = (
      side: 'R' | 'L',
      sideMotorRes: LevelResolution,
      sideKeyMuscles: Record<KeyMuscleRoot, number | 'NT' | null>
    ): 'yes' | 'no' | 'nd' | 'incomplete' => {
      if (sideMotorRes.status === 'incomplete' || sideMotorRes.idx === null) {
        return sideMotorRes.status === 'nd' ? 'nd' : 'incomplete';
      }
      const thresholdIdx = sideMotorRes.idx + 3;
      let anyNt = false;
      let anyMissing = false;
      for (const k of ALL_KEY_INDICES) {
        if (k <= thresholdIdx) continue;
        const root = IDX_TO_KEY_ROOT[k]!;
        const g = sideKeyMuscles[root];
        if (typeof g === 'number' && g >= 1) return 'yes';

        // Per ISNCSCI 9th Edition (2026, REV 04/26): Also check any tested non-key muscle at this segment (>3 below motor level)
        const nonKeyPreserved = myotomes.some((entry) => {
          const normalizedRoot = entry.rootLevel === 'L1-L2' ? 'L2' : entry.rootLevel;
          if (normalizedRoot !== root) return false;
          const rawScore = side === 'R' ? entry.rightGrade : entry.leftGrade;
          const num = parseMotorScore(rawScore);
          return typeof num === 'number' && num >= 1;
        });
        if (nonKeyPreserved) return 'yes';

        if (g === 'NT') anyNt = true;
        else if (g === null) anyMissing = true;
      }
      if (anyMissing) return 'incomplete';
      if (anyNt) return 'nd';
      return 'no';
    };

    let motorIncompleteStatus: 'yes' | 'no' | 'nd' | 'incomplete';
    let motorIncompleteVia3Levels = false;

    if (hasMotorSacralSparing === true) {
      motorIncompleteStatus = 'yes';
    } else if (hasMotorSacralSparing === false) {
      // VAC === 'no', sensory sacral sparing === true -> check >3 levels below motor level on either side
      const rMore3 = checkMotorSparingMoreThan3Below('R', rMotor, keyMuscles.R);
      const lMore3 = checkMotorSparingMoreThan3Below('L', lMotor, keyMuscles.L);

      if (rMore3 === 'yes' || lMore3 === 'yes') {
        motorIncompleteStatus = 'yes';
        motorIncompleteVia3Levels = true;
      } else if (rMore3 === 'no' && lMore3 === 'no') {
        motorIncompleteStatus = 'no';
      } else if (rMore3 === 'incomplete' || lMore3 === 'incomplete') {
        motorIncompleteStatus = 'incomplete';
      } else {
        motorIncompleteStatus = 'nd';
      }
    } else {
      // VAC is missing or NT
      if (vac === 'NT') {
        // Even if VAC is NT, if >3 levels below motor level has sparing, it's ALREADY motor incomplete!
        const rMore3 = checkMotorSparingMoreThan3Below('R', rMotor, keyMuscles.R);
        const lMore3 = checkMotorSparingMoreThan3Below('L', lMotor, keyMuscles.L);
        if (rMore3 === 'yes' || lMore3 === 'yes') {
          motorIncompleteStatus = 'yes';
          motorIncompleteVia3Levels = true;
        } else {
          motorIncompleteStatus = 'nd';
        }
      } else {
        motorIncompleteStatus = 'incomplete';
      }
    }

    if (motorIncompleteStatus === 'no') {
      aisGrade = 'B';
      aisReasonAr =
        'غير كاملة حسياً (Sensory Incomplete): الإحساس العجزي محفوظ (S4-5 أو DAP) مع غياب VAC وعدم وجود حركة محفوظة لأكثر من 3 مستويات دون المستوى الحركي في كلا الجانبين.';
      aisReasonEn =
        'Sensory Incomplete: sacral sensation preserved (S4-5 or DAP), VAC absent, and no motor function spared >3 levels below the motor level on either side.';
    } else if (motorIncompleteStatus === 'yes') {
      // Distinguish AIS C vs AIS D using key muscles strictly below NLI
      if (nliRes.status === 'determined' && nliRes.idx !== null) {
        let total = 0;
        let atLeastGrade3 = 0;
        let lessThanGrade3 = 0;
        let ntCount = 0;
        let missingCount = 0;

        for (const k of ALL_KEY_INDICES) {
          if (k <= nliRes.idx) continue;
          const root = IDX_TO_KEY_ROOT[k]!;
          for (const side of ['R', 'L'] as const) {
            total += 1;
            const g = keyMuscles[side][root];
            if (typeof g === 'number') {
              if (g >= 3) atLeastGrade3 += 1;
              else lessThanGrade3 += 1;
            } else if (g === 'NT') {
              ntCount += 1;
            } else {
              missingCount += 1;
            }
          }
        }

        const percentAtLeast3 =
          total > 0 && missingCount === 0 && ntCount === 0
            ? Math.round((atLeastGrade3 / total) * 100)
            : total > 0 && missingCount + ntCount < total
              ? Math.round((atLeastGrade3 / total) * 100)
              : null;

        motorBelowNli = {
          total,
          atLeastGrade3,
          lessThanGrade3,
          ntCount,
          missingCount,
          percentAtLeast3,
        };

        if (total === 0) {
          // NLI is S1, S2, or S3 -> no key muscles below NLI; motor function intact at testable key muscles -> AIS D
          aisGrade = 'D';
          aisReasonAr =
            'غير كاملة حركياً: جميع العضلات الأساسية القابلة للاختبار دون المستوى العصبي محفوظة (≥ 3/5).';
          aisReasonEn =
            'Motor Incomplete: no key muscles exist below the NLI (sacral level) and all testable key muscles are intact.';
        } else {
          const half = total / 2;
          const unknown = ntCount + missingCount;

          if (atLeastGrade3 >= half) {
            aisGrade = 'D';
            aisReasonAr = `غير كاملة حركياً: ${atLeastGrade3} من أصل ${total} عضلة أساسية دون NLI (${Math.round((atLeastGrade3 / total) * 100)}%) بدرجة ≥ 3/5 (النصف أو أكثر).`;
            aisReasonEn = `Motor Incomplete: ${atLeastGrade3}/${total} (${Math.round((atLeastGrade3 / total) * 100)}%) key muscle functions below NLI have grade ≥ 3 (at least half).`;
          } else if (atLeastGrade3 + unknown < half) {
            aisGrade = 'C';
            aisReasonAr = `غير كاملة حركياً: ${atLeastGrade3} من أصل ${total} عضلة أساسية دون NLI (${Math.round((atLeastGrade3 / total) * 100)}%) بدرجة ≥ 3/5 (أقل من النصف)${
              motorIncompleteVia3Levels
                ? ' — أُثبت عدم الاكتمال الحركي عبر حفظ حركة بأكثر من 3 مستويات دون المستوى الحركي.'
                : '.'
            }`;
            aisReasonEn = `Motor Incomplete: ${atLeastGrade3}/${total} (${Math.round((atLeastGrade3 / total) * 100)}%) key muscles below NLI have grade ≥ 3 (less than half)${
              motorIncompleteVia3Levels
                ? ' — motor incomplete via >3 levels below motor level rule.'
                : '.'
            }`;
          } else if (missingCount === 0 && ntCount > 0) {
            aisGrade = 'ND';
            aisReasonAr =
              'تعذر الحسم بين AIS C و AIS D بسبب وجود عضلات غير قابلة للفحص (NT) دون المستوى العصبي.';
            aisReasonEn =
              'Cannot distinguish AIS C vs D due to NT key muscles below NLI.';
          } else {
            aisGrade = null;
          }
        }
      } else if (nliRes.status === 'nd') {
        aisGrade = 'ND';
      }
    } else if (motorIncompleteStatus === 'nd') {
      aisGrade = 'ND';
    }
  } else {
    // Completeness cannot be determined yet — check if blocked by NT (ND) vs merely incomplete input
    const blockedByNt =
      !missingS45Sensory &&
      !missingDap &&
      !missingVac &&
      (anyS45Nt || dap === 'NT' || vac === 'NT');
    if (blockedByNt) {
      completeness = 'ND';
      aisGrade = 'ND';
    }
  }

  // Step 6: 2019 Revised ZPP (Sensory R/L & Motor R/L)
  const rightSensoryZpp = resolveSensoryZpp(resolvedSensory, 'R', dap, rSensory);
  const leftSensoryZpp = resolveSensoryZpp(resolvedSensory, 'L', dap, lSensory);
  const rightMotorZpp = resolveMotorZpp(keyMuscles.R, vac, rMotor);
  const leftMotorZpp = resolveMotorZpp(keyMuscles.L, vac, lMotor);

  return {
    hasAnyAsiaData,
    sensoryTotals,
    motorTotals,
    rightSensoryLevel,
    leftSensoryLevel,
    rightMotorLevel,
    leftMotorLevel,
    nli,
    completeness,
    aisGrade,
    aisReasonAr,
    aisReasonEn,
    clinicalCautionAr,
    clinicalCautionEn,
    rightSensoryZpp,
    leftSensoryZpp,
    rightMotorZpp,
    leftMotorZpp,
    motorBelowNli,
    hasSensorySacralSparing,
    hasMotorSacralSparing,
    missing,
  };
}
