// =======================================================================
// PhysioRecord — Clinic Non-Destructive Sync Engine (Pure Crypto + Merge)
// Zero-Deletion Additive Merge + Client-Side AES-256-GCM Sync Envelopes
// =======================================================================

import type {
  ClinicalAddendumRecord,
  DeletionTombstoneRecord,
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../types/clinical';
import type {
  ClinicAppointment,
  ClinicStaffMember,
  EpisodeScopedClinicalStore,
  FinancialInvoiceIQD,
} from '../types/clinicManagement';

import { SYNC_ENVELOPE_MAGIC } from '../config/appConstants';
import { isSafeSyncDeviceId, safeJsonParse } from './securityHardening';

export { SYNC_ENVELOPE_MAGIC };
export const SYNC_PBKDF2_ITERATIONS = 310_000;
export const MIN_SYNC_PBKDF2_ITERATIONS = 1_000;
export const PRODUCTION_MIN_SYNC_PBKDF2_ITERATIONS = 100_000;
export const MAX_SYNC_PBKDF2_ITERATIONS = 1_000_000;
const SYNC_SALT_BYTES = 16;
const SYNC_IV_BYTES = 12;

export interface ClinicSyncPayload {
  schemaVersion: 1;
  deviceId: string;
  deviceLabel: string;
  exportedAt: string; // ISO timestamp
  patients: PatientRecord[];
  episodes: EpisodeRecord[];
  sessions: SessionRecord[];
  soapNotes: SoapNoteRecord[];
  clinicalAddenda: ClinicalAddendumRecord[];
  appointments: ClinicAppointment[];
  invoices: FinancialInvoiceIQD[];
  episodeClinicalStores: EpisodeScopedClinicalStore[];
  staffRoster: ClinicStaffMember[];
  /** Optional Dexie v11 explicit deletion tombstones (backward-compatible with older sync envelopes). */
  deletionTombstones?: DeletionTombstoneRecord[];
}

export interface EncryptedSyncEnvelope {
  magic: typeof SYNC_ENVELOPE_MAGIC;
  schemaVersion: 1;
  deviceId: string;
  deviceLabel: string;
  updatedAt: string;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
  recordCountHint: number;
}

export interface SyncMergeStats {
  patientsAdded: number;
  patientsUpdated: number;
  episodesAdded: number;
  episodesUpdated: number;
  sessionsAdded: number;
  sessionsUpdated: number;
  soapsAdded: number;
  soapsUpdated: number;
  addendaAdded: number;
  appointmentsMerged: number;
  invoicesMerged: number;
  episodeStoresMerged: number;
  staffMerged: number;
  localPreservedCount: number;
  remoteFinalizedSkippedAsImmutable: number;
  tombstonesMerged?: number;
  recordsDeletedByTombstones?: number;
}

export interface SyncDeletedIds {
  patients: string[];
  episodes: string[];
  sessions: string[];
  soapNotes: string[];
  clinicalAddenda: string[];
  appointments: string[];
  invoices: string[];
}

export interface SyncMergeResult {
  merged: ClinicSyncPayload;
  changed: {
    patients: PatientRecord[];
    episodes: EpisodeRecord[];
    sessions: SessionRecord[];
    soapNotes: SoapNoteRecord[];
    clinicalAddenda: ClinicalAddendumRecord[];
    appointments: ClinicAppointment[];
    invoices: FinancialInvoiceIQD[];
    episodeClinicalStores: EpisodeScopedClinicalStore[];
    staffRosterChanged: boolean;
    deletionTombstones: DeletionTombstoneRecord[];
    deletedIds: SyncDeletedIds;
  };
  stats: SyncMergeStats;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveSyncAesKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a ClinicSyncPayload client-side using AES-256-GCM + PBKDF2-SHA256
 * before it ever leaves the device (for LAN Hub, Google Drive, or .ptsync file).
 */
export async function encryptSyncEnvelope(
  payload: ClinicSyncPayload,
  passphrase: string,
  iterationsOverride?: number
): Promise<EncryptedSyncEnvelope> {
  const trimmedPass = passphrase.trim();
  if (trimmedPass.length < 6) {
    throw new Error('كلمة مرور المزامنة المشتركة يجب أن تكون 6 أحرف على الأقل.');
  }

  const iterations = iterationsOverride ?? SYNC_PBKDF2_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(SYNC_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(SYNC_IV_BYTES));
  const aesKey = await deriveSyncAesKey(trimmedPass, salt, iterations);

  const aad = new TextEncoder().encode(
    `${SYNC_ENVELOPE_MAGIC}:${payload.deviceId}:${payload.schemaVersion}`
  );
  const plaintextBytes = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad },
    aesKey,
    plaintextBytes
  );

  const recordCountHint =
    payload.patients.length +
    payload.episodes.length +
    payload.sessions.length +
    payload.soapNotes.length;

  return {
    magic: SYNC_ENVELOPE_MAGIC,
    schemaVersion: 1,
    deviceId: payload.deviceId,
    deviceLabel: payload.deviceLabel,
    updatedAt: payload.exportedAt,
    kdf: 'PBKDF2-SHA256',
    iterations,
    saltBase64: bytesToBase64(salt),
    ivBase64: bytesToBase64(iv),
    ciphertextBase64: bytesToBase64(new Uint8Array(encryptedBuf)),
    recordCountHint,
  };
}

