// =======================================================================
// PhysioRecord — Official ASIA / ISNCSCI (2019 Revised) Classifier Tests
// Covers Sensory/Motor Levels (R/L), NLI, Completeness, AIS A/B/C/D/E,
// 2019 Revised ZPP rules, >3 levels below motor level, and NT/ND logic.
// =======================================================================

import { describe, it, expect } from 'vitest';
import type { MyotomeMotorEntry, SensoryTableModalityGrade } from '../../types/clinical';
import {
  ASIA_ISNCSCI_LEVEL_CODES,
  getAsiaSensoryCellKey,
} from '../../data/clinicalToolkit/dermatomesData';
import { ASIA_ISNCSCI_KEY_MUSCLES } from '../../data/clinicalToolkit/myotomesData';
import { classifyAsiaIsncsci2019 } from '../asiaIsncsciClassifier';

type KeyRoot = (typeof ASIA_ISNCSCI_KEY_MUSCLES)[number]['rootLevel'];

function buildSensoryTable(
  fillFn: (
    level: (typeof ASIA_ISNCSCI_LEVEL_CODES)[number],
    idx: number,
    side: 'R' | 'L',
    modality: 'LT' | 'PP'
  ) => SensoryTableModalityGrade | undefined
): Record<string, SensoryTableModalityGrade> {
  const table: Record<string, SensoryTableModalityGrade> = {};
  ASIA_ISNCSCI_LEVEL_CODES.forEach((level, idx) => {
    for (const side of ['R', 'L'] as const) {
      for (const mod of ['LT', 'PP'] as const) {
        const v = fillFn(level, idx, side, mod);
        if (v) table[getAsiaSensoryCellKey(level, side, mod)] = v;
      }
    }
  });
  return table;
}

function buildMotorEntries(
  grades: Partial<Record<KeyRoot, [MyotomeMotorEntry['rightGrade'], MyotomeMotorEntry['leftGrade']]>>
): MyotomeMotorEntry[] {
  return ASIA_ISNCSCI_KEY_MUSCLES.map((km) => {
    const pair = grades[km.rootLevel] ?? [null, null];
    return {
      rootLevel: km.rootLevel,
      testId: km.testId,
      protocol: 'asia',
      isPrimary: true,
      movementLabelEn: km.functionEn,
      movementLabelAr: km.functionAr,
      muscleLabelEn: km.musclesEn,
      muscleLabelAr: km.musclesAr,
      rightGrade: pair[0],
      leftGrade: pair[1],
    };
  });
}

