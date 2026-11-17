// =======================================================================
// PhysioRecord — Patient Directory Component (Enterprise Table & Cards)
// Modern Healthcare SaaS Directory with Semantic Tokens & Grid/Table View
// =======================================================================

import React, { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import { usePatients } from '../context/PatientContext';
import { useLanguage } from '../context/LanguageContext';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import type { PatientRecord } from '../types/clinical';
import { computePatientAge, formatClinicalDate, formatIraqiPhoneDisplay } from '../utils/date';
import {
  getPatientMrn,
  isDemoPatient,
  hasPatientRedFlagsOrContraindications,
  getPatientDisplayName,
  getPatientSecondaryName,
} from '../utils/mrn';
import { findAllDirectoryDuplicatePairs } from '../utils/dataQualityPhaseD';
import { Num, DemoBadge } from './ui/Primitives';
import { PatientSearchEngine } from '../utils/arabicSearch';
import { useVirtualWindow } from '../hooks/useVirtualWindow';
import {
  Search,
  UserPlus,
  FileSpreadsheet,
  AlertCircle,
  Star,
  History,
  ChevronLeft,
  ChevronRight,
  Phone,
  Calendar,
  HeartPulse,
  Briefcase,
  Archive,
  RotateCcw,
  LayoutGrid,
  List,
  GitMerge,
  X,
  Users,
} from 'lucide-react';

const PatientMergeModal = lazy(() => import('./clinic/PatientMergeModal'));
const CsvOnboardingModal = lazy(() =>
  import('./clinic/CsvOnboardingModal').then((m) => ({ default: m.CsvOnboardingModal }))
);
const PatientQuickViewModal = lazy(() =>
  import('./PatientQuickViewModal').then((m) => ({ default: m.PatientQuickViewModal }))
);

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
  const { bi, isRtl, language } = useLanguage();

  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [undoArchivedPatient, setUndoArchivedPatient] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female'>('all');
  const [filterRedFlagsOnly, setFilterRedFlagsOnly] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [importWizardEnabled, setImportWizardEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isImportWizardEnabled()
  );
  const [quickViewEntry, setQuickViewEntry] = useState<{
    patient: PatientRecord;
    index: number;
  } | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePatientCardClick = (patient: PatientRecord, index: number) => {
    if (isMobile) {
      onSelectPatient(patient);
    } else {
      setQuickViewEntry({ patient, index });
    }
  };
  const [pinnedIds, setPinnedIds] = useState<string[]>(() =>
    ClinicOperationsService.getPinnedPatientIds()
  );
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    ClinicOperationsService.getRecentPatientIds()
  );

  useEffect(() => {
    const syncMem = () => {
      setPinnedIds(ClinicOperationsService.getPinnedPatientIds());
      setRecentIds(ClinicOperationsService.getRecentPatientIds());
      setImportWizardEnabled(ClinicOperationsService.isImportWizardEnabled());
    };
    const unsub = ClinicOperationsService.subscribe(syncMem);
    window.addEventListener('physiorecord-modules-updated', syncMem);
    return () => {
      unsub();
      window.removeEventListener('physiorecord-modules-updated', syncMem);
    };
  }, []);

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

  const recentPatients = useMemo(
    () =>
      recentIds
        .filter((id) => !pinnedIds.includes(id))
        .map((id) => activePatients.find((p) => p.id === id))
        .filter((p): p is PatientRecord => Boolean(p))
        .slice(0, 6),
    [recentIds, pinnedIds, activePatients]
  );

  const displayedList = activeTab === 'active' ? activePatients : archivedPatients;
  const [searchIndexActivated, setSearchIndexActivated] = useState(false);

  const redFlagCount = useMemo(
    () =>
      activePatients.filter((p) =>
        hasPatientRedFlagsOrContraindications(p.data)
      ).length,
    [activePatients]
  );

  const searchEngine = useMemo(() => {
    if (!searchIndexActivated) return null;
    return new PatientSearchEngine(displayedList, (p, idx) => getPatientMrn(p, idx));
  }, [displayedList, searchIndexActivated]);

  // In-memory zero-PII Arabic-aware MiniSearch + clinical filters
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

    return baseMatches.filter((patient) => {
      const p = patient.data;
      const matchesGender = filterGender === 'all' || p.gender === filterGender;
      const matchesRedFlags =
        !filterRedFlagsOnly || hasPatientRedFlagsOrContraindications(p);

      return matchesGender && matchesRedFlags;
    });
  }, [searchEngine, displayedList, searchQuery, filterGender, filterRedFlagsOnly]);

  const [gridColumns, setGridColumns] = useState<number>(() => {
    if (typeof window === 'undefined') return 3;
    return window.innerWidth >= 1024 ? 3 : window.innerWidth >= 768 ? 2 : 1;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateCols = () => {
      const w = window.innerWidth;
      setGridColumns(w >= 1024 ? 3 : w >= 768 ? 2 : 1);
    };
    window.addEventListener('resize', updateCols);
    return () => window.removeEventListener('resize', updateCols);
  }, []);

  const patientVirtualWindow = useVirtualWindow({
    totalCount: filteredPatients.length,
    estimatedRowHeightPx: viewMode === 'table' ? 68 : 285,
    columns: viewMode === 'table' ? 1 : gridColumns,
    overscanRows: 4,
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

  return (
    <div
      className="max-w-[85rem] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-4"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Batch 3 Item 3: Page Header = Title + Max 2 Actions (No repeated hero card or duplicate New Patient button) */}
      <div className="pr-page-header">
        <div className="space-y-1 min-w-0">
          <span className="pr-eyebrow">
            <Users className="size-3.5" />
            {bi('سجل العيادة', 'Clinic registry', 'تۆمارگەی کلینیک')}
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="pr-page-title">
              {bi('سجل المرضى', 'Patient Directory')}
            </h1>
            <span className="pr-chip">
              <Num value={activePatients.length} />{' '}
              {bi('ملف نشط', 'active', 'چالاک')}
            </span>
            {redFlagCount > 0 && (
              <span className="text-xs font-bold tabular-nums text-rose-700 dark:text-rose-400 inline-flex items-center gap-1">
                <AlertCircle className="size-3.5" />
                <Num value={redFlagCount} /> {bi('علامات حمراء', 'red flags')}
              </span>
            )}
          </div>
          <p className="pr-page-subtitle">
            {bi(
              'ابحث، صنّف، وافتح الملف السريري بضغطة واحدة.',
              'Search, sort, and open a clinical chart in one tap.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="open-patient-merge-modal-btn"
            onClick={() => setIsMergeModalOpen(true)}
            className="px-3 py-1.5 min-h-[36px] rounded-xl bg-surface hover:bg-layer-hover border border-layer-line text-xs font-semibold text-foreground inline-flex items-center gap-1.5 cursor-pointer"
          >
            <GitMerge className="size-4 text-amber-700 dark:text-amber-400" />
            <span>{bi('دمج المكررين', 'Merge Duplicates')}</span>
            {duplicatePairCount > 0 && (
              <span className="text-xs font-mono font-bold tabular-nums text-amber-700 dark:text-amber-300">
                · {duplicatePairCount}
              </span>
            )}
          </button>

          {importWizardEnabled && (
            <button
              type="button"
              onClick={() => setIsCsvImportOpen(true)}
              className="px-3 py-1.5 min-h-[36px] rounded-xl bg-surface hover:bg-layer-hover border border-layer-line text-xs font-semibold text-foreground inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="size-4 text-primary" />
              <span>{bi('استيراد مرضى (CSV / XLSX)', 'Import CSV / XLSX')}</span>
            </button>
          )}
        </div>
      </div>

      {undoArchivedPatient && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-surface/75 text-xs text-foreground"
        >
          <span>
            {bi('تمت أرشفة ملف المريض:', 'Patient archived:')}{' '}
            <strong className="font-bold">{undoArchivedPatient.name}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                unarchivePatient(undoArchivedPatient.id);
                setUndoArchivedPatient(null);
              }}
              className="px-3 py-1.5 min-h-[36px] rounded-lg bg-amber-700 text-white font-bold hover:bg-amber-800 cursor-pointer"
            >
              {bi('تراجع', 'Undo')}
            </button>
            <button
              type="button"
              onClick={() => setUndoArchivedPatient(null)}
              aria-label={bi('إغلاق الإشعار', 'Dismiss notification')}
              className="p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-muted-foreground-1 hover:text-foreground cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Unified Toolbar Card: Tabs, View Mode, Search & Filters */}
      <div className="pr-surface overflow-hidden">
        {/* Top Row: Segmented Tabs & View Switcher */}
        <div className="px-4 sm:px-5 py-3 border-b border-card-divider flex flex-wrap items-center justify-between gap-3 bg-surface/40">
          <div role="tablist" aria-label={bi('حالة سجلات المرضى', 'Patient Record Status')} className="pr-seg">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'active'}
              onClick={() => setActiveTab('active')}
              data-active={activeTab === 'active'}
              className="pr-seg-item"
            >
              <span>{bi('المرضى النشطون', 'Active Patients')}</span>
              <span className="py-0.5 px-2 rounded-full text-xs font-mono tabular-nums bg-primary/10 text-primary">
                {activePatients.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'archived'}
              onClick={() => setActiveTab('archived')}
              data-active={activeTab === 'archived'}
              className="pr-seg-item"
            >
              <Archive className="size-3.5" />
              <span>{bi('سجل الأرشيف', 'Archived Records')}</span>
              <span className="py-0.5 px-2 rounded-full text-xs font-mono tabular-nums bg-amber-500/10 text-amber-700 dark:text-amber-400">
                {archivedPatients.length}
              </span>
            </button>
          </div>

          {/* Grid vs Table Toggle */}
          <div className="pr-seg">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              data-active={viewMode === 'grid'}
              className="pr-seg-item"
            >
              <LayoutGrid className="size-3.5" />
              <span>{bi('بطاقات', 'Cards')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              data-active={viewMode === 'table'}
              className="pr-seg-item"
            >
              <List className="size-3.5" />
              <span>{bi('جدول سريري', 'Clinical Table')}</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Search Input Group & Filters */}
        <div className="p-4 sm:p-5 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setSearchIndexActivated(true)}
              onChange={(e) => {
                setSearchIndexActivated(true);
                setSearchQuery(e.target.value);
              }}
              aria-label={bi('بحث في سجل المرضى', 'Search patient directory')}
              placeholder={bi(
                'بحث فوري باسم المريض، رقم الهاتف، التشخيص، أو التاريخ الطبي...',
                'Instant search by name, phone, diagnosis, or clinical history...'
              )}
              className="pr-field ps-10 pe-16 rounded-full"
            />
            <Search
              className="size-4 text-muted-foreground-1 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground-1 hover:text-foreground bg-surface px-2.5 py-1 min-h-[32px] rounded-md cursor-pointer inline-flex items-center gap-1"
              >
                <X className="size-3" />
                <span>{bi('مسح', 'Clear')}</span>
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value as 'all' | 'male' | 'female')}
              aria-label={bi('تصفية حسب الجنس', 'Filter by gender')}
              className="pr-field w-auto rounded-full"
            >
              <option value="all">{bi('كافة الفئات', 'All Genders')}</option>
              <option value="male">{bi('ذكور', 'Male')}</option>
              <option value="female">{bi('إناث', 'Female')}</option>
            </select>

            <button
              type="button"
              onClick={() => setFilterRedFlagsOnly(!filterRedFlagsOnly)}
              className={`py-2.5 px-3.5 min-h-[36px] rounded-xl text-xs sm:text-sm font-semibold border inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                filterRedFlagsOnly
                  ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30 shadow-2xs'
                  : 'bg-layer text-layer-foreground border-layer-line hover:bg-layer-hover'
              }`}
            >
              <AlertCircle
                className={`size-4 ${
                  filterRedFlagsOnly ? 'text-rose-700 dark:text-rose-400' : 'text-muted-foreground-1'
                }`}
              />
              <span>{bi('علامات حمراء تحذيرية', 'Red Flags')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pinned & Recent Patients Quick Access (Horizontally scrollable strip) */}
      {activeTab === 'active' && (pinnedPatients.length > 0 || recentPatients.length > 0) && (
        <div className="pr-surface p-2 text-xs overflow-hidden">
          <div className="pr-hscroll overflow-x-auto flex items-center gap-2 whitespace-nowrap pb-1 pt-0.5 px-1">
            {pinnedPatients.length > 0 && (
              <>
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-bold shrink-0">
                  <Star className="size-3.5 fill-amber-500 text-amber-500" />
                  <span>{bi('المثبتون:', 'Pinned:')}</span>
                </span>
                {pinnedPatients.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePatientCardClick(p, idx)}
                    className="px-2.5 py-1.5 min-h-[34px] rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>{getPatientDisplayName(p.data, language)}</span>
                    {isDemoPatient(p) && <DemoBadge />}
                  </button>
                ))}
              </>
            )}

            {recentPatients.length > 0 && (
              <>
                <span className="inline-flex items-center gap-1 text-muted-foreground-1 font-bold ms-1 shrink-0">
                  <History className="size-3.5 text-primary" />
                  <span>{bi('الأخيرون:', 'Recent:')}</span>
                </span>
                {recentPatients.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePatientCardClick(p, idx)}
                    className="px-2.5 py-1.5 min-h-[34px] rounded-xl bg-surface hover:bg-primary/10 border border-line-2 hover:border-primary/40 text-foreground font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>{getPatientDisplayName(p.data, language)}</span>
                    {isDemoPatient(p) && <DemoBadge />}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Directory Content */}
      {loading ? (
        <div className="pr-surface p-12 text-center text-muted-foreground-1">
          <p className="text-sm font-medium">
            {bi(
              'جاري فك تشفير وتحميل السجلات السريرية المعتمدة...',
              'Decrypting and loading verified clinical records...'
            )}
          </p>
        </div>
      ) : filteredPatients.length > 0 ? (
        viewMode === 'table' ? (
          /* Enterprise Clinical Table View */
          <div className="pr-surface overflow-hidden">
            <div
              ref={patientVirtualWindow.containerRef}
              onScroll={patientVirtualWindow.onScroll}
              data-testid="patient-directory-list"
              tabIndex={0}
              aria-label={bi('قائمة المرضى', 'Patient list')}
              className={
                patientVirtualWindow.isVirtualized
                  ? 'overflow-auto max-h-[72vh] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                  : 'overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
              }
            >
              <table className="min-w-full divide-y divide-card-divider text-start text-xs pr-responsive-table">
                <thead className="bg-surface/70 sticky top-0 z-10 backdrop-blur-sm">
                  <tr className="text-muted-foreground-1 font-semibold text-xs">
                    <th scope="col" className="py-3.5 px-4 text-start">{bi('المريض', 'Patient')}</th>
                    <th scope="col" className="py-3.5 px-4 text-start">{bi('الجنس / العمر', 'Demographics')}</th>
                    <th scope="col" className="py-3.5 px-4 text-start">{bi('التاريخ المرضي والمحاذير', 'Clinical Summary & Alerts')}</th>
                    <th scope="col" className="py-3.5 px-4 text-start">{bi('الهاتف', 'Phone')}</th>
                    <th scope="col" className="py-3.5 px-4 text-end">{bi('الإجراء', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-divider">
                  {patientVirtualWindow.topSpacerPx > 0 && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={5}
                        style={{ height: patientVirtualWindow.topSpacerPx }}
                        className="p-0 border-0"
                      />
                    </tr>
                  )}
                  {visiblePatientsSlice.map((patient, localIdx) => {
                    const idx = patientVirtualWindow.startIndex + localIdx;
                    const p = patient.data;
                    const hasRedFlags = hasPatientRedFlagsOrContraindications(p);
                    const mrn = getPatientMrn(patient, idx);
                    const demo = isDemoPatient(patient);
                    const isImported = Boolean(p.isImported || p.tags?.includes('imported'));
                    const primaryName = getPatientDisplayName(p, language);
                    const secondaryName = getPatientSecondaryName(p, language);
                    return (
                      <tr
                        key={patient.id}
                        onClick={() => handlePatientCardClick(patient, idx)}
                        className="hover:bg-muted/40 transition-colors cursor-pointer group"
                      >
                        <td data-label={bi('المريض', 'Patient')} className="py-3.5 px-4 whitespace-nowrap pr-cell-primary">
                          <div className="flex items-center gap-3">
                            <span className="pr-avatar size-9 text-xs">
                              {(primaryName || 'P').charAt(0)}
                            </span>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5 font-bold text-foreground group-hover:text-primary transition-colors text-xs sm:text-sm">
                                <span>{primaryName}</span>
                                {secondaryName && (
                                  <span className="text-xs font-normal text-muted-foreground-1">
                                    (<bdi>{secondaryName}</bdi>)
                                  </span>
                                )}
                                {demo && <DemoBadge />}
                                {isImported && (
                                  <span
                                    data-testid="patient-imported-badge"
                                    className="text-xs font-semibold text-sky-700 dark:text-sky-300 shrink-0"
                                  >
                                    · {bi('مستورد', 'Imported')}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-mono text-muted-foreground-1 tabular-nums">
                                <bdi dir="ltr">{mrn}</bdi>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td data-label={bi('الجنس / العمر', 'Demographics')} className="py-3.5 px-4 whitespace-nowrap tabular-nums">
                          <span
                            className={`inline-flex items-center text-xs font-semibold ${
                              p.gender === 'male'
                                ? 'text-sky-700 dark:text-sky-300'
                                : 'text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {p.gender === 'male' ? bi('ذكر', 'Male') : bi('أنثى', 'Female')}{' '}
                            {computePatientAge(p.dateOfBirth, p.age) !== undefined ? (
                              <span className="ms-1 inline-flex items-center">
                                • <bdi dir="ltr">{computePatientAge(p.dateOfBirth, p.age)}</bdi>
                              </span>
                            ) : (
                              ''
                            )}
                          </span>
                        </td>
                        <td data-label={bi('التاريخ المرضي والمحاذير', 'Clinical Summary & Alerts')} className="py-3.5 px-4 max-w-xs">
                          {hasRedFlags && (
                            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 text-xs font-bold mb-1">
                              <AlertCircle className="size-3" />
                              <span className="truncate">{p.redFlags || p.contraindications || p.precautions}</span>
                            </span>
                          )}
                          <p className="text-muted-foreground-1 truncate">
                            {p.medicalHistory || bi('لا يوجد تاريخ مرضي مسجل', 'No medical history')}
                          </p>
                        </td>
                        <td data-label={bi('الهاتف', 'Phone')} className="py-3.5 px-4 whitespace-nowrap text-muted-foreground-1 tabular-nums">
                          <bdi dir="ltr">{formatIraqiPhoneDisplay(p.phoneNumber || p.phone)}</bdi>
                        </td>
                        <td data-label={bi('الإجراء', 'Action')} className="py-3.5 px-4 whitespace-nowrap text-end">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                ClinicOperationsService.togglePinnedPatient(patient.id);
                              }}
                              aria-label={
                                pinnedIds.includes(patient.id)
                                  ? bi('إلغاء تثبيت المريض', 'Unpin patient')
                                  : bi('تثبيت المريض', 'Pin patient')
                              }
                              className="p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-amber-500/10 text-muted-foreground-1 hover:text-amber-700 cursor-pointer"
                            >
                              <Star
                                className={`size-4 ${
                                  pinnedIds.includes(patient.id)
                                    ? 'fill-amber-500 text-amber-500'
                                    : ''
                                }`}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePatientCardClick(patient, idx);
                              }}
                              className="inline-flex items-center gap-1 py-1.5 px-3 min-h-[36px] rounded-lg bg-primary/10 text-primary font-semibold group-hover:bg-primary group-hover:text-primary-foreground transition-colors cursor-pointer"
                            >
                              <span>{bi('عرض التقرير', 'View Report')}</span>
                              <ChevronIcon className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {patientVirtualWindow.bottomSpacerPx > 0 && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={5}
                        style={{ height: patientVirtualWindow.bottomSpacerPx }}
                        className="p-0 border-0"
                      />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Clinical Cards Grid View */
          <div
            ref={patientVirtualWindow.containerRef}
            onScroll={patientVirtualWindow.onScroll}
            data-testid="patient-directory-list"
            tabIndex={patientVirtualWindow.isVirtualized ? 0 : undefined}
            aria-label={patientVirtualWindow.isVirtualized ? bi('قائمة المرضى', 'Patient list') : undefined}
            className={
              patientVirtualWindow.isVirtualized
                ? 'overflow-y-auto max-h-[72vh] pe-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                : ''
            }
          >
            {patientVirtualWindow.topSpacerPx > 0 && (
              <div
                style={{ height: patientVirtualWindow.topSpacerPx }}
                aria-hidden="true"
              />
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visiblePatientsSlice.map((patient, localIdx) => {
                const idx = patientVirtualWindow.startIndex + localIdx;
              const p = patient.data;
              const hasRedFlags = hasPatientRedFlagsOrContraindications(p);
              const mrn = getPatientMrn(patient, idx);
              const demo = isDemoPatient(patient);
              const isImported = Boolean(p.isImported || p.tags?.includes('imported'));
              const primaryName = getPatientDisplayName(p, language);
              const secondaryName = getPatientSecondaryName(p, language);

              return (
                <div
                  key={patient.id}
                  className="pr-surface pr-surface-interactive p-5 flex flex-col justify-between group"
                >
                  <div
                    onClick={() => handlePatientCardClick(patient, idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handlePatientCardClick(patient, idx);
                      }
                    }}
                    className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
                  >
                    {/* Card Header */}
                    <div className="flex items-center justify-between gap-3 mb-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="pr-avatar size-10 text-sm">
                          {(primaryName || 'P').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h2 className="font-bold text-foreground group-hover:text-primary transition-colors text-sm break-words">
                              {primaryName}
                            </h2>
                            {secondaryName && (
                              <span className="text-xs font-normal text-muted-foreground-1 break-words">
                                (<bdi>{secondaryName}</bdi>)
                              </span>
                            )}
                            {demo && <DemoBadge />}
                            {isImported && (
                              <span
                                data-testid="patient-imported-badge"
                                className="text-xs font-semibold text-sky-700 dark:text-sky-300 shrink-0"
                              >
                                · {bi('مستورد', 'Imported')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground-1 font-mono tabular-nums">
                            <bdi dir="ltr">{mrn}</bdi>
                          </p>
                        </div>
                      </div>
                      <div
                        className={`text-center shrink-0 self-center tabular-nums text-xs font-bold ${
                          p.gender === 'male'
                            ? 'text-sky-700 dark:text-sky-300'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        <span className="leading-tight text-center block">
                          {p.gender === 'male' ? bi('ذكر', 'Male') : bi('أنثى', 'Female')}
                        </span>
                        {computePatientAge(p.dateOfBirth, p.age) !== undefined && (
                          <span className="text-xs font-semibold leading-tight text-center opacity-90 mt-0.5 block">
                            <bdi dir="ltr">({computePatientAge(p.dateOfBirth, p.age)})</bdi>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Red Flags Alert Badge */}
                    {hasRedFlags && (
                      <div className="mb-3 px-3 py-2 bg-surface/75 rounded-xl text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2 font-semibold">
                        <AlertCircle className="size-4 text-rose-700 dark:text-rose-400 shrink-0" />
                        <span className="truncate">{p.redFlags || p.contraindications || p.precautions}</span>
                      </div>
                    )}

                    {/* Medical Summary Snippet */}
                    {p.medicalHistory && (
                      <p className="text-xs text-muted-foreground-1 line-clamp-2 mb-3.5 bg-surface p-2.5 rounded-xl border border-line-2">
                        {p.medicalHistory}
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="space-y-1.5 text-xs text-muted-foreground-1 mb-4 tabular-nums">
                      {(p.phoneNumber || p.phone) && (
                        <div className="flex items-center gap-2">
                          <Phone className="size-3.5 text-muted-foreground-1" />
                          <bdi dir="ltr">{formatIraqiPhoneDisplay(p.phoneNumber || p.phone)}</bdi>
                        </div>
                      )}
                      {p.occupation && (
                        <div className="flex items-center gap-2">
                          <Briefcase className="size-3.5 text-muted-foreground-1" />
                          <span>{p.occupation}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="size-3.5 text-muted-foreground-1" />
                        <span>
                          {bi('آخر تحديث:', 'Updated:')} {formatClinicalDate(patient.updatedAt, language)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Controls */}
                  <div className="pt-3.5 border-t border-card-divider flex items-center justify-between text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => onSelectPatient(patient)}
                      className="text-primary hover:opacity-80 inline-flex items-center gap-1 min-h-[36px] font-bold cursor-pointer"
                    >
                      <span>{bi('فتح الملف السريري', 'Open Patient Chart')}</span>
                      <ChevronIcon className="size-4" />
                    </button>

                    {/* Archival & Pin Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          ClinicOperationsService.togglePinnedPatient(patient.id);
                        }}
                        aria-label={
                          pinnedIds.includes(patient.id)
                            ? bi('إلغاء تثبيت المريض', 'Unpin patient')
                            : bi('تثبيت المريض', 'Pin patient')
                        }
                        className={`p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg gap-1 text-xs cursor-pointer transition-colors ${
                          pinnedIds.includes(patient.id)
                            ? 'text-amber-700 dark:text-amber-300 bg-amber-500/10'
                            : 'text-muted-foreground-1 hover:text-amber-700 hover:bg-amber-500/10'
                        }`}
                      >
                        <Star
                          className={`size-3.5 ${
                            pinnedIds.includes(patient.id) ? 'fill-amber-500 text-amber-500' : ''
                          }`}
                        />
                      </button>

                      {activeTab === 'active' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            archivePatient(patient.id);
                            setUndoArchivedPatient({ id: patient.id, name: primaryName });
                          }}
                          className="text-muted-foreground-1 hover:text-amber-700 dark:hover:text-amber-400 px-2.5 py-1.5 min-h-[36px] rounded-lg hover:bg-amber-500/10 inline-flex items-center gap-1 text-xs cursor-pointer transition-colors"
                        >
                          <Archive className="size-3.5" />
                          <span>{bi('أرشفة', 'Archive')}</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              unarchivePatient(patient.id);
                            }}
                            className="text-emerald-700 dark:text-emerald-400 px-2.5 py-1.5 min-h-[36px] rounded-lg hover:bg-emerald-500/10 inline-flex items-center gap-1 text-xs cursor-pointer transition-colors"
                          >
                            <RotateCcw className="size-3.5" />
                            <span>{bi('استعادة', 'Restore')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
            {patientVirtualWindow.bottomSpacerPx > 0 && (
              <div
                style={{ height: patientVirtualWindow.bottomSpacerPx }}
                aria-hidden="true"
              />
            )}
          </div>
        )
      ) : displayedList.length === 0 ? (
        /* Empty State Card */
        <div
          data-testid="patients-empty-state"
          className="p-12 text-center bg-card rounded-2xl border border-card-line shadow-2xs max-w-lg mx-auto"
        >
          <div className="size-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto mb-4">
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
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[36px] bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
              >
                <UserPlus className="size-4" />
                <span>{bi('تسجيل مريض جديد', 'New Patient')}</span>
              </button>
              <button
                type="button"
                onClick={onOpenSyntheticModal}
                className="text-xs text-muted-foreground-1 hover:text-primary underline underline-offset-4 min-h-[36px] px-3 inline-flex items-center transition-colors cursor-pointer"
              >
                {bi('تجربة النظام ببيانات تجريبية', 'Try with demo data')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 justify-center">
              <button
                type="button"
                data-testid="patients-empty-primary-btn"
                onClick={() => setActiveTab('active')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl text-xs transition-all shadow-xs cursor-pointer"
              >
                <span>{bi('العودة إلى قائمة المرضى النشطين', 'View Active Patients')}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* No Search Match */
        <div className="p-8 text-center bg-card rounded-2xl border border-card-line text-muted-foreground-1 text-xs shadow-2xs">
          {bi(
            `لا توجد نتائج مطابقة لبحثك: "${searchQuery}".`,
            `No matching results for: "${searchQuery}".`
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
