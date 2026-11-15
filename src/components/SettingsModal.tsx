// =======================================================================
// PhysioRecord — Clinic Settings & Developer Modal
// - Currency: Select primary world currency (Default: IQD)
// - Staff: Edit and customize clinic staff roster (Admin, Senior PT, PT, Reception)
// - Security: Inactivity Auto-Lock (default 5 min, configurable) & Admin PIN
// - Developer: Load Demo Data & One-Click Delete All Demo Data
// =======================================================================

import React, { useState, useEffect, Suspense } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useVault } from '../context/VaultContext';
import { usePatients } from '../context/PatientContext';
import { useCurrency } from '../context/CurrencyContext';
import { useTheme, THEME_PALETTE_OPTIONS } from '../context/ThemeContext';
import { AppearanceDisplaySettings } from './settings/AppearanceDisplaySettings';
import { requestPersistentStorage } from '../db/db';
import { ClinicOperationsService, ROLE_PERMISSIONS } from '../services/clinicOperationsService';
import type {
  ClinicStaffMember,
  ClinicRoleId,
  ClinicProfileData,
  ClinicServiceItem,
  SettingsViewMode,
  WeekdayIndex,
  WhatsAppTemplatesConfig,
} from '../types/clinicManagement';
import type { CustomWidgetDefinition } from '../types/clinicalWidgets';
import {
  APP_SEMVER_VERSION,
  filterSettingsCatalog,
} from '../utils/settingsOnboardingPhaseF';

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
import {
  detectSpeechDictationSupport,
  type DictationCapabilityStatus,
} from '../utils/localSpeech';
import type { NoteTemplateCategory, NoteTemplateSnippet } from '../types/clinicManagement';
import { hasAnyDemoPatients } from '../utils/mrn';
import { DemoBadge, Money, MoneyInput, TimePickerInput } from './ui/Primitives';
import { processClinicImageUpload, isValidEncryptedImageDataUrl } from '../utils/imageUtils';
import { copySecretWithAutoClear } from '../utils/clipboardPrivacy';
import {
  getAppRuntimeTarget,
  getElectronDesktopBridge,
  isElectronDesktop,
  type ElectronDesktopUpdateStatus,
} from '../platform/nativeBridge';
import {
  X,
  Settings,
  Shield,
  Database,
  Clock,
  KeyRound,
  Trash2,
  Sparkles,
  CheckCircle2,
  Coins,
  Users,
  Edit2,
  Search,
  RotateCcw,
  Check,
  UserCheck,
  Dumbbell,
  Eye,
  EyeOff,
  Building2,
  HardDrive,
  Fingerprint,
  Activity,
  RefreshCw,
  AlertTriangle,
  Plus,
  Copy,
  Sun,
  Moon,
  Tag,
  Compass,
  Type,
  Target,
  ImagePlus,
  MessageSquare,
  FileSignature,
  Camera,
  Mic,
  BarChart3,
  TabletSmartphone,
  FileCode2,
  Languages,
  FileSpreadsheet,
  Upload,
  Share2,
} from 'lucide-react';

const SETTINGS_CATALOG_CKB: Record<string, { title: string; desc: string; category: string }> = {
  'hub-clinic-profile': {
    title: 'پرۆفایلی کلینیک و کاتژمێرەکانی کار',
    desc: 'ناو، ناونیشان، لۆگۆ، کاتی دەوام و شێوازی کارکردن',
    category: 'کلینیک',
  },
  'hub-backup-restore': {
    title: 'کۆپی یەدەگ و گەڕاندنەوە',
    desc: 'ناردنەدەرەوە و گەڕاندنەوەی داتابەیسی کۆدکراو',
    category: 'ئاسایش',
  },
  'hub-security-lock': {
    title: 'ئاسایش و قفڵی خۆکار',
    desc: 'کاتی قفڵبوون، کۆدی بەڕێوەبەر و بایۆمەتری',
    category: 'ئاسایش',
  },
  'hub-language-accessibility': {
    title: 'زمان، شێواز و فۆنت',
    desc: 'زمانی ڕووکار، دۆخی شەو، قەبارەی فۆنت و کەمکردنەوەی جووڵە',
    category: 'ڕووکار',
  },
  'hub-currency': {
    title: 'دراوی کلینیک',
    desc: 'هەڵبژاردنی دراوی سەرەکی و شێوازی نیشاندان',
    category: 'دراو',
  },
  'hub-modules-essential': {
    title: 'بەشەکان و کاراییە سەرەکییەکان',
    desc: 'چالاککردن یان ناچالاککردنی بەشە کلینیکییەکان',
    category: 'بەشەکان',
  },
  'adv-staff-roster': {
    title: 'لیستی ستاف و دەسەڵاتەکان',
    desc: 'دەستکاریکردنی ناو، پسپۆڕی و ڕۆڵی ئەندامانی ستاف',
    category: 'پێشکەوتوو',
  },
  'adv-crypto-rotation': {
    title: 'سووڕانەوەی کلیلی کۆدکردن و ڕاهێنان',
    desc: 'نوێکردنەوەی کلیلی DEK و پشکنینی گەڕاندنەوە',
    category: 'ئاسایش',
  },
  'adv-widget-studio': {
    title: 'ستۆدیۆی فۆرمی تایبەت',
    desc: 'دروستکردنی فۆرم و هەڵسەنگاندنی کلینیکی تایبەت',
    category: 'بەشەکان',
  },
  'adv-developer-demo': {
    title: 'گەشەپێدەر و داتای نموونەیی',
    desc: 'بارکردن یان سڕینەوەی داتای تاقیکردنەوە',
    category: 'گەشەپێدەر',
  },
};

const THEME_PALETTE_CKB: Record<string, string> = {
  'theme-clinical-default': 'کلینیکی سەرەتایی',
  'theme-ocean-blue': 'شینی زەریایی',
  'theme-royal-indigo': 'نیلی شاهانە',
  'theme-emerald-care': 'سەوزی زمڕودی',
};

const STAFF_ROLE_CKB: Record<ClinicRoleId, string> = {
  admin: 'بەڕێوەبەر',
  senior_pt: 'چارەسەرکاری سروشتی باڵا',
  assistant_pt: 'چارەسەرکاری سروشتی',
  receptionist: 'پێشوازی و ژمێریاری',
};

const CURRENCY_NAME_CKB: Record<string, string> = {
  IQD: 'دیناری عێراقی',
  USD: 'دۆلاری ئەمریکی',
  EUR: 'یۆرۆ',
  GBP: 'پاوەندی بەریتانی',
  SAR: 'ڕیاڵی سعوودی',
  AED: 'درهەمی ئیماراتی',
  KWD: 'دیناری کوێتی',
  QAR: 'ڕیاڵی قەتەری',
  BHD: 'دیناری بەحرەینی',
  OMR: 'ڕیاڵی عومانی',
  JOD: 'دیناری ئوردنی',
  EGP: 'پاوەندی میسری',
  LBP: 'لیرەی لوبنانی',
  SYP: 'لیرەی سووری',
  LYD: 'دیناری لیبی',
  TND: 'دیناری تونسی',
  DZD: 'دیناری جەزائیری',
  MAD: 'درهەمی مەغریبی',
  SDG: 'پاوەندی سوودانی',
  YER: 'ڕیاڵی یەمەنی',
  TRY: 'لیرەی تورکی',
  CAD: 'دۆلاری کەنەدی',
  AUD: 'دۆلاری ئوسترالی',
  CHF: 'فرانکی سویسری',
  JPY: 'یەنی ژاپۆنی',
  CNY: 'یوانی چینی',
  INR: 'ڕوپیەی هیندی',
  SEK: 'کرۆنی سویدی',
  NOK: 'کرۆنی نەرویجی',
  DKK: 'کرۆنی دانیمارکی',
  MYR: 'ڕینگیتی مالیزی',
};

const SPEECH_REASON_CKB: Record<string, string> = {
  'المتصفح الحالي لا يدعم واجهة التعرف الصوتي (Web Speech API).':
    'وێبگەڕی ئێستا پشتگیری ڕووکاری ناسینەوەی دەنگ (Web Speech API) ناکات.',
  'نموذج التعرف الصوتي المحلي داخل الجهاز جاهز ويعمل بدون اتصال.':
    'مۆدێلی ناسینەوەی دەنگی ناوخۆیی لەسەر ئامێرەکە ئامادەیە و بە بێ ئینتەرنێت کاردەکات.',
  'تنبيه خصوصية: تم تفعيل وضع السحابة الاختياري لعدم توفر نموذج محلي.':
    'ئاگاداری نهێنیپارێزی: دۆخی هەوری بژاردەیی چالاککرا چونکە مۆدێلی ناوخۆیی بەردەست نییە.',
  'تم إخفاء الإملاء الصوتي تلقائياً لعدم توفر نموذج تعرّف محلي على هذا الجهاز.':
    'نووسینی دەنگی بە شێوەی خۆکار شاردرایەوە چونکە مۆدێلی ناسینەوەی ناوخۆیی لەسەر ئەم ئامێرە بەردەست نییە.',
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDemoModal: () => void;
  onOpenBackupModal?: () => void;
  onStartTour?: () => void;
  initialTab?: 'currency' | 'clinic' | 'display' | 'staff' | 'security' | 'modules' | 'developer';
}

