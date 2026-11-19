// =======================================================================
// PhysioRecord — Mobile Auto-Hiding Floating Pill Dock (< md / 768px)
// - Starts hidden behind a discreet bottom thumb trigger.
// - Tapping near the bottom handle reveals a centered, one-handed Floating Pill
//   (NOT edge-to-edge) with 4 core views + Search + Unified "+" Quick Add.
// - Automatically hides after ~4.5s of inactivity or tapping outside.
// =======================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CalendarClock,
  MonitorCheck,
  Calendar,
  Users,
  Wallet,
  Search,
  Plus,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { ClinicNavTab } from './Sidebar';
import { QuickAddMenu } from './QuickAddMenu';

const INACTIVITY_HIDE_MS = 4500;
const POST_NAV_HIDE_MS = 900;

export interface MobileFloatingDockProps {
  isHidden?: boolean;
  isSoloMode: boolean;
  activeNav: ClinicNavTab;
  hasAttentionDot?: boolean;
  onSelectNav: (nav: ClinicNavTab) => void;
  onOpenGlobalSearch: () => void;
  onNewPatient: () => void;
  onBookAppointment: () => void;
  onNewInvoice: () => void;
}

export const MobileFloatingDock: React.FC<MobileFloatingDockProps> = ({
  isHidden = false,
  isSoloMode,
  activeNav,
  hasAttentionDot = false,
  onSelectNav,
  onOpenGlobalSearch,
  onNewPatient,
  onBookAppointment,
  onNewInvoice,
}) => {
  const { bi, t } = useLanguage();
  const [isRevealed, setIsRevealed] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  const dockContainerRef = useRef<HTMLDivElement | null>(null);
  const quickAddBtnRef = useRef<HTMLButtonElement | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(
    (delayMs = INACTIVITY_HIDE_MS) => {
      clearHideTimer();
      hideTimerRef.current = setTimeout(() => {
        setIsQuickAddOpen(false);
        setIsRevealed(false);
        hideTimerRef.current = null;
      }, delayMs);
    },
    [clearHideTimer]
  );

  const revealDock = useCallback(() => {
    setIsRevealed(true);
    scheduleHide(INACTIVITY_HIDE_MS);
  }, [scheduleHide]);

  // Collapse immediately when hidden (Focus Mode, open dialogs, privacy cover)
  useEffect(() => {
    if (isHidden) {
      clearHideTimer();
      setIsQuickAddOpen(false);
      setIsRevealed(false);
    }
  }, [isHidden, clearHideTimer]);

  // Pause auto-hide while QuickAddMenu is open; resume when closed
  useEffect(() => {
    if (!isRevealed) {
      clearHideTimer();
      return;
    }
    if (isQuickAddOpen) {
      clearHideTimer();
    } else {
      scheduleHide(INACTIVITY_HIDE_MS);
    }
    return clearHideTimer;
  }, [isRevealed, isQuickAddOpen, clearHideTimer, scheduleHide]);

  // Tap anywhere outside the floating pill hides it immediately without blocking the target action
  useEffect(() => {
    if (!isRevealed) return;
    const handleOutsidePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (dockContainerRef.current?.contains(target)) return;
      clearHideTimer();
      setIsQuickAddOpen(false);
      setIsRevealed(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [isRevealed, clearHideTimer]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  if (isHidden) {
    return null;
  }

  const navButtons = [
    isSoloMode
      ? {
          id: 'today' as ClinicNavTab,
          icon: CalendarClock,
          label: bi('اليوم', 'Today', t('navToday')),
        }
      : {
          id: 'reception' as ClinicNavTab,
          icon: MonitorCheck,
          label: bi('الاستقبال', 'Reception', t('navReception')),
        },
    {
      id: 'schedule' as ClinicNavTab,
      icon: Calendar,
      label: bi('المواعيد', 'Schedule', t('navSchedule')),
    },
    {
      id: 'directory' as ClinicNavTab,
      icon: Users,
      label: bi('المرضى', 'Patients', t('navPatients')),
    },
    {
      id: 'finance' as ClinicNavTab,
      icon: Wallet,
      label: bi('الحسابات', 'Finance', t('navFinance')),
    },
  ];

  return (
    <div
      ref={dockContainerRef}
      className="md:hidden fixed bottom-[max(6px,env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-40 pointer-events-none flex flex-col items-center"
    >
      {!isRevealed ? (
        /* Resting Hidden State: generous 44px invisible thumb zone around a minimal handle pill */
        <button
          type="button"
          data-testid="mobile-dock-trigger"
          onClick={revealDock}
          aria-label={bi(
            'إظهار شريط التنقل السريع',
            'Show quick navigation pill',
            'پیشاندانی شریتی گەڕانی خێرا'
          )}
          className="pointer-events-auto min-w-[176px] min-h-[44px] px-6 pb-1 flex items-end justify-center bg-transparent border-0 cursor-pointer focus:outline-none"
        >
          <span className="px-3.5 py-1.5 rounded-full bg-card/85 backdrop-blur-md border border-line-2/80 shadow-md inline-flex items-center gap-2 transition-transform active:scale-95">
            <span className="w-10 h-1 rounded-full bg-foreground/35" aria-hidden="true" />
            {hasAttentionDot && (
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-amber-500 shrink-0"
              />
            )}
          </span>
        </button>
      ) : (
        /* Revealed Centered Floating Pill (compact, NOT full-bleed edge-to-edge) */
        <div className="relative pointer-events-auto">
          <QuickAddMenu
            isOpen={isQuickAddOpen}
            onClose={() => setIsQuickAddOpen(false)}
            anchorSide="pill"
            triggerRef={quickAddBtnRef}
            onUserInteraction={() => clearHideTimer()}
            onNewPatient={() => {
              clearHideTimer();
              setIsRevealed(false);
              onNewPatient();
            }}
            onBookAppointment={() => {
              clearHideTimer();
              setIsRevealed(false);
              onBookAppointment();
            }}
            onNewInvoice={() => {
              clearHideTimer();
              setIsRevealed(false);
              onNewInvoice();
            }}
          />

          <nav
            data-testid="mobile-floating-pill"
            aria-label={bi('شريط التنقل السريع', 'Quick Floating Navigation', 'گەڕانی خێرا')}
            onPointerDown={() => {
              if (!isQuickAddOpen) scheduleHide(INACTIVITY_HIDE_MS);
            }}
            onKeyDown={() => {
              if (!isQuickAddOpen) scheduleHide(INACTIVITY_HIDE_MS);
            }}
            className="mb-2 px-1.5 py-1.5 rounded-full bg-card border border-line-2 shadow-[0_14px_34px_-6px_rgba(15,23,42,0.28)] dark:shadow-[0_14px_36px_-6px_rgba(0,0,0,0.75)] flex items-center gap-1"
          >
            {navButtons.map((btn) => {
              const Icon = btn.icon;
              const isActive = activeNav === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  data-nav-id={btn.id}
                  data-active={isActive}
                  aria-label={btn.label}
                  title={btn.label}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setIsQuickAddOpen(false);
                    onSelectNav(btn.id);
                    scheduleHide(POST_NAV_HIDE_MS);
                  }}
                  className={`relative size-11 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-primary/14 text-primary font-bold'
                      : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                  }`}
                >
                  <Icon className={`size-[19px] ${isActive ? '-translate-y-0.5' : ''}`} />
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 size-1 rounded-full bg-primary"
                    />
                  )}
                </button>
              );
            })}

            <span className="h-5 w-px bg-line-2/80 mx-0.5 shrink-0" aria-hidden="true" />

            <button
              type="button"
              data-testid="mobile-pill-search-btn"
              aria-label={bi('بحث وأوامر', 'Search & Commands', 'گەڕان و فەرمانەکان')}
              title={bi('بحث وأوامر', 'Search & Commands', 'گەڕان و فەرمانەکان')}
              onClick={() => {
                clearHideTimer();
                setIsQuickAddOpen(false);
                setIsRevealed(false);
                onOpenGlobalSearch();
              }}
              className="size-11 rounded-full inline-flex items-center justify-center text-muted-foreground-1 hover:text-foreground hover:bg-surface transition-colors cursor-pointer shrink-0"
            >
              <Search className="size-5" />
            </button>

            <button
              ref={quickAddBtnRef}
              type="button"
              data-testid="mobile-pill-add-btn"
              aria-haspopup="menu"
              aria-expanded={isQuickAddOpen}
              aria-label={bi('إضافة سريعة', 'Quick Add', 'زیادکردنی خێرا')}
              title={bi('إضافة سريعة', 'Quick Add', 'زیادکردنی خێرا')}
              onClick={() => {
                setIsQuickAddOpen((prev) => !prev);
              }}
              className="size-11 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground shadow-md inline-flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0"
            >
              <Plus
                className={`size-5 transition-transform duration-150 ${
                  isQuickAddOpen ? 'rotate-45' : ''
                }`}
              />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
};
