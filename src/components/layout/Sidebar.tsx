// =======================================================================
// PhysioRecord — Desktop Collapsible Clinical Rail (Linear / Cal.com Paradigm)
// - Fixed-in-flex right-docked rail in RTL (left-docked in LTR) — never pushes/clips canvas.
// - Smoothly collapses (68px icon rail) <-> expands (224px labeled rail), persisted locally.
// - Houses only 4 core destinations (+ conditional HEP/Analytics when enabled),
//   permanent Cmd/Ctrl+K Search, unified "+" Quick Add, and one compact Account Menu.
// - Auto-hides cleanly during In-Session Focus Mode.
// =======================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  MonitorCheck,
  Calendar,
  CalendarClock,
  Wallet,
  Dumbbell,
  BarChart3,
  Search,
  Plus,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ChevronsUpDown,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { usePatients } from '../../context/PatientContext';
import type { PatientRecord } from '../../types/clinical';
import type { ClinicRoleId, ClinicStaffMember } from '../../types/clinicManagement';
import { Num, DemoBadge } from '../ui/Primitives';
import { BrandLogo } from '../ui/BrandLogo';
import { QuickAddMenu } from './QuickAddMenu';
import { AccountMenuPopover } from './AccountMenuPopover';

export type ClinicNavTab =
  | 'today'
  | 'reception'
  | 'directory'
  | 'schedule'
  | 'finance'
  | 'exercises'
  | 'analytics'
  | 'activity_log';

const RAIL_EXPANDED_STORAGE_KEY = 'physiorecord_rail_expanded_v1';

function getInitialRailExpanded(): boolean {
  try {
    const saved = window.localStorage.getItem(RAIL_EXPANDED_STORAGE_KEY);
    if (saved === '1') return true;
    if (saved === '0') return false;
  } catch {
    // ignore storage errors
  }
  return typeof window !== 'undefined' ? window.innerWidth >= 1100 : true;
}

export interface SidebarProps {
  isFocusMode?: boolean;
  activeNav: ClinicNavTab;
  onSelectNav: (nav: ClinicNavTab) => void;
  selectedPatient: PatientRecord | null;
  onSelectPatient: (patient: PatientRecord | null) => void;
  showExerciseLibrary?: boolean;
  showAnalyticsModule?: boolean;
  isSoloMode?: boolean;
  onOpenGlobalSearch: () => void;
  onNewPatient: () => void;
  onBookAppointment: () => void;
  onNewInvoice: () => void;
  onOpenSettings: () => void;
  onOpenBackup: () => void;
  onOpenDemoModal?: () => void;
  onSwitchWorkspaceMode?: (mode: 'solo' | 'team') => void;
  onOpenTour?: () => void;
  onOpenPrivacyCover: () => void;
  onLockVault: () => void;
  onOpenKiosk?: () => void;
  enableKioskModule?: boolean;
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
  activeRole?: ClinicRoleId;
  staffRoster?: ClinicStaffMember[];
  onSwitchRole?: (role: ClinicRoleId) => void;
  userMenuRoleLabel: string;
  formattedLastBackup?: string;
  isBackupOverdue?: boolean;
  hasDemoRecords?: boolean;
}

