// =======================================================================
// PhysioRecord — Underneath-Reveal Sidebar Navigation & Account Center
// - Always full-width underneath the main canvas (never collapses into an icon rail).
// - Top: Brand identity, Global Search (Ctrl+K), "+ New Patient", vertical nav tabs.
// - Bottom: Anchored Account & Clinic controls (Staff role, Settings, Backup, Privacy, Theme, Language, Lock).
// =======================================================================

import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { usePatients } from '../../context/PatientContext';
import { ROLE_PERMISSIONS } from '../../services/clinicOperationsService';
import type { PatientRecord } from '../../types/clinical';
import type { ClinicRoleId, ClinicStaffMember } from '../../types/clinicManagement';
import { Num, DemoBadge } from '../ui/Primitives';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import {
  Activity,
  Users,
  MonitorCheck,
  Calendar,
  CalendarClock,
  Wallet,
  Dumbbell,
  ShieldAlert,
  Settings,
  BarChart3,
  Search,
  UserPlus,
  User,
  Database,
  EyeOff,
  Lock,
  Sun,
  Moon,
  Compass,
  TabletSmartphone,
  Smartphone,
  Building2,
  ChevronDown,
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

const ROLE_LABEL_CKB: Record<ClinicRoleId, string> = {
  admin: 'بەڕێوەبەر',
  senior_pt: 'پسپۆڕی باڵای چارەسەری سروشتی',
  assistant_pt: 'یاریدەدەری چارەسەری سروشتی',
  receptionist: 'پێشوازی و ڕێکخستنی نۆرە',
};

interface SidebarProps {
  isOpen: boolean;
  onCloseDrawer: () => void;
  activeNav: ClinicNavTab;
  onSelectNav: (nav: ClinicNavTab) => void;
  selectedPatient: PatientRecord | null;
  onSelectPatient: (patient: PatientRecord | null) => void;
  showExerciseLibrary?: boolean;
  showAnalyticsModule?: boolean;
  isSoloMode?: boolean;
  onOpenGlobalSearch: () => void;
  onNewPatient: () => void;
  onOpenSettings: () => void;
  onOpenBackup: () => void;
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
  userMenuRoleLabel?: string;
  formattedLastBackup?: string;
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
  isOpen,
  onCloseDrawer,
  activeNav,
  onSelectNav,
  selectedPatient,
  onSelectPatient,
  showExerciseLibrary = false,
  showAnalyticsModule = false,
  isSoloMode = false,
  onOpenGlobalSearch,
  onNewPatient,
  onOpenSettings,
  onOpenBackup,
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
  hasDemoRecords = false,
}) => {
  const { t, bi } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { patients } = usePatients();

  const activePatients = patients.filter((p) => !p.isArchived);

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

  const runAndClose = (fn: () => void) => {
    onCloseDrawer();
    fn();
  };

  return (
    <aside
      aria-label={bi('القائمة الجانبية الرئيسية', 'Main Sidebar Navigation')}
      aria-hidden={!isOpen}
      inert={!isOpen}
      data-open={isOpen ? 'true' : 'false'}
      className="pr-under-sidebar flex flex-col h-dvh select-none overflow-hidden"
    >
      {/* Top: Brand + Search + Primary New Patient Action */}
      <div className="shrink-0 px-4 pt-5 pb-3 space-y-3">
        <div className="flex items-center gap-2.5 px-1">
          <div className="pr-brand-mark">
            <Activity className="size-[1.15rem]" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold tracking-tight text-foreground truncate leading-tight">
              PhysioRecord
            </div>
            <div className="text-xs text-muted-foreground-1 font-medium truncate">
              {bi('سجل العيادة المشفر', 'Encrypted clinic vault')}
            </div>
          </div>
        </div>

        {/* Clean Global Search Trigger (moved cleanly from top header into sidebar) */}
        <button
          type="button"
          onClick={() => runAndClose(onOpenGlobalSearch)}
          className="w-full min-h-[2.5rem] px-3 rounded-full bg-card/85 hover:bg-card text-muted-foreground-1 hover:text-foreground text-xs font-medium flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
        >
          <Search className="size-3.5 text-primary shrink-0" />
          <span className="truncate flex-1 text-start">
            {bi('ابحث عن مريض أو أمر...', 'Search patient, MRN...')}
          </span>
          <kbd
            dir="ltr"
            className="hidden sm:inline-block text-xs font-mono text-muted-foreground-2 shrink-0"
          >
            Ctrl K
          </kbd>
        </button>

        {/* Primary "+ New Patient" Trigger */}
        <button
          type="button"
          onClick={() => runAndClose(onNewPatient)}
          className="w-full min-h-[2.5rem] px-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
        >
          <UserPlus className="size-4 shrink-0" />
          <span>{bi('مريض جديد', 'New Patient', 'نەخۆشی نوێ')}</span>
        </button>
      </div>

      {/* Middle-Top: Vertical Navigation Tabs */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-1 space-y-1">
        {navItems.map((item) => {
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
                onCloseDrawer();
              }}
              data-active={isActive}
              data-nav-id={item.id}
              aria-current={isActive ? 'page' : undefined}
              className="pr-nav-item"
            >
              <Icon
                className={`size-[1.125rem] shrink-0 ${
                  isActive ? 'text-primary' : 'text-muted-foreground-1'
                }`}
              />
              <span className="truncate flex-1 text-start">{label}</span>
              {item.badge !== undefined && (
                <span
                  className={`min-w-[1.375rem] px-1.5 py-0.5 text-xs rounded-full font-bold text-center tabular-nums ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card/80 text-muted-foreground-1'
                  }`}
                >
                  <Num value={item.badge} />
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom: Account & Clinic Utility Center */}
      <div className="shrink-0 mt-auto px-3 pt-2 pb-3 border-t border-border/20 space-y-1.5">
        {/* Account / Role Header */}
        <div className="px-2 py-1.5 flex items-center gap-2.5">
          <span className="size-8 rounded-full bg-primary/12 text-primary inline-flex items-center justify-center shrink-0">
            <User className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-extrabold text-foreground truncate">
              {userMenuRoleLabel || bi('المعالج', 'Clinician')}
            </div>
            {!isSoloMode && staffRoster.length > 0 && onSwitchRole ? (
              <div className="relative mt-0.5 flex items-center">
                <select
                  value={activeRole}
                  onChange={(e) => {
                    onSwitchRole(e.target.value as ClinicRoleId);
                    onCloseDrawer();
                  }}
                  aria-label={bi('تبديل دور الموظف', 'Switch staff role', 'گۆڕینی ڕۆڵی ستاف')}
                  className="w-full bg-transparent text-xs font-semibold text-primary border-0 outline-none shadow-none focus:outline-none focus:ring-0 appearance-none cursor-pointer pe-4 py-0 m-0"
                >
                  {staffRoster.map((member) => (
                    <option key={member.id} value={member.role} className="bg-card text-foreground">
                      {bi(
                        `${member.nameAr} (${ROLE_PERMISSIONS[member.role].labelAr})`,
                        `${member.nameEn} (${ROLE_PERMISSIONS[member.role].labelEn})`,
                        `${member.nameAr} (${ROLE_LABEL_CKB[member.role]})`
                      )}
                    </option>
                  ))}
                </select>
                <ChevronDown className="size-3 text-primary absolute end-0 pointer-events-none" />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground-1 truncate">
                {bi('بيانات محلية مشفرة', 'Offline encrypted vault')}
              </div>
            )}
          </div>
          {hasDemoRecords && <DemoBadge />}
        </div>

        {/* Practice Mode Switcher: Solo Therapist vs Clinic Team */}
        {onSwitchWorkspaceMode && (
          <div className="px-1">
            <div
              role="group"
              aria-label={bi('تبديل نمط العمل', 'Switch practice mode', 'گۆڕینی شێوازی کار')}
              className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface/80 border border-line-2/70"
            >
              <button
                type="button"
                aria-pressed={isSoloMode}
                onClick={() => onSwitchWorkspaceMode('solo')}
                className={`min-h-[30px] px-2 py-1 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-all ${
                  isSoloMode
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground'
                }`}
              >
                <User className="size-3 shrink-0" />
                <span className="truncate">{bi('معالج منفرد', 'Solo', 'تاک')}</span>
              </button>
              <button
                type="button"
                aria-pressed={!isSoloMode}
                onClick={() => onSwitchWorkspaceMode('team')}
                className={`min-h-[30px] px-2 py-1 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition-all ${
                  !isSoloMode
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground'
                }`}
              >
                <Building2 className="size-3 shrink-0" />
                <span className="truncate">{bi('عيادة', 'Clinic', 'کلینیک')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Compact Settings & Utility Actions */}
        <div className="space-y-0.5 text-xs">
          <button
            type="button"
            onClick={() => runAndClose(onOpenSettings)}
            className="min-h-[36px] w-full px-2.5 py-1.5 rounded-xl hover:bg-card/80 text-foreground font-semibold flex items-center gap-2.5 cursor-pointer transition-colors"
          >
            <Settings className="size-4 text-primary shrink-0" />
            <span className="truncate flex-1 text-start">
              {bi('الإعدادات والخيارات', 'Settings', t('navSettings'))}
            </span>
          </button>

          <button
            type="button"
            onClick={() => runAndClose(onOpenBackup)}
            className="min-h-[36px] w-full px-2.5 py-1.5 rounded-xl hover:bg-card/80 text-foreground font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Database className="size-4 text-primary shrink-0" />
              <span className="truncate">
                {bi('النسخ الاحتياطي', 'Backup & Restore', 'پاشەکەوت و گەڕاندنەوە')}
              </span>
            </span>
            {formattedLastBackup && (
              <span dir="ltr" className="text-xs font-mono text-muted-foreground-2 shrink-0">
                {formattedLastBackup}
              </span>
            )}
          </button>

          {enableKioskModule && onOpenKiosk && (
            <button
              type="button"
              onClick={() => runAndClose(onOpenKiosk)}
              className="min-h-[36px] w-full px-2.5 py-1.5 rounded-xl hover:bg-card/80 text-foreground font-semibold flex items-center gap-2.5 cursor-pointer transition-colors"
            >
              <TabletSmartphone className="size-4 text-primary shrink-0" />
              <span className="truncate flex-1 text-start">
                {bi('وضع كشك المريض', 'Patient Kiosk Mode', 'دۆخی کیۆسک')}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => runAndClose(onOpenPrivacyCover)}
            className="min-h-[36px] w-full px-2.5 py-1.5 rounded-xl hover:bg-card/80 text-foreground font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <EyeOff className="size-4 text-primary shrink-0" />
              <span className="truncate">
                {bi('ستار الخصوصية', 'Privacy Cover', 'داپۆشەری نهێنی')}
              </span>
            </span>
            <kbd dir="ltr" className="hidden sm:inline text-xs font-mono text-muted-foreground-2 shrink-0">
              Esc×2
            </kbd>
          </button>

          {onOpenTour && (
            <button
              type="button"
              onClick={() => runAndClose(onOpenTour)}
              className="min-h-[36px] w-full px-2.5 py-1.5 rounded-xl hover:bg-card/80 text-muted-foreground-1 hover:text-foreground font-medium flex items-center gap-2.5 cursor-pointer transition-colors"
            >
              <Compass className="size-4 shrink-0" />
              <span className="truncate flex-1 text-start">
                {bi('جولة استخدام سريعة', 'Quick Tour', 'گەشتی خێرا')}
              </span>
            </button>
          )}

          {canInstallPwa && onInstallPwa && (
            <button
              type="button"
              onClick={() => runAndClose(onInstallPwa)}
              className="min-h-[36px] w-full px-2.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/18 text-primary font-bold flex items-center gap-2.5 cursor-pointer transition-colors"
            >
              <Smartphone className="size-4 shrink-0" />
              <span className="truncate flex-1 text-start">
                {bi('تثبيت التطبيق على الجهاز', 'Install App', 'دامەزراندن')}
              </span>
            </button>
          )}
        </div>

        {/* Clean Borderless Bottom Strip: Theme + Language + Lock */}
        <div className="pt-1.5 border-t border-border/20 flex items-center justify-between gap-1 px-0.5 overflow-hidden">
          <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? bi('الوضع النهاري', 'Light Mode') : bi('الوضع الليلي', 'Dark Mode')}
              title={theme === 'dark' ? bi('الوضع النهاري', 'Light Mode') : bi('الوضع الليلي', 'Dark Mode')}
              className="size-8 rounded-lg hover:bg-card/80 text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center cursor-pointer transition-colors shrink-0"
            >
              {theme === 'dark' ? (
                <Sun className="size-4 text-amber-400" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
            <span className="h-3.5 w-px bg-border/40 shrink-0" aria-hidden="true" />
            <LanguageSwitcher variant="borderless" compact />
          </div>

          <button
            type="button"
            onClick={() => runAndClose(onLockVault)}
            aria-label={bi('قفل الخزينة المشفرة', 'Lock Vault', 'قوفڵکردنی قاسە')}
            title={bi('قفل الخزينة (Ctrl+L)', 'Lock Vault (Ctrl+L)')}
            className="size-8 rounded-lg hover:bg-rose-500/12 text-muted-foreground-1 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center justify-center cursor-pointer transition-colors shrink-0 ms-1"
          >
            <Lock className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
