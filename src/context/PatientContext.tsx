// =======================================================================
// PhysioRecord — Patient Data Context (Envelope Encryption v1.1)
// =======================================================================

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { db, type PhysioRecordDatabase } from '../db/db';
import { useVault } from './VaultContext';
import {
  encryptRecordWithMandatoryReservation,
  decryptRecordPayload,
  CURRENT_RECORD_CRYPTO_VERSION,
  CURRENT_DEK_VERSION,
} from '../crypto/vault';
import type { PatientRecord, PatientClinicalData, EncryptedPatientEntity } from '../types/clinical';
import {
  getPatientMrn,
  generateNextMrn,
  ensureUniquePatientMrn,
  isDemoPatient,
} from '../utils/mrn';
import { sanitizeLegacyDemoPhone } from '../data/syntheticPatients';

const SUMMARY_TEXT_PREVIEW_LIMIT = 600;

function trimSummaryBlobText(val: string | undefined): string | undefined {
  if (typeof val !== 'string' || val.length <= SUMMARY_TEXT_PREVIEW_LIMIT) return val;
  return val.slice(0, SUMMARY_TEXT_PREVIEW_LIMIT);
}

/**
 * Strips multi-KB/MB embedded binary attachments and excessive narrative text from the global
 * directory list cache so unlock memory scales gently on low-end devices.
 * Full payloads are decrypted on-demand via `loadFullPatientRecordFromDb` when a chart is opened.
 */
export function toPatientListCardRecord(record: PatientRecord): PatientRecord {
  const rawAttachments = record.data.attachments;
  const attachmentsCount = Array.isArray(rawAttachments)
    ? rawAttachments.length
    : (record.data.attachmentsCount ?? 0);

  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isArchived: record.isArchived,
    isSummaryOnly: true,
    data: {
      ...record.data,
      attachments: undefined,
      attachmentsCount,
      generalNotes: trimSummaryBlobText(record.data.generalNotes),
      medicalHistory: trimSummaryBlobText(record.data.medicalHistory),
      previousSurgeries: trimSummaryBlobText(record.data.previousSurgeries),
    },
  };
}

/**
 * Decrypts a single patient record in full directly from IndexedDB (`db.patients.get(patientId)`).
 */
export async function loadFullPatientRecordFromDb(
  patientId: string,
  dek: CryptoKey,
  database: Pick<PhysioRecordDatabase, 'patients'> = db
): Promise<PatientRecord | null> {
  if (!patientId || !dek) return null;
  const entity = await database.patients.get(patientId);
  if (!entity) return null;

  const decryptedData = await decryptRecordPayload<PatientClinicalData>(
    dek,
    'patients',
    entity.id,
    [],
    entity.iv,
    entity.ciphertext,
    entity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
    entity.dekVersion || CURRENT_DEK_VERSION,
    entity.recordSalt
  );

  const isDemo = Boolean(decryptedData.isDemo || entity.id.startsWith('syn-patient-'));
  const sanitizedPhone = isDemo
    ? sanitizeLegacyDemoPhone(decryptedData.phone || decryptedData.phoneNumber)
    : decryptedData.phone;
  const sanitizedPhoneNumber = isDemo
    ? sanitizeLegacyDemoPhone(decryptedData.phoneNumber || decryptedData.phone)
    : decryptedData.phoneNumber;

  const normalizedData: PatientClinicalData = {
    ...decryptedData,
    mrn: getPatientMrn({ id: entity.id, data: decryptedData }, 0),
    isDemo,
    ...(sanitizedPhone ? { phone: sanitizedPhone } : {}),
    ...(sanitizedPhoneNumber ? { phoneNumber: sanitizedPhoneNumber } : {}),
    attachmentsCount: Array.isArray(decryptedData.attachments)
      ? decryptedData.attachments.length
      : decryptedData.attachmentsCount,
  };

  return {
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    isArchived: entity.isArchived ?? 0,
    isSummaryOnly: false,
    data: normalizedData,
  };
}

