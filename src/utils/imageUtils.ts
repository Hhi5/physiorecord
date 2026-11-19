// =======================================================================
// PhysioRecord — Client-Side Image & Signature Data URL Utilities
// Strictly offline (HTML5 Canvas). Rejects SVG/script uploads.
// =======================================================================

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_UPLOAD_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB raw upload cap

export async function processClinicImageUpload(
  file: File,
  options: { maxWidthPx?: number; maxHeightPx?: number; preferPng?: boolean } = {}
): Promise<string> {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new Error(
      'صيغة الصورة غير مدعومة لأغراض الأمان. يرجى اختيار ملف PNG أو JPEG أو WebP فقط.'
    );
  }
  if (file.size > MAX_UPLOAD_INPUT_BYTES) {
    throw new Error('حجم الصورة كبير جداً (الحد الأقصى 5 ميجابايت).');
  }

  const maxW = options.maxWidthPx ?? 480;
  const maxH = options.maxHeightPx ?? 240;

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة المحددة.'));
    reader.readAsDataURL(file);
  });

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return rawDataUrl;
  }

  return await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / Math.max(1, img.width), maxH / Math.max(1, img.height));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const mime = options.preferPng || file.type === 'image/png' ? 'image/png' : 'image/webp';
        const encoded = canvas.toDataURL(mime, 0.86);
        resolve(encoded);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('فشل ضغط الصورة داخل المتصفح.'));
      }
    };
    img.onerror = () => reject(new Error('ملف الصورة تالف أو غير صالح للعرض.'));
    img.src = rawDataUrl;
  });
}

export function isValidEncryptedImageDataUrl(dataUrl: string | undefined | null): boolean {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  return (
    dataUrl.startsWith('data:image/png;base64,') ||
    dataUrl.startsWith('data:image/jpeg;base64,') ||
    dataUrl.startsWith('data:image/webp;base64,')
  );
}
