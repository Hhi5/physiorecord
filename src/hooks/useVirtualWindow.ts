// =======================================================================
// PhysioRecord — Lightweight List / Grid Virtual Window Hook (Phase A3)
// Activates strictly above 100 rows (VIRTUALIZATION_THRESHOLD = 100) so
// large patient directories, ledgers, and session histories keep O(visible)
// DOM nodes on low-end clinics without altering small-list behavior.
// =======================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export const VIRTUALIZATION_THRESHOLD = 100;

export interface UseVirtualWindowOptions {
  totalCount: number;
  estimatedRowHeightPx: number;
  columns?: number;
  overscanRows?: number;
  threshold?: number;
  defaultViewportHeightPx?: number;
}

export interface VirtualWindowState {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isVirtualized: boolean;
  startIndex: number;
  endIndex: number;
  topSpacerPx: number;
  bottomSpacerPx: number;
  totalRows: number;
  onScroll: () => void;
}

export function computeVirtualWindowBounds(params: {
  totalCount: number;
  estimatedRowHeightPx: number;
  columns: number;
  overscanRows: number;
  scrollTop: number;
  viewportHeightPx: number;
  threshold: number;
}): Omit<VirtualWindowState, 'containerRef' | 'onScroll'> {
  const {
    totalCount,
    estimatedRowHeightPx,
    columns,
    overscanRows,
    scrollTop,
    viewportHeightPx,
    threshold,
  } = params;

  const safeCols = Math.max(1, Math.floor(columns));
  const safeRowHeight = Math.max(24, estimatedRowHeightPx);
  const totalRows = Math.ceil(totalCount / safeCols);

  if (totalCount <= threshold || totalCount <= 0) {
    return {
      isVirtualized: false,
      startIndex: 0,
      endIndex: totalCount,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      totalRows,
    };
  }

  const safeViewport = Math.max(safeRowHeight * 4, viewportHeightPx);
  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / safeRowHeight));
  const visibleRowCount = Math.max(1, Math.ceil(safeViewport / safeRowHeight));

  const startRow = Math.max(0, firstVisibleRow - overscanRows);
  const endRow = Math.min(totalRows, firstVisibleRow + visibleRowCount + overscanRows);

  const startIndex = Math.min(totalCount, startRow * safeCols);
  const endIndex = Math.min(totalCount, endRow * safeCols);

  return {
    isVirtualized: true,
    startIndex,
    endIndex,
    topSpacerPx: startRow * safeRowHeight,
    bottomSpacerPx: Math.max(0, (totalRows - endRow) * safeRowHeight),
    totalRows,
  };
}

export function useVirtualWindow({
  totalCount,
  estimatedRowHeightPx,
  columns = 1,
  overscanRows = 4,
  threshold = VIRTUALIZATION_THRESHOLD,
  defaultViewportHeightPx = 680,
}: UseVirtualWindowOptions): VirtualWindowState {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeightPx, setViewportHeightPx] = useState(defaultViewportHeightPx);

  const measureViewport = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.clientHeight > 0) {
      setViewportHeightPx(el.clientHeight);
    }
    setScrollTop(el.scrollTop || 0);
  }, []);

  useEffect(() => {
    measureViewport();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureViewport());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureViewport, totalCount, columns]);

  useEffect(() => {
    // Clamp scrollTop when filters shrink the list below previous offset
    if (containerRef.current && totalCount <= threshold) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [totalCount, threshold]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop || 0);
    if (el.clientHeight > 0 && el.clientHeight !== viewportHeightPx) {
      setViewportHeightPx(el.clientHeight);
    }
  }, [viewportHeightPx]);

  const bounds = computeVirtualWindowBounds({
    totalCount,
    estimatedRowHeightPx,
    columns,
    overscanRows,
    scrollTop,
    viewportHeightPx,
    threshold,
  });

  return {
    containerRef,
    ...bounds,
    onScroll,
  };
}
