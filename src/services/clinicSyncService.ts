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
import {
  getAndroidNativePlugin,
  getElectronDesktopBridge,
  isElectronDesktop,
  isNativeAndroid,
} from '../platform/nativeBridge';
import { DEFAULT_LAN_SYNC_PORT, SYNC_ENVELOPE_MAGIC } from '../config/appConstants';
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
import {
  exchangeEnvelopesWithGoogleDrive,
  restoreGoogleDriveSession,
} from './googleDriveSync';
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
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
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
// skipcq: SCT-A000 - localStorage key identifier holding AES-GCM ciphertext encrypted with Vault DEK
const SYNC_PASSPHRASE_ENC_STORAGE_KEY = 'physiorecord_clinic_sync_passphrase_enc_v1';
const MAX_LOCALSTORAGE_OUTBOX_CHARS = 2 * 1024 * 1024;

// Authoritative in-memory mirror so localStorage quota errors can never wipe typed LAN URL / token
let cachedSyncConfig: ClinicSyncConfig | null = null;
// Strictly in-memory session sync passphrase (cleared automatically on vault lock)
let sessionSyncPassphrase = '';

export function getSessionSyncPassphrase(): string {
  return sessionSyncPassphrase;
}

export function setSessionSyncPassphrase(passphrase: string): void {
  sessionSyncPassphrase = passphrase;
}

export function clearSessionSyncPassphrase(): void {
  sessionSyncPassphrase = '';
}

function bytesToBase64Local(bytes: Uint8Array): string {
  let binary = '';
  for (let idx = 0; idx < bytes.length; idx++) {
    binary += String.fromCharCode(bytes[idx]);
  }
  return btoa(binary);
}

function base64ToBytesLocal(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let idx = 0; idx < binary.length; idx++) {
    out[idx] = binary.charCodeAt(idx);
  }
  return out;
}

export async function saveEncryptedSyncPassphrase(
  dek: CryptoKey,
  passphrase: string
): Promise<void> {
  const clean = passphrase.trim();
  sessionSyncPassphrase = passphrase;
  if (clean.length < 6) return;
  try {
    const { iv, ciphertext, recordSalt } = await encryptRecordWithMandatoryReservation(
      db,
      dek,
      'clinicSyncPassphrase',
      'default',
      [],
      { passphrase },
      CURRENT_RECORD_CRYPTO_VERSION,
      CURRENT_DEK_VERSION
    );
    localStorage.setItem(
      SYNC_PASSPHRASE_ENC_STORAGE_KEY,
      JSON.stringify({
        ivB64: bytesToBase64Local(iv),
        ciphertextB64: bytesToBase64Local(ciphertext),
        recordSaltB64: recordSalt ? bytesToBase64Local(recordSalt) : undefined,
        recordCryptoVersion: CURRENT_RECORD_CRYPTO_VERSION,
        dekVersion: CURRENT_DEK_VERSION,
      })
    );
  } catch {
    // Non-fatal: passphrase still lives in RAM for the unlocked session
  }
}

export async function loadEncryptedSyncPassphrase(dek: CryptoKey): Promise<string> {
  if (sessionSyncPassphrase.trim().length >= 6) {
    return sessionSyncPassphrase;
  }
  try {
    const raw = localStorage.getItem(SYNC_PASSPHRASE_ENC_STORAGE_KEY);
    if (!raw) return '';
    const parsed = safeJsonParse<{
      ciphertextB64?: string;
      ivB64?: string;
      recordSaltB64?: string;
      recordCryptoVersion?: number;
      dekVersion?: number;
    }>(raw);
    if (!parsed?.ciphertextB64 || !parsed?.ivB64) return '';
    const decrypted = await decryptRecordPayload<{ passphrase?: string }>(
      dek,
      'clinicSyncPassphrase',
      'default',
      [],
      base64ToBytesLocal(parsed.ivB64),
      base64ToBytesLocal(parsed.ciphertextB64),
      parsed.recordCryptoVersion || CURRENT_RECORD_CRYPTO_VERSION,
      parsed.dekVersion || CURRENT_DEK_VERSION,
      parsed.recordSaltB64 ? base64ToBytesLocal(parsed.recordSaltB64) : undefined
    );
    const restored = typeof decrypted?.passphrase === 'string' ? decrypted.passphrase : '';
    if (restored.trim().length >= 6) {
      sessionSyncPassphrase = restored;
      return restored;
    }
  } catch {
    // Ignore if vault DEK rotated or record invalid
  }
  return '';
}

