// =======================================================================
// PhysioRecord — Phase 1 Clinic Security, Audit Hash-Chain & Validation Helpers
// =======================================================================

import { z } from 'zod';

// Strict CSP forbids `unsafe-eval` / `new Function()`; disable Zod v4 JIT before any schema evaluation.
z.config({ jitless: true });
import type {
  AdminPinAuthRecord,
  AuditChainVerificationResult,
  AuditLogEntry,
} from '../types/clinicManagement';
import type { CustomWidgetDefinition } from '../types/clinicalWidgets';

export const ADMIN_PIN_PBKDF2_ITERATIONS = 120_000;

export const CUSTOM_WIDGET_LIMITS = {
  MAX_WIDGETS: 50,
  MAX_JSON_BYTES: 65_536, // 64 KB cap per custom widget payload
  MAX_FIELDS: 30,
  MAX_OPTIONS_PER_FIELD: 30,
  MAX_INTERPRETATIONS: 20,
} as const;

const textEncoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function constantTimeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

/**
 * Computes a lowercase hex SHA-256 digest of a UTF-8 string using WebCrypto.
 */
export async function computeSha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(textEncoder.encode(input)));
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Derives a 256-bit PBKDF2-HMAC-SHA256 hash and salt for Clinic Admin PIN verification.
 * Stored encrypted inside IndexedDB (`db.clinicSettings` id: 'admin_auth').
 */
export async function hashAdminPinPBKDF2(
  pin: string,
  existingSaltBase64?: string,
  iterations: number = ADMIN_PIN_PBKDF2_ITERATIONS
): Promise<{ hashBase64: string; saltBase64: string; iterations: number }> {
  const normalizedPin = pin.trim();
  const saltBytes = existingSaltBase64
    ? base64ToBytes(existingSaltBase64)
    : crypto.getRandomValues(new Uint8Array(16));

  const baseKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(textEncoder.encode(normalizedPin)),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(saltBytes),
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  return {
    hashBase64: bytesToBase64(new Uint8Array(derivedBits)),
    saltBase64: existingSaltBase64 || bytesToBase64(saltBytes),
    iterations,
  };
}

/**
 * Constant-time verification of an Admin PIN against the encrypted PBKDF2 hash record.
 */
export async function verifyAdminPinPBKDF2(
  pinAttempt: string,
  record: AdminPinAuthRecord
): Promise<boolean> {
  if (!record.pinHashBase64 || !record.pinSaltBase64 || record.requiresFirstRunReset) {
    return false;
  }
  const normalized = pinAttempt.trim();
  if (!normalized) return false;

  const candidate = await hashAdminPinPBKDF2(
    normalized,
    record.pinSaltBase64,
    record.iterations || ADMIN_PIN_PBKDF2_ITERATIONS
  );
  return constantTimeBytesEqual(
    base64ToBytes(candidate.hashBase64),
    base64ToBytes(record.pinHashBase64)
  );
}

/**
 * Exponential back-off delay for consecutive failed Admin PIN attempts:
 * 1-2 fails -> 0 ms
 * 3 fails -> 5 s
 * 4 fails -> 15 s
 * 5 fails -> 60 s
 * 6+ fails -> 300 s (5 minutes cap)
 */
export function computePinBackoffMs(failedAttempts: number): number {
  if (failedAttempts < 3) return 0;
  if (failedAttempts === 3) return 5_000;
  if (failedAttempts === 4) return 15_000;
  if (failedAttempts === 5) return 60_000;
  return 300_000;
}

/**
 * Produces a canonical JSON serialization of an AuditLogEntry excluding `entryHash`
 * for tamper-evident SHA-256 chaining.
 */
export function canonicalAuditPayloadString(entry: Omit<AuditLogEntry, 'entryHash'>): string {
  return JSON.stringify({
    id: entry.id,
    sequence: entry.sequence ?? null,
    prevHash: entry.prevHash ?? 'GENESIS',
    timestamp: entry.timestamp,
    staffId: entry.staffId ?? null,
    staffNameAr: entry.staffNameAr ?? entry.actorName ?? null,
    staffNameEn: entry.staffNameEn ?? entry.actorName ?? null,
    role: entry.role ?? entry.actorRole ?? null,
    actionType: entry.actionType,
    entityType: entry.entityType,
    entityId: entry.entityId,
    patientId: entry.patientId ?? null,
    patientIdHashSha256: entry.patientIdHashSha256 ?? null,
    episodeId: entry.episodeId ?? null,
    summaryAr: entry.summaryAr,
    summaryEn: entry.summaryEn,
    deletedAt: entry.deletedAt ?? null,
  });
}

