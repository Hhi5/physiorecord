// =======================================================================
// PhysioRecord — Pure Floating A4 Preview Scale & Referral Salutation Math
// Decoupled pure helpers verified via node:test for deterministic A4 paper
// framing across mobile (390px), tablet (768px), and desktop (1440px).
// =======================================================================

export const A4_WIDTH_PX = 794; // 210mm at 96 DPI
export const A4_HEIGHT_PX = 1123; // 297mm at 96 DPI

export type PrintPreviewZoomMode = 'mini' | 'readable';

export interface FloatingA4ScaleInput {
  containerWidth: number;
  containerHeight: number;
  contentHeightPx?: number;
  zoomMode?: PrintPreviewZoomMode;
}

export interface FloatingA4ScaleResult {
  scale: number;
  scaledWidth: number;
  scaledHeight: number;
  sheetWidthPx: number;
  sheetHeightPx: number;
}

/**
 * Computes the CSS transform scale so a true 210x297mm A4 sheet renders as a
 * crisp floating miniature card ("صفحة عائمة مصغرة") with balanced margins on
 * every screen size, or expands cleanly in 'readable' zoom mode.
 */
export function computeFloatingA4Scale({
  containerWidth,
  containerHeight,
  contentHeightPx,
  zoomMode = 'mini',
}: FloatingA4ScaleInput): FloatingA4ScaleResult {
  const safeW = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 390;
  const safeH = Number.isFinite(containerHeight) && containerHeight > 0 ? containerHeight : 640;
  const sheetW = A4_WIDTH_PX;
  const sheetH = Math.max(
    A4_HEIGHT_PX,
    Number.isFinite(contentHeightPx) && (contentHeightPx ?? 0) > 0
      ? Math.ceil(contentHeightPx!)
      : A4_HEIGHT_PX
  );

  let scale: number;
  if (zoomMode === 'readable') {
    // Fit comfortably to container width (max 1.0) so clinician can read small print easily
    const horizontalMargin = safeW < 640 ? 24 : 64;
    const availW = Math.max(220, safeW - horizontalMargin);
    scale = Math.min(1, availW / sheetW);
  } else {
    // Floating miniature A4 card mode: always leaves generous floating matte margins
    // around all 4 sides so the entire A4 card reads like a sleek floating page preview.
    const isMobile = safeW < 640;
    const padX = isMobile ? 56 : 120;
    const padY = isMobile ? 64 : 88;
    const availW = Math.max(200, safeW - padX);
    const availH = Math.max(260, safeH - padY);

    // Cap maximum visual card width so on wide 1440px screens it still floats neatly
    const maxCardWidth = isMobile ? Math.min(availW, 310) : Math.min(availW, 470);
    const maxCardHeight = isMobile ? Math.min(availH, 460) : Math.min(availH, 660);

    const scaleByWidth = maxCardWidth / sheetW;
    const scaleByHeight = maxCardHeight / A4_HEIGHT_PX;
    scale = Math.min(scaleByWidth, scaleByHeight, 0.62);
  }

  const clampedScale = Math.round(Math.max(0.24, Math.min(1, scale)) * 1000) / 1000;
  return {
    scale: clampedScale,
    scaledWidth: Math.round(sheetW * clampedScale),
    scaledHeight: Math.round(sheetH * clampedScale),
    sheetWidthPx: sheetW,
    sheetHeightPx: sheetH,
  };
}

/**
 * Formats a clean referral letter salutation line without duplicating titles
 * such as "إلى الدكتور/ة الزميل الدكتور المحترم".
 */
export function buildCleanReferringDoctorSalutation(params: {
  doctorName?: string | null;
  doctorSpecialty?: string | null;
  doctorFacility?: string | null;
  isAr: boolean;
}): string {
  const rawName = (params.doctorName || '').trim();
  const specialty = (params.doctorSpecialty || '').trim();
  const facility = (params.doctorFacility || '').trim();

  if (params.isAr) {
    const hasTitle = /^(?:د\.|د\/|دكتور|الدكتور|الدكتورة|الزميل|السيد|الأستاذ|أ\.د)/i.test(rawName);
    const addressee = rawName
      ? hasTitle
        ? rawName
        : `الدكتور/ة ${rawName}`
      : 'الزميل الدكتور المحترم';
    const hasHonorific = /(?:المحترم|المحترمة)$/.test(addressee);
    const suffix = `${specialty ? ` (${specialty})` : ''}${facility ? ` — ${facility}` : ''}`;
    return `تحية طيبة وبعد، إلى ${addressee}${hasHonorific ? '' : ' المحترم'}${suffix}`;
  }

  const hasEnTitle = /^(?:dr\.?|prof\.?|colleague|dear)\b/i.test(rawName);
  const addresseeEn = rawName
    ? hasEnTitle
      ? rawName
      : `Dr. ${rawName}`
    : 'Colleague Physician';
  const suffixEn = `${specialty ? ` (${specialty})` : ''}${facility ? ` — ${facility}` : ''}`;
  return `Dear ${addresseeEn}${suffixEn},`;
}
