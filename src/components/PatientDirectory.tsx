// =======================================================================
// PhysioRecord — Attio/Linear-Style Smart Patient Roster & Underline Lenses
// Features calm 2-line scannable rows, hover-reveal actions, underline
// clinical/financial tabs, overflow utilities, and 1-click chart access.
// =======================================================================

import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import { usePatients } from '../context/PatientContext';
import { useVault } from '../context/VaultContext';
import { useLanguage } from '../context/LanguageContext';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import { EpisodeService } from '../services/episodeService';
import type { EpisodeRecord, PatientRecord } from '../types/clinical';
import { computePatientAge, formatDateDDMMYYYY, formatIraqiPhoneDisplay } from '../utils/date';
import {
  getPatientMrn,
  isDemoPatient,
  hasPatientRedFlagsOrContraindications,
  getPatientDisplayName,
} from '../utils/mrn';
import { localizeDemoText } from '../utils/demoLocalization';
import { findAllDirectoryDuplicatePairs } from '../utils/dataQualityPhaseD';
import {
  computeTherapistCaseloadSummary,
  getPatientCompletionMeta,
  type PatientCompletionMeta,
} from '../utils/treatmentJourneySummary';
import { Num, DemoBadge, Money } from './ui/Primitives';
import { ClampedMenuPanel } from './ui/Primitives';
import { useViewportClampedMenu } from '../utils/menuViewportClamp';
import { PatientSearchEngine } from '../utils/arabicSearch';
import { useVirtualWindow } from '../hooks/useVirtualWindow';
import {
  Search,
  UserPlus,
  FileSpreadsheet,
  AlertCircle,
  Award,
  Star,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Archive,
  RotateCcw,
  GitMerge,
  X,
  Eye,
  Wallet,
  MoreHorizontal,
  FolderOpen,
  Users,
} from 'lucide-react';

const PatientMergeModal = lazy(() => import('./clinic/PatientMergeModal'));
const CsvOnboardingModal = lazy(() =>
  import('./clinic/CsvOnboardingModal').then((m) => ({ default: m.CsvOnboardingModal }))
);
const PatientQuickViewModal = lazy(() =>
  import('./PatientQuickViewModal').then((m) => ({ default: m.PatientQuickViewModal }))
);

type DirectoryLens = 'all' | 'completed' | 'debt' | 'red_flags' | 'pinned' | 'archived';

interface PatientMetrics {
  debtIQD: number;
  activePkg: { used: number; total: number } | null;
}

interface PatientDirectoryProps {
  onSelectPatient: (patient: PatientRecord) => void;
  onOpenNewPatientModal: () => void;
  onOpenSyntheticModal: () => void;
}