/**
 * Normalizes user-typed Clinic Wi-Fi (LAN) addresses so typing `192.168.1.15:47821`,
 * `192.168.1.15`, or Arabic-Indic digits (`١٩٢.١٦٨.١.١٥:٤٧٨٢١`) works seamlessly.
 */
export function normalizeLanServerUrl(rawUrl: string): string {
  const asciiDigits = String(rawUrl || '')
    .replace(/[٠-٩]/gu, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/gu, (ch) => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/[٫،]/gu, '.')
    .replace(/：/gu, ':');
  const cleaned = asciiDigits
    .trim()
    .replace(/\s+/gu, '')
    .replace(/\/+$/u, '');
  if (!cleaned) return '';
  if (/^https?:\/\//iu.test(cleaned)) {
    return cleaned;
  }
  // Bare private IPv4 or .local hostname without scheme
  if (/^[a-z0-9.-]+(?::\d{1,5})?$/iu.test(cleaned)) {
    const hasPort = /:\d{1,5}$/u.test(cleaned);
    return hasPort ? `http://${cleaned}` : `http://${cleaned}:${DEFAULT_LAN_SYNC_PORT}`;
  }
  return cleaned;
}

function clampAutoSyncIntervalMinutes(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 15;
  return Math.max(1, Math.min(1440, Math.round(num)));
}

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
      const resolved: ClinicSyncConfig = {
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
        autoSyncEnabled: parsed.autoSyncEnabled === true,
        autoSyncIntervalMinutes: clampAutoSyncIntervalMinutes(parsed.autoSyncIntervalMinutes ?? 15),
      };
      cachedSyncConfig = resolved;
      return resolved;
    }
  } catch {
    // fallback to in-memory cache or fresh default
  }

  if (cachedSyncConfig) {
    return { ...cachedSyncConfig };
  }

  const fresh: ClinicSyncConfig = {
    mode: 'off',
    deviceId: generateDeviceId(),
    deviceLabel: getDefaultDeviceLabel(),
    lanServerUrl: '',
    lanPairingToken: '',
    autoSyncOnReconnect: true,
    autoSyncEnabled: false,
    autoSyncIntervalMinutes: 15,
  };
  saveClinicSyncConfig(fresh);
  return fresh;
}

export function saveClinicSyncConfig(patch: Partial<ClinicSyncConfig>): ClinicSyncConfig {
  const fromStorage = (() => {
    try {
      const raw = localStorage.getItem(SYNC_CONFIG_STORAGE_KEY);
      return raw ? safeJsonParse<Partial<ClinicSyncConfig>>(raw) : {};
    } catch {
      return {};
    }
  })();

  const base: Partial<ClinicSyncConfig> = {
    ...fromStorage,
    ...(cachedSyncConfig || {}),
  };

  const next: ClinicSyncConfig = {
    mode: patch.mode ?? base.mode ?? 'off',
    deviceId: patch.deviceId ?? base.deviceId ?? generateDeviceId(),
    deviceLabel: patch.deviceLabel ?? base.deviceLabel ?? getDefaultDeviceLabel(),
    lanServerUrl: patch.lanServerUrl ?? base.lanServerUrl ?? '',
    lanPairingToken: patch.lanPairingToken ?? base.lanPairingToken ?? '',
    driveFolderId: patch.driveFolderId ?? base.driveFolderId,
    lastSyncAt: patch.lastSyncAt ?? base.lastSyncAt,
    lastSyncMode: patch.lastSyncMode ?? base.lastSyncMode,
    lastSyncSummary: patch.lastSyncSummary ?? base.lastSyncSummary,
    autoSyncOnReconnect: patch.autoSyncOnReconnect ?? base.autoSyncOnReconnect ?? true,
    autoSyncEnabled: patch.autoSyncEnabled ?? base.autoSyncEnabled ?? false,
    autoSyncIntervalMinutes: clampAutoSyncIntervalMinutes(
      patch.autoSyncIntervalMinutes ?? base.autoSyncIntervalMinutes ?? 15
    ),
  };

  cachedSyncConfig = next;
  const serialized = JSON.stringify(next);
  try {
    localStorage.setItem(SYNC_CONFIG_STORAGE_KEY, serialized);
  } catch {
    // If localStorage is full (e.g. large offline outbox), evict outbox and retry saving config
    try {
      localStorage.removeItem(SYNC_OUTBOX_STORAGE_KEY);
      localStorage.setItem(SYNC_CONFIG_STORAGE_KEY, serialized);
    } catch {
      // Keep authoritative in-memory cachedSyncConfig intact
    }
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
    const serialized = JSON.stringify(record);
    // Keep outbox bounded so localStorage quota is never exhausted (preserving sync config)
    if (serialized.length <= MAX_LOCALSTORAGE_OUTBOX_CHARS) {
      localStorage.setItem(SYNC_OUTBOX_STORAGE_KEY, serialized);
    }
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

class ClinicSyncFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClinicSyncFatalError';
  }
}

