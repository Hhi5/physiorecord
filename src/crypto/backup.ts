// =======================================================================
// PhysioRecord — Backup & Restoration Engine (.ptbackup v3.0 + v1.1/v2.0 compatibility)
// =======================================================================

import { PhysioRecordDatabase, CURRENT_DEXIE_SCHEMA_VERSION } from '../db/db';
import {
  CLINICAL_STORES_REGISTRY,
  extractAndValidateParentIds,
  validateSnapshotReferentialIntegrity,
  type SnapshotEntityRecord,
} from '../db/registry';
import { broadcastVaultEvent } from '../utils/vaultEvents';
import { registerTestHooks } from '../utils/testHooks';
import type { VaultMetaEntity, BackupHeader, EpisodeSequenceEntity } from '../types/clinical';
import type { BackupRestoreMode, MergeConflictRecord } from '../types/clinicManagement';
import {
  subtle,
  wrapDEKForBackup,
  unwrapDEKFromBackup,
  decryptRawDEKForBackup,
  decryptBackupPayload,
  validateBackupHeaderPreDerivation,
  validateRawBackupString,
  BackupHeaderValidationError,
  generateVerifier,
  encryptRecordPayload,
  decryptRecordPayload,
  deriveSequenceHmacKey,
  registerSequenceHmacKey,
  deriveRecordHkdfBaseKey,
  registerRecordHkdfKey,
  computeSessionNumberHmacToken,
  bindDekToGeneration,
  randomBytes,
  CONSTANTS,
  CURRENT_DEK_VERSION,
  CURRENT_RECORD_CRYPTO_VERSION,
  LEGACY_RECORD_CRYPTO_VERSION_V1,
  MAX_BACKUP_SIZE_BYTES,
  MAX_GCM_INVOCATIONS_PER_DEK,
  DekExhaustedError,
  generateAndWrapRecoveryKey,
} from './vault';
import {
  compressBytesGzip,
  decompressBytesGzip,
  deriveBackupKeysWithWorker,
  deriveKEKWithWorker,
  isCompressionStreamSupported,
} from './cryptoWorkerClient';

export const BACKUP_WARNING_THRESHOLD_BYTES = 20 * 1024 * 1024;
export const DEFAULT_CHUNK_SIZE_BYTES = 256 * 1024; // 256 KB per AES-GCM chunk

export interface BackupEncryptedChunk {
  chunkIndex: number;
  totalChunks: number;
  isFinal: boolean;
  iv: number[];
  ciphertext: number[];
}

/**
 * Canonical deterministic serialization of the backup header Additional Authenticated Data (AAD).
 */
export const buildCanonicalBackupHeaderAAD = (
  untrustedHeader: BackupHeader | Record<string, unknown>
): Uint8Array => {
  if (!untrustedHeader || typeof untrustedHeader !== 'object') {
    throw new BackupHeaderValidationError('ترويسة النسخة الاحتياطية مفقودة أو غير صالحة لبناء AAD.');
  }
  const header = untrustedHeader as Record<string, unknown>;

  const requiredFields = [
    'magic',
    'exportDateUtc',
    'clinicTimezone',
    'schemaVersion',
    'kdfAlgorithm',
    'kdfIterations',
    'keyExpansion',
    'hkdfHash',
    'hkdfSalt',
    'hkdfInfoDekWrap',
    'hkdfInfoPayloadEnc',
    'derivedKeyLengthBits',
    'backupSalt',
    'backupDekIv',
    'backupWrappedDek',
    'dekVersion',
    'encryptionInvocationCount',
    'maxBackupSizeBytes',
    'payloadLength',
  ];

  for (const field of requiredFields) {
    if (header[field] === undefined || header[field] === null) {
      throw new BackupHeaderValidationError(
        `الحقل الإلزامي "${field}" مفقود في ترويسة النسخة الاحتياطية ولا يمكن استخدام قيمة افتراضية.`
      );
    }
  }

  const formatVersion =
    typeof header.formatVersion === 'string'
      ? header.formatVersion
      : header.magic === 'PHYSIORECORD_BACKUP_V3.0'
        ? '3.0'
        : header.magic === 'PHYSIORECORD_BACKUP_V2.0'
          ? '2.0'
          : '1.1';

  const baseObj = {
    formatVersion,
    magic: header.magic,
    exportDateUtc: header.exportDateUtc,
    clinicTimezone: String(header.clinicTimezone),
    schemaVersion: Number(header.schemaVersion),
    kdfAlgorithm: header.kdfAlgorithm,
    kdfIterations: Number(header.kdfIterations),
    keyExpansion: header.keyExpansion,
    hkdfHash: String(header.hkdfHash),
    hkdfSalt: Array.from(header.hkdfSalt as ArrayLike<number>),
    hkdfInfoDekWrap: header.hkdfInfoDekWrap,
    hkdfInfoPayloadEnc: header.hkdfInfoPayloadEnc,
    derivedKeyLengthBits: Number(header.derivedKeyLengthBits),
    backupSalt: Array.from(header.backupSalt as ArrayLike<number>),
    backupDekIv: Array.from(header.backupDekIv as ArrayLike<number>),
    backupWrappedDek: Array.from(header.backupWrappedDek as ArrayLike<number>),
    dekVersion: Number(header.dekVersion),
    encryptionInvocationCount: Number(header.encryptionInvocationCount),
    maxBackupSizeBytes: Number(header.maxBackupSizeBytes),
    payloadLength: Number(header.payloadLength),
  };

  if (formatVersion === '3.0' || header.magic === 'PHYSIORECORD_BACKUP_V3.0') {
    const v3Obj = {
      ...baseObj,
      compression: String(header.compression || 'gzip'),
      compressedLength: Number(header.compressedLength || 0),
      chunkSizeBytes: Number(header.chunkSizeBytes || DEFAULT_CHUNK_SIZE_BYTES),
      totalChunks: Number(header.totalChunks || 1),
    };
    return new TextEncoder().encode(JSON.stringify(v3Obj));
  }

  return new TextEncoder().encode(JSON.stringify(baseObj));
};

