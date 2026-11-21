// =======================================================================
// PhysioRecord — Sequential MRN Generator & Patient Safety Helpers
// Generates unique sequential MRNs like PT-000001, PT-000002, etc.
// Eliminates "#syn-pati" and UUID prefix placeholders everywhere.
// =======================================================================

import type { PatientClinicalData, PatientRecord } from '../types/clinical';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import { localizeDemoText } from './demoLocalization';

export function formatMrnNumber(num: number): string {
  const safeNum = Math.max(1, Math.floor(num));
  return `PT-${String(safeNum).padStart(6, '0')}`;
}

function getStoredMrnMap(): Record<string, string> {
  const reg = ClinicOperationsService.getMrnRegistry();
  return reg.patientMrnMap ? { ...reg.patientMrnMap } : {};
}

function saveStoredMrnMap(map: Record<string, string>): void {
  const reg = ClinicOperationsService.getMrnRegistry();
  const issuedSet = new Set<string>(reg.issuedMrns || []);
  for (const val of Object.values(map)) {
    if (val) issuedSet.add(val);
  }
  ClinicOperationsService.saveMrnRegistrySync({
    ...reg,
    patientMrnMap: { ...map },
    issuedMrns: Array.from(issuedSet),
  });
}

export function generateNextMrn(
  existingPatients?: Array<{ id: string; data?: { mrn?: string } }>
): string {
  const reg = ClinicOperationsService.getMrnRegistry();
  let maxSeq = Number.isFinite(reg.sequence) ? reg.sequence : 0;

  for (const val of reg.issuedMrns || []) {
    const m = /^PT-(\d+)$/i.exec(val);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxSeq) maxSeq = n;
    }
  }

  const map = getStoredMrnMap();
  for (const val of Object.values(map)) {
    const m = /^PT-(\d+)$/i.exec(val);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxSeq) maxSeq = n;
    }
  }

  if (existingPatients) {
    for (const p of existingPatients) {
      const candidate = p.data?.mrn;
      if (candidate) {
        const m = /^PT-(\d+)$/i.exec(candidate);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxSeq) maxSeq = n;
        }
      }
      const synMatch = /^syn-patient-(\d+)$/i.exec(p.id);
      if (synMatch) {
        const n = parseInt(synMatch[1], 10);
        if (n > maxSeq) maxSeq = n;
      }
    }
  }

  const next = maxSeq + 1;
  const formatted = formatMrnNumber(next);
  const issuedSet = new Set<string>(reg.issuedMrns || []);
  issuedSet.add(formatted);
  ClinicOperationsService.saveMrnRegistrySync({
    ...reg,
    sequence: next,
    issuedMrns: Array.from(issuedSet),
    patientMrnMap: map,
  });
  return formatted;
}

export function getPatientMrn(
  patient: { id: string; data?: { mrn?: string } } | null | undefined,
  fallbackIndex?: number
): string {
  if (!patient) return 'PT-000000';

  if (patient.data?.mrn && /^PT-\d{4,}$/i.test(patient.data.mrn.trim())) {
    return patient.data.mrn.trim().toUpperCase();
  }

  const synMatch = /^syn-patient-(\d+)$/i.exec(patient.id);
  if (synMatch) {
    return formatMrnNumber(parseInt(synMatch[1], 10));
  }

  const map = getStoredMrnMap();
  if (map[patient.id]) {
    return map[patient.id];
  }

  if (typeof fallbackIndex === 'number' && fallbackIndex >= 0) {
    const assigned = formatMrnNumber(fallbackIndex + 1);
    map[patient.id] = assigned;
    saveStoredMrnMap(map);
    return assigned;
  }

  const generated = generateNextMrn();
  map[patient.id] = generated;
  saveStoredMrnMap(map);
  return generated;
}

export function isDemoPatient(
  patient: { id?: string; data?: { isDemo?: boolean } } | null | undefined
): boolean {
  if (!patient) return false;
  if (patient.data?.isDemo) return true;
  if (patient.id && patient.id.startsWith('syn-patient-')) return true;
  return false;
}

const NONE_STRINGS = new Set([
  'لا يوجد',
  'لا توجد',
  'بدون',
  'none',
  'nil',
  'n/a',
  '-',
  '—',
]);

export function isMeaningfulClinicalAlertText(text: string | undefined | null): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !NONE_STRINGS.has(trimmed.toLowerCase());
}

export function hasPatientRedFlagsOrContraindications(
  data: Partial<PatientClinicalData> | undefined | null
): boolean {
  if (!data) return false;
  const hasChecklistFlags = Boolean(
    data.redFlagChecklist?.some((item) => item.status === 'present')
  );
  return (
    hasChecklistFlags ||
    isMeaningfulClinicalAlertText(data.redFlags) ||
    isMeaningfulClinicalAlertText(data.contraindications) ||
    isMeaningfulClinicalAlertText(data.precautions)
  );
}

/**
 * Ensures patient MRNs remain strictly unique across all existing patients in the clinic.
 * Auto-advances to the next sequential MRN when absent or colliding with another patientId.
 */
export function ensureUniquePatientMrn(
  candidateMrn: string | undefined,
  patientId: string | undefined,
  existingPatients: Array<{ id: string; data?: { mrn?: string } }>
): string {
  const trimmed = candidateMrn?.trim().toUpperCase() || '';
  const conflict = trimmed
    ? existingPatients.some(
        (p) => p.id !== patientId && p.data?.mrn?.trim().toUpperCase() === trimmed
      )
    : true;
  if (!conflict && trimmed) {
    return trimmed;
  }
  return generateNextMrn(existingPatients);
}

export function hasAnyDemoPatients(patients: PatientRecord[]): boolean {
  return patients.some((p) => isDemoPatient(p));
}

export function getPatientDisplayName(
  data: Partial<PatientClinicalData> | undefined | null,
  lang: 'ar' | 'en' | 'ckb' = 'ar'
): string {
  if (!data) return '—';
  const ar = data.fullNameAr?.trim() || '';
  const en = data.fullName?.trim() || '';
  if (lang === 'ckb') {
    const candidate = ar || en;
    if (!candidate) return '—';
    return localizeDemoText(candidate, 'ckb');
  }
  if (lang === 'en') {
    const candidate = en || ar;
    if (!candidate) return '—';
    return localizeDemoText(candidate, 'en');
  }
  return ar || en || '—';
}

export function getPatientSecondaryName(
  data: Partial<PatientClinicalData> | undefined | null,
  lang: 'ar' | 'en' | 'ckb' = 'ar'
): string | null {
  if (!data) return null;
  const ar = data.fullNameAr?.trim() || '';
  const en = data.fullName?.trim() || '';
  if (!ar || !en || ar === en) return null;
  if (lang === 'ckb') {
    const primary = getPatientDisplayName(data, 'ckb');
    return en && en !== primary ? en : null;
  }
  return lang !== 'en' ? en : ar;
}
