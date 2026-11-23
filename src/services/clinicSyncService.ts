// =======================================================================
// PhysioRecord — Clinic Multi-Device Sync Service (Local-First & Additive)
// Supports:
//  1) Local Wi-Fi Clinic Sync (LAN Hub + Offline Encrypted Outbox + .ptsync)
//  2) Encrypted Google Drive BYOC Sync ($0 ongoing cost)
// Invariant: Strictly non-destructive — NEVER deletes local therapist data.
// =======================================================================

import { db, type PhysioRecordDatabase } from '../db/db';
import {
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  decryptRecordPayload,
  encryptRecordWithMandatoryReservation,
} from '../crypto/vault';
import { EpisodeService } from './episodeService';
import { ClinicOperationsService } from './clinicOperationsService';
import {
  getAllDeletionTombstones,
  recordDeletionTombstones,
} from './deletionTombstoneService';
import { getElectronDesktopBridge } from '../platform/nativeBridge';
import { SYNC_ENVELOPE_MAGIC } from '../config/appConstants';
import {
  PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS,
  decryptSyncEnvelope,
  encryptSyncEnvelope,
  mergeClinicSyncPayloads,
  type ClinicSyncPayload,
  type EncryptedSyncEnvelope,
  type SyncMergeStats,
} from '../utils/clinicSyncEngine';
import {
  isPrivateLanSyncUrl,
  isSafeSyncDeviceId,
  randomHexCsprng,
  safeJsonParse,
} from '../utils/securityHardening';
import { exchangeEnvelopesWithGoogleDrive } from './googleDriveSync';
import type {
  ClinicalAddendumData,
  ClinicalAddendumRecord,
  EncryptedClinicalAddendumEntity,
  EncryptedEpisodeEntity,
  EncryptedPatientEntity,
  EncryptedSessionEntity,
  EncryptedSoapEntity,
  PatientClinicalData,
  PatientRecord,
  SessionClinicalData,
  SessionRecord,
  SoapNoteData,
  SoapNoteRecord,
} from '../types/clinical';

export type ClinicSyncMode = 'off' | 'lan' | 'google_drive';

export interface ClinicSyncConfig {
  mode: ClinicSyncMode;
  deviceId: string;
  deviceLabel: string;
  lanServerUrl: string;
  lanPairingToken: string;
  driveFolderId?: string;
  lastSyncAt?: string;
  lastSyncMode?: ClinicSyncMode;
  lastSyncSummary?: string;
  autoSyncOnReconnect: boolean;
}

export interface OfflineSyncOutboxRecord {
  queuedAt: string;
  targetMode: Exclude<ClinicSyncMode, 'off'>;
  envelope: EncryptedSyncEnvelope;
  reason?: string;
}

export interface ClinicSyncExecutionResult {
  ok: boolean;
  queuedOffline?: boolean;
  peerEnvelopesCount: number;
  stats?: SyncMergeStats;
  messageAr: string;
  messageEn: string;
  driveFolderId?: string;
}

const SYNC_CONFIG_STORAGE_KEY = 'physiorecord_clinic_sync_config_v1';
const SYNC_OUTBOX_STORAGE_KEY = 'physiorecord_clinic_sync_outbox_v1';

