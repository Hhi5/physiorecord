// =======================================================================
// PhysioRecord — Clinical Sidebar Navigation (Batch 3 Simplification)
// - Navigation only: Reception, Patients, Schedule, Exercise/HEP, Finance, Audit
// - Auto-collapses to an icon rail on patient pages
// - Utility stack & quick patient list moved to Global Search (Ctrl/Cmd+K) & User Menu
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

  // Auto-collapse sidebar on patient pages and on compact tablet/small-laptop viewports (< 1100px)
  const isCollapsed =
    selectedPatient !== null || isNarrowScreen
      ? manualCollapsed ?? true
      : manualCollapsed ?? false;

  const soloNavItems: {
    id: ClinicNavTab;
    icon: React.FC<{ className?: string }>;
    labelAr: string;
    labelEn: string;
    labelCkb?: string;
    badge?: number;
  }[] = [
    {
      id: 'today',
      icon: CalendarClock,
      labelAr: 'اليوم',
      labelEn: 'Today',
      labelCkb: t('navToday'),
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

  const teamNavItems: {
    id: ClinicNavTab;
    icon: React.FC<{ className?: string }>;
    labelAr: string;
    labelEn: string;
    labelCkb?: string;
    badge?: number;
  }[] = [
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

  const navItems = isSoloMode ? soloNavItems : teamNavItems;

  return (
    <aside
      aria-label={bi('القائمة الجانبية الرئيسية', 'Main Sidebar Navigation')}
      className={`${
        isCollapsed ? 'w-[68px]' : 'w-56 xl:w-60'
      } transition-all duration-200 bg-sidebar border-e border-sidebar-line flex flex-col h-screen sticky top-0 z-30 select-none shrink-0`}
    >
      {/* Brand Header & Collapse Toggle */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-sidebar-divider shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-xs shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-sm tracking-tight text-foreground truncate">
              PhysioRecord
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setManualCollapsed(!isCollapsed)}
          aria-label={
            isCollapsed
              ? bi('توسيع القائمة الجانبية', 'Expand Sidebar')
              : bi('طي القائمة الجانبية', 'Collapse Sidebar')
          }
          title={
            isCollapsed
              ? bi('توسيع القائمة الجانبية', 'Expand Sidebar')
              : bi('طي القائمة الجانبية', 'Collapse Sidebar')
          }
          className={`p-2 rounded-lg text-muted-foreground-1 hover:text-foreground hover:bg-sidebar-nav-hover transition-colors cursor-pointer ${
            isCollapsed ? 'mx-auto' : ''
          }`}
        >
          {isCollapsed ? (
            isRtl ? (
              <PanelLeftOpen className="w-4 h-4 -scale-x-100" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )
          ) : isRtl ? (
            <PanelLeftClose className="w-4 h-4 -scale-x-100" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation Only (Reception, Patients, Schedule, Exercise/HEP, Finance, Audit) */}
      <nav className="p-2.5 space-y-1 flex-1 overflow-y-auto">
        {navItems
          .filter(
            (item) =>
              (item.id !== 'exercises' || showExerciseLibrary) &&
              (item.id !== 'analytics' || showAnalyticsModule)
          )
          .map((item) => {
          const Icon = item.icon;
          const isActive =
            selectedPatient !== null
              ? item.id === 'directory'
              : activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectPatient(null);
                onSelectNav(item.id);
              }}
              aria-label={
                isCollapsed || item.badge === undefined
                  ? bi(item.labelAr, item.labelEn, item.labelCkb)
                  : undefined
              }
              title={isCollapsed ? bi(item.labelAr, item.labelEn, item.labelCkb) : undefined}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-sidebar-nav-active text-primary font-bold shadow-2xs'
                  : 'text-sidebar-nav-foreground hover:bg-sidebar-nav-hover'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-primary' : 'text-muted-foreground-1'
                  }`}
                />
                {!isCollapsed && (
                  <span className="truncate">
                    {bi(item.labelAr, item.labelEn, item.labelCkb)}
                  </span>
                )}
              </div>

              {!isCollapsed && item.badge !== undefined && (
                <span
                  className={`px-2 py-0.5 text-xs rounded-full font-mono font-bold ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface text-surface-foreground'
                  }`}
                >
                  <Num value={item.badge} />
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {onOpenSettings && (
        <div className="p-2.5 border-t border-sidebar-divider shrink-0">
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={bi('الإعدادات', 'Settings', t('navSettings'))}
            title={isCollapsed ? bi('الإعدادات', 'Settings', t('navSettings')) : undefined}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-sidebar-nav-foreground hover:bg-sidebar-nav-hover transition-all cursor-pointer ${
              isCollapsed ? 'justify-center px-0' : ''
            }`}
          >
            <Settings className="w-4 h-4 shrink-0 text-muted-foreground-1" />
            {!isCollapsed && (
              <span className="truncate">{bi('الإعدادات', 'Settings', t('navSettings'))}</span>
            )}
          </button>
        </div>
      )}
    </aside>
  );
};