export const computeHeaderAadHashHex = async (headerAad: Uint8Array): Promise<string> => {
  const copy = new Uint8Array(headerAad.byteLength);
  copy.set(headerAad);
  const digest = await subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const buildChunkAAD = (
  headerHashSha256: string,
  magic: string,
  chunkIndex: number,
  totalChunks: number,
  isFinal: boolean
): Uint8Array => {
  return new TextEncoder().encode(
    JSON.stringify({
      headerHashSha256,
      magic,
      chunkIndex,
      totalChunks,
      isFinal,
    })
  );
};

export interface ExportedBackupPackage {
  header: {
    formatVersion?: string;
    magic: string;
    exportDateUtc: string;
    clinicTimezone: string;
    schemaVersion: number;
    kdfAlgorithm: string;
    kdfIterations: number;
    keyExpansion: string;
    hkdfHash: string;
    hkdfSalt: number[];
    hkdfInfoDekWrap: string;
    hkdfInfoPayloadEnc: string;
    derivedKeyLengthBits: number;
    backupSalt: number[];
    backupDekIv: number[];
    backupWrappedDek: number[];
    backupDataIv: number[];
    dekVersion: number;
    encryptionInvocationCount: number;
    maxBackupSizeBytes: number;
    payloadLength: number;
    compression?: 'gzip' | 'none';
    compressedLength?: number;
    chunkSizeBytes?: number;
    totalChunks?: number;
  };
  payloadCiphertext?: number[];
  chunks?: BackupEncryptedChunk[];
}

export interface RestoredBackupSummary {
  patientCount: number;
  episodeCount: number;
  sessionCount: number;
  soapCount: number;
  addendaCount?: number;
  appointmentCount?: number;
  waitingListCount?: number;
  invoiceCount?: number;
  paymentCount?: number;
  expenseCount?: number;
  auditLogCount?: number;
  staffStateCount?: number;
  episodeClinicalCount?: number;
  customWidgetCount?: number;
  migrationReportCount?: number;
  countsByStore: Record<string, number>;
  destinationOperationalDek: CryptoKey;
  restoredInvocationCount: number;
  newRecoveryKey?: string;
  mode: BackupRestoreMode;
  conflicts: MergeConflictRecord[];
  skippedImmutableCount: number;
}

export interface BackupPreviewSummary {
  exportDateUtc: string;
  schemaVersion: number;
  clinicTimezone: string;
  formatVersion: string;
  restoredPatientCount: number;
  restoredEpisodeCount: number;
  restoredSessionCount: number;
  restoredSoapCount: number;
  restoredAddendaCount: number;
  countsByStore: Record<string, number>;
  currentPatientCount: number;
  currentLatestModificationDate: string | null;
}

export interface BackupVerificationResult {
  valid: boolean;
  formatVersion: string;
  recordCount: number;
  compressedBytes?: number;
  uncompressedBytes: number;
  verifiedAt: string;
}

/**
 * Shared payload validation + decryption across V1.1, V2.0, and V3.0 (compressed + chunked).
 */
export const decryptPackagePayloadSnapshot = async <T = Record<string, unknown[]>>(
  pkg: ExportedBackupPackage,
  backupPayloadEncKey: CryptoKey
): Promise<T> => {
  const header = pkg.header;
  const headerAad = buildCanonicalBackupHeaderAAD(header);

  if (header.magic === 'PHYSIORECORD_BACKUP_V3.0' || Array.isArray(pkg.chunks)) {
    const chunks = pkg.chunks;
    const expectedTotal = Number(header.totalChunks || 0);
    if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length !== expectedTotal) {
      throw new BackupHeaderValidationError(
        `عدد أجزاء النسخة المشفرة (${Array.isArray(chunks) ? chunks.length : 0}) لا يطابق العدد المعلن (${expectedTotal}). قد يكون الملف مبتوراً.`
      );
    }

    const headerHashSha256 = await computeHeaderAadHashHex(headerAad);
    const decryptedSlices: Uint8Array[] = [];
    let totalCompressedBytes = 0;

    for (let i = 0; i < expectedTotal; i++) {
      const chunk = chunks[i];
      const expectedIsFinal = i === expectedTotal - 1;
      if (
        !chunk ||
        chunk.chunkIndex !== i ||
        chunk.totalChunks !== expectedTotal ||
        chunk.isFinal !== expectedIsFinal ||
        !Array.isArray(chunk.iv) ||
        chunk.iv.length !== 12 ||
        !Array.isArray(chunk.ciphertext) ||
        chunk.ciphertext.length < 16
      ) {
        throw new BackupHeaderValidationError(
          `بيانات الجزء رقم ${i} غير صالحة أو أعيد ترتيبها أو حُذف الجزء النهائي.`
        );
      }

      const chunkAad = buildChunkAAD(
        headerHashSha256,
        header.magic,
        chunk.chunkIndex,
        chunk.totalChunks,
        chunk.isFinal
      );
      let plainSliceBuf: ArrayBuffer;
      try {
        plainSliceBuf = await subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: new Uint8Array(chunk.iv),
            additionalData: chunkAad,
          },
          backupPayloadEncKey,
          new Uint8Array(chunk.ciphertext)
        );
      } catch {
        throw new BackupHeaderValidationError(
          `فشل التحقق من مصادقة الجزء رقم ${i} من النسخة المشفرة. قد يكون الملف معطوباً أو كلمة المرور خاطئة.`
        );
      }
      const sliceBytes = new Uint8Array(plainSliceBuf);
      decryptedSlices.push(sliceBytes);
      totalCompressedBytes += sliceBytes.byteLength;
    }

    const mergedCompressed = new Uint8Array(totalCompressedBytes);
    let offset = 0;
    for (const s of decryptedSlices) {
      mergedCompressed.set(s, offset);
      offset += s.byteLength;
    }

    let rawJsonBytes: Uint8Array;
    if (header.compression === 'gzip') {
      rawJsonBytes = await decompressBytesGzip(mergedCompressed);
    } else {
      rawJsonBytes = mergedCompressed;
    }
    const jsonStr = new TextDecoder().decode(rawJsonBytes);
    return JSON.parse(jsonStr) as T;
  }

  // Legacy V1.1 / V2.0 single ciphertext array
  if (!pkg.payloadCiphertext || pkg.payloadCiphertext.length < 16) {
    throw new BackupHeaderValidationError('حقل النص المشفر للحمولة (payloadCiphertext) مفقود أو تالف.');
  }
  const decryptedPayloadJson = await decryptBackupPayload(
    backupPayloadEncKey,
    headerAad,
    new Uint8Array(header.backupDataIv),
    new Uint8Array(pkg.payloadCiphertext)
  );
  return JSON.parse(decryptedPayloadJson) as T;
};

/**
 * Parse and validate outer container prior to key derivation.
 */
