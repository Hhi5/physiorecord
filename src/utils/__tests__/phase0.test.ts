import { describe, it, expect } from 'vitest';
import { localDate, formatClinicalDate, computePatientAge } from '../date';
import {
  findMatchingBaselineRomEntry,
  compareLongitudinalRomEntries,
  findMatchingBaselineMmtEntry,
  compareLongitudinalMmtEntries,
  ROM_JOINTS_CATALOG,
} from '../../data/clinicalToolkit/romMmtCatalog';
import {
  computeScalePercentage,
  classifyOutcomeSeverity,
  evaluateBaselineChange,
} from '../outcomeMeasures';
import { SessionService } from '../../services/sessionService';
import { SYNTHETIC_PATIENTS } from '../../data/syntheticPatients';
import type { RomMeasurementEntry, MmtMeasurementEntry } from '../../types/clinical';

describe('Phase 0 — Dates, Age, ROM/MMT Matching & Session Numbering', () => {
  describe('localDate()', () => {
    it('formats a local Date as YYYY-MM-DD using local calendar components', () => {
      const sample = new Date(2026, 4, 9, 0, 30, 0); // May 9, 2026 00:30 local time
      expect(localDate(sample)).toBe('2026-05-09');
    });

    it('preserves already formatted YYYY-MM-DD strings without UTC shifting', () => {
      expect(localDate('2026-11-08')).toBe('2026-11-08');
    });
  });

  describe('formatClinicalDate()', () => {
    it('renders Gregorian calendar with Latin digits (0-9) in Arabic and English', () => {
      const arFormatted = formatClinicalDate('2026-03-15', 'ar');
      const enFormatted = formatClinicalDate('2026-03-15', 'en');

      expect(arFormatted).toMatch(/2026/);
      expect(enFormatted).toMatch(/2026/);
      // Ensure no Eastern Arabic-Indic digits (٠-٩)
      expect(arFormatted).not.toMatch(/[٠-٩]/);
      expect(enFormatted).not.toMatch(/[٠-٩]/);
    });
  });

  describe('computePatientAge()', () => {
    it('computes age dynamically from dateOfBirth relative to reference date', () => {
      const refDate = new Date(2026, 5, 15); // June 15, 2026
      expect(computePatientAge('1990-06-15', 20, refDate)).toBe(36);
      expect(computePatientAge('1990-06-16', 20, refDate)).toBe(35);
    });

    it('falls back to legacy age when dateOfBirth is missing or empty', () => {
      expect(computePatientAge(undefined, 42)).toBe(42);
      expect(computePatientAge('', 42)).toBe(42);
      expect(computePatientAge(undefined, undefined)).toBeUndefined();
    });
  });

  describe('ROM longitudinal matching (jointId + movementId + laterality + movementType)', () => {
    const makeRomEntry = (
      overrides: Partial<RomMeasurementEntry> & {
        movementType: 'AROM' | 'PROM';
        measuredAngleDegrees: number | null;
      }
    ): RomMeasurementEntry => ({
      entryId: `rom_${overrides.movementType}`,
      jointId: 'shoulder',
      jointNameAr: 'الكتف',
      jointNameEn: 'Shoulder',
      movementId: 'shoulder_flexion',
      movementNameAr: 'ثني الكتف',
      movementNameEn: 'Shoulder Flexion',
      laterality: 'right',
      isTested: true,
      ...overrides,
    });

    it('distinguishes AROM and PROM entries for the same joint, movement, and side', () => {
      const baselineEntries: RomMeasurementEntry[] = [
        makeRomEntry({ movementType: 'AROM', measuredAngleDegrees: 110 }),
        makeRomEntry({ movementType: 'PROM', measuredAngleDegrees: 145 }),
      ];

      const currentProm = makeRomEntry({ movementType: 'PROM', measuredAngleDegrees: 160 });
      const currentArom = makeRomEntry({ movementType: 'AROM', measuredAngleDegrees: 130 });

      const matchedProm = findMatchingBaselineRomEntry(baselineEntries, currentProm);
      const matchedArom = findMatchingBaselineRomEntry(baselineEntries, currentArom);

      expect(matchedProm).toBeDefined();
      expect(matchedProm?.movementType).toBe('PROM');
      expect(matchedProm?.measuredAngleDegrees).toBe(145);
      expect(compareLongitudinalRomEntries(matchedProm!, currentProm).deltaDegrees).toBe(15);

      expect(matchedArom).toBeDefined();
      expect(matchedArom?.movementType).toBe('AROM');
      expect(matchedArom?.measuredAngleDegrees).toBe(110);
      expect(compareLongitudinalRomEntries(matchedArom!, currentArom).deltaDegrees).toBe(20);
    });

    it('does not match AROM against PROM when movementType differs', () => {
      const baselineOnlyArom: RomMeasurementEntry[] = [
        makeRomEntry({ movementType: 'AROM', measuredAngleDegrees: 110 }),
      ];
      const currentProm = makeRomEntry({ movementType: 'PROM', measuredAngleDegrees: 150 });

      expect(findMatchingBaselineRomEntry(baselineOnlyArom, currentProm)).toBeUndefined();
      expect(
        compareLongitudinalRomEntries(baselineOnlyArom[0], currentProm).isComparable
      ).toBe(false);
    });
  });

  describe('MMT longitudinal matching', () => {
    const makeMmtEntry = (
      overrides: Partial<MmtMeasurementEntry>
    ): MmtMeasurementEntry => ({
      entryId: 'mmt_1',
      muscleGroupId: 'quadriceps',
      muscleNameAr: 'العضلة رباعية الرؤوس',
      muscleNameEn: 'Quadriceps',
      actionNameAr: 'بسط الركبة',
      actionNameEn: 'Knee Extension',
      laterality: 'left',
      isTested: true,
      gradeValue: '3+',
      gravityCondition: 'against_gravity',
      ...overrides,
    });

    it('matches MMT baseline by muscleGroupId + laterality and computes grade delta', () => {
      const baseline = makeMmtEntry({ gradeValue: '3+' });
      const current = makeMmtEntry({ gradeValue: '4+' });

      const matched = findMatchingBaselineMmtEntry([baseline], current);
      expect(matched).toBeDefined();

      const comp = compareLongitudinalMmtEntries(matched!, current);
      expect(comp.isComparable).toBe(true);
      expect(comp.rankDelta).toBe(3);
      expect(comp.baselineGrade).toBe('3+');
      expect(comp.currentGrade).toBe('4+');
    });
  });

  describe('Session numbering uniqueness', () => {
    it('computes max(sessionNumber) + 1 even when earlier drafts were deleted or manual numbers exist', () => {
      // Suppose sessions #1 and #2 were created, #2 was deleted, and #4 was manually numbered
      const existing = [
        { sessionNumber: 1, data: { sessionNumber: 1 } },
        { sessionNumber: 4, data: { sessionNumber: 4 } },
      ];
      expect(SessionService.computeNextSessionNumber(existing)).toBe(5);
      expect(SessionService.computeNextSessionNumber([])).toBe(1);
    });
  });

  describe('Synthetic patient seeds (fixed IDs)', () => {
    it('assigns a unique, non-empty deterministic id to every synthetic patient seed', () => {
      expect(SYNTHETIC_PATIENTS.length).toBeGreaterThan(0);
      const ids = SYNTHETIC_PATIENTS.map((p) => p.id);
      for (const id of ids) {
        expect(typeof id).toBe('string');
        expect(id.trim().length).toBeGreaterThan(0);
      }
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('Phase 0 Open-Source Hygiene & Clinical Updates', () => {
    it('omits normative ROM reference ranges from ROM_JOINTS_CATALOG movements', () => {
      expect(ROM_JOINTS_CATALOG.length).toBeGreaterThan(0);
      for (const joint of ROM_JOINTS_CATALOG) {
        for (const mov of joint.movements) {
          expect('normalRangeDegrees' in (mov as unknown as Record<string, unknown>)).toBe(false);
        }
      }
    });

    it('computes percentages, severity bands, and MCID status for score-entry & functional measures', () => {
      // ODI score entry: raw 20 / 50 -> 40%
      expect(computeScalePercentage('odi', 20, 50)).toBe(40);
      expect(classifyOutcomeSeverity('odi', 20, 40).en).toMatch(/Moderate Disability/i);

      // ODI drop 30 -> 18 (12 / 50 -> 60% to 36%, MCID >= 10% points)
      const odiEval = evaluateBaselineChange('odi', 30, 18, 60, 36);
      expect(odiEval.improved).toBe(true);
      expect(odiEval.mcidMet).toBe(true);

      // 30-second chair stand: higher reps = improvement (8 -> 12, MCID >= 2 reps)
      const cstEval = evaluateBaselineChange('chair_stand_30s', 8, 12, 27, 40);
      expect(cstEval.improved).toBe(true);
      expect(cstEval.mcidMet).toBe(true);

      // 5xSTS: lower seconds = improvement (16.5s -> 11.2s, MCID >= 2.3s)
      const stsEval = evaluateBaselineChange('five_x_sts', 16.5, 11.2, 59, 72);
      expect(stsEval.improved).toBe(true);
      expect(stsEval.mcidMet).toBe(true);
      expect(classifyOutcomeSeverity('five_x_sts', 16.5, 59).en).toMatch(/Bohannon 2006|norm/i);

      // Custom Measure Builder: lower is better, range 0..100, MCID = 15
      const customCfg = {
        id: 'c1',
        nameAr: 'مقياس اختبار',
        nameEn: 'Test Scale',
        minScore: 0,
        maxScore: 100,
        higherIsBetter: false,
        mcidDelta: 15,
      };
      expect(computeScalePercentage('custom', 45, 100, customCfg)).toBe(45);
      const customEval = evaluateBaselineChange('custom', 60, 40, 60, 40, customCfg);
      expect(customEval.improved).toBe(true);
      expect(customEval.mcidMet).toBe(true);
    });
  });
});

