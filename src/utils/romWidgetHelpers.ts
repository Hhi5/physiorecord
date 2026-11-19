// =======================================================================
// PhysioRecord — Pure ROM Measurement Entry Helpers
// Keeps AROM, PROM, and AAROM measurements distinct per joint/movement/side
// =======================================================================

import type {
  BodyLaterality,
  RomMeasurementEntry,
  RomMovementType,
} from '../types/clinical';
import { buildRomCanonicalKey } from '../data/clinicalToolkit/canonicalKeysCatalog';

export interface UpsertRomEntryParams {
  jointId: string;
  jointNameAr: string;
  jointNameEn: string;
  movementId: string;
  movementNameAr: string;
  movementNameEn: string;
  laterality: BodyLaterality;
  movementType: RomMovementType;
  angle: number | null;
}

/** Find an existing ROM entry matching joint, movement, laterality, and movementType. */
export function findRomEntryIndex(
  entries: RomMeasurementEntry[],
  jointId: string,
  movementId: string,
  laterality: BodyLaterality,
  movementType: RomMovementType
): number {
  return entries.findIndex(
    (e) =>
      e.jointId === jointId &&
      e.movementId === movementId &&
      e.laterality === laterality &&
      e.movementType === movementType
  );
}

/** Read the measured angle for a specific joint, movement, laterality, and movementType. */
export function getRomEntryAngle(
  entries: RomMeasurementEntry[],
  jointId: string,
  movementId: string,
  laterality: BodyLaterality,
  movementType: RomMovementType
): number | null {
  const index = findRomEntryIndex(entries, jointId, movementId, laterality, movementType);
  return index >= 0 ? (entries[index].measuredAngleDegrees ?? null) : null;
}

/** Upsert or remove a single ROM measurement entry keyed by joint, movement, side, and movementType. */
export function upsertRomEntry(
  entries: RomMeasurementEntry[],
  params: UpsertRomEntryParams
): RomMeasurementEntry[] {
  const {
    jointId,
    jointNameAr,
    jointNameEn,
    movementId,
    movementNameAr,
    movementNameEn,
    laterality,
    movementType,
    angle,
  } = params;

  const existingIndex = findRomEntryIndex(entries, jointId, movementId, laterality, movementType);
  const updatedEntries = [...entries];

  if (existingIndex >= 0) {
    if (angle === null) {
      updatedEntries.splice(existingIndex, 1);
    } else {
      const existing = updatedEntries[existingIndex];
      const label = existing.label || `${existing.jointNameEn} - ${existing.movementNameEn}`;
      updatedEntries[existingIndex] = {
        ...existing,
        canonicalKey: existing.canonicalKey || buildRomCanonicalKey(jointId, movementId, laterality),
        label,
        measuredAngleDegrees: angle,
        movementType,
        isTested: true,
      };
    }
    return updatedEntries;
  }

  if (angle !== null) {
    const newEntry: RomMeasurementEntry = {
      entryId:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `rom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      canonicalKey: buildRomCanonicalKey(jointId, movementId, laterality),
      label: `${jointNameEn} - ${movementNameEn}`,
      jointId,
      jointNameAr,
      jointNameEn,
      movementId,
      movementNameAr,
      movementNameEn,
      movementType,
      laterality,
      isTested: true,
      measuredAngleDegrees: angle,
    };
    updatedEntries.push(newEntry);
  }

  return updatedEntries;
}
