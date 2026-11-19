// =======================================================================
// PhysioRecord — Unified Account & Clinic Utility Popover
// Consolidates Backup Status, Demo Management, Practice Mode, Privacy Cover,
// Theme/Language, Secondary Tools, Settings, and Vault Lock out of permanent chrome.
// =======================================================================

import React, { useEffect, useRef } from 'react';
import {
  Settings,
  Database,
  EyeOff,
  Lock,
  Sun,
  Moon,
  Compass,
  TabletSmartphone,
  Smartphone,
  User,
  Building2,
  ChevronDown,
  Dumbbell,
  BarChart3,
  ShieldAlert,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { ROLE_PERMISSIONS } from '../../services/clinicOperationsService';
import type { ClinicRoleId, ClinicStaffMember } from '../../types/clinicManagement';
import { DemoBadge } from '../ui/Primitives';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import type { ClinicNavTab } from './Sidebar';

const ROLE_LABEL_CKB: Record<ClinicRoleId, string> = {
  admin: 'بەڕێوەبەر',
  senior_pt: 'پسپۆڕی باڵای چارەسەری سروشتی',
  assistant_pt: 'یاریدەدەری چارەسەری سروشتی',
  receptionist: 'پێشوازی و ڕێکخستنی نۆرە',
};

export interface AccountMenuPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  placement: 'rail' | 'mobile-top';
  triggerRef?: React.RefObject<HTMLElement | null>;
  userMenuRoleLabel: string;
  isSoloMode: boolean;
  activeRole?: ClinicRoleId;
  staffRoster?: ClinicStaffMember[];
  onSwitchRole?: (role: ClinicRoleId) => void;
  onSwitchWorkspaceMode?: (mode: 'solo' | 'team') => void;
  formattedLastBackup?: string;
  isBackupOverdue?: boolean;
  hasDemoRecords?: boolean;
  onOpenBackup: () => void;
  onOpenDemoModal?: () => void;
  onOpenPrivacyCover: () => void;
  onOpenSettings: () => void;
  onOpenTour?: () => void;
  onOpenKiosk?: () => void;
  enableKioskModule?: boolean;
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
  showExerciseLibrary?: boolean;
  showAnalyticsModule?: boolean;
  onSelectSecondaryNav?: (nav: ClinicNavTab) => void;
  onLockVault: () => void;
}

