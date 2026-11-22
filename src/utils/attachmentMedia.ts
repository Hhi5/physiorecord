// =======================================================================
// PhysioRecord — Encrypted Attachment Media Processing (5.2)
// Downscales clinical/posture photos client-side (~1600px) with 320px
// thumbnails, validates PDFs, and enforces local size warning thresholds.
// =======================================================================

export const ATTACHMENT_MAX_DIMENSION_PX = 1600;
export const ATTACHMENT_THUMBNAIL_MAX_PX = 320;
export const ATTACHMENT_SINGLE_WARNING_BYTES = 2 * 1024 * 1024; // 2 MB per file warning
export const ATTACHMENT_TOTAL_WARNING_BYTES = 20 * 1024 * 1024; // 20 MB cumulative storage warning
export const ATTACHMENT_MAX_PDF_BYTES = 12 * 1024 * 1024; // 12 MB hard limit per single PDF
export const ATTACHMENT_MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB raw image safety cap

const ALLOWED_RASTER_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/gif',
]);

/**
 * Validates that a persisted attachment data URL strictly matches a safe clinical
 * preview MIME type before rendering in an <iframe>, <img>, or download anchor.
 */
export function isSafeAttachmentDataUrl(
  dataUrl: string | undefined | null,
  expectedKind?: 'pdf' | 'image'
): boolean {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  const trimmed = dataUrl.trim();
  const isPdfUrl = /^data:application\/pdf(?:;charset=[^;,]+)?;base64,/i.test(trimmed);
  const isRasterImageUrl = /^data:image\/(?:jpeg|jpg|png|webp|bmp|gif)(?:;charset=[^;,]+)?;base64,/i.test(
    trimmed
  );
  if (expectedKind === 'pdf') return isPdfUrl;
  if (expectedKind === 'image') return isRasterImageUrl;
  return isPdfUrl || isRasterImageUrl;
}

export interface ProcessedAttachmentMedia {
  fileName: string;
  mimeType: string;
  payloadDataUrl: string;
  thumbnailDataUrl?: string;
  widthPx?: number;
  heightPx?: number;
  originalBytes: number;
  storedBytes: number;
  sizeWarning: boolean;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return dataUrl.length;
  const b64 = dataUrl.slice(commaIdx + 1);
  return Math.round((b64.length * 3) / 4);
}

export function formatReadableBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

async function readBlobAsDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 =
      typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
    const mime = blob.type || 'application/octet-stream';
    return `data:${mime};base64,${base64}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read attachment file.'));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
    img.src = src;
  });
}

function renderScaledCanvasDataUrl(
  img: HTMLImageElement,
  maxDimensionPx: number,
  quality: number
): { dataUrl: string; widthPx: number; heightPx: number; mimeType: string } {
  const origW = img.naturalWidth || img.width || 1;
  const origH = img.naturalHeight || img.height || 1;
  const scale = Math.min(1, maxDimensionPx / Math.max(origW, origH));
  const targetW = Math.max(1, Math.round(origW * scale));
  const targetH = Math.max(1, Math.round(origH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D unavailable');
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // Prefer JPEG for clinical/posture photographs for universal print/restore size efficiency
  const mimeType = 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, quality);
  return { dataUrl, widthPx: targetW, heightPx: targetH, mimeType };
}

export async function processAttachmentFile(
  file: File
): Promise<ProcessedAttachmentMedia> {
  const originalBytes = file.size;
  const lowerName = file.name.toLowerCase();
  const lowerMime = (file.type || '').toLowerCase().trim();

  // Explicitly block active SVG/HTML files even if masquerading under image/*
  if (lowerMime.includes('svg') || lowerName.endsWith('.svg') || lowerName.endsWith('.svgz')) {
    throw new Error(
      'ملفات SVG غير مسموح بها أمنياً. يُسمح فقط بالصور (JPG / PNG / WebP) أو تقارير PDF.'
    );
  }

  const isPdf = lowerMime === 'application/pdf' || lowerName.endsWith('.pdf');
  const isRasterImage =
    ALLOWED_RASTER_IMAGE_MIMES.has(lowerMime) ||
    (!lowerMime && /\.(jpe?g|png|webp|bmp|gif)$/.test(lowerName));

  if (!isPdf && !isRasterImage) {
    throw new Error(
      'نوع الملف غير مدعوم. يُسمح فقط بالصور (JPG / PNG / WebP) أو تقارير PDF.'
    );
  }

  if (isPdf) {
    if (originalBytes > ATTACHMENT_MAX_PDF_BYTES) {
      throw new Error(
        `حجم ملف PDF (${formatReadableBytes(originalBytes)}) يتجاوز الحد الأقصى المسموح (12 MB) للحفاظ على سرعة الخزينة.`
      );
    }
    if (typeof file.slice === 'function' && typeof file.slice(0, 5).arrayBuffer === 'function') {
      const headerBuf = await file.slice(0, 5).arrayBuffer();
      const headerBytes = new Uint8Array(headerBuf);
      const isPdfMagic =
        headerBytes.length >= 5 &&
        headerBytes[0] === 0x25 && // %
        headerBytes[1] === 0x50 && // P
        headerBytes[2] === 0x44 && // D
        headerBytes[3] === 0x46 && // F
        headerBytes[4] === 0x2d; // -
      if (!isPdfMagic) {
        throw new Error('ملف PDF غير صالح أو لا يطابق توقيع PDF القياسي.');
      }
    }
    const dataUrl = await readBlobAsDataUrl(file);
    const storedBytes = estimateDataUrlBytes(dataUrl);
    return {
      fileName: file.name,
      mimeType: 'application/pdf',
      payloadDataUrl: dataUrl,
      originalBytes,
      storedBytes,
      sizeWarning: storedBytes > ATTACHMENT_SINGLE_WARNING_BYTES,
    };
  }

  if (originalBytes > ATTACHMENT_MAX_IMAGE_BYTES) {
    throw new Error(
      `حجم الصورة (${formatReadableBytes(originalBytes)}) يتجاوز الحد الأقصى المسموح (25 MB).`
    );
  }

  // Image downscaling (~1600px max edge + ~320px thumbnail)
  const rawDataUrl = await readBlobAsDataUrl(file);
  try {
    const img = await loadImageElement(rawDataUrl);
    const main = renderScaledCanvasDataUrl(img, ATTACHMENT_MAX_DIMENSION_PX, 0.82);
    const thumb = renderScaledCanvasDataUrl(img, ATTACHMENT_THUMBNAIL_MAX_PX, 0.72);
    const storedBytes = estimateDataUrlBytes(main.dataUrl);
    return {
      fileName: file.name,
      mimeType: main.mimeType,
      payloadDataUrl: main.dataUrl,
      thumbnailDataUrl: thumb.dataUrl,
      widthPx: main.widthPx,
      heightPx: main.heightPx,
      originalBytes,
      storedBytes,
      sizeWarning: storedBytes > ATTACHMENT_SINGLE_WARNING_BYTES,
    };
  } catch {
    // Graceful non-browser / headless fallback when Canvas 2D or Image decode isn't present
    const safeMime = ALLOWED_RASTER_IMAGE_MIMES.has(lowerMime) ? lowerMime : 'image/png';
    const storedBytes = estimateDataUrlBytes(rawDataUrl);
    return {
      fileName: file.name,
      mimeType: safeMime,
      payloadDataUrl: rawDataUrl,
      thumbnailDataUrl: rawDataUrl,
      originalBytes,
      storedBytes,
      sizeWarning: storedBytes > ATTACHMENT_SINGLE_WARNING_BYTES,
    };
  }
}