function parseAndValidateContainerPreDerivation(backupJsonStr: string): ExportedBackupPackage {
  validateRawBackupString(backupJsonStr);

  let pkg: ExportedBackupPackage;
  try {
    pkg = JSON.parse(backupJsonStr) as ExportedBackupPackage;
  } catch {
    throw new BackupHeaderValidationError('ملف النسخة الاحتياطية غير صالح (صيغة JSON معطوبة).');
  }

  if (!pkg || typeof pkg !== 'object') {
    throw new BackupHeaderValidationError('حزمة النسخة الاحتياطية غير صالحة.');
  }

  validateBackupHeaderPreDerivation(pkg.header);

  if (pkg.header.magic === 'PHYSIORECORD_BACKUP_V3.0') {
    if (!Array.isArray(pkg.chunks) || pkg.chunks.length === 0) {
      throw new BackupHeaderValidationError('أجزاء الحمولة المشفرة (chunks) مفقودة في النسخة V3.0.');
    }
  } else {
    const rawPayloadCipher = (pkg as unknown as Record<string, unknown>).payloadCiphertext;
    if (!rawPayloadCipher || (!Array.isArray(rawPayloadCipher) && !(rawPayloadCipher instanceof Uint8Array))) {
      throw new BackupHeaderValidationError('حقل النص المشفر للحمولة (payloadCiphertext) مفقود أو غير صالح.');
    }
    if (rawPayloadCipher.length < 16) {
      throw new BackupHeaderValidationError('حجم النص المشفر للحمولة أصغر من وسم المصادقة الأدنى.');
    }
  }

  return pkg;
}

/**
 * Inspect and preview incoming backup package against current database state.
 */
export const inspectBackupPreview = async (
  backupJsonStr: string,
  backupPassword: string,
  targetDatabase: PhysioRecordDatabase,
  onProgress?: (percent: number) => void
): Promise<BackupPreviewSummary> => {
  const pkg = parseAndValidateContainerPreDerivation(backupJsonStr);
  const header = pkg.header;

  const { backupPayloadEncKey } = await deriveBackupKeysWithWorker(
    backupPassword,
    new Uint8Array(header.backupSalt),
    new Uint8Array(header.hkdfSalt),
    header.kdfIterations,
    header.hkdfInfoDekWrap,
    header.hkdfInfoPayloadEnc,
    onProgress
  );

  const snapshot = await decryptPackagePayloadSnapshot<Record<string, unknown[]>>(
    pkg,
    backupPayloadEncKey
  );

  const countsByStore: Record<string, number> = {};
  for (const storeDef of Object.values(CLINICAL_STORES_REGISTRY)) {
    countsByStore[storeDef.name] = Array.isArray(snapshot[storeDef.name]) ? snapshot[storeDef.name].length : 0;
  }

  const currentPatients = await targetDatabase.patients.toArray();
  let currentLatestDate: string | null = null;
  for (const cp of currentPatients) {
    if (!currentLatestDate || (cp.updatedAt && cp.updatedAt > currentLatestDate)) {
      currentLatestDate = cp.updatedAt;
    }
  }

  return {
    exportDateUtc: header.exportDateUtc,
    schemaVersion: header.schemaVersion,
    clinicTimezone: header.clinicTimezone,
    formatVersion: header.formatVersion || (header.magic === 'PHYSIORECORD_BACKUP_V3.0' ? '3.0' : '2.0'),
    restoredPatientCount: countsByStore['patients'] || 0,
    restoredEpisodeCount: countsByStore['episodes'] || 0,
    restoredSessionCount: countsByStore['sessions'] || 0,
    restoredSoapCount: countsByStore['soapNotes'] || 0,
    restoredAddendaCount: countsByStore['clinicalAddenda'] || 0,
    countsByStore,
    currentPatientCount: currentPatients.length,
    currentLatestModificationDate: currentLatestDate,
  };
};

/**
 * Export full encrypted database snapshot into .ptbackup v3.0 (gzip + chunked AES-256-GCM).
 * Local device-only secrets (`vaultMeta`, `fsHandles`) remain strictly excluded.
 */