/**
 * Computes the SHA-256 `entryHash` for an audit log entry linked to `prevHash`.
 */
export async function computeAuditEntryHash(
  entry: Omit<AuditLogEntry, 'entryHash'>
): Promise<string> {
  return computeSha256Hex(canonicalAuditPayloadString(entry));
}

/**
 * Verifies the cryptographic SHA-256 hash chain across stored audit log entries.
 * Pre-Phase-1 unchained entries (lacking `entryHash`/`sequence`) are tolerated as
 * legacy unchained history before the genesis chained entry begins.
 */
export async function verifyAuditLogChainEntries(
  rawEntries: AuditLogEntry[]
): Promise<AuditChainVerificationResult> {
  const verifiedAt = new Date().toISOString();
  const totalEntries = rawEntries.length;

  const legacyUnchained = rawEntries.filter(
    (e) => typeof e.entryHash !== 'string' || typeof e.sequence !== 'number'
  );
  const chained = rawEntries
    .filter((e) => typeof e.entryHash === 'string' && typeof e.sequence === 'number')
    .slice()
    .sort((a, b) => (a.sequence as number) - (b.sequence as number));

  if (chained.length === 0) {
    return {
      valid: true,
      totalEntries,
      verifiedEntries: 0,
      legacyUnchainedEntries: legacyUnchained.length,
      headHash: 'GENESIS',
      verifiedAt,
    };
  }

  let expectedPrevHash = 'GENESIS';
  let expectedSequence = 1;
  let verifiedCount = 0;

  for (const entry of chained) {
    if (entry.sequence !== expectedSequence) {
      return {
        valid: false,
        totalEntries,
        verifiedEntries: verifiedCount,
        legacyUnchainedEntries: legacyUnchained.length,
        brokenAtEntryId: entry.id,
        brokenReason: `Sequence gap or duplicate detected: expected #${expectedSequence}, found #${entry.sequence}.`,
        headHash: expectedPrevHash,
        verifiedAt,
      };
    }

    if ((entry.prevHash || 'GENESIS') !== expectedPrevHash) {
      return {
        valid: false,
        totalEntries,
        verifiedEntries: verifiedCount,
        legacyUnchainedEntries: legacyUnchained.length,
        brokenAtEntryId: entry.id,
        brokenReason: `Previous-hash mismatch at entry #${entry.sequence} (${entry.id}).`,
        headHash: expectedPrevHash,
        verifiedAt,
      };
    }

    const { entryHash, ...unsignedPayload } = entry;
    const recomputed = await computeAuditEntryHash(unsignedPayload);
    if (recomputed !== entryHash) {
      return {
        valid: false,
        totalEntries,
        verifiedEntries: verifiedCount,
        legacyUnchainedEntries: legacyUnchained.length,
        brokenAtEntryId: entry.id,
        brokenReason: `SHA-256 digest mismatch at entry #${entry.sequence} (${entry.id}).`,
        headHash: expectedPrevHash,
        verifiedAt,
      };
    }

    expectedPrevHash = entryHash;
    expectedSequence += 1;
    verifiedCount += 1;
  }

  return {
    valid: true,
    totalEntries,
    verifiedEntries: verifiedCount,
    legacyUnchainedEntries: legacyUnchained.length,
    headHash: expectedPrevHash,
    verifiedAt,
  };
}

// -----------------------------------------------------------------------
// Strict Zod Schema Validation for Custom Clinical Widgets (1.11)
// -----------------------------------------------------------------------
const FORBIDDEN_MARKUP_REGEX = /<\s*\/?\s*(script|iframe|object|embed|svg|style|img|a|div|span|form|input)|javascript:|on\w+\s*=/i;

const safeText = (maxLen: number, minLen = 1) =>
  z
    .string()
    .trim()
    .min(minLen)
    .max(maxLen)
    .refine((val) => !FORBIDDEN_MARKUP_REGEX.test(val), {
      message: 'HTML tags, inline event handlers, and script URLs are strictly prohibited.',
    });