/**
 * Decrypts and authenticates an EncryptedSyncEnvelope with the shared clinic sync passphrase.
 */
export async function decryptSyncEnvelope(
  envelope: EncryptedSyncEnvelope,
  passphrase: string,
  options?: { minIterations?: number }
): Promise<ClinicSyncPayload> {
  if (
    !envelope ||
    envelope.magic !== SYNC_ENVELOPE_MAGIC ||
    envelope.schemaVersion !== 1 ||
    envelope.kdf !== 'PBKDF2-SHA256' ||
    !isSafeSyncDeviceId(envelope.deviceId) ||
    typeof envelope.saltBase64 !== 'string' ||
    typeof envelope.ivBase64 !== 'string' ||
    typeof envelope.ciphertextBase64 !== 'string'
  ) {
    throw new Error('ملف المزامنة غير صالح أو بصيغة غير مدعومة.');
  }

  const minAllowedIter = Math.max(
    MIN_SYNC_PBKDF2_ITERATIONS,
    options?.minIterations ?? MIN_SYNC_PBKDF2_ITERATIONS
  );
  const iterations = Number(envelope.iterations);
  if (
    !Number.isInteger(iterations) ||
    iterations < minAllowedIter ||
    iterations > MAX_SYNC_PBKDF2_ITERATIONS
  ) {
    throw new Error('معاملات التشفير في حزمة المزامنة خارج النطاق الآمن.');
  }

  const trimmedPass = passphrase.trim();
  if (!trimmedPass) {
    throw new Error('يرجى إدخال كلمة مرور المزامنة المشتركة لفك تشفير الحزمة.');
  }

  const salt = base64ToBytes(envelope.saltBase64);
  const iv = base64ToBytes(envelope.ivBase64);
  const ciphertext = base64ToBytes(envelope.ciphertextBase64);
  if (salt.length !== SYNC_SALT_BYTES || iv.length !== SYNC_IV_BYTES || ciphertext.length < 16) {
    throw new Error('معاملات حزمة المزامنة المشفّرة غير صالحة.');
  }

  const aesKey = await deriveSyncAesKey(trimmedPass, salt, iterations);
  const aad = new TextEncoder().encode(
    `${SYNC_ENVELOPE_MAGIC}:${envelope.deviceId}:${envelope.schemaVersion}`
  );

  try {
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad },
      aesKey,
      ciphertext as BufferSource
    );
    const decoded = new TextDecoder().decode(decryptedBuf);
    const parsed = safeJsonParse<ClinicSyncPayload>(decoded);
    if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.patients)) {
      throw new Error('بنية بيانات المزامنة غير مكتملة.');
    }
    return parsed;
  } catch {
    throw new Error('تعذّر فك تشفير حزمة المزامنة — تأكد من تطابق كلمة مرور المزامنة المشتركة بين الأجهزة.');
  }
}

function toTimestampMs(iso?: string): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Tombstone-aware, non-destructive-by-default multi-device merge engine.
 * Invariants:
 * 1. Ordinary absence in a remote payload NEVER deletes a local record (zero implicit deletions).
 * 2. Explicit `deletionTombstones` (Dexie v11) propagate deliberate clinician deletions
 *    (such as `deleteFinalizedSession`) across devices and prevent deleted records from resurrecting.
 * 3. Non-deleted finalized SOAP notes, finalized sessions, and clinical addenda remain strictly
 *    immutable — remote edits NEVER overwrite them.
 * 4. Mutable entities (patients, episodes, drafts, appointments, invoices, episode stores)
 *    use newer-`updatedAt`-wins; equal timestamps preserve local safely.
 */