export const exportBackupPackage = async (
  database: PhysioRecordDatabase,
  vaultMeta: VaultMetaEntity,
  vaultKek: CryptoKey,
  backupPassword: string,
  clinicTimezone = 'Asia/Baghdad',
  onProgress?: (percent: number) => void
): Promise<string> => {
  onProgress?.(5);

  const snapshot: Record<string, Record<string, unknown>[]> = {};
  for (const storeDef of Object.values(CLINICAL_STORES_REGISTRY)) {
    const table = database.table<Record<string, unknown>, string>(storeDef.name);
    if (table) {
      const records = await table.toArray();
      snapshot[storeDef.name] = records.map((r) => ({
        ...r,
        iv: Array.from(r.iv as ArrayLike<number>),
        ciphertext: Array.from(r.ciphertext as ArrayLike<number>),
        ...(r.recordSalt ? { recordSalt: Array.from(r.recordSalt as ArrayLike<number>) } : {}),
      }));
    }
  }

  const payloadJson = JSON.stringify(snapshot);
  const uncompressedBytes = new TextEncoder().encode(payloadJson);
  onProgress?.(20);

  // Gzip compression before chunked AEAD encryption removes legacy 25MB limit safely;
  // falls back to 'none' on older Android WebViews where CompressionStream is unavailable.
  const canCompressGzip = isCompressionStreamSupported();
  const compressedBytes = canCompressGzip
    ? await compressBytesGzip(uncompressedBytes)
    : uncompressedBytes;
  const compressionMode: 'gzip' | 'none' = canCompressGzip ? 'gzip' : 'none';
  const chunkSizeBytes = DEFAULT_CHUNK_SIZE_BYTES;
  const totalChunks = Math.max(1, Math.ceil(compressedBytes.byteLength / chunkSizeBytes));
  onProgress?.(35);

  const backupSalt = randomBytes(CONSTANTS.SALT_BYTES);
  const hkdfSalt = randomBytes(CONSTANTS.HKDF_SALT_BYTES);

  const { backupDekWrapKey, backupPayloadEncKey } = await deriveBackupKeysWithWorker(
    backupPassword,
    backupSalt,
    hkdfSalt,
    CONSTANTS.DEFAULT_PBKDF2_ITERATIONS,
    'physiorecord-backup-dek-wrap-v3.0',
    'physiorecord-backup-payload-enc-v3.0',
    (p) => onProgress?.(35 + Math.round(p * 0.4))
  );

  const rawDekBytes = await decryptRawDEKForBackup(
    vaultMeta.wrappedDek,
    vaultMeta.wrappedDekIv,
    vaultKek
  );
  const { backupWrappedDek, backupDekIv } = await wrapDEKForBackup(
    rawDekBytes,
    backupDekWrapKey
  );
  rawDekBytes.fill(0);

  const headerNonce = randomBytes(CONSTANTS.IV_BYTES);
  const header: ExportedBackupPackage['header'] = {
    formatVersion: '3.0',
    magic: 'PHYSIORECORD_BACKUP_V3.0',
    exportDateUtc: new Date().toISOString(),
    clinicTimezone,
    schemaVersion: database.verno,
    kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
    kdfIterations: CONSTANTS.DEFAULT_PBKDF2_ITERATIONS,
    keyExpansion: 'HKDF-SHA256',
    hkdfHash: 'SHA-256',
    hkdfSalt: Array.from(hkdfSalt),
    hkdfInfoDekWrap: 'physiorecord-backup-dek-wrap-v3.0',
    hkdfInfoPayloadEnc: 'physiorecord-backup-payload-enc-v3.0',
    derivedKeyLengthBits: 256,
    backupSalt: Array.from(backupSalt),
    backupDekIv: Array.from(backupDekIv),
    backupWrappedDek: Array.from(backupWrappedDek),
    backupDataIv: Array.from(headerNonce),
    dekVersion: vaultMeta.dekVersion || CURRENT_DEK_VERSION,
    encryptionInvocationCount: vaultMeta.encryptionInvocationCount || 0,
    maxBackupSizeBytes: Math.max(MAX_BACKUP_SIZE_BYTES, uncompressedBytes.byteLength),
    payloadLength: uncompressedBytes.byteLength,
    compression: compressionMode,
    compressedLength: compressedBytes.byteLength,
    chunkSizeBytes,
    totalChunks,
  };

  const headerAad = buildCanonicalBackupHeaderAAD(header);
  const headerHashSha256 = await computeHeaderAadHashHex(headerAad);

  const chunks: BackupEncryptedChunk[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSizeBytes;
    const end = Math.min(compressedBytes.byteLength, start + chunkSizeBytes);
    const slice = compressedBytes.subarray(start, end);
    const iv = randomBytes(CONSTANTS.IV_BYTES);
    const isFinal = i === totalChunks - 1;
    const chunkAad = buildChunkAAD(
      headerHashSha256,
      header.magic,
      i,
      totalChunks,
      isFinal
    );
    const cipherBuf = await subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: chunkAad },
      backupPayloadEncKey,
      slice
    );
    chunks.push({
      chunkIndex: i,
      totalChunks,
      isFinal,
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(cipherBuf)),
    });
    onProgress?.(75 + Math.round(((i + 1) / totalChunks) * 25));
  }

  const backupPackage: ExportedBackupPackage = {
    header,
    chunks,
  };

  return JSON.stringify(backupPackage, null, 2);
};

/**
 * Post-export verification pass (Phase 1.9): verifies DEK unwrap, every chunk AAD + tag,
 * decompression, referential integrity, and record decryptability without touching DB.
 */
export const verifyBackupPackage = async (
  backupJsonStr: string,
  backupPassword: string,
  onProgress?: (percent: number) => void
): Promise<BackupVerificationResult> => {
  const pkg = parseAndValidateContainerPreDerivation(backupJsonStr);
  const header = pkg.header;

  const { backupDekWrapKey, backupPayloadEncKey } = await deriveBackupKeysWithWorker(
    backupPassword,
    new Uint8Array(header.backupSalt),
    new Uint8Array(header.hkdfSalt),
    header.kdfIterations,
    header.hkdfInfoDekWrap,
    header.hkdfInfoPayloadEnc,
    onProgress
  );

  const rawDek = await unwrapDEKFromBackup(
    new Uint8Array(header.backupWrappedDek),
    new Uint8Array(header.backupDekIv),
    backupDekWrapKey
  );

  try {
    type SerializedRec = SnapshotEntityRecord & {
      id: string;
      iv: number[] | Uint8Array;
      ciphertext: number[] | Uint8Array;
      recordSalt?: number[] | Uint8Array;
      recordCryptoVersion?: number;
      dekVersion?: number;
    };
    const snapshot = await decryptPackagePayloadSnapshot<Record<string, SerializedRec[]>>(
      pkg,
      backupPayloadEncKey
    );

    validateSnapshotReferentialIntegrity(snapshot);

    const testDek = await subtle.importKey('raw', rawDek, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    registerRecordHkdfKey(testDek, await deriveRecordHkdfBaseKey(rawDek));

    let recordCount = 0;
    for (const storeDef of Object.values(CLINICAL_STORES_REGISTRY)) {
      const list = snapshot[storeDef.name];
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        const parentIds = extractAndValidateParentIds(storeDef.name, r);
        await decryptRecordPayload(
          testDek,
          storeDef.name,
          r.id,
          parentIds,
          new Uint8Array(r.iv),
          new Uint8Array(r.ciphertext),
          r.recordCryptoVersion || LEGACY_RECORD_CRYPTO_VERSION_V1,
          r.dekVersion || header.dekVersion || CURRENT_DEK_VERSION,
          r.recordSalt ? new Uint8Array(r.recordSalt) : undefined
        );
        recordCount++;
      }
    }

    return {
      valid: true,
      formatVersion: header.formatVersion || '3.0',
      recordCount,
      compressedBytes: header.compressedLength,
      uncompressedBytes: header.payloadLength,
      verifiedAt: new Date().toISOString(),
    };
  } finally {
    rawDek.fill(0);
  }
};