const PRESET_LOCK_MS = [
  1 * 60 * 1000,
  5 * 60 * 1000,
  10 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  0,
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenDemoModal,
  onOpenBackupModal,
  onStartTour,
  initialTab = 'currency',
}) => {
  const { language, setLanguage, isRtl, bi } = useLanguage();
  const {
    theme,
    toggleTheme,
    themePalette,
    setThemePalette,
  } = useTheme();
  const {
    autoLockTimeoutMs,
    setAutoLockTimeoutMs,
    persistenceGranted,
    keyUsageStatus,
    refreshKeyUsageStatus,
    rotateDekNow,
    lastRecoveryDrillAt,
    isPrfSupported,
    isPrfEnrolled,
    enrollPrf,
    disablePrf,
  } = useVault();
  const { patients, deleteAllDemoPatients, refreshPatients } = usePatients();
  const { currency, setCurrencyCode, availableCurrencies } = useCurrency();

  const [activeTab, setActiveTab] = useState<'currency' | 'clinic' | 'display' | 'staff' | 'security' | 'modules' | 'developer'>(initialTab);
  const [settingsViewMode, setSettingsViewMode] = useState<SettingsViewMode>(() =>
    ClinicOperationsService.getSettingsViewMode()
  );
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [desktopUpdateStatus, setDesktopUpdateStatus] = useState<ElectronDesktopUpdateStatus | null>(null);
  const [checkingDesktopUpdate, setCheckingDesktopUpdate] = useState(false);

  const handleSwitchSettingsMode = (mode: SettingsViewMode) => {
    setSettingsViewMode(mode);
    ClinicOperationsService.setSettingsViewMode(mode);
    if (mode === 'simple' && (activeTab === 'developer' || activeTab === 'staff')) {
      setActiveTab('clinic');
    }
  };

  const [currencySearch, setCurrencySearch] = useState('');
  const [showExerciseLibrary, setShowExerciseLibrary] = useState<boolean>(() =>
    ClinicOperationsService.isExerciseLibraryVisible()
  );
  const [enableWidgetStudio, setEnableWidgetStudio] = useState<boolean>(() =>
    ClinicOperationsService.isCustomWidgetStudioEnabled()
  );
  const [enableSmartGoalsGas, setEnableSmartGoalsGas] = useState<boolean>(() =>
    ClinicOperationsService.isSmartGoalsGasEnabled()
  );
  const [enableConsentModule, setEnableConsentModule] = useState<boolean>(() =>
    ClinicOperationsService.isConsentModuleEnabled()
  );
  // Phase 5 Module Toggles (ALL OFF BY DEFAULT per R6)
  const [enableAttachmentsModule, setEnableAttachmentsModule] = useState<boolean>(() =>
    ClinicOperationsService.isAttachmentsModuleEnabled()
  );
  const [enableVoiceDictationModule, setEnableVoiceDictationModule] = useState<boolean>(() =>
    ClinicOperationsService.isVoiceDictationModuleEnabled()
  );
  const [allowCloudSpeechOptIn, setAllowCloudSpeechOptIn] = useState<boolean>(() =>
    ClinicOperationsService.isCloudSpeechFallbackOptIn()
  );
  const [enableTemplatesModule, setEnableTemplatesModule] = useState<boolean>(() =>
    ClinicOperationsService.isTemplatesModuleEnabled()
  );
  const [enableAnalyticsModule, setEnableAnalyticsModule] = useState<boolean>(() =>
    ClinicOperationsService.isAnalyticsModuleEnabled()
  );
  const [enableKioskModule, setEnableKioskModule] = useState<boolean>(() =>
    ClinicOperationsService.isKioskModuleEnabled()
  );
  const [speechCheckStatus, setSpeechCheckStatus] = useState<DictationCapabilityStatus | null>(null);
  const [noteTemplates, setNoteTemplates] = useState<NoteTemplateSnippet[]>(() =>
    ClinicOperationsService.getAllNoteTemplates()
  );
  const [newTplTrigger, setNewTplTrigger] = useState('');
  const [newTplTitle, setNewTplTitle] = useState('');
  const [newTplBody, setNewTplBody] = useState('');
  const [newTplCategory, setNewTplCategory] = useState<NoteTemplateCategory>('general');
  const [packImportStatus, setPackImportStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isCsvOnboardingOpen, setIsCsvOnboardingOpen] = useState(false);
  const [isFullExportOpen, setIsFullExportOpen] = useState(false);
  const [isRecoveryDrillOpen, setIsRecoveryDrillOpen] = useState(false);
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplatesConfig>(() =>
    ClinicOperationsService.getWhatsAppTemplates()
  );
  const [waSaving, setWaSaving] = useState(false);
  const [waSaved, setWaSaved] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetDefinition[]>(() =>
    ClinicOperationsService.getCustomWidgets()
  );
  const [isWidgetStudioOpen, setIsWidgetStudioOpen] = useState(false);

  // Phase 2: Solo/Team Mode, Custom Clinic Services, Comfort & Onboarding
  const [isSoloMode, setIsSoloMode] = useState<boolean>(() =>
    ClinicOperationsService.isSoloMode()
  );
  const [switchingMode, setSwitchingMode] = useState(false);
  const [clinicServices, setClinicServices] = useState<ClinicServiceItem[]>(() =>
    ClinicOperationsService.getClinicServices()
  );
  const [newSvcNameAr, setNewSvcNameAr] = useState('');
  const [newSvcNameEn, setNewSvcNameEn] = useState('');
  const [newSvcType, setNewSvcType] = useState<ClinicServiceItem['invoiceType']>('single_session');
  const [newSvcPrice, setNewSvcPrice] = useState<number>(0);
  const [newSvcPkgSessions, setNewSvcPkgSessions] = useState<string>('6');
  const [tipsEnabled, setTipsEnabled] = useState<boolean>(() =>
    ClinicOperationsService.getOnboardingState().tipsEnabled
  );

  // Phase B Modules & Clinical Safety Controls
  const [enableProblemListGoals, setEnableProblemListGoals] = useState<boolean>(() =>
    ClinicOperationsService.isProblemListGoalsEnabled()
  );
  const [enableReEvalNudges, setEnableReEvalNudges] = useState<boolean>(() =>
    ClinicOperationsService.isReEvalNudgesEnabled()
  );
  const [reEvalConfig, setReEvalConfig] = useState(() =>
    ClinicOperationsService.getReEvalNudgeConfig()
  );
  const [enableNoteCompletenessCheck, setEnableNoteCompletenessCheck] = useState<boolean>(() =>
    ClinicOperationsService.isNoteCompletenessCheckEnabled()
  );
  const [enablePerformanceTestLibrary, setEnablePerformanceTestLibrary] = useState<boolean>(() =>
    ClinicOperationsService.isPerformanceTestLibraryEnabled()
  );
  const [modalityReviewStatus, setModalityReviewStatus] = useState(() =>
    ClinicOperationsService.getModalitySafetyReviewStatus()
  );
  const [reviewerNameDraft, setReviewerNameDraft] = useState<string>(
    () => ClinicOperationsService.getModalitySafetyReviewStatus().reviewedBy || ''
  );
  const [enableVitalsModule, setEnableVitalsModule] = useState<boolean>(() =>
    ClinicOperationsService.isVitalsModuleEnabled()
  );
  const [enablePediatricSafeguards, setEnablePediatricSafeguards] = useState<boolean>(() =>
    ClinicOperationsService.isPediatricSafeguardsEnabled()
  );

  // Phase C: Iraq-Specific Operations Toggles
  const [enableHomeVisits, setEnableHomeVisits] = useState<boolean>(() =>
    ClinicOperationsService.isHomeVisitsEnabled()
  );
  const [enablePracticeLocations, setEnablePracticeLocations] = useState<boolean>(() =>
    ClinicOperationsService.isPracticeLocationsEnabled()
  );
  const [enableClosedDaysBreaks, setEnableClosedDaysBreaks] = useState<boolean>(() =>
    ClinicOperationsService.isClosedDaysBreaksEnabled()
  );
  const [enableHijriDateDisplay, setEnableHijriDateDisplay] = useState<boolean>(() =>
    ClinicOperationsService.isHijriDateDisplayEnabled()
  );
  const [enableInstallmentPlans, setEnableInstallmentPlans] = useState<boolean>(() =>
    ClinicOperationsService.isInstallmentPlansEnabled()
  );
  const [enableRecurringExpenses, setEnableRecurringExpenses] = useState<boolean>(() =>
    ClinicOperationsService.isRecurringExpensesEnabled()
  );
  const [enableReferralsModule, setEnableReferralsModule] = useState<boolean>(() =>
    ClinicOperationsService.isReferralsModuleEnabled()
  );
  const [enableRetentionLists, setEnableRetentionLists] = useState<boolean>(() =>
    ClinicOperationsService.isRetentionListsEnabled()
  );
  const [retentionInactiveDays, setRetentionInactiveDays] = useState<number>(() =>
    ClinicOperationsService.getRetentionInactiveDaysThreshold()
  );

  // Phase D: Data Quality, Import, Recycle Bin & Terminology Toggles
  const [enableImportWizard, setEnableImportWizard] = useState<boolean>(() =>
    ClinicOperationsService.isImportWizardEnabled()
  );
  const [enableTrashRecycleBin, setEnableTrashRecycleBin] = useState<boolean>(() =>
    ClinicOperationsService.isTrashRecycleBinEnabled()
  );
  const [enableDataHealthScreen, setEnableDataHealthScreen] = useState<boolean>(() =>
    ClinicOperationsService.isDataHealthScreenEnabled()
  );
  const [enableBilingualGlossary, setEnableBilingualGlossary] = useState<boolean>(() =>
    ClinicOperationsService.isBilingualTerminologyGlossaryEnabled()
  );

  // Phase E: Sharing, .ics Calendar Export, Schedule/Visit Card Print & Photo Tools
  const [enableWebShareInterop, setEnableWebShareInterop] = useState<boolean>(() =>
    ClinicOperationsService.isWebShareInteropEnabled()
  );
  const [enableIcsCalendarExport, setEnableIcsCalendarExport] = useState<boolean>(() =>
    ClinicOperationsService.isIcsCalendarExportEnabled()
  );
  const [enableScheduleVisitCardPrint, setEnableScheduleVisitCardPrint] = useState<boolean>(() =>
    ClinicOperationsService.isScheduleVisitCardPrintEnabled()
  );
  const [enablePhotoMeasurementTools, setEnablePhotoMeasurementTools] = useState<boolean>(() =>
    ClinicOperationsService.isPhotoMeasurementToolsEnabled()
  );

  useEffect(() => {
    if (isOpen) {
      void ClinicOperationsService.ensureColdStoreLoadedAsync('noteTemplates');
      void ClinicOperationsService.ensureColdStoreLoadedAsync('customWidgets');
    }
    const syncP2 = () => {
      const nextSolo = ClinicOperationsService.isSoloMode();
      setIsSoloMode(nextSolo);
      setClinicServices(ClinicOperationsService.getClinicServices());
      setTipsEnabled(ClinicOperationsService.getOnboardingState().tipsEnabled);
      setEnableAttachmentsModule(ClinicOperationsService.isAttachmentsModuleEnabled());
      setEnableVoiceDictationModule(ClinicOperationsService.isVoiceDictationModuleEnabled());
      setAllowCloudSpeechOptIn(ClinicOperationsService.isCloudSpeechFallbackOptIn());
      setEnableTemplatesModule(ClinicOperationsService.isTemplatesModuleEnabled());
      setEnableAnalyticsModule(ClinicOperationsService.isAnalyticsModuleEnabled());
      setEnableKioskModule(ClinicOperationsService.isKioskModuleEnabled());
      setNoteTemplates(ClinicOperationsService.getAllNoteTemplates());
      setCustomWidgets(ClinicOperationsService.getCustomWidgets());
      setEnableProblemListGoals(ClinicOperationsService.isProblemListGoalsEnabled());
      setEnableReEvalNudges(ClinicOperationsService.isReEvalNudgesEnabled());
      setReEvalConfig(ClinicOperationsService.getReEvalNudgeConfig());
      setEnableNoteCompletenessCheck(ClinicOperationsService.isNoteCompletenessCheckEnabled());
      setEnablePerformanceTestLibrary(ClinicOperationsService.isPerformanceTestLibraryEnabled());
      const modReview = ClinicOperationsService.getModalitySafetyReviewStatus();
      setModalityReviewStatus(modReview);
      if (modReview.reviewedBy && !reviewerNameDraft) {
        setReviewerNameDraft(modReview.reviewedBy);
      }
      setEnableVitalsModule(ClinicOperationsService.isVitalsModuleEnabled());
      setEnablePediatricSafeguards(ClinicOperationsService.isPediatricSafeguardsEnabled());
      setEnableHomeVisits(ClinicOperationsService.isHomeVisitsEnabled());
      setEnablePracticeLocations(ClinicOperationsService.isPracticeLocationsEnabled());
      setEnableClosedDaysBreaks(ClinicOperationsService.isClosedDaysBreaksEnabled());
      setEnableHijriDateDisplay(ClinicOperationsService.isHijriDateDisplayEnabled());
      setEnableInstallmentPlans(ClinicOperationsService.isInstallmentPlansEnabled());
      setEnableRecurringExpenses(ClinicOperationsService.isRecurringExpensesEnabled());
      setEnableReferralsModule(ClinicOperationsService.isReferralsModuleEnabled());
      setEnableRetentionLists(ClinicOperationsService.isRetentionListsEnabled());
      setRetentionInactiveDays(ClinicOperationsService.getRetentionInactiveDaysThreshold());
      setEnableImportWizard(ClinicOperationsService.isImportWizardEnabled());
      setEnableTrashRecycleBin(ClinicOperationsService.isTrashRecycleBinEnabled());
      setEnableDataHealthScreen(ClinicOperationsService.isDataHealthScreenEnabled());
      setEnableBilingualGlossary(
        ClinicOperationsService.isBilingualTerminologyGlossaryEnabled()
      );
      setEnableWebShareInterop(ClinicOperationsService.isWebShareInteropEnabled());
      setEnableIcsCalendarExport(ClinicOperationsService.isIcsCalendarExportEnabled());
      setEnableScheduleVisitCardPrint(ClinicOperationsService.isScheduleVisitCardPrintEnabled());
      setEnablePhotoMeasurementTools(ClinicOperationsService.isPhotoMeasurementToolsEnabled());
      setSettingsViewMode(ClinicOperationsService.getSettingsViewMode());
      if (nextSolo && activeTab === 'staff') {
        setActiveTab('clinic');
      }
    };
    syncP2();
    return ClinicOperationsService.subscribe(syncP2);
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'modules') return;
    const tag = language === 'en' ? 'en-US' : language === 'ckb' ? 'ckb-IQ' : 'ar-IQ';
    void detectSpeechDictationSupport(tag, allowCloudSpeechOptIn)
      .then(setSpeechCheckStatus)
      .catch(() => {});
  }, [isOpen, activeTab, language, allowCloudSpeechOptIn]);

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

  const handleSwitchWorkspaceMode = async (mode: 'solo' | 'team') => {
    setSwitchingMode(true);
    try {
      await ClinicOperationsService.switchWorkspaceModeAsync(mode);
      setIsSoloMode(mode === 'solo');
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleAddClinicService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSvcNameAr.trim() && !newSvcNameEn.trim()) return;
    const ar = newSvcNameAr.trim() || newSvcNameEn.trim();
    const en = newSvcNameEn.trim() || newSvcNameAr.trim();
    const pkgCount =
      newSvcType === 'rehab_package'
        ? Math.max(2, parseInt(newSvcPkgSessions, 10) || 6)
        : undefined;
    const item: ClinicServiceItem = {
      id: `svc_${crypto.randomUUID()}`,
      nameAr: ar,
      nameEn: en,
      invoiceType: newSvcType,
      priceIQD: Math.max(0, newSvcPrice || 0),
      packageSessions: pkgCount,
      isActive: true,
    };
    const next = [...clinicServices, item];
    setClinicServices(next);
    setNewSvcNameAr('');
    setNewSvcNameEn('');
    setNewSvcPrice(0);
    await ClinicOperationsService.saveClinicServicesAsync(next);
  };

  const handleDeleteClinicService = async (id: string) => {
    const next = clinicServices.filter((s) => s.id !== id);
    setClinicServices(next);
    await ClinicOperationsService.saveClinicServicesAsync(next);
  };

  // Encrypted Clinic Profile State (Phase 1.2)
  const [clinicProfile, setClinicProfile] = useState<ClinicProfileData>(() =>
    ClinicOperationsService.getClinicProfile()
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Storage Health & Key Rotation State (Phase 1.5 / 1.8 / 1.13)
  const [storageEstimate, setStorageEstimate] = useState<{ usageMB: number; quotaMB: number } | null>(null);
  const [localPersistenceState, setLocalPersistenceState] = useState<boolean>(persistenceGranted);
  const [rotatingDek, setRotatingDek] = useState(false);
  const [rotatedRecoveryKey, setRotatedRecoveryKey] = useState<string | null>(null);
  const [copiedRotatedKey, setCopiedRotatedKey] = useState(false);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [prfBusy, setPrfBusy] = useState(false);
  const [prfError, setPrfError] = useState<string | null>(null);

  const [isCustomLockMode, setIsCustomLockMode] = useState<boolean>(
    () => !PRESET_LOCK_MS.includes(autoLockTimeoutMs)
  );
  const [customLockMinutes, setCustomLockMinutes] = useState<string>(() =>
    autoLockTimeoutMs > 0 ? String(Math.max(1, Math.round(autoLockTimeoutMs / 60_000))) : '10'
  );

  useEffect(() => {
    const syncState = () => {
      setShowExerciseLibrary(ClinicOperationsService.isExerciseLibraryVisible());
      setEnableWidgetStudio(ClinicOperationsService.isCustomWidgetStudioEnabled());
      setEnableSmartGoalsGas(ClinicOperationsService.isSmartGoalsGasEnabled());
      setEnableConsentModule(ClinicOperationsService.isConsentModuleEnabled());
      setEnableWebShareInterop(ClinicOperationsService.isWebShareInteropEnabled());
      setEnableIcsCalendarExport(ClinicOperationsService.isIcsCalendarExportEnabled());
      setEnableScheduleVisitCardPrint(ClinicOperationsService.isScheduleVisitCardPrintEnabled());
      setEnablePhotoMeasurementTools(ClinicOperationsService.isPhotoMeasurementToolsEnabled());
      setWhatsappTemplates(ClinicOperationsService.getWhatsAppTemplates());
      setCustomWidgets(ClinicOperationsService.getCustomWidgets());
      setStaffRoster(ClinicOperationsService.getStaffRoster());
    };
    const unsubOps = ClinicOperationsService.subscribe(syncState);
    window.addEventListener('physiorecord-modules-updated', syncState);
    return () => {
      unsubOps();
      window.removeEventListener('physiorecord-modules-updated', syncState);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setShowExerciseLibrary(ClinicOperationsService.isExerciseLibraryVisible());
      setEnableWidgetStudio(ClinicOperationsService.isCustomWidgetStudioEnabled());
      setEnableSmartGoalsGas(ClinicOperationsService.isSmartGoalsGasEnabled());
      setEnableConsentModule(ClinicOperationsService.isConsentModuleEnabled());
      setEnableWebShareInterop(ClinicOperationsService.isWebShareInteropEnabled());
      setEnableIcsCalendarExport(ClinicOperationsService.isIcsCalendarExportEnabled());
      setEnableScheduleVisitCardPrint(ClinicOperationsService.isScheduleVisitCardPrintEnabled());
      setEnablePhotoMeasurementTools(ClinicOperationsService.isPhotoMeasurementToolsEnabled());
      setWhatsappTemplates(ClinicOperationsService.getWhatsAppTemplates());
      setCustomWidgets(ClinicOperationsService.getCustomWidgets());
      setClinicProfile(ClinicOperationsService.getClinicProfile());
      setImageUploadError(null);
      setStaffRoster(ClinicOperationsService.getStaffRoster());
      setLocalPersistenceState(persistenceGranted);
      setRotatedRecoveryKey(null);
      setRotationError(null);
      setPrfError(null);
      void refreshKeyUsageStatus();
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        void navigator.storage.estimate().then((est) => {
          setStorageEstimate({
            usageMB: Math.round(((est.usage || 0) / (1024 * 1024)) * 10) / 10,
            quotaMB: Math.round(((est.quota || 0) / (1024 * 1024)) * 10) / 10,
          });
        }).catch(() => {
          setStorageEstimate(null);
        });
      }
      const isPreset = PRESET_LOCK_MS.includes(autoLockTimeoutMs);
      setIsCustomLockMode(!isPreset);
      if (autoLockTimeoutMs > 0) {
        setCustomLockMinutes(String(Math.max(1, Math.round(autoLockTimeoutMs / 60_000))));
      }
    }
    // Sync modal draft state on open only so typing a preset-matching value in Custom mode stays open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const [adminPinInput, setAdminPinInput] = useState('');
  const [adminPinConfirm, setAdminPinConfirm] = useState('');
  const [adminPinError, setAdminPinError] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);
  const [deletingDemo, setDeletingDemo] = useState(false);
  const [confirmDeleteDemo, setConfirmDeleteDemo] = useState(false);
  const [demoDeletedMsg, setDemoDeletedMsg] = useState(false);

  // Staff Roster Management State
  const [staffRoster, setStaffRoster] = useState<ClinicStaffMember[]>(() =>
    ClinicOperationsService.getStaffRoster()
  );
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editingNameAr, setEditingNameAr] = useState('');
  const [editingNameEn, setEditingNameEn] = useState('');
  const [editingSpecialtyAr, setEditingSpecialtyAr] = useState('');
  const [editingSpecialtyEn, setEditingSpecialtyEn] = useState('');
  const [editingRole, setEditingRole] = useState<ClinicRoleId>('senior_pt');
  const [staffSavedMsg, setStaffSavedMsg] = useState(false);

  if (!isOpen) return null;

  const hasDemoRecords =
    hasAnyDemoPatients(patients) || ClinicOperationsService.hasDemoOperationsData();

  const handleStartEditStaff = (member: ClinicStaffMember) => {
    setEditingStaffId(member.id);
    setEditingNameAr(member.nameAr);
    setEditingNameEn(member.nameEn);
    setEditingSpecialtyAr(member.specialtyAr);
    setEditingSpecialtyEn(member.specialtyEn);
    setEditingRole(member.role);
  };

  const handleCancelEditStaff = () => {
    setEditingStaffId(null);
  };

  const handleSaveStaffMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffId || !editingNameAr.trim()) return;

    const updatedRoster = staffRoster.map((s) =>
      s.id === editingStaffId
        ? {
            ...s,
            nameAr: editingNameAr.trim(),
            nameEn: editingNameEn.trim() || editingNameAr.trim(),
            specialtyAr: editingSpecialtyAr.trim(),
            specialtyEn: editingSpecialtyEn.trim() || editingSpecialtyAr.trim(),
            role: editingRole,
          }
        : s
    );

    setStaffRoster(updatedRoster);
    ClinicOperationsService.saveStaffRoster(updatedRoster);
    setEditingStaffId(null);
    setStaffSavedMsg(true);
    setTimeout(() => setStaffSavedMsg(false), 2500);
  };

  const handleSaveAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPinError(null);
    if (adminPinInput.trim().length < 4) {
      setAdminPinError(
        bi(
          'يجب أن لا يقل الرمز عن 4 خانات.',
          'Admin PIN must be at least 4 characters.',
          'کۆدی PIN نابێت لە 4 خانە کەمتر بێت.'
        )
      );
      return;
    }
    if (adminPinInput !== adminPinConfirm) {
      setAdminPinError(
        bi(
          'رمزا PIN غير متطابقين.',
          'PIN confirmation does not match.',
          'هەردوو کۆدی PIN وەک یەک نین.'
        )
      );
      return;
    }
    setPinSaving(true);
    try {
      await ClinicOperationsService.setAdminPinAsync(adminPinInput);
      setAdminPinInput('');
      setAdminPinConfirm('');
      setPinSaved(true);
      setTimeout(() => setPinSaved(false), 3000);
    } catch (err: unknown) {
      setAdminPinError(
        err instanceof Error
          ? err.message
          : bi(
              'فشل حفظ رمز المدير.',
              'Failed to save Admin PIN.',
              'پاشەکەوتکردنی کۆدی PINی بەڕێوەبەر سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setPinSaving(false);
    }
  };

  const handleSaveClinicProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const updated = await ClinicOperationsService.saveClinicProfileAsync({
        clinicNameAr: clinicProfile.clinicNameAr.trim(),
        clinicNameEn: clinicProfile.clinicNameEn.trim(),
        therapistNameAr: clinicProfile.therapistNameAr.trim(),
        therapistNameEn: clinicProfile.therapistNameEn.trim(),
        phone: clinicProfile.phone.trim(),
        addressAr: clinicProfile.addressAr.trim(),
        addressEn: clinicProfile.addressEn.trim(),
        licenseNumber: clinicProfile.licenseNumber.trim(),
        logoDataUrl: clinicProfile.logoDataUrl,
        stampSignatureDataUrl: clinicProfile.stampSignatureDataUrl,
        receiptFooterAr: clinicProfile.receiptFooterAr?.trim() || '',
        receiptFooterEn: clinicProfile.receiptFooterEn?.trim() || '',
        workingDaysPreset: clinicProfile.workingDaysPreset || 'sun_thu',
        workingDays:
          clinicProfile.workingDays && clinicProfile.workingDays.length > 0
            ? clinicProfile.workingDays
            : [0, 1, 2, 3, 4],
        workHoursStart: clinicProfile.workHoursStart || '09:00',
        workHoursEnd: clinicProfile.workHoursEnd || '21:00',
        defaultSessionDurationMinutes: Math.max(
          10,
          Math.min(240, Number(clinicProfile.defaultSessionDurationMinutes || 45))
        ),
      });
      setClinicProfile(updated);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUploadClinicImage = async (
    file: File | undefined,
    target: 'logoDataUrl' | 'stampSignatureDataUrl'
  ) => {
    if (!file) return;
    setImageUploadError(null);
    try {
      const processed = await processClinicImageUpload(file, {
        maxWidthPx: target === 'logoDataUrl' ? 400 : 480,
        maxHeightPx: target === 'logoDataUrl' ? 240 : 220,
      });
      setClinicProfile((p) => ({ ...p, [target]: processed }));
    } catch (err) {
      setImageUploadError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveWhatsAppTemplates = async () => {
    setWaSaving(true);
    setWaSaved(false);
    try {
      const saved = await ClinicOperationsService.saveWhatsAppTemplatesAsync({
        appointmentReminder: whatsappTemplates.appointmentReminder,
        hepProgram: whatsappTemplates.hepProgram,
        paymentReceipt: whatsappTemplates.paymentReceipt,
      });
      setWhatsappTemplates(saved);
      setWaSaved(true);
      setTimeout(() => setWaSaved(false), 2500);
    } finally {
      setWaSaving(false);
    }
  };

  const handleResetWhatsAppTemplates = async () => {
    const reset = await ClinicOperationsService.resetWhatsAppTemplatesAsync();
    setWhatsappTemplates(reset);
    setWaSaved(true);
    setTimeout(() => setWaSaved(false), 2500);
  };

  const handleRetryPersistence = async () => {
    const ok = await requestPersistentStorage();
    setLocalPersistenceState(ok);
  };

  const handleRotateDek = async () => {
    setRotatingDek(true);
    setRotationError(null);
    setRotatedRecoveryKey(null);
    try {
      const summary = await rotateDekNow();
      setRotatedRecoveryKey(summary.newRecoveryKeyFormatted || null);
    } catch (err: unknown) {
      setRotationError(
        err instanceof Error
          ? err.message
          : bi(
              'فشل تدوير مفتاح التشفير.',
              'Failed to rotate DEK.',
              'سووڕاندنەوەی کلیلی کۆدکردن سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setRotatingDek(false);
    }
  };

  const handleTogglePrf = async () => {
    setPrfBusy(true);
    setPrfError(null);
    try {
      if (isPrfEnrolled) {
        await disablePrf();
      } else {
        await enrollPrf();
      }
    } catch (err: unknown) {
      setPrfError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر تغيير حالة مفتاح المرور/البصمة على هذا الجهاز.',
              'Unable to update passkey/biometric unlock on this device.',
              'نەتوانرا دۆخی کلیلی تێپەڕبوون/پەنجەمۆر لەسەر ئەم ئامێرە بگۆڕدرێت.'
            )
      );
    } finally {
      setPrfBusy(false);
    }
  };

  const handleDeleteAllDemo = async () => {
    setDeletingDemo(true);
    setDemoDeletedMsg(false);
    try {
      await deleteAllDemoPatients();
      ClinicOperationsService.deleteAllDemoOperationsData();
      await refreshPatients();
      setDemoDeletedMsg(true);
      window.dispatchEvent(new CustomEvent('physiorecord-demo-data-changed'));
    } catch (err) {
      console.error('Failed to delete demo data:', err);
    } finally {
      setDeletingDemo(false);
    }
  };

  const timeoutOptions = [
    { ms: 1 * 60 * 1000, labelAr: 'دقيقة واحدة (1 د)', labelEn: '1 minute', labelCkb: '1 خولەک' },
    { ms: 5 * 60 * 1000, labelAr: '5 دقائق (الافتراضي)', labelEn: '5 minutes (Default)', labelCkb: '5 خولەک (بنەڕەتی)' },
    { ms: 10 * 60 * 1000, labelAr: '10 دقائق', labelEn: '10 minutes', labelCkb: '10 خولەک' },
    { ms: 15 * 60 * 1000, labelAr: '15 دقيقة', labelEn: '15 minutes', labelCkb: '15 خولەک' },
    { ms: 30 * 60 * 1000, labelAr: '30 دقيقة', labelEn: '30 minutes', labelCkb: '30 خولەک' },
    { ms: 0, labelAr: 'أبداً (تعطيل القفل التلقائي)', labelEn: 'Never (Disable Auto-Lock)', labelCkb: 'هەرگیز (ناچالاککردنی قفڵی خۆکار)' },
  ];

  const filteredCurrencies = availableCurrencies.filter((c) => {
    const q = currencySearch.toLowerCase().trim();
    if (!q) return true;
    return (
      c.code.toLowerCase().includes(q) ||
      c.nameAr.includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      (CURRENCY_NAME_CKB[c.code] || '').includes(q) ||
      c.symbolAr.includes(q)
    );
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex justify-end"
      dir={isRtl ? 'rtl' : 'ltr'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card border-s border-card-line max-w-2xl w-full h-full shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Single-row compact bar on both mobile & desktop) */}
        <div className="px-3.5 sm:px-5 py-2 border-b border-card-divider flex items-center justify-between gap-2 bg-muted/40 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-7 sm:size-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <Settings className="size-4 shrink-0" />
            </div>
            <div className="min-w-0">
              <h2 id="settings-modal-title" className="text-xs sm:text-sm font-bold text-foreground truncate">
                <span className="sm:hidden">{bi('الإعدادات', 'Settings', 'ڕێکخستنەکان')}</span>
                <span className="hidden sm:inline">
                  {bi('إعدادات العيادة والمطور', 'Clinic & Developer Settings', 'ڕێکخستنەکانی کلینیک و گەشەپێدەر')}
                </span>
              </h2>
              <p className="hidden sm:block text-xs text-muted-foreground-1 truncate">
                {bi(
                  'العملة، أعضاء الكادر، الأمان، الأقسام، والبيانات التجريبية',
                  'Currency, staff roster, security, modules, and demo data',
                  'دراو، ئەندامانی ستاف، ئاسایش، بەشەکان، و داتای نموونەیی'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Simple / Advanced Segmented Switch */}
            <div className="inline-flex items-center rounded-lg bg-layer border border-layer-line p-0.5 shrink-0">
              <button
                type="button"
                data-testid="settings-mode-simple-btn"
                aria-pressed={settingsViewMode === 'simple'}
                onClick={() => handleSwitchSettingsMode('simple')}
                className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                  settingsViewMode === 'simple'
                    ? 'bg-primary text-primary-foreground'
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
                className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                  settingsViewMode === 'advanced'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground-1 hover:text-foreground'
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
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
              title={bi(
                `ما الجديد v${APP_SEMVER_VERSION}`,
                `What's New v${APP_SEMVER_VERSION}`,
                `نوێترین گۆڕانکارییەکان v${APP_SEMVER_VERSION}`
              )}
            >
              <Sparkles className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {bi('ما الجديد', "What's New", 'نوێترین')}
              </span>
              <span className="font-mono"><bdi dir="ltr">v{APP_SEMVER_VERSION}</bdi></span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={bi('إغلاق الإعدادات', 'Close settings', 'داخستنی ڕێکخستنەکان')}
              className="size-9 rounded-lg flex items-center justify-center text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover cursor-pointer shrink-0"
            >
              <X className="size-4 shrink-0" />
            </button>
          </div>
        </div>

        {/* Compact Full-Width Search Input */}
        <div className="px-3.5 sm:px-4 py-1.5 border-b border-card-divider bg-surface/70 shrink-0">
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
              className="w-full min-h-[36px] ps-9 pe-10 py-1.5 rounded-xl bg-layer border border-layer-line text-xs leading-normal text-foreground placeholder:text-muted-foreground-1 focus:outline-none focus:border-primary"
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
        </div>

        {/* Tabs Bar (Single-line horizontally scrollable with clear bottom spacing so scrollbar never overlaps tab border) */}
        <div
          role="tablist"
          aria-label={bi('أقسام الإعدادات', 'Settings categories', 'بەشەکانی ڕێکخستن')}
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
          className={`border-b border-card-divider ${
            settingsSearchQuery.trim().length > 0 ? 'hidden sm:flex' : 'flex'
          } flex-nowrap items-center gap-1.5 px-3 pt-1.5 pb-2.5 bg-card shrink-0 overflow-x-auto scroll-smooth touch-pan-x`}
          style={{
            WebkitOverflowScrolling: 'touch',
          }}
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
            className={`min-h-[36px] px-3 py-1.5 rounded-t-md text-xs font-bold border-b-2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'currency'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground-1 hover:text-foreground'
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
            className={`min-h-[36px] px-3 py-1.5 rounded-t-md text-xs font-bold border-b-2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'clinic'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground-1 hover:text-foreground'
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
            className={`min-h-[36px] px-3 py-1.5 rounded-t-md text-xs font-bold border-b-2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'display'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground-1 hover:text-foreground'
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
              className={`min-h-[36px] px-3 py-1.5 rounded-t-md text-xs font-bold border-b-2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                activeTab === 'staff'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground-1 hover:text-foreground'
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
            className={`min-h-[36px] px-3 py-1.5 rounded-t-md text-xs font-bold border-b-2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'security'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground-1 hover:text-foreground'
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
            className={`min-h-[36px] px-3 py-1.5 rounded-t-md text-xs font-bold border-b-2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
              activeTab === 'modules'
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground-1 hover:text-foreground'
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
              className={`min-h-[36px] px-3 py-1.5 rounded-t-md text-xs font-bold border-b-2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                activeTab === 'developer'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground-1 hover:text-foreground'
              }`}
            >
              <Database className="size-3.5 shrink-0" />
              <span>{bi('المطور', 'Developer', 'گەشەپێدەر')}</span>
              {hasDemoRecords && <DemoBadge />}
            </button>
          )}
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

          {/* TAB: DISPLAY & LANGUAGE */}
          {activeTab === 'display' && (
            <div className="space-y-4">
              {/* Language Quick Switcher Card (Phase F1 Unified Hub) */}
              <div
                data-testid="settings-language-card"
                className="p-4 rounded-xl bg-surface border border-line-2 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Languages className="size-4 text-primary" />
                    <span>
                      {bi(
                        'لغة واجهة النظام (عربي / کوردی / English)',
                        'Interface Language (Arabic / Kurdish / English)',
                        'زمانی ڕووکاری سیستەم (عەرەبی / کوردی / ئینگلیزی)'
                      )}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { code: 'ar' as const, label: 'العربية (RTL)' },
                    { code: 'ckb' as const, label: 'کوردی (RTL)' },
                    { code: 'en' as const, label: 'English (LTR)' },
                  ].map((langOpt) => {
                    const active = language === langOpt.code;
                    return (
                      <button
                        key={langOpt.code}
                        type="button"
                        data-testid={`settings-lang-${langOpt.code}-btn`}
                        onClick={() => setLanguage(langOpt.code)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-layer border-layer-line text-foreground hover:bg-layer-hover'
                        }`}
                      >
                        {langOpt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Theme Mode & Color Palette */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    {theme === 'dark' ? (
                      <Moon className="size-4 text-primary" />
                    ) : (
                      <Sun className="size-4 text-primary" />
                    )}
                    <span>
                      {bi(
                        'الوضع الليلي / النهاري ولوحة الألوان',
                        'Theme Mode & Color Palette',
                        'دۆخی شەو / ڕۆژ و تابلۆی ڕەنگەکان'
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="px-3 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {theme === 'dark' ? (
                      <>
                        <Sun className="size-3.5 text-amber-500" />
                        <span>{bi('التبديل إلى النهاري', 'Switch to Light', 'گۆڕین بۆ دۆخی ڕۆژ')}</span>
                      </>
                    ) : (
                      <>
                        <Moon className="size-3.5 text-primary" />
                        <span>{bi('التبديل إلى الليلي', 'Switch to Dark', 'گۆڕین بۆ دۆخی شەو')}</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {THEME_PALETTE_OPTIONS.map((pal) => {
                    const active = themePalette === pal.id;
                    return (
                      <button
                        key={pal.id}
                        type="button"
                        onClick={() => setThemePalette(pal.id)}
                        className={`min-h-[40px] p-2.5 rounded-xl border text-start cursor-pointer transition-colors flex items-center gap-2 ${
                          active
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-card border-card-line hover:bg-layer-hover text-foreground'
                        }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full shrink-0 border border-black/15"
                          style={{ backgroundColor: pal.swatchHex }}
                        />
                        <span className="text-xs font-bold leading-snug">
                          {bi(pal.labelAr, pal.labelEn, THEME_PALETTE_CKB[pal.id])}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <AppearanceDisplaySettings />
            </div>
          )}

          {activeTab === 'currency' && (
            <div className="space-y-4">
              {/* World Currency Selector (ISO 4217 standard) */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Coins className="size-4 text-primary" />
                    <span>
                      {bi('اختر عملة العيادة المعتمدة', 'Select Active Clinic Currency', 'دراوی پەسەندکراوی کلینیک هەڵبژێرە')}{' '}
                      <bdi dir="ltr">(ISO 4217)</bdi>:
                    </span>
                  </div>
                  {currency.code !== 'IQD' ? (
                    <button
                      type="button"
                      onClick={() => setCurrencyCode('IQD')}
                      className="min-h-[36px] px-2.5 py-1 text-xs font-bold rounded-lg bg-layer border border-layer-line text-primary hover:bg-primary/10 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="size-3" />
                      <span>{bi('استعادة الدينار العراقي', 'Reset to IQD', 'گەڕانەوە بۆ دیناری عێراقی')}</span>
                    </button>
                  ) : (
                    <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                      {bi('الدينار العراقي (افتراضي)', 'IQD (Default)', 'دیناری عێراقی (بنەڕەتی)')}
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'تُطبق العملة المختارة تلقائياً في كافة فواتير المرضى والسجل المالي والمصاريف.',
                    'The selected currency is applied dynamically across patient invoices, financial ledgers, and expenses.',
                    'دراوە هەڵبژێردراوەکە بە شێوەی خۆکار لە هەموو پسوڵەکانی نەخۆش، تۆماری دارایی، و خەرجییەکان بەکاردەهێنرێت.'
                  )}
                </p>

                {/* Currency Search Input */}
                <div className="relative flex items-center">
                  <Search className="size-3.5 absolute start-3 inset-y-0 my-auto text-muted-foreground-2 pointer-events-none z-10 shrink-0" />
                  <input
                    id="settings-currency-search"
                    type="text"
                    aria-label={bi('بحث عن العملة', 'Search currencies', 'گەڕان بۆ دراو')}
                    value={currencySearch}
                    onChange={(e) => setCurrencySearch(e.target.value)}
                    placeholder={bi(
                      'ابحث باسم العملة أو الرمز (مثال: USD, دينار, ريال)...',
                      'Search by currency name or code (e.g. USD, EUR, SAR)...',
                      'بە ناو یان کۆدی دراو بگەڕێ (نموونە: USD، دینار، یۆرۆ)...'
                    )}
                    className="w-full min-h-[36px] ps-9 pe-3 py-1.5 text-xs leading-normal rounded-xl bg-layer border border-layer-line text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Currency List */}
                <div
                  tabIndex={0}
                  aria-label={bi('قائمة العملات', 'Currency list', 'لیستی دراوەکان')}
                  className="max-h-72 overflow-y-auto space-y-1.5 pe-1 focus:outline-none"
                >
                  {filteredCurrencies.map((c) => {
                    const isSelected = currency.code === c.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setCurrencyCode(c.code)}
                        className={`w-full p-2.5 rounded-xl border text-start flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'bg-card border-card-line hover:bg-layer-hover text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs">{c.code}</span>
                          <span className="text-xs">
                            {bi(c.nameAr, c.nameEn, CURRENCY_NAME_CKB[c.code] || c.nameAr)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold opacity-80">
                            {bi(c.symbolAr, c.symbolEn, c.symbolAr)}
                          </span>
                          {isSelected && <Check className="size-3.5 text-primary" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 1B: ENCRYPTED CLINIC PROFILE (Phase 1.2) */}
          {activeTab === 'clinic' && (
            <form onSubmit={(e) => void handleSaveClinicProfile(e)} className="space-y-4">
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Building2 className="size-4 text-primary" />
                  <span>
                    {bi(
                      'ملف العيادة المشفر (محلياً على هذا الجهاز)',
                      'Encrypted Clinic Profile',
                      'پرۆفایلی کۆدکراوی کلینیک (ناوخۆیی لەسەر ئەم ئامێرە)'
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'تُحفظ بيانات العيادة مشفرة في IndexedDB بدلاً من تخزين المتصفح وتُستخدم في ترويسة التقارير والوصولات.',
                    'Stored encrypted in IndexedDB for clinical summaries and invoices.',
                    'زانیارییەکانی کلینیک بە کۆدکراوی لە IndexedDB پاشەکەوت دەکرێن و لە سەرپەڕەی ڕاپۆرت و پسوڵەکاندا بەکاردەهێنرێن.'
                  )}
                </p>
              </div>

              {profileSaved && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>
                    {bi(
                      'تم حفظ بيانات العيادة في المخزن المشفر.',
                      'Clinic profile saved cleanly.',
                      'زانیارییەکانی کلینیک لە کۆگای کۆدکراودا پاشەکەوت کران.'
                    )}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label htmlFor="clinic-name-ar" className="block text-xs font-bold text-foreground mb-1">
                    {bi('اسم العيادة (بالعربية)', 'Clinic Name (Arabic)', 'ناوی کلینیک (عەرەبی)')}
                  </label>
                  <input
                    id="clinic-name-ar"
                    type="text"
                    value={clinicProfile.clinicNameAr}
                    onChange={(e) => setClinicProfile((p) => ({ ...p, clinicNameAr: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="clinic-name-en" className="block text-xs font-bold text-foreground mb-1">
                    {bi('اسم العيادة (بالإنجليزية)', 'Clinic Name (English)', 'ناوی کلینیک (ئینگلیزی)')}
                  </label>
                  <input
                    id="clinic-name-en"
                    type="text"
                    dir="ltr"
                    value={clinicProfile.clinicNameEn}
                    onChange={(e) => setClinicProfile((p) => ({ ...p, clinicNameEn: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
                  />
                </div>
                <div>
                  <label htmlFor="clinic-therapist-ar" className="block text-xs font-bold text-foreground mb-1">
                    {bi('اسم المعالج المسؤول (عربي)', 'Lead Therapist (Arabic)', 'ناوی چارەسەرکاری بەرپرس (عەرەبی)')}
                  </label>
                  <input
                    id="clinic-therapist-ar"
                    type="text"
                    value={clinicProfile.therapistNameAr}
                    onChange={(e) => setClinicProfile((p) => ({ ...p, therapistNameAr: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="clinic-therapist-en" className="block text-xs font-bold text-foreground mb-1">
                    {bi('اسم المعالج المسؤول (إنجليزي)', 'Lead Therapist (English)', 'ناوی چارەسەرکاری بەرپرس (ئینگلیزی)')}
                  </label>
                  <input
                    id="clinic-therapist-en"
                    type="text"
                    dir="ltr"
                    value={clinicProfile.therapistNameEn}
                    onChange={(e) => setClinicProfile((p) => ({ ...p, therapistNameEn: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
                  />
                </div>
                <div>
                  <label htmlFor="clinic-phone" className="block text-xs font-bold text-foreground mb-1">
                    {bi('هاتف العيادة', 'Clinic Phone', 'تەلەفۆنی کلینیک')}
                  </label>
                  <input
                    id="clinic-phone"
                    type="text"
                    dir="ltr"
                    value={clinicProfile.phone}
                    onChange={(e) => setClinicProfile((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono text-foreground text-start"
                  />
                </div>
                <div>
                  <label htmlFor="clinic-license" className="block text-xs font-bold text-foreground mb-1">
                    {bi('رقم الإجازة / التسجيل', 'License / Registration #', 'ژمارەی مۆڵەت / تۆمارکردن')}
                  </label>
                  <input
                    id="clinic-license"
                    type="text"
                    dir="ltr"
                    value={clinicProfile.licenseNumber}
                    onChange={(e) => setClinicProfile((p) => ({ ...p, licenseNumber: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono text-foreground text-start"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="clinic-address-ar" className="block text-xs font-bold text-foreground mb-1">
                    {bi('العنوان (عربي)', 'Clinic Address (Arabic)', 'ناونیشان (عەرەبی)')}
                  </label>
                  <input
                    id="clinic-address-ar"
                    type="text"
                    value={clinicProfile.addressAr}
                    onChange={(e) => setClinicProfile((p) => ({ ...p, addressAr: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="clinic-address-en" className="block text-xs font-bold text-foreground mb-1">
                    {bi('العنوان (إنجليزي)', 'Clinic Address (English)', 'ناونیشان (ئینگلیزی)')}
                  </label>
                  <input
                    id="clinic-address-en"
                    type="text"
                    dir="ltr"
                    value={clinicProfile.addressEn}
                    onChange={(e) => setClinicProfile((p) => ({ ...p, addressEn: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
                  />
                </div>

                {/* 4.4 Receipt / Report Footer */}
                <div>
                  <label htmlFor="clinic-footer-ar" className="block text-xs font-bold text-foreground mb-1">
                    {bi('تذييل الفواتير والتقارير (عربي)', 'Receipt / Report Footer (Arabic)', 'بنپەڕی پسوڵە و ڕاپۆرتەکان (عەرەبی)')}
                  </label>
                  <input
                    id="clinic-footer-ar"
                    type="text"
                    value={clinicProfile.receiptFooterAr || ''}
                    onChange={(e) => setClinicProfile((p) => ({ ...p, receiptFooterAr: e.target.value }))}
                    placeholder={bi(
                      'مع تمنياتنا لكم بالشفاء العاجل...',
                      'Arabic footer text...',
                      'هیوای چاکبوونەوەی خێراتان بۆ دەخوازین...'
                    )}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
                  />
                </div>
                <div>
                  <label htmlFor="clinic-footer-en" className="block text-xs font-bold text-foreground mb-1">
                    {bi('تذييل الفواتير والتقارير (إنجليزي)', 'Receipt / Report Footer (English)', 'بنپەڕی پسوڵە و ڕاپۆرتەکان (ئینگلیزی)')}
                  </label>
                  <input
                    id="clinic-footer-en"
                    type="text"
                    dir="ltr"
                    value={clinicProfile.receiptFooterEn || ''}
                    onChange={(e) => setClinicProfile((p) => ({ ...p, receiptFooterEn: e.target.value }))}
                    placeholder="Wishing you a speedy recovery..."
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
                  />
                </div>

                {/* 4.4 Working Days & Schedule Hours */}
                <div className="sm:col-span-2 p-3.5 rounded-xl bg-surface border border-line-2 space-y-3">
                  <div className="text-xs font-bold text-foreground">
                    {bi(
                      'أيام وساعات عمل العيادة والمدة الافتراضية للجلسة',
                      'Working Days, Clinic Hours & Default Session Duration',
                      'ڕۆژ و کاتژمێرەکانی کارکردنی کلینیک و ماوەی بنەڕەتی دانیشتن'
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'sun_thu', days: [0, 1, 2, 3, 4] as WeekdayIndex[], ar: 'الأحد – الخميس', en: 'Sun – Thu', ckb: 'یەکشەممە – پێنجشەممە' },
                        { id: 'sat_thu', days: [6, 0, 1, 2, 3, 4] as WeekdayIndex[], ar: 'السبت – الخميس', en: 'Sat – Thu', ckb: 'شەممە – پێنجشەممە' },
                        { id: 'custom', days: clinicProfile.workingDays || ([0, 1, 2, 3, 4] as WeekdayIndex[]), ar: 'مخصص', en: 'Custom', ckb: 'تایبەت' },
                      ] as const
                    ).map((preset) => {
                      const active = (clinicProfile.workingDaysPreset || 'sun_thu') === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            setClinicProfile((p) => ({
                              ...p,
                              workingDaysPreset: preset.id,
                              workingDays: [...preset.days],
                            }))
                          }
                          className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                            active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-layer border-layer-line text-foreground hover:bg-layer-hover'
                          }`}
                        >
                          {bi(preset.ar, preset.en, preset.ckb)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { d: 6 as WeekdayIndex, ar: 'سبت', en: 'Sat', ckb: 'شەممە' },
                        { d: 0 as WeekdayIndex, ar: 'أحد', en: 'Sun', ckb: 'یەکشەممە' },
                        { d: 1 as WeekdayIndex, ar: 'اثنين', en: 'Mon', ckb: 'دووشەممە' },
                        { d: 2 as WeekdayIndex, ar: 'ثلاثاء', en: 'Tue', ckb: 'سێشەممە' },
                        { d: 3 as WeekdayIndex, ar: 'أربعاء', en: 'Wed', ckb: 'چوارشەممە' },
                        { d: 4 as WeekdayIndex, ar: 'خميس', en: 'Thu', ckb: 'پێنجشەممە' },
                        { d: 5 as WeekdayIndex, ar: 'جمعة', en: 'Fri', ckb: 'هەینی' },
                      ] as const
                    ).map((day) => {
                      const days = clinicProfile.workingDays || [0, 1, 2, 3, 4];
                      const active = days.includes(day.d);
                      return (
                        <button
                          key={day.d}
                          type="button"
                          onClick={() => {
                            const nextDays = active
                              ? days.filter((x) => x !== day.d)
                              : [...days, day.d];
                            setClinicProfile((p) => ({
                              ...p,
                              workingDaysPreset: 'custom',
                              workingDays: nextDays,
                            }));
                          }}
                          className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                            active
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                              : 'bg-layer border-layer-line text-muted-foreground-1'
                          }`}
                        >
                          {bi(day.ar, day.en, day.ckb)}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label htmlFor="clinic-work-hours-start" className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                        {bi('بدء الدوام', 'Hours Start', 'دەستپێکردنی دەوام')}
                      </label>
                      <TimePickerInput
                        id="clinic-work-hours-start"
                        value={clinicProfile.workHoursStart || '09:00'}
                        onChange={(v) => setClinicProfile((p) => ({ ...p, workHoursStart: v }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="clinic-work-hours-end" className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                        {bi('انتهاء الدوام', 'Hours End', 'کۆتاییهاتنی دەوام')}
                      </label>
                      <TimePickerInput
                        id="clinic-work-hours-end"
                        value={clinicProfile.workHoursEnd || '21:00'}
                        onChange={(v) => setClinicProfile((p) => ({ ...p, workHoursEnd: v }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="clinic-default-duration" className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                        {bi('المدة الافتراضية (دقيقة)', 'Default Duration (min)', 'ماوەی بنەڕەتی (خولەک)')}
                      </label>
                      <input
                        id="clinic-default-duration"
                        type="number"
                        min={10}
                        max={240}
                        value={clinicProfile.defaultSessionDurationMinutes ?? 45}
                        onChange={(e) =>
                          setClinicProfile((p) => ({
                            ...p,
                            defaultSessionDurationMinutes: Math.max(10, Number(e.target.value) || 45),
                          }))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-bold tabular-nums text-foreground"
                      />
                    </div>
                  </div>
                </div>

                {/* 4.4 Encrypted Clinic Logo & Stamp/Signature Upload */}
                <div className="sm:col-span-2 p-3.5 rounded-xl bg-surface border border-line-2 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <ImagePlus className="size-4 text-primary" />
                    <span>
                      {bi(
                        'شعار العيادة وختم / توقيع المعالج (للمطبوعات المشفرة)',
                        'Clinic Logo & Therapist Stamp/Signature (for Printed Documents)',
                        'لۆگۆی کلینیک و مۆر / واژۆی چارەسەرکار (بۆ چاپکراوە کۆدکراوەکان)'
                      )}
                    </span>
                  </div>

                  {imageUploadError && (
                    <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400">
                      {imageUploadError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-xl bg-card border border-card-line space-y-2">
                      <div className="text-xs font-semibold text-foreground">
                        {bi('شعار العيادة (PNG/JPEG/WebP)', 'Clinic Logo', 'لۆگۆی کلینیک (PNG/JPEG/WebP)')}
                      </div>
                      {isValidEncryptedImageDataUrl(clinicProfile.logoDataUrl) && (
                        <img
                          src={clinicProfile.logoDataUrl}
                          alt={bi('معاينة شعار العيادة', 'Clinic Logo Preview', 'پێشبینی لۆگۆی کلینیک')}
                          className="h-14 object-contain rounded border border-line-2 bg-white p-1"
                        />
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-xs font-semibold cursor-pointer">
                          {bi('رفع شعار', 'Upload Logo', 'بارکردنی لۆگۆ')}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => void handleUploadClinicImage(e.target.files?.[0], 'logoDataUrl')}
                          />
                        </label>
                        {clinicProfile.logoDataUrl && (
                          <button
                            type="button"
                            onClick={() => setClinicProfile((p) => ({ ...p, logoDataUrl: undefined }))}
                            className="px-2 py-1 rounded-lg text-xs text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                          >
                            {bi('حذف', 'Clear', 'سڕینەوە')}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-card border border-card-line space-y-2">
                      <div className="text-xs font-semibold text-foreground">
                        {bi('الختم أو التوقيع الرسمي', 'Stamp / Signature', 'مۆر یان واژۆی فەرمی')}
                      </div>
                      {isValidEncryptedImageDataUrl(clinicProfile.stampSignatureDataUrl) && (
                        <img
                          src={clinicProfile.stampSignatureDataUrl}
                          alt={bi('معاينة الختم', 'Stamp Preview', 'پێشبینی مۆر')}
                          className="h-14 object-contain rounded border border-line-2 bg-white p-1"
                        />
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-xs font-semibold cursor-pointer">
                          {bi('رفع ختم/توقيع', 'Upload Stamp', 'بارکردنی مۆر/واژۆ')}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) =>
                              void handleUploadClinicImage(e.target.files?.[0], 'stampSignatureDataUrl')
                            }
                          />
                        </label>
                        {clinicProfile.stampSignatureDataUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setClinicProfile((p) => ({ ...p, stampSignatureDataUrl: undefined }))
                            }
                            className="px-2 py-1 rounded-lg text-xs text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                          >
                            {bi('حذف', 'Clear', 'سڕینەوە')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={profileSaving}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {profileSaving
                  ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                  : bi('حفظ ملف العيادة المشفر', 'Save Encrypted Clinic Profile', 'پاشەکەوتکردنی پرۆفایلی کۆدکراوی کلینیک')}
              </button>

              {/* 4.7 Encrypted WhatsApp Message Templates Editor */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3 mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <MessageSquare className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {bi(
                        'قوالب رسائل واتساب القابلة للتخصيص (4.7)',
                        'Customizable WhatsApp Templates (4.7)',
                        'داڕشتەکانی نامەی واتساپ کە دەتوانرێن دەستکاری بکرێن (4.7)'
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleResetWhatsAppTemplates()}
                    className="px-2.5 py-1 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-xs text-muted-foreground-1 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>{bi('استعادة الافتراضي', 'Reset Defaults', 'گەڕاندنەوە بۆ بنەڕەتی')}</span>
                  </button>
                </div>

                <p className="text-xs text-muted-foreground-1">
                  {bi(
                    'المتغيرات المدعومة: {patientName}، {date}، {time}، {clinicName}، {hepList}، {receiptNumber}، {invoiceNumber}، {amount}، {balanceDue}. الإرسال يتم يدوياً دائماً بمبادرة المستخدم.',
                    'Placeholders: {patientName}, {date}, {time}, {clinicName}, {hepList}, {receiptNumber}, {invoiceNumber}, {amount}, {balanceDue}. Always user-initiated only (no background sending).',
                    'گۆڕاوە پشتگیریکراوەکان: {patientName}، {date}، {time}، {clinicName}، {hepList}، {receiptNumber}، {invoiceNumber}، {amount}، {balanceDue}. ناردن هەمیشە بە دەست و بە بڕیاری بەکارهێنەر دەبێت.'
                  )}
                </p>

                {waSaved && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                    {bi(
                      'تم حفظ قوالب واتساب المشفرة.',
                      'Encrypted WhatsApp templates saved.',
                      'داڕشتە کۆدکراوەکانی واتساپ پاشەکەوت کران.'
                    )}
                  </div>
                )}

                <div className="space-y-3 text-xs">
                  <div>
                    <label htmlFor="wa-tpl-reminder-ar" className="block font-bold text-foreground mb-1">
                      {bi(
                        'قالب تذكير الموعد (عربي / إنجليزي)',
                        'Appointment Reminder Template (AR / EN)',
                        'داڕشتەی بیرخستنەوەی چاوپێکەوتن (عەرەبی / ئینگلیزی)'
                      )}
                    </label>
                    <textarea
                      id="wa-tpl-reminder-ar"
                      rows={2}
                      value={whatsappTemplates.appointmentReminder.ar}
                      onChange={(e) =>
                        setWhatsappTemplates((w) => ({
                          ...w,
                          appointmentReminder: { ...w.appointmentReminder, ar: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground mb-1.5"
                    />
                    <textarea
                      id="wa-tpl-reminder-en"
                      aria-label={bi('قالب تذكير الموعد بالإنجليزية', 'Appointment reminder template English', 'داڕشتەی بیرخستنەوەی چاوپێکەوتن بە ئینگلیزی')}
                      rows={2}
                      dir="ltr"
                      value={whatsappTemplates.appointmentReminder.en}
                      onChange={(e) =>
                        setWhatsappTemplates((w) => ({
                          ...w,
                          appointmentReminder: { ...w.appointmentReminder, en: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
                    />
                  </div>

                  <div>
                    <label htmlFor="wa-tpl-hep-ar" className="block font-bold text-foreground mb-1">
                      {bi(
                        'قالب برنامج التمارين المنزلية HEP (عربي / إنجليزي)',
                        'HEP Program Template (AR / EN)',
                        'داڕشتەی بەرنامەی ڕاهێنانی ماڵەوە HEP (عەرەبی / ئینگلیزی)'
                      )}
                    </label>
                    <textarea
                      id="wa-tpl-hep-ar"
                      rows={2}
                      value={whatsappTemplates.hepProgram.ar}
                      onChange={(e) =>
                        setWhatsappTemplates((w) => ({
                          ...w,
                          hepProgram: { ...w.hepProgram, ar: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground mb-1.5"
                    />
                    <textarea
                      id="wa-tpl-hep-en"
                      aria-label={bi('قالب برنامج التمارين المنزلية بالإنجليزية', 'HEP program template English', 'داڕشتەی بەرنامەی ڕاهێنانی ماڵەوە بە ئینگلیزی')}
                      rows={2}
                      dir="ltr"
                      value={whatsappTemplates.hepProgram.en}
                      onChange={(e) =>
                        setWhatsappTemplates((w) => ({
                          ...w,
                          hepProgram: { ...w.hepProgram, en: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
                    />
                  </div>

                  <div>
                    <label htmlFor="wa-tpl-receipt-ar" className="block font-bold text-foreground mb-1">
                      {bi(
                        'قالب وصل الدفع المالي (عربي / إنجليزي)',
                        'Payment Receipt Template (AR / EN)',
                        'داڕشتەی پسوڵەی پارەدان (عەرەبی / ئینگلیزی)'
                      )}
                    </label>
                    <textarea
                      id="wa-tpl-receipt-ar"
                      rows={2}
                      value={whatsappTemplates.paymentReceipt.ar}
                      onChange={(e) =>
                        setWhatsappTemplates((w) => ({
                          ...w,
                          paymentReceipt: { ...w.paymentReceipt, ar: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground mb-1.5"
                    />
                    <textarea
                      id="wa-tpl-receipt-en"
                      aria-label={bi('قالب وصل الدفع بالإنجليزية', 'Payment receipt template English', 'داڕشتەی پسوڵەی پارەدان بە ئینگلیزی')}
                      rows={2}
                      dir="ltr"
                      value={whatsappTemplates.paymentReceipt.en}
                      onChange={(e) =>
                        setWhatsappTemplates((w) => ({
                          ...w,
                          paymentReceipt: { ...w.paymentReceipt, en: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={waSaving}
                    onClick={() => void handleSaveWhatsAppTemplates()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {waSaving
                      ? bi('جاري حفظ القوالب...', 'Saving Templates...', 'داڕشتەکان پاشەکەوت دەکرێن...')
                      : bi('حفظ قوالب واتساب المشفرة', 'Save WhatsApp Templates', 'پاشەکەوتکردنی داڕشتەکانی واتساپ')}
                  </button>
                </div>
              </div>

              {/* Workspace Mode Switcher (Solo Therapist vs Multi-Staff Team) - 2.1 */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3 mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <UserCheck className="size-4 text-primary" />
                    <span>
                      {bi(
                        'نمط تشغيل العيادة (فردي / فريق)',
                        'Clinic Workspace Mode',
                        'شێوازی کارکردنی کلینیک (تاک / تیم)'
                      )}
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
                    {isSoloMode
                      ? bi('معالج منفرد (Solo)', 'Solo Therapist', 'چارەسەرکاری تاک (Solo)')
                      : bi('فريق متعدد (Team)', 'Team Clinic', 'کلینیکی تیم (Team)')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'وضع المعالج الفردي يبسّط القوائم في شاشة "اليوم" ويزيل تبديل الكادر ورمز المدير التلقائي، بينما يفعّل وضع الفريق الاستقبال والطابور وصلاحيات الكادر.',
                    'Solo Mode streamlines navigation around "Today" and removes staff switchers and Admin PIN prompts. Switch to Team Mode anytime if you add staff.',
                    'شێوازی چارەسەرکاری تاک لیستەکانی شاشەی "ئەمڕۆ" سادە دەکاتەوە و گۆڕینی ستاف و داواکردنی کۆدی بەڕێوەبەر لادەبات، لەکاتێکدا شێوازی تیم پێشوازی و ڕیز و دەسەڵاتی ستاف چالاک دەکات.'
                  )}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={switchingMode}
                    onClick={() => void handleSwitchWorkspaceMode('solo')}
                    className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                      isSoloMode
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-layer border-layer-line text-foreground hover:bg-layer-hover'
                    }`}
                  >
                    {bi('أنا معالج منفرد (Solo)', 'I Work Alone (Solo Mode)', 'من بە تەنیا کاردەکەم (Solo)')}
                  </button>
                  <button
                    type="button"
                    disabled={switchingMode}
                    onClick={() => void handleSwitchWorkspaceMode('team')}
                    className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                      !isSoloMode
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-layer border-layer-line text-foreground hover:bg-layer-hover'
                    }`}
                  >
                    {bi('عيادة مع فريق وكادر (Team)', 'I Have a Team (Team Mode)', 'کلینیک لەگەڵ تیم و ستاف (Team)')}
                  </button>
                </div>
              </div>

              {/* My Clinic Services & Custom Price List (EMPTY by default per 2.6 & R2) */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Tag className="size-4 text-primary" />
                    <span>
                      {bi(
                        'خدماتي وأسعاري المخصصة (اختياري)',
                        'My Clinic Services & Packages (Optional)',
                        'خزمەتگوزاری و نرخە تایبەتەکانم (بژاردەیی)'
                      )}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground-1 font-semibold">
                    {bi('فارغة افتراضياً', 'Empty by default', 'بە بنەڕەتی بەتاڵە')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'لا يفرض النظام أي أسعار جاهزة. يمكنك تعريف أسماء خدماتك أو كورساتك هنا لاختيارها بسرعة عند التحصيل، أو تركها فارغة وإدخال المبلغ يدوياً كل مرة.',
                    'Zero preset fees are assumed. Add your own session or package items here for quick billing lookup, or keep empty and type amounts manually.',
                    'سیستەم هیچ نرخێکی ئامادەکراو ناسەپێنێت. دەتوانیت ناوی خزمەتگوزاری یان کۆرسەکانت لێرە پێناسە بکەیت بۆ هەڵبژاردنی خێرا لە کاتی وەرگرتنی پارە، یان بە بەتاڵی جێی بهێڵیت و هەموو جارێک بڕەکە بە دەست بنووسیت.'
                  )}
                </p>

                <div className="p-3 rounded-xl bg-card border border-card-line space-y-2.5 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      aria-label={bi('اسم الخدمة بالعربية', 'Service Name (Arabic)', 'ناوی خزمەتگوزاری بە عەرەبی')}
                      value={newSvcNameAr}
                      onChange={(e) => setNewSvcNameAr(e.target.value)}
                      placeholder={bi(
                        'اسم الخدمة بالعربية (مثال: جلسة علاجية)',
                        'Service Name (Arabic)',
                        'ناوی خزمەتگوزاری (نموونە: دانیشتنی چارەسەر)'
                      )}
                      className="w-full px-3 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground"
                    />
                    <input
                      type="text"
                      dir="ltr"
                      aria-label={bi('اسم الخدمة بالإنجليزية', 'Service Name (English)', 'ناوی خزمەتگوزاری بە ئینگلیزی')}
                      value={newSvcNameEn}
                      onChange={(e) => setNewSvcNameEn(e.target.value)}
                      placeholder="Service Name (English)"
                      className="w-full px-3 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground text-start"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                    <div>
                      <label htmlFor="settings-svc-type" className="block text-xs font-bold text-foreground mb-1">
                        {bi('النوع:', 'Type:', 'جۆر:')}
                      </label>
                      <select
                        id="settings-svc-type"
                        value={newSvcType}
                        onChange={(e) =>
                          setNewSvcType(e.target.value as ClinicServiceItem['invoiceType'])
                        }
                        className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground"
                      >
                        <option value="single_session">{bi('جلسة مفردة', 'Single Session', 'دانیشتنی تاک')}</option>
                        <option value="rehab_package">{bi('كورس', 'Course Package', 'کۆرس')}</option>
                        <option value="evaluation">{bi('فحص', 'Evaluation', 'پشکنین')}</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="settings-svc-fee" className="block text-xs font-bold text-foreground mb-1">
                        {bi('السعر:', 'Fee:', 'نرخ:')}
                      </label>
                      <MoneyInput
                        id="settings-svc-fee"
                        value={newSvcPrice}
                        onChange={setNewSvcPrice}
                        className="w-full"
                      />
                    </div>
                    {newSvcType === 'rehab_package' ? (
                      <div>
                        <label htmlFor="settings-svc-pkg-sessions" className="block text-xs font-bold text-foreground mb-1">
                          {bi('عدد جلسات الكورس:', 'Sessions in Course:', 'ژمارەی دانیشتنەکانی کۆرس:')}
                        </label>
                        <input
                          id="settings-svc-pkg-sessions"
                          type="number"
                          min={2}
                          max={60}
                          value={newSvcPkgSessions}
                          onChange={(e) => setNewSvcPkgSessions(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-xs font-mono text-foreground"
                        />
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => void handleAddClinicService(e)}
                      disabled={!newSvcNameAr.trim() && !newSvcNameEn.trim()}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      <span>{bi('إضافة للقائمة', 'Add Service', 'زیادکردن بۆ لیست')}</span>
                    </button>
                  </div>
                </div>

                {clinicServices.length === 0 ? (
                  <p className="text-xs text-muted-foreground-1 italic">
                    {bi(
                      'لا توجد خدمات مضافة حالياً.',
                      'No custom services configured yet.',
                      'لە ئێستادا هیچ خزمەتگوزارییەکی زیادکراو نییە.'
                    )}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {clinicServices.map((svc) => (
                      <div
                        key={svc.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-layer border border-layer-line text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-foreground">
                            {bi(svc.nameAr, svc.nameEn, svc.nameAr)}
                          </span>
                          <span className="text-muted-foreground-1 ms-2">
                            {svc.invoiceType === 'rehab_package'
                              ? bi(
                                  `كورس (${svc.packageSessions || 0} جلسات)`,
                                  `Package (${svc.packageSessions || 0})`,
                                  `کۆرس (${svc.packageSessions || 0} دانیشتن)`
                                )
                              : svc.invoiceType === 'evaluation'
                              ? bi('فحص', 'Evaluation', 'پشکنین')
                              : bi('جلسة مفردة', 'Single Session', 'دانیشتنی تاک')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Money amount={svc.priceIQD} className="font-bold text-primary" />
                          <button
                            type="button"
                            onClick={() => void handleDeleteClinicService(svc.id)}
                            aria-label={bi('حذف الخدمة', 'Delete service', 'سڕینەوەی خزمەتگوزاری')}
                            className="size-9 rounded-lg text-muted-foreground-2 hover:text-rose-600 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </form>
          )}

          {/* TAB 2: STAFF ROSTER */}
          {activeTab === 'staff' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Users className="size-4 text-primary" />
                  <span>{bi('إدارة وتعديل أعضاء الكادر', 'Staff Roster Management', 'بەڕێوەبردن و دەستکاریکردنی ئەندامانی ستاف')}</span>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'يمكنك تعديل أسماء الأطباء والمعالجين وموظفي الاستقبال، مسمياتهم الوظيفية وتخصصاتهم لتظهر في سجلات الحضور وسجل النشاط والفواتير.',
                    'Edit staff member names, clinical specialties, and system roles to reflect accurately across schedules, audit logs, and receipts.',
                    'دەتوانیت ناوی پزیشک و چارەسەرکاران و کارمەندانی پێشوازی، ناونیشانی کاری و پسپۆڕییەکانیان دەستکاری بکەیت تا لە تۆمارەکانی ئامادەبوون و چالاکی و پسوڵەکاندا دەربکەون.'
                  )}
                </p>
              </div>

              {staffSavedMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>
                    {bi(
                      'تم تحديث بيانات الكادر وحفظها بنجاح.',
                      'Staff roster changes saved successfully.',
                      'زانیارییەکانی ستاف بە سەرکەوتوویی نوێکرانەوە و پاشەکەوت کران.'
                    )}
                  </span>
                </div>
              )}

              {/* Editing Form (if an item is in edit mode) */}
              {editingStaffId && (
                <form
                  onSubmit={handleSaveStaffMember}
                  className="p-4 rounded-xl bg-card border-2 border-primary space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-card-divider">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <Edit2 className="size-3.5" />
                      <span>{bi('تعديل بيانات عضو الكادر', 'Edit Staff Member', 'دەستکاریکردنی زانیاری ئەندامی ستاف')}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelEditStaff}
                      className="text-xs text-muted-foreground-1 hover:text-foreground cursor-pointer"
                    >
                      {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label htmlFor="staff-edit-name-ar" className="block text-xs font-bold text-muted-foreground-1 mb-1">
                        {bi('الاسم الثلاثي بالعربية *', 'Full Name (Arabic) *', 'ناوی سیانی (عەرەبی) *')}
                      </label>
                      <input
                        id="staff-edit-name-ar"
                        type="text"
                        required
                        value={editingNameAr}
                        onChange={(e) => setEditingNameAr(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
                        placeholder={bi('مثال: د. حسين الرمضاني', 'e.g. Dr. Hussein Al-Ramadhani', 'نموونە: د. حسێن ڕەمەزانی')}
                      />
                    </div>

                    <div>
                      <label htmlFor="staff-edit-name-en" className="block text-xs font-bold text-muted-foreground-1 mb-1">
                        {bi('الاسم بالإنجليزية (اختياري)', 'Full Name (English)', 'ناو بە ئینگلیزی (بژاردەیی)')}
                      </label>
                      <input
                        id="staff-edit-name-en"
                        type="text"
                        dir="ltr"
                        value={editingNameEn}
                        onChange={(e) => setEditingNameEn(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground text-start focus:outline-none focus:border-primary"
                        placeholder="e.g. Dr. Hussein Al-Ramadhani"
                      />
                    </div>

                    <div>
                      <label htmlFor="staff-edit-spec-ar" className="block text-xs font-bold text-muted-foreground-1 mb-1">
                        {bi('التخصص السريري بالعربية', 'Specialty (Arabic)', 'پسپۆڕی کلینیکی (عەرەبی)')}
                      </label>
                      <input
                        id="staff-edit-spec-ar"
                        type="text"
                        value={editingSpecialtyAr}
                        onChange={(e) => setEditingSpecialtyAr(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
                        placeholder={bi('مثال: تأهيل العظام والعمود الفقري', 'e.g. Orthopedic & Spine Rehab', 'نموونە: چاککردنەوەی ئێسک و بڕبڕەی پشت')}
                      />
                    </div>

                    <div>
                      <label htmlFor="staff-edit-spec-en" className="block text-xs font-bold text-muted-foreground-1 mb-1">
                        {bi('التخصص بالإنجليزية', 'Specialty (English)', 'پسپۆڕی بە ئینگلیزی')}
                      </label>
                      <input
                        id="staff-edit-spec-en"
                        type="text"
                        dir="ltr"
                        value={editingSpecialtyEn}
                        onChange={(e) => setEditingSpecialtyEn(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground text-start focus:outline-none focus:border-primary"
                        placeholder="e.g. Orthopedic & Spine Rehabilitation"
                      />
                    </div>

                    <div>
                      <label htmlFor="staff-edit-role" className="block text-xs font-bold text-muted-foreground-1 mb-1">
                        {bi('الصلاحية الوظيفية في النظام', 'System Role', 'دەسەڵاتی کارکردن لە سیستەمدا')}
                      </label>
                      <select
                        id="staff-edit-role"
                        value={editingRole}
                        onChange={(e) => setEditingRole(e.target.value as ClinicRoleId)}
                        className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
                      >
                        <option value="admin">
                          {bi('مدير العيادة والنظام (Admin)', 'Clinic Admin', 'بەڕێوەبەری کلینیک و سیستەم (Admin)')}
                        </option>
                        <option value="senior_pt">
                          {bi('أخصائي علاج طبيعي أقدم (Senior PT)', 'Senior PT', 'پسپۆڕی چارەسەری سروشتی باڵا (Senior PT)')}
                        </option>
                        <option value="assistant_pt">
                          {bi('معالج طبيعي ممارس (Assistant PT)', 'Assistant PT', 'چارەسەرکاری سروشتی (Assistant PT)')}
                        </option>
                        <option value="receptionist">
                          {bi('موظف الاستقبال والحسابات (Receptionist)', 'Receptionist', 'کارمەندی پێشوازی و ژمێریاری (Receptionist)')}
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCancelEditStaff}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground hover:bg-layer-hover cursor-pointer"
                    >
                      {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                    </button>
                    <button
                      type="submit"
                      className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
                    >
                      {bi('حفظ التعديلات', 'Save Changes', 'پاشەکەوتکردنی گۆڕانکارییەکان')}
                    </button>
                  </div>
                </form>
              )}

              {/* Roster Cards List */}
              <div className="space-y-2.5">
                {staffRoster.map((member) => {
                  const roleMeta = ROLE_PERMISSIONS[member.role];
                  return (
                    <div
                      key={member.id}
                      className="p-3.5 rounded-xl bg-card border border-card-line hover:border-line-2 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">
                            {bi(member.nameAr, member.nameEn, member.nameAr)}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-xs font-bold rounded-md ${
                              member.role === 'admin'
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : member.role === 'senior_pt'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                                : member.role === 'assistant_pt'
                                ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20'
                                : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20'
                            }`}
                          >
                            {bi(roleMeta.labelAr, roleMeta.labelEn, STAFF_ROLE_CKB[member.role])}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground-1">
                          {bi(member.specialtyAr, member.specialtyEn, member.specialtyAr)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStartEditStaff(member)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line text-xs font-semibold text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary inline-flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                      >
                        <Edit2 className="size-3" />
                        <span>{bi('تعديل', 'Edit', 'دەستکاریکردن')}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-4">
              {/* Unified Backup & Recovery Card (Phase F1) */}
              <div
                data-testid="settings-backup-hub-card"
                className="p-4 rounded-xl bg-primary/5 border border-primary/25 space-y-2.5"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <HardDrive className="size-4 text-primary" />
                  <span>
                    {bi(
                      'النسخ الاحتياطي المشفر والاسترداد السريع (.ptbackup)',
                      'Encrypted Vault Backup & Recovery Hub (.ptbackup)',
                      'کۆپی یەدەگی کۆدکراو و گەڕاندنەوەی خێرا (.ptbackup)'
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'احفظ نسخة احتياطية مشفرة لجميع سجلات العيادة على جهازك، أو نفذ تمرين التحقق من مفتاح الاسترداد الطارئ (32 حرفاً).',
                    'Download an encrypted .ptbackup archive of your clinic records or run a 15-second Emergency Recovery Key verification drill.',
                    'کۆپییەکی یەدەگی کۆدکراوی هەموو تۆمارەکانی کلینیک لەسەر ئامێرەکەت پاشەکەوت بکە، یان ڕاهێنانی دڵنیابوونەوە لە کلیلی گەڕاندنەوەی لەناکاو (32 پیت) ئەنجام بدە.'
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {onOpenBackupModal && (
                    <button
                      type="button"
                      data-testid="settings-open-backup-modal-btn"
                      onClick={onOpenBackupModal}
                      className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <HardDrive className="size-3.5" />
                      <span>
                        {bi(
                          'فتح نافذة النسخ الاحتياطي والاستعادة',
                          'Open Backup & Restore',
                          'کردنەوەی پەنجەرەی کۆپی یەدەگ و گەڕاندنەوە'
                        )}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsRecoveryDrillOpen(true)}
                    className="px-3 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Shield className="size-3.5 text-primary" />
                    <span>{bi('تمرين التحقق من المفتاح', 'Verify Recovery Key', 'تاقیکردنەوەی کلیلی گەڕاندنەوە')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFullExportOpen(true)}
                    className="px-3 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Database className="size-3.5 text-primary" />
                    <span>{bi('تصدير أرشيف كامل', 'Full Vault Export', 'ناردنەدەرەوەی ئەرشیفی تەواو')}</span>
                  </button>
                </div>
              </div>

              {/* Inactivity Auto-Lock Timeout */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Clock className="size-4 text-primary" />
                  <span>
                    {bi(
                      'القفل التلقائي عند عدم النشاط (Inactivity Auto-Lock):',
                      'Inactivity Auto-Lock Timeout:',
                      'قفڵکردنی خۆکار لە کاتی بێچالاکی (Inactivity Auto-Lock):'
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'يقفل النظام الخزنة تلقائياً لحماية بيانات المرضى عند ترك الشاشة دون استخدام.',
                    'Automatically locks the encrypted vault after inactivity.',
                    'سیستەم خەزێنەکە بە شێوەی خۆکار قفڵ دەکات بۆ پاراستنی زانیارییەکانی نەخۆش کاتێک شاشەکە بە بێ بەکارهێنان بەجێدەهێڵدرێت.'
                  )}
                </p>
                <select
                  id="settings-autolock-select"
                  aria-label={bi('القفل التلقائي عند عدم النشاط', 'Inactivity Auto-Lock Timeout', 'قفڵکردنی خۆکار لە کاتی بێچالاکی')}
                  value={isCustomLockMode ? 'custom' : String(autoLockTimeoutMs)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      setIsCustomLockMode(true);
                      const mins = parseInt(customLockMinutes, 10);
                      if (!Number.isNaN(mins) && mins >= 1) {
                        setAutoLockTimeoutMs(Math.min(1440, mins) * 60_000);
                      }
                    } else {
                      setIsCustomLockMode(false);
                      setAutoLockTimeoutMs(Number(val));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground focus:outline-none focus:border-primary"
                >
                  {timeoutOptions.map((opt) => (
                    <option key={opt.ms} value={String(opt.ms)}>
                      {bi(opt.labelAr, opt.labelEn, opt.labelCkb)}
                    </option>
                  ))}
                  <option value="custom">
                    {bi('تحديد يدوي (بالدقائق)...', 'Custom (Enter minutes)...', 'دیاریکردنی دەستی (بە خولەک)...')}
                  </option>
                </select>

                {isCustomLockMode && (
                  <div className="pt-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        id="settings-custom-lock-minutes"
                        aria-label={bi('مدة القفل المخصصة بالدقائق', 'Custom auto-lock minutes', 'ماوەی قفڵکردنی تایبەت بە خولەک')}
                        type="number"
                        min={1}
                        max={1440}
                        step={1}
                        dir="ltr"
                        value={customLockMinutes}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCustomLockMinutes(raw);
                          const parsed = parseInt(raw, 10);
                          if (!Number.isNaN(parsed) && parsed >= 1) {
                            setAutoLockTimeoutMs(Math.min(1440, parsed) * 60_000);
                          }
                        }}
                        placeholder="20"
                        className="w-28 px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground tabular-nums focus:outline-none focus:border-primary"
                      />
                      <span className="text-xs font-semibold text-muted-foreground-1">
                        {bi('دقيقة (1 – 1440 دقيقة)', 'minutes (1 – 1440 min)', 'خولەک (1 – 1440 خولەک)')}
                      </span>
                    </div>
                  </div>
                )}

                {!isCustomLockMode && autoLockTimeoutMs === 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs font-medium text-amber-800 dark:text-amber-300">
                    {bi(
                      'تم تعطيل القفل التلقائي؛ ستبقى الخزنة مفتوحة إلى أن تقفلها يدوياً من القائمة.',
                      'Auto-lock is disabled; the vault will stay unlocked until you lock it manually.',
                      'قفڵکردنی خۆکار ناچالاک کراوە؛ خەزێنەکە بە کراوەیی دەمێنێتەوە تا خۆت بە دەست لە لیستەکەوە قفڵی دەکەیت.'
                    )}
                  </div>
                )}
              </div>

              {/* Staff Admin PIN Configuration (Team Mode only) */}
              {isSoloMode ? (
                <div className="p-4 rounded-xl bg-surface border border-line-2 text-xs text-muted-foreground-1 leading-relaxed">
                  <div className="flex items-center gap-2 font-bold text-foreground mb-1">
                    <KeyRound className="size-4 text-primary" />
                    <span>
                      {bi(
                        'رمز تبديل الكادر (مُعطّل في وضع المعالج الفردي)',
                        'Staff Admin PIN (Not Needed in Solo Mode)',
                        'کۆدی گۆڕینی ستاف (لە شێوازی تاکدا ناچالاکە)'
                      )}
                    </span>
                  </div>
                  <p>
                    {bi(
                      'بما أنك تعمل في وضع المعالج الفردي، تفتح الخزينة مباشرة بكلمة المرور الرئيسية دون الحاجة لرمز PIN لتبديل الكادر.',
                      'In Solo Mode, the vault unlocks directly with your Master Password with zero Staff Admin PIN prompts.',
                      'لەبەرئەوەی لە شێوازی چارەسەرکاری تاکدا کاردەکەیت، خەزێنەکە ڕاستەوخۆ بە وشەی نهێنی سەرەکی دەکرێتەوە بێ پێویستبوون بە کۆدی PINی ستاف.'
                    )}
                  </p>
                </div>
              ) : (() => {
                const pinStatus = ClinicOperationsService.getAdminPinStatus();
                return (
                  <form
                    onSubmit={(e) => void handleSaveAdminPin(e)}
                    className="p-4 rounded-xl bg-surface border border-line-2 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-foreground">
                      <span className="inline-flex items-center gap-2">
                        <KeyRound className="size-4 text-primary" />
                        <span>
                          {bi(
                            'رمز PIN لتبديل صفة المدير (نسبة التوثيق للكادر):',
                            'Staff Admin Attribution PIN (PBKDF2):',
                            'کۆدی PIN بۆ گۆڕینی دەسەڵاتی بەڕێوەبەر (PBKDF2):'
                          )}
                        </span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                          pinStatus.isConfigured
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                        }`}
                      >
                        {pinStatus.isConfigured
                          ? bi('مهيأ (PBKDF2)', 'Configured (PBKDF2)', 'ڕێکخراوە (PBKDF2)')
                          : bi('مطلوب التعيين', 'Setup Required', 'پێویستی بە دیاریکردن هەیە')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground-1 leading-relaxed">
                      {bi(
                        'ملاحظة شفافية: تبديل الكادر يُستخدم لنسبة التوثيق في السجل فقط وليس مصادقة أمان مستقلة (مفتاح الخزينة الرئيسي هو الحماية الفعلية). الرموز الافتراضية مثل 1234 مرفوضة.',
                        'Transparency notice: role switching is for staff attribution only, not security authentication. Trivial PINs like 1234/0000 are rejected; stored as salted PBKDF2 hash inside the encrypted vault.',
                        'تێبینی شەفافیەت: گۆڕینی ستاف تەنها بۆ دیاریکردنی تۆمارکردنی ستافە و ڕەسەنایەتی سەربەخۆ نییە (کلیلی سەرەکی خەزێنە پاراستنی ڕاستەقینەیە). کۆدە سادەکانی وەک 1234 ڕەتدەکرێنەوە.'
                      )}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="password"
                        autoComplete="new-password"
                        inputMode="numeric"
                        minLength={4}
                        maxLength={32}
                        aria-label={bi('رمز PIN الجديد', 'New Admin PIN', 'کۆدی PINی نوێ')}
                        value={adminPinInput}
                        onChange={(e) => {
                          setAdminPinInput(e.target.value);
                          setAdminPinError(null);
                        }}
                        placeholder={bi('رمز PIN جديد (4+ خانات)', 'New Admin PIN (4+ chars)', 'کۆدی PINی نوێ (4+ خانە)')}
                        className="px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary"
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        inputMode="numeric"
                        minLength={4}
                        maxLength={32}
                        aria-label={bi('تأكيد رمز PIN الجديد', 'Confirm New PIN', 'دڵنیابوونەوەی کۆدی نوێ')}
                        value={adminPinConfirm}
                        onChange={(e) => {
                          setAdminPinConfirm(e.target.value);
                          setAdminPinError(null);
                        }}
                        placeholder={bi('تأكيد الرمز الجديد', 'Confirm New PIN', 'دڵنیابوونەوەی کۆدی نوێ')}
                        className="px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono font-bold text-foreground focus:outline-none focus:border-primary"
                      />
                    </div>
                    {adminPinError && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">
                        {adminPinError}
                      </p>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="submit"
                        disabled={pinSaving}
                        className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
                      >
                        {pinSaving
                          ? bi('جاري التشفير...', 'Saving...', 'کۆد دەکرێت...')
                          : pinSaved
                          ? bi('تم الحفظ المشفر!', 'Saved!', 'بە کۆدکراوی پاشەکەوت کرا!')
                          : bi('تحديث رمز المدير', 'Update Admin PIN', 'نوێکردنەوەی کۆدی بەڕێوەبەر')}
                      </button>
                    </div>
                  </form>
                );
              })()}

              {/* Optional WebAuthn PRF Passkey / Biometrics Unlock (Hidden cleanly when unsupported) */}
              {isPrfSupported && (
                <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <Fingerprint className="size-4 text-primary" />
                      <span>
                        {bi(
                          'الفتح السريع بمفتاح المرور / البصمة (اختياري)',
                          'Passkey / Biometrics Quick Unlock (Optional)',
                          'کردنەوەی خێرا بە کلیلی تێپەڕبوون / پەنجەمۆر (بژاردەیی)'
                        )}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                        isPrfEnrolled
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                          : 'bg-muted text-muted-foreground-1 border-line-2'
                      }`}
                    >
                      {isPrfEnrolled
                        ? bi('مفعّل', 'Enrolled', 'چالاککراوە')
                        : bi('غير مفعّل', 'Disabled', 'ناچالاکە')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground-1 leading-relaxed">
                    {bi(
                      'يستخدم امتداد WebAuthn PRF المتاح على هذا المتصفح. تظل كلمة المرور الرئيسية ومفتاح الاسترداد الطارئ فعالين دائماً.',
                      'Uses local WebAuthn PRF key wrapping. Master password and recovery key always remain fully active.',
                      'درێژکراوەی ناوخۆیی WebAuthn PRF لەسەر ئەم وێبگەڕە بەکاردەهێنێت. وشەی نهێنی سەرەکی و کلیلی گەڕاندنەوەی لەناکاو هەمیشە چالاک دەمێننەوە.'
                    )}
                  </p>
                  {prfError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{prfError}</p>
                  )}
                  <button
                    type="button"
                    disabled={prfBusy}
                    onClick={() => void handleTogglePrf()}
                    className="px-4 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground disabled:opacity-50 cursor-pointer"
                  >
                    {prfBusy
                      ? bi('جاري المعالجة...', 'Working...', 'جێبەجێ دەکرێت...')
                      : isPrfEnrolled
                      ? bi('تعطيل مفتاح المرور', 'Disable Passkey Unlock', 'ناچالاککردنی کلیلی تێپەڕبوون')
                      : bi('تفعيل البصمة / مفتاح المرور', 'Enable Passkey Unlock', 'چالاککردنی پەنجەمۆر / کلیلی تێپەڕبوون')}
                  </button>
                </div>
              )}

              {/* Storage Health, Encryption Key Usage % & Per-Record Telemetry (1.4, 1.5, 1.8) */}
              {(() => {
                const telemetry = ClinicOperationsService.getWriteTelemetry();
                const backupMeta = ClinicOperationsService.getBackupMeta();
                const usagePct = keyUsageStatus?.usagePercent ?? 0;
                return (
                  <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <HardDrive className="size-4 text-primary" />
                      <span>
                        {bi(
                          'صحة التخزين المحلي واستهلاك مفتاح التشفير',
                          'Storage Health & Encryption Key Usage',
                          'تەندروستی کۆگای ناوخۆیی و بەکارهێنانی کلیلی کۆدکردن'
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-lg bg-layer border border-layer-line flex items-center justify-between gap-2">
                        <span className="text-muted-foreground-1">{bi('تثبيت التخزين:', 'Persistence:', 'جێگیرکردنی کۆگا:')}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${localPersistenceState ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>
                            {localPersistenceState
                              ? bi('مثبت (Persistent)', 'Persistent', 'جێگیرکراو (Persistent)')
                              : bi('غير مثبت', 'Best-effort', 'جێگیر نەکراو')}
                          </span>
                          {!localPersistenceState && (
                            <button
                              type="button"
                              onClick={() => void handleRetryPersistence()}
                              className="px-2 py-0.5 rounded bg-primary/15 text-primary font-bold cursor-pointer"
                            >
                              {bi('طلب', 'Grant', 'داواکردن')}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-layer border border-layer-line flex items-center justify-between gap-2">
                        <span className="text-muted-foreground-1">{bi('سعة المتصفح:', 'Quota:', 'قەبارەی وێبگەڕ:')}</span>
                        <span dir="ltr" className="font-mono font-bold text-foreground tabular-nums">
                          {storageEstimate
                            ? `${storageEstimate.usageMB} / ${storageEstimate.quotaMB} MB`
                            : bi('غير متاح', 'N/A', 'بەردەست نییە')}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-layer border border-layer-line flex items-center justify-between gap-2">
                        <span className="text-muted-foreground-1">{bi('آخر نسخة احتياطية:', 'Last backup:', 'دوایین کۆپی یەدەگ:')}</span>
                        <span dir="ltr" className="font-mono font-bold text-foreground">
                          {backupMeta.lastBackupAt
                            ? backupMeta.lastBackupAt.slice(0, 10)
                            : bi('لم يتم بعد', 'Never', 'هێشتا نەکراوە')}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-layer border border-layer-line flex items-center justify-between gap-2">
                        <span className="text-muted-foreground-1 inline-flex items-center gap-1">
                          <Activity className="size-3.5 text-primary" />
                          <span>{bi('عمليات حفظ فردية:', 'Per-record writes:', 'پاشەکەوتکردنی تاکە تۆمار:')}</span>
                        </span>
                        <span dir="ltr" className="font-mono font-bold text-foreground tabular-nums">
                          {telemetry.totalWrites} ({bi('اليوم:', 'today:', 'ئەمڕۆ:')} {telemetry.writesToday})
                        </span>
                      </div>
                    </div>

                    {/* GCM Encryption Key Usage Meter & Manual Rotation */}
                    <div className="pt-1 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">
                          {bi(
                            'نسبة استهلاك مفتاح التشفير (تدوير تلقائي عند 70%):',
                            'Encryption key usage (auto-rotates at 70%):',
                            'ڕێژەی بەکارهێنانی کلیلی کۆدکردن (سووڕانەوەی خۆکار لە 70%):'
                          )}
                        </span>
                        <span dir="ltr" className="font-mono font-bold text-primary tabular-nums">
                          {usagePct}% {keyUsageStatus ? `(${keyUsageStatus.effectiveCount.toLocaleString()} / ${keyUsageStatus.maxLimit.toLocaleString()})` : ''}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-layer overflow-hidden border border-layer-line">
                        <div
                          className={`h-full transition-all ${usagePct >= 70 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${Math.min(100, Math.max(2, usagePct))}%` }}
                        />
                      </div>

                      {rotationError && (
                        <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{rotationError}</p>
                      )}

                      {rotatedRecoveryKey && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-bold text-foreground">
                              {bi(
                                'تم تدوير مفتاح التشفير بنجاح! احفظ مفتاح الاسترداد الطارئ الجديد فوراً:',
                                'DEK rotated cleanly! Record your new Emergency Recovery Key immediately:',
                                'کلیلی کۆدکردن بە سەرکەوتوویی سووڕێنرایەوە! دەستبەجێ کلیلی گەڕاندنەوەی لەناکاوی نوێ هەڵبگرە:'
                              )}
                            </p>
                            <button
                              type="button"
                              onClick={async () => {
                                await copySecretWithAutoClear(rotatedRecoveryKey);
                                setCopiedRotatedKey(true);
                                setTimeout(() => setCopiedRotatedKey(false), 5000);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground inline-flex items-center gap-1 cursor-pointer"
                            >
                              {copiedRotatedKey ? (
                                <>
                                  <Check className="size-3.5 text-emerald-500" />
                                  <span>
                                    {bi(
                                      'تم النسخ (يُمسح بعد 60 ثانية)',
                                      'Copied (auto-clears in 60s)',
                                      'لەبەرگیرایەوە (دوای 60 چرکە دەسڕێتەوە)'
                                    )}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3.5 text-primary" />
                                  <span>{bi('نسخ المفتاح', 'Copy Key', 'لەبەرگرتنەوەی کلیل')}</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div
                            dir="ltr"
                            className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 rounded-lg bg-card border border-card-line select-all"
                          >
                            {rotatedRecoveryKey.split('-').map((chunk, idx) => (
                              <code
                                key={idx}
                                className="px-2 py-1 rounded bg-surface border border-line-2 font-mono text-xs font-bold text-foreground text-center whitespace-nowrap"
                              >
                                {chunk}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          disabled={rotatingDek}
                          onClick={() => void handleRotateDek()}
                          className="px-3.5 py-1.5 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw className={`size-3.5 text-primary ${rotatingDek ? 'animate-spin' : ''}`} />
                          <span>
                            {rotatingDek
                              ? bi('جاري إعادة التشفير...', 'Rotating DEK...', 'دووبارە کۆدکردنەوە لە جریان دایە...')
                              : bi('تدوير مفتاح التشفير يدوياً', 'Rotate DEK Now', 'سووڕاندنەوەی کلیلی کۆدکردن بە دەست')}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Phase A4: Quarterly Recovery Drill & Backup Sandbox Test */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Shield className="size-4 text-primary shrink-0" />
                    <span>
                      {bi(
                        'تمرين الاسترداد الربع سنوي واختبار النسخة الاحتياطية',
                        'Quarterly Recovery Drill & Backup Sandbox Test',
                        'ڕاهێنانی گەڕاندنەوەی وەرزی و تاقیکردنەوەی کۆپی یەدەگ'
                      )}
                    </span>
                  </div>
                  {lastRecoveryDrillAt ? (
                    <span
                      data-testid="settings-drill-verified-badge"
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold"
                    >
                      <CheckCircle2 className="size-3.5" />
                      <span>
                        {bi('تم التحقق', 'Verified', 'دڵنیاییکراوەتەوە')}:{' '}
                        {new Date(lastRecoveryDrillAt).toLocaleDateString(
                          language === 'en' ? 'en-GB' : 'ar-IQ'
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {bi('بانتظار الاختبار', 'Test Pending', 'چاوەڕوانی تاقیکردنەوەیە')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'اختبر قدرتك على استعادة النسخة الاحتياطية (.ptbackup) داخل قاعدة بيانات معزولة وتحقق من مجموعة واحدة من مفتاح الاسترداد الطارئ.',
                    'Verify your Emergency Recovery Key spot group and test-decrypt your latest .ptbackup file in an isolated sandbox without affecting live clinic records.',
                    'توانای گەڕاندنەوەی کۆپی یەدەگ (.ptbackup) لە داتابەیسێکی جیاکراودا تاقیبکەرەوە و لە کۆمەڵەیەکی کلیلی گەڕاندنەوەی لەناکاو دڵنیاببەرەوە.'
                  )}
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsRecoveryDrillOpen(true)}
                    data-testid="open-recovery-drill-btn"
                    className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Shield className="size-3.5" />
                    <span>
                      {bi(
                        'تشغيل تمرين الاسترداد واختبار النسخة',
                        'Run Recovery Drill & Test Backup',
                        'کارپێکردنی ڕاهێنانی گەڕاندنەوە و تاقیکردنەوەی کۆپی یەدەگ'
                      )}
                    </span>
                  </button>
                </div>
              </div>

              {/* 5.1 Data Portability: CSV Onboarding + Full Plaintext Export */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <FileSpreadsheet className="size-4 text-primary" />
                  <span>
                    {bi(
                      'قابلية نقل البيانات (استيراد CSV / تصدير كامل غير مشفر)',
                      'Data Portability (CSV Onboarding & Full Plaintext Export)',
                      'گواستنەوەی داتا (هاوردەکردنی CSV / هەناردەکردنی تەواوی بێ کۆد)'
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'يمكنك استيراد قائمة مرضاك السابقة عبر جدول CSV، أو تصدير جميع بيانات العيادة بصيغ CSV / JSON غير مشفرة بعد إعادة إدخال كلمة مرور الخزينة.',
                    'Onboard patients from an existing CSV spreadsheet, or export your full clinical ledger as plaintext CSV/JSON after vault password verification.',
                    'دەتوانیت لیستی نەخۆشەکانی پێشووت لە خشتەی CSVەوە هاوردە بکەیت، یان هەموو داتای کلینیک بە شێوازی CSV / JSON بێ کۆد هەناردە بکەیت دوای دووبارە نووسینی وشەی نهێنی خەزێنە.'
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCsvOnboardingOpen(true)}
                    className="py-2 px-3.5 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="size-3.5 text-primary" />
                    <span>{bi('استيراد مرضى (CSV)', 'Import Patients CSV', 'هاوردەکردنی نەخۆشەکان (CSV)')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFullExportOpen(true)}
                    className="py-2 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-bold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Database className="size-3.5" />
                    <span>{bi('تصدير كامل (CSV / JSON)', 'Full CSV / JSON Export', 'هەناردەکردنی تەواو (CSV / JSON)')}</span>
                  </button>
                </div>
              </div>

              {settingsViewMode === 'simple' && (
                <div
                  data-testid="settings-simple-mode-notice"
                  className="p-3 rounded-xl bg-muted/60 border border-line-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground-1"
                >
                  <span>
                    {bi(
                      'الوضع المبسط مفعّل حالياً — يتم إخفاء تبويبات الكادر والمطور المتقدمة لتقليل الازدحام.',
                      'Simple Mode active — advanced staff & developer controls are hidden for a cleaner view.',
                      'شێوازی سادە لە ئێستادا چالاکە — بەشە پێشکەوتووەکانی ستاف و گەشەپێدەر شاردراونەتەوە بۆ کەمکردنەوەی قەرەباڵغی.'
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid="settings-switch-to-advanced-inline-btn"
                    onClick={() => handleSwitchSettingsMode('advanced')}
                    className="px-2.5 py-1 rounded-lg bg-layer border border-layer-line text-foreground font-bold cursor-pointer hover:bg-layer-hover"
                  >
                    {bi('عرض الوضع المتقدم', 'Switch to Advanced', 'گۆڕین بۆ شێوازی پێشکەوتوو')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PLATFORM MODULES (HIDE / RESTORE EXERCISE LIBRARY) */}
          {activeTab === 'modules' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Dumbbell className="size-4 text-primary" />
                    <span>
                      {bi(
                        'مكتبة التمارين والبرنامج المنزلي (HEP)',
                        'Exercise Library & HEP Builder',
                        'کتێبخانەی ڕاهێنان و بەرنامەی ماڵەوە (HEP)'
                      )}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-md border ${
                      showExerciseLibrary
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
                    }`}
                  >
                    {showExerciseLibrary
                      ? bi('ظاهرة ومفعّلة', 'Visible & Active', 'دیار و چالاک')
                      : bi('مخفية حالياً (البيانات محفوظة)', 'Hidden (Data Preserved)', 'لە ئێستادا شاراوەیە (داتاکان پارێزراون)')}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'يمكنك إخفاء قسم مكتبة التمارين من القائمة الجانبية وملف المريض مؤقتاً دون مسح أي تمارين أو برامج منزلية محفوظة، مع إمكانية استعادتها في أي وقت بنقرة واحدة.',
                    'Temporarily hide the Exercise Library & HEP section from navigation and patient charts without deleting any saved exercises or programs, and restore it anytime in one click.',
                    'دەتوانیت بەشێوەیەکی کاتی بەشی کتێبخانەی ڕاهێنانەکان لە لیستی تەنیشت و فایلەکانی نەخۆش بشاریتەوە بێ سڕینەوەی هیچ ڕاهێنان و بەرنامەیەکی پاشەکەوتکراو، و هەر کاتێک بتەوێت بە یەک کلیک بیگەڕێنیتەوە.'
                  )}
                </p>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showExerciseLibrary;
                      ClinicOperationsService.setExerciseLibraryVisible(next);
                      setShowExerciseLibrary(next);
                    }}
                    className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                      showExerciseLibrary
                        ? 'bg-layer border border-layer-line text-foreground hover:bg-layer-hover'
                        : 'bg-primary hover:bg-primary-hover text-primary-foreground shadow-xs'
                    }`}
                  >
                    {showExerciseLibrary ? (
                      <>
                        <EyeOff className="size-3.5" />
                        <span>
                          {bi('إخفاء مكتبة التمارين مؤقتاً', 'Hide Exercise Library', 'شاردنەوەی کتێبخانەی ڕاهێنانەکان بە کاتی')}
                        </span>
                      </>
                    ) : (
                      <>
                        <Eye className="size-3.5" />
                        <span>
                          {bi(
                            'استعادة وإظهار مكتبة التمارين',
                            'Restore & Show Exercise Library',
                            'گەڕاندنەوە و پیشاندانی کتێبخانەی ڕاهێنانەکان'
                          )}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Custom Clinical Widget Studio (Off by default per Phase 1.11 / R6) */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Sparkles className="size-4 text-primary" />
                    <span>
                      {bi(
                        'منشئ أدوات الفحص المخصصة (متقدم)',
                        'Custom Clinical Widget Studio (Advanced)',
                        'دروستکەری ئامرازە تایبەتەکانی پشکنین (پێشکەوتوو)'
                      )}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-md border ${
                      enableWidgetStudio
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-muted text-muted-foreground-1 border-line-2'
                    }`}
                  >
                    {enableWidgetStudio
                      ? bi('مفعّل في شاشة الفحص', 'Enabled in Exam Shelf', 'چالاکە لە شاشەی پشکنین')
                      : bi(
                          'مخفي افتراضياً (النماذج المحفوظة تبقى مقروءة)',
                          'Hidden by Default (Saved Charts Readable)',
                          'بە بنەڕەتی شاراوەیە (فۆرمە پاشەکەوتکراوەکان دەخوێندرێنەوە)'
                        )}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {bi(
                      'لا تقم أبداً بلصق بيانات المرضى أو الأسماء في أدوات الذكاء الاصطناعي الخارجية. تُفحص القوالب بمخطط نصي آمن دون تنفيذ HTML.',
                      'Never paste patient data into external AI tools. Templates are strictly JSON/plain-text validated (max 64 KB, 30 fields).',
                      'هەرگیز زانیاری یان ناوی نەخۆشەکان لە ئامرازەکانی زیرەکی دەستکردی دەرەکیدا مەنێ. داڕشتەکان بە پشکنەری دەقی سەلامەت دەپشکنرێن بێ جێبەجێکردنی HTML.'
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !enableWidgetStudio;
                      ClinicOperationsService.setCustomWidgetStudioEnabled(next);
                      setEnableWidgetStudio(next);
                    }}
                    className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                      enableWidgetStudio
                        ? 'bg-layer border border-layer-line text-foreground hover:bg-layer-hover'
                        : 'bg-primary hover:bg-primary-hover text-primary-foreground'
                    }`}
                  >
                    {enableWidgetStudio
                      ? bi('إخفاء زر المنشئ عن شاشة الفحص', 'Hide Studio from Exam Shelf', 'شاردنەوەی دوگمەی ستۆدیۆ لە شاشەی پشکنین')
                      : bi('تفعيل منشئ الأدوات المخصصة', 'Enable Custom Widget Studio', 'چالاککردنی دروستکەری ئامرازی تایبەت')}
                  </button>

                  {enableWidgetStudio && (
                    <button
                      type="button"
                      onClick={() => setIsWidgetStudioOpen(true)}
                      className="py-2 px-3.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      <span>{bi('إنشاء / استيراد أداة مخصصة', 'Open Custom Widget Studio', 'دروستکردن / هاوردەکردنی ئامرازی تایبەت')}</span>
                    </button>
                  )}
                </div>

                {customWidgets.length > 0 && (
                  <div className="pt-2 border-t border-card-divider space-y-2">
                    <p className="text-xs font-bold text-foreground">
                      {bi(
                        `القوالب المخصصة المحفوظة (${customWidgets.length}):`,
                        `Saved Custom Templates (${customWidgets.length}):`,
                        `فۆرمە تایبەتە پاشەکەوتکراوەکان (${customWidgets.length}):`
                      )}
                    </p>
                    <div className="space-y-1.5">
                      {customWidgets.map((cw) => (
                        <div
                          key={cw.id}
                          className="p-2.5 rounded-xl bg-layer border border-layer-line flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-foreground truncate">
                              {bi(cw.titleAr, cw.titleEn, cw.titleAr)}
                            </p>
                            <p dir="ltr" className="text-xs font-mono text-muted-foreground-1 truncate">
                              {cw.id} · {cw.fields.length} {bi('حقلاً', 'fields', 'خانە')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void ClinicOperationsService.deleteCustomWidgetAsync(cw.id)}
                            className="size-9 rounded-lg text-rose-600 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer shrink-0"
                            aria-label={bi('حذف القالب', 'Delete template', 'سڕینەوەی فۆرم')}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SMART Goals & Goal Attainment Scaling (GAS -2 to +2) — Off by default per R6 */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Target className="size-4 text-primary" />
                    <span>
                      {bi('أهداف SMART التفصيلية ومقياس تحقيق الهدف', 'SMART Goals & Goal Attainment Scaling', 'ئامانجە وردەکانی SMART و پێوەری گەیشتن بە ئامانج')}{' '}
                      <bdi dir="ltr">(GAS -2 / +2)</bdi>
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-md border ${
                      enableSmartGoalsGas
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-muted text-muted-foreground-1 border-line-2'
                    }`}
                  >
                    {enableSmartGoalsGas
                      ? bi('مفعّل في حلقات الرعاية والملف السريري', 'Enabled in Episodes & Chart', 'چالاکە لە زنجیرەی چارەسەر و فایلی کلینیکیدا')
                      : bi('مخفي افتراضياً (الأهداف البسيطة فقط)', 'Hidden by Default (Simple Goals)', 'بە بنەڕەتی شاراوەیە (تەنها ئامانجە سادەکان)')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1">
                  {bi(
                    'يضيف تقسيم SMART الكامل وتقييم GAS من -2 إلى +2 في حلقة الرعاية وخطة العلاج. إخفاؤه يبقي شاشات الإدخال السريع أبسط.',
                    'Adds full S/M/A/R/T goal breakdown and GAS (-2 to +2) attainment tracking in episodes and charts. Hidden by default to keep daily entry simple.',
                    'دابەشکردنی تەواوی SMART و هەڵسەنگاندنی GAS لە -2 بۆ +2 زیاد دەکات لە زنجیرەی چارەسەر و پلانی چارەسەردا. شاردنەوەی شاشەکانی تۆمارکردنی ڕۆژانە سادەتر دەهێڵێتەوە.'
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !enableSmartGoalsGas;
                      ClinicOperationsService.setSmartGoalsGasEnabled(next);
                      setEnableSmartGoalsGas(next);
                    }}
                    className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                      enableSmartGoalsGas
                        ? 'bg-layer border border-layer-line text-foreground hover:bg-layer-hover'
                        : 'bg-primary hover:bg-primary-hover text-primary-foreground'
                    }`}
                  >
                    {enableSmartGoalsGas
                      ? bi('إخفاء SMART & GAS افتراضياً', 'Hide SMART & GAS Module', 'شاردنەوەی SMART و GAS بە بنەڕەتی')
                      : bi('تفعيل أهداف SMART ومقياس GAS', 'Enable SMART Goals & GAS', 'چالاککردنی ئامانجەکانی SMART و پێوەری GAS')}
                  </button>
                </div>
              </div>

              {/* Informed Consent & Digital Signature Module Toggle (Phase 4.8) */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <FileSignature className="size-4 text-primary" />
                    <span>
                      {bi(
                        'وحدة الموافقات المستنيرة والتوقيع الرقمي',
                        'Informed Consent & Digital Signature Module',
                        'بەشی ڕەزامەندی زانراو و واژۆی دیجیتاڵی'
                      )}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-md border ${
                      enableConsentModule
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-muted text-muted-foreground-1 border-line-2'
                    }`}
                  >
                    {enableConsentModule
                      ? bi('مفعّلة', 'Enabled', 'چالاکە')
                      : bi('معطلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1">
                  {bi(
                    'تتيح جمع تواقيع المرضى الإلكترونية (العلاج، حفظ البيانات، التصوير) وحفظها مشفرة في ملف المريض مع قابلية الطباعة.',
                    'Captures bilingual treatment, data storage, and clinical photography consents with encrypted canvas signatures inside Patient Profile.',
                    'ڕێگە دەدات بە کۆکردنەوەی واژۆی ئەلیکترۆنی نەخۆشەکان (چارەسەر، پاراستنی داتا، وێنەگرتن) و پاشەکەوتکردنیان بە کۆدکراوی لە دۆسیەی نەخۆشدا لەگەڵ توانای چاپکردن.'
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !enableConsentModule;
                      ClinicOperationsService.setConsentModuleEnabled(next);
                      setEnableConsentModule(next);
                    }}
                    className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                      enableConsentModule
                        ? 'bg-layer border border-layer-line text-foreground hover:bg-layer-hover'
                        : 'bg-primary hover:bg-primary-hover text-primary-foreground'
                    }`}
                  >
                    {enableConsentModule
                      ? bi('إخفاء وحدة الموافقات', 'Disable Consent Module', 'ناچالاککردنی بەشی ڕەزامەندییەکان')
                      : bi('تفعيل وحدة الموافقات', 'Enable Consent Module', 'چالاککردنی بەشی ڕەزامەندییەکان')}
                  </button>
                </div>
              </div>

              {/* 5.2 Encrypted Clinical Attachments & Posture Photos */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Camera className="size-4 text-primary" />
                    <span>
                      {bi(
                        'مرفقات المرضى المشفرة وصور مقارنة القوام (5.2)',
                        'Encrypted Attachments & Posture Photos (5.2)',
                        'پاشکۆ کۆدکراوەکانی نەخۆش و وێنەی بەراوردکردنی پۆستەر (5.2)'
                      )}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-bold rounded-md border bg-muted text-muted-foreground-1 border-line-2">
                    {enableAttachmentsModule
                      ? bi('مفعّلة', 'Enabled', 'چالاکە')
                      : bi('معطلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1">
                  {bi(
                    'حفظ صور القوام والأشعة وتقارير PDF مشفرة محلياً في Dexie v9 مع ضغط تلقائي ومقارنة قبل/بعد.',
                    'Encrypts posture photos, radiology captures, and PDFs inside Dexie v9 with automatic resizing and Before/After side-by-side comparison.',
                    'پاشەکەوتکردنی وێنەی پۆستەر، تیشک و ڕاپۆرتەکانی PDF بە کۆدکراوی ناوخۆیی لە Dexie v9 لەگەڵ کەمکردنەوەی قەبارەی خۆکار و بەراوردکردنی پێش/دوای.'
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const next = !enableAttachmentsModule;
                    ClinicOperationsService.setAttachmentsModuleEnabled(next);
                    setEnableAttachmentsModule(next);
                  }}
                  className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer ${
                    enableAttachmentsModule
                      ? 'bg-layer border border-layer-line text-foreground'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {enableAttachmentsModule
                    ? bi('إخفاء وحدة المرفقات', 'Disable Attachments Module', 'شاردنەوەی بەشی پاشکۆکان')
                    : bi('تفعيل وحدة المرفقات', 'Enable Attachments Module', 'چالاککردنی بەشی پاشکۆکان')}
                </button>
              </div>

              {/* 5.5 Local-Only Voice Dictation */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Mic className="size-4 text-primary" />
                    <span>
                      {bi(
                        'الإملاء الصوتي المحلي على الجهاز',
                        'On-Device Voice Dictation',
                        'نووسینی دەنگی ناوخۆیی لەسەر ئامێر'
                      )}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-bold rounded-md border bg-muted text-muted-foreground-1 border-line-2">
                    {enableVoiceDictationModule
                      ? bi('مفعّلة', 'Enabled', 'چالاکە')
                      : bi('معطلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1">
                  {speechCheckStatus
                    ? bi(
                        speechCheckStatus.reasonAr,
                        speechCheckStatus.reasonEn,
                        SPEECH_REASON_CKB[speechCheckStatus.reasonAr]
                      )
                    : bi(
                        'يُخفى زر الميكروفون تلقائياً إذا لم يتوفر نموذج صوتي محلي على المتصفح.',
                        'Microphone button stays hidden automatically unless an on-device speech model is available.',
                        'دوگمەی مایکرۆفۆن بە شێوەی خۆکار دەشاردرێتەوە ئەگەر مۆدێلی دەنگی ناوخۆیی لە وێبگەڕدا بەردەست نەبێت.'
                      )}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !enableVoiceDictationModule;
                      ClinicOperationsService.setVoiceDictationModuleEnabled(next);
                      setEnableVoiceDictationModule(next);
                    }}
                    className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer ${
                      enableVoiceDictationModule
                        ? 'bg-layer border border-layer-line text-foreground'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    {enableVoiceDictationModule
                      ? bi('إيقاف الإملاء الصوتي', 'Disable Voice Dictation', 'ڕاگرتنی نووسینی دەنگی')
                      : bi('تفعيل فحص الإملاء المحلي', 'Enable On-Device Dictation', 'چالاککردنی پشکنینی نووسینی دەنگی ناوخۆیی')}
                  </button>

                  {enableVoiceDictationModule && speechCheckStatus && !speechCheckStatus.onDeviceSupported && (
                    <label className="inline-flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowCloudSpeechOptIn}
                        onChange={(e) => {
                          const next = e.target.checked;
                          ClinicOperationsService.setCloudSpeechFallbackOptIn(next);
                          setAllowCloudSpeechOptIn(next);
                        }}
                      />
                      <span>
                        {bi(
                          'موافقة صريحة: السماح بوضع السحابة الاختياري (يرسل الصوت لمزود المتصفح)',
                          'Explicit Privacy Opt-In: allow browser cloud speech fallback',
                          'ڕەزامەندی ڕاشکاو: ڕێگەدان بە دۆخی هەوری بژاردەیی (دەنگ بۆ دابینکەری وێبگەڕ دەنێرێت)'
                        )}
                      </span>
                    </label>
                  )}
                </div>
              </div>

              {/* 5.6 Note Templates & CC0 Content Packs */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <FileCode2 className="size-4 text-primary" />
                    <span>
                      {bi(
                        'قوالب الجمل السريرية (/) وحزم المحتوى المفتوحة (5.6)',
                        'Clinical Note Templates (/) & Open Content Packs (5.6)',
                        'داڕشتەی ڕستە کلینیکییەکان (/) و پاکێجە کراوەکانی ناوەڕۆک (5.6)'
                      )}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-bold rounded-md border bg-muted text-muted-foreground-1 border-line-2">
                    {enableTemplatesModule
                      ? bi('مفعّلة', 'Enabled', 'چالاکە')
                      : bi('معطلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1">
                  {bi(
                    'اكتب / داخل ملاحظات SOAP لإدراج عبارات سريرية جاهزة (تأتي مع قوالب CC0-1.0 أصلية ويمكن استيراد حزم JSON مفتوحة الرخصة).',
                    'Type / inside SOAP notes to expand reusable snippets (ships with original CC0-1.0 templates + open-licensed JSON content pack importer).',
                    'لە ناو تێبینییەکانی SOAPدا / بنووسە بۆ دانانی دەستەواژە کلینیکییە ئامادەکان (لەگەڵ داڕشتە سەرەتاییەکانی CC0-1.0 دێت و دەتوانیت پاکێجی JSONی مۆڵەت-کراوە هاوردە بکەیت).'
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !enableTemplatesModule;
                      ClinicOperationsService.setTemplatesModuleEnabled(next);
                      setEnableTemplatesModule(next);
                    }}
                    className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer ${
                      enableTemplatesModule
                        ? 'bg-layer border border-layer-line text-foreground'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    {enableTemplatesModule
                      ? bi('تعطيل اختصارات القوالب (/)', 'Disable Slash Templates', 'ناچالاککردنی کورتکراوەکانی داڕشتە (/)')
                      : bi('تفعيل اختصارات القوالب (/)', 'Enable Slash Templates', 'چالاککردنی کورتکراوەکانی داڕشتە (/)')}
                  </button>

                  {enableTemplatesModule && (
                    <label className="py-2 px-3.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                      <Upload className="size-3.5" />
                      <span>{bi('استيراد حزمة محتوى JSON', 'Import Content Pack JSON', 'هاوردەکردنی پاکێجی ناوەڕۆکی JSON')}</span>
                      <input
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = async () => {
                            try {
                              const res = await ClinicOperationsService.importContentPackAsync(
                                String(reader.result || '')
                              );
                              setNoteTemplates(ClinicOperationsService.getAllNoteTemplates());
                              setPackImportStatus({
                                ok: true,
                                msg: bi(
                                  `تم استيراد "${res.pack.name}" (${res.pack.license}): ${res.importedCount} قالب.`,
                                  `Imported "${res.pack.name}" (${res.pack.license}): ${res.importedCount} snippets.`,
                                  `"${res.pack.name}" (${res.pack.license}) هاوردە کرا: ${res.importedCount} داڕشتە.`
                                ),
                              });
                            } catch (err) {
                              setPackImportStatus({
                                ok: false,
                                msg: err instanceof Error ? err.message : String(err),
                              });
                            }
                          };
                          reader.readAsText(file, 'utf-8');
                        }}
                      />
                    </label>
                  )}
                </div>

                {packImportStatus && (
                  <div
                    className={`p-2.5 rounded-lg text-xs border ${
                      packImportStatus.ok
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {packImportStatus.msg}
                  </div>
                )}

                {enableTemplatesModule && (
                  <div className="pt-2 border-t border-card-divider space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        aria-label={bi('اختصار القالب بدون شرطة', 'Slash trigger without slash', 'کورتکراوەی داڕشتە')}
                        value={newTplTrigger}
                        onChange={(e) => setNewTplTrigger(e.target.value)}
                        placeholder={bi(
                          'الاختصار بدون / (مثال: knee)',
                          'Slash trigger (e.g. knee)',
                          'کورتکراوە بێ / (نموونە: knee)'
                        )}
                        className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer text-xs text-foreground"
                      />
                      <input
                        type="text"
                        aria-label={bi('عنوان القالب', 'Template Title', 'ناونیشانی داڕشتە')}
                        value={newTplTitle}
                        onChange={(e) => setNewTplTitle(e.target.value)}
                        placeholder={bi('عنوان القالب', 'Template Title', 'ناونیشانی داڕشتە')}
                        className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer text-xs text-foreground"
                      />
                      <select
                        aria-label={bi('تصنيف القالب في SOAP', 'SOAP Category', 'پۆلێنی داڕشتە')}
                        value={newTplCategory}
                        onChange={(e) => setNewTplCategory(e.target.value as NoteTemplateCategory)}
                        className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer text-xs text-foreground"
                      >
                        <option value="general">{bi('عام', 'General', 'گشتی')}</option>
                        <option value="subjective">Subjective (S)</option>
                        <option value="objective">Objective (O)</option>
                        <option value="assessment">Assessment (A)</option>
                        <option value="plan">Plan (P)</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        aria-label={bi('نص العبارة السريرية', 'Full snippet text to insert', 'دەقی تەواوی ڕستە کلینیکییەکە')}
                        value={newTplBody}
                        onChange={(e) => setNewTplBody(e.target.value)}
                        placeholder={bi(
                          'نص العبارة السريرية التي ستُدرج…',
                          'Full snippet text to insert…',
                          'دەقی تەواوی ڕستە کلینیکییەکە کە دادەنرێت…'
                        )}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer text-xs text-foreground"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!newTplTrigger.trim() || !newTplBody.trim()) return;
                          await ClinicOperationsService.saveNoteTemplateAsync({
                            slashTrigger: newTplTrigger.trim(),
                            titleAr: newTplTitle.trim() || newTplTrigger.trim(),
                            titleEn: newTplTitle.trim() || newTplTrigger.trim(),
                            bodyAr: newTplBody.trim(),
                            bodyEn: newTplBody.trim(),
                            category: newTplCategory,
                            packId: 'clinic-custom',
                            source: 'Clinic Authored',
                            license: 'CC0-1.0',
                          });
                          setNewTplTrigger('');
                          setNewTplTitle('');
                          setNewTplBody('');
                          setNoteTemplates(ClinicOperationsService.getAllNoteTemplates());
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold cursor-pointer"
                      >
                        {bi('حفظ', 'Add', 'پاشەکەوتکردن')}
                      </button>
                    </div>
                    <div
                      tabIndex={0}
                      aria-label={bi('قائمة قوالب الجمل السريرية', 'Clinical note snippets list', 'لیستی داڕشتە کلینیکییەکان')}
                      className="max-h-36 overflow-y-auto space-y-1 focus:outline-none"
                    >
                      {noteTemplates.map((tpl) => (
                        <div
                          key={tpl.id}
                          className="px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span dir="ltr" className="font-mono font-bold text-primary me-2">
                              /{tpl.slashTrigger}
                            </span>
                            <span className="font-semibold text-foreground">
                              {bi(tpl.titleAr, tpl.titleEn)}
                            </span>
                            <span className="text-muted-foreground-1 ms-2"><bdi dir="ltr">({tpl.license})</bdi></span>
                          </div>
                          {!tpl.isBuiltIn && (
                            <button
                              type="button"
                              aria-label={bi('حذف القالب', 'Delete snippet', 'سڕینەوەی داڕشتە')}
                              onClick={async () => {
                                await ClinicOperationsService.deleteNoteTemplateAsync(tpl.id);
                                setNoteTemplates(ClinicOperationsService.getAllNoteTemplates());
                              }}
                              className="size-9 text-rose-600 hover:bg-rose-500/10 rounded inline-flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 5.7 Local Clinic Analytics Toggle */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <BarChart3 className="size-4 text-primary" />
                    <span>
                      {bi(
                        'التحليلات والإحصائيات السريرية المحلية (5.7)',
                        'Local Clinic Analytics Module (5.7)',
                        'شیکاری و ئاماری کلینیکی ناوخۆیی (5.7)'
                      )}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-bold rounded-md border bg-muted text-muted-foreground-1 border-line-2">
                    {enableAnalyticsModule
                      ? bi('مفعّلة', 'Enabled', 'چالاکە')
                      : bi('معطلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1">
                  {bi(
                    'حساب الحالات النشطة، نسبة الالتزام والغياب، تحسن المقاييس الوظيفية (MCID)، وصافي التدفق النقدي محلياً بالكامل.',
                    'Local-only caseload, attendance vs no-show rates, MCID outcome improvement, and monthly income vs expense charts.',
                    'ژماردنی حاڵەتە چالاکەکان، ڕێژەی پابەندبوون و ئامادەنەبوون، باشتربوونی پێوەرە کاراییەکان (MCID)، و پوختەی داهات و خەرجی بە تەواوی لەسەر ئامێرەکە.'
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const next = !enableAnalyticsModule;
                    ClinicOperationsService.setAnalyticsModuleEnabled(next);
                    setEnableAnalyticsModule(next);
                  }}
                  className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer ${
                    enableAnalyticsModule
                      ? 'bg-layer border border-layer-line text-foreground'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {enableAnalyticsModule
                    ? bi('إخفاء تبويب التحليلات', 'Hide Analytics Tab', 'شاردنەوەی تابی شیکاری')
                    : bi('تفعيل لوحة التحليلات المحلية', 'Enable Local Analytics', 'چالاککردنی شیکاری ناوخۆیی')}
                </button>
              </div>

              {/* 5.10 Locked Patient Kiosk Mode Toggle */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <TabletSmartphone className="size-4 text-primary" />
                    <span>
                      {bi(
                        'وضع كشك المريض المقفل على الجهاز اللوحي (5.10)',
                        'Locked Patient Kiosk Mode (5.10)',
                        'شێوازی کیۆسکی قفڵدراوی نەخۆش لەسەر تابلێت (5.10)'
                      )}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-bold rounded-md border bg-muted text-muted-foreground-1 border-line-2">
                    {enableKioskModule
                      ? bi('مفعّل', 'Enabled', 'چالاکە')
                      : bi('معطل افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground-1">
                  {bi(
                    'شاشة دخول ذاتي وموافقة مستنيرة وتقييم PSFS للمريض على الآيباد بدون إظهار أي مريض آخر، ولا تُغلق إلا برمز PIN أو كلمة مرور الخزينة.',
                    'Dedicated tablet self-intake, PSFS, and signed consent station exposing zero other records; exit requires Admin PIN or Vault Password.',
                    'شاشەی تۆمارکردنی خۆیی، ڕەزامەندی زانراو و هەڵسەنگاندنی PSFS بۆ نەخۆش لەسەر تابلێت بێ پیشاندانی هیچ نەخۆشێکی تر، و تەنها بە کۆدی PIN یان وشەی نهێنی خەزێنە دادەخرێت.'
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const next = !enableKioskModule;
                    ClinicOperationsService.setKioskModuleEnabled(next);
                    setEnableKioskModule(next);
                  }}
                  className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer ${
                    enableKioskModule
                      ? 'bg-layer border border-layer-line text-foreground'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {enableKioskModule
                    ? bi('تعطيل وضع الكشك', 'Disable Patient Kiosk', 'ناچالاککردنی شێوازی کیۆسک')
                    : bi('تفعيل وضع كشك المريض', 'Enable Patient Kiosk', 'چالاککردنی شێوازی کیۆسکی نەخۆش')}
                </button>
              </div>

              {/* Contextual Tips & Optional Guided Tour Controls (2.8) */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Compass className="size-4 text-primary" />
                    <span>
                      {bi(
                        'التلميحات الإرشادية والجولة السريعة',
                        'Contextual Tips & Guided Tour',
                        'ئامۆژگارییە ڕێنمایییەکان و گەشتی خێرا'
                      )}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-md border ${
                      tipsEnabled
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-muted text-muted-foreground-1 border-line-2'
                    }`}
                  >
                    {tipsEnabled
                      ? bi('مفعّلة', 'On', 'چالاکە')
                      : bi('مخفية', 'Off', 'شاراوەیە')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const next = !tipsEnabled;
                      setTipsEnabled(next);
                      await ClinicOperationsService.setTipsEnabledAsync(next);
                    }}
                    className="py-2 px-3.5 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold cursor-pointer"
                  >
                    {tipsEnabled
                      ? bi('إخفاء التلميحات الإرشادية', 'Hide Contextual Tips', 'شاردنەوەی ئامۆژگارییە ڕێنمایییەکان')
                      : bi('تفعيل التلميحات الإرشادية', 'Show Contextual Tips', 'پیشاندانی ئامۆژگارییە ڕێنمایییەکان')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await ClinicOperationsService.resetOnboardingAsync();
                      setTipsEnabled(true);
                    }}
                    className="py-2 px-3.5 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>{bi('استعادة التلميحات المغلقة', 'Reset Dismissed Tips', 'گەڕاندنەوەی ئامۆژگارییە داخراوەکان')}</span>
                  </button>
                  {onStartTour && (
                    <button
                      type="button"
                      onClick={onStartTour}
                      className="py-2 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Compass className="size-3.5" />
                      <span>{bi('بدء الجولة السريعة', 'Start Guided Tour', 'دەستپێکردنی گەشتی خێرا')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Phase B — Faster Clinical Workflow & Safety Controls (B2–B8) */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Activity className="size-4 text-primary" />
                    <span>
                      {bi(
                        'وحدات سير العمل السريري السريع والسلامة (Phase B)',
                        'Clinical Workflow & Safety Modules (Phase B)',
                        'بەشەکانی کارکردنی خێرای کلینیکی و سەلامەتی (Phase B)'
                      )}
                    </span>
                  </div>
                </div>

                {/* B2: Problem List & Outcome-Linked Goals */}
                <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {bi(
                        'قائمة المشاكل والأهداف المرتبطة بالمقاييس (B2)',
                        'Problem List & Outcome-Linked Goals (B2)',
                        'لیستی کێشەکان و ئامانجە بەستراوەکان بە پێوەرەکانەوە (B2)'
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground-1">
                      {bi(
                        'ربط الأهداف بمقاييس (ODI / NPRS / LEFS) مع حساب التحسن التلقائي MCID.',
                        'Link episode goals to ODI/NPRS/LEFS baselines with automatic MCID status.',
                        'بەستنەوەی ئامانجەکان بە پێوەرەکانی (ODI / NPRS / LEFS) لەگەڵ هەژمارکردنی خۆکاری باشتربوون (MCID).'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="toggle-problem-list-goals-btn"
                    onClick={() => {
                      const next = !enableProblemListGoals;
                      ClinicOperationsService.setProblemListGoalsEnabled(next);
                      setEnableProblemListGoals(next);
                    }}
                    className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                      enableProblemListGoals
                        ? 'bg-emerald-600 text-white'
                        : 'bg-surface border border-layer-line text-foreground'
                    }`}
                  >
                    {enableProblemListGoals ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
                  </button>
                </div>

                {/* B3: Re-Evaluation Nudges (OFF BY DEFAULT) */}
                <div className="p-3 rounded-xl bg-layer/60 border border-layer-line space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">
                        {bi(
                          'تنبيهات استحقاق إعادة التقييم (B3)',
                          'Re-Evaluation Nudges (B3)',
                          'ئاگادارکردنەوەی کاتی دووبارە هەڵسەنگاندن (B3)'
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground-1">
                        {bi(
                          'مغلقة افتراضياً — تُظهر شارة في قائمة اليوم والملف السريري عند تجاوز عدد الجلسات أو الأيام المحددة.',
                          'Off by default — surfaces a non-intrusive badge in Today Command & Patient Chart after N sessions or D days.',
                          'بە بنەڕەتی ناچالاکە — نیشانەیەکی هێمن لە لیستی ئەمڕۆ و دۆسیەی نەخۆشدا پیشان دەدات کاتێک ژمارەی دانیشتن یان ڕۆژە دیاریکراوەکان تێدەپەڕێنرێت.'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="toggle-reeval-nudges-btn"
                      onClick={() => {
                        const next = !enableReEvalNudges;
                        ClinicOperationsService.setReEvalNudgesEnabled(next);
                        setEnableReEvalNudges(next);
                      }}
                      className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                        enableReEvalNudges
                          ? 'bg-emerald-600 text-white'
                          : 'bg-surface border border-layer-line text-foreground'
                      }`}
                    >
                      {enableReEvalNudges
                        ? bi('مفعّلة', 'Enabled', 'چالاکە')
                        : bi('معطّلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="reeval-sessions-input" className="block text-xs font-semibold text-foreground mb-1">
                        {bi('عتبة عدد الجلسات (N)', 'After N Sessions', 'سنووری ژمارەی دانیشتنەکان (N)')}
                      </label>
                      <input
                        id="reeval-sessions-input"
                        type="number"
                        min={1}
                        max={50}
                        dir="ltr"
                        data-testid="reeval-sessions-input"
                        value={reEvalConfig.afterSessions}
                        onChange={(e) => {
                          const n = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                          setReEvalConfig((prev) => ({ ...prev, afterSessions: n }));
                          ClinicOperationsService.setReEvalNudgeConfig(n, reEvalConfig.afterDays);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg bg-surface border border-layer-line text-xs text-foreground"
                      />
                    </div>
                    <div>
                      <label htmlFor="reeval-days-input" className="block text-xs font-semibold text-foreground mb-1">
                        {bi('عتبة عدد الأيام (D)', 'After D Days', 'سنووری ژمارەی ڕۆژەکان (D)')}
                      </label>
                      <input
                        id="reeval-days-input"
                        type="number"
                        min={1}
                        max={180}
                        dir="ltr"
                        data-testid="reeval-days-input"
                        value={reEvalConfig.afterDays}
                        onChange={(e) => {
                          const d = Math.max(1, Math.min(180, Number(e.target.value) || 1));
                          setReEvalConfig((prev) => ({ ...prev, afterDays: d }));
                          ClinicOperationsService.setReEvalNudgeConfig(reEvalConfig.afterSessions, d);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg bg-surface border border-layer-line text-xs text-foreground"
                      />
                    </div>
                  </div>
                </div>

                {/* B4: Note Completeness Check */}
                <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {bi(
                        'فحص اكتمال الملاحظة غير المعطل (B4)',
                        'Non-Blocking Note Completeness Check (B4)',
                        'پشکنینی تەواوبوونی تێبینی بێ ڕێگریکردن (B4)'
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground-1">
                      {bi(
                        'يعرض البنود الناقصة قبل اعتماد الجلسة مع إمكانية الاعتماد على أي حال.',
                        'Displays missing items checklist before sign-off while allowing Finalize anyway.',
                        'بڕگە کەمەکان پیشان دەدات پێش پەسەندکردنی دانیشتن لەگەڵ توانای تەواوکردن لە هەموو بارێکدا.'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="toggle-completeness-check-btn"
                    onClick={() => {
                      const next = !enableNoteCompletenessCheck;
                      ClinicOperationsService.setNoteCompletenessCheckEnabled(next);
                      setEnableNoteCompletenessCheck(next);
                    }}
                    className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                      enableNoteCompletenessCheck
                        ? 'bg-emerald-600 text-white'
                        : 'bg-surface border border-layer-line text-foreground'
                    }`}
                  >
                    {enableNoteCompletenessCheck ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
                  </button>
                </div>

                {/* B5: Performance-Test Library */}
                <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {bi(
                        'مكتبة اختبارات الأداء الوظيفي (B5)',
                        'Procedural Performance-Test Library (B5)',
                        'کتێبخانەی تاقیکردنەوەکانی کارایی جەستەیی (B5)'
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground-1">
                      {bi(
                        'LSI / 10MWT / 6MWT / 30s-CST / 5xSTS / Grip مع وسم حاجة المراجعة السريرية.',
                        'LSI, 10MWT, 6MWT, SLS, 30s-CST, 5xSTS, Grip with expert verification flags.',
                        'LSI / 10MWT / 6MWT / 30s-CST / 5xSTS / Grip لەگەڵ نیشانەی پێویستی پێداچوونەوەی کلینیکی.'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="toggle-performance-library-btn"
                    onClick={() => {
                      const next = !enablePerformanceTestLibrary;
                      ClinicOperationsService.setPerformanceTestLibraryEnabled(next);
                      setEnablePerformanceTestLibrary(next);
                    }}
                    className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                      enablePerformanceTestLibrary
                        ? 'bg-emerald-600 text-white'
                        : 'bg-surface border border-layer-line text-foreground'
                    }`}
                  >
                    {enablePerformanceTestLibrary ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
                  </button>
                </div>

                {/* B6: Modality Safety Checker (Disabled Until Senior PT Review) */}
                <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/30 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <AlertTriangle className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>
                        {bi(
                          'قواعد سلامة الأجهزة الكهربائية والفيزيائية (B6)',
                          'Modality Contraindication Rules (B6 — Senior PT Review Gate)',
                          'یاساکانی سەلامەتی ئامێرە کارەبایی و فیزیایییەکان (B6)'
                        )}
                      </span>
                    </div>
                    <span
                      data-testid="modality-safety-status-badge"
                      className={`px-2 py-0.5 rounded-md text-xs font-bold border ${
                        modalityReviewStatus.enabled
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {modalityReviewStatus.enabled
                        ? bi('مراجَع ومفعّل', 'Reviewed & Active', 'پێداچوونەوەی بۆ کراوە و چالاکە')
                        : bi('معطّل حتى مراجعة معالج أول', 'Disabled until reviewed by Senior PT', 'ناچالاکە تا پێداچوونەوەی چارەسەرکاری باڵا')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground-1">
                    {bi(
                      'تُربط أجهزة (TENS/NMES/IFC/Ultrasound/SWD/الحرارة/البرودة/الشد/الإبر) بمحاذير المريض وتبقى معطلة حتى اعتماد اسم المعالج الأقدم.',
                      'Cross-checks physical agents against structured precautions (pacemaker, pregnancy, DVT, malignancy, metal) — gated on Senior PT review sign-off.',
                      'ئامێرەکانی (TENS/NMES/IFC/Ultrasound/SWD/گەرمی/ساردی/کێشان/دەرزی) بە ڕێگرییەکانی نەخۆشەوە دەبەستێتەوە و تا پەسەندکردنی ناوی چارەسەرکاری باڵا ناچالاک دەمێنێتەوە.'
                    )}
                  </p>
                  {modalityReviewStatus.reviewed && modalityReviewStatus.reviewedBy && (
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      {bi(
                        `تمت المراجعة بواسطة: ${modalityReviewStatus.reviewedBy}`,
                        `Reviewed by: ${modalityReviewStatus.reviewedBy}`,
                        `پێداچوونەوە کراوە لەلایەن: ${modalityReviewStatus.reviewedBy}`
                      )}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      aria-label={bi('اسم أخصائي العلاج الطبيعي الأقدم', 'Senior PT full name for sign-off', 'ناوی تەواوی چارەسەرکاری سروشتی باڵا')}
                      data-testid="modality-safety-reviewer-input"
                      value={reviewerNameDraft}
                      onChange={(e) => setReviewerNameDraft(e.target.value)}
                      placeholder={bi(
                        'اسم أخصائي العلاج الطبيعي الأقدم...',
                        'Senior PT full name for sign-off...',
                        'ناوی تەواوی چارەسەرکاری سروشتی باڵا...'
                      )}
                      className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-surface border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      data-testid="modality-safety-review-enable-btn"
                      disabled={!reviewerNameDraft.trim()}
                      onClick={() => {
                        if (!reviewerNameDraft.trim()) return;
                        ClinicOperationsService.confirmModalitySafetyReview(
                          reviewerNameDraft.trim(),
                          true
                        );
                        setModalityReviewStatus(
                          ClinicOperationsService.getModalitySafetyReviewStatus()
                        );
                      }}
                      className="py-1.5 px-3.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
                    >
                      {bi('اعتماد المراجعة والتفعيل', 'Mark Reviewed & Enable', 'پەسەندکردنی پێداچوونەوە و چالاککردن')}
                    </button>
                    {modalityReviewStatus.reviewed && (
                      <button
                        type="button"
                        data-testid="modality-safety-toggle-active-btn"
                        onClick={() => {
                          ClinicOperationsService.setModalitySafetyCheckEnabled(
                            !modalityReviewStatus.enabled
                          );
                          setModalityReviewStatus(
                            ClinicOperationsService.getModalitySafetyReviewStatus()
                          );
                        }}
                        className="py-1.5 px-3 rounded-xl bg-surface border border-layer-line text-xs font-bold text-foreground cursor-pointer"
                      >
                        {modalityReviewStatus.enabled
                          ? bi('إيقاف مؤقت', 'Pause Rules', 'ڕاگرتنی کاتی')
                          : bi('تفعيل', 'Enable', 'چالاککردن')}
                      </button>
                    )}
                  </div>
                </div>

                {/* B7: Session Vitals Module */}
                <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {bi(
                        'وحدة العلامات الحيوية واتجاهاتها (B7)',
                        'Session Vitals & Trend Chart (B7)',
                        'بەشی نیشانە زیندەییەکان و هێڵکاری گۆڕانکارییەکان (B7)'
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground-1">
                      {bi(
                        'تسجيل ضغط الدم والنبض وSpO2 مع تنبيهات عتبات قابلة للتعديل.',
                        'Record BP, HR, SpO2 with editable AHA/ACSM alert thresholds.',
                        'تۆمارکردنی پەستانی خوێن، لێدانی دڵ و SpO2 لەگەڵ ئاگادارکەرەوەی سنوورە گۆڕاوەکان.'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="toggle-vitals-module-btn"
                    onClick={() => {
                      const next = !enableVitalsModule;
                      ClinicOperationsService.setVitalsModuleEnabled(next);
                      setEnableVitalsModule(next);
                    }}
                    className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                      enableVitalsModule
                        ? 'bg-emerald-600 text-white'
                        : 'bg-surface border border-layer-line text-foreground'
                    }`}
                  >
                    {enableVitalsModule ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
                  </button>
                </div>

                {/* B8: Pediatric Safeguards */}
                <div className="p-3 rounded-xl bg-layer/60 border border-layer-line space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">
                        {bi(
                          'ضوابط حماية الأطفال والقُصّر < 18 سنة (B8)',
                          'Pediatric Guardian Safeguards < 18 yrs (B8)',
                          'یاساکانی پاراستنی منداڵان و ناکامان < 18 ساڵ (B8)'
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground-1">
                        {bi(
                          'إلزام بيانات وموافقة ولي الأمر عند تسجيل مريض دون 18 عاماً أو توقيع الإقرار.',
                          'Requires guardian contact & consent for patients under 18.',
                          'داواکردنی زانیاری و ڕەزامەندی سەرپەرشتیار لە کاتی تۆمارکردنی نەخۆشی خوار 18 ساڵ یان واژۆکردنی ڕەزامەندیدا.'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="toggle-pediatric-safeguards-btn"
                      onClick={() => {
                        const next = !enablePediatricSafeguards;
                        ClinicOperationsService.setPediatricSafeguardsEnabled(next);
                        setEnablePediatricSafeguards(next);
                      }}
                      className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                        enablePediatricSafeguards
                          ? 'bg-emerald-600 text-white'
                          : 'bg-surface border border-layer-line text-foreground'
                      }`}
                    >
                      {enablePediatricSafeguards ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Phase C: Iraq-Specific Operations Toggles (C1–C7) */}
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Compass className="size-4 text-primary" />
                  <span>
                    {bi(
                      'وحدات التشغيل الخاصة بعيادات العراق (Phase C)',
                      'Iraq-Specific Operations Modules (Phase C)',
                      'بەشەکانی کارکردنی کلینیکەکانی عێراق (Phase C)'
                    )}
                  </span>
                </div>

                {[
                  {
                    testId: 'toggle-home-visits-btn',
                    titleAr: 'الزيارات المنزلية وفواصل التنقل والخرائط (C1)',
                    titleEn: 'Home Visits, Landmarks, Travel Buffers & Maps Link (C1)',
                    titleCkb: 'سەردانی ماڵەوە، کاتی هاتوچۆ و بەستەری نەخشە (C1)',
                    descAr: 'دعم العنوان المعلمي ورسوم التوصيل الاختيارية وفتح الخريطة عند طلب المستخدم.',
                    descEn: 'Landmark addresses, optional travel fee line (blank default), and user-initiated Maps link.',
                    descCkb: 'پشتگیری ناونیشانی شوێنی ناسراو، نرخی هاتوچۆی بژاردەیی و کردنەوەی نەخشە بە داواکاری بەکارهێنەر.',
                    value: enableHomeVisits,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setHomeVisitsEnabled(next);
                      setEnableHomeVisits(next);
                    },
                  },
                  {
                    testId: 'toggle-practice-locations-btn',
                    titleAr: 'مواقع الممارسة المتعددة (C2)',
                    titleEn: 'Multiple Practice Locations (C2)',
                    titleCkb: 'شوێنە جیاوازەکانی کارکردن (C2)',
                    descAr: 'تصنيف المواعيد والفواتير بين العيادة الرئيسية والمنزل والمستشفى والعيادة الثانية.',
                    descEn: 'Tag appointments & invoices across Clinic, Home Visits, Hospital, or Second Clinic.',
                    descCkb: 'پۆلێنکردنی چاوپێکەوتن و پسوڵەکان لە نێوان کلینیکی سەرەکی، ماڵەوە، نەخۆشخانە و کلینیکی دووەم.',
                    value: enablePracticeLocations,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setPracticeLocationsEnabled(next);
                      setEnablePracticeLocations(next);
                    },
                  },
                  {
                    testId: 'toggle-closed-days-breaks-btn',
                    titleAr: 'أيام الإغلاق والاستراحات الأسبوعية (C3)',
                    titleEn: 'Custom Closed Days & Weekly Breaks (C3)',
                    titleCkb: 'ڕۆژانی پشوو و پشووە هەفتانەییەکان (C3)',
                    descAr: 'استراحات الصلاة/الغداء وتواريخ الإغلاق التي يدخلها المستخدم مع تنبيه المواعيد.',
                    descEn: 'Lunch/prayer weekly breaks and user-entered closed date ranges honored by scheduling.',
                    descCkb: 'پشووی نوێژ/نیوەڕۆ و ڕۆژانی داخستنی تۆمارکراو لەلایەن بەکارهێنەرەوە لەگەڵ ئاگادارکردنەوەی چاوپێکەوتنەکان.',
                    value: enableClosedDaysBreaks,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setClosedDaysBreaksEnabled(next);
                      setEnableClosedDaysBreaks(next);
                    },
                  },
                  {
                    testId: 'toggle-hijri-date-btn',
                    titleAr: 'عرض التاريخ الهجري الاختياري (C3)',
                    titleEn: 'Optional Hijri Date Display via Intl (C3)',
                    titleCkb: 'پیشاندانی بژاردەیی ڕێکەوتی کۆچی (C3)',
                    descAr: 'إظهار التاريخ الهجري بجانب الميلادي في الجدول باستخدام تقويم المتصفح المحلي.',
                    descEn: 'Display Hijri calendar date beside Gregorian in schedule via browser Intl API.',
                    descCkb: 'پیشاندانی ڕێکەوتی کۆچی لە تەنیشت زاینی لە خشتەکەدا بە بەکارهێنانی ڕۆژژمێری ناوخۆیی وێبگەڕ.',
                    value: enableHijriDateDisplay,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setHijriDateDisplayEnabled(next);
                      setEnableHijriDateDisplay(next);
                    },
                  },
                  {
                    testId: 'toggle-installment-plans-btn',
                    titleAr: 'خطط الأقساط وتقادم الديون 30/60/90 يوم (C4)',
                    titleEn: 'Installment Plans & 30/60/90-Day Aging (C4)',
                    titleCkb: 'پلانی قیستەکان و کۆنبوونی قەرزی 30/60/90 ڕۆژ (C4)',
                    descAr: 'تقسيم الفاتورة إلى دفعات مجدولة مع تنبيهات التأخير وتذكير واتساب.',
                    descEn: 'Split invoices into due dates with 30/60/90 aging buckets & one-tap WhatsApp reminders.',
                    descCkb: 'دابەشکردنی پسوڵە بۆ قیستی دیاریکراو لەگەڵ ئاگادارکردنەوەی دواکەوتن و بیرخستنەوەی واتساپ.',
                    value: enableInstallmentPlans,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setInstallmentPlansEnabled(next);
                      setEnableInstallmentPlans(next);
                    },
                  },
                  {
                    testId: 'toggle-recurring-expenses-btn',
                    titleAr: 'المصاريف الدورية والتصنيفات المخصصة (C5)',
                    titleEn: 'Recurring Monthly Expenses & Custom Categories (C5)',
                    titleCkb: 'خەرجییە دووبارەبووەکان و پۆلە تایبەتەکان (C5)',
                    descAr: 'قوالب الإيجار والمولدة والاشتراكات مع اقتراح "مستحق هذا الشهر".',
                    descEn: 'Rent, generator fuel & subscription templates with "Due this month" prompts.',
                    descCkb: 'داڕشتەی کرێ، مۆلیدە و بەشداریکردنەکان لەگەڵ پێشنیاری "شایستەی ئەم مانگە".',
                    value: enableRecurringExpenses,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setRecurringExpensesEnabled(next);
                      setEnableRecurringExpenses(next);
                    },
                  },
                  {
                    testId: 'toggle-referrals-module-btn',
                    titleAr: 'الإحالات ودليل الأطباء ورسالة التقرير (C6)',
                    titleEn: 'Referral Sources, Doctor Directory & Report-Back Letters (C6)',
                    titleCkb: 'ڕەوانەکردنەکان، ڕێبەری پزیشکان و نامەی ڕاپۆرت (C6)',
                    descAr: 'تتبع مصادر الإحالة وإحصائياتها وإنشاء رسالة متابعة للطبيب بنقرة واحدة.',
                    descEn: 'Track referral sources, doctor directory analytics, and one-click report-back letters.',
                    descCkb: 'شوێنپێگرتنی سەرچاوەکانی ڕەوانەکردن و ئامارەکانیان و دروستکردنی نامەی وەڵام بۆ پزیشک بە یەک کلیک.',
                    value: enableReferralsModule,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setReferralsModuleEnabled(next);
                      setEnableReferralsModule(next);
                    },
                  },
                  {
                    testId: 'toggle-retention-lists-btn',
                    titleAr: 'قوائم المتابعة والاحتفاظ بالمرضى (C7)',
                    titleEn: 'Retention Lists & 4w/12w Post-Discharge Follow-Ups (C7)',
                    titleCkb: 'لیستی بەدواداچوون و پاراستنی نەخۆشەکان (C7)',
                    descAr: 'متابعة المنقطعين، استبيان 4 و12 أسبوعاً (NPRS/PSFS)، انتهاء الكورس والديون.',
                    descEn: 'Inactive plan alerts, 4w/12w post-discharge outcome follow-ups, package expiry & balances.',
                    descCkb: 'بەدواداچوونی دابڕاوەکان، ڕاپرسی 4 و 12 هەفتە (NPRS/PSFS)، تەواوبوونی کۆرس و قەرزەکان.',
                    value: enableRetentionLists,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setRetentionListsEnabled(next);
                      setEnableRetentionLists(next);
                    },
                  },
                ].map((mod) => (
                  <div
                    key={mod.testId}
                    className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">
                        {bi(mod.titleAr, mod.titleEn, mod.titleCkb)}
                      </p>
                      <p className="text-xs text-muted-foreground-1">
                        {bi(mod.descAr, mod.descEn, mod.descCkb)}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={mod.testId}
                      onClick={() => mod.onToggle(!mod.value)}
                      className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                        mod.value
                          ? 'bg-emerald-600 text-white'
                          : 'bg-surface border border-layer-line text-foreground'
                      }`}
                    >
                      {mod.value ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
                    </button>
                  </div>
                ))}

                {enableRetentionLists && (
                  <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">
                        {bi(
                          'عتبة الانقطاع عن الخطة النشطة (بالأيام)',
                          'Active-Plan Inactivity Threshold (Days)',
                          'سنووری دابڕان لە پلانی چالاک (بە ڕۆژ)'
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground-1">
                        {bi(
                          'إظهار المرضى النشطين بدون زيارة خلال آخر N يوماً في قائمة المتابعة.',
                          'Flag active episodes with no visit for at least N days in the Retention list.',
                          'پیشاندانی نەخۆشە چالاکەکان کە لە ماوەی N ڕۆژی ڕابردوودا سەردانیان نەکردووە لە لیستی بەدواداچووندا.'
                        )}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={3}
                      max={180}
                      aria-label={bi('عتبة الانقطاع عن الخطة النشطة بالأيام', 'Active-Plan Inactivity Threshold Days', 'سنووری دابڕان بە ڕۆژ')}
                      data-testid="retention-inactive-days-input"
                      value={retentionInactiveDays}
                      onChange={(e) => {
                        const val = Math.max(3, Math.min(180, Number(e.target.value) || 14));
                        setRetentionInactiveDays(val);
                        ClinicOperationsService.setRetentionInactiveDaysThreshold(val);
                      }}
                      className="w-24 py-1.5 px-3 rounded-xl bg-surface border border-layer-line text-xs font-bold text-foreground text-center"
                    />
                  </div>
                )}
              </div>

              {/* Phase D: Data Quality, Import, Recycle Bin & Terminology (D1–D5) */}
              <div
                data-testid="settings-phaseD-modules-card"
                className="p-4 rounded-xl bg-surface border border-line-2 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Shield className="size-4 text-primary" />
                  <span>
                    {bi(
                      'جودة البيانات، الاستيراد، السلة والمصطلحات (Phase D)',
                      'Data Quality, Import, Recycle Bin & Terminology (Phase D)',
                      'کوالێتی داتا، هاوردەکردن، سەبەتە و زاراوەکان (Phase D)'
                    )}
                  </span>
                </div>

                {/* D1: Essential Always-Active Duplicate Guard & Transactional Merge */}
                <div className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {bi(
                        'منع التكرار والدمج الآمن لملفات المرضى (D1)',
                        'Duplicate Patient Guard & Transactional Merge (D1)',
                        'ڕێگری لە دووبارەبوونەوە و تێکەڵکردنی سەلامەتی دۆسیەی نەخۆش (D1)'
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground-1">
                      {bi(
                        'فحص تطابق الاسم أو آخر 7 أرقام للهاتف وحفظ لقطة أمان مشفرة قبل أي دمج.',
                        'Always active to warn on matching name/7-digit phone and capture encrypted pre-merge snapshots.',
                        'پشکنینی هاوشێوەیی ناو یان دوا 7 ژمارەی مۆبایل و پاشەکەوتکردنی وێنەی سەلامەتی کۆدکراو پێش هەر تێکەڵکردنێک.'
                      )}
                    </p>
                  </div>
                  <span
                    data-testid="badge-duplicate-guard-essential"
                    className="shrink-0 px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-extrabold"
                  >
                    {bi('أساسي · مفعّل دائماً', 'ESSENTIAL · Always Active', 'بنەڕەتی · هەمیشە چالاکە')}
                  </span>
                </div>

                {[
                  {
                    testId: 'toggle-import-wizard-btn',
                    titleAr: 'معالج استيراد المرضى CSV / XLSX (D2)',
                    titleEn: 'CSV & XLSX Patient Import Wizard (D2)',
                    titleCkb: 'ڕێنیشاندەری هاوردەکردنی نەخۆشەکان CSV / XLSX (D2)',
                    descAr: 'تخمين تلقائي للأعمدة، فحص تكرار تجريبي قبل الحفظ، وإمكانية التراجع الكامل عن الاستيراد.',
                    descEn: 'Offline column auto-guess, dry-run duplicate preview, and atomic import batch rollback.',
                    descCkb: 'پێشبینی خۆکاری ستوونەکان، پشکنینی دووبارەبوونەوە پێش پاشەکەوتکردن و توانای گەڕانەوەی تەواو لە هاوردەکردن.',
                    value: enableImportWizard,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setImportWizardEnabled(next);
                      setEnableImportWizard(next);
                    },
                  },
                  {
                    testId: 'toggle-trash-recycle-bin-btn',
                    titleAr: 'سلة المهملات غير السريرية لمدة 30 يوماً (D3)',
                    titleEn: '30-Day Non-Clinical Recycle Bin (D3)',
                    titleCkb: 'سەبەتەی سڕاوە ناکلینیکییەکان بۆ ماوەی 30 ڕۆژ (D3)',
                    descAr: 'استعادة المواعيد وقائمة الانتظار والمصاريف خلال 30 يوماً مع بقاء السجلات السريرية محمية دائماً.',
                    descEn: 'Recover deleted appointments, waitlist entries & expenses for 30 days; clinical records stay immutable.',
                    descCkb: 'گەڕاندنەوەی چاوپێکەوتن، لیستی چاوەڕوانی و خەرجییەکان لە ماوەی 30 ڕۆژدا لەگەڵ مانەوەی تۆمارە کلینیکییەکان بە پارێزراوی.',
                    value: enableTrashRecycleBin,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setTrashRecycleBinEnabled(next);
                      setEnableTrashRecycleBin(next);
                    },
                  },
                  {
                    testId: 'toggle-data-health-screen-btn',
                    titleAr: 'شاشة صحة البيانات وفحص السجلات المعزولة (D4)',
                    titleEn: 'Data Health Screen & Orphan Record Scanner (D4)',
                    titleCkb: 'شاشەی تەندروستی داتا و پشکنەری تۆمارە دابڕاوەکان (D4)',
                    descAr: 'فحص البيانات الناقصة، المسودات غير المعتمدة، الفواتير، السجلات المعزولة وتمرين النسخ الاحتياطي.',
                    descEn: 'Audit missing demographics, unsigned drafts, unpaid invoices, orphan records & backup verification.',
                    descCkb: 'پشکنینی زانیارییە کەمەکان، ڕەشنووسە واژۆنەکراوەکان، پسوڵە نەدراوەکان، تۆمارە دابڕاوەکان و دڵنیابوونەوە لە کۆپی یەدەگ.',
                    value: enableDataHealthScreen,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setDataHealthScreenEnabled(next);
                      setEnableDataHealthScreen(next);
                    },
                  },
                  {
                    testId: 'toggle-bilingual-glossary-btn',
                    titleAr: 'معجم المصطلحات ثنائي اللغة والاختصارات (D5)',
                    titleEn: 'Bilingual Terminology Glossary & Quick Help (D5)',
                    titleCkb: 'فەرهەنگی زاراوەکان و کورتکراوەکان (D5)',
                    descAr: 'دليل مصطلحات واختصارات العلاج الطبيعي بالعربية والإنجليزية (ODI، NPRS، MCID، ROM، MMT).',
                    descEn: 'Offline Arabic/English clinical glossary for outcome scores, SOAP, ROM & safety terminology.',
                    descCkb: 'ڕێبەری زاراوە و کورتکراوەکانی چارەسەری سروشتی بێ ئینتەرنێت (ODI، NPRS، MCID، ROM، MMT).',
                    value: enableBilingualGlossary,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setBilingualTerminologyGlossaryEnabled(next);
                      setEnableBilingualGlossary(next);
                    },
                  },
                ].map((mod) => (
                  <div
                    key={mod.testId}
                    className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">
                        {bi(mod.titleAr, mod.titleEn, mod.titleCkb)}
                      </p>
                      <p className="text-xs text-muted-foreground-1">
                        {bi(mod.descAr, mod.descEn, mod.descCkb)}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={mod.testId}
                      onClick={() => mod.onToggle(!mod.value)}
                      className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                        mod.value
                          ? 'bg-emerald-600 text-white'
                          : 'bg-surface border border-layer-line text-foreground'
                      }`}
                    >
                      {mod.value ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
                    </button>
                  </div>
                ))}
              </div>

              {/* Phase E: Sharing, .ics Calendar Export, Visit Card Printing & Photo Tools (E1–E4) */}
              <div
                data-testid="settings-phaseE-modules-card"
                className="p-4 rounded-xl bg-surface border border-line-2 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Share2 className="size-4 text-primary" />
                  <span>
                    {bi(
                      'المشاركة، التصدير للتقويم، طباعة المواعيد وقياس الصور (Phase E)',
                      'Sharing, Calendar Export, Visit Card Print & Photo Tools (Phase E)',
                      'هاوبەشکردن، هەناردەکردنی ڕۆژژمێر، چاپ و پێوانەی وێنە (Phase E)'
                    )}
                  </span>
                </div>

                {[
                  {
                    testId: 'toggle-web-share-interop-btn',
                    titleAr: 'مشاركة الإيصالات والتقارير عبر النظام وواتساب (E1)',
                    titleEn: 'Web Share & WhatsApp Fallbacks (E1)',
                    titleCkb: 'هاوبەشکردنی پسوڵە و ڕاپۆرتەکان لە ڕێگەی سیستەم و واتساپەوە (E1)',
                    descAr:
                      'مشاركة المستندات المطبوعة عبر نافذة مشاركة الجهاز المحلية أو عبر واتساب (+964) ونسخ الملخص.',
                    descEn:
                      'Share printed receipts & reports via system share sheet, +964 WhatsApp fallback, or clipboard.',
                    descCkb:
                      'هاوبەشکردنی بەڵگەنامە چاپکراوەکان لە ڕێگەی پەنجەرەی هاوبەشکردنی ئامێر یان واتساپ (+964) و لەبەرگرتنەوەی پوختە.',
                    value: enableWebShareInterop,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setWebShareInteropEnabled(next);
                      setEnableWebShareInterop(next);
                    },
                  },
                  {
                    testId: 'toggle-ics-calendar-export-btn',
                    titleAr: 'تصدير المواعيد كملف تقويم (.ics) (E2)',
                    titleEn: 'Privacy-First .ics Calendar Export (E2)',
                    titleCkb: 'هەناردەکردنی چاوپێکەوتنەکان وەک فایلی ڕۆژژمێر (.ics) (E2)',
                    descAr:
                      'تصدير الموعد القادم أو جدول اليوم إلى ملف (.ics) محلياً مع اختيار حقول الخصوصية.',
                    descEn:
                      'Generate offline .ics files for single appointments or day schedules with explicit privacy controls.',
                    descCkb:
                      'دروستکردنی فایلی (.ics) بێ ئینتەرنێت بۆ چاوپێکەوتنی داهاتوو یان خشتەی ڕۆژ لەگەڵ هەڵبژاردنی خانەکانی نهێنیپارێزی.',
                    value: enableIcsCalendarExport,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setIcsCalendarExportEnabled(next);
                      setEnableIcsCalendarExport(next);
                    },
                  },
                  {
                    testId: 'toggle-schedule-visit-card-print-btn',
                    titleAr: 'طباعة جدول الغد وبطاقة مواعيد المريض (E3)',
                    titleEn: 'Tomorrow Schedule & Visit Card Printing (E3)',
                    titleCkb: 'چاپکردنی خشتەی سبەینێ و کارتی سەردانی نەخۆش (E3)',
                    descAr:
                      'طباعة جدول مواعيد اليوم/الغد وبطاقة مواعيد المريض مع الجلسات المتبقية بالكورس والرصيد.',
                    descEn:
                      'Print schedule run-sheets and patient visit cards showing remaining package sessions & balance.',
                    descCkb:
                      'چاپکردنی خشتەی چاوپێکەوتنەکانی ئەمڕۆ/سبەینێ و کارتی چاوپێکەوتنی نەخۆش لەگەڵ دانیشتنە ماوەکان و باڵانس.',
                    value: enableScheduleVisitCardPrint,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setScheduleVisitCardPrintEnabled(next);
                      setEnableScheduleVisitCardPrint(next);
                    },
                  },
                  {
                    testId: 'toggle-photo-measurement-tools-btn',
                    titleAr: 'أدوات قياس الزوايا والشاقول على الصور (E4)',
                    titleEn: 'Photo 3-Point Angle & Plumb-Line Tools (E4)',
                    titleCkb: 'ئامرازەکانی پێوانەی گۆشە و هێڵی شاقووڵی لەسەر وێنە (E4)',
                    descAr:
                      'خط الشاقول، خط الأفق، شبكة المعايرة، قياس الزوايا بـ 3 نقاط وحفظ نسخة مشفرة.',
                    descEn:
                      'Plumb line, horizontal level, grid overlay, 3-point angle measurement & encrypted copy.',
                    descCkb:
                      'هێڵی شاقووڵی، هێڵی ئاسۆیی، تۆڕی پێوانە، پێوانەی گۆشە بە 3 خاڵ و پاشەکەوتکردنی کۆپی کۆدکراو.',
                    value: enablePhotoMeasurementTools,
                    onToggle: (next: boolean) => {
                      ClinicOperationsService.setPhotoMeasurementToolsEnabled(next);
                      setEnablePhotoMeasurementTools(next);
                    },
                  },
                ].map((mod) => (
                  <div
                    key={mod.testId}
                    className="p-3 rounded-xl bg-layer/60 border border-layer-line flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground">
                        {bi(mod.titleAr, mod.titleEn, mod.titleCkb)}
                      </p>
                      <p className="text-xs text-muted-foreground-1">
                        {bi(mod.descAr, mod.descEn, mod.descCkb)}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={mod.testId}
                      onClick={() => mod.onToggle(!mod.value)}
                      className={`shrink-0 py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer ${
                        mod.value
                          ? 'bg-emerald-600 text-white'
                          : 'bg-surface border border-layer-line text-foreground'
                      }`}
                    >
                      {mod.value ? bi('مفعّلة', 'Enabled', 'چالاکە') : bi('معطّلة', 'Off', 'ناچالاکە')}
                    </button>
                  </div>
                ))}
              </div>

              {settingsViewMode === 'simple' && (
                <div
                  data-testid="settings-simple-mode-notice"
                  className="p-3 rounded-xl bg-muted/60 border border-line-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground-1"
                >
                  <span>
                    {bi(
                      'الوضع المبسط مفعّل حالياً — يتم إخفاء تبويبات الكادر والمطور المتقدمة لتقليل الازدحام.',
                      'Simple Mode active — advanced staff & developer controls are hidden for a cleaner view.',
                      'شێوازی سادە لە ئێستادا چالاکە — بەشە پێشکەوتووەکانی ستاف و گەشەپێدەر شاردراونەتەوە بۆ کەمکردنەوەی قەرەباڵغی.'
                    )}
                  </span>
                  <button
                    type="button"
                    data-testid="settings-switch-to-advanced-inline-btn"
                    onClick={() => handleSwitchSettingsMode('advanced')}
                    className="px-2.5 py-1 rounded-lg bg-layer border border-layer-line text-foreground font-bold cursor-pointer hover:bg-layer-hover"
                  >
                    {bi('عرض الوضع المتقدم', 'Switch to Advanced', 'گۆڕین بۆ شێوازی پێشکەوتوو')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DEVELOPER & DEMO DATA */}
          {activeTab === 'developer' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Database className="size-4 text-primary" />
                    <span>
                      {bi(
                        'بيانات العرض والتجربة السريرية (Demo Data)',
                        'Clinical Demonstration Data (Demo)',
                        'داتای پیشاندان و تاقیکردنەوەی کلینیکی (Demo Data)'
                      )}
                    </span>
                  </div>
                  <DemoBadge />
                </div>

                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    'يمكنك تحميل حالات سريرية تجريبية مميزة بشارة DEMO لاختبار النظام، وحذفها بالكامل بنقرة واحدة في أي وقت.',
                    'Load synthetic clinical cases badged with DEMO to explore the platform, and delete all demo records in one click at any time.',
                    'دەتوانیت حاڵەتە کلینیکییە تاقیکارییەکان بە نیشانەی DEMO باربکەیت بۆ تاقیکردنەوەی سیستەم، و هەر کاتێک بتەوێت بە یەک کلیک هەموویان بسڕیتەوە.'
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDemoModal();
                    }}
                    className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="size-3.5" />
                    <span>
                      {bi(
                        'فتح نافذة تحميل البيانات التجريبية',
                        'Load Demo Cases',
                        'کردنەوەی پەنجەرەی بارکردنی داتای تاقیکاری'
                      )}
                    </span>
                  </button>

                  {hasDemoRecords && !confirmDeleteDemo && (
                    <button
                      type="button"
                      disabled={deletingDemo}
                      onClick={() => setConfirmDeleteDemo(true)}
                      className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-layer-line disabled:cursor-not-allowed"
                    >
                      <Trash2 className="size-3.5" />
                      <span>
                        {bi(
                          'حذف كافة البيانات التجريبية',
                          'Delete all demo data',
                          'سڕینەوەی هەموو داتای تاقیکاری'
                        )}
                      </span>
                    </button>
                  )}
                  {hasDemoRecords && confirmDeleteDemo && (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        disabled={deletingDemo}
                        onClick={async () => {
                          await handleDeleteAllDemo();
                          setConfirmDeleteDemo(false);
                        }}
                        className="py-2 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                        <span>
                          {deletingDemo
                            ? bi('جاري الحذف...', 'Deleting...', 'دەسڕێتەوە...')
                            : bi('تأكيد حذف البيانات التجريبية', 'Confirm Delete Demo Data', 'دڵنیاکردنەوەی سڕینەوەی داتای تاقیکاری')}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteDemo(false)}
                        className="py-2 px-3 rounded-xl bg-layer border border-layer-line text-foreground text-xs font-semibold cursor-pointer"
                      >
                        {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                      </button>
                    </div>
                  )}
                </div>

                {demoDeletedMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>
                      {bi(
                        'تم مسح جميع السجلات التجريبية من قاعدة البيانات بنجاح.',
                        'All demo records have been removed from the database.',
                        'هەموو تۆمارە تاقیکارییەکان بە سەرکەوتوویی لە داتابەیس سڕانەوە.'
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Multi-Platform Runtime Identity & Manual Desktop Update Check */}
              <div
                data-testid="settings-platform-runtime-card"
                className="p-4 rounded-xl bg-surface border border-line-2 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                    <TabletSmartphone className="size-4 text-primary" />
                    <span>
                      {bi(
                        'بيئة التشغيل وهوية التطبيق (Web / Android / Windows)',
                        'Platform Runtime & App Identity (Web / Android / Windows)',
                        'ژینگەی کارپێکردن و ناسنامەی بەرنامە'
                      )}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 font-mono text-xs font-bold">
                    org.physiorecord.app • v{APP_SEMVER_VERSION}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground-1 leading-relaxed">
                  {bi(
                    `بيئة التشغيل الحالية: ${
                      getAppRuntimeTarget() === 'desktop'
                        ? 'تطبيق سطح المكتب (Windows Electron)'
                        : getAppRuntimeTarget() === 'android'
                          ? 'تطبيق أندرويد (Capacitor APK)'
                          : 'تطبيق الويب التقدمي (Web / PWA)'
                    }. واجهة المستخدم معزولة تماماً عن الشبكة (connect-src 'none').`,
                    `Active runtime target: ${
                      getAppRuntimeTarget() === 'desktop'
                        ? 'Windows Desktop (Electron)'
                        : getAppRuntimeTarget() === 'android'
                          ? 'Android Native (Capacitor APK)'
                          : 'Web / PWA Browser'
                    }. The UI renderer enforces strict zero-network isolation (connect-src 'none').`,
                    'ڕووکاری بەکارهێنەر بە تەواوی لە تۆڕ دابڕاوە.'
                  )}
                </p>

                {isElectronDesktop() && (
                  <div className="pt-1 space-y-2">
                    <button
                      type="button"
                      data-testid="desktop-check-updates-btn"
                      disabled={checkingDesktopUpdate}
                      onClick={async () => {
                        const bridge = getElectronDesktopBridge();
                        if (!bridge?.checkForUpdates) return;
                        setCheckingDesktopUpdate(true);
                        try {
                          const res = await bridge.checkForUpdates();
                          setDesktopUpdateStatus(res);
                        } finally {
                          setCheckingDesktopUpdate(false);
                        }
                      }}
                      className="py-2 px-4 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`size-3.5 ${checkingDesktopUpdate ? 'animate-spin' : ''}`} />
                      <span>
                        {checkingDesktopUpdate
                          ? bi('جاري التحقق من الإصدارات...', 'Checking GitHub Releases...', 'پشکنینی وەشانەکان...')
                          : bi(
                              'التحقق اليدوي من التحديثات (Electron Main Process)',
                              'Check for Updates Manually (Main Process Opt-In)',
                              'پشکنینی دەستی بۆ نوێکردنەوەکان'
                            )}
                      </span>
                    </button>

                    {desktopUpdateStatus && (
                      <div
                        data-testid="desktop-update-status-banner"
                        className={`p-3 rounded-xl border text-xs font-semibold flex flex-wrap items-center justify-between gap-2 ${
                          desktopUpdateStatus.status === 'update-available'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200'
                            : desktopUpdateStatus.status === 'up-to-date'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        <span>
                          {bi(desktopUpdateStatus.messageAr, desktopUpdateStatus.messageEn)}
                        </span>
                        {desktopUpdateStatus.status === 'update-available' &&
                          desktopUpdateStatus.releaseUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                void getElectronDesktopBridge()?.openExternalUrl?.({
                                  url: desktopUpdateStatus.releaseUrl!,
                                });
                              }}
                              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                            >
                              {bi('فتح صفحة التحميل', 'Open Release Page', 'کردنەوەی پەڕەی داگرتن')}
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-muted/40 border-t border-card-divider flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            data-testid="settings-modal-close-footer-btn"
            className="px-4 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground hover:bg-layer-hover cursor-pointer"
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

