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

function readBlobAsDataUrl(blob: Blob): Promise<string> {
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
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
  const isImage =
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|bmp)$/.test(lowerName);

  if (!isPdf && !isImage) {
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
    const storedBytes = estimateDataUrlBytes(rawDataUrl);
    return {
      fileName: file.name,
      mimeType: file.type || 'image/png',
      payloadDataUrl: rawDataUrl,
      thumbnailDataUrl: rawDataUrl,
      originalBytes,
      storedBytes,
      sizeWarning: storedBytes > ATTACHMENT_SINGLE_WARNING_BYTES,
    };
  }
}
