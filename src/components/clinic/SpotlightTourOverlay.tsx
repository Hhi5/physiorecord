// =======================================================================
// PhysioRecord — Zero-Dependency Calm Spotlight Tour Overlay
// - Supports both Single-Page First-Visit Tours & 5-Stage Full-App Walkthrough
// - Device-aware: resolves Desktop/Laptop vs Mobile/Phone selectors & copy
// - Retries gracefully while lazy views mount during cross-page walkthroughs
// - Responsive: smart auto-positioned popover on desktop, non-overlapping
//   bottom/top docked card on mobile (never covers the highlighted button)
// - Non-trapping visual backdrop, Escape/Arrow keyboard navigation, RTL-aware
// =======================================================================

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Compass,
  BookOpen,
  Lightbulb,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
  resolveStepForDevice,
  type PageTourDef,
  type ResolvedStepContent,
  type SpotlightStepDef,
} from '../../utils/pageSpotlightTours';

export interface FullWalkthroughOverlayMeta {
  stageIndex: number;
  totalStages: number;
  stageTitleAr: string;
  stageTitleEn: string;
  stageTitleCkb: string;
  hasPrevStage: boolean;
  hasNextStage: boolean;
  onPrevStage: () => void;
  onNextStage: () => void;
}

export interface SpotlightTourOverlayProps {
  tour: PageTourDef | null;
  walkthroughMeta?: FullWalkthroughOverlayMeta | null;
  onClose: (wasDisplayed?: boolean) => void;
  onDisableAutoTours: () => void;
  onOpenFullGuide?: () => void;
  onStepChange?: (step: SpotlightStepDef) => void;
}

interface ResolvedStep {
  step: SpotlightStepDef;
  content: ResolvedStepContent;
  element: HTMLElement;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 6;
const CARD_MAX_W = 368;
const VIEWPORT_MARGIN = 14;

function isElementVisible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function resolveAvailableSteps(tour: PageTourDef, isMobile: boolean): ResolvedStep[] {
  const resolved: ResolvedStep[] = [];
  for (const step of tour.steps) {
    const content = resolveStepForDevice(step, isMobile);
    let matched: HTMLElement | null = null;
    for (const selector of content.selectors) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (isElementVisible(candidate)) {
          matched = candidate;
          break;
        }
      }
      if (matched) break;
    }
    if (matched) {
      resolved.push({ step, content, element: matched });
    }
  }
  return resolved;
}

