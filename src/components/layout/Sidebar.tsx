// =======================================================================
// PhysioRecord — Clinical Sidebar Navigation (Modern App Shell v2)
// - Calm glass surface, grouped navigation, pill-shaped active state.
// - Collapses to a slim icon rail on patient pages, tablets and small laptops.
// - Navigation only; utilities live in the global search (Ctrl/Cmd+K) and user menu.
// =======================================================================

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { usePatients } from '../../context/PatientContext';
import type { PatientRecord } from '../../types/clinical';
import { Num } from '../ui/Primitives';
import {
  Activity,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  MonitorCheck,
  Calendar,
  CalendarClock,
  Wallet,
  Dumbbell,
  ShieldAlert,
  Settings,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';

export type ClinicNavTab =
  | 'today'
  | 'reception'
  | 'directory'
  | 'schedule'
  | 'finance'
  | 'exercises'
  | 'analytics'
  | 'activity_log';

interface SidebarProps {
  activeNav: ClinicNavTab;
  onSelectNav: (nav: ClinicNavTab) => void;
  selectedPatient: PatientRecord | null;
  onSelectPatient: (patient: PatientRecord | null) => void;
  showExerciseLibrary?: boolean;
  showAnalyticsModule?: boolean;
  isSoloMode?: boolean;
  onOpenSettings?: () => void;
  onNewPatient?: () => void;
  onOpenToolkit?: () => void;
  onOpenBackup?: () => void;
  onOpenSeedData?: () => void;
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
  activeNav,
  onSelectNav,
  selectedPatient,
  onSelectPatient,
  showExerciseLibrary = false,
  showAnalyticsModule = false,
  isSoloMode = false,
  onOpenSettings,
}) => {
  const { isRtl, t, bi } = useLanguage();
  const { patients } = usePatients();

  const [manualCollapsed, setManualCollapsed] = useState<boolean | null>(null);
  const [isNarrowScreen, setIsNarrowScreen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1100 : false
  );

  useEffect(() => {
    const handleResize = () => setIsNarrowScreen(window.innerWidth < 1100);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activePatients = patients.filter((p) => !p.isArchived);

  // Auto-collapse on patient pages and on compact tablet / small-laptop viewports (< 1100px)
  const isCollapsed =
    selectedPatient !== null || isNarrowScreen
      ? manualCollapsed ?? true
      : manualCollapsed ?? false;

  const soloNavItems: NavItem[] = [
    {
      id: 'today',
      icon: CalendarClock,
      labelAr: 'اليوم',
      labelEn: 'Today',
      labelCkb: t('navToday'),
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
      id: 'exercises',
      icon: Dumbbell,
      labelAr: 'التمارين (HEP)',
      labelEn: 'Exercise & HEP',
      labelCkb: t('navHep'),
    },
    {
      id: 'finance',
      icon: Wallet,
      labelAr: 'الحسابات',
      labelEn: 'Finance',
      labelCkb: t('navFinance'),
    },
    {
      id: 'analytics',
      icon: BarChart3,
      labelAr: t('analytics.nav'),
      labelEn: t('analytics.nav'),
      labelCkb: t('analytics.nav'),
    },
  ];

  const teamNavItems: NavItem[] = [
    {
      id: 'reception',
      icon: MonitorCheck,
      labelAr: 'الاستقبال والطابور',
      labelEn: 'Reception',
      labelCkb: t('navReception'),
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
      id: 'schedule',
      icon: Calendar,
      labelAr: 'المواعيد',
      labelEn: 'Schedule',
      labelCkb: t('navSchedule'),
    },
    {
      id: 'exercises',
      icon: Dumbbell,
      labelAr: 'التمارين (HEP)',
      labelEn: 'Exercise & HEP',
      labelCkb: t('navHep'),
    },
    {
      id: 'finance',
      icon: Wallet,
      labelAr: 'الحسابات',
      labelEn: 'Finance',
      labelCkb: t('navFinance'),
    },
    {
      id: 'analytics',
      icon: BarChart3,
      labelAr: t('analytics.nav'),
      labelEn: t('analytics.nav'),
      labelCkb: t('analytics.nav'),
    },
    {
      id: 'activity_log',
      icon: ShieldAlert,
      labelAr: 'سجل النشاط والكادر',
      labelEn: 'Audit & Staff Roles',
      labelCkb: t('navAudit'),
    },
  ];

  const navItems = (isSoloMode ? soloNavItems : teamNavItems).filter(
    (item) =>
      (item.id !== 'exercises' || showExerciseLibrary) &&
      (item.id !== 'analytics' || showAnalyticsModule)
  );

  const clinicalGroupIds: ClinicNavTab[] = ['today', 'reception', 'schedule', 'directory'];
  const operationsGroupIds: ClinicNavTab[] = ['exercises', 'finance', 'analytics', 'activity_log'];

  const groups: { labelAr: string; labelEn: string; ids: ClinicNavTab[] }[] = [
    { labelAr: 'العمل اليومي', labelEn: 'Daily work', ids: clinicalGroupIds },
    { labelAr: 'الإدارة', labelEn: 'Operations', ids: operationsGroupIds },
  ];

  const renderItem = (item: NavItem) => {
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
        aria-label={isCollapsed || item.badge === undefined ? label : undefined}
        aria-current={isActive ? 'page' : undefined}
        title={isCollapsed ? label : undefined}
        className={`pr-nav-item ${isCollapsed ? 'justify-center px-0' : ''} ${
          isActive ? '' : 'text-sidebar-nav-foreground'
        }`}
      >
        <Icon
          className={`size-[1.125rem] shrink-0 ${
            isActive ? 'text-primary' : 'text-muted-foreground-1'
          }`}
        />
        {!isCollapsed && (
          <>
            <span className="truncate flex-1 text-start">{label}</span>
            {item.badge !== undefined && (
              <span
                className={`min-w-[1.375rem] px-1.5 py-0.5 text-xs rounded-full font-bold text-center ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface text-muted-foreground-2 border border-line-2/50'
                }`}
              >
                <Num value={item.badge} />
              </span>
            )}
          </>
        )}
      </button>
    );
  };

  return (
    <aside
      aria-label={bi('القائمة الجانبية الرئيسية', 'Main Sidebar Navigation')}
      className={`${
        isCollapsed ? 'w-[76px]' : 'w-[248px] xl:w-[264px]'
      } pr-sidebar transition-[width] duration-200 ease-out flex flex-col h-screen sticky top-0 z-30 select-none shrink-0`}
    >
      {/* Brand block */}
      <div
        className={`h-16 shrink-0 flex items-center border-b border-sidebar-divider ${
          isCollapsed ? 'justify-center px-2' : 'justify-between px-3.5'
        }`}
      >
        <div className={`flex items-center gap-2.5 min-w-0 ${isCollapsed ? '' : ''}`}>
          <div className="pr-brand-mark">
            <Activity className="size-[1.15rem]" strokeWidth={2.4} />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="text-sm font-extrabold tracking-tight text-foreground truncate leading-tight">
                PhysioRecord
              </div>
              <div className="text-xs text-muted-foreground-1 font-semibold truncate">
                {bi('نظام العيادة السريري', 'Clinical workspace')}
              </div>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <button
            type="button"
            onClick={() => setManualCollapsed(true)}
            aria-label={bi('طي القائمة الجانبية', 'Collapse Sidebar')}
            title={bi('طي القائمة الجانبية', 'Collapse Sidebar')}
            className="size-8 rounded-lg text-muted-foreground-1 hover:text-foreground hover:bg-sidebar-nav-hover inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            {isRtl ? (
              <PanelLeftClose className="size-4 -scale-x-100" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-3 space-y-4">
        {isCollapsed && (
          <button
            type="button"
            onClick={() => setManualCollapsed(false)}
            aria-label={bi('توسيع القائمة الجانبية', 'Expand Sidebar')}
            title={bi('توسيع القائمة الجانبية', 'Expand Sidebar')}
            className="mx-auto size-9 rounded-lg text-muted-foreground-1 hover:text-foreground hover:bg-sidebar-nav-hover inline-flex items-center justify-center transition-colors cursor-pointer"
          >
            {isRtl ? (
              <PanelLeftOpen className="size-4 -scale-x-100" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </button>
        )}

        {groups.map((group) => {
          const groupItems = navItems.filter((item) => group.ids.includes(item.id));
          if (groupItems.length === 0) return null;
          return (
            <div key={group.labelEn} className="space-y-1">
              {!isCollapsed && (
                <div className="pr-nav-label pb-1">
                  {bi(group.labelAr, group.labelEn)}
                </div>
              )}
              {groupItems.map(renderItem)}
            </div>
          );
        })}
      </nav>

      {/* Footer: settings + local-encryption reassurance */}
      <div className="shrink-0 border-t border-sidebar-divider p-2.5 space-y-2">
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={bi('الإعدادات', 'Settings', t('navSettings'))}
            title={isCollapsed ? bi('الإعدادات', 'Settings', t('navSettings')) : undefined}
            className={`pr-nav-item ${isCollapsed ? 'justify-center px-0' : ''}`}
          >
            <Settings className="size-[1.125rem] shrink-0 text-muted-foreground-1" />
            {!isCollapsed && (
              <span className="truncate flex-1 text-start">
                {bi('الإعدادات', 'Settings', t('navSettings'))}
              </span>
            )}
          </button>
        )}

        {!isCollapsed && (
          <div className="flex items-center gap-2 rounded-xl bg-[var(--pr-accent-softer)] border border-[var(--pr-hairline)] px-2.5 py-2">
            <ShieldCheck className="size-4 text-primary shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground-1 leading-snug">
              {bi('مشفَّر على هذا الجهاز فقط', 'Encrypted on this device')}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
};