export const PatientDirectory: React.FC<PatientDirectoryProps> = ({
  onSelectPatient,
  onOpenNewPatientModal,
  onOpenSyntheticModal,
}) => {
  const {
    patients,
    activePatients,
    archivedPatients,
    loading,
    archivePatient,
    unarchivePatient,
  } = usePatients();
  const { dek } = useVault();
  const { bi, isRtl, language } = useLanguage();

  const [activeLens, setActiveLens] = useState<DirectoryLens>('all');
  const activeTab: 'active' | 'archived' = activeLens === 'archived' ? 'archived' : 'active';
  const [allEpisodes, setAllEpisodes] = useState<EpisodeRecord[]>([]);
  const [episodesRefreshNonce, setEpisodesRefreshNonce] = useState(0);
  const [selectedTherapistFilter, setSelectedTherapistFilter] = useState<string>('all');

  const [undoArchivedPatient, setUndoArchivedPatient] = useState<{ id: string; name: string } | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female'>('all');
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [showHeaderMoreMenu, setShowHeaderMoreMenu] = useState(false);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [importWizardEnabled, setImportWizardEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isImportWizardEnabled()
  );
  const [quickViewEntry, setQuickViewEntry] = useState<{
    patient: PatientRecord;
    index: number;
  } | null>(null);
  const [opsVersion, setOpsVersion] = useState(0);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() =>
    ClinicOperationsService.getPinnedPatientIds()
  );
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    ClinicOperationsService.getRecentPatientIds()
  );

  const [isSmUp, setIsSmUp] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 640px)').matches : true
  );

  const headerMoreBtnRef = useRef<HTMLButtonElement | null>(null);
  const headerMoreMenuRef = useRef<HTMLDivElement | null>(null);
  useViewportClampedMenu(showHeaderMoreMenu, headerMoreMenuRef);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = () => setIsSmUp(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const syncMem = () => {
      setPinnedIds(ClinicOperationsService.getPinnedPatientIds());
      setRecentIds(ClinicOperationsService.getRecentPatientIds());
      setImportWizardEnabled(ClinicOperationsService.isImportWizardEnabled());
      setOpsVersion((v) => v + 1);
    };
    const onEpisodesUpdated = () => setEpisodesRefreshNonce((n) => n + 1);
    const unsub = ClinicOperationsService.subscribe(syncMem);
    window.addEventListener('physiorecord-modules-updated', syncMem);
    window.addEventListener('physiorecord-episodes-updated', onEpisodesUpdated);
    return () => {
      unsub();
      window.removeEventListener('physiorecord-modules-updated', syncMem);
      window.removeEventListener('physiorecord-episodes-updated', onEpisodesUpdated);
    };
  }, []);

  useEffect(() => {
    if (!dek) {
      setAllEpisodes([]);
      return;
    }
    let alive = true;
    void EpisodeService.getAllEpisodes(dek)
      .then((eps) => {
        if (alive) setAllEpisodes(eps);
      })
      .catch(() => {
        if (alive) setAllEpisodes([]);
      });
    return () => {
      alive = false;
    };
  }, [dek, patients.length, episodesRefreshNonce]);

  // Close header or row popovers on outside click / Escape
  useEffect(() => {
    if (!showHeaderMoreMenu && !openRowMenuId) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        showHeaderMoreMenu &&
        !headerMoreMenuRef.current?.contains(target) &&
        !headerMoreBtnRef.current?.contains(target)
      ) {
        setShowHeaderMoreMenu(false);
      }
      if (openRowMenuId && !target?.closest('[data-row-menu-root="true"]')) {
        setOpenRowMenuId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowHeaderMoreMenu(false);
        setOpenRowMenuId(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showHeaderMoreMenu, openRowMenuId]);

  // Reconcile invoices synchronously into per-patient financial/package metrics
  const patientMetricsMap = useMemo(() => {
    void opsVersion;
    const map = new Map<string, PatientMetrics>();
    const invoices = ClinicOperationsService.getInvoicesIQD();
    for (const inv of invoices) {
      if (inv.status === 'void' || !inv.patientId) continue;
      const existing = map.get(inv.patientId) ?? { debtIQD: 0, activePkg: null };
      existing.debtIQD += inv.balanceDueIQD || 0;
      if (
        inv.invoiceType === 'rehab_package' &&
        typeof inv.packageTotalSessions === 'number' &&
        inv.packageTotalSessions > 0 &&
        !existing.activePkg
      ) {
        existing.activePkg = {
          used: inv.packageUsedSessions ?? 0,
          total: inv.packageTotalSessions,
        };
      }
      map.set(inv.patientId, existing);
    }
    return map;
  }, [opsVersion]);

  const duplicatePairCount = useMemo(
    () => findAllDirectoryDuplicatePairs(patients).length,
    [patients]
  );

  const pinnedPatients = useMemo(
    () =>
      pinnedIds
        .map((id) => activePatients.find((p) => p.id === id))
        .filter((p): p is PatientRecord => Boolean(p)),
    [pinnedIds, activePatients]
  );

  const redFlagCount = useMemo(
    () =>
      activePatients.filter((p) =>
        hasPatientRedFlagsOrContraindications(p.data)
      ).length,
    [activePatients]
  );

  const debtPatientsCount = useMemo(
    () =>
      activePatients.filter(
        (p) => (patientMetricsMap.get(p.id)?.debtIQD ?? 0) > 0
      ).length,
    [activePatients, patientMetricsMap]
  );

  const staffRoster = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.getStaffRoster();
  }, [opsVersion]);

  const isSoloMode = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.isSoloMode();
  }, [opsVersion]);

  const completionMetaByPatient = useMemo(() => {
    const epsByPatient = new Map<string, EpisodeRecord[]>();
    for (const ep of allEpisodes) {
      const arr = epsByPatient.get(ep.patientId) || [];
      arr.push(ep);
      epsByPatient.set(ep.patientId, arr);
    }
    const map = new Map<string, PatientCompletionMeta>();
    for (const p of patients) {
      map.set(p.id, getPatientCompletionMeta(p, epsByPatient.get(p.id) || []));
    }
    return map;
  }, [patients, allEpisodes]);

  const therapistCaseload = useMemo(
    () =>
      computeTherapistCaseloadSummary({
        patients,
        episodes: allEpisodes,
        staffRoster,
      }),
    [patients, allEpisodes, staffRoster]
  );

  const showTeamOversight = !isSoloMode || staffRoster.length > 1;

  const ongoingActivePatients = useMemo(
    () => activePatients.filter((p) => !completionMetaByPatient.get(p.id)?.isCompleted),
    [activePatients, completionMetaByPatient]
  );

  const completedPatients = useMemo(
    () => activePatients.filter((p) => Boolean(completionMetaByPatient.get(p.id)?.isCompleted)),
    [activePatients, completionMetaByPatient]
  );

  const displayedList = activeTab === 'active' ? activePatients : archivedPatients;
  const [searchIndexActivated, setSearchIndexActivated] = useState(false);

  const searchEngine = useMemo(() => {
    if (!searchIndexActivated) return null;
    return new PatientSearchEngine(displayedList, (p, idx) => getPatientMrn(p, idx));
  }, [displayedList, searchIndexActivated]);

  // In-memory zero-PII Arabic-aware MiniSearch + lens filters + pinned-first ordering
  const filteredPatients = useMemo(() => {
    const trimmedQuery = searchQuery.trim();
    const baseMatches =
      trimmedQuery && searchEngine
        ? searchEngine.search(searchQuery)
        : trimmedQuery
        ? new PatientSearchEngine(displayedList, (p, idx) => getPatientMrn(p, idx)).search(
            searchQuery
          )
        : displayedList;

    const filtered = baseMatches.filter((patient) => {
      const p = patient.data;
      const meta = completionMetaByPatient.get(patient.id);
      if (filterGender !== 'all' && p.gender !== filterGender) return false;

      if (selectedTherapistFilter !== 'all') {
        if (selectedTherapistFilter === '__unassigned__') {
          if (meta?.assignedStaffId) return false;
        } else if (meta?.assignedStaffId !== selectedTherapistFilter) {
          return false;
        }
      }

      if (activeLens === 'completed') return Boolean(meta?.isCompleted);
      // In 'all' lens without active search query, show ongoing patients so discharged patients live cleanly in «أنهوا العلاج»
      if (activeLens === 'all' && !trimmedQuery) return !meta?.isCompleted;
      if (activeLens === 'pinned') return pinnedIds.includes(patient.id);
      if (activeLens === 'debt') return (patientMetricsMap.get(patient.id)?.debtIQD ?? 0) > 0;
      if (activeLens === 'red_flags') return hasPatientRedFlagsOrContraindications(p);
      return true;
    });

    if (activeLens === 'all' && !trimmedQuery) {
      const pinnedRank = new Map<string, number>();
      pinnedIds.forEach((id, i) => pinnedRank.set(id, i));
      const recentRank = new Map<string, number>();
      recentIds.forEach((id, i) => recentRank.set(id, i));

      return [...filtered].sort((a, b) => {
        const aPin = pinnedRank.get(a.id);
        const bPin = pinnedRank.get(b.id);
        if (aPin !== undefined && bPin !== undefined) return aPin - bPin;
        if (aPin !== undefined) return -1;
        if (bPin !== undefined) return 1;

        const aRec = recentRank.get(a.id);
        const bRec = recentRank.get(b.id);
        if (aRec !== undefined && bRec !== undefined) return aRec - bRec;
        if (aRec !== undefined) return -1;
        if (bRec !== undefined) return 1;
        return 0;
      });
    }

    return filtered;
  }, [
    searchEngine,
    displayedList,
    searchQuery,
    filterGender,
    selectedTherapistFilter,
    activeLens,
    pinnedIds,
    recentIds,
    patientMetricsMap,
    completionMetaByPatient,
  ]);

  const patientVirtualWindow = useVirtualWindow({
    totalCount: filteredPatients.length,
    estimatedRowHeightPx: 74,
    columns: 1,
    overscanRows: 5,
  });

  const visiblePatientsSlice = useMemo(
    () =>
      filteredPatients.slice(
        patientVirtualWindow.startIndex,
        patientVirtualWindow.endIndex
      ),
    [filteredPatients, patientVirtualWindow.startIndex, patientVirtualWindow.endIndex]
  );

  const ChevronIcon = isRtl ? ChevronLeft : ChevronRight;
  const hasSearchQuery = searchQuery.trim().length > 0;

  const lenses: Array<{
    id: DirectoryLens;
    ar: string;
    en: string;
    ckb: string;
    count: number;
    alwaysShowCount?: boolean;
    icon?: React.ReactNode;
  }> = [
    {
      id: 'all',
      ar: 'النشطون',
      en: 'Active',
      ckb: 'چالاکەکان',
      count: ongoingActivePatients.length,
      alwaysShowCount: true,
    },
    {
      id: 'completed',
      ar: 'أنهوا العلاج',
      en: 'Completed',
      ckb: 'تەواوبووان',
      count: completedPatients.length,
      alwaysShowCount: true,
      icon: <Award className="size-3.5 shrink-0" />,
    },
    {
      id: 'debt',
      ar: 'ذمم مالية',
      en: 'Balance Due',
      ckb: 'قەرز',
      count: debtPatientsCount,
      icon: <Wallet className="size-3.5 shrink-0" />,
    },
    {
      id: 'red_flags',
      ar: 'علامات خطر',
      en: 'Red Flags',
      ckb: 'ئاڵای سوور',
      count: redFlagCount,
      icon: <AlertCircle className="size-3.5 shrink-0" />,
    },
    {
      id: 'pinned',
      ar: 'مثبّتون',
      en: 'Pinned',
      ckb: 'جێگیرکراو',
      count: pinnedPatients.length,
      icon: <Star className="size-3.5 shrink-0" />,
    },
    {
      id: 'archived',
      ar: 'الأرشيف',
      en: 'Archived',
      ckb: 'ئەرشیف',
      count: archivedPatients.length,
    },
  ];

  return (
    <div
      className="max-w-[85rem] w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-5 space-y-3.5 pb-8"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Minimalist 1-Line Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="pr-page-title truncate">
            {bi('سجل المرضى', 'Patient Directory', 'تۆماری نەخۆشەکان')}
          </h1>
          <span className="text-sm font-bold text-muted-foreground-1 tabular-nums shrink-0">
            (<Num value={activePatients.length} />)
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-tour="directory-new-patient-btn"
            onClick={onOpenNewPatientModal}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-1.5 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <UserPlus className="size-4 shrink-0" />
            <span>{bi('+ مريض جديد', '+ New Patient', '+ نەخۆشی نوێ')}</span>
          </button>

          {/* Single Quiet Overflow Utilities Menu */}
          <div className="relative shrink-0">
            <button
              ref={headerMoreBtnRef}
              type="button"
              data-testid="directory-more-menu-btn"
              aria-haspopup="menu"
              aria-expanded={showHeaderMoreMenu}
              onClick={() => setShowHeaderMoreMenu((prev) => !prev)}
              aria-label={bi('خيارات الدليل', 'Directory options', 'هەڵبژاردنی زیاتر')}
              className="size-11 sm:size-9 rounded-full bg-card/90 hover:bg-card shadow-2xs text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center relative cursor-pointer transition-colors"
            >
              <MoreHorizontal className="size-4" />
              {(duplicatePairCount > 0 || filterGender !== 'all') && (
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-orange-500 absolute top-2 end-2"
                />
              )}
            </button>

            {showHeaderMoreMenu && (
              <div
                ref={headerMoreMenuRef}
                role="menu"
                className="absolute top-full mt-2 end-0 w-60 z-40 rounded-2xl bg-card shadow-2xl border border-black/[0.06] dark:border-white/[0.08] p-2 space-y-1.5 text-xs"
              >
                <div className="px-2 pt-1 pb-0.5 text-xs font-bold text-muted-foreground-1">
                  {bi('تصفية حسب الفئة', 'Filter by gender', 'پاڵاوتن بەپێی ڕەگەز')}
                </div>
                <div className="grid grid-cols-3 gap-1 bg-surface/80 p-1 rounded-xl">
                  {(
                    [
                      { id: 'all', label: bi('الكل', 'All', 'هەموو') },
                      { id: 'male', label: bi('ذكور', 'Male', 'نێر') },
                      { id: 'female', label: bi('إناث', 'Female', 'مێ') },
                    ] as const
                  ).map((g) => {
                    const active = filterGender === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setFilterGender(g.id)}
                        className={`min-h-[36px] rounded-lg font-bold cursor-pointer transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground shadow-2xs'
                            : 'text-muted-foreground-1 hover:text-foreground'
                        }`}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-black/[0.05] dark:border-white/[0.06] pt-1 space-y-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="open-patient-merge-modal-btn"
                    onClick={() => {
                      setShowHeaderMoreMenu(false);
                      setIsMergeModalOpen(true);
                    }}
                    className="w-full min-h-[44px] sm:min-h-[36px] px-2.5 py-2 rounded-xl hover:bg-surface text-foreground font-semibold flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <GitMerge className="size-4 text-orange-600 dark:text-orange-400 shrink-0" />
                      <span>{bi('دمج المكررين', 'Merge Duplicates', 'تێکەڵکردنی دووبارەکان')}</span>
                    </span>
                    {duplicatePairCount > 0 && (
                      <span className="font-mono font-extrabold text-orange-600 dark:text-orange-400 tabular-nums">
                        <Num value={duplicatePairCount} />
                      </span>
                    )}
                  </button>

                  {importWizardEnabled && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowHeaderMoreMenu(false);
                        setIsCsvImportOpen(true);
                      }}
                      className="w-full min-h-[44px] sm:min-h-[36px] px-2.5 py-2 rounded-xl hover:bg-surface text-foreground font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="size-4 text-primary shrink-0" />
                      <span>{bi('استيراد مرضى (CSV / XLSX)', 'Import CSV / XLSX', 'هاوردەکردن')}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Undo Archive Toast Banner */}
      {undoArchivedPatient && (
        <div
          role="status"
          className="pr-surface flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-2xl text-xs text-foreground"
        >
          <span>
            {bi('تمت أرشفة ملف المريض:', 'Patient archived:', 'دۆسیە ئەرشیفکرا:')}{' '}
            <strong className="font-bold">{undoArchivedPatient.name}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                unarchivePatient(undoArchivedPatient.id);
                setUndoArchivedPatient(null);
              }}
              className="px-3 py-1.5 min-h-[44px] sm:min-h-[34px] rounded-xl bg-primary/12 hover:bg-primary/20 text-primary font-extrabold cursor-pointer transition-colors"
            >
              {bi('تراجع', 'Undo', 'گەڕانەوە')}
            </button>
            <button
              type="button"
              onClick={() => setUndoArchivedPatient(null)}
              aria-label={bi('إغلاق الإشعار', 'Dismiss notification')}
              className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] inline-flex items-center justify-center rounded-xl text-muted-foreground-1 hover:text-foreground cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Full-Width Search + Optional Gender Chip */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="pr-surface rounded-2xl flex items-center px-3.5 h-11 sm:h-10 gap-2 flex-1 min-w-[200px] pr-pill-input-wrap">
            <Search className="size-4 text-muted-foreground-1 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setSearchIndexActivated(true)}
              onChange={(e) => {
                setSearchIndexActivated(true);
                setSearchQuery(e.target.value);
              }}
              aria-label={bi('بحث في سجل المرضى', 'Search patient directory', 'گەڕان لە تۆماری نەخۆشەکاندا')}
              placeholder={bi(
                'بحث بالاسم، الهاتف، MRN، أو التشخيص...',
                'Search name, phone, MRN, or diagnosis...',
                'گەڕان بەپێی ناو، مۆبایل، MRN، یان دەستنیشانکردن...'
              )}
              className="pr-input-bare w-full min-h-[40px] sm:min-h-[36px] text-xs sm:text-sm text-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-surface hover:bg-layer-hover text-xs font-semibold text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <X className="size-3" />
                <span>{bi('مسح', 'Clear', 'سڕینەوە')}</span>
              </button>
            )}
          </div>

          {filterGender !== 'all' && (
            <button
              type="button"
              onClick={() => setFilterGender('all')}
              className="min-h-[44px] sm:min-h-[40px] px-3 py-1 rounded-2xl bg-card/90 shadow-2xs text-xs font-bold text-primary inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <span>
                {bi('الفئة:', 'Gender:', 'ڕەگەز:')}{' '}
                {filterGender === 'male' ? bi('ذكور', 'Male', 'نێر') : bi('إناث', 'Female', 'مێ')}
              </span>
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Clinic Manager Multi-Therapist Oversight Strip (Team Mode / Multi-Staff) */}
        {showTeamOversight && therapistCaseload.rows.length > 0 && (
          <div
            data-testid="manager-therapist-oversight-strip"
            className="flex items-center gap-2 overflow-x-auto pr-hide-scrollbar py-0.5"
          >
            <button
              type="button"
              onClick={() => setSelectedTherapistFilter('all')}
              className={`h-8 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                selectedTherapistFilter === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-card-line text-foreground hover:bg-surface'
              }`}
            >
              <Users className="size-3.5 shrink-0" />
              <span>{bi('كل المعالجين', 'All Therapists', 'هەموو چارەسەرکاران')}</span>
              <span className="font-mono opacity-80">
                (<Num value={therapistCaseload.totalActive + therapistCaseload.totalCompleted} />)
              </span>
            </button>
            {therapistCaseload.rows.map((row) => {
              const active = selectedTherapistFilter === row.staffId;
              return (
                <button
                  key={row.staffId}
                  type="button"
                  data-testid={`therapist-filter-chip-${row.staffId}`}
                  onClick={() =>
                    setSelectedTherapistFilter(active ? 'all' : row.staffId)
                  }
                  className={`h-8 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-2 shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card border border-card-line text-foreground hover:bg-surface'
                  }`}
                >
                  <span className="truncate max-w-[140px]">
                    {language === 'en' ? row.nameEn : row.nameAr}
                  </span>
                  <span className="font-mono text-xs opacity-80">
                    {row.activePatients}
                    {row.completedPatients > 0 ? ` · ✓${row.completedPatients}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Minimalist Underline Filter Tabs (Zero Pill Soup) */}
        <div
          role="tablist"
          aria-label={bi('عدسات تصفية المرضى', 'Patient roster lenses')}
          className="flex items-center gap-4 sm:gap-5 border-b border-black/[0.06] dark:border-white/[0.08] overflow-x-auto pr-hide-scrollbar px-1"
        >
          {lenses.map((lens) => {
            const active = activeLens === lens.id;
            const inactiveColor =
              lens.id === 'completed'
                ? 'text-emerald-700 dark:text-emerald-400'
                : lens.id === 'debt'
                  ? 'text-orange-600 dark:text-orange-400'
                  : lens.id === 'red_flags'
                    ? 'text-rose-700 dark:text-rose-400'
                    : lens.id === 'pinned'
                      ? 'text-amber-500'
                      : '';

            return (
              <button
                key={lens.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`directory-lens-${lens.id}`}
                data-active={active}
                onClick={() => setActiveLens(lens.id)}
                className={`min-h-[44px] sm:min-h-[38px] inline-flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0 cursor-pointer border-b-2 -mb-px pb-2.5 pt-1.5 transition-colors ${
                  active
                    ? 'text-primary font-extrabold border-primary'
                    : 'text-muted-foreground-1 hover:text-foreground font-semibold border-transparent'
                }`}
              >
                {lens.icon && (
                  <span className={active ? 'text-primary' : inactiveColor || 'text-muted-foreground-1'}>
                    {lens.icon}
                  </span>
                )}
                <span>{bi(lens.ar, lens.en, lens.ckb)}</span>
                {(lens.alwaysShowCount || lens.count > 0) && (
                  <span
                    className={`text-xs font-extrabold tabular-nums ${
                      active ? 'text-primary' : 'text-muted-foreground-2'
                    }`}
                  >
                    (<Num value={lens.count} />)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Unified Calm 2-Line Roster */}
      {loading ? (
        <div className="pr-surface rounded-[20px] p-12 text-center text-muted-foreground-1">
          <p className="text-sm font-medium">
            {bi(
              'جاري فك تشفير وتحميل السجلات السريرية المعتمدة...',
              'Decrypting and loading verified clinical records...',
              'کۆدشکاندن و بارکردنی تۆمارە کلینیکییەکان...'
            )}
          </p>
        </div>
      ) : filteredPatients.length > 0 ? (
        <div className="pr-surface rounded-[20px]">
          <div
            ref={patientVirtualWindow.containerRef}
            onScroll={patientVirtualWindow.onScroll}
            data-testid="patient-directory-list"
            tabIndex={patientVirtualWindow.isVirtualized ? 0 : undefined}
            aria-label={bi('قائمة المرضى', 'Patient list')}
            className={
              patientVirtualWindow.isVirtualized
                ? 'overflow-y-auto max-h-[72vh] divide-y divide-black/[0.045] dark:divide-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                : 'divide-y divide-black/[0.045] dark:divide-white/[0.06]'
            }
          >
            {patientVirtualWindow.topSpacerPx > 0 && (
              <div
                style={{ height: patientVirtualWindow.topSpacerPx }}
                aria-hidden="true"
              />
            )}

            {visiblePatientsSlice.map((patient, localIdx) => {
              const idx = patientVirtualWindow.startIndex + localIdx;
              const p = patient.data;
              const hasRedFlags = hasPatientRedFlagsOrContraindications(p);
              const mrn = getPatientMrn(patient, idx);
              const demo = isDemoPatient(patient);
              const isImported = Boolean(p.isImported || p.tags?.includes('imported'));
              const primaryName = getPatientDisplayName(p, language);
              const age = computePatientAge(p.dateOfBirth, p.age);
              const phone = p.phoneNumber || p.phone;
              const isPinned = pinnedIds.includes(patient.id);
              const metrics = patientMetricsMap.get(patient.id);
              const rowMenuOpen = openRowMenuId === patient.id;

              return (
                <div
                  key={patient.id}
                  data-testid={`patient-row-${patient.id}`}
                  className="px-3.5 sm:px-4 py-3 flex items-center justify-between gap-2.5 sm:gap-3 hover:bg-primary/[0.03] transition-colors group relative first:rounded-t-[20px] last:rounded-b-[20px]"
                >
                  {/* 1-Click Chart Row Button (Space opens Quick Peek) */}
                  <button
                    type="button"
                    onClick={() => onSelectPatient(patient)}
                    onKeyDown={(e) => {
                      if (e.key === ' ') {
                        e.preventDefault();
                        setQuickViewEntry({ patient, index: idx });
                      }
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 text-start bg-transparent border-0 p-0 cursor-pointer min-h-[44px]"
                  >
                    <div className="size-10 rounded-full bg-primary/10 text-primary font-extrabold text-sm flex items-center justify-center shrink-0 relative">
                      <span>{(primaryName || 'م').charAt(0)}</span>
                      {isPinned && (
                        <Star
                          aria-hidden="true"
                          className="size-3.5 fill-amber-500 text-amber-500 absolute -top-0.5 -end-0.5"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      {/* Line 1: Primary Name + Clean Subtle Metadata */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                        <span className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors truncate">
                          {primaryName}
                        </span>
                        {demo && <DemoBadge />}
                        {isImported && (
                          <span
                            data-testid="patient-imported-badge"
                            className="text-xs font-semibold text-sky-700 dark:text-sky-300 shrink-0"
                          >
                            · {bi('مستورد', 'Imported', 'هاوردەکراو')}
                          </span>
                        )}
                        {age !== undefined && (
                          <span className="text-xs font-medium text-muted-foreground-1 tabular-nums">
                            {age} {bi('سنة', 'y', 'ساڵ')}
                          </span>
                        )}
                        {phone && (
                          <span className="hidden sm:inline text-xs font-mono text-muted-foreground-1 tabular-nums">
                            · <bdi dir="ltr">{formatIraqiPhoneDisplay(phone)}</bdi>
                          </span>
                        )}
                        {hasSearchQuery && (
                          <bdi
                            dir="ltr"
                            className="text-xs font-mono font-semibold text-muted-foreground-2 tabular-nums"
                          >
                            {mrn}
                          </bdi>
                        )}
                      </div>

                      {/* Line 2: 1-Line Clinical Snippet + Strict Red Alert / Orange Money */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs min-w-0">
                        {phone && (
                          <span className="sm:hidden font-mono text-muted-foreground-1 tabular-nums shrink-0">
                            <bdi dir="ltr">{formatIraqiPhoneDisplay(phone)}</bdi>
                          </span>
                        )}
                        <span className="text-muted-foreground-1 truncate max-w-[200px] sm:max-w-md">
                          {completionMetaByPatient.get(patient.id)?.isCompleted &&
                          completionMetaByPatient.get(patient.id)?.dischargeSummary
                            ? localizeDemoText(
                                completionMetaByPatient.get(patient.id)!.dischargeSummary,
                                language
                              )
                            : localizeDemoText(p.medicalHistory, language) ||
                              localizeDemoText(p.occupation, language) ||
                              bi('ملف سريري نشط', 'Active clinical chart', 'دۆسیەی چالاک')}
                        </span>

                        {completionMetaByPatient.get(patient.id)?.isCompleted && (
                          <span
                            data-testid={`patient-completed-badge-${patient.id}`}
                            className="text-emerald-700 dark:text-emerald-400 font-extrabold inline-flex items-center gap-1 shrink-0"
                          >
                            <Award className="size-3.5 shrink-0" />
                            <span>
                              {bi('أنهى العلاج', 'Completed', 'چارەسەر تەواوبوو')}
                              {completionMetaByPatient.get(patient.id)?.dischargeDate
                                ? ` · ${formatDateDDMMYYYY(
                                    completionMetaByPatient.get(patient.id)!.dischargeDate!
                                  )}`
                                : ''}
                            </span>
                          </span>
                        )}

                        {showTeamOversight &&
                          completionMetaByPatient.get(patient.id)?.assignedTherapistName && (
                            <span className="text-primary font-bold inline-flex items-center gap-1 shrink-0">
                              <Users className="size-3 shrink-0" />
                              <span>
                                {completionMetaByPatient.get(patient.id)!.assignedTherapistName}
                              </span>
                            </span>
                          )}

                        {hasRedFlags && (
                          <span
                            title={localizeDemoText(
                              p.redFlags || p.contraindications || p.precautions,
                              language
                            )}
                            className="text-rose-700 dark:text-rose-400 font-bold inline-flex items-center gap-1 shrink-0"
                          >
                            <AlertCircle className="size-3.5 shrink-0" />
                            <span>{bi('تحذير سريري', 'Clinical Alert', 'ئاگادارکردنەوە')}</span>
                          </span>
                        )}

                        {metrics?.activePkg && (
                          <span className="text-primary font-bold tabular-nums shrink-0">
                            <bdi dir="ltr">
                              {metrics.activePkg.used}/{metrics.activePkg.total}
                            </bdi>{' '}
                            {bi('جلسات', 'sess', 'دانیشتن')}
                          </span>
                        )}

                        {(metrics?.debtIQD ?? 0) > 0 && (
                          <span className="text-orange-600 dark:text-orange-400 font-extrabold inline-flex items-center gap-1 shrink-0 tabular-nums">
                            <Wallet className="size-3.5 shrink-0" />
                            <span>{bi('ذمة', 'Due', 'ماوە')}</span>
                            <Money amount={metrics!.debtIQD} />
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Trailing Controls: Hover-Reveal on Desktop, Single ⋯ Action Menu on Mobile */}
                  {isSmUp ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5">
                        <button
                          type="button"
                          data-testid={`patient-peek-btn-${patient.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuickViewEntry({ patient, index: idx });
                          }}
                          aria-label={bi('نظرة سريعة', 'Quick Peek', 'سەیرکردنی خێرا')}
                          title={bi('نظرة سريعة (Space)', 'Quick Peek (Space)')}
                          className="size-9 rounded-xl hover:bg-surface text-muted-foreground-1 hover:text-primary inline-flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Eye className="size-4" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            ClinicOperationsService.togglePinnedPatient(patient.id);
                          }}
                          aria-label={
                            isPinned
                              ? bi('إلغاء تثبيت المريض', 'Unpin patient')
                              : bi('تثبيت المريض', 'Pin patient')
                          }
                          title={
                            isPinned
                              ? bi('إلغاء التثبيت', 'Unpin')
                              : bi('تثبيت المريض', 'Pin patient')
                          }
                          className="size-9 rounded-xl hover:bg-surface inline-flex items-center justify-center cursor-pointer transition-colors"
                        >
                          <Star
                            className={`size-4 ${
                              isPinned
                                ? 'fill-amber-500 text-amber-500'
                                : 'text-muted-foreground-2 hover:text-amber-600'
                            }`}
                          />
                        </button>

                        {activeLens !== 'archived' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              archivePatient(patient.id);
                              setUndoArchivedPatient({ id: patient.id, name: primaryName });
                            }}
                            aria-label={bi('أرشفة', 'Archive', 'ئەرشیف')}
                            title={bi('أرشفة الملف', 'Archive record')}
                            className="size-9 rounded-xl hover:bg-surface text-muted-foreground-1 hover:text-orange-600 dark:hover:text-orange-400 inline-flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <Archive className="size-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              unarchivePatient(patient.id);
                            }}
                            aria-label={bi('استعادة', 'Restore', 'گەڕاندنەوە')}
                            title={bi('استعادة من الأرشيف', 'Restore from archive')}
                            className="size-9 rounded-xl hover:bg-surface text-emerald-700 dark:text-emerald-300 inline-flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <RotateCcw className="size-4" />
                          </button>
                        )}
                      </div>

                      <ChevronIcon
                        aria-hidden="true"
                        className="size-4 text-muted-foreground-2/70 group-hover:text-primary transition-colors ms-1 shrink-0"
                      />
                    </div>
                  ) : (
                    <div className="relative shrink-0" data-row-menu-root="true">
                      <button
                        type="button"
                        data-testid={`patient-row-menu-btn-${patient.id}`}
                        aria-haspopup="menu"
                        aria-expanded={rowMenuOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenRowMenuId(rowMenuOpen ? null : patient.id);
                        }}
                        aria-label={bi('خيارات المريض', 'Patient actions', 'کردارەکان')}
                        className="size-11 rounded-xl hover:bg-surface text-muted-foreground-1 hover:text-foreground inline-flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>

                      {rowMenuOpen && (
                        <ClampedMenuPanel
                          role="menu"
                          className="absolute top-full mt-1 end-0 w-52 z-30 rounded-2xl bg-card shadow-2xl border border-black/[0.06] dark:border-white/[0.08] p-1.5 space-y-0.5 text-xs"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            data-testid={`patient-peek-btn-${patient.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenRowMenuId(null);
                              setQuickViewEntry({ patient, index: idx });
                            }}
                            className="w-full min-h-[44px] px-2.5 py-2 rounded-xl hover:bg-surface text-foreground font-semibold flex items-center gap-2 cursor-pointer"
                          >
                            <Eye className="size-4 text-primary shrink-0" />
                            <span>{bi('نظرة سريعة', 'Quick Peek', 'سەیرکردنی خێرا')}</span>
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenRowMenuId(null);
                              ClinicOperationsService.togglePinnedPatient(patient.id);
                            }}
                            className="w-full min-h-[44px] px-2.5 py-2 rounded-xl hover:bg-surface text-foreground font-semibold flex items-center gap-2 cursor-pointer"
                          >
                            <Star
                              className={`size-4 shrink-0 ${
                                isPinned ? 'fill-amber-500 text-amber-500' : 'text-amber-500'
                              }`}
                            />
                            <span>
                              {isPinned
                                ? bi('إلغاء التثبيت', 'Unpin', 'لابردنی جێگیرکردن')
                                : bi('تثبيت المريض', 'Pin patient', 'جێگیرکردن')}
                            </span>
                          </button>

                          {activeLens !== 'archived' ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenRowMenuId(null);
                                archivePatient(patient.id);
                                setUndoArchivedPatient({ id: patient.id, name: primaryName });
                              }}
                              className="w-full min-h-[44px] px-2.5 py-2 rounded-xl hover:bg-surface text-orange-600 dark:text-orange-400 font-semibold flex items-center gap-2 cursor-pointer"
                            >
                              <Archive className="size-4 shrink-0" />
                              <span>{bi('أرشفة الملف', 'Archive', 'ئەرشیفکردن')}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenRowMenuId(null);
                                unarchivePatient(patient.id);
                              }}
                              className="w-full min-h-[44px] px-2.5 py-2 rounded-xl hover:bg-surface text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2 cursor-pointer"
                            >
                              <RotateCcw className="size-4 shrink-0" />
                              <span>{bi('استعادة', 'Restore', 'گەڕاندنەوە')}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenRowMenuId(null);
                              onSelectPatient(patient);
                            }}
                            className="w-full min-h-[44px] px-2.5 py-2 rounded-xl hover:bg-surface text-primary font-extrabold flex items-center gap-2 cursor-pointer"
                          >
                            <FolderOpen className="size-4 shrink-0" />
                            <span>{bi('فتح الملف السريري', 'Open Chart', 'کردنەوەی دۆسیە')}</span>
                          </button>
                        </ClampedMenuPanel>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {patientVirtualWindow.bottomSpacerPx > 0 && (
              <div
                style={{ height: patientVirtualWindow.bottomSpacerPx }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      ) : displayedList.length === 0 ? (
        /* Empty State Card */
        <div
          data-testid="patients-empty-state"
          className="pr-surface p-10 text-center rounded-[24px] max-w-lg mx-auto"
        >
          <div className="size-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <HeartPulse className="size-8" />
          </div>
          <h2 className="text-base font-bold text-foreground mb-1">
            {activeTab === 'active'
              ? bi('لا يوجد مرضى مسجلون في القائمة النشطة', 'No active patient records found')
              : bi('الأرشيف فارغ حالياً', 'Archive is currently empty')}
          </h2>
          <p className="text-xs text-muted-foreground-1 mb-6">
            {activeTab === 'active'
              ? bi(
                  'ابدأ بتسجيل أول مريض، أو قم بإدراج بيانات سريرية تجريبية لاستكشاف إمكانيات النظام.',
                  'Start by adding a new patient, or generate synthetic clinical cases to test the system.'
                )
              : bi('لم يتم نقل أي مريض إلى الأرشيف حتى الآن.', 'No patients have been archived yet.')}
          </p>
          {activeTab === 'active' ? (
            <div className="flex flex-col items-center gap-3 justify-center">
              <button
                type="button"
                data-testid="patients-empty-primary-btn"
                onClick={onOpenNewPatientModal}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-[38px] bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
              >
                <UserPlus className="size-4" />
                <span>{bi('تسجيل مريض جديد', 'New Patient')}</span>
              </button>
              <button
                type="button"
                onClick={onOpenSyntheticModal}
                className="text-xs text-muted-foreground-1 hover:text-primary underline underline-offset-4 min-h-[44px] sm:min-h-[36px] px-3 inline-flex items-center transition-colors cursor-pointer"
              >
                {bi('تجربة النظام ببيانات تجريبية', 'Try with demo data')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 justify-center">
              <button
                type="button"
                data-testid="patients-empty-primary-btn"
                onClick={() => setActiveLens('all')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-[38px] bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
              >
                <span>{bi('العودة إلى قائمة المرضى النشطين', 'View Active Patients')}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* No Filter/Search Match */
        <div className="pr-surface p-8 text-center rounded-[20px] text-muted-foreground-1 text-xs space-y-2">
          <p>
            {searchQuery.trim()
              ? bi(
                  `لا توجد نتائج مطابقة لبحثك: "${searchQuery}".`,
                  `No matching results for: "${searchQuery}".`
                )
              : bi(
                  'لا يوجد مرضى في هذا التصنيف حالياً.',
                  'No patients match this filter right now.'
                )}
          </p>
          {(searchQuery.trim() || activeLens !== 'all' || filterGender !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveLens('all');
                setFilterGender('all');
              }}
              className="min-h-[44px] sm:min-h-[34px] px-3.5 py-1.5 rounded-full bg-surface hover:bg-layer-hover text-primary font-bold cursor-pointer transition-colors"
            >
              {bi('عرض جميع المرضى', 'Show all patients', 'پێشاندانی هەموو نەخۆشەکان')}
            </button>
          )}
        </div>
      )}

      {isCsvImportOpen && (
        <Suspense fallback={null}>
          <CsvOnboardingModal
            isOpen={isCsvImportOpen}
            onOpenChange={setIsCsvImportOpen}
            onOpenMergeModal={() => {
              setIsCsvImportOpen(false);
              setIsMergeModalOpen(true);
            }}
          />
        </Suspense>
      )}

      {isMergeModalOpen && (
        <Suspense fallback={null}>
          <PatientMergeModal
            isOpen={isMergeModalOpen}
            onClose={() => setIsMergeModalOpen(false)}
          />
        </Suspense>
      )}

      {quickViewEntry !== null && (
        <Suspense fallback={null}>
          <PatientQuickViewModal
            patient={quickViewEntry?.patient || null}
            patientIndex={quickViewEntry?.index ?? 0}
            isOpen={quickViewEntry !== null}
            onClose={() => setQuickViewEntry(null)}
            onOpenFullChart={(selected) => {
              setQuickViewEntry(null);
              onSelectPatient(selected);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
