// =======================================================================
// PhysioRecord — Encrypted Google Drive Clinic Sync (BYOC, Zero Cost)
// Lazy-loaded Firebase Auth + Google Drive v3 (`drive.file` scope ONLY)
// - ZERO network or Firebase execution at startup / normal offline use
// - OAuth access token cached strictly in memory (cleared on sign-out)
// - Client-side AES-256-GCM envelopes only (Google never sees plaintext)
// =======================================================================

import type { EncryptedSyncEnvelope } from '../utils/clinicSyncEngine';
import {
  isSafeSyncDeviceId,
  isValidGoogleDriveId,
  randomHexCsprng,
  safeJsonParse,
} from '../utils/securityHardening';

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_SYNC_FOLDER_NAME = 'PhysioRecord-Clinic-Sync';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const MAX_DRIVE_ENVELOPE_BYTES = 35 * 1024 * 1024;

export interface GoogleDriveAuthState {
  isSignedIn: boolean;
  hasDriveToken: boolean;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface GoogleDriveSyncDeviceInfo {
  fileId: string;
  fileName: string;
  modifiedTime?: string;
  deviceId: string;
}

// Strictly in-memory OAuth access token cache (NEVER written to localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let cachedTokenAcquiredAt = 0;
const TOKEN_SOFT_TTL_MS = 50 * 60 * 1000; // 50 minutes

let cachedAuthUser: {
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
} | null = null;

let firebaseAuthInstance: import('firebase/auth').Auth | null = null;
let authListenerBound = false;

async function ensureFirebaseAuth(): Promise<{
  auth: import('firebase/auth').Auth;
  GoogleAuthProvider: typeof import('firebase/auth').GoogleAuthProvider;
  signInWithPopup: typeof import('firebase/auth').signInWithPopup;
  signOut: typeof import('firebase/auth').signOut;
}> {
  const [{ initializeApp, getApps, getApp }, authMod, configMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('../../firebase-applet-config.json'),
  ]);

  const config = configMod.default ?? configMod;
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = firebaseAuthInstance ?? authMod.getAuth(app);
  firebaseAuthInstance = auth;

  if (!authListenerBound) {
    authListenerBound = true;
    authMod.onAuthStateChanged(auth, (user) => {
      if (!user) {
        cachedAccessToken = null;
        cachedTokenAcquiredAt = 0;
        cachedAuthUser = null;
      } else {
        cachedAuthUser = {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        };
      }
    });
  }

  return {
    auth,
    GoogleAuthProvider: authMod.GoogleAuthProvider,
    signInWithPopup: authMod.signInWithPopup,
    signOut: authMod.signOut,
  };
}

export function getGoogleDriveAuthState(): GoogleDriveAuthState {
  const tokenFresh =
    Boolean(cachedAccessToken) && Date.now() - cachedTokenAcquiredAt < TOKEN_SOFT_TTL_MS;
  return {
    isSignedIn: Boolean(cachedAuthUser),
    hasDriveToken: tokenFresh,
    email: cachedAuthUser?.email ?? null,
    displayName: cachedAuthUser?.displayName ?? null,
    photoURL: cachedAuthUser?.photoURL ?? null,
  };
}

/**
 * Initiates Google Workspace OAuth popup requesting strictly `drive.file` scope.
 * MUST only be called from an explicit user click on the official "Sign in with Google" button.
 */
