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