interface NavItem {
  id: ClinicNavTab;
  icon: React.FC<{ className?: string }>;
  labelAr: string;
  labelEn: string;
  labelCkb?: string;
  badge?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isFocusMode = false,
  activeNav,
  onSelectNav,
  selectedPatient,
  onSelectPatient,
  showExerciseLibrary = false,
  showAnalyticsModule = false,
  isSoloMode = false,
  onOpenGlobalSearch,
  onNewPatient,
  onBookAppointment,
  onNewInvoice,
  onOpenSettings,
  onOpenBackup,
  onOpenDemoModal,
  onSwitchWorkspaceMode,
  onOpenTour,
  onOpenPrivacyCover,
  onLockVault,
  onOpenKiosk,
  enableKioskModule = false,
  canInstallPwa = false,
  onInstallPwa,
  activeRole = 'admin',
  staffRoster = [],
  onSwitchRole,
  userMenuRoleLabel,
  formattedLastBackup,
  isBackupOverdue = false,
  hasDemoRecords = false,
}) => {
  const { t, bi, isRtl } = useLanguage();
  const { patients } = usePatients();

  const [isExpanded, setIsExpanded] = useState<boolean>(getInitialRailExpanded);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const quickAddBtnRef = useRef<HTMLButtonElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_EXPANDED_STORAGE_KEY, isExpanded ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [isExpanded]);

  useEffect(() => {
    if (isFocusMode) {
      setIsQuickAddOpen(false);
      setIsAccountMenuOpen(false);
    }
  }, [isFocusMode]);

  if (isFocusMode) {
    return null;
  }

  const activePatients = patients.filter((p) => !p.isArchived);

  const coreNavItems: NavItem[] = [
    isSoloMode
      ? {
          id: 'today',
          icon: CalendarClock,
          labelAr: 'اليوم',
          labelEn: 'Today',
          labelCkb: t('navToday'),
        }
      : {
          id: 'reception',
          icon: MonitorCheck,
          labelAr: 'الاستقبال',
          labelEn: 'Reception',
          labelCkb: t('navReception'),
        },
    {
      id: 'schedule',
      icon: Calendar,
      labelAr: 'المواعيد',
      labelEn: 'Schedule',
      labelCkb: t('navSchedule'),
    },
    {
      id: 'directory',
      icon: Users,
      labelAr: 'المرضى',
      labelEn: 'Patients',
      labelCkb: t('navPatients'),
      badge: activePatients.length,
    },
    {
      id: 'finance',
      icon: Wallet,
      labelAr: 'الحسابات',
      labelEn: 'Finance',
      labelCkb: t('navFinance'),
    },
    ...(showExerciseLibrary
      ? [
          {
            id: 'exercises' as ClinicNavTab,
            icon: Dumbbell,
            labelAr: 'التمارين (HEP)',
            labelEn: 'Exercises (HEP)',
            labelCkb: t('navHep'),
          },
        ]
      : []),
    ...(showAnalyticsModule
      ? [
          {
            id: 'analytics' as ClinicNavTab,
            icon: BarChart3,
            labelAr: t('analytics.nav'),
            labelEn: t('analytics.nav'),
            labelCkb: t('analytics.nav'),
          },
        ]
      : []),
  ];

  const CollapseIcon = isRtl
    ? isExpanded
      ? PanelRightClose
      : PanelRightOpen
    : isExpanded
      ? PanelLeftClose
      : PanelLeftOpen;

  const hasAttentionDot = isBackupOverdue || hasDemoRecords;

  return (
    <aside
      data-testid="desktop-rail"
      data-expanded={isExpanded ? 'true' : 'false'}
      aria-label={bi('التنقل الرئيسي للعيادة', 'Main Clinic Navigation', 'گەڕانی سەرەکی کلینیک')}
      className={`hidden md:flex flex-col shrink-0 h-dvh select-none z-30 border-e border-line-2/70 bg-card/85 backdrop-blur-md transition-[width] duration-200 ease-out relative ${
        isExpanded ? 'w-[224px]' : 'w-[68px]'
      }`}
    >
      {/* 1. Top Brand + Collapse Toggle */}
      <div
        className={`shrink-0 pt-3.5 pb-2.5 flex items-center ${
          isExpanded ? 'justify-between px-3 gap-2' : 'flex-col gap-2 px-2'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="pr-brand-mark">
            <BrandLogo className="size-8" />
          </div>
          {isExpanded && (
            <div className="min-w-0">
              <div className="text-sm font-extrabold tracking-tight text-foreground truncate leading-tight">
                PhysioRecord
              </div>
              <div className="text-xs text-muted-foreground-1 font-medium truncate">
                {bi('سجل مشفر', 'Encrypted EHR', 'تۆماری کۆدکراو')}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          data-testid="sidebar-collapse-btn"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-label={
            isExpanded
              ? bi('طي القائمة الجانبية', 'Collapse rail', 'کۆکردنەوەی لیست')
              : bi('توسيع القائمة الجانبية', 'Expand rail', 'فراوانکردنی لیست')
          }
          title={
            isExpanded
              ? bi('طي القائمة الجانبية', 'Collapse rail', 'کۆکردنەوەی لیست')
              : bi('توسيع القائمة الجانبية', 'Expand rail', 'فراوانکردنی لیست')
          }
          className="size-9 rounded-xl text-muted-foreground-1 hover:text-foreground hover:bg-surface inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
        >
          <CollapseIcon className="size-4" />
        </button>
      </div>

      {/* 2. Permanent Global Search (Cmd+K) & Unified "+" Quick Add */}
      <div className={`shrink-0 space-y-2 pb-3 border-b border-card-divider/60 ${isExpanded ? 'px-3' : 'px-2'}`}>
        <button
          type="button"
          data-testid="rail-search-btn"
          onClick={onOpenGlobalSearch}
          aria-label={bi('بحث شامل أو أمر (Ctrl+K)', 'Search or Command (Ctrl+K)', 'گەڕانی خێرا (Ctrl+K)')}
          title={bi('بحث وأوامر (Ctrl+K)', 'Search & Commands (Ctrl+K)', 'گەڕان و فەرمانەکان (Ctrl+K)')}
          className={`w-full min-h-[38px] rounded-xl bg-surface/90 hover:bg-surface border border-line-2/60 text-muted-foreground-1 hover:text-foreground text-xs font-semibold flex items-center transition-colors cursor-pointer ${
            isExpanded ? 'px-2.5 gap-2 justify-between' : 'justify-center px-0'
          }`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Search className="size-4 text-primary shrink-0" />
            {isExpanded && (
              <span className="truncate">{bi('بحث سريع...', 'Search...', 'گەڕان...')}</span>
            )}
          </span>
          {isExpanded && (
            <kbd
              dir="ltr"
              className="px-1.5 py-0.5 rounded-md bg-card border border-line-2/70 text-[10px] font-mono text-muted-foreground-1 shrink-0"
            >
              ⌘K
            </kbd>
          )}
        </button>

        <div className="relative">
          <button
            ref={quickAddBtnRef}
            type="button"
            data-testid="rail-quick-add-btn"
            aria-haspopup="menu"
            aria-expanded={isQuickAddOpen}
            onClick={() => {
              setIsAccountMenuOpen(false);
              setIsQuickAddOpen((prev) => !prev);
            }}
            aria-label={bi('إضافة سريعة', 'Quick Add', 'زیادکردنی خێرا')}
            title={bi('إضافة سريعة (مريض · موعد · فاتورة)', 'Quick Add (Patient · Appointment · Invoice)')}
            className={`w-full min-h-[38px] rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer ${
              isExpanded ? 'px-3' : 'px-0'
            }`}
          >
            <Plus className="size-4 shrink-0" />
            {isExpanded && (
              <span className="truncate">{bi('إضافة سريعة', 'Quick Add', 'زیادکردنی خێرا')}</span>
            )}
          </button>

          <QuickAddMenu
            isOpen={isQuickAddOpen}
            onClose={() => setIsQuickAddOpen(false)}
            anchorSide="rail"
            triggerRef={quickAddBtnRef}
            onNewPatient={onNewPatient}
            onBookAppointment={onBookAppointment}
            onNewInvoice={onNewInvoice}
          />
        </div>
      </div>

      {/* 3. Core Clinical Destinations */}
      <nav
        aria-label={bi('الأقسام الأساسية', 'Primary Clinical Navigation', 'بەشە سەرەکییەکان')}
        className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-3 space-y-1.5 ${
          isExpanded ? 'px-2.5' : 'px-2'
        }`}
      >
        {coreNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            selectedPatient !== null ? item.id === 'directory' : activeNav === item.id;
          const label = bi(item.labelAr, item.labelEn, item.labelCkb);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectPatient(null);
                onSelectNav(item.id);
              }}
              data-active={isActive}
              data-nav-id={item.id}
              aria-label={label}
              title={label}
              aria-current={isActive ? 'page' : undefined}
              className={`pr-nav-item relative ${
                isExpanded
                  ? 'justify-start px-3 gap-2.5'
                  : 'justify-center px-0 min-h-[44px]'
              }`}
            >
              <Icon
                className={`size-[1.15rem] shrink-0 ${
                  isActive ? 'text-primary' : 'text-muted-foreground-1'
                }`}
              />
              {isExpanded && <span className="truncate flex-1 text-start">{label}</span>}
              {isExpanded && item.badge !== undefined && (
                <span
                  className={`min-w-[1.375rem] px-1.5 py-0.5 text-xs rounded-full font-bold text-center tabular-nums ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface text-muted-foreground-1'
                  }`}
                >
                  <Num value={item.badge} />
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 4. Compact Account & Clinic Utility Popover Trigger */}
      <div className={`relative shrink-0 border-t border-card-divider/70 ${isExpanded ? 'p-2.5' : 'p-2'}`}>
        <button
          ref={accountBtnRef}
          type="button"
          data-testid="rail-account-btn"
          aria-haspopup="dialog"
          aria-expanded={isAccountMenuOpen}
          onClick={() => {
            setIsQuickAddOpen(false);
            setIsAccountMenuOpen((prev) => !prev);
          }}
          aria-label={bi('قائمة العيادة والإعدادات', 'Clinic & Account Menu', 'مێنووی کلینیک و هەژمار')}
          title={bi('قائمة العيادة والإعدادات', 'Clinic & Account Menu', 'مێنووی کلینیک و هەژمار')}
          className={`w-full min-h-[44px] rounded-xl hover:bg-surface/90 text-foreground transition-colors flex items-center cursor-pointer ${
            isExpanded ? 'px-2 py-1.5 justify-between gap-2' : 'justify-center px-0'
          }`}
        >
          <span className="relative inline-flex items-center gap-2.5 min-w-0">
            <span className="relative size-8 rounded-full bg-primary/12 text-primary inline-flex items-center justify-center shrink-0">
              <User className="size-4" />
              <span
                aria-hidden="true"
                className={`absolute -top-0.5 -end-0.5 size-2.5 rounded-full ring-2 ring-card ${
                  hasAttentionDot ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </span>
            {isExpanded && (
              <span className="min-w-0 text-start">
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-foreground truncate">
                  <span className="truncate">{userMenuRoleLabel}</span>
                  {hasDemoRecords && <DemoBadge />}
                </span>
                <span className="block text-xs text-muted-foreground-1 truncate">
                  {isBackupOverdue
                    ? bi('يتطلب نسخ احتياطي', 'Backup recommended', 'پاشەکەوت پێویستە')
                    : bi('الإعدادات والقفل', 'Settings & Lock', 'ڕێکخستن و قوفڵ')}
                </span>
              </span>
            )}
          </span>
          {isExpanded && <ChevronsUpDown className="size-3.5 text-muted-foreground-1 shrink-0" />}
        </button>

        <AccountMenuPopover
          isOpen={isAccountMenuOpen}
          onClose={() => setIsAccountMenuOpen(false)}
          placement="rail"
          triggerRef={accountBtnRef}
          userMenuRoleLabel={userMenuRoleLabel}
          isSoloMode={isSoloMode}
          activeRole={activeRole}
          staffRoster={staffRoster}
          onSwitchRole={onSwitchRole}
          onSwitchWorkspaceMode={onSwitchWorkspaceMode}
          formattedLastBackup={formattedLastBackup}
          isBackupOverdue={isBackupOverdue}
          hasDemoRecords={hasDemoRecords}
          onOpenBackup={onOpenBackup}
          onOpenDemoModal={onOpenDemoModal}
          onOpenPrivacyCover={onOpenPrivacyCover}
          onOpenSettings={onOpenSettings}
          onOpenTour={onOpenTour}
          onOpenKiosk={onOpenKiosk}
          enableKioskModule={enableKioskModule}
          canInstallPwa={canInstallPwa}
          onInstallPwa={onInstallPwa}
          showExerciseLibrary={showExerciseLibrary}
          showAnalyticsModule={showAnalyticsModule}
          onSelectSecondaryNav={(nav) => {
            onSelectPatient(null);
            onSelectNav(nav);
          }}
          onLockVault={onLockVault}
        />
      </div>
    </aside>
  );
};