function getComparableRecordTimestamp(rec: Record<string, unknown>, payload: Record<string, unknown>): number {
  const candidates = [
    rec.updatedAt,
    payload.updatedAt,
    payload.addedAt,
    rec.createdAt,
    payload.createdAt,
    payload.timestamp,
    payload.date,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      const parsed = Date.parse(c);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return 0;
}

function getIsoTimestampString(rec: Record<string, unknown>, payload: Record<string, unknown>): string | undefined {
  const candidates = [rec.updatedAt, payload.updatedAt, rec.createdAt, payload.timestamp];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  return undefined;
}

/**
 * 10-Step Safe Restoration Workflow supporting BOTH Replace and Merge modes (Phase 1.10).
 */
export const restoreBackupPackage = async (
  backupJsonStr: string,
  backupPassword: string,
  newDestinationVaultPassword: string,
  targetDatabase: PhysioRecordDatabase,
  options: {
    mode?: BackupRestoreMode;
    existingLocalDek?: CryptoKey;
    onProgress?: (percent: number) => void;
    sandboxVerification?: boolean;
  } = {}
): Promise<RestoredBackupSummary> => {
  const mode: BackupRestoreMode = options.mode || 'replace';
  const pkg = parseAndValidateContainerPreDerivation(backupJsonStr);
  const header = pkg.header;

  const { backupDekWrapKey, backupPayloadEncKey } = await deriveBackupKeysWithWorker(
    backupPassword,
    new Uint8Array(header.backupSalt),
    new Uint8Array(header.hkdfSalt),
    header.kdfIterations,
    header.hkdfInfoDekWrap,
    header.hkdfInfoPayloadEnc,
    options.onProgress
  );

  const rawDek = await unwrapDEKFromBackup(
    new Uint8Array(header.backupWrappedDek),
    new Uint8Array(header.backupDekIv),
    backupDekWrapKey
  );

  type SerializedEncryptedRecord = SnapshotEntityRecord & {
    id: string;
    iv: number[] | Uint8Array;
    ciphertext: number[] | Uint8Array;
    recordSalt?: number[] | Uint8Array;
    recordCryptoVersion?: number;
    dekVersion?: number;
    updatedAt?: string;
    createdAt?: string;
  };

  const snapshot = await decryptPackagePayloadSnapshot<Record<string, SerializedEncryptedRecord[]>>(
    pkg,
    backupPayloadEncKey
  );

  validateSnapshotReferentialIntegrity(snapshot);

  const sourceDek = await subtle.importKey(
    'raw',
    rawDek,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  registerRecordHkdfKey(sourceDek, await deriveRecordHkdfBaseKey(rawDek));

  const existingTargetMeta = await targetDatabase.vaultMeta.get('auth');
  const currentVaultGen = existingTargetMeta?.vaultGeneration ?? 1;
  const nextVaultGeneration = currentVaultGen + 1;

  if (mode === 'merge' && existingTargetMeta && !options.existingLocalDek) {
    throw new Error('يتطلب وضع الدمج فتح الخزينة الحالية أولاً لفك تشفير السجلات المحلية ومقارنتها.');
  }

  const freshRawDek = randomBytes(32);
  const newVaultSalt = randomBytes(CONSTANTS.SALT_BYTES);
  const destinationVaultKek = await deriveKEKWithWorker(newDestinationVaultPassword, newVaultSalt);

  const newWrappedDekIv = randomBytes(CONSTANTS.IV_BYTES);
  const wrapAad = new TextEncoder().encode('vault-dek-wrap:v1.1');
  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: newWrappedDekIv, additionalData: wrapAad },
    destinationVaultKek,
    freshRawDek
  );

  const destinationOperationalDek = await subtle.importKey(
    'raw',
    freshRawDek,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  bindDekToGeneration(destinationOperationalDek, nextVaultGeneration);
  registerSequenceHmacKey(destinationOperationalDek, await deriveSequenceHmacKey(freshRawDek));
  registerRecordHkdfKey(destinationOperationalDek, await deriveRecordHkdfBaseKey(freshRawDek));

  const verifier = await generateVerifier(destinationVaultKek);
  const newDekVersion = (header.dekVersion || CURRENT_DEK_VERSION) + 1;
  const restoredRecovery = await generateAndWrapRecoveryKey(freshRawDek);

  type StagedEncryptedRecord = SnapshotEntityRecord & {
    id: string;
    iv: Uint8Array;
    ciphertext: Uint8Array;
    recordSalt?: Uint8Array;
    recordCryptoVersion: number;
    dekVersion: number;
  };
  let stagingInvocationCount = 0;
  const stagedStores: Record<string, StagedEncryptedRecord[]> = {};
  const restoredSessionsByEpisode = new Map<string, number[]>();
  const conflicts: MergeConflictRecord[] = [];
  let skippedImmutableCount = 0;

  try {
    // Reconcile `deletionTombstones` FIRST so tombstones from BOTH the local vault and
    // incoming backup prevent resurrection of explicitly deleted records during merge
    // (including when merging an older pre-v11 backup that lacks `deletionTombstones`).
    const orderedStoreDefs = [
      ...(CLINICAL_STORES_REGISTRY.deletionTombstones
        ? [CLINICAL_STORES_REGISTRY.deletionTombstones]
        : []),
      ...Object.values(CLINICAL_STORES_REGISTRY).filter(
        (def) => def.name !== 'deletionTombstones'
      ),
    ];

    // Map `${storeName}:${recordId}` -> deletedAt timestamp (ms)
    const effectiveTombstonesMs = new Map<string, { deletedAtMs: number; deletedAtIso?: string }>();
    const isRecordSuppressedByTombstone = (
      storeName: string,
      rec: SerializedEncryptedRecord,
      plaintext: Record<string, unknown>
    ): { suppressed: boolean; deletedAtIso?: string } => {
      if (storeName === 'deletionTombstones') return { suppressed: false };

      const recordMs = getComparableRecordTimestamp(rec, plaintext);
      const directKey = `${storeName}:${rec.id}`;
      const direct = effectiveTombstonesMs.get(directKey);
      if (direct && (recordMs === 0 || direct.deletedAtMs >= recordMs)) {
        return { suppressed: true, deletedAtIso: direct.deletedAtIso };
      }

      // Cascade suppression: if a parent session, episode, or patient was tombstoned,
      // do not resurrect orphaned child records (soapNotes, clinicalAddenda, sessions, episodes)
      const parentRefs: Array<[string, unknown]> = [
        ['sessions', rec.sessionId ?? plaintext.sessionId],
        ['episodes', rec.episodeId ?? plaintext.episodeId],
        ['patients', rec.patientId ?? plaintext.patientId],
      ];
      for (const [parentStore, parentIdVal] of parentRefs) {
        if (typeof parentIdVal === 'string' && parentIdVal.trim()) {
          const parentTomb = effectiveTombstonesMs.get(`${parentStore}:${parentIdVal.trim()}`);
          if (parentTomb && (recordMs === 0 || parentTomb.deletedAtMs >= recordMs)) {
            return { suppressed: true, deletedAtIso: parentTomb.deletedAtIso };
          }
        }
      }

      return { suppressed: false };
    };

    for (const storeDef of orderedStoreDefs) {
      const storeName = storeDef.name;
      const incomingRecords = Array.isArray(snapshot[storeName]) ? snapshot[storeName] : [];
      stagedStores[storeName] = [];

      // Decrypt incoming records
      const incomingMap = new Map<
        string,
        { raw: SerializedEncryptedRecord; plaintext: Record<string, unknown>; parentIds: string[] }
      >();
      for (const r of incomingRecords) {
        const parentIds = extractAndValidateParentIds(storeName, r);
        const sourceDekVersion = r.dekVersion || header.dekVersion || CURRENT_DEK_VERSION;
        const sourceCryptoVersion = r.recordCryptoVersion || LEGACY_RECORD_CRYPTO_VERSION_V1;
        const clinicalData = await decryptRecordPayload<Record<string, unknown>>(
          sourceDek,
          storeName,
          r.id,
          parentIds,
          new Uint8Array(r.iv),
          new Uint8Array(r.ciphertext),
          sourceCryptoVersion,
          sourceDekVersion,
          r.recordSalt ? new Uint8Array(r.recordSalt) : undefined
        );
        incomingMap.set(r.id, { raw: r, plaintext: clinicalData, parentIds });
      }

      // In merge mode, load & decrypt local records too, then reconcile
      const localMap = new Map<
        string,
        { raw: SerializedEncryptedRecord; plaintext: Record<string, unknown>; parentIds: string[] }
      >();
      if (mode === 'merge' && existingTargetMeta && options.existingLocalDek) {
        const table = targetDatabase.table<SerializedEncryptedRecord, string>(storeName);
        if (table) {
          const existingLocal = await table.toArray();
          for (const lr of existingLocal) {
            const parentIds = extractAndValidateParentIds(storeName, lr);
            const localDekVersion =
              lr.dekVersion || existingTargetMeta.dekVersion || CURRENT_DEK_VERSION;
            const localCryptoVersion =
              lr.recordCryptoVersion || LEGACY_RECORD_CRYPTO_VERSION_V1;
            const plaintext = await decryptRecordPayload<Record<string, unknown>>(
              options.existingLocalDek,
              storeName,
              lr.id,
              parentIds,
              new Uint8Array(lr.iv),
              new Uint8Array(lr.ciphertext),
              localCryptoVersion,
              localDekVersion,
              lr.recordSalt ? new Uint8Array(lr.recordSalt) : undefined
            );
            localMap.set(lr.id, { raw: lr, plaintext, parentIds });
          }
        }
      }

      const reconciledList: Array<{
        raw: SerializedEncryptedRecord;
        plaintext: Record<string, unknown>;
        parentIds: string[];
      }> = [];

      if (mode === 'merge' && existingTargetMeta && options.existingLocalDek) {
        const allIds = new Set([...localMap.keys(), ...incomingMap.keys()]);
        for (const recId of allIds) {
          const localEntry = localMap.get(recId);
          const backupEntry = incomingMap.get(recId);

          if (storeName === 'deletionTombstones') {
            let chosen = localEntry || backupEntry;
            if (localEntry && backupEntry) {
              const localMs = Date.parse(
                String(localEntry.plaintext.deletedAt || localEntry.raw.updatedAt || '')
              );
              const backupMs = Date.parse(
                String(backupEntry.plaintext.deletedAt || backupEntry.raw.updatedAt || '')
              );
              chosen = (Number.isFinite(backupMs) ? backupMs : 0) > (Number.isFinite(localMs) ? localMs : 0)
                ? backupEntry
                : localEntry;
            }
            if (chosen) {
              reconciledList.push(chosen);
              const targetStore = String(chosen.plaintext.storeName || chosen.raw.storeName || '').trim();
              const targetRecId = String(chosen.plaintext.recordId || chosen.raw.recordId || '').trim();
              const deletedAtIso = String(
                chosen.plaintext.deletedAt || chosen.raw.deletedAt || chosen.raw.updatedAt || ''
              ).trim();
              const deletedAtMs = Date.parse(deletedAtIso);
              if (targetStore && targetRecId) {
                effectiveTombstonesMs.set(`${targetStore}:${targetRecId}`, {
                  deletedAtMs: Number.isFinite(deletedAtMs) ? deletedAtMs : Date.now(),
                  deletedAtIso: deletedAtIso || undefined,
                });
              }
            }
            continue;
          }

          if (localEntry && !backupEntry) {
            const tombCheck = isRecordSuppressedByTombstone(
              storeName,
              localEntry.raw,
              localEntry.plaintext
            );
            if (tombCheck.suppressed) {
              conflicts.push({
                storeName,
                recordId: recId,
                resolution: 'skipped_deleted',
                localUpdatedAt: getIsoTimestampString(localEntry.raw, localEntry.plaintext),
                backupUpdatedAt: tombCheck.deletedAtIso,
                reasonAr: 'تم حذف هذا السجل صراحةً (سجل توثيق الحذف): تمت إزالته أثناء الدمج لمنع بقائه.',
                reasonEn: 'Record has an explicit deletion tombstone: removed during merge.',
              });
              continue;
            }
            reconciledList.push(localEntry);
            continue;
          }
          if (!localEntry && backupEntry) {
            const tombCheck = isRecordSuppressedByTombstone(
              storeName,
              backupEntry.raw,
              backupEntry.plaintext
            );
            if (tombCheck.suppressed) {
              conflicts.push({
                storeName,
                recordId: recId,
                resolution: 'skipped_deleted',
                localUpdatedAt: tombCheck.deletedAtIso,
                backupUpdatedAt: getIsoTimestampString(backupEntry.raw, backupEntry.plaintext),
                reasonAr: 'تم حذف هذا السجل سابقاً: تم منع إعادة ظهوره من النسخة الاحتياطية.',
                reasonEn: 'Record was previously deleted: prevented resurrection from backup.',
              });
              continue;
            }
            reconciledList.push(backupEntry);
            continue;
          }
          if (localEntry && backupEntry) {
            const localTombCheck = isRecordSuppressedByTombstone(
              storeName,
              localEntry.raw,
              localEntry.plaintext
            );
            const backupTombCheck = isRecordSuppressedByTombstone(
              storeName,
              backupEntry.raw,
              backupEntry.plaintext
            );
            if (localTombCheck.suppressed && backupTombCheck.suppressed) {
              conflicts.push({
                storeName,
                recordId: recId,
                resolution: 'skipped_deleted',
                localUpdatedAt: getIsoTimestampString(localEntry.raw, localEntry.plaintext),
                backupUpdatedAt: getIsoTimestampString(backupEntry.raw, backupEntry.plaintext),
                reasonAr: 'تم حذف هذا السجل صراحةً في سجل توثيق الحذف: تم تخطيه أثناء الدمج.',
                reasonEn: 'Record is covered by an explicit deletion tombstone: skipped during merge.',
              });
              continue;
            }

            const isImmutable =
              storeName === 'clinicalAddenda' ||
              storeName === 'auditLogs' ||
              (storeName === 'consents' && Boolean(localEntry.plaintext.signedAt)) ||
              (storeName === 'soapNotes' &&
                (localEntry.plaintext.isFinalized === true ||
                  localEntry.plaintext.status === 'finalized')) ||
              (storeName === 'sessions' && localEntry.plaintext.status === 'finalized');

            const localTsStr = getIsoTimestampString(localEntry.raw, localEntry.plaintext);
            const backupTsStr = getIsoTimestampString(backupEntry.raw, backupEntry.plaintext);

            if (isImmutable) {
              reconciledList.push(localEntry);
              skippedImmutableCount++;
              conflicts.push({
                storeName,
                recordId: recId,
                resolution: 'skipped_immutable',
                localUpdatedAt: localTsStr,
                backupUpdatedAt: backupTsStr,
                reasonAr: 'سجل معتمد غير قابل للتعديل: تم الإبقاء على النسخة المحلية دون استبدال.',
                reasonEn: 'Immutable/finalized record: local record retained without overwrite.',
              });
              continue;
            }

            const localMs = getComparableRecordTimestamp(localEntry.raw, localEntry.plaintext);
            const backupMs = getComparableRecordTimestamp(backupEntry.raw, backupEntry.plaintext);

            if (backupMs > localMs) {
              reconciledList.push(backupEntry);
              conflicts.push({
                storeName,
                recordId: recId,
                resolution: 'applied_backup',
                localUpdatedAt: localTsStr,
                backupUpdatedAt: backupTsStr,
                reasonAr: 'سجل النسخة الاحتياطية أحدث زمنياً: تم اعتماد تحديث النسخة.',
                reasonEn: 'Backup record has newer updatedAt timestamp: applied backup version.',
              });
            } else {
              reconciledList.push(localEntry);
              conflicts.push({
                storeName,
                recordId: recId,
                resolution: 'kept_local',
                localUpdatedAt: localTsStr,
                backupUpdatedAt: backupTsStr,
                reasonAr: 'السجل المحلي أحدث أو مساوٍ: تم الاحتفاظ بالنسخة المحلية.',
                reasonEn: 'Local record is newer or equal: kept local version.',
              });
            }
          }
        }
      } else {
        for (const item of incomingMap.values()) {
          reconciledList.push(item);
        }
      }

      for (const item of reconciledList) {
        const { raw: r, plaintext: clinicalData, parentIds } = item;

        const sessionNum = clinicalData?.sessionNumber;
        if (storeName === 'sessions' && r.episodeId && sessionNum !== undefined) {
          if (!restoredSessionsByEpisode.has(r.episodeId)) {
            restoredSessionsByEpisode.set(r.episodeId, []);
          }
          restoredSessionsByEpisode.get(r.episodeId)!.push(Number(sessionNum));
        }

        if (stagingInvocationCount + 1 > MAX_GCM_INVOCATIONS_PER_DEK) {
          throw new DekExhaustedError(
            'تجاوزت عمليات إعادة التشفير أثناء الاستعادة سقف استخدام المفتاح (1,000,000 عملية).'
          );
        }
        stagingInvocationCount += 1;

        const targetCryptoVersion = CURRENT_RECORD_CRYPTO_VERSION;
        const encrypted = await encryptRecordPayload(
          destinationOperationalDek,
          storeName,
          r.id,
          parentIds,
          clinicalData,
          targetCryptoVersion,
          newDekVersion
        );

        const stagedEntity: StagedEncryptedRecord = {
          ...r,
          recordCryptoVersion: targetCryptoVersion,
          dekVersion: newDekVersion,
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
          recordSalt: encrypted.recordSalt,
        };

        stagedStores[storeName].push(stagedEntity);
      }
    }

    // STEP 9: In-memory verification of every staged entity
    for (const storeDef of Object.values(CLINICAL_STORES_REGISTRY)) {
      const storeName = storeDef.name;
      const stagedList = stagedStores[storeName] || [];
      for (const sr of stagedList) {
        const parentIds = storeDef.parentKeys
          .map((k) => sr[k])
          .filter((v): v is string => typeof v === 'string' && Boolean(v));
        await decryptRecordPayload(
          destinationOperationalDek,
          storeName,
          sr.id,
          parentIds,
          sr.iv,
          sr.ciphertext,
          sr.recordCryptoVersion,
          sr.dekVersion,
          sr.recordSalt
        );
      }
    }

    const reconstructedSequences: EpisodeSequenceEntity[] = [];
    for (const [epId, numbers] of restoredSessionsByEpisode.entries()) {
      const tokens: string[] = [];
      for (const num of numbers) {
        const token = await computeSessionNumberHmacToken(destinationOperationalDek, epId, num);
        tokens.push(token);
      }
      const maxNum = numbers.reduce((max, n) => Math.max(max, n), 0);
      reconstructedSequences.push({
        episodeId: epId,
        lastSequenceNumber: maxNum,
        allocatedTokens: tokens,
        updatedAt: new Date().toISOString(),
      });
    }

    const tablesToLock = [
      ...Object.keys(CLINICAL_STORES_REGISTRY)
        .map((name) => targetDatabase.table(name))
        .filter(Boolean),
      targetDatabase.vaultMeta,
      ...(targetDatabase.episodeSequences ? [targetDatabase.episodeSequences] : []),
      ...(targetDatabase.migrationState ? [targetDatabase.migrationState] : []),
    ];

    await targetDatabase.transaction('rw', tablesToLock, async () => {
      for (const storeDef of Object.values(CLINICAL_STORES_REGISTRY)) {
        const table = targetDatabase.table(storeDef.name);
        if (table) {
          await table.clear();
        }
      }
      await targetDatabase.vaultMeta.clear();

      if (targetDatabase.episodeSequences) {
        await targetDatabase.episodeSequences.clear();
      }

      if (targetDatabase.migrationState) {
        await targetDatabase.migrationState.delete('half_finalized_soap_repair_v1');
      }

      for (const storeDef of Object.values(CLINICAL_STORES_REGISTRY)) {
        const table = targetDatabase.table(storeDef.name);
        const stagedList = stagedStores[storeDef.name];
        if (table && stagedList && stagedList.length > 0) {
          await table.bulkPut(stagedList);
        }
      }

      if (targetDatabase.episodeSequences && reconstructedSequences.length > 0) {
        await targetDatabase.episodeSequences.bulkPut(reconstructedSequences);
      }

      await targetDatabase.vaultMeta.put({
        id: 'auth',
        salt: newVaultSalt,
        wrappedDek: new Uint8Array(cipherBuffer),
        wrappedDekIv: newWrappedDekIv,
        verifierIv: verifier.verifierIv,
        verifierCiphertext: verifier.verifierCiphertext,
        schemaVersion: Math.max(
          Number(header.schemaVersion) || 0,
          Number(targetDatabase.verno) || 0,
          CURRENT_DEXIE_SCHEMA_VERSION
        ),
        kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
        kdfIterations: CONSTANTS.DEFAULT_PBKDF2_ITERATIONS,
        dekVersion: newDekVersion,
        encryptionInvocationCount: stagingInvocationCount,
        vaultGeneration: nextVaultGeneration,
        recoveryWrappedDek: restoredRecovery.recoveryWrappedDek,
        recoveryWrappedDekIv: restoredRecovery.recoveryWrappedDekIv,
        recoverySalt: restoredRecovery.recoverySalt,
        recoveryKdfIterations: restoredRecovery.recoveryKdfIterations,
        recoveryKeyGroupSalt: restoredRecovery.recoveryKeyGroupSalt,
        recoveryKeyGroupDigests: restoredRecovery.recoveryKeyGroupDigests,
      });
    });

    bindDekToGeneration(destinationOperationalDek, nextVaultGeneration);

    if (!options.sandboxVerification) {
      broadcastVaultEvent({
        type: 'VAULT_GENERATION_CHANGED',
        generation: nextVaultGeneration,
      });
    }
  } finally {
    rawDek.fill(0);
    freshRawDek.fill(0);
  }

  const countsByStore: Record<string, number> = {};
  for (const storeDef of Object.values(CLINICAL_STORES_REGISTRY)) {
    countsByStore[storeDef.name] = (stagedStores[storeDef.name] || []).length;
  }

  return {
    patientCount: countsByStore['patients'] || 0,
    episodeCount: countsByStore['episodes'] || 0,
    sessionCount: countsByStore['sessions'] || 0,
    soapCount: countsByStore['soapNotes'] || 0,
    addendaCount: countsByStore['clinicalAddenda'] || 0,
    appointmentCount: countsByStore['appointments'] || 0,
    waitingListCount: countsByStore['waitingList'] || 0,
    invoiceCount: countsByStore['invoices'] || 0,
    paymentCount: countsByStore['payments'] || 0,
    expenseCount: countsByStore['expenses'] || 0,
    auditLogCount: countsByStore['auditLogs'] || 0,
    staffStateCount: countsByStore['staffState'] || 0,
    episodeClinicalCount: countsByStore['episodeClinical'] || 0,
    customWidgetCount: countsByStore['customWidgets'] || 0,
    migrationReportCount: countsByStore['migrationReports'] || 0,
    countsByStore,
    destinationOperationalDek,
    restoredInvocationCount: stagingInvocationCount,
    newRecoveryKey: restoredRecovery.recoveryKeyFormatted,
    mode,
    conflicts,
    skippedImmutableCount,
  };
};

export interface SandboxBackupTestResult {
  ok: true;
  verifiedAt: string;
  patientCount: number;
  episodeCount: number;
  sessionCount: number;
  soapCount: number;
  invoiceCount: number;
  totalRecordCount: number;
  sampleDecryptedCount: number;
  countsByStore: Record<string, number>;
}

/**
 * Phase A4: Verify a `.ptbackup` file by restoring and decrypting it inside a temporary
 * isolated sandbox database, sampling core stores to confirm round-trip readability,
 * and destroying the sandbox cleanly without touching the live vault or broadcasting events.
 */
export const verifyBackupInSandboxDb = async (
  backupJsonStr: string,
  backupPassword: string,
  options: {
    databaseFactory?: () => PhysioRecordDatabase;
    onProgress?: (percent: number) => void;
  } = {}
): Promise<SandboxBackupTestResult> => {
  const sandboxDbName = `__backup_sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const sandboxDb = options.databaseFactory
    ? options.databaseFactory()
    : new PhysioRecordDatabase(sandboxDbName);
  const ephemeralPass = `SandboxVerify#${Date.now()}#${Array.from(randomBytes(8)).join('')}`;

  try {
    const summary = await restoreBackupPackage(
      backupJsonStr,
      backupPassword,
      ephemeralPass,
      sandboxDb,
      {
        mode: 'replace',
        onProgress: options.onProgress,
        sandboxVerification: true,
      }
    );

    const sampleStores: Array<
      'patients' | 'episodes' | 'sessions' | 'soapNotes' | 'invoices'
    > = ['patients', 'episodes', 'sessions', 'soapNotes', 'invoices'];
    let sampleDecryptedCount = 0;

    for (const storeName of sampleStores) {
      const storeDef = CLINICAL_STORES_REGISTRY[storeName];
      const rows = await sandboxDb.table(storeName).toArray();
      for (const row of rows.slice(0, 3)) {
        const parentIds = storeDef.parentKeys
          .map((k) => row[k])
          .filter((v): v is string => typeof v === 'string' && Boolean(v));
        await decryptRecordPayload(
          summary.destinationOperationalDek,
          storeName,
          row.id,
          parentIds,
          new Uint8Array(row.iv),
          new Uint8Array(row.ciphertext),
          row.recordCryptoVersion,
          row.dekVersion,
          row.recordSalt ? new Uint8Array(row.recordSalt) : undefined
        );
        sampleDecryptedCount++;
      }
    }

    const totalRecordCount = Object.values(summary.countsByStore).reduce(
      (sum, n) => sum + (Number(n) || 0),
      0
    );

    return {
      ok: true,
      verifiedAt: new Date().toISOString(),
      patientCount: summary.patientCount,
      episodeCount: summary.episodeCount,
      sessionCount: summary.sessionCount,
      soapCount: summary.soapCount,
      invoiceCount: summary.invoiceCount ?? 0,
      totalRecordCount,
      sampleDecryptedCount,
      countsByStore: summary.countsByStore,
    };
  } finally {
    try {
      if (typeof (sandboxDb as unknown as { delete?: () => Promise<void> }).delete === 'function') {
        await (sandboxDb as unknown as { delete: () => Promise<void> }).delete();
      } else if (typeof sandboxDb.vaultMeta?.clear === 'function') {
        await sandboxDb.vaultMeta.clear();
      }
    } catch {
      // Ignore sandbox cleanup error
    }
  }
};

registerTestHooks({
  restoreBackupPackage,
  exportBackupPackage,
  verifyBackupPackage,
});
