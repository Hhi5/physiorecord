import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Safe usable A4 portrait content height budget (at 96dpi) when using
 * `@page { size: A4 portrait; margin: 7mm 10mm; }` and `.print-sheet-container` padding (`6mm 9mm`):
 * Total A4 = 297mm. Margin = 14mm -> printable box = 283mm (~1069px).
 * Sheet padding = 12mm (~45px). Reserve ~54px safety buffer across Android WebView,
 * Windows Chromium, and Electron PDF font metrics -> 970px inner content+footer target.
 */
export const A4_SINGLE_PAGE_INNER_BUDGET_PX = 970;

export interface SinglePageScaleInput {
  contentHeightPx: number;
  targetHeightPx?: number;
  minScale?: number;
}

/**
 * Computes a proportional CSS zoom factor (`<= 1`) so single-page clinical reports
 * fit cleanly on 1 A4 page without pushing the last section or signature stamp
 * onto an unintended second page.
 */
export function computeSinglePagePrintScale({
  contentHeightPx,
  targetHeightPx = A4_SINGLE_PAGE_INNER_BUDGET_PX,
  minScale = 0.72,
}: SinglePageScaleInput): number {
  if (!Number.isFinite(contentHeightPx) || contentHeightPx <= 0) return 1;
  if (!Number.isFinite(targetHeightPx) || targetHeightPx <= 0) return 1;
  if (contentHeightPx <= targetHeightPx) return 1;

  const raw = targetHeightPx / contentHeightPx;
  const rounded = Math.floor(raw * 1000) / 1000;
  return Math.max(minScale, Math.min(1, rounded));
}

export interface UseSinglePagePrintFitOptions {
  enabled: boolean;
  bodyRef: RefObject<HTMLElement | null>;
  footerRef: RefObject<HTMLElement | null>;
  targetHeightPx?: number;
  minScale?: number;
  deps?: readonly unknown[];
}

export function useSinglePagePrintFit({
  enabled,
  bodyRef,
  footerRef,
  targetHeightPx = A4_SINGLE_PAGE_INNER_BUDGET_PX,
  minScale = 0.72,
  deps = [],
}: UseSinglePagePrintFitOptions): { printScale: number; isScaled: boolean } {
  const [printScale, setPrintScale] = useState(1);

  useLayoutEffect(() => {
    if (!enabled) {
      setPrintScale(1);
      return;
    }

    const measure = () => {
      const bodyEl = bodyRef.current;
      const footerEl = footerRef.current;
      if (!bodyEl) {
        setPrintScale(1);
        return;
      }
      const bodyHeight = bodyEl.scrollHeight || bodyEl.offsetHeight || 0;
      const footerHeight = footerEl ? footerEl.offsetHeight || footerEl.scrollHeight || 0 : 0;
      // Add subtle gap buffer between body & footer (16px)
      const totalInnerHeight = bodyHeight + footerHeight + (footerHeight > 0 ? 16 : 0);
      const nextScale = computeSinglePagePrintScale({
        contentHeightPx: totalInnerHeight,
        targetHeightPx,
        minScale,
      });
      setPrintScale(nextScale);
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('beforeprint', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('beforeprint', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, targetHeightPx, minScale, ...deps]);

  return {
    printScale,
    isScaled: enabled && printScale < 1,
  };
}

// =======================================================================
// Floating A4 Preview Scale & Referral Salutation Math
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
    const horizontalMargin = safeW < 640 ? 24 : 64;
    const availW = Math.max(220, safeW - horizontalMargin);
    scale = Math.min(1, availW / sheetW);
  } else {
    const isMobile = safeW < 640;
    const padX = isMobile ? 56 : 120;
    const padY = isMobile ? 64 : 88;
    const availW = Math.max(200, safeW - padX);
    const availH = Math.max(260, safeH - padY);

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
