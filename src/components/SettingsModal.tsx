// =======================================================================
// PhysioRecord — Clinic Settings & Developer Modal
// - Currency: Select primary world currency (Default: IQD)
// - Clinic: Encrypted Clinic Profile, WhatsApp Templates, Workspace Mode & Custom Services
// - Display: Interface Language (AR / CKB / EN), Theme Mode/Palette & Typography
// - Staff: Edit and customize clinic staff roster (Admin, Senior PT, PT, Reception)
// - Security: Backup Hub, Inactivity Auto-Lock, Admin PIN, PRF Passkey & DEK Rotation
// - Modules: Modular Clinical, Iraq Operations (Phase C), Data Quality (D) & Interop (E)
// - Developer: Load Demo Data & One-Click Delete All Demo Data
// =======================================================================

import React, { Suspense, useEffect, useState } from 'react';
import {
  Building2,
  Coins,
  Database,
  Dumbbell,
  Search,
  Settings,
  Shield,
  Sparkles,
  Type,
  Users,
  X,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { usePatients } from '../context/PatientContext';
import { GeometricHeaderBackdrop } from './ui/Dialog';
import { DemoBadge } from './ui/Primitives';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import type { SettingsViewMode } from '../types/clinicManagement';
import type { CustomWidgetDefinition } from '../types/clinicalWidgets';
import { hasAnyDemoPatients } from '../utils/mrn';
import {
  APP_SEMVER_VERSION,
  filterSettingsCatalog,
} from '../utils/settingsOnboardingPhaseF';
import { SETTINGS_CATALOG_CKB } from './settings/settingsI18nLabels';
import { DisplaySettingsTab } from './settings/DisplaySettingsTab';
import { CurrencySettingsTab } from './settings/CurrencySettingsTab';
import { ClinicProfileSettingsTab } from './settings/ClinicProfileSettingsTab';
import { StaffRosterSettingsTab } from './settings/StaffRosterSettingsTab';
import { SecuritySettingsTab } from './settings/SecuritySettingsTab';
import { ModulesSettingsTab } from './settings/ModulesSettingsTab';
import { DeveloperSettingsTab } from './settings/DeveloperSettingsTab';

const CustomWidgetStudioModal = React.lazy(() =>
  import('./workspace/CustomWidgetStudioModal').then((m) => ({
    default: m.CustomWidgetStudioModal,
  }))
);
const CsvOnboardingModal = React.lazy(() =>
  import('./clinic/CsvOnboardingModal').then((m) => ({
    default: m.CsvOnboardingModal,
  }))
);
const FullVaultExportModal = React.lazy(() =>
  import('./clinic/FullVaultExportModal').then((m) => ({
    default: m.FullVaultExportModal,
  }))
);
const RecoveryDrillModal = React.lazy(() =>
  import('./clinic/RecoveryDrillModal').then((m) => ({
    default: m.RecoveryDrillModal,
  }))
);
const WhatsNewChangelogModal = React.lazy(() =>
  import('./clinic/WhatsNewChangelogModal').then((m) => ({
    default: m.WhatsNewChangelogModal,
  }))
);

type SettingsTabId = 'currency' | 'clinic' | 'display' | 'staff' | 'security' | 'modules' | 'developer';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDemoModal: () => void;
  onOpenBackupModal?: () => void;
  onStartTour?: () => void;
  initialTab?: SettingsTabId;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenDemoModal,
  onOpenBackupModal,
  onStartTour,
  initialTab = 'currency',
}) => {
  const { isRtl, bi } = useLanguage();
  const { patients } = usePatients();

  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [settingsViewMode, setSettingsViewMode] = useState<SettingsViewMode>(() =>
    ClinicOperationsService.getSettingsViewMode()
  );
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const [isSoloMode, setIsSoloMode] = useState<boolean>(() =>
    ClinicOperationsService.isSoloMode()
  );
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetDefinition[]>(() =>
    ClinicOperationsService.getCustomWidgets()
  );

  // Lazy Child Modals State
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [isWidgetStudioOpen, setIsWidgetStudioOpen] = useState(false);
  const [isCsvOnboardingOpen, setIsCsvOnboardingOpen] = useState(false);
  const [isFullExportOpen, setIsFullExportOpen] = useState(false);
  const [isRecoveryDrillOpen, setIsRecoveryDrillOpen] = useState(false);

  const handleSwitchSettingsMode = (mode: SettingsViewMode) => {
    setSettingsViewMode(mode);
    ClinicOperationsService.setSettingsViewMode(mode);
    if (mode === 'simple' && (activeTab === 'developer' || activeTab === 'staff')) {
      setActiveTab('clinic');
    }
  };

  useEffect(() => {
    if (isOpen) {
      void ClinicOperationsService.ensureColdStoreLoadedAsync('noteTemplates');
      void ClinicOperationsService.ensureColdStoreLoadedAsync('customWidgets');
    }
    const syncShellState = () => {
      const nextSolo = ClinicOperationsService.isSoloMode();
      setIsSoloMode(nextSolo);
      setCustomWidgets(ClinicOperationsService.getCustomWidgets());
      setSettingsViewMode(ClinicOperationsService.getSettingsViewMode());
      if (nextSolo && activeTab === 'staff') {
        setActiveTab('clinic');
      }
    };
    syncShellState();
    const unsubOps = ClinicOperationsService.subscribe(syncShellState);
    window.addEventListener('physiorecord-modules-updated', syncShellState);
    return () => {
      unsubOps();
      window.removeEventListener('physiorecord-modules-updated', syncShellState);
    };
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (
          isWidgetStudioOpen ||
          isCsvOnboardingOpen ||
          isFullExportOpen ||
          isRecoveryDrillOpen ||
          isWhatsNewOpen
        ) {
          return;
        }
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isOpen,
    isWidgetStudioOpen,
    isCsvOnboardingOpen,
    isFullExportOpen,
    isRecoveryDrillOpen,
    isWhatsNewOpen,
    onClose,
  ]);

  if (!isOpen) return null;

  const hasDemoRecords =
    hasAnyDemoPatients(patients) || ClinicOperationsService.hasDemoOperationsData();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-stretch justify-center sm:justify-end"
      dir={isRtl ? 'rtl' : 'ltr'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card border-t sm:border-t-0 sm:border-s border-card-line rounded-t-2xl sm:rounded-none max-w-2xl w-full max-h-[92dvh] sm:max-h-none sm:h-full shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Themed Geometric Header */}
        <div className="relative overflow-hidden px-4 sm:px-5 pt-2.5 sm:pt-4 pb-3.5 bg-primary text-primary-foreground space-y-2.5 shrink-0 shadow-xs">
          <GeometricHeaderBackdrop />
          <div className="relative z-10 w-10 h-1 rounded-full bg-primary-foreground/40 mx-auto sm:hidden shrink-0" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="size-9 rounded-xl bg-primary-foreground/15 text-primary-foreground border border-primary-foreground/20 flex items-center justify-center shrink-0">
                <Settings className="size-4.5 shrink-0" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="settings-modal-title" className="text-sm sm:text-base font-black text-primary-foreground truncate">
                  {bi('إعدادات العيادة والمطور', 'Clinic & Developer Settings', 'ڕێکخستنەکانی کلینیک و گەشەپێدەر')}
                </h2>
                <p className="hidden sm:block text-xs text-primary-foreground/85 truncate">
                  {bi(
                    'العملة، أعضاء الكادر، الأمان، الأقسام، والبيانات التجريبية',
                    'Currency, staff roster, security, modules, and demo data',
                    'دراو، ئەندامانی ستاف، ئاسایش، بەشەکان، و داتای نموونەیی'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={bi('إغلاق الإعدادات', 'Close settings', 'داخستنی ڕێکخستنەکان')}
              className="size-9 !p-0 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground inline-flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <X className="size-4 shrink-0" />
            </button>
          </div>

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pt-0.5">
            {/* Simple / Advanced Segmented Switch */}
            <div className="inline-flex items-center rounded-xl bg-primary-foreground/15 border border-primary-foreground/20 p-0.5 shrink-0">
              <button
                type="button"
                data-testid="settings-mode-simple-btn"
                aria-pressed={settingsViewMode === 'simple'}
                onClick={() => handleSwitchSettingsMode('simple')}
                className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  settingsViewMode === 'simple'
                    ? 'bg-card text-primary shadow-2xs'
                    : 'text-primary-foreground/85 hover:text-primary-foreground'
                }`}
              >
                {bi('مبسط', 'Simple', 'سادە')}
              </button>
              <button
                type="button"
                data-testid="settings-mode-advanced-btn"
                aria-pressed={settingsViewMode === 'advanced'}
                onClick={() => handleSwitchSettingsMode('advanced')}
                className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  settingsViewMode === 'advanced'
                    ? 'bg-card text-primary shadow-2xs'
                    : 'text-primary-foreground/85 hover:text-primary-foreground'
                }`}
              >
                {bi('متقدم', 'Advanced', 'پێشکەوتوو')}
              </button>
            </div>

            {/* What's New & Migration Guide Button (F3) */}
            <button
              type="button"
              data-testid="open-whats-new-btn"
              onClick={() => setIsWhatsNewOpen(true)}
              className="min-h-[32px] px-3 py-1 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground border border-primary-foreground/25 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
              title={bi(
                `ما الجديد v${APP_SEMVER_VERSION}`,
                `What's New v${APP_SEMVER_VERSION}`,
                `نوێترین گۆڕانکارییەکان v${APP_SEMVER_VERSION}`
              )}
            >
              <Sparkles className="size-3.5 shrink-0" />
              <span>{bi('ما الجديد', "What's New", 'نوێترین')}</span>
              <span className="font-mono"><bdi dir="ltr">v{APP_SEMVER_VERSION}</bdi></span>
            </button>
          </div>
        </div>

        {/* Search & Navigation Sub-bar */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-card-divider bg-surface/60 space-y-2.5 shrink-0">
          {/* Search Input */}
          <div className="relative flex items-center">
            <Search className="size-3.5 text-muted-foreground-1 absolute start-3 inset-y-0 my-auto pointer-events-none z-10 shrink-0" />
            <input
              type="text"
              data-testid="settings-search-input"
              aria-label={bi('بحث في الإعدادات', 'Search settings', 'گەڕان لە ڕێکخستنەکان')}
              value={settingsSearchQuery}
              onChange={(e) => setSettingsSearchQuery(e.target.value)}
              placeholder={bi(
                'ابحث في الإعدادات (نسخ احتياطي، أمان، لغة، خط، أقسام...)',
                'Search settings (backup, security, language, font, modules...)',
                'گەڕان لە ڕێکخستنەکان (کۆپی یەدەگ، ئاسایش، زمان، فۆنت، بەشەکان...)'
              )}
              className="w-full min-h-[38px] ps-9 pe-10 py-1.5 rounded-xl bg-card border border-line-2 text-xs leading-normal text-foreground placeholder:text-muted-foreground-1 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
            />
            {settingsSearchQuery.trim().length > 0 && (
              <button
                type="button"
                data-testid="settings-search-clear-btn"
                onClick={() => setSettingsSearchQuery('')}
                aria-label={bi('مسح البحث', 'Clear search', 'سڕینەوەی گەڕان')}
                className="absolute end-1 inset-y-0 my-auto size-8 flex items-center justify-center rounded-lg text-muted-foreground-1 hover:text-foreground cursor-pointer z-10"
              >
                <X className="size-4 shrink-0" />
              </button>
            )}
          </div>

          {/* Horizontally Scrollable Rounded Tabs Strip */}
          <div
            className={`${
              settingsSearchQuery.trim().length > 0 ? 'hidden sm:block' : 'block'
            } rounded-2xl border border-line-2 bg-card p-1 overflow-hidden`}
          >
            <div
              role="tablist"
              aria-label={bi('أقسام الإعدادات', 'Settings categories', 'بەشەکانی ڕێکخستن')}
              className="pr-hscroll overflow-x-auto flex items-center gap-1 whitespace-nowrap pb-1 pt-0.5 px-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'currency'}
                data-testid="settings-tab-currency"
                onClick={(e) => {
                  setActiveTab('currency');
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-all ${
                  activeTab === 'currency'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                }`}
              >
                <Coins className="size-3.5 shrink-0" />
                <span>{bi('العملة', 'Currency', 'دراو')}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'clinic'}
                data-testid="settings-tab-clinic"
                onClick={(e) => {
                  setActiveTab('clinic');
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-all ${
                  activeTab === 'clinic'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                }`}
              >
                <Building2 className="size-3.5 shrink-0" />
                <span>{bi('العيادة', 'Clinic', 'کلینیک')}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'display'}
                data-testid="settings-tab-display"
                onClick={(e) => {
                  setActiveTab('display');
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-all ${
                  activeTab === 'display'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                }`}
              >
                <Type className="size-3.5 shrink-0" />
                <span>{bi('اللغة والمظهر', 'Display', 'زمان و شێواز')}</span>
              </button>

              {!isSoloMode && settingsViewMode === 'advanced' && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'staff'}
                  data-testid="settings-tab-staff"
                  onClick={(e) => {
                    setActiveTab('staff');
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                  }}
                  className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-all ${
                    activeTab === 'staff'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                  }`}
                >
                  <Users className="size-3.5 shrink-0" />
                  <span>{bi('الكادر', 'Staff', 'ستاف')}</span>
                </button>
              )}

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'security'}
                data-testid="settings-tab-security"
                onClick={(e) => {
                  setActiveTab('security');
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-all ${
                  activeTab === 'security'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                }`}
              >
                <Shield className="size-3.5 shrink-0" />
                <span>{bi('الأمان', 'Security', 'ئاسایش')}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'modules'}
                data-testid="settings-tab-modules"
                onClick={(e) => {
                  setActiveTab('modules');
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-all ${
                  activeTab === 'modules'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                }`}
              >
                <Dumbbell className="size-3.5 shrink-0" />
                <span>{bi('الأقسام', 'Modules', 'بەشەکان')}</span>
              </button>

              {settingsViewMode === 'advanced' && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'developer'}
                  data-testid="settings-tab-developer"
                  onClick={(e) => {
                    setActiveTab('developer');
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                  }}
                  className={`min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-all ${
                    activeTab === 'developer'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground-1 hover:text-foreground hover:bg-surface'
                  }`}
                >
                  <Database className="size-3.5 shrink-0" />
                  <span>{bi('المطور', 'Developer', 'گەشەپێدەر')}</span>
                  {hasDemoRecords && <DemoBadge />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div
          tabIndex={0}
          aria-label={bi('محتوى الإعدادات', 'Settings content', 'ناوەڕۆکی ڕێکخستنەکان')}
          className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 focus:outline-none"
        >
          {/* Live Search Results Panel (Phase F1) */}
          {settingsSearchQuery.trim().length > 0 && (() => {
            const matchedItems = filterSettingsCatalog(settingsSearchQuery, settingsViewMode);
            return (
              <div
                data-testid="settings-search-results"
                className="p-3.5 rounded-xl bg-primary/5 border border-primary/25 space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-bold text-foreground">
                  <span>
                    {bi(
                      `نتائج البحث في الإعدادات (${matchedItems.length})`,
                      `Matching Settings (${matchedItems.length})`,
                      `ئەنجامەکانی گەڕان لە ڕێکخستنەکان (${matchedItems.length})`
                    )}
                  </span>
                </div>
                {matchedItems.length === 0 ? (
                  <p
                    data-testid="settings-search-empty"
                    className="text-xs text-muted-foreground-1 py-2"
                  >
                    {bi(
                      'لا توجد إعدادات مطابقة لبحثك',
                      'No matching settings found',
                      'هیچ ڕێکخستنێکی گونجاو بۆ گەڕانەکەت نەدۆزرایەوە'
                    )}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {matchedItems.map((item) => {
                      const ckbMeta = SETTINGS_CATALOG_CKB[item.id];
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-testid={`settings-search-result-${item.id}`}
                          onClick={() => {
                            if (item.isAdvanced && settingsViewMode === 'simple') {
                              handleSwitchSettingsMode('advanced');
                            }
                            setActiveTab(item.tab);
                            setSettingsSearchQuery('');
                          }}
                          className="w-full text-start p-2.5 rounded-xl bg-card hover:bg-layer-hover border border-card-line flex items-start justify-between gap-2 cursor-pointer transition-colors"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground">
                                {bi(item.titleAr, item.titleEn, ckbMeta?.title)}
                              </span>
                              {item.isAdvanced && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-bold">
                                  {bi('متقدم', 'Advanced', 'پێشکەوتوو')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground-1">
                              {bi(item.descAr, item.descEn, ckbMeta?.desc)}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold shrink-0">
                            {bi(item.categoryAr, item.categoryEn, ckbMeta?.category)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === 'display' && <DisplaySettingsTab />}

          {activeTab === 'currency' && <CurrencySettingsTab />}

          {activeTab === 'clinic' && (
            <ClinicProfileSettingsTab
              isModalOpen={isOpen}
              isSoloMode={isSoloMode}
              onSoloModeChanged={setIsSoloMode}
            />
          )}

          {activeTab === 'staff' && <StaffRosterSettingsTab isModalOpen={isOpen} />}

          {activeTab === 'security' && (
            <SecuritySettingsTab
              isModalOpen={isOpen}
              isSoloMode={isSoloMode}
              settingsViewMode={settingsViewMode}
              onSwitchSettingsMode={handleSwitchSettingsMode}
              onOpenBackupModal={onOpenBackupModal}
              onOpenRecoveryDrill={() => setIsRecoveryDrillOpen(true)}
              onOpenFullExport={() => setIsFullExportOpen(true)}
              onOpenCsvOnboarding={() => setIsCsvOnboardingOpen(true)}
            />
          )}

          {activeTab === 'modules' && (
            <ModulesSettingsTab
              isModalOpen={isOpen}
              isActiveTab={activeTab === 'modules'}
              settingsViewMode={settingsViewMode}
              onSwitchSettingsMode={handleSwitchSettingsMode}
              customWidgets={customWidgets}
              onOpenWidgetStudio={() => setIsWidgetStudioOpen(true)}
              onStartTour={onStartTour}
            />
          )}

          {activeTab === 'developer' && (
            <DeveloperSettingsTab
              hasDemoRecords={hasDemoRecords}
              onCloseModal={onClose}
              onOpenDemoModal={onOpenDemoModal}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 bg-surface/60 border-t border-card-divider flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            data-testid="settings-modal-close-footer-btn"
            className="min-h-[38px] px-5 py-2 rounded-xl bg-card border border-line-2 text-xs font-bold text-foreground hover:bg-layer-hover cursor-pointer transition-colors"
          >
            {bi('إغلاق', 'Close', 'داخستن')}
          </button>
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        <Suspense fallback={null}>
          {isWidgetStudioOpen && (
            <CustomWidgetStudioModal
              isOpen={isWidgetStudioOpen}
              onClose={() => setIsWidgetStudioOpen(false)}
              onWidgetCreated={() => {
                setCustomWidgets(ClinicOperationsService.getCustomWidgets());
              }}
            />
          )}
          {isCsvOnboardingOpen && (
            <CsvOnboardingModal
              isOpen={isCsvOnboardingOpen}
              onOpenChange={setIsCsvOnboardingOpen}
            />
          )}
          {isFullExportOpen && (
            <FullVaultExportModal
              isOpen={isFullExportOpen}
              onOpenChange={setIsFullExportOpen}
            />
          )}
          {isRecoveryDrillOpen && (
            <RecoveryDrillModal
              isOpen={isRecoveryDrillOpen}
              onClose={() => setIsRecoveryDrillOpen(false)}
            />
          )}
          {isWhatsNewOpen && (
            <WhatsNewChangelogModal
              isOpen={isWhatsNewOpen}
              onClose={() => setIsWhatsNewOpen(false)}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
};
