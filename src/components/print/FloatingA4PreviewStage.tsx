// =======================================================================
// PhysioRecord — Floating Miniature A4 Paper Preview Stage
// Displays any printable A4 sheet as a crisp, centered, scaled floating
// A4 card ("صفحة عائمة مصغرة") on screen, with 1-tap toggle to readable
// zoom, while @media print always outputs razor-sharp 100% full A4.
// =======================================================================

import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  A4_HEIGHT_PX,
  A4_WIDTH_PX,
  computeFloatingA4Scale,
  type PrintPreviewZoomMode,
} from '../../utils/printPreviewScale';

export interface FloatingA4PreviewStageProps {
  children: React.ReactNode;
  zoomMode: PrintPreviewZoomMode;
  onZoomModeChange: (mode: PrintPreviewZoomMode) => void;
  onBackdropClick?: () => void;
  className?: string;
}

export const FloatingA4PreviewStage: React.FC<FloatingA4PreviewStageProps> = ({
  children,
  zoomMode,
  onZoomModeChange,
  onBackdropClick,
  className = '',
}) => {
  const { bi } = useLanguage();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const innerSheetWrapRef = useRef<HTMLDivElement | null>(null);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 390,
    height: typeof window !== 'undefined' ? Math.max(420, window.innerHeight - 180) : 640,
  }));
  const [contentHeightPx, setContentHeightPx] = useState<number>(A4_HEIGHT_PX);

  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;

    const updateStageSize = () => {
      const rect = stageEl.getBoundingClientRect();
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height);
      if (nextW > 0 && nextH > 0) {
        setContainerSize((prev) =>
          prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH }
        );
      }
    };

    updateStageSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateStageSize);
      return () => window.removeEventListener('resize', updateStageSize);
    }

    const observer = new ResizeObserver(updateStageSize);
    observer.observe(stageEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const wrapEl = innerSheetWrapRef.current;
    if (!wrapEl) return;

    const updateSheetHeight = () => {
      const h = Math.round(wrapEl.scrollHeight || wrapEl.offsetHeight);
      if (h > 0) {
        const clamped = Math.max(A4_HEIGHT_PX, h);
        setContentHeightPx((prev) => (Math.abs(prev - clamped) <= 2 ? prev : clamped));
      }
    };

    updateSheetHeight();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSheetHeight);
    observer.observe(wrapEl);
    return () => observer.disconnect();
  }, []);

  const metrics = computeFloatingA4Scale({
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
    contentHeightPx,
    zoomMode,
  });

  const isMini = zoomMode === 'mini';

  return (
    <div
      ref={stageRef}
      id="physiorecord-print-portal"
      data-testid="floating-a4-preview-stage"
      data-zoom-mode={zoomMode}
      tabIndex={0}
      onClick={onBackdropClick}
      className={`pr-floating-a4-stage flex-1 min-h-0 w-full overflow-y-auto overflow-x-auto overscroll-contain touch-pan-y bg-slate-200 dark:bg-slate-950 focus:outline-none print:overflow-visible print:p-0 print:bg-white print:block ${className}`}
    >
      <div
        className={`w-full min-h-full flex flex-col items-center px-4 py-5 sm:py-7 gap-3 print:block print:p-0 print:min-h-0 ${
          isMini ? 'justify-center' : 'justify-start'
        }`}
      >
        {/* Floating Scaled A4 Paper Card (dir="ltr" locks scale origin cleanly in both RTL & LTR UI) */}
        <div
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
          data-testid="floating-a4-paper-frame"
          style={{
            width: `${metrics.scaledWidth}px`,
            height: `${metrics.scaledHeight}px`,
          }}
          className="pr-floating-a4-frame relative shrink-0 rounded-xl bg-white shadow-[0_22px_55px_-16px_rgba(15,23,42,0.42)] dark:shadow-[0_26px_64px_-14px_rgba(0,0,0,0.75)] ring-1 ring-slate-900/12 dark:ring-white/15 overflow-hidden transition-[width,height] duration-200 ease-out print:w-full print:h-auto print:rounded-none print:shadow-none print:ring-0 print:overflow-visible"
        >
          <div
            ref={innerSheetWrapRef}
            className="pr-floating-a4-scaler origin-top-left print:w-full print:transform-none"
            style={{
              width: `${A4_WIDTH_PX}px`,
              transform: `scale(${metrics.scale})`,
              transformOrigin: 'top left',
            }}
          >
            {children}
          </div>
        </div>

        {/* Quiet Caption + Quick Zoom Toggle (Screen Only) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="print-modal-chrome print:hidden flex items-center justify-center gap-3 text-xs text-slate-600 dark:text-slate-300 select-none"
        >
          <span className="font-mono tabular-nums text-xs opacity-85" dir="ltr">
            A4 · 210×297mm · {Math.round(metrics.scale * 100)}%
          </span>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <button
            type="button"
            data-testid="floating-a4-zoom-toggle-btn"
            onClick={() => onZoomModeChange(isMini ? 'readable' : 'mini')}
            className="min-h-[34px] px-3 py-1 rounded-lg bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
          >
            {isMini ? (
              <>
                <ZoomIn className="size-3.5 text-primary shrink-0" />
                <span>{bi('تكبير للقراءة', 'Zoom In', 'گەورەکردن')}</span>
              </>
            ) : (
              <>
                <ZoomOut className="size-3.5 text-primary shrink-0" />
                <span>{bi('صفحة A4 مصغّرة', 'Mini A4 View', 'بینینی بچووکی A4')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
