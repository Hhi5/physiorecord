// =======================================================================
// PhysioRecord — Optional Feature-Detected WebAuthn PRF Biometric/Passkey Unlock (Phase 1.13)
// Strictly optional (off by default); falls back silently when unsupported.
// Master password & emergency recovery key always remain fully intact.
// =======================================================================

import type { PhysioRecordDatabase } from '../db/db';
import type { VaultMetaEntity } from '../types/clinical';
import {
  decryptRawDEKForBackup,
  importOperationalDekFromRawBytes,
  randomBytes,
} from './vault';

const PRF_WRAP_INFO = 'physiorecord-webauthn-prf-dek-wrap-v1';
const PRF_WRAP_AAD = new TextEncoder().encode('webauthn-prf-dek-wrap:v1');

interface PrfExtensionOutput {
  enabled?: boolean;
  results?: {
    first?: ArrayBuffer | ArrayBufferView;
  };
}

function toUint8Array(buf: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (buf instanceof Uint8Array) return new Uint8Array(buf);
  if (ArrayBuffer.isView(buf)) {
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  return new Uint8Array(buf);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Feature-detect platform authenticator & WebAuthn support cleanly without throwing.
 */
export async function isWebAuthnPrfSupported(): Promise<boolean> {
  try {
    if (
      typeof window === 'undefined' ||
      typeof window.PublicKeyCredential === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.credentials ||
      typeof navigator.credentials.create !== 'function' ||
      typeof navigator.credentials.get !== 'function'
    ) {
      return false;
    }

    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      const available =
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return Boolean(available);
    }

    return true;
  } catch {
    return false;
  }
}

async function deriveWrappingKeyFromPrfOutput(
  prfBytes: Uint8Array,
  prfSalt: Uint8Array
): Promise<CryptoKey> {
  const hkdfBase = await crypto.subtle.importKey('raw', toArrayBuffer(prfBytes), 'HKDF', false, ['deriveKey']);
  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(prfSalt),
      info: new TextEncoder().encode(PRF_WRAP_INFO),
    },
    hkdfBase,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function requestPrfAssertionOutput(
  credentialId: Uint8Array,
  prfSalt: Uint8Array
): Promise<Uint8Array> {
  const challenge = randomBytes(32);
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: toArrayBuffer(challenge),
      allowCredentials: [
        {
          id: toArrayBuffer(credentialId),
          type: 'public-key',
        },
      ],
      userVerification: 'required',
      timeout: 60_000,
      extensions: {
        prf: {
          eval: {
            first: toArrayBuffer(prfSalt),
          },
        },
      } as unknown as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('تم إلغاء المصادقة الحيوية أو لم تُستكمل.');
  }

  const extResults = assertion.getClientExtensionResults() as { prf?: PrfExtensionOutput };
  const firstResult = extResults?.prf?.results?.first;
  if (!firstResult) {
    throw new Error('المتصفح أو جهاز المصادقة الحالي لا يدعم امتداد WebAuthn PRF.');
  }
  return toUint8Array(firstResult);
}

/**
 * Enroll a hardware passkey / biometric PRF key to unlock DEK cleanly on this device.
 */
export async function enrollPasskeyPrfUnlock(
  database: PhysioRecordDatabase,
  vaultKek: CryptoKey
): Promise<{ credentialId: Uint8Array }> {
  const supported = await isWebAuthnPrfSupported();
  if (!supported) {
    throw new Error('المصادقة الحيوية WebAuthn غير متوفرة في هذا المتصفح أو الجهاز.');
  }

  const meta = await database.vaultMeta.get('auth');
  if (!meta) {
    throw new Error('الخزينة غير مهيأة.');
  }

  const prfSalt = randomBytes(32);
  const challenge = randomBytes(32);
  const userId = randomBytes(16);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: toArrayBuffer(challenge),
      rp: {
        name: 'PhysioRecord Local EHR',
        id: window.location.hostname || undefined,
      },
      user: {
        id: toArrayBuffer(userId),
        name: 'physiorecord-local-owner',
        displayName: 'PhysioRecord Vault Owner',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      extensions: {
        prf: {
          eval: {
            first: toArrayBuffer(prfSalt),
          },
        },
      } as unknown as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('لم يتم إنشاء مفتاح المرور الحيوي.');
  }

  const credentialId = new Uint8Array(credential.rawId);
  const extResults = credential.getClientExtensionResults() as { prf?: PrfExtensionOutput };

  let prfOutput: Uint8Array;
  if (extResults?.prf?.results?.first) {
    prfOutput = toUint8Array(extResults.prf.results.first);
  } else if (extResults?.prf?.enabled) {
    prfOutput = await requestPrfAssertionOutput(credentialId, prfSalt);
  } else {
    throw new Error('هذا المفتاح الحيوي لا يدعم ميزة WebAuthn PRF المطلوبة لتغليف مفتاح التشفير.');
  }

  const rawDek = await decryptRawDEKForBackup(meta.wrappedDek, meta.wrappedDekIv, vaultKek);
  try {
    const wrappingKey = await deriveWrappingKeyFromPrfOutput(prfOutput, prfSalt);
    const prfWrappedDekIv = randomBytes(12);
    const wrappedBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(prfWrappedDekIv), additionalData: PRF_WRAP_AAD },
      wrappingKey,
      toArrayBuffer(rawDek)
    );

    await database.vaultMeta.update('auth', {
      prfCredentialId: credentialId,
      prfSalt,
      prfWrappedDek: new Uint8Array(wrappedBuf),
      prfWrappedDekIv,
    });

    return { credentialId };
  } finally {
    rawDek.fill(0);
    prfOutput.fill(0);
  }
}

/**
 * Unlock the operational DEK using an enrolled WebAuthn PRF passkey.
 */
export async function unlockOperationalDekWithPrf(
  meta: VaultMetaEntity
): Promise<CryptoKey> {
  if (!meta.prfCredentialId || !meta.prfSalt || !meta.prfWrappedDek || !meta.prfWrappedDekIv) {
    throw new Error('لم يتم تفعيل مفتاح المرور الحيوي لهذه الخزينة.');
  }

  const prfOutput = await requestPrfAssertionOutput(meta.prfCredentialId, meta.prfSalt);
  let rawDek: Uint8Array | null = null;
  try {
    const wrappingKey = await deriveWrappingKeyFromPrfOutput(prfOutput, meta.prfSalt);
    const rawBuf = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(meta.prfWrappedDekIv),
        additionalData: PRF_WRAP_AAD,
      },
      wrappingKey,
      toArrayBuffer(meta.prfWrappedDek)
    );
    rawDek = new Uint8Array(rawBuf);
    const generation = meta.vaultGeneration ?? 1;
    return await importOperationalDekFromRawBytes(rawDek, generation);
  } finally {
    prfOutput.fill(0);
    if (rawDek) rawDek.fill(0);
  }
}

/**
 * Remove stored WebAuthn PRF wrapping metadata cleanly (password unlock remains unaffected).
 */
export async function disablePasskeyPrfUnlock(database: PhysioRecordDatabase): Promise<void> {
  await database.vaultMeta.update('auth', {
    prfCredentialId: undefined,
    prfSalt: undefined,
    prfWrappedDek: undefined,
    prfWrappedDekIv: undefined,
  });
}
