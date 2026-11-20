import { useLayoutEffect, type RefObject } from 'react';

export interface HorizontalBounds {
  left: number;
  right: number;
}

/**
 * Computes a horizontal CSS pixel translation (`translateX`) that keeps an
 * absolutely-positioned dropdown/popover menu inside `[margin, viewportWidth - margin]`
 * regardless of LTR/RTL inline anchoring (`start-0` / `end-0`).
 */
export function computeHorizontalViewportShift(
  rect: HorizontalBounds,
  viewportWidth: number,
  margin = 8
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= margin * 2) {
    return 0;
  }

  const maxRight = viewportWidth - margin;
  const minLeft = margin;

  // Already exceeds viewport on both edges — center within margin bounds
  if (rect.left < minLeft && rect.right > maxRight) {
    return 0;
  }

  if (rect.right > maxRight) {
    const shiftLeft = maxRight - rect.right; // negative
    const clampedShift = Math.max(shiftLeft, minLeft - rect.left);
    return Math.round(clampedShift);
  }

  if (rect.left < minLeft) {
    const shiftRight = minLeft - rect.left; // positive
    const clampedShift = Math.min(shiftRight, maxRight - rect.right);
    return Math.round(clampedShift);
  }

  return 0;
}

/**
 * Clamps a floating dropdown/popover horizontally inside the browser viewport
 * whenever it opens or the window resizes.
 */
export function useViewportClampedMenu<T extends HTMLElement>(
  isOpen: boolean,
  menuRef: RefObject<T | null>,
  margin = 8
): void {
  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = menuRef.current;
    if (!el || typeof window === 'undefined') return;

    const applyClamp = () => {
      el.style.maxWidth = `calc(100vw - ${margin * 2}px)`;
      el.style.translate = '0px 0px';
      const rect = el.getBoundingClientRect();
      const shift = computeHorizontalViewportShift(rect, window.innerWidth, margin);
      if (shift !== 0) {
        el.style.translate = `${shift}px 0px`;
      }
    };

    applyClamp();
    window.addEventListener('resize', applyClamp);
    return () => {
      window.removeEventListener('resize', applyClamp);
      if (el) {
        el.style.translate = '';
        el.style.maxWidth = '';
      }
    };
  }, [isOpen, menuRef, margin]);
}