function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `dev_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }
  return `dev_${randomHexCsprng(6)}`;
}

function getDefaultDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Clinic Device';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Android Clinic Tablet/Phone';
  if (/Electron/i.test(ua)) return 'Windows Clinic Desktop';
  if (/iPhone|iPad/i.test(ua)) return 'iOS Clinic Device';
  return 'Clinic Web Browser';
}

export function getClinicSyncConfig(): ClinicSyncConfig {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = safeJsonParse<Partial<ClinicSyncConfig>>(raw);
      return {
        mode: parsed.mode === 'lan' || parsed.mode === 'google_drive' ? parsed.mode : 'off',
        deviceId: isSafeSyncDeviceId(parsed.deviceId) ? parsed.deviceId : generateDeviceId(),
        deviceLabel: parsed.deviceLabel || getDefaultDeviceLabel(),
        lanServerUrl: parsed.lanServerUrl || '',
        lanPairingToken: parsed.lanPairingToken || '',
        driveFolderId: parsed.driveFolderId,
        lastSyncAt: parsed.lastSyncAt,
        lastSyncMode: parsed.lastSyncMode,
        lastSyncSummary: parsed.lastSyncSummary,
        autoSyncOnReconnect: parsed.autoSyncOnReconnect !== false,
      };
    }
  } catch {
    // fallback to default
  }

  const fresh: ClinicSyncConfig = {
    mode: 'off',
    deviceId: generateDeviceId(),
    deviceLabel: getDefaultDeviceLabel(),
    lanServerUrl: '',
    lanPairingToken: '',
    autoSyncOnReconnect: true,
  };
  saveClinicSyncConfig(fresh);
  return fresh;
}

export function saveClinicSyncConfig(patch: Partial<ClinicSyncConfig>): ClinicSyncConfig {
  const current = (() => {
    try {
      const raw = localStorage.getItem(SYNC_CONFIG_STORAGE_KEY);
      return raw ? safeJsonParse<Partial<ClinicSyncConfig>>(raw) : {};
    } catch {
      return {};
    }
  })();

  const next: ClinicSyncConfig = {
    mode: patch.mode ?? current.mode ?? 'off',
    deviceId: patch.deviceId ?? current.deviceId ?? generateDeviceId(),
    deviceLabel: patch.deviceLabel ?? current.deviceLabel ?? getDefaultDeviceLabel(),
    lanServerUrl: patch.lanServerUrl ?? current.lanServerUrl ?? '',
    lanPairingToken: patch.lanPairingToken ?? current.lanPairingToken ?? '',
    driveFolderId: patch.driveFolderId ?? current.driveFolderId,
    lastSyncAt: patch.lastSyncAt ?? current.lastSyncAt,
    lastSyncMode: patch.lastSyncMode ?? current.lastSyncMode,
    lastSyncSummary: patch.lastSyncSummary ?? current.lastSyncSummary,
    autoSyncOnReconnect: patch.autoSyncOnReconnect ?? current.autoSyncOnReconnect ?? true,
  };

  try {
    localStorage.setItem(SYNC_CONFIG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
  return next;
}

/**
 * Offline Encrypted Outbox — stores strictly AES-256-GCM ciphertext (zero plaintext PHI)
 * so edits made while the main clinic PC or internet is off are queued cleanly and pushed later.
 */
export function getOfflineSyncOutbox(): OfflineSyncOutboxRecord | null {
  try {
    const raw = localStorage.getItem(SYNC_OUTBOX_STORAGE_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse<OfflineSyncOutboxRecord>(raw);
    return parsed?.envelope?.magic === SYNC_ENVELOPE_MAGIC ? parsed : null;
  } catch {
    return null;
  }
}

export function queueOfflineSyncEnvelope(
  targetMode: Exclude<ClinicSyncMode, 'off'>,
  envelope: EncryptedSyncEnvelope,
  reason?: string
): void {
  const record: OfflineSyncOutboxRecord = {
    queuedAt: new Date().toISOString(),
    targetMode,
    envelope,
    reason,
  };
  try {
    localStorage.setItem(SYNC_OUTBOX_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore storage quota errors on extreme payloads
  }
}

export function clearOfflineSyncOutbox(): void {
  try {
    localStorage.removeItem(SYNC_OUTBOX_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Collects all decrypted clinical records from IndexedDB & ClinicOperationsService
 * into an in-memory ClinicSyncPayload ready for client-side AES-256-GCM encryption.
 */
export async function collectLocalClinicSyncPayload(
  dek: CryptoKey,
  database: PhysioRecordDatabase = db
): Promise<ClinicSyncPayload> {
  const config = getClinicSyncConfig();

  // 1. Patients
  const encPatients = await database.patients.toArray();
  const patients: PatientRecord[] = [];
  for (const entity of encPatients) {
    try {
      const data = await decryptRecordPayload<PatientClinicalData>(
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
      patients.push({
        id: entity.id,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        isArchived: entity.isArchived ?? 0,
        data,
      });
    } catch {
      // skip corrupted record
    }
  }

  // 2. Episodes
  const episodes = await EpisodeService.getAllEpisodes(dek, database);

  // 3. Sessions
  const encSessions = await database.sessions.toArray();
  const sessions: SessionRecord[] = [];
  for (const entity of encSessions) {
    try {
      const data = await decryptRecordPayload<SessionClinicalData>(
        dek,
        'sessions',
        entity.id,
        [entity.patientId, entity.episodeId],
        entity.iv,
        entity.ciphertext,
        entity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
        entity.dekVersion || CURRENT_DEK_VERSION,
        entity.recordSalt
      );
      sessions.push({
        id: entity.id,
        episodeId: entity.episodeId,
        patientId: entity.patientId,
        sessionNumber: data.sessionNumber ?? 1,
        sessionDate: data.sessionDate || entity.createdAt.slice(0, 10),
        sessionType: data.sessionType || 'treatment',
        status: data.status || 'draft',
        attendanceStatus: data.attendanceStatus || 'attended',
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        data,
      });
    } catch {
      // skip
    }
  }

  // 4. SOAP Notes
  const encSoaps = await database.soapNotes.toArray();
  const soapNotes: SoapNoteRecord[] = [];
  for (const entity of encSoaps) {
    try {
      const data = await decryptRecordPayload<SoapNoteData>(
        dek,
        'soapNotes',
        entity.id,
        [entity.patientId, entity.episodeId, entity.sessionId],
        entity.iv,
        entity.ciphertext,
        entity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
        entity.dekVersion || CURRENT_DEK_VERSION,
        entity.recordSalt
      );
      soapNotes.push({
        id: entity.id,
        sessionId: entity.sessionId,
        episodeId: entity.episodeId,
        patientId: entity.patientId,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        data,
      });
    } catch {
      // skip
    }
  }

  // 5. Clinical Addenda
  const encAddenda = await database.clinicalAddenda.toArray();
  const clinicalAddenda: ClinicalAddendumRecord[] = [];
  for (const entity of encAddenda) {
    try {
      const data = await decryptRecordPayload<ClinicalAddendumData>(
        dek,
        'clinicalAddenda',
        entity.id,
        [entity.patientId, entity.sessionId, entity.targetId],
        entity.iv,
        entity.ciphertext,
        entity.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
        entity.dekVersion || CURRENT_DEK_VERSION,
        entity.recordSalt
      );
      clinicalAddenda.push({
        id: entity.id,
        sessionId: entity.sessionId,
        patientId: entity.patientId,
        targetId: entity.targetId,
        createdAt: entity.createdAt,
        data,
      });
    } catch {
      // skip
    }
  }

  // 6. Operational stores & explicit deletion tombstones (Dexie v11)
  const appointments = ClinicOperationsService.getAppointments();
  const invoices = ClinicOperationsService.getInvoicesIQD();
  const episodeClinicalStores = ClinicOperationsService.getAllEpisodeClinicalStores();
  const staffRoster = ClinicOperationsService.getStaffRoster();
  const deletionTombstones = await getAllDeletionTombstones(dek, database);

  return {
    schemaVersion: 1,
    deviceId: config.deviceId,
    deviceLabel: config.deviceLabel,
    exportedAt: new Date().toISOString(),
    patients,
    episodes,
    sessions,
    soapNotes,
    clinicalAddenda,
    appointments,
    invoices,
    episodeClinicalStores,
    staffRoster,
    deletionTombstones,
  };
}

/**
 * Persists merged records and explicit deletion tombstones back into local encrypted IndexedDB.
 * Ordinary absence never deletes local data; only explicit clinician-recorded deletion tombstones
 * propagate deletions to prevent deleted records from resurrecting across devices.
 */
async function persistMergedChangesToLocalDb(
  mergeResult: ReturnType<typeof mergeClinicSyncPayloads>,
  dek: CryptoKey,
  database: PhysioRecordDatabase = db
): Promise<void> {
  const meta = await database.vaultMeta.get('auth');
  const activeDekVersion = meta?.dekVersion || CURRENT_DEK_VERSION;
  const { changed, merged } = mergeResult;

  // 1. Patients
  for (const p of changed.patients) {
    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      database,
      dek,
      'patients',
      p.id,
      [],
      p.data,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );
    const entity: EncryptedPatientEntity = {
      id: p.id,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      isArchived: p.isArchived ?? 0,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      recordSalt,
      iv,
      ciphertext,
    };
    await database.patients.put(entity);
  }

  // 2. Episodes
  for (const ep of changed.episodes) {
    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      database,
      dek,
      'episodes',
      ep.id,
      [ep.patientId],
      ep.data,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );
    const entity: EncryptedEpisodeEntity = {
      id: ep.id,
      patientId: ep.patientId,
      createdAt: ep.createdAt,
      updatedAt: ep.updatedAt,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      recordSalt,
      iv,
      ciphertext,
    };
    await database.episodes.put(entity);
  }

  // 3. Sessions
  for (const s of changed.sessions) {
    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      database,
      dek,
      'sessions',
      s.id,
      [s.patientId, s.episodeId],
      s.data,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );
    const entity: EncryptedSessionEntity = {
      id: s.id,
      episodeId: s.episodeId,
      patientId: s.patientId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      recordSalt,
      iv,
      ciphertext,
    };
    await database.sessions.put(entity);
  }

  // 4. SOAP Notes
  for (const note of changed.soapNotes) {
    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      database,
      dek,
      'soapNotes',
      note.id,
      [note.patientId, note.episodeId, note.sessionId],
      note.data,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );
    const entity: EncryptedSoapEntity = {
      id: note.id,
      sessionId: note.sessionId,
      episodeId: note.episodeId,
      patientId: note.patientId,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      recordSalt,
      iv,
      ciphertext,
    };
    await database.soapNotes.put(entity);
  }

  // 5. Clinical Addenda (append-only)
  for (const add of changed.clinicalAddenda) {
    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      database,
      dek,
      'clinicalAddenda',
      add.id,
      [add.patientId, add.sessionId, add.targetId],
      add.data,
      CURRENT_RECORD_CRYPTO_VERSION,
      activeDekVersion
    );
    const entity: EncryptedClinicalAddendumEntity = {
      id: add.id,
      sessionId: add.sessionId,
      patientId: add.patientId,
      targetId: add.targetId,
      createdAt: add.createdAt,
      recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
      dekVersion: activeDekVersion,
      recordSalt,
      iv,
      ciphertext,
    };
    await database.clinicalAddenda.put(entity);
  }

  // 6. Appointments, Invoices, Episode Clinical Stores & Staff Roster via ClinicOperationsService
  for (const appt of changed.appointments) {
    ClinicOperationsService.saveAppointment(appt);
  }
  for (const inv of changed.invoices) {
    ClinicOperationsService.restoreInvoiceIQD(inv);
  }
  for (const store of changed.episodeClinicalStores) {
    ClinicOperationsService.saveEpisodeClinicalStore(store);
  }
  if (changed.staffRosterChanged) {
    ClinicOperationsService.saveStaffRoster(merged.staffRoster);
  }

  // 7. Persist incoming deletion tombstones and apply explicit tombstoned deletions locally
  if (changed.deletionTombstones && changed.deletionTombstones.length > 0) {
    await recordDeletionTombstones(
      changed.deletionTombstones.map((t) => ({
        storeName: t.storeName,
        recordId: t.recordId,
        deletedAt: t.deletedAt,
        deletedByDeviceId: t.deletedByDeviceId,
        reason: t.reason,
        parentIds: t.parentIds,
      })),
      dek,
      database
    );
  }

  if (changed.deletedIds) {
    if (changed.deletedIds.clinicalAddenda.length > 0) {
      await database.clinicalAddenda.bulkDelete(changed.deletedIds.clinicalAddenda);
    }
    if (changed.deletedIds.soapNotes.length > 0) {
      await database.soapNotes.bulkDelete(changed.deletedIds.soapNotes);
    }
    if (changed.deletedIds.sessions.length > 0) {
      await database.sessions.bulkDelete(changed.deletedIds.sessions);
    }
    if (changed.deletedIds.episodes.length > 0) {
      await database.episodes.bulkDelete(changed.deletedIds.episodes);
    }
    if (changed.deletedIds.patients.length > 0) {
      await database.patients.bulkDelete(changed.deletedIds.patients);
    }
    for (const apptId of changed.deletedIds.appointments) {
      ClinicOperationsService.deleteAppointment(apptId, { bypassRecycleBin: true });
    }
  }

  await ClinicOperationsService.flushPendingWrites();
}

async function decryptAndApplyPeerEnvelopes(
  localPayload: ClinicSyncPayload,
  peerEnvelopes: EncryptedSyncEnvelope[],
  passphrase: string,
  dek: CryptoKey
): Promise<{ stats: SyncMergeStats; peerPayloadsCount: number }> {
  const peerPayloads: ClinicSyncPayload[] = [];
  for (const env of peerEnvelopes) {
    if (env.deviceId === localPayload.deviceId) continue;
    const dec = await decryptSyncEnvelope(env, passphrase, {
      minIterations: PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS,
    });
    peerPayloads.push(dec);
  }

  const mergeResult = mergeClinicSyncPayloads(localPayload, peerPayloads);
  if (peerPayloads.length > 0) {
    await persistMergedChangesToLocalDb(mergeResult, dek);
  }
  return { stats: mergeResult.stats, peerPayloadsCount: peerPayloads.length };
}

function summarizeStatsAr(stats: SyncMergeStats, peers: number): string {
  const totalIncoming =
    stats.patientsAdded +
    stats.patientsUpdated +
    stats.episodesAdded +
    stats.episodesUpdated +
    stats.sessionsAdded +
    stats.sessionsUpdated +
    stats.soapsAdded +
    stats.soapsUpdated +
    stats.addendaAdded +
    stats.appointmentsMerged +
    stats.invoicesMerged +
    stats.episodeStoresMerged +
    stats.staffMerged;
  const tombstonedDeleted = stats.recordsDeletedByTombstones ?? 0;
  if (peers === 0) {
    return 'تم رفع نسختك المشفّرة بنجاح (لا توجد أجهزة أخرى متصلة بعد). جميع سجلاتك المحلية محفوظة بالكامل.';
  }
  if (totalIncoming === 0 && tombstonedDeleted === 0) {
    return `تمت المزامنة مع ${peers} جهاز بنجاح — جميع سجلاتك محدثة بالكامل.`;
  }
  if (tombstonedDeleted > 0) {
    return `تمت المزامنة مع ${peers} جهاز بنجاح: دمج ${totalIncoming} سجل وتطبيق ${tombstonedDeleted} عملية حذف صريحة موثّقة لمنع عودة السجلات المحذوفة.`;
  }
  return `تم دمج ${totalIncoming} سجل جديد/محدّث من ${peers} جهاز بأمان (${stats.patientsAdded} مرضى جدد، ${stats.sessionsAdded} جلسات جديدة، ${stats.invoicesMerged} فواتير).`;
}

function summarizeStatsEn(stats: SyncMergeStats, peers: number): string {
  const totalIncoming =
    stats.patientsAdded +
    stats.patientsUpdated +
    stats.episodesAdded +
    stats.episodesUpdated +
    stats.sessionsAdded +
    stats.sessionsUpdated +
    stats.soapsAdded +
    stats.soapsUpdated +
    stats.addendaAdded +
    stats.appointmentsMerged +
    stats.invoicesMerged +
    stats.episodeStoresMerged +
    stats.staffMerged;
  const tombstonedDeleted = stats.recordsDeletedByTombstones ?? 0;
  if (peers === 0) {
    return 'Encrypted sync package uploaded (no other clinic devices yet). All local records preserved.';
  }
  if (totalIncoming === 0 && tombstonedDeleted === 0) {
    return `Synced with ${peers} device(s) — already up to date.`;
  }
  if (tombstonedDeleted > 0) {
    return `Synced with ${peers} device(s): merged ${totalIncoming} record(s) and applied ${tombstonedDeleted} explicit deletion tombstone(s) to prevent resurrection.`;
  }
  return `Merged ${totalIncoming} incoming record(s) from ${peers} device(s) (${stats.patientsAdded} new patients, ${stats.sessionsAdded} new sessions, ${stats.invoicesMerged} invoices).`;
}

/**
 * Option 1: Non-Destructive Local Wi-Fi (LAN Hub) Sync with Offline Outbox fallback.
 */
export async function syncWithLocalLanHub(params: {
  dek: CryptoKey;
  passphrase: string;
  serverUrl?: string;
  pairingToken?: string;
}): Promise<ClinicSyncExecutionResult> {
  const config = getClinicSyncConfig();
  const targetUrl = (params.serverUrl ?? config.lanServerUrl).trim().replace(/\/+$/, '');
  const token = (params.pairingToken ?? config.lanPairingToken).trim();

  if (!targetUrl || !token) {
    throw new Error('يرجى إدخال عنوان خادم الواي فاي المحلي ورمز الاقتران أولاً.');
  }
  if (!isPrivateLanSyncUrl(targetUrl)) {
    throw new Error(
      'عنوان خادم الواي فاي غير مسموح به أمنياً — يُسمح فقط بعناوين الشبكة المحلية (مثل 192.168.x.x أو 10.x.x.x أو localhost).'
    );
  }

  const localPayload = await collectLocalClinicSyncPayload(params.dek);
  const localEnvelope = await encryptSyncEnvelope(localPayload, params.passphrase);

  try {
    const electronBridge = getElectronDesktopBridge();
    let peerEnvelopes: EncryptedSyncEnvelope[] = [];

    if (electronBridge?.lanSyncExchange) {
      const res = await electronBridge.lanSyncExchange({
        serverUrl: targetUrl,
        pairingToken: token,
        envelope: localEnvelope,
      });
      if (!res.ok) {
        throw new Error(res.error || 'تعذّر الاتصال بخادم العيادة المحلي.');
      }
      peerEnvelopes = (res.peerEnvelopes || []) as EncryptedSyncEnvelope[];
    } else {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 12000) : null;
      try {
        const response = await fetch(`${targetUrl}/api/sync/exchange`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Clinic-Token': token,
          },
          body: JSON.stringify({ envelope: localEnvelope }),
          signal: controller?.signal,
        });
        if (!response.ok) {
          throw new Error(`خادم العيادة رفض الطلب (${response.status}). تحقق من رمز الاقتران.`);
        }
        const rawText = await response.text();
        if (rawText.length > 40 * 1024 * 1024) {
          throw new Error('استجابة خادم الواي فاي تتجاوز الحد الآمن للحجم.');
        }
        const data = safeJsonParse<{ peerEnvelopes?: EncryptedSyncEnvelope[] }>(rawText);
        peerEnvelopes = Array.isArray(data?.peerEnvelopes) ? data.peerEnvelopes : [];
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
      }
    }

    const { stats, peerPayloadsCount } = await decryptAndApplyPeerEnvelopes(
      localPayload,
      peerEnvelopes,
      params.passphrase,
      params.dek
    );

    clearOfflineSyncOutbox();
    const messageAr = summarizeStatsAr(stats, peerPayloadsCount);
    const messageEn = summarizeStatsEn(stats, peerPayloadsCount);
    saveClinicSyncConfig({
      mode: 'lan',
      lanServerUrl: targetUrl,
      lanPairingToken: token,
      lastSyncAt: new Date().toISOString(),
      lastSyncMode: 'lan',
      lastSyncSummary: messageAr,
    });

    return {
      ok: true,
      peerEnvelopesCount: peerPayloadsCount,
      stats,
      messageAr,
      messageEn,
    };
  } catch (err) {
    // PC/LAN Hub is offline or turned off -> Queue encrypted envelope locally so zero work is lost!
    const reason = err instanceof Error ? err.message : 'LAN Hub offline';
    queueOfflineSyncEnvelope('lan', localEnvelope, reason);
    return {
      ok: false,
      queuedOffline: true,
      peerEnvelopesCount: 0,
      messageAr:
        'حاسبة العيادة (خادم الواي فاي) غير متصلة حالياً — تم حفظ حزمة التغييرات المشفّرة في صندوق المزامنة المحلي وسيتم إرسالها تلقائياً عند تشغيل الحاسبة دون فقدان أي سجل.',
      messageEn:
        'Clinic LAN Hub is currently offline — your encrypted changes were safely queued in the local outbox and will sync once the clinic PC is back on.',
    };
  }
}

/**
 * Option 2: Encrypted Google Drive Clinic Sync ($0 ongoing cost, BYOC).
 * MUST only be called after explicit user confirmation dialog in UI.
 */
export async function syncWithEncryptedGoogleDrive(params: {
  dek: CryptoKey;
  passphrase: string;
}): Promise<ClinicSyncExecutionResult> {
  const config = getClinicSyncConfig();
  const localPayload = await collectLocalClinicSyncPayload(params.dek);
  const localEnvelope = await encryptSyncEnvelope(localPayload, params.passphrase);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    queueOfflineSyncEnvelope('google_drive', localEnvelope, 'Device offline');
    return {
      ok: false,
      queuedOffline: true,
      peerEnvelopesCount: 0,
      messageAr:
        'لا يوجد اتصال بالإنترنت حالياً — تم حفظ التغييرات المشفّرة محلياً في صندوق المزامنة لتُرفع تلقائياً عند عودة الإنترنت.',
      messageEn:
        'Currently offline — encrypted sync package queued locally until internet reconnects.',
    };
  }

  try {
    const result = await exchangeEnvelopesWithGoogleDrive({
      localEnvelope,
      preferredFolderId: config.driveFolderId,
    });

    const { stats, peerPayloadsCount } = await decryptAndApplyPeerEnvelopes(
      localPayload,
      result.peerEnvelopes,
      params.passphrase,
      params.dek
    );

    clearOfflineSyncOutbox();
    const messageAr = summarizeStatsAr(stats, peerPayloadsCount);
    const messageEn = summarizeStatsEn(stats, peerPayloadsCount);
    saveClinicSyncConfig({
      mode: 'google_drive',
      driveFolderId: result.folderId,
      lastSyncAt: new Date().toISOString(),
      lastSyncMode: 'google_drive',
      lastSyncSummary: messageAr,
    });

    return {
      ok: true,
      peerEnvelopesCount: peerPayloadsCount,
      stats,
      messageAr,
      messageEn,
      driveFolderId: result.folderId,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Google Drive sync error';
    if (reason.includes('Failed to fetch') || reason.includes('NetworkError')) {
      queueOfflineSyncEnvelope('google_drive', localEnvelope, reason);
      return {
        ok: false,
        queuedOffline: true,
        peerEnvelopesCount: 0,
        messageAr:
          'تعذّر الوصول إلى Google Drive حالياً — تم حفظ حزمة المزامنة المشفّرة محلياً لحين عودة الاتصال.',
        messageEn: 'Google Drive unreachable — encrypted package queued locally.',
      };
    }
    throw err;
  }
}

/**
 * Always-available Zero-Network Fallback: Export & Import Encrypted `.ptsync.json` files
 * (non-destructive merge via USB / AirDrop / Local Share / WhatsApp).
 */
export async function exportEncryptedSyncFileString(
  dek: CryptoKey,
  passphrase: string
): Promise<{ filename: string; content: string; recordCount: number }> {
  const localPayload = await collectLocalClinicSyncPayload(dek);
  const envelope = await encryptSyncEnvelope(localPayload, passphrase);
  const dateStamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `physiorecord-sync-${dateStamp}-${envelope.deviceId}.ptsync.json`,
    content: JSON.stringify(envelope, null, 2),
    recordCount: envelope.recordCountHint,
  };
}

export async function importAndMergeEncryptedSyncFile(
  rawJson: string,
  dek: CryptoKey,
  passphrase: string,
  database: PhysioRecordDatabase = db
): Promise<ClinicSyncExecutionResult> {
  if (rawJson.length > 35 * 1024 * 1024) {
    throw new Error('حجم ملف المزامنة يتجاوز الحد الأقصى المسموح به (35 MB).');
  }
  let envelope: EncryptedSyncEnvelope;
  try {
    envelope = safeJsonParse<EncryptedSyncEnvelope>(rawJson);
  } catch {
    throw new Error('ملف المزامنة تالف أو ليس بصيغة JSON صالحة.');
  }

  const localPayload = await collectLocalClinicSyncPayload(dek, database);
  const remotePayload = await decryptSyncEnvelope(envelope, passphrase, {
    minIterations: PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS,
  });
  const mergeResult = mergeClinicSyncPayloads(localPayload, [remotePayload]);
  await persistMergedChangesToLocalDb(mergeResult, dek, database);

  const messageAr = summarizeStatsAr(mergeResult.stats, 1);
  const messageEn = summarizeStatsEn(mergeResult.stats, 1);
  saveClinicSyncConfig({
    lastSyncAt: new Date().toISOString(),
    lastSyncSummary: messageAr,
  });

  return {
    ok: true,
    peerEnvelopesCount: 1,
    stats: mergeResult.stats,
    messageAr,
    messageEn,
  };
}

/**
 * Option 1 (Desktop Windows): 1-Click Sync via configured local Google Drive / Cloud folder.
 * Atomically writes this PC's encrypted sync file and merges all other devices' sync files in the folder.
 */
export async function syncWithDesktopSyncFolder(params: {
  dek: CryptoKey;
  passphrase: string;
}): Promise<ClinicSyncExecutionResult> {
  const bridge = getElectronDesktopBridge();
  if (!bridge?.exchangeSyncFolderEnvelopes) {
    throw new Error('يرجى تحديث تطبيق الحاسبة إلى أحدث إصدار لدعم مزامنة مجلد Google Drive.');
  }
  const localPayload = await collectLocalClinicSyncPayload(params.dek);
  const localEnvelope = await encryptSyncEnvelope(localPayload, params.passphrase);

  const res = await bridge.exchangeSyncFolderEnvelopes({ localEnvelope });
  if (!res?.ok) {
    throw new Error(res?.error || 'تعذّرت المزامنة مع مجلد Google Drive المختار.');
  }

  const peerEnvelopes = Array.isArray(res.peerEnvelopes)
    ? (res.peerEnvelopes as EncryptedSyncEnvelope[])
    : [];

  const { stats, peerPayloadsCount } = await decryptAndApplyPeerEnvelopes(
    localPayload,
    peerEnvelopes,
    params.passphrase,
    params.dek
  );

  clearOfflineSyncOutbox();
  const folderLabel = res.folderName || 'Google Drive';
  const messageAr =
    peerPayloadsCount > 0
      ? `تم حفظ بيانات هذه الحاسبة ودمج ملفات ${peerPayloadsCount} جهاز آخر داخل مجلد «${folderLabel}» بنجاح (${summarizeStatsAr(stats, peerPayloadsCount)}).`
      : `تم حفظ ملف المزامنة المشفّر داخل مجلد «${folderLabel}» بنجاح. يمكنك الآن فتحه ودمجه من الموبايل أو الأجهزة الأخرى.`;
  const messageEn =
    peerPayloadsCount > 0
      ? `Saved this PC and merged ${peerPayloadsCount} peer device(s) in "${folderLabel}" (${summarizeStatsEn(stats, peerPayloadsCount)}).`
      : `Saved encrypted sync file to "${folderLabel}". You can now import and merge it on your phone or other devices.`;

  saveClinicSyncConfig({
    mode: 'google_drive',
    lastSyncAt: new Date().toISOString(),
    lastSyncMode: 'google_drive',
    lastSyncSummary: messageAr,
  });

  return {
    ok: true,
    peerEnvelopesCount: peerPayloadsCount,
    stats,
    messageAr,
    messageEn,
  };
}