export async function signInWithGoogleDrive(): Promise<GoogleDriveAuthState> {
  const { auth, GoogleAuthProvider, signInWithPopup } = await ensureFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope(GOOGLE_DRIVE_FILE_SCOPE);
  provider.setCustomParameters({ prompt: 'select_account' });

  let result;
  try {
    result = await signInWithPopup(auth, provider);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('تم إغلاق نافذة تسجيل الدخول قبل إكمال الربط.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('المتصفح منع النافذة المنبثقة — يرجى السماح بالنوافذ المنبثقة أو فتح التطبيق في نافذة مستقلة.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        'نطاق المعاينة الحالي غير مضاف في نطاقات تسجيل الدخول المصرح بها (Authorized Domains) — افتح التطبيق من الرابط المنشور أو أضف النطاق في إعدادات Firebase.'
      );
    }
    throw err;
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken ?? null;
  if (!token) {
    throw new Error('لم يتم الحصول على رمز صلاحية Google Drive. يرجى المحاولة مرة أخرى.');
  }

  cachedAccessToken = token;
  cachedTokenAcquiredAt = Date.now();
  cachedAuthUser = {
    email: result.user.email,
    displayName: result.user.displayName,
    photoURL: result.user.photoURL,
  };

  return getGoogleDriveAuthState();
}

export async function signOutGoogleDrive(): Promise<void> {
  cachedAccessToken = null;
  cachedTokenAcquiredAt = 0;
  cachedAuthUser = null;
  if (firebaseAuthInstance) {
    const { signOut } = await import('firebase/auth');
    await signOut(firebaseAuthInstance);
  }
}

async function getValidDriveAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() - cachedTokenAcquiredAt < TOKEN_SOFT_TTL_MS) {
    return cachedAccessToken;
  }
  await signInWithGoogleDrive();
  if (!cachedAccessToken) {
    throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');
  }
  return cachedAccessToken;
}

async function driveFetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await getValidDriveAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, { ...init, headers });
  if (response.status === 401) {
    cachedAccessToken = null;
    cachedTokenAcquiredAt = 0;
    throw new Error('انتهت جلسة Google Drive — يرجى إعادة تسجيل الدخول والمحاولة مجدداً.');
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`خطأ من Google Drive (${response.status}): ${errText.slice(0, 180)}`);
  }
  return (await response.json()) as T;
}

/**
 * Finds or creates the dedicated `PhysioRecord-Clinic-Sync` folder accessible via `drive.file`.
 */
export async function ensurePhysioRecordDriveFolder(preferredFolderId?: string): Promise<string> {
  if (isValidGoogleDriveId(preferredFolderId)) {
    try {
      const existing = await driveFetchJson<{ id: string; trashed?: boolean }>(
        `${DRIVE_API_BASE}/files/${encodeURIComponent(preferredFolderId.trim())}?fields=id,trashed`
      );
      if (isValidGoogleDriveId(existing.id) && !existing.trashed) {
        return existing.id;
      }
    } catch {
      // Fall through to search/create folder
    }
  }

  const q = encodeURIComponent(
    `name = '${DRIVE_SYNC_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const listRes = await driveFetchJson<{ files?: Array<{ id: string; name: string }> }>(
    `${DRIVE_API_BASE}/files?q=${q}&fields=files(id,name)&spaces=drive&pageSize=10`
  );

  if (listRes.files && listRes.files.length > 0) {
    return listRes.files[0].id;
  }

  const created = await driveFetchJson<{ id: string }>(`${DRIVE_API_BASE}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: DRIVE_SYNC_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  return created.id;
}

/**
 * Lists encrypted `.ptsync.json` device files inside the sync folder.
 */
export async function listDriveSyncFiles(folderId: string): Promise<GoogleDriveSyncDeviceInfo[]> {
  if (!isValidGoogleDriveId(folderId)) {
    throw new Error('معرّف مجلد Google Drive غير صالح.');
  }
  const cleanFolderId = folderId.trim();
  const q = encodeURIComponent(
    `'${cleanFolderId}' in parents and trashed = false and name contains '.ptsync.json'`
  );
  const res = await driveFetchJson<{
    files?: Array<{ id: string; name: string; modifiedTime?: string }>;
  }>(`${DRIVE_API_BASE}/files?q=${q}&fields=files(id,name,modifiedTime)&pageSize=100`);

  return (res.files || [])
    .filter((f) => isValidGoogleDriveId(f.id) && typeof f.name === 'string')
    .map((f) => ({
      fileId: f.id,
      fileName: f.name,
      modifiedTime: f.modifiedTime,
      deviceId: f.name.replace(/^sync_/, '').replace(/\.ptsync\.json$/, ''),
    }));
}

async function downloadDriveSyncEnvelope(fileId: string): Promise<EncryptedSyncEnvelope | null> {
  if (!isValidGoogleDriveId(fileId)) return null;
  const token = await getValidDriveAccessToken();
  const res = await fetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId.trim())}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const contentLen = Number(res.headers.get('content-length') || 0);
  if (contentLen > MAX_DRIVE_ENVELOPE_BYTES) return null;
  const rawText = await res.text();
  if (rawText.length > MAX_DRIVE_ENVELOPE_BYTES) return null;
  const parsed = safeJsonParse<EncryptedSyncEnvelope>(rawText);
  return parsed?.magic === 'PHYSIORECORD_SYNC_V1' ? parsed : null;
}

