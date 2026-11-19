// =======================================================================
// PhysioRecord — Custom Local Font Storage & CSP-Safe Loader
// Stores user-uploaded .woff2 / .woff / .ttf / .otf files in an isolated
// non-PHI IndexedDB database (`PhysioRecordUiPrefsDB`) and loads them via
// `FontFace(family, ArrayBuffer)` so `font-src 'self'` CSP remains strict.
// =======================================================================

export type CustomFontFormat = 'woff2' | 'woff' | 'ttf' | 'otf';

export interface CustomFontRecord {
  id: string;
  name: string;
  cssFamily: string;
  format: CustomFontFormat;
  sizeBytes: number;
  addedAt: string;
  buffer: ArrayBuffer;
}

export interface CustomFontMeta {
  id: string;
  name: string;
  cssFamily: string;
  format: CustomFontFormat;
  sizeBytes: number;
  addedAt: string;
}

export const MAX_CUSTOM_FONT_BYTES = 5 * 1024 * 1024; // 5 MB
export const UI_PREFS_DB_NAME = 'PhysioRecordUiPrefsDB';
export const CUSTOM_FONTS_STORE = 'custom_fonts';

const ALLOWED_EXTENSIONS = new Set(['woff2', 'woff', 'ttf', 'otf']);

export function sanitizeFontDisplayName(rawName: string): string {
  const withoutExt = rawName.replace(/\.(woff2|woff|ttf|otf)$/i, '').trim();
  const cleaned = withoutExt
    .replace(/[<>"'`;{}()\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 64) || 'Custom Font';
}

export function buildCustomCssFamily(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return `PhysioCustomFont_${safeId}`;
}

/**
 * Validates file size, extension, and binary magic bytes for font uploads.
 */
export function validateFontFileSignature(
  buffer: ArrayBuffer,
  fileName: string
): { valid: boolean; format?: CustomFontFormat; reasonAr?: string; reasonEn?: string } {
  if (!buffer || buffer.byteLength === 0) {
    return {
      valid: false,
      reasonAr: 'ملف الخط فارغ.',
      reasonEn: 'Font file is empty.',
    };
  }

  if (buffer.byteLength > MAX_CUSTOM_FONT_BYTES) {
    return {
      valid: false,
      reasonAr: 'حجم ملف الخط يتجاوز الحد الأقصى (5 ميجابايت).',
      reasonEn: 'Font file exceeds the 5 MB limit.',
    };
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      reasonAr: 'صيغة غير مدعومة. الصيغ المسموحة: .woff2, .woff, .ttf, .otf',
      reasonEn: 'Unsupported file extension. Allowed: .woff2, .woff, .ttf, .otf',
    };
  }

  if (buffer.byteLength < 12) {
    return {
      valid: false,
      reasonAr: 'ملف الخط تالف أو قصير جداً.',
      reasonEn: 'Font file header is truncated or corrupt.',
    };
  }

  const bytes = new Uint8Array(buffer.slice(0, 4));
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];

  const isWoff2 = b0 === 0x77 && b1 === 0x4f && b2 === 0x46 && b3 === 0x32; // 'wOF2'
  const isWoff = b0 === 0x77 && b1 === 0x4f && b2 === 0x46 && b3 === 0x46; // 'wOFF'
  const isTrueType =
    (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) ||
    (b0 === 0x74 && b1 === 0x72 && b2 === 0x75 && b3 === 0x65); // 'true'
  const isOpenTypeCff = b0 === 0x4f && b1 === 0x54 && b2 === 0x54 && b3 === 0x4f; // 'OTTO'

  if (ext === 'woff2' && isWoff2) return { valid: true, format: 'woff2' };
  if (ext === 'woff' && isWoff) return { valid: true, format: 'woff' };
  if (ext === 'ttf' && isTrueType) return { valid: true, format: 'ttf' };
  if (ext === 'otf' && (isOpenTypeCff || isTrueType)) return { valid: true, format: 'otf' };

  return {
    valid: false,
    reasonAr: 'توقيع ملف الخط (Magic Bytes) لا يطابق صيغة خط صالحة.',
    reasonEn: 'Invalid font file binary signature.',
  };
}