export function mergeClinicSyncPayloads(
  local: ClinicSyncPayload,
  remotes: ClinicSyncPayload[]
): SyncMergeResult {
  const stats: SyncMergeStats = {
    patientsAdded: 0,
    patientsUpdated: 0,
    episodesAdded: 0,
    episodesUpdated: 0,
    sessionsAdded: 0,
    sessionsUpdated: 0,
    soapsAdded: 0,
    soapsUpdated: 0,
    addendaAdded: 0,
    appointmentsMerged: 0,
    invoicesMerged: 0,
    episodeStoresMerged: 0,
    staffMerged: 0,
    localPreservedCount:
      local.patients.length +
      local.episodes.length +
      local.sessions.length +
      local.soapNotes.length +
      local.clinicalAddenda.length,
    remoteFinalizedSkippedAsImmutable: 0,
    tombstonesMerged: 0,
    recordsDeletedByTombstones: 0,
  };

  // 0. Reconcile explicit deletion tombstones FIRST across local + all remotes
  const tombstoneMap = new Map<string, DeletionTombstoneRecord>();
  const changedTombstones = new Map<string, DeletionTombstoneRecord>();
  for (const lt of local.deletionTombstones || []) {
    if (!lt?.storeName || !lt?.recordId) continue;
    const key = `${lt.storeName}:${lt.recordId}`;
    tombstoneMap.set(key, { ...lt, id: lt.id || key });
  }
  for (const remote of remotes) {
    if (!remote) continue;
    for (const rt of remote.deletionTombstones || []) {
      if (!rt?.storeName || !rt?.recordId) continue;
      const key = `${rt.storeName}:${rt.recordId}`;
      const existing = tombstoneMap.get(key);
      if (!existing || toTimestampMs(rt.deletedAt) > toTimestampMs(existing.deletedAt)) {
        const normalized: DeletionTombstoneRecord = { ...rt, id: rt.id || key };
        tombstoneMap.set(key, normalized);
        changedTombstones.set(key, normalized);
        stats.tombstonesMerged = (stats.tombstonesMerged ?? 0) + 1;
      }
    }
  }

  const isTombstoned = (
    storeName: string,
    recordId: string,
    recordUpdatedIso?: string,
    parentChecks?: Array<[string, string | undefined]>
  ): boolean => {
    const recMs = toTimestampMs(recordUpdatedIso);
    const direct = tombstoneMap.get(`${storeName}:${recordId}`);
    if (direct) {
      const tombMs = toTimestampMs(direct.deletedAt);
      if (tombMs === 0 || recMs === 0 || tombMs >= recMs) {
        return true;
      }
    }
    if (parentChecks) {
      for (const [parentStore, parentId] of parentChecks) {
        if (!parentId) continue;
        const pTomb = tombstoneMap.get(`${parentStore}:${parentId}`);
        if (pTomb) {
          const tombMs = toTimestampMs(pTomb.deletedAt);
          if (tombMs === 0 || recMs === 0 || tombMs >= recMs) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const patientMap = new Map<string, PatientRecord>(local.patients.map((p) => [p.id, p]));
  const episodeMap = new Map<string, EpisodeRecord>(local.episodes.map((e) => [e.id, e]));
  const sessionMap = new Map<string, SessionRecord>(local.sessions.map((s) => [s.id, s]));
  const soapMap = new Map<string, SoapNoteRecord>(local.soapNotes.map((n) => [n.id, n]));
  const soapBySessionId = new Map<string, SoapNoteRecord>(
    local.soapNotes.map((n) => [n.sessionId, n])
  );
  const addendumMap = new Map<string, ClinicalAddendumRecord>(
    local.clinicalAddenda.map((a) => [a.id, a])
  );
  const appointmentMap = new Map<string, ClinicAppointment>(
    local.appointments.map((a) => [a.id, a])
  );
  const invoiceMap = new Map<string, FinancialInvoiceIQD>(local.invoices.map((i) => [i.id, i]));
  const storeMap = new Map<string, EpisodeScopedClinicalStore>(
    local.episodeClinicalStores.map((st) => [st.episodeId, st])
  );
  const staffMap = new Map<string, ClinicStaffMember>(local.staffRoster.map((st) => [st.id, st]));

  const changedPatients = new Map<string, PatientRecord>();
  const changedEpisodes = new Map<string, EpisodeRecord>();
  const changedSessions = new Map<string, SessionRecord>();
  const changedSoaps = new Map<string, SoapNoteRecord>();
  const changedAddenda = new Map<string, ClinicalAddendumRecord>();
  const changedAppointments = new Map<string, ClinicAppointment>();
  const changedInvoices = new Map<string, FinancialInvoiceIQD>();
  const changedStores = new Map<string, EpisodeScopedClinicalStore>();
  let staffRosterChanged = false;

  const deletedPatients = new Set<string>();
  const deletedEpisodes = new Set<string>();
  const deletedSessions = new Set<string>();
  const deletedSoaps = new Set<string>();
  const deletedAddenda = new Set<string>();
  const deletedAppointments = new Set<string>();
  const deletedInvoices = new Set<string>();

  // Apply reconciled tombstones to local records first so explicit peer deletions propagate cleanly
  for (const [id, p] of Array.from(patientMap.entries())) {
    if (isTombstoned('patients', id, p.updatedAt || p.createdAt)) {
      patientMap.delete(id);
      deletedPatients.add(id);
      stats.recordsDeletedByTombstones = (stats.recordsDeletedByTombstones ?? 0) + 1;
    }
  }
  for (const [id, ep] of Array.from(episodeMap.entries())) {
    if (
      isTombstoned('episodes', id, ep.updatedAt || ep.createdAt, [['patients', ep.patientId]])
    ) {
      episodeMap.delete(id);
      deletedEpisodes.add(id);
      stats.recordsDeletedByTombstones = (stats.recordsDeletedByTombstones ?? 0) + 1;
    }
  }
  for (const [id, sess] of Array.from(sessionMap.entries())) {
    if (
      isTombstoned('sessions', id, sess.updatedAt || sess.createdAt, [
        ['episodes', sess.episodeId],
        ['patients', sess.patientId],
      ])
    ) {
      sessionMap.delete(id);
      deletedSessions.add(id);
      stats.recordsDeletedByTombstones = (stats.recordsDeletedByTombstones ?? 0) + 1;
    }
  }
  for (const [id, note] of Array.from(soapMap.entries())) {
    if (
      isTombstoned('soapNotes', id, note.updatedAt || note.createdAt, [
        ['sessions', note.sessionId],
        ['episodes', note.episodeId],
        ['patients', note.patientId],
      ])
    ) {
      soapMap.delete(id);
      soapBySessionId.delete(note.sessionId);
      deletedSoaps.add(id);
      stats.recordsDeletedByTombstones = (stats.recordsDeletedByTombstones ?? 0) + 1;
    }
  }
  for (const [id, add] of Array.from(addendumMap.entries())) {
    if (
      isTombstoned('clinicalAddenda', id, add.createdAt, [
        ['sessions', add.sessionId],
        ['patients', add.patientId],
      ])
    ) {
      addendumMap.delete(id);
      deletedAddenda.add(id);
      stats.recordsDeletedByTombstones = (stats.recordsDeletedByTombstones ?? 0) + 1;
    }
  }
  for (const [id, appt] of Array.from(appointmentMap.entries())) {
    if (
      isTombstoned('appointments', id, appt.updatedAt || appt.date, [
        ['patients', appt.patientId],
      ])
    ) {
      appointmentMap.delete(id);
      deletedAppointments.add(id);
      stats.recordsDeletedByTombstones = (stats.recordsDeletedByTombstones ?? 0) + 1;
    }
  }
  for (const [id, inv] of Array.from(invoiceMap.entries())) {
    if (
      isTombstoned('invoices', id, inv.updatedAt || inv.date, [['patients', inv.patientId]])
    ) {
      invoiceMap.delete(id);
      deletedInvoices.add(id);
      stats.recordsDeletedByTombstones = (stats.recordsDeletedByTombstones ?? 0) + 1;
    }
  }

  for (const remote of remotes) {
    if (!remote) continue;

    // 1. Patients (skip tombstoned records; newer updatedAt wins)
    for (const rp of remote.patients || []) {
      if (isTombstoned('patients', rp.id, rp.updatedAt || rp.createdAt)) continue;
      const lp = patientMap.get(rp.id);
      if (!lp) {
        patientMap.set(rp.id, rp);
        changedPatients.set(rp.id, rp);
        stats.patientsAdded++;
      } else if (toTimestampMs(rp.updatedAt) > toTimestampMs(lp.updatedAt)) {
        const mergedPatient: PatientRecord = {
          ...lp,
          ...rp,
          data: { ...lp.data, ...rp.data },
        };
        patientMap.set(rp.id, mergedPatient);
        changedPatients.set(rp.id, mergedPatient);
        stats.patientsUpdated++;
      }
    }

    // 2. Episodes (skip tombstoned records; newer updatedAt wins)
    for (const re of remote.episodes || []) {
      if (
        isTombstoned('episodes', re.id, re.updatedAt || re.createdAt, [['patients', re.patientId]])
      ) {
        continue;
      }
      const le = episodeMap.get(re.id);
      if (!le) {
        episodeMap.set(re.id, re);
        changedEpisodes.set(re.id, re);
        stats.episodesAdded++;
      } else if (toTimestampMs(re.updatedAt) > toTimestampMs(le.updatedAt)) {
        const mergedEpisode: EpisodeRecord = {
          ...le,
          ...re,
          data: { ...le.data, ...re.data },
        };
        episodeMap.set(re.id, mergedEpisode);
        changedEpisodes.set(re.id, mergedEpisode);
        stats.episodesUpdated++;
      }
    }

    // 3. Sessions (skip tombstoned records; non-deleted finalized sessions remain immutable)
    for (const rs of remote.sessions || []) {
      if (
        isTombstoned('sessions', rs.id, rs.updatedAt || rs.createdAt, [
          ['episodes', rs.episodeId],
          ['patients', rs.patientId],
        ])
      ) {
        continue;
      }
      const ls = sessionMap.get(rs.id);
      if (!ls) {
        sessionMap.set(rs.id, rs);
        changedSessions.set(rs.id, rs);
        stats.sessionsAdded++;
      } else if (ls.status === 'finalized') {
        if (rs.updatedAt !== ls.updatedAt) {
          stats.remoteFinalizedSkippedAsImmutable++;
        }
      } else if (
        rs.status === 'finalized' ||
        toTimestampMs(rs.updatedAt) > toTimestampMs(ls.updatedAt)
      ) {
        sessionMap.set(rs.id, rs);
        changedSessions.set(rs.id, rs);
        stats.sessionsUpdated++;
      }
    }

    // 4. SOAP Notes (skip tombstoned records; 1:1 by sessionId; finalized notes stay immutable)
    for (const rn of remote.soapNotes || []) {
      if (
        isTombstoned('soapNotes', rn.id, rn.updatedAt || rn.createdAt, [
          ['sessions', rn.sessionId],
          ['episodes', rn.episodeId],
          ['patients', rn.patientId],
        ])
      ) {
        continue;
      }
      const ln = soapMap.get(rn.id) || soapBySessionId.get(rn.sessionId);
      if (!ln) {
        soapMap.set(rn.id, rn);
        soapBySessionId.set(rn.sessionId, rn);
        changedSoaps.set(rn.id, rn);
        stats.soapsAdded++;
      } else if (ln.data?.isFinalized) {
        if (rn.updatedAt !== ln.updatedAt) {
          stats.remoteFinalizedSkippedAsImmutable++;
        }
      } else if (
        rn.data?.isFinalized ||
        toTimestampMs(rn.updatedAt) > toTimestampMs(ln.updatedAt)
      ) {
        const aligned: SoapNoteRecord = { ...rn, id: ln.id };
        soapMap.set(aligned.id, aligned);
        soapBySessionId.set(aligned.sessionId, aligned);
        changedSoaps.set(aligned.id, aligned);
        stats.soapsUpdated++;
      }
    }

    // 5. Clinical Addenda (skip tombstoned records; otherwise strictly append-only)
    for (const ra of remote.clinicalAddenda || []) {
      if (
        isTombstoned('clinicalAddenda', ra.id, ra.createdAt, [
          ['sessions', ra.sessionId],
          ['patients', ra.patientId],
        ])
      ) {
        continue;
      }
      if (!addendumMap.has(ra.id)) {
        addendumMap.set(ra.id, ra);
        changedAddenda.set(ra.id, ra);
        stats.addendaAdded++;
      }
    }

    // 6. Appointments
    for (const rapp of remote.appointments || []) {
      if (
        isTombstoned('appointments', rapp.id, rapp.updatedAt || rapp.date, [
          ['patients', rapp.patientId],
        ])
      ) {
        continue;
      }
      const lapp = appointmentMap.get(rapp.id);
      const rTs = toTimestampMs(rapp.updatedAt || rapp.date);
      const lTs = toTimestampMs(lapp?.updatedAt || lapp?.date);
      if (!lapp || rTs > lTs || (lapp.status === 'scheduled' && rapp.status !== 'scheduled')) {
        appointmentMap.set(rapp.id, rapp);
        changedAppointments.set(rapp.id, rapp);
        stats.appointmentsMerged++;
      }
    }

    // 7. Invoices
    for (const rinv of remote.invoices || []) {
      if (
        isTombstoned('invoices', rinv.id, rinv.updatedAt || rinv.date, [
          ['patients', rinv.patientId],
        ])
      ) {
        continue;
      }
      const linv = invoiceMap.get(rinv.id);
      if (
        !linv ||
        (rinv.paidAmountIQD ?? 0) > (linv.paidAmountIQD ?? 0) ||
        toTimestampMs(rinv.updatedAt || rinv.date) > toTimestampMs(linv.updatedAt || linv.date)
      ) {
        invoiceMap.set(rinv.id, rinv);
        changedInvoices.set(rinv.id, rinv);
        stats.invoicesMerged++;
      }
    }

    // 8. Episode Clinical Stores (ROM / MMT / Snapshots / HEP — merge snapshots append-only too!)
    for (const rstore of remote.episodeClinicalStores || []) {
      if (isTombstoned('episodes', rstore.episodeId, rstore.updatedAt)) continue;
      const lstore = storeMap.get(rstore.episodeId);
      if (!lstore) {
        storeMap.set(rstore.episodeId, rstore);
        changedStores.set(rstore.episodeId, rstore);
        stats.episodeStoresMerged++;
      } else {
        // Always union append-only snapshots by ID so neither device loses historical evals
        const snapMap = new Map((lstore.snapshots || []).map((s) => [s.id, s]));
        let snapAdded = false;
        for (const rsnap of rstore.snapshots || []) {
          if (!snapMap.has(rsnap.id)) {
            snapMap.set(rsnap.id, rsnap);
            snapAdded = true;
          }
        }
        const remoteIsNewer = toTimestampMs(rstore.updatedAt) > toTimestampMs(lstore.updatedAt);
        if (remoteIsNewer || snapAdded) {
          const mergedStore: EpisodeScopedClinicalStore = {
            ...(remoteIsNewer ? rstore : lstore),
            snapshots: Array.from(snapMap.values()),
            updatedAt: remoteIsNewer ? rstore.updatedAt : lstore.updatedAt,
          };
          storeMap.set(rstore.episodeId, mergedStore);
          changedStores.set(rstore.episodeId, mergedStore);
          stats.episodeStoresMerged++;
        }
      }
    }

    // 9. Staff Roster (additive merge by staff ID)
    for (const rstaff of remote.staffRoster || []) {
      if (!staffMap.has(rstaff.id)) {
        staffMap.set(rstaff.id, rstaff);
        staffRosterChanged = true;
        stats.staffMerged++;
      }
    }
  }

  return {
    merged: {
      schemaVersion: 1,
      deviceId: local.deviceId,
      deviceLabel: local.deviceLabel,
      exportedAt: new Date().toISOString(),
      patients: Array.from(patientMap.values()),
      episodes: Array.from(episodeMap.values()),
      sessions: Array.from(sessionMap.values()),
      soapNotes: Array.from(soapMap.values()),
      clinicalAddenda: Array.from(addendumMap.values()),
      appointments: Array.from(appointmentMap.values()),
      invoices: Array.from(invoiceMap.values()),
      episodeClinicalStores: Array.from(storeMap.values()),
      staffRoster: Array.from(staffMap.values()),
      deletionTombstones: Array.from(tombstoneMap.values()),
    },
    changed: {
      patients: Array.from(changedPatients.values()),
      episodes: Array.from(changedEpisodes.values()),
      sessions: Array.from(changedSessions.values()),
      soapNotes: Array.from(changedSoaps.values()),
      clinicalAddenda: Array.from(changedAddenda.values()),
      appointments: Array.from(changedAppointments.values()),
      invoices: Array.from(changedInvoices.values()),
      episodeClinicalStores: Array.from(changedStores.values()),
      staffRosterChanged,
      deletionTombstones: Array.from(changedTombstones.values()),
      deletedIds: {
        patients: Array.from(deletedPatients),
        episodes: Array.from(deletedEpisodes),
        sessions: Array.from(deletedSessions),
        soapNotes: Array.from(deletedSoaps),
        clinicalAddenda: Array.from(deletedAddenda),
        appointments: Array.from(deletedAppointments),
        invoices: Array.from(deletedInvoices),
      },
    },
    stats,
  };
}