export const SpotlightTourOverlay: React.FC<SpotlightTourOverlayProps> = ({
  tour,
  walkthroughMeta = null,
  onClose,
  onDisableAutoTours,
  onOpenFullGuide,
  onStepChange,
}) => {
  const { bi, isRtl } = useLanguage();
  const [resolvedSteps, setResolvedSteps] = useState<ResolvedStep[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1024,
    h: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));
  const cardRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const onStepChangeRef = useRef(onStepChange);
  const walkthroughMetaRef = useRef(walkthroughMeta);
  const didDisplayRef = useRef(false);

  onCloseRef.current = onClose;
  onStepChangeRef.current = onStepChange;
  walkthroughMetaRef.current = walkthroughMeta;

  const isMobile = viewport.w < 768;

  // Keep viewport breakpoint synced on resize so mobile/desktop copy & selectors stay accurate
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Resolve matching visible DOM targets whenever tour ID or device breakpoint changes.
  // Uses a generous retry window (~4.8s) so lazy-loaded views (like PatientWorkspace / MasterPatientChart)
  // finish chunk loading & IndexedDB decryption cleanly without aborting the tour.
  const tourId = tour?.id ?? null;
  useEffect(() => {
    didDisplayRef.current = false;
    if (!tour) {
      setResolvedSteps([]);
      setStepIdx(0);
      setRect(null);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;
    let retryTimer: number | null = null;

    const attemptResolve = () => {
      if (cancelled) return;
      const found = resolveAvailableSteps(tour, isMobile);
      if (found.length > 0) {
        didDisplayRef.current = true;
        setResolvedSteps(found);
        setStepIdx(0);
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        retryTimer = window.setTimeout(attemptResolve, 120);
      } else {
        // Never mark a tour as "seen" when its view failed to mount targets in time
        onCloseRef.current(false);
      }
    };

    attemptResolve();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
    // Intentionally keyed on tourId & isMobile (callbacks stabilized via refs so parent re-renders never reset stepIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, isMobile]);

  const activeEntry = resolvedSteps[stepIdx] ?? null;
  const activeStepId = activeEntry?.step.id ?? null;

  // Notify host when active step changes (e.g. auto-switching Patient Chart or Settings tabs live)
  useEffect(() => {
    if (!activeEntry) return;
    onStepChangeRef.current?.(activeEntry.step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStepId, tourId]);

  const measureTarget = useCallback(() => {
    if (!activeEntry) return;
    const { element } = activeEntry;
    if (!document.body.contains(element) || !isElementVisible(element)) {
      if (tour) {
        const refreshed = resolveAvailableSteps(tour, isMobile);
        if (refreshed.length === 0) {
          onCloseRef.current(didDisplayRef.current);
          return;
        }
        setResolvedSteps(refreshed);
        setStepIdx((prev) => Math.min(prev, refreshed.length - 1));
      }
      return;
    }

    const r = element.getBoundingClientRect();
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    setRect({
      top: Math.max(0, r.top - PADDING),
      left: Math.max(0, r.left - PADDING),
      width: Math.min(window.innerWidth, r.width + PADDING * 2),
      height: Math.min(window.innerHeight, r.height + PADDING * 2),
    });
  }, [activeEntry, tour, isMobile]);

  // Smoothly scroll highlighted target into view and track geometry
  useEffect(() => {
    if (!activeEntry) return;
    try {
      activeEntry.element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    } catch {
      // ignore unsupported scrollIntoView options
    }

    let rafId = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measureTarget);
    };

    measureTarget();
    const settleTimer = window.setTimeout(measureTarget, 260);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
    };
  }, [activeEntry, measureTarget]);

  const handleNext = useCallback(() => {
    if (stepIdx < resolvedSteps.length - 1) {
      setStepIdx((i) => i + 1);
    } else if (walkthroughMetaRef.current?.hasNextStage) {
      walkthroughMetaRef.current.onNextStage();
    } else {
      onCloseRef.current(true);
    }
  }, [stepIdx, resolvedSteps.length]);

  const handlePrev = useCallback(() => {
    if (stepIdx > 0) {
      setStepIdx((i) => i - 1);
    } else if (walkthroughMetaRef.current?.hasPrevStage) {
      walkthroughMetaRef.current.onPrevStage();
    }
  }, [stepIdx]);

  // Keyboard shortcuts: Escape closes, Left/Right steps (RTL-aware)
  useEffect(() => {
    if (!tour || !activeEntry) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current(true);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (isRtl) handlePrev();
        else handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isRtl) handleNext();
        else handlePrev();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [tour, activeEntry, isRtl, handleNext, handlePrev]);

  if (!tour || !activeEntry || !rect || typeof document === 'undefined') {
    return null;
  }

  const isLastStepInPage = stepIdx === resolvedSteps.length - 1;
  const isFinalOverall = isLastStepInPage && !walkthroughMeta?.hasNextStage;
  const canGoBack = stepIdx > 0 || Boolean(walkthroughMeta?.hasPrevStage);
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  const { content } = activeEntry;
  const tipText =
    content.tipAr || content.tipEn || content.tipCkb
      ? bi(content.tipAr ?? '', content.tipEn ?? content.tipAr ?? '', content.tipCkb)
      : '';

  // Compute calm, guaranteed-in-viewport card placement
  const computeCardStyle = (): React.CSSProperties => {
    if (isMobile) {
      const targetCenterY = rect.top + rect.height / 2;
      const placeAtTop = targetCenterY > viewport.h * 0.5;
      return placeAtTop
        ? {
            top: 'max(12px, env(safe-area-inset-top, 12px))',
            left: VIEWPORT_MARGIN,
            right: VIEWPORT_MARGIN,
          }
        : {
            bottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
            left: VIEWPORT_MARGIN,
            right: VIEWPORT_MARGIN,
          };
    }

    const cardWidth = Math.min(CARD_MAX_W, viewport.w - VIEWPORT_MARGIN * 2);
    const estimatedCardHeight = cardRef.current?.offsetHeight || 248;
    const gap = 14;

    const spaceBelow = viewport.h - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const spaceRight = viewport.w - (rect.left + rect.width);
    const spaceLeft = rect.left;

    // For tall vertical elements (like the desktop side rail), place neatly beside it
    if (rect.height > viewport.h * 0.55) {
      const preferredLeft =
        spaceLeft >= cardWidth + gap + VIEWPORT_MARGIN
          ? rect.left - cardWidth - gap
          : spaceRight >= cardWidth + gap + VIEWPORT_MARGIN
            ? rect.left + rect.width + gap
            : Math.max(VIEWPORT_MARGIN, (viewport.w - cardWidth) / 2);
      const top = Math.max(
        VIEWPORT_MARGIN,
        Math.min(viewport.h - estimatedCardHeight - VIEWPORT_MARGIN, 88)
      );
      return {
        top,
        left: Math.max(VIEWPORT_MARGIN, Math.min(viewport.w - cardWidth - VIEWPORT_MARGIN, preferredLeft)),
        width: cardWidth,
      };
    }

    let top: number;
    if (spaceBelow >= estimatedCardHeight + gap) {
      top = rect.top + rect.height + gap;
    } else if (spaceAbove >= estimatedCardHeight + gap) {
      top = Math.max(VIEWPORT_MARGIN, rect.top - estimatedCardHeight - gap);
    } else {
      top = Math.max(
        VIEWPORT_MARGIN,
        Math.min(viewport.h - estimatedCardHeight - VIEWPORT_MARGIN, rect.top + rect.height + gap)
      );
    }

    // Align horizontally to target center (clamped to viewport)
    const targetCenterX = rect.left + rect.width / 2;
    let left = targetCenterX - cardWidth / 2;
    left = Math.max(VIEWPORT_MARGIN, Math.min(viewport.w - cardWidth - VIEWPORT_MARGIN, left));

    return {
      top,
      left,
      width: cardWidth,
    };
  };

  const maskId = `pr-spotlight-mask-${tour.id}`;

  return createPortal(
    <div
      data-testid="spotlight-tour-overlay"
      data-tour-page={tour.id}
      data-tour-device={isMobile ? 'mobile' : 'desktop'}
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[95] pointer-events-none"
      role="region"
      aria-label={bi(
        `جولة إرشادية: ${tour.pageLabelAr}`,
        `Guided Tour: ${tour.pageLabelEn}`,
        `گەشتی ڕێنوێنی: ${tour.pageLabelCkb}`
      )}
    >
      {/* Smooth SVG Spotlight Cutout Dimmer (non-trapping so user is never locked out) */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none"
        width={viewport.w}
        height={viewport.h}
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width={viewport.w} height={viewport.h} fill="white" />
            <rect
              x={rect.left}
              y={rect.top}
              width={rect.width}
              height={rect.height}
              rx={14}
              ry={14}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={viewport.w}
          height={viewport.h}
          fill="rgba(15, 23, 42, 0.54)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* Crisp Glowing Focus Ring Around Target Element */}
      <div
        aria-hidden="true"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
        className="fixed rounded-[14px] border-2 border-primary shadow-[0_0_0_4px_rgba(13,148,136,0.22)] transition-all duration-200 ease-out pointer-events-none"
      />

      {/* Calm Floating Explanation Card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        data-testid="spotlight-tour-card"
        style={computeCardStyle()}
        className="fixed pointer-events-auto rounded-2xl bg-card border border-line-2/90 shadow-2xl p-4 space-y-3 text-xs transition-all duration-200 ease-out max-h-[min(78dvh,420px)] overflow-y-auto"
      >
        {/* Top Row: Tour Context + Quiet Device Mode Metadata + Close */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Compass className="size-3.5 text-primary shrink-0" />
              <span className="font-extrabold text-primary truncate">
                {walkthroughMeta
                  ? bi(
                      `الجولة الشاملة · القسم ${walkthroughMeta.stageIndex + 1} من ${walkthroughMeta.totalStages}`,
                      `Full Tour · Section ${walkthroughMeta.stageIndex + 1} of ${walkthroughMeta.totalStages}`,
                      `گەشتی گشتی · بەشی ${walkthroughMeta.stageIndex + 1} لە ${walkthroughMeta.totalStages}`
                    )
                  : bi(tour.pageLabelAr, tour.pageLabelEn, tour.pageLabelCkb)}
              </span>
              <span aria-hidden="true" className="text-muted-foreground-2">
                ·
              </span>
              <span className="font-semibold text-muted-foreground-2 tabular-nums shrink-0">
                {stepIdx + 1}/{resolvedSteps.length}
              </span>
            </div>

            {walkthroughMeta && (
              <div className="text-xs text-muted-foreground-1 font-semibold truncate">
                {bi(
                  walkthroughMeta.stageTitleAr,
                  walkthroughMeta.stageTitleEn,
                  walkthroughMeta.stageTitleCkb
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            data-testid="spotlight-close-btn"
            onClick={() => onCloseRef.current(true)}
            aria-label={bi('إغلاق الجولة', 'Close tour', 'داخستنی گەشت')}
            className="size-8 rounded-lg text-muted-foreground-1 hover:text-foreground hover:bg-surface inline-flex items-center justify-center cursor-pointer shrink-0 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Title & Thorough Explanation */}
        <div className="space-y-1.5">
          <h3 className="text-sm font-extrabold text-foreground leading-snug">
            {bi(content.titleAr, content.titleEn, content.titleCkb)}
          </h3>
          <p className="text-xs text-muted-foreground-1 leading-relaxed">
            {bi(content.bodyAr, content.bodyEn, content.bodyCkb)}
          </p>
        </div>

        {/* Optional Practical Clinic Tip */}
        {tipText && (
          <div className="px-3 py-2 rounded-xl bg-surface/80 border border-line-2/70 flex items-start gap-2 text-xs text-foreground/90 leading-relaxed">
            <Lightbulb className="size-3.5 text-primary shrink-0 mt-0.5" />
            <span>{tipText}</span>
          </div>
        )}

        {/* Progress Bars */}
        <div className="flex items-center gap-1" aria-hidden="true">
          {resolvedSteps.map((s, idx) => (
            <span
              key={s.step.id}
              className={`h-1 flex-1 rounded-full transition-colors ${
                idx <= stepIdx ? 'bg-primary' : 'bg-surface'
              }`}
            />
          ))}
        </div>

        {/* Primary Controls */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <button
            type="button"
            data-testid="spotlight-skip-btn"
            onClick={() => onCloseRef.current(true)}
            className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-muted-foreground-1 hover:text-foreground hover:bg-surface text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap"
          >
            {walkthroughMeta
              ? bi('إنهاء الجولة', 'Exit tour', 'کۆتاییهێنان')
              : bi('تخطّي', 'Skip', 'تێپەڕاندن')}
          </button>

          <div className="flex items-center gap-1.5">
            {canGoBack && (
              <button
                type="button"
                data-testid="spotlight-prev-btn"
                onClick={handlePrev}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-surface hover:bg-layer-hover text-foreground text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
              >
                <PrevIcon className="size-3.5" />
                <span>{bi('السابق', 'Back', 'پێشوو')}</span>
              </button>
            )}
            <button
              type="button"
              data-testid="spotlight-next-btn"
              onClick={handleNext}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer shadow-xs transition-colors whitespace-nowrap"
            >
              {isFinalOverall ? (
                <>
                  <Check className="size-3.5" />
                  <span>
                    {walkthroughMeta
                      ? bi('إنهاء والبدء بالعمل', 'Finish & Start', 'تەواوکردن و دەستپێکردن')
                      : bi('فهمت', 'Got it', 'تێگەیشتم')}
                  </span>
                </>
              ) : isLastStepInPage && walkthroughMeta?.hasNextStage ? (
                <>
                  <span>{bi('القسم التالي', 'Next Section', 'بەشی دواتر')}</span>
                  <NextIcon className="size-3.5" />
                </>
              ) : (
                <>
                  <span>{bi('التالي', 'Next', 'دواتر')}</span>
                  <NextIcon className="size-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quiet Secondary Footer Links (Disable Auto-Tours / Full Guide) */}
        <div className="pt-2 border-t border-card-divider/70 flex flex-wrap items-center justify-between gap-2 text-xs">
          <button
            type="button"
            data-testid="spotlight-disable-auto-btn"
            onClick={() => {
              onDisableAutoTours();
              onCloseRef.current(true);
            }}
            className="text-muted-foreground-2 hover:text-foreground underline-offset-2 hover:underline cursor-pointer"
          >
            {bi(
              'إيقاف الجولات التلقائية',
              'Disable auto-tours',
              'وەستاندنی گەشتە خۆکارەکان'
            )}
          </button>

          {onOpenFullGuide && (
            <button
              type="button"
              onClick={() => {
                onCloseRef.current(true);
                onOpenFullGuide();
              }}
              className="text-primary hover:underline font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <BookOpen className="size-3.5" />
              <span>{bi('الدليل الكامل', 'Full Guide', 'ڕێبەری تەواو')}</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