// Memory fallback for test environments without IndexedDB
const memoryFontsFallback = new Map<string, CustomFontRecord>();
const loadedFacesRegistry = new Map<string, FontFace>();

function openUiPrefsDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(UI_PREFS_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CUSTOM_FONTS_STORE)) {
        db.createObjectStore(CUSTOM_FONTS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listCustomFonts(): Promise<CustomFontMeta[]> {
  const db = await openUiPrefsDb().catch(() => null);
  if (!db) {
    return Array.from(memoryFontsFallback.values()).map(({ buffer: _buf, ...meta }) => meta);
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CUSTOM_FONTS_STORE, 'readonly');
      const store = tx.objectStore(CUSTOM_FONTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result || []) as CustomFontRecord[];
        resolve(rows.map(({ buffer: _buf, ...meta }) => meta));
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function getCustomFontRecord(id: string): Promise<CustomFontRecord | null> {
  const db = await openUiPrefsDb().catch(() => null);
  if (!db) {
    return memoryFontsFallback.get(id) ?? null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CUSTOM_FONTS_STORE, 'readonly');
      const store = tx.objectStore(CUSTOM_FONTS_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as CustomFontRecord) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveUploadedCustomFont(
  file: Pick<File, 'name' | 'arrayBuffer'> & { size?: number }
): Promise<CustomFontMeta> {
  const buffer = await file.arrayBuffer();
  const validation = validateFontFileSignature(buffer, file.name);
  if (!validation.valid || !validation.format) {
    throw new Error(validation.reasonEn || 'Invalid font file');
  }

  const id = `font_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record: CustomFontRecord = {
    id,
    name: sanitizeFontDisplayName(file.name),
    cssFamily: buildCustomCssFamily(id),
    format: validation.format,
    sizeBytes: buffer.byteLength,
    addedAt: new Date().toISOString(),
    buffer,
  };

  const db = await openUiPrefsDb().catch(() => null);
  if (!db) {
    memoryFontsFallback.set(id, record);
  } else {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CUSTOM_FONTS_STORE, 'readwrite');
      tx.objectStore(CUSTOM_FONTS_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  await loadCustomFontIntoDocument(record);
  const { buffer: _buf, ...meta } = record;
  return meta;
}

export async function deleteCustomFont(id: string): Promise<void> {
  const loaded = loadedFacesRegistry.get(id);
  if (loaded && typeof document !== 'undefined' && document.fonts) {
    try {
      document.fonts.delete(loaded);
    } catch {
      // Ignore
    }
    loadedFacesRegistry.delete(id);
  }

  const db = await openUiPrefsDb().catch(() => null);
  if (!db) {
    memoryFontsFallback.delete(id);
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(CUSTOM_FONTS_STORE, 'readwrite');
      tx.objectStore(CUSTOM_FONTS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Registers a persisted ArrayBuffer font directly via CSS Font Loading API
 * without using blob: or data: URLs.
 */
export async function loadCustomFontIntoDocument(
  record: CustomFontRecord
): Promise<string | null> {
  if (
    typeof window === 'undefined' ||
    typeof FontFace === 'undefined' ||
    typeof document === 'undefined' ||
    !document.fonts
  ) {
    return record.cssFamily;
  }

  if (loadedFacesRegistry.has(record.id)) {
    return record.cssFamily;
  }

  try {
    const face = new FontFace(record.cssFamily, record.buffer.slice(0));
    const loadedFace = await face.load();
    document.fonts.add(loadedFace);
    loadedFacesRegistry.set(record.id, loadedFace);
    return record.cssFamily;
  } catch {
    return null;
  }
}
