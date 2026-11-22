// =======================================================================
// PhysioRecord — Clinic Settings Modal
// - Desktop: Wide two-column macOS / Linear-style split (fixed sidebar + content)
// - Mobile: Native iOS / Android drill-down (searchable menu -> full-screen section)
// - Default tab: Clinic Profile (most relevant daily setup)
// =======================================================================

import React, { Suspense, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Cloud,
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
import { useLanguage } from '../../context/LanguageContext';
import { usePatients } from '../../context/PatientContext';
import { useDeviceFormFactor } from '../../utils/deviceBiometricCopy';
import { DemoBadge } from '../ui/Primitives';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { SettingsViewMode } from '../../types/clinicManagement';
import type { CustomWidgetDefinition } from '../../types/clinicalWidgets';
import { hasAnyDemoPatients } from '../../utils/mrn';
import {
  APP_SEMVER_VERSION,
  filterSettingsCatalog,
} from '../../utils/settingsOnboardingPhaseF';
import { SETTINGS_CATALOG_CKB } from './settingsI18nLabels';
import { DisplaySettingsTab } from './DisplaySettingsTab';
import { CurrencySettingsTab } from './CurrencySettingsTab';
import { ClinicProfileSettingsTab } from './ClinicProfileSettingsTab';
import { StaffRosterSettingsTab } from './StaffRosterSettingsTab';
import { SecuritySettingsTab } from './SecuritySettingsTab';
import { ModulesSettingsTab } from './ModulesSettingsTab';
import { DeveloperSettingsTab } from './DeveloperSettingsTab';

const CustomWidgetStudioModal = React.lazy(() =>
  import('../workspace/CustomWidgetStudioModal').then((m) => ({
    default: m.CustomWidgetStudioModal,
  }))
);
const CsvOnboardingModal = React.lazy(() =>
  import('../clinic/CsvOnboardingModal').then((m) => ({
    default: m.CsvOnboardingModal,
  }))
);
const FullVaultExportModal = React.lazy(() =>
  import('../clinic/FullVaultExportModal').then((m) => ({
    default: m.FullVaultExportModal,
  }))
);
const RecoveryDrillModal = React.lazy(() =>
  import('../clinic/RecoveryDrillModal').then((m) => ({
    default: m.RecoveryDrillModal,
  }))
);
const WhatsNewChangelogModal = React.lazy(() =>
  import('../clinic/WhatsNewChangelogModal').then((m) => ({
    default: m.WhatsNewChangelogModal,
  }))
);
const ClinicSyncSettingsTab = React.lazy(() =>
  import('./ClinicSyncSettingsTab').then((m) => ({
    default: m.ClinicSyncSettingsTab,
  }))
);

type SettingsTabId = 'currency' | 'clinic' | 'display' | 'staff' | 'sync' | 'security' | 'modules' | 'developer';

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
  initialTab = 'clinic',
}) => {
  const { isRtl, bi } = useLanguage();
  const { patients } = usePatients();
  const deviceFormFactor = useDeviceFormFactor();

  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [mobileView, setMobileView] = useState<'menu' | 'detail'>('menu');
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
    if (!isOpen) return;
    setActiveTab(initialTab);
    setMobileView('menu');
    setSettingsSearchQuery('');
    void ClinicOperationsService.ensureColdStoreLoadedAsync('noteTemplates');
    void ClinicOperationsService.ensureColdStoreLoadedAsync('customWidgets');
  }, [isOpen, initialTab]);

  // Live tab switching on Desktop during Settings Spotlight Tour (keep menu visible on Mobile so all tab anchors stay spotlightable)
  useEffect(() => {
    if (!isOpen) return;
    const handleSelectTab = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: SettingsTabId }>).detail;
      if (!detail?.tab) return;
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setActiveTab(detail.tab);
      } else {
        setMobileView('menu');
      }
    };
    window.addEventListener('physiorecord-settings-select-tab', handleSelectTab);
    return () => {
      window.removeEventListener('physiorecord-settings-select-tab', handleSelectTab);
    };
  }, [isOpen]);

  useEffect(() => {
    const syncShellState = () => {
      const nextSolo = ClinicOperationsService.isSoloMode();
      setIsSoloMode(nextSolo);
      setCustomWidgets(ClinicOperationsService.getCustomWidgets());
      setSettingsViewMode(ClinicOperationsService.getSettingsViewMode());
      if (nextSolo) {
        setActiveTab((prev) => (prev === 'staff' ? 'clinic' : prev));
      }
    };
    syncShellState();
    const unsubOps = ClinicOperationsService.subscribe(syncShellState);
    window.addEventListener('physiorecord-modules-updated', syncShellState);
    return () => {
      unsubOps();
      window.removeEventListener('physiorecord-modules-updated', syncShellState);
    };
  }, [isOpen]);

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
  const isSearching = settingsSearchQuery.trim().length > 0;

  interface NavItemDef {
    id: SettingsTabId;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
    visible: boolean;
    hasDemoBadge?: boolean;
  }

  const clinicGroupItems: NavItemDef[] = [
    {
      id: 'clinic',
      label: bi('العيادة', 'Clinic', 'کلینیک'),
      subtitle: bi(
        'اسم العيادة، المعالج، الدوام، الشعار، قوالب واتساب والخدمات',
        'Clinic identity, working hours, logo, WhatsApp templates & services',
        'ناوی کلینیک، کاتی کار، لۆگۆ، داڕشتەی واتساپ و خزمەتگوزارییەکان'
      ),
      icon: <Building2 className="size-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'display',
      label: bi('اللغة والمظهر', 'Display', 'زمان و شێواز'),
      subtitle:
        deviceFormFactor === 'desktop'
          ? bi(
              'اللغة، الوضع الليلي والنهاري، الألوان، خطوط الحاسوب، عرض المحتوى والأداء',
              'Interface language, theme mode, desktop fonts, content width & performance',
              'زمان، دۆخی شەو/ڕۆژ، ڕەنگەکان، فۆنتی کۆمپیوتەر، پانی و کارایی'
            )
          : deviceFormFactor === 'tablet'
            ? bi(
                'اللغة، الوضع الليلي والنهاري، أزرار التابلت، حجم الخط وعرض المحتوى',
                'Interface language, theme mode, tablet touch targets, typography & width',
                'زمان، دۆخی شەو/ڕۆژ، دوگمەکانی تابلێت، قەبارەی فۆنت و پانی'
              )
            : bi(
                'اللغة، الوضع الليلي والنهاري، أزرار الهاتف، حجم الخط وخيارات الأداء',
                'Interface language, theme mode, mobile touch targets, typography & performance',
                'زمان، دۆخی شەو/ڕۆژ، دوگمەکانی مۆبایل، قەبارەی فۆنت و کارایی'
              ),
      icon: <Type className="size-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'currency',
      label: bi('العملة', 'Currency', 'دراو'),
      subtitle: bi(
        'اختيار العملة المعتمدة للفواتير والسجل المالي والمصاريف',
        'Select primary clinic currency for invoices, ledger & expenses',
        'هەڵبژاردنی دراوی پەسەندکراو بۆ پسوڵە و تۆماری دارایی'
      ),
      icon: <Coins className="size-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'staff',
      label: bi('الكادر', 'Staff', 'ستاف'),
      subtitle: bi(
        'إدارة المعالجين وموظفي الاستقبال وتخصيص الأدوار الوظيفية',
        'Manage therapists, receptionists & role permissions',
        'بەڕێوەبردنی چارەسەرکاران و کارمەندانی پێشوازی'
      ),
      icon: <Users className="size-4 shrink-0" />,
      visible: !isSoloMode && settingsViewMode === 'advanced',
    },
  ];

  const systemGroupItems: NavItemDef[] = [
    {
      id: 'modules',
      label: bi('الأقسام', 'Modules', 'بەشەکان'),
      subtitle: bi(
        'تفعيل أو إخفاء الوحدات السريرية، الزيارات المنزلية، الأقساط والمشاركة',
        'Enable or hide clinical tools, home visits, installments & sharing',
        'چالاککردن یان شاردنەوەی بەشە کلینیکییەکان و خزمەتگوزارییەکان'
      ),
      icon: <Dumbbell className="size-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'sync',
      label: bi('المزامنة والعيادة', 'Clinic Sync', 'هاوکاتکردنی کلینیک'),
      subtitle: bi(
        'مزامنة الواي فاي المحلي (بدون إنترنت) أو Google Drive المشفّر مجاناً ودليل التنصيب',
        'Local Wi-Fi (LAN) non-destructive sync, Encrypted Google Drive ($0) & setup guide',
        'هاوکاتکردنی وایفای ناوخۆیی یان گووگڵ درایڤی کۆدکراو بە خۆڕایی'
      ),
      icon: <Cloud className="size-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'security',
      label: bi('الأمان', 'Security', 'ئاسایش'),
      subtitle:
        deviceFormFactor === 'desktop'
          ? bi(
              'النسخ الاحتياطي والاسترداد، القفل التلقائي، قفل الحاسوب أو رمز PIN والتحديثات',
              'Encrypted backups, recovery drill, auto-lock, PC Lock / PIN & updates',
              'کۆپی یەدەگ، قفڵی خۆکار، قفڵی کۆمپیوتەر یان PIN و نوێکردنەوەکان'
            )
          : deviceFormFactor === 'tablet'
            ? bi(
                'النسخ الاحتياطي والاسترداد، القفل التلقائي، بصمة التابلت أو الوجه والتحديثات',
                'Encrypted backups, recovery drill, auto-lock, tablet biometrics & updates',
                'کۆپی یەدەگ، قفڵی خۆکار، پەنجەمۆر یان ڕووخساری تابلێت و نوێکردنەوەکان'
              )
            : bi(
                'النسخ الاحتياطي والاسترداد، القفل التلقائي، بصمة الهاتف أو الوجه والتحديثات',
                'Encrypted backups, recovery drill, auto-lock, phone biometrics & updates',
                'کۆپی یەدەگ، قفڵی خۆکار، پەنجەمۆر یان ڕووخساری مۆبایل و نوێکردنەوەکان'
              ),
      icon: <Shield className="size-4 shrink-0" />,
      visible: true,
    },
    {
      id: 'developer',
      label: bi('المطور', 'Developer', 'گەشەپێدەر'),
      subtitle: bi(
        'تحميل بيانات تجريبية للاستعراض وحذفها بنقرة واحدة',
        'Load synthetic demonstration cases and clear them in one click',
        'بارکردنی داتای تاقیکاری و سڕینەوەیان بە یەک کلیک'
      ),
      icon: <Database className="size-4 shrink-0" />,
      visible: settingsViewMode === 'advanced',
      hasDemoBadge: hasDemoRecords,
    },
  ];

  const allNavItems = [...clinicGroupItems, ...systemGroupItems];
  const activeNavItem = allNavItems.find((n) => n.id === activeTab) || clinicGroupItems[0];

  const handleSelectTab = (tabId: SettingsTabId) => {
    setActiveTab(tabId);
    setMobileView('detail');
    setSettingsSearchQuery('');
  };

  const MobileChevron = isRtl ? ChevronLeft : ChevronRight;
  const MobileBackArrow = isRtl ? ArrowRight : ArrowLeft;

  const renderNavButton = (item: NavItemDef) => {
    const selected = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={selected}
        data-testid={`settings-tab-${item.id}`}
        onClick={() => handleSelectTab(item.id)}
        className={`w-full min-h-[44px] md:min-h-[38px] px-3 py-2 rounded-xl text-start flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
          selected
            ? 'text-foreground hover:bg-layer-hover font-semibold md:bg-primary md:text-primary-foreground md:hover:bg-primary md:font-bold md:shadow-2xs'
            : 'text-foreground hover:bg-layer-hover font-semibold'
        }`}
      >
        <span className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className={`shrink-0 ${
              selected ? 'text-muted-foreground-1 md:text-primary-foreground' : 'text-muted-foreground-1'
            }`}
          >
            {item.icon}
          </span>
          <span className="text-xs sm:text-[13px] truncate">{item.label}</span>
          {item.hasDemoBadge && <DemoBadge />}
        </span>
        <MobileChevron className="size-4 text-muted-foreground-2 shrink-0 md:hidden" />
      </button>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end md:items-center justify-center md:p-4"
      dir={isRtl ? 'rtl' : 'ltr'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card border border-card-line rounded-t-2xl md:rounded-2xl w-full md:max-w-5xl h-[94dvh] md:h-[86vh] md:max-h-[820px] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Slim Unified Header */}
        <header className="px-4 sm:px-5 py-3 bg-surface/80 border-b border-card-divider flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Mobile Back Button when inside a section detail */}
            {mobileView === 'detail' && !isSearching ? (
              <button
                type="button"
                onClick={() => setMobileView('menu')}
                className="md:hidden min-h-[36px] px-2.5 py-1 rounded-xl bg-card border border-line-2 text-xs font-bold text-foreground inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <MobileBackArrow className="size-3.5" />
                <span>{bi('الإعدادات', 'Settings', 'ڕێکخستنەکان')}</span>
              </button>
            ) : (
              <span className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Settings className="size-4" />
              </span>
            )}

            <h2
              id="settings-modal-title"
              className="text-sm sm:text-base font-black text-foreground truncate"
            >
              <span className={mobileView === 'detail' && !isSearching ? 'hidden md:inline' : 'inline'}>
                {bi('الإعدادات', 'Settings', 'ڕێکخستنەکان')}
              </span>
              {mobileView === 'detail' && !isSearching && (
                <span className="md:hidden">{activeNavItem.label}</span>
              )}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Simple / Advanced Segmented Control */}
            <div className="inline-flex items-center rounded-xl bg-card border border-line-2 p-0.5 shrink-0">
              <button
                type="button"
                data-testid="settings-mode-simple-btn"
                aria-pressed={settingsViewMode === 'simple'}
                onClick={() => handleSwitchSettingsMode('simple')}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                  settingsViewMode === 'simple'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground'
                }`}
              >
                {bi('مبسط', 'Simple', 'سادە')}
              </button>
              <button
                type="button"
                data-testid="settings-mode-advanced-btn"
                aria-pressed={settingsViewMode === 'advanced'}
                onClick={() => handleSwitchSettingsMode('advanced')}
                className={`min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                  settingsViewMode === 'advanced'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground-1 hover:text-foreground'
                }`}
              >
                {bi('متقدم', 'Advanced', 'پێشکەوتوو')}
              </button>
            </div>

            {/* What's New Button */}
            <button
              type="button"
              data-testid="open-whats-new-btn"
              onClick={() => setIsWhatsNewOpen(true)}
              className="hidden sm:inline-flex min-h-[34px] px-2.5 py-1 rounded-xl bg-card hover:bg-layer-hover text-foreground border border-line-2 text-xs font-bold items-center gap-1.5 cursor-pointer shrink-0 transition-colors whitespace-nowrap"
              title={bi(
                `ما الجديد v${APP_SEMVER_VERSION}`,
                `What's New v${APP_SEMVER_VERSION}`,
                `نوێترین گۆڕانکارییەکان v${APP_SEMVER_VERSION}`
              )}
            >
              <Sparkles className="size-3.5 text-primary shrink-0" />
              <span>{bi('ما الجديد', "What's New", 'نوێترین')}</span>
              <span className="font-mono text-muted-foreground-1">
                <bdi dir="ltr">v{APP_SEMVER_VERSION}</bdi>
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={bi('إغلاق الإعدادات', 'Close settings', 'داخستنی ڕێکخستنەکان')}
              className="size-9 !p-0 rounded-xl bg-card hover:bg-layer-hover border border-line-2 text-foreground inline-flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <X className="size-4 shrink-0" />
            </button>
          </div>
        </header>

        {/* Split Layout Body: Desktop Sidebar + Content | Mobile Menu <-> Detail */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Sidebar (Desktop always visible | Mobile visible in menu or search) */}
          <aside
            className={`${
              mobileView === 'detail' && !isSearching
                ? 'hidden md:flex'
                : isSearching
                ? 'shrink-0 flex'
                : 'flex-1 md:flex-none flex'
            } flex-col w-full md:w-64 md:shrink-0 md:border-e border-card-divider bg-surface/40 overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]`}
          >
            {/* Search Input */}
            <div className="p-3 border-b border-card-divider/70 shrink-0">
              <div className="relative flex items-center">
                <Search className="size-3.5 text-muted-foreground-1 absolute start-3 inset-y-0 my-auto pointer-events-none z-10 shrink-0" />
                <input
                  type="text"
                  data-testid="settings-search-input"
                  aria-label={bi('بحث في الإعدادات', 'Search settings', 'گەڕان لە ڕێکخستنەکان')}
                  value={settingsSearchQuery}
                  onChange={(e) => setSettingsSearchQuery(e.target.value)}
                  placeholder={bi(
                    'ابحث (نسخ احتياطي، أمان، لغة، خط...)',
                    'Search (backup, security, font...)',
                    'گەڕان (کۆپی یەدەگ، ئاسایش، زمان...)'
                  )}
                  className="w-full min-h-[38px] ps-9 pe-9 py-1.5 rounded-xl bg-card border border-line-2 text-xs leading-normal text-foreground placeholder:text-muted-foreground-1 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
                />
                {isSearching && (
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
            </div>

            {/* Grouped Navigation List (hidden on mobile while typing search query so results fill below) */}
            <div
              role="tablist"
              aria-orientation="vertical"
              aria-label={bi('أقسام الإعدادات', 'Settings categories', 'بەشەکانی ڕێکخستن')}
              className={`${
                isSearching ? 'hidden md:flex' : 'flex'
              } flex-1 flex-col gap-4 p-3 overflow-y-auto`}
            >
              <div className="space-y-1">
                <div className="px-3 pb-1 text-xs font-bold text-muted-foreground-1">
                  {bi('العيادة والمظهر', 'Clinic & Appearance', 'کلینیک و شێواز')}
                </div>
                <div className="space-y-1 bg-card md:bg-transparent rounded-2xl md:rounded-none border border-card-line md:border-0 p-1.5 md:p-0">
                  {clinicGroupItems.filter((i) => i.visible).map(renderNavButton)}
                </div>
              </div>

              <div className="space-y-1">
                <div className="px-3 pb-1 text-xs font-bold text-muted-foreground-1">
                  {bi('الأقسام والأمان', 'Modules & Security', 'بەشەکان و ئاسایش')}
                </div>
                <div className="space-y-1 bg-card md:bg-transparent rounded-2xl md:rounded-none border border-card-line md:border-0 p-1.5 md:p-0">
                  {systemGroupItems.filter((i) => i.visible).map(renderNavButton)}
                </div>
              </div>

              {/* Mobile-only What's New quick row */}
              <div className="sm:hidden pt-1">
                <button
                  type="button"
                  onClick={() => setIsWhatsNewOpen(true)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-2xl bg-card border border-card-line text-foreground text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Sparkles className="size-4 text-primary shrink-0" />
                    <span>{bi('ما الجديد والتحديثات', "What's New", 'نوێترین گۆڕانکارییەکان')}</span>
                  </span>
                  <span className="font-mono text-muted-foreground-1">
                    <bdi dir="ltr">v{APP_SEMVER_VERSION}</bdi>
                  </span>
                </button>
              </div>
            </div>
          </aside>

          {/* Main Content Pane */}
          <main
            tabIndex={0}
            aria-label={bi('محتوى الإعدادات', 'Settings content', 'ناوەڕۆکی ڕێکخستنەکان')}
            className={`${
              mobileView === 'menu' && !isSearching ? 'hidden md:flex' : 'flex'
            } flex-1 flex-col min-h-0 overflow-y-auto bg-layer/30 p-4 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] focus:outline-none`}
          >
            <div className="w-full max-w-3xl mx-auto space-y-4">
              {/* Live Search Results Panel */}
              {isSearching && (() => {
                const matchedItems = filterSettingsCatalog(settingsSearchQuery, settingsViewMode);
                return (
                  <div
                    data-testid="settings-search-results"
                    className="p-3.5 rounded-2xl bg-card border border-primary/30 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-foreground">
                      <span>
                        {bi(
                          `نتائج البحث (${matchedItems.length})`,
                          `Matching Settings (${matchedItems.length})`,
                          `ئەنجامەکانی گەڕان (${matchedItems.length})`
                        )}
                      </span>
                    </div>
                    {matchedItems.length === 0 ? (
                      <p
                        data-testid="settings-search-empty"
                        className="text-xs text-muted-foreground-1 py-2"
                      >
                        {bi(
                          'لا توجد إعدادات مطابقة لبحثك.',
                          'No matching settings found.',
                          'هیچ ڕێکخستنێکی گونجاو نەدۆزرایەوە.'
                        )}
                      </p>
                    ) : (
                      <div className="divide-y divide-card-divider">
                        {matchedItems.map((item) => {
                          const ckbMeta = SETTINGS_CATALOG_CKB[item.id];
                          const isLockItem = item.id === 'hub-security-lock';
                          const itemTitle = isLockItem
                            ? deviceFormFactor === 'desktop'
                              ? bi(
                                  'قفل الحاسوب أو رمز PIN',
                                  'PC Lock, Windows Hello & PIN Unlock',
                                  'قفڵی کۆمپیوتەر یان کۆدی PIN'
                                )
                              : deviceFormFactor === 'tablet'
                                ? bi(
                                    'بصمة التابلت والقفل التلقائي',
                                    'Tablet Biometrics & Auto-Lock',
                                    'پەنجەمۆری تابلێت و قفڵی خۆکار'
                                  )
                                : bi(
                                    'بصمة الهاتف والقفل التلقائي',
                                    'Phone Biometrics & Auto-Lock',
                                    'پەنجەمۆری مۆبایل و قفڵی خۆکار'
                                  )
                            : bi(item.titleAr, item.titleEn, ckbMeta?.title);
                          const itemDesc = isLockItem
                            ? deviceFormFactor === 'desktop'
                              ? bi(
                                  'التحكم بقفل الحاسوب (Windows Hello) أو رمز PIN السريع ومؤقت الخمول لهذا الجهاز',
                                  'Manage PC Lock (Windows Hello), Quick PIN unlock & desktop auto-lock timer',
                                  'بەڕێوەبردنی قفڵی کۆمپیوتەر (Windows Hello)، کۆدی PIN و کاتی قفڵی خۆکار'
                                )
                              : deviceFormFactor === 'tablet'
                                ? bi(
                                    'إدارة بصمة الإصبع أو الوجه على التابلت ومؤقت القفل التلقائي لهذا الجهاز',
                                    'Manage tablet fingerprint/face unlock and auto-lock timeout for this tablet',
                                    'بەڕێوەبردنی پەنجەمۆر یان ناسینەوەی ڕووخسار و قفڵی خۆکار بۆ ئەم تابلێتە'
                                  )
                                : bi(
                                    'إدارة بصمة الهاتف أو الوجه (Biometrics) ومؤقت القفل التلقائي لهذا الجهاز',
                                    'Manage phone fingerprint/face unlock and auto-lock timeout for this phone',
                                    'بەڕێوەبردنی پەنجەمۆر یان ناسینەوەی ڕووخساری مۆبایل و قفڵی خۆکار'
                                  )
                            : bi(item.descAr, item.descEn, ckbMeta?.desc);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              data-testid={`settings-search-result-${item.id}`}
                              onClick={() => {
                                if (item.isAdvanced && settingsViewMode === 'simple') {
                                  handleSwitchSettingsMode('advanced');
                                }
                                handleSelectTab(item.tab);
                              }}
                              className="w-full text-start py-2.5 px-2 rounded-xl hover:bg-surface flex items-start justify-between gap-2 cursor-pointer transition-colors"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-bold text-foreground">
                                    {itemTitle}
                                  </span>
                                  {item.isAdvanced && (
                                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                      · {bi('متقدم', 'Advanced', 'پێشکەوتوو')}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground-1">
                                  {itemDesc}
                                </p>
                              </div>
                              <span className="text-xs font-bold text-primary shrink-0">
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

              {/* Active Tab Section (Hidden on mobile while showing search results from menu) */}
              <div className={isSearching && mobileView === 'menu' ? 'hidden md:block space-y-4' : 'space-y-4'}>
                {/* Clean Section Title Header */}
                <div className="pb-2 border-b border-card-divider">
                  <h3 className="text-base font-black text-foreground">{activeNavItem.label}</h3>
                  <p className="text-xs text-muted-foreground-1 mt-0.5 leading-relaxed">
                    {activeNavItem.subtitle}
                  </p>
                </div>

                {activeTab === 'display' && (
                  <DisplaySettingsTab settingsViewMode={settingsViewMode} />
                )}

                {activeTab === 'currency' && <CurrencySettingsTab />}

                {activeTab === 'clinic' && (
                  <ClinicProfileSettingsTab
                    isModalOpen={isOpen}
                    isSoloMode={isSoloMode}
                    settingsViewMode={settingsViewMode}
                    onSoloModeChanged={setIsSoloMode}
                  />
                )}

                {activeTab === 'staff' && <StaffRosterSettingsTab isModalOpen={isOpen} />}

                {activeTab === 'sync' && (
                  <Suspense fallback={null}>
                    <ClinicSyncSettingsTab />
                  </Suspense>
                )}

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
            </div>
          </main>
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