class ClinicSyncNetworkError extends Error {
  readonly errorKind?: string;
  constructor(message: string, errorKind?: string) {
    super(message);
    this.name = 'ClinicSyncNetworkError';
    this.errorKind = errorKind;
  }
}

/**
 * Option 1: Safe Local Wi-Fi (LAN Hub) Sync with Offline Outbox fallback.
 * Routes through native Electron Main Process or native Android TCP socket
 * strictly to private RFC1918 LAN addresses.
 */
export async function syncWithLocalLanHub(params: {
  dek: CryptoKey;
  passphrase: string;
  serverUrl?: string;
  pairingToken?: string;
}): Promise<ClinicSyncExecutionResult> {
  const config = getClinicSyncConfig();
  const targetUrl = normalizeLanServerUrl(params.serverUrl ?? config.lanServerUrl);
  const token = (params.pairingToken ?? config.lanPairingToken).trim();

  if (!targetUrl || !token) {
    throw new Error('يرجى إدخال عنوان خادم الواي فاي المحلي ورمز الاقتران أولاً.');
  }
  if (!isPrivateLanSyncUrl(targetUrl)) {
    throw new Error(
      'عنوان خادم الواي فاي غير صالح — أدخل عنوان الشبكة المحلية الظاهر على الحاسبة (مثل 192.168.1.15:47821).'
    );
  }

  await saveEncryptedSyncPassphrase(params.dek, params.passphrase);
  const localPayload = await collectLocalClinicSyncPayload(params.dek);
  const localEnvelope = await encryptSyncEnvelope(localPayload, params.passphrase);

  try {
    const electronBridge = getElectronDesktopBridge();
    const androidPlugin = getAndroidNativePlugin();
    let peerEnvelopes: EncryptedSyncEnvelope[] = [];

    if (electronBridge?.lanSyncExchange) {
      const res = await electronBridge.lanSyncExchange({
        serverUrl: targetUrl,
        pairingToken: token,
        envelope: localEnvelope,
      });
      if (!res.ok) {
        const errText = res.error || '';
        if (/401|Unauthorized|pairing token/iu.test(errText)) {
          throw new ClinicSyncFatalError(
            'رمز الاقتران غير صحيح — تأكد من مطابقة الرمز الظاهر على حاسبة العيادة.'
          );
        }
        throw new Error(errText || 'تعذّر الاتصال بخادم العيادة المحلي.');
      }
      peerEnvelopes = (res.peerEnvelopes || []) as EncryptedSyncEnvelope[];
    } else if (androidPlugin?.lanSyncExchange) {
      const res = await androidPlugin.lanSyncExchange({
        serverUrl: targetUrl,
        pairingToken: token,
        bodyJson: JSON.stringify({ envelope: localEnvelope }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new ClinicSyncFatalError(
            'رمز الاقتران غير صحيح — تأكد من مطابقة الرمز الظاهر على حاسبة العيادة.'
          );
        }
        if (res.status === 429) {
          throw new ClinicSyncFatalError(
            'تم تجاوز عدد المحاولات المسموح بها — انتظر قليلاً وتأكد من رمز الاقتران.'
          );
        }
        if (!res.networkError) {
          throw new ClinicSyncFatalError(
            res.error || 'رفضت حاسبة العيادة طلب المزامنة — تأكد من رمز الاقتران والمحاولة مرة أخرى.'
          );
        }
        throw new ClinicSyncNetworkError(res.error || 'LAN Hub unreachable', res.errorKind);
      }
      const parsed = res.responseJson
        ? safeJsonParse<{ peerEnvelopes?: EncryptedSyncEnvelope[] }>(res.responseJson)
        : null;
      peerEnvelopes = Array.isArray(parsed?.peerEnvelopes) ? parsed.peerEnvelopes : [];
    } else {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 12000) : null;
      try {
        const lanExchangeEndpoint = new URL('/api/sync/exchange', `${targetUrl}/`);
        if (!isPrivateLanSyncUrl(lanExchangeEndpoint.origin)) {
          throw new ClinicSyncFatalError('Blocked non-LAN exchange origin.');
        }
        const response = await fetch(lanExchangeEndpoint.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Clinic-Token': token,
          },
          body: JSON.stringify({ envelope: localEnvelope }),
          redirect: 'error',
          signal: controller?.signal,
        });
        if (response.status === 401) {
          throw new ClinicSyncFatalError(
            'رمز الاقتران غير صحيح — تأكد من مطابقة الرمز الظاهر على حاسبة العيادة.'
          );
        }
        if (response.status === 429) {
          throw new ClinicSyncFatalError(
            'تم تجاوز عدد المحاولات المسموح بها — انتظر قليلاً وتأكد من رمز الاقتران.'
          );
        }
        if (!response.ok) {
          throw new ClinicSyncFatalError('رفض خادم العيادة الطلب — تحقق من رمز الاقتران والمحاولة مرة أخرى.');
        }
        const rawText = await response.text();
        if (rawText.length > 40 * 1024 * 1024) {
          throw new ClinicSyncFatalError('استجابة خادم الواي فاي تتجاوز الحد الآمن للحجم.');
        }
        const data = safeJsonParse<{ peerEnvelopes?: EncryptedSyncEnvelope[] }>(rawText);
        peerEnvelopes = Array.isArray(data?.peerEnvelopes) ? data.peerEnvelopes : [];
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
      }
    }

    let stats: SyncMergeStats;
    let peerPayloadsCount: number;
    try {
      const merged = await decryptAndApplyPeerEnvelopes(
        localPayload,
        peerEnvelopes,
        params.passphrase,
        params.dek
      );
      stats = merged.stats;
      peerPayloadsCount = merged.peerPayloadsCount;
    } catch (decryptErr) {
      throw new ClinicSyncFatalError(
        decryptErr instanceof Error
          ? decryptErr.message
          : 'كلمة سر المزامنة المشتركة غير مطابقة لملفات الجهاز الآخر.'
      );
    }

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
    if (err instanceof ClinicSyncFatalError) {
      throw err;
    }
    // PC/LAN Hub is offline or turned off -> Queue encrypted envelope locally so zero work is lost!
    const reason = err instanceof Error ? err.message : 'LAN Hub offline';
    const errorKind = err instanceof ClinicSyncNetworkError ? err.errorKind : undefined;
    queueOfflineSyncEnvelope('lan', localEnvelope, reason);

    if (errorKind === 'refused') {
      return {
        ok: false,
        queuedOffline: true,
        peerEnvelopesCount: 0,
        messageAr:
          'تم الوصول للحاسبة لكن خدمة مزامنة الواي فاي متوقفة عليها — افتح إعدادات المزامنة على الحاسبة وشغّل المزامنة عبر الواي فاي ثم أعد المحاولة. تم حفظ التغييرات محلياً بأمان.',
        messageEn:
          'Reached the PC, but Wi-Fi Sync is not running on it — start Wi-Fi Sync on the Clinic PC and retry. Changes were safely queued locally.',
      };
    }

    if (errorKind === 'timeout') {
      return {
        ok: false,
        queuedOffline: true,
        peerEnvelopesCount: 0,
        messageAr:
          'انتهت مهلة الاتصال بحاسبة العيادة بدون رد — غالباً حماية الشبكة في ويندوز أو عزل الأجهزة في الراوتر يمنع الاتصال بين الموبايل والحاسبة. اضغط «تحديث إذن الشبكة» على الحاسبة، أو جرّب الربط عبر نقطة اتصال الموبايل للتأكد. تم حفظ التغييرات محلياً بأمان.',
        messageEn:
          'Connection to the Clinic PC timed out with no reply — Windows network protection or router client isolation is likely blocking phone-to-PC traffic. Click "Refresh Wi-Fi Access" on the PC or test with a mobile hotspot. Changes were safely queued locally.',
      };
    }

    if (errorKind === 'unreachable') {
      return {
        ok: false,
        queuedOffline: true,
        peerEnvelopesCount: 0,
        messageAr:
          'لا يوجد اتصال مباشر بين الموبايل وحاسبة العيادة — تأكد أن الموبايل متصل بنفس شبكة الواي فاي التي تتصل بها الحاسبة وأوقف أي VPN مؤقتاً. تم حفظ التغييرات محلياً بأمان.',
        messageEn:
          'No direct network route between your phone and the Clinic PC — make sure both devices are on the same Wi-Fi network and turn off any VPN temporarily. Changes were safely queued locally.',
      };
    }

    return {
      ok: false,
      queuedOffline: true,
      peerEnvelopesCount: 0,
      messageAr:
        'تعذّر الوصول لحاسبة العيادة عبر الواي فاي حالياً — تأكد إن المزامنة شغّالة على الحاسبة وإن الجهازين على نفس الراوتر واضغط «تحديث إذن الشبكة» على الحاسبة. تم حفظ التغييرات محلياً بأمان.',
      messageEn:
        'Could not reach the Clinic PC over Wi-Fi right now — check that Wi-Fi Sync is started on the PC, both devices are on the same router, and click "Refresh Wi-Fi Access" on the PC. Changes were safely queued locally.',
    };
  }
}