async function uploadOrUpdateDeviceEnvelope(
  folderId: string,
  localEnvelope: EncryptedSyncEnvelope,
  existingFileId?: string
): Promise<string> {
  if (!isValidGoogleDriveId(folderId)) {
    throw new Error('معرّف مجلد Google Drive غير صالح.');
  }
  if (!isSafeSyncDeviceId(localEnvelope.deviceId)) {
    throw new Error('معرّف الجهاز في حزمة المزامنة غير صالح.');
  }
  const token = await getValidDriveAccessToken();
  const fileName = `sync_${localEnvelope.deviceId}.ptsync.json`;
  const jsonBody = JSON.stringify(localEnvelope);

  if (existingFileId && isValidGoogleDriveId(existingFileId)) {
    const res = await fetch(
      `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(existingFileId.trim())}?uploadType=media&fields=id`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonBody,
      }
    );
    if (!res.ok) {
      throw new Error(`تعذّر تحديث ملف المزامنة على Google Drive (${res.status}).`);
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  const boundary = `physiorecord_sync_${randomHexCsprng(12)}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId.trim()],
    mimeType: 'application/json',
  });
  const multipartBody = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    jsonBody,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!res.ok) {
    throw new Error(`تعذّر رفع ملف المزامنة المشفّر إلى Google Drive (${res.status}).`);
  }
  const created = (await res.json()) as { id: string };
  return created.id;
}

/**
 * Uploads this device's encrypted envelope and downloads all peer devices' encrypted envelopes
 * from the shared clinic Google Drive folder (`PhysioRecord-Clinic-Sync`).
 * MUST only be invoked after explicit user confirmation in UI.
 */
export async function exchangeEnvelopesWithGoogleDrive(params: {
  localEnvelope: EncryptedSyncEnvelope;
  preferredFolderId?: string;
}): Promise<{
  folderId: string;
  peerEnvelopes: EncryptedSyncEnvelope[];
  uploadedFileId: string;
  peerDevicesCount: number;
}> {
  const folderId = await ensurePhysioRecordDriveFolder(params.preferredFolderId);
  const files = await listDriveSyncFiles(folderId);
  const expectedLocalFileName = `sync_${params.localEnvelope.deviceId}.ptsync.json`;

  const existingLocalFile = files.find((f) => f.fileName === expectedLocalFileName);
  const peerFiles = files.filter((f) => f.fileName !== expectedLocalFileName);

  const uploadedFileId = await uploadOrUpdateDeviceEnvelope(
    folderId,
    params.localEnvelope,
    existingLocalFile?.fileId
  );

  const peerEnvelopes: EncryptedSyncEnvelope[] = [];
  for (const pf of peerFiles) {
    const env = await downloadDriveSyncEnvelope(pf.fileId);
    if (env) peerEnvelopes.push(env);
  }

  return {
    folderId,
    peerEnvelopes,
    uploadedFileId,
    peerDevicesCount: peerEnvelopes.length,
  };
}