export const AccountMenuPopover: React.FC<AccountMenuPopoverProps> = ({
  isOpen,
  onClose,
  placement,
  triggerRef,
  userMenuRoleLabel,
  isSoloMode,
  activeRole = 'admin',
  staffRoster = [],
  onSwitchRole,
  onSwitchWorkspaceMode,
  formattedLastBackup,
  isBackupOverdue = false,
  hasDemoRecords = false,
  onOpenBackup,
  onOpenDemoModal,
  onOpenPrivacyCover,
  onOpenSettings,
  onOpenTour,
  onOpenKiosk,
  enableKioskModule = false,
  canInstallPwa = false,
  onInstallPwa,
  showExerciseLibrary = false,
  showAnalyticsModule = false,
  onSelectSecondaryNav,
  onLockVault,
}) => {
  const { bi, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const runAction = (fn?: () => void) => {
    onClose();
    fn?.();
  };

  const positionClass =
    placement === 'rail'
      ? 'bottom-0 start-full ms-2.5 w-72 max-h-[min(85dvh,560px)]'
      : 'top-full mt-2 end-0 w-[min(308px,calc(100vw-24px))] max-h-[min(78dvh,560px)]';

  return (
    <div
      ref={panelRef}
      role="dialog"
      data-testid="account-menu-popover"
      aria-label={bi('قائمة العيادة والحساب', 'Clinic & Account Menu', 'مێنووی کلینیک و هەژمار')}
      className={`absolute z-50 rounded-2xl bg-card/98 backdrop-blur-xl border border-line-2/85 shadow-2xl overflow-y-auto p-2.5 space-y-2 ${positionClass}`}
    >
      {/* 1. Identity, Role Switcher (Team Mode) & Demo Pill */}
      <div className="px-2 py-1.5 rounded-xl bg-surface/65 flex items-center gap-2.5">
        <span className="size-9 rounded-full bg-primary/12 text-primary inline-flex items-center justify-center shrink-0">
          <User className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-extrabold text-foreground truncate">
            {userMenuRoleLabel}
          </div>
          {!isSoloMode && staffRoster.length > 0 && onSwitchRole ? (
            <div className="relative mt-0.5 flex items-center">
              <select
                value={activeRole}
                onChange={(e) => {
                  onSwitchRole(e.target.value as ClinicRoleId);
                  onClose();
                }}
                aria-label={bi('تبديل دور الموظف', 'Switch staff role', 'گۆڕینی ڕۆڵی ستاف')}
                className="w-full min-h-[28px] bg-transparent text-xs font-semibold text-primary border-0 outline-none shadow-none appearance-none cursor-pointer pe-4 py-0 m-0"
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
              <ChevronDown className="size-3.5 text-primary absolute end-0 pointer-events-none" />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground-1 truncate">
              {bi('بيانات محلية مشفرة', 'Offline encrypted vault')}
            </div>
          )}
        </div>
        {hasDemoRecords &&
          (onOpenDemoModal ? (
            <button
              type="button"
              data-testid="manage-demo-data-strip-btn"
              onClick={() => runAction(onOpenDemoModal)}
              className="px-2 py-1 rounded-lg bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/25 cursor-pointer shrink-0"
              title={bi('إدارة بيانات العرض التجريبي', 'Manage Demo Data', 'بەڕێوەبردنی داتای پیشاندان')}
            >
              <DemoBadge />
            </button>
          ) : (
            <DemoBadge />
          ))}
      </div>

      {/* 2. Smart Backup Status Row */}
      <button
        type="button"
        data-testid="account-backup-btn"
        onClick={() => runAction(onOpenBackup)}
        className={`w-full min-h-[44px] md:min-h-[38px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold transition-colors cursor-pointer ${
          isBackupOverdue
            ? 'bg-amber-500/10 hover:bg-amber-500/18 text-amber-800 dark:text-amber-300'
            : 'hover:bg-surface text-foreground'
        }`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            className={`size-2 rounded-full shrink-0 ${
              isBackupOverdue ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            aria-hidden="true"
          />
          <Database className="size-4 shrink-0 text-primary" />
          <span className="truncate">{bi('النسخ الاحتياطي', 'Backup & Restore', 'پاشەکەوت')}</span>
        </span>
        <span dir="ltr" className="text-xs font-mono opacity-85 shrink-0">
          {formattedLastBackup}
        </span>
      </button>

      {/* 3. Practice Mode Switcher (Solo vs Clinic) */}
      {onSwitchWorkspaceMode && (
        <div
          role="group"
          aria-label={bi('تبديل نمط العمل', 'Switch practice mode', 'گۆڕینی شێوازی کار')}
          className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface/80"
        >
          <button
            type="button"
            aria-pressed={isSoloMode}
            onClick={() => {
              onSwitchWorkspaceMode('solo');
              onClose();
            }}
            className={`min-h-[40px] md:min-h-[32px] px-2 py-1 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              isSoloMode
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            <User className="size-3.5 shrink-0" />
            <span className="truncate">{bi('معالج منفرد', 'Solo', 'تاک')}</span>
          </button>
          <button
            type="button"
            aria-pressed={!isSoloMode}
            onClick={() => {
              onSwitchWorkspaceMode('team');
              onClose();
            }}
            className={`min-h-[40px] md:min-h-[32px] px-2 py-1 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              !isSoloMode
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            <Building2 className="size-3.5 shrink-0" />
            <span className="truncate">{bi('عيادة', 'Clinic', 'کلینیک')}</span>
          </button>
        </div>
      )}

      {/* 4. Conditional Extra Clinical Modules (Visible Only When Enabled) */}
      {onSelectSecondaryNav &&
        (showExerciseLibrary || showAnalyticsModule || !isSoloMode || (enableKioskModule && onOpenKiosk) || (canInstallPwa && onInstallPwa)) && (
          <div className="pt-1 border-t border-card-divider space-y-0.5">
            {showExerciseLibrary && (
              <button
                type="button"
                onClick={() => runAction(() => onSelectSecondaryNav('exercises'))}
                className="w-full min-h-[44px] md:min-h-[36px] px-2.5 py-1.5 rounded-xl hover:bg-surface text-foreground text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <Dumbbell className="size-4 text-primary shrink-0" />
                <span className="truncate">{bi('التمارين (HEP)', 'Exercise & HEP', t('navHep'))}</span>
              </button>
            )}
            {showAnalyticsModule && (
              <button
                type="button"
                onClick={() => runAction(() => onSelectSecondaryNav('analytics'))}
                className="w-full min-h-[44px] md:min-h-[36px] px-2.5 py-1.5 rounded-xl hover:bg-surface text-foreground text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <BarChart3 className="size-4 text-primary shrink-0" />
                <span className="truncate">{t('analytics.nav')}</span>
              </button>
            )}
            {!isSoloMode && (
              <button
                type="button"
                onClick={() => runAction(() => onSelectSecondaryNav('activity_log'))}
                className="w-full min-h-[44px] md:min-h-[36px] px-2.5 py-1.5 rounded-xl hover:bg-surface text-foreground text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <ShieldAlert className="size-4 text-primary shrink-0" />
                <span className="truncate">{bi('سجل النشاط والكادر', 'Audit & Staff Roles', t('navAudit'))}</span>
              </button>
            )}
            {enableKioskModule && onOpenKiosk && (
              <button
                type="button"
                onClick={() => runAction(onOpenKiosk)}
                className="w-full min-h-[44px] md:min-h-[36px] px-2.5 py-1.5 rounded-xl hover:bg-surface text-foreground text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <TabletSmartphone className="size-4 text-primary shrink-0" />
                <span className="truncate">{bi('وضع كشك المريض', 'Patient Kiosk Mode', 'دۆخی کیۆسک')}</span>
              </button>
            )}
            {canInstallPwa && onInstallPwa && (
              <button
                type="button"
                onClick={() => runAction(onInstallPwa)}
                className="w-full min-h-[44px] md:min-h-[36px] px-2.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/18 text-primary text-xs font-bold flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <Smartphone className="size-4 shrink-0" />
                <span className="truncate">{bi('تثبيت التطبيق', 'Install App', 'دامەزراندن')}</span>
              </button>
            )}
          </div>
        )}

      {/* 5. Quick Workspace Utilities */}
      <div className="pt-1 border-t border-card-divider space-y-0.5">
        <button
          type="button"
          onClick={() => runAction(onOpenPrivacyCover)}
          className="w-full min-h-[44px] md:min-h-[36px] px-2.5 py-1.5 rounded-xl hover:bg-surface text-foreground text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <EyeOff className="size-4 text-primary shrink-0" />
            <span className="truncate">{bi('ستار الخصوصية', 'Privacy Cover', 'داپۆشەری نهێنی')}</span>
          </span>
          <kbd dir="ltr" className="hidden md:inline text-xs font-mono text-muted-foreground-2 shrink-0">
            Esc×2
          </kbd>
        </button>

        {/* Compact Theme + Language Strip */}
        <div className="px-2 py-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? bi('الوضع النهاري', 'Light Mode') : bi('الوضع الليلي', 'Dark Mode')}
            className="min-h-[40px] md:min-h-[34px] px-2 rounded-xl hover:bg-surface text-foreground text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
          >
            {theme === 'dark' ? (
              <Sun className="size-4 text-amber-400 shrink-0" />
            ) : (
              <Moon className="size-4 text-muted-foreground-1 shrink-0" />
            )}
            <span>{theme === 'dark' ? bi('نهاري', 'Light') : bi('ليلي', 'Dark')}</span>
          </button>
          <LanguageSwitcher variant="borderless" compact />
        </div>
      </div>

      {/* 6. Footer: Settings, Tour & Lock */}
      <div className="pt-1 border-t border-card-divider space-y-0.5">
        <button
          type="button"
          data-testid="account-settings-btn"
          onClick={() => runAction(onOpenSettings)}
          className="w-full min-h-[44px] md:min-h-[36px] px-2.5 py-1.5 rounded-xl hover:bg-surface text-foreground text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition-colors"
        >
          <Settings className="size-4 text-primary shrink-0" />
          <span className="truncate">{bi('الإعدادات والخيارات', 'Settings', t('navSettings'))}</span>
        </button>

        {onOpenTour && (
          <button
            type="button"
            onClick={() => runAction(onOpenTour)}
            className="w-full min-h-[44px] md:min-h-[36px] px-2.5 py-1.5 rounded-xl hover:bg-surface text-muted-foreground-1 hover:text-foreground text-xs font-medium flex items-center gap-2.5 cursor-pointer transition-colors"
          >
            <Compass className="size-4 shrink-0" />
            <span className="truncate">{bi('جولة استخدام سريعة', 'Quick Tour', 'گەشتی خێرا')}</span>
          </button>
        )}

        <button
          type="button"
          data-testid="account-lock-btn"
          onClick={() => runAction(onLockVault)}
          className="w-full min-h-[44px] md:min-h-[36px] px-2.5 py-1.5 rounded-xl hover:bg-rose-500/12 text-rose-700 dark:text-rose-400 text-xs font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Lock className="size-4 shrink-0" />
            <span className="truncate">{bi('قفل الخزينة المشفرة', 'Lock Vault', 'قوفڵکردنی قاسە')}</span>
          </span>
          <kbd dir="ltr" className="hidden md:inline text-xs font-mono opacity-75 shrink-0">
            Ctrl+L
          </kbd>
        </button>
      </div>
    </div>
  );
};