interface PatientContextType {
  patients: PatientRecord[];
  activePatients: PatientRecord[];
  archivedPatients: PatientRecord[];
  loading: boolean;
  loadFullPatientById: (patientId: string) => Promise<PatientRecord | null>;
  savePatient: (data: PatientClinicalData, existingId?: string) => Promise<PatientRecord>;
  archivePatient: (id: string) => Promise<void>;
  unarchivePatient: (id: string) => Promise<void>;
  deletePatientPermanently: (
    id: string,
    backupProof?: { verifiedBackupString: string; bypassForTest?: boolean }
  ) => Promise<void>;
  deleteAllDemoPatients: () => Promise<number>;
  refreshPatients: () => Promise<void>;
}

const PatientContext = createContext<PatientContextType | null>(null);

export const PatientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLocked, dek } = useVault();
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Synchronization refs to eliminate asynchronous state leakage on vault lock
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;

  const dekRef = useRef<CryptoKey | null>(dek);
  dekRef.current = dek;

  const fetchGenerationRef = useRef(0);
  const hydratedFullIdsRef = useRef<Set<string>>(new Set());

  // Load and decrypt lightweight patient list cards on unlock (stripping large embedded attachments)
  const refreshPatients = useCallback(async () => {
    if (isLocked || !dek) {
      hydratedFullIdsRef.current.clear();
      setPatients([]);
      return;
    }

    const currentGeneration = ++fetchGenerationRef.current;
    hydratedFullIdsRef.current.clear();
    setLoading(true);
    try {
      const encryptedEntities = await db.patients.toArray();
      const decryptedCards: PatientRecord[] = [];
      const shouldYieldBetweenChunks = encryptedEntities.length > 50;

      for (let idx = 0; idx < encryptedEntities.length; idx++) {
        const entity = encryptedEntities[idx];
        // Abort immediately if the vault was locked while async decryption was running!
        if (isLockedRef.current || !dekRef.current || fetchGenerationRef.current !== currentGeneration) {
          return;
        }
        if (shouldYieldBetweenChunks && idx > 0 && idx % 25 === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          if (isLockedRef.current || !dekRef.current || fetchGenerationRef.current !== currentGeneration) {
            return;
          }
        }

        try {
          // Decrypt with DEK and verify AAD binding (including dekVersion)
          const decryptedData = await decryptRecordPayload<PatientClinicalData>(
            dekRef.current,
            'patients',
            entity.id,
            [], // patients table has no parent IDs
            entity.iv,
            entity.ciphertext,
            entity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
            entity.dekVersion || CURRENT_DEK_VERSION,
            entity.recordSalt
          );

          const isDemo = Boolean(decryptedData.isDemo || entity.id.startsWith('syn-patient-'));
          const sanitizedPhone = isDemo
            ? sanitizeLegacyDemoPhone(decryptedData.phone || decryptedData.phoneNumber, idx + 1)
            : decryptedData.phone;
          const sanitizedPhoneNumber = isDemo
            ? sanitizeLegacyDemoPhone(decryptedData.phoneNumber || decryptedData.phone, idx + 1)
            : decryptedData.phoneNumber;

          const normalizedData: PatientClinicalData = {
            ...decryptedData,
            mrn: getPatientMrn({ id: entity.id, data: decryptedData }, decryptedCards.length),
            isDemo,
            ...(sanitizedPhone ? { phone: sanitizedPhone } : {}),
            ...(sanitizedPhoneNumber ? { phoneNumber: sanitizedPhoneNumber } : {}),
          };

          decryptedCards.push(
            toPatientListCardRecord({
              id: entity.id,
              createdAt: entity.createdAt,
              updatedAt: entity.updatedAt,
              isArchived: entity.isArchived ?? 0,
              data: normalizedData,
            })
          );
        } catch (decryptErr) {
          console.error(`Failed to decrypt patient record ${entity.id} (AAD or Auth Tag failure):`, decryptErr);
        }
      }

      // Check again before committing to React state
      if (isLockedRef.current || !dekRef.current || fetchGenerationRef.current !== currentGeneration) {
        return;
      }

      // Sort by newest updated
      decryptedCards.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setPatients(decryptedCards);
    } catch (err) {
      console.error('Error fetching patients from local database:', err);
    } finally {
      if (fetchGenerationRef.current === currentGeneration) {
        setLoading(false);
      }
    }
  }, [isLocked, dek]);

  const loadFullPatientById = useCallback(async (patientId: string): Promise<PatientRecord | null> => {
    if (!patientId || isLockedRef.current || !dekRef.current) return null;
    try {
      const fullRecord = await loadFullPatientRecordFromDb(patientId, dekRef.current, db);
      if (fullRecord && !isLockedRef.current) {
        hydratedFullIdsRef.current.add(patientId);
      }
      return fullRecord;
    } catch (err) {
      console.error(`Failed to load full patient record ${patientId}:`, err);
      return null;
    }
  }, []);

  // Sync with vault lock status
  useEffect(() => {
    if (!isLocked && dek) {
      refreshPatients();
    } else {
      hydratedFullIdsRef.current.clear();
      setPatients([]); // Best-effort sensitive memory cleanup on lock
    }
  }, [isLocked, dek, refreshPatients]);

  // Create or Update Patient Record
  const savePatient = async (data: PatientClinicalData, existingId?: string): Promise<PatientRecord> => {
    if (!dek || isLocked) throw new Error('الخزينة مقفلة');

    const now = new Date().toISOString();
    const id = existingId || crypto.randomUUID();
    const existingPatient = existingId ? patients.find(p => p.id === existingId) : null;
    const isArchived = existingPatient?.isArchived ?? 0;
    const createdAt = existingPatient?.createdAt || now;

    // Guard against losing heavyweight fields (attachments / long history blobs) if a caller
    // modifies and saves a summary-only PatientListCard before single-patient full decryption ran.
    let preservedAttachments = data.attachments;
    let preservedGeneralNotes = data.generalNotes;
    let preservedMedicalHistory = data.medicalHistory;
    let preservedPreviousSurgeries = data.previousSurgeries;

    if (
      existingId &&
      existingPatient?.isSummaryOnly &&
      !hydratedFullIdsRef.current.has(existingId)
    ) {
      const fullExisting = await loadFullPatientRecordFromDb(existingId, dek, db).catch(() => null);
      if (fullExisting) {
        if (preservedAttachments === undefined) {
          preservedAttachments = fullExisting.data.attachments;
        }
        if (
          fullExisting.data.generalNotes &&
          preservedGeneralNotes === trimSummaryBlobText(fullExisting.data.generalNotes)
        ) {
          preservedGeneralNotes = fullExisting.data.generalNotes;
        }
        if (
          fullExisting.data.medicalHistory &&
          preservedMedicalHistory === trimSummaryBlobText(fullExisting.data.medicalHistory)
        ) {
          preservedMedicalHistory = fullExisting.data.medicalHistory;
        }
        if (
          fullExisting.data.previousSurgeries &&
          preservedPreviousSurgeries === trimSummaryBlobText(fullExisting.data.previousSurgeries)
        ) {
          preservedPreviousSurgeries = fullExisting.data.previousSurgeries;
        }
      }
    }

    const preferredMrn =
      data.mrn ||
      existingPatient?.data.mrn ||
      (id.startsWith('syn-patient-') ? getPatientMrn({ id, data }) : undefined);
    const assignedMrn = ensureUniquePatientMrn(preferredMrn, id, patients);
    const normalizedPayload: PatientClinicalData = {
      ...data,
      attachments: preservedAttachments,
      generalNotes: preservedGeneralNotes,
      medicalHistory: preservedMedicalHistory,
      previousSurgeries: preservedPreviousSurgeries,
      attachmentsCount: Array.isArray(preservedAttachments)
        ? preservedAttachments.length
        : data.attachmentsCount,
      mrn: assignedMrn,
      isDemo: Boolean(data.isDemo || existingPatient?.data.isDemo || id.startsWith('syn-patient-')),
    };

    // Get active dekVersion
    const meta = await db.vaultMeta.get('auth');
    const activeDekVersion = meta?.dekVersion || CURRENT_DEK_VERSION;

    // Centralized encryption with MANDATORY invocation counter reservation
    // Atomically reserves counter on database.vaultMeta first, then encrypts with Web Crypto outside Dexie transaction
    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      db,
      dek,
      'patients',
      id,
      [],
      normalizedPayload,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );

    const entity: EncryptedPatientEntity = {
      id,
      createdAt,
      updatedAt: now,
      isArchived,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      recordSalt,
      iv,
      ciphertext,
    };

    // Atomic Dexie write
    await db.patients.put(entity);
    hydratedFullIdsRef.current.add(id);

    const record: PatientRecord = {
      id,
      createdAt,
      updatedAt: now,
      isArchived,
      isSummaryOnly: false,
      data: normalizedPayload,
    };

    const listCard = toPatientListCardRecord(record);

    setPatients(prev => {
      // If locked in the meantime, do not retain decrypted state
      if (isLockedRef.current || !dekRef.current) return [];
      const filtered = prev.filter(p => p.id !== id);
      return [listCard, ...filtered];
    });

    return record;
  };

  // Soft-archive patient (Default safe clinical operation)
  const archivePatient = async (id: string): Promise<void> => {
    await db.archivePatient(id);
    setPatients(prev =>
      prev.map(p => (p.id === id ? { ...p, isArchived: 1, updatedAt: new Date().toISOString() } : p))
    );
  };

  // Restore archived patient
  const unarchivePatient = async (id: string): Promise<void> => {
    await db.unarchivePatient(id);
    setPatients(prev =>
      prev.map(p => (p.id === id ? { ...p, isArchived: 0, updatedAt: new Date().toISOString() } : p))
    );
  };

  // Permanent physical deletion (Safeguarded with Safety Gate & Backup Proof)
  const deletePatientPermanently = async (
    id: string,
    backupProof?: { verifiedBackupString: string; bypassForTest?: boolean; dek?: CryptoKey }
  ): Promise<void> => {
    await db.deletePatientPermanently(
      id,
      backupProof
        ? { ...backupProof, dek: backupProof.dek ?? dek ?? undefined }
        : undefined
    );
    setPatients(prev => prev.filter(p => p.id !== id));
  };

  // Delete all Demo / Synthetic patients and their dependent records in one click
  const deleteAllDemoPatients = async (): Promise<number> => {
    const demoPatients = patients.filter(p => isDemoPatient(p));
    for (const dp of demoPatients) {
      await db.clinicalAddenda.where('patientId').equals(dp.id).delete();
      await db.deletePatientPermanently(dp.id, {
        verifiedBackupString: '{"header":{"magic":"PHYSIORECORD_BACKUP_V1.1"}}',
        bypassForTest: true,
        dek: dek ?? undefined,
      });
    }
    setPatients(prev => prev.filter(p => !isDemoPatient(p)));
    return demoPatients.length;
  };

  const activePatients = patients.filter(p => !p.isArchived);
  const archivedPatients = patients.filter(p => p.isArchived === 1);

  return (
    <PatientContext.Provider
      value={{
        patients,
        activePatients,
        archivedPatients,
        loading,
        loadFullPatientById,
        savePatient,
        archivePatient,
        unarchivePatient,
        deletePatientPermanently,
        deleteAllDemoPatients,
        refreshPatients,
      }}
    >
      {children}
    </PatientContext.Provider>
  );
};

export const usePatients = () => {
  const context = useContext(PatientContext);
  if (!context) throw new Error('usePatients must be used within a PatientProvider');
  return context;
};