describe('ASIA / ISNCSCI (2019 Revised) Automatic Classifier', () => {
  it('classifies AIS A (Complete T4 SCI) with accurate Sensory/Motor ZPP', () => {
    // T4 is index 10. C2..T4 intact (2), T5..T6 altered (1) on Right only, T7..S4-5 = 0.
    const sensoryTable = buildSensoryTable((_lvl, idx, side) => {
      if (idx <= 10) return '2'; // C2..T4 intact
      if (side === 'R' && (idx === 11 || idx === 12)) return '1'; // T5, T6 partial on Right
      return '0';
    });

    // Upper extremity C5..T1 = 5 bilaterally; Lower extremity L2..S1 = 0 except L2 Right = 1 (Motor ZPP)
    const myotomes = buildMotorEntries({
      C5: ['5', '5'],
      C6: ['5', '5'],
      C7: ['5', '5'],
      C8: ['5', '5'],
      T1: ['5', '5'],
      L2: ['1', '0'],
      L3: ['0', '0'],
      L4: ['0', '0'],
      L5: ['0', '0'],
      S1: ['0', '0'],
    });

    const res = classifyAsiaIsncsci2019({
      sensoryTable,
      myotomes,
      asiaSacral: { dap: 'no', vac: 'no' },
    });

    expect(res.rightSensoryLevel).toBe('T4');
    expect(res.leftSensoryLevel).toBe('T4');
    expect(res.rightMotorLevel).toBe('T4');
    expect(res.leftMotorLevel).toBe('T4');
    expect(res.nli).toBe('T4');
    expect(res.completeness).toBe('complete');
    expect(res.aisGrade).toBe('A');

    // 2019 ZPP: Right Sensory ZPP = T6, Left Sensory ZPP = T4, Right Motor ZPP = L2, Left Motor ZPP = T4
    expect(res.rightSensoryZpp).toBe('T6');
    expect(res.leftSensoryZpp).toBe('T4');
    expect(res.rightMotorZpp).toBe('L2');
    expect(res.leftMotorZpp).toBe('T4');
  });

  it('classifies AIS B (Sensory Incomplete) when VAC = no and motor sparing is <= 3 levels below motor level', () => {
    // C5 index = 3. C2..C5 intact, C6..S3 = 0, S4-5 LT = 1 (sacral sensory sparing)
    const sensoryTable = buildSensoryTable((lvl, idx, _side, mod) => {
      if (idx <= 3) return '2';
      if (lvl === 'S4-5' && mod === 'LT') return '1';
      return '0';
    });

    // Motor level = C5 (grade 3). C8 is index 6 = exactly 3 levels below C5 (6 - 3 = 3, NOT > 3!)
    const myotomes = buildMotorEntries({
      C5: ['3', '3'],
      C6: ['2', '0'],
      C7: ['0', '0'],
      C8: ['2', '0'], // exactly 3 levels below C5 -> still AIS B!
      T1: ['0', '0'],
      L2: ['0', '0'],
      L3: ['0', '0'],
      L4: ['0', '0'],
      L5: ['0', '0'],
      S1: ['0', '0'],
    });

    const res = classifyAsiaIsncsci2019({
      sensoryTable,
      myotomes,
      asiaSacral: { dap: 'yes', vac: 'no' },
    });

    expect(res.rightMotorLevel).toBe('C5');
    expect(res.leftMotorLevel).toBe('C5');
    expect(res.nli).toBe('C5');
    expect(res.completeness).toBe('incomplete');
    expect(res.aisGrade).toBe('B');

    // 2019 Revised ZPP rules:
    // Sensory ZPP = NA because DAP = yes (and S4-5 LT > 0)
    // Motor ZPP IS applicable because VAC = no! Right Motor ZPP = C8, Left Motor ZPP = C5.
    expect(res.rightSensoryZpp).toBe('NA');
    expect(res.leftSensoryZpp).toBe('NA');
    expect(res.rightMotorZpp).toBe('C8');
    expect(res.leftMotorZpp).toBe('C5');
  });

  it('classifies AIS C via >3 levels below motor level rule even when VAC = no', () => {
    // Same C5 sensory & motor level, DAP = yes, VAC = no, BUT T1 Right = 2 (4 levels below C5!)
    const sensoryTable = buildSensoryTable((lvl, idx) => {
      if (idx <= 3) return '2';
      if (lvl === 'S4-5') return '0';
      return '0';
    });

    const myotomes = buildMotorEntries({
      C5: ['3', '3'],
      C6: ['0', '0'],
      C7: ['0', '0'],
      C8: ['0', '0'],
      T1: ['2', '0'], // 4 levels below C5 -> Motor Incomplete!
      L2: ['0', '0'],
      L3: ['0', '0'],
      L4: ['0', '0'],
      L5: ['0', '0'],
      S1: ['0', '0'],
    });

    const res = classifyAsiaIsncsci2019({
      sensoryTable,
      myotomes,
      asiaSacral: { dap: 'yes', vac: 'no' },
    });

    expect(res.nli).toBe('C5');
    expect(res.completeness).toBe('incomplete');
    expect(res.aisGrade).toBe('C');
    expect(res.motorBelowNli?.total).toBe(18);
    expect(res.motorBelowNli?.atLeastGrade3).toBe(0);
    // 2019 ZPP: Motor ZPP still applies since VAC = no!
    expect(res.rightMotorZpp).toBe('T1');
    expect(res.leftMotorZpp).toBe('C5');
    expect(res.rightSensoryZpp).toBe('NA');
  });

  it('distinguishes AIS C (<50% >=3 below NLI) vs AIS D (>=50% >=3 below NLI, exact 50% boundary)', () => {
    // T10 sensory (index 16) intact bilaterally; C5..T1 = 5 bilaterally -> NLI = T10.
    // Key muscles strictly below T10 = L2, L3, L4, L5, S1 x 2 sides = 10 key muscles.
    const sensoryTable = buildSensoryTable((_lvl, idx) => (idx <= 16 ? '2' : '1'));

    // 4 of 10 muscles >= 3 (40% < 50%) => AIS C
    const myotomesC = buildMotorEntries({
      C5: ['5', '5'],
      C6: ['5', '5'],
      C7: ['5', '5'],
      C8: ['5', '5'],
      T1: ['5', '5'],
      L2: ['4', '4'],
      L3: ['3', '3'],
      L4: ['2', '2'],
      L5: ['1', '1'],
      S1: ['0', '0'],
    });

    const resC = classifyAsiaIsncsci2019({
      sensoryTable,
      myotomes: myotomesC,
      asiaSacral: { dap: 'yes', vac: 'yes' },
    });

    expect(resC.nli).toBe('T10');
    expect(resC.aisGrade).toBe('C');
    expect(resC.motorBelowNli?.atLeastGrade3).toBe(4);
    expect(resC.motorBelowNli?.total).toBe(10);
    expect(resC.rightMotorZpp).toBe('NA'); // VAC = yes

    // 5 of 10 muscles >= 3 (exact 50%) => AIS D!
    const myotomesD = buildMotorEntries({
      C5: ['5', '5'],
      C6: ['5', '5'],
      C7: ['5', '5'],
      C8: ['5', '5'],
      T1: ['5', '5'],
      L2: ['4', '4'],
      L3: ['3', '3'],
      L4: ['3', '2'], // 5th muscle >= 3
      L5: ['1', '1'],
      S1: ['0', '0'],
    });

    const resD = classifyAsiaIsncsci2019({
      sensoryTable,
      myotomes: myotomesD,
      asiaSacral: { dap: 'yes', vac: 'yes' },
    });

    expect(resD.nli).toBe('T10');
    expect(resD.aisGrade).toBe('D');
    expect(resD.motorBelowNli?.atLeastGrade3).toBe(5);
    expect(resD.motorBelowNli?.percentAtLeast3).toBe(50);
  });

  it('classifies AIS E (Intact) with clinical follow-up caution note', () => {
    const sensoryTable = buildSensoryTable(() => '2');
    const myotomes = buildMotorEntries({
      C5: ['5', '5'],
      C6: ['5', '5'],
      C7: ['5', '5'],
      C8: ['5', '5'],
      T1: ['5', '5'],
      L2: ['5', '5'],
      L3: ['5', '5'],
      L4: ['5', '5'],
      L5: ['5', '5'],
      S1: ['5', '5'],
    });

    const res = classifyAsiaIsncsci2019({
      sensoryTable,
      myotomes,
      asiaSacral: { dap: 'yes', vac: 'yes' },
    });

    expect(res.rightSensoryLevel).toBe('INT');
    expect(res.leftSensoryLevel).toBe('INT');
    expect(res.rightMotorLevel).toBe('INT');
    expect(res.leftMotorLevel).toBe('INT');
    expect(res.nli).toBe('INT');
    expect(res.completeness).toBe('intact');
    expect(res.aisGrade).toBe('E');
    expect(res.clinicalCautionEn).toContain('AIS E');
    expect(res.rightSensoryZpp).toBe('NA');
    expect(res.rightMotorZpp).toBe('NA');
  });

  it('applies ISNCSCI motor-level rules for C1-C3 sensory gate and T1 when sensory is C6 with C5-T1=5', () => {
    // Right side: C2..C3 intact, C4 abnormal (Sensory = C3) -> Motor MUST be C3 even if C5=5!
    // Left side: C2..C6 intact (Sensory = C6), C5..T1 all 5 -> Motor MUST be T1 (not C6)!
    const sensoryTable = buildSensoryTable((_lvl, idx, side) => {
      if (side === 'R') return idx <= 1 ? '2' : '0'; // C2, C3 = 2; C4.. = 0
      return idx <= 4 ? '2' : '0'; // C2..C6 = 2; C7.. = 0
    });

    const myotomes = buildMotorEntries({
      C5: ['5', '5'],
      C6: ['5', '5'],
      C7: ['5', '5'],
      C8: ['5', '5'],
      T1: ['5', '5'],
      L2: ['0', '0'],
      L3: ['0', '0'],
      L4: ['0', '0'],
      L5: ['0', '0'],
      S1: ['0', '0'],
    });

    const res = classifyAsiaIsncsci2019({
      sensoryTable,
      myotomes,
      asiaSacral: { dap: 'no', vac: 'no' },
    });

    expect(res.rightSensoryLevel).toBe('C3');
    expect(res.rightMotorLevel).toBe('C3');
    expect(res.leftSensoryLevel).toBe('C6');
    expect(res.leftMotorLevel).toBe('T1');
    expect(res.nli).toBe('C3');
    expect(res.aisGrade).toBe('A');
  });

  it('handles NT without blocking AIS D or NLI when mathematically determined, and marks ND when truly ambiguous', () => {
    // NLI = L2 (L2 sensory intact, L3 sensory = 1; C5..T1=5, L2=4 bilaterally).
    // Key muscles below L2 = L3, L4, L5, S1 x 2 = 8 muscles.
    // Suppose 4 of them are >=3 and 1 is NT -> ALREADY >= 50% -> AIS D!
    const sensoryTable = buildSensoryTable((_lvl, idx) => (idx <= 20 ? '2' : '1'));
    const myotomesGuaranteedD = buildMotorEntries({
      C5: ['5', '5'],
      C6: ['5', '5'],
      C7: ['5', '5'],
      C8: ['5', '5'],
      T1: ['5', '5'],
      L2: ['4', '4'],
      L3: ['4', '4'],
      L4: ['3', '3'], // 4 muscles >= 3 out of 8 (50%)
      L5: ['NT', '1'],
      S1: ['1', '1'],
    });

    const resD = classifyAsiaIsncsci2019({
      sensoryTable,
      myotomes: myotomesGuaranteedD,
      asiaSacral: { dap: 'yes', vac: 'yes' },
    });
    expect(resD.nli).toBe('L2');
    expect(resD.aisGrade).toBe('D');

    // Now only 3 of 8 are >= 3, and 1 is NT -> could be 3/8 (C) or 4/8 (D) => AIS ND!
    const myotomesAmbiguous = buildMotorEntries({
      C5: ['5', '5'],
      C6: ['5', '5'],
      C7: ['5', '5'],
      C8: ['5', '5'],
      T1: ['5', '5'],
      L2: ['4', '4'],
      L3: ['4', '4'],
      L4: ['3', '2'], // 3 muscles >= 3
      L5: ['NT', '1'], // 1 NT -> 3+1 = 4 >= 4 -> ambiguous!
      S1: ['1', '1'],
    });

    const resNd = classifyAsiaIsncsci2019({
      sensoryTable,
      myotomes: myotomesAmbiguous,
      asiaSacral: { dap: 'yes', vac: 'yes' },
    });
    expect(resNd.nli).toBe('L2');
    expect(resNd.aisGrade).toBe('ND');
  });
});