/**
 * Option 2: Encrypted Google Drive Clinic Sync ($0 ongoing cost, BYOC).
 */
export async function syncWithEncryptedGoogleDrive(params: {
  dek: CryptoKey;
  passphrase: string;
}): Promise<ClinicSyncExecutionResult> {
  const config = getClinicSyncConfig();
  await saveEncryptedSyncPassphrase(params.dek, params.passphrase);
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

let autoSyncInFlight = false;

/**
 * Runs one silent periodic auto-sync cycle (for either Google Drive or Clinic Wi-Fi)
 * ONLY when the user explicitly opted into `autoSyncEnabled` and unlocked the vault.
 * Performs ZERO network calls when disabled.
 */
export async function runPeriodicAutoSyncOnce(params: {
  dek: CryptoKey;
  onPatientsUpdated?: () => Promise<void> | void;
}): Promise<boolean> {
  if (autoSyncInFlight) return false;
  const config = getClinicSyncConfig();
  if (!config.autoSyncEnabled || config.mode === 'off') {
    return false;
  }

  const passphrase = await loadEncryptedSyncPassphrase(params.dek);
  if (passphrase.trim().length < 6) {
    return false;
  }

  autoSyncInFlight = true;
  try {
    if (config.mode === 'google_drive') {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return false;
      }
      const auth = await restoreGoogleDriveSession();
      if (!auth.isSignedIn) {
        return false;
      }
      // On Web/iPhone PWA without a fresh token, avoid unexpected background popups
      if (!isNativeAndroid() && !isElectronDesktop() && !auth.hasDriveToken) {
        return false;
      }
      const res = await syncWithEncryptedGoogleDrive({
        dek: params.dek,
        passphrase,
      });
      if (res.ok) {
        await params.onPatientsUpdated?.();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('physiorecord:sync-updated'));
        }
        return true;
      }
      return false;
    }

    if (config.mode === 'lan') {
      let targetUrl = config.lanServerUrl;
      let targetToken = config.lanPairingToken;

      const electronBridge = getElectronDesktopBridge();
      if (electronBridge?.getLanSyncHubStatus) {
        const hubStatus = await electronBridge.getLanSyncHubStatus().catch(() => null);
        if (hubStatus?.running && hubStatus.urls[0] && hubStatus.pairingToken) {
          targetUrl = hubStatus.urls[0];
          targetToken = hubStatus.pairingToken;
        }
      }

      if (!targetUrl.trim() || !targetToken.trim()) {
        return false;
      }

      const res = await syncWithLocalLanHub({
        dek: params.dek,
        passphrase,
        serverUrl: targetUrl,
        pairingToken: targetToken,
      });
      if (res.ok) {
        await params.onPatientsUpdated?.();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('physiorecord:sync-updated'));
        }
        return true;
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    autoSyncInFlight = false;
  }
}