const CustomFieldOptionSchema = z.object({
  value: z.union([safeText(80), z.number().finite()]),
  labelAr: safeText(120),
  labelEn: safeText(120),
  score: z.number().finite().min(-1000).max(10000).optional(),
});

const CustomWidgetFieldSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Field ID must contain only ASCII letters, digits, _ or -.'),
  canonicalKey: safeText(120, 0).nullable().optional(),
  label: safeText(200, 0).optional(),
  type: z.enum([
    'number',
    'slider',
    'select',
    'radio',
    'checkbox_group',
    'table_matrix',
    'text',
    'score_calculator',
  ]),
  labelAr: safeText(200),
  labelEn: safeText(200),
  descriptionAr: safeText(400, 0).optional(),
  descriptionEn: safeText(400, 0).optional(),
  min: z.number().finite().min(-100000).max(100000).optional(),
  max: z.number().finite().min(-100000).max(100000).optional(),
  step: z.number().finite().positive().max(10000).optional(),
  unit: safeText(32, 0).optional(),
  options: z.array(CustomFieldOptionSchema).max(CUSTOM_WIDGET_LIMITS.MAX_OPTIONS_PER_FIELD).optional(),
  defaultValue: z.union([safeText(200, 0), z.number().finite(), z.boolean(), z.null()]).optional(),
});

const CustomWidgetInterpretationSchema = z.object({
  minScore: z.number().finite().min(-100000).max(100000),
  maxScore: z.number().finite().min(-100000).max(100000),
  severityAr: safeText(160),
  severityEn: safeText(160),
  clinicalRecommendationAr: safeText(500, 0).optional(),
  clinicalRecommendationEn: safeText(500, 0).optional(),
});

export const CustomWidgetDefinitionSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Widget ID must use ASCII letters, numbers, _ or -.'),
  titleAr: safeText(140),
  titleEn: safeText(140),
  category: z
    .enum([
      'body_chart',
      'rom_mmt',
      'neurology',
      'special_tests',
      'gait_balance',
      'functional_scales',
      'custom_ai',
    ])
    .default('custom_ai'),
  clinicalSpecialtyAr: safeText(160, 0).default('فحص سريري مخصص'),
  clinicalSpecialtyEn: safeText(160, 0).default('Custom Clinical Assessment'),
  descriptionAr: safeText(500, 0).default(''),
  descriptionEn: safeText(500, 0).default(''),
  iconName: safeText(48, 0).optional(),
  version: safeText(32).default('1.0.0'),
  createdAt: safeText(64, 0).default(() => new Date().toISOString()),
  fields: z.array(CustomWidgetFieldSchema).min(1).max(CUSTOM_WIDGET_LIMITS.MAX_FIELDS),
  interpretations: z
    .array(CustomWidgetInterpretationSchema)
    .max(CUSTOM_WIDGET_LIMITS.MAX_INTERPRETATIONS)
    .optional(),
});

/**
 * Validates raw parsed JSON or object for a custom widget definition against strict
 * Zod constraints, size limits (64 KB), and plain-text / non-HTML rules.
 */
export function validateCustomWidgetDefinition(
  candidate: unknown,
  rawJsonLength?: number
): { ok: true; data: CustomWidgetDefinition } | { ok: false; error: string } {
  const serializedSize =
    rawJsonLength ?? new TextEncoder().encode(JSON.stringify(candidate ?? {})).byteLength;
  if (serializedSize > CUSTOM_WIDGET_LIMITS.MAX_JSON_BYTES) {
    return {
      ok: false,
      error: `Custom widget payload exceeds ${CUSTOM_WIDGET_LIMITS.MAX_JSON_BYTES} bytes limit (${serializedSize} bytes).`,
    };
  }

  const result = CustomWidgetDefinitionSchema.safeParse(candidate);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path?.join('.') || 'widget';
    return {
      ok: false,
      error: `${path}: ${firstIssue?.message || 'Invalid custom widget schema'}`,
    };
  }

  return {
    ok: true,
    data: {
      ...result.data,
      createdAt: result.data.createdAt || new Date().toISOString(),
    } as CustomWidgetDefinition,
  };
}
