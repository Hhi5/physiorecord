// =======================================================================
// PhysioRecord — Phase D3 & D4: Data Health Screen & 30-Day Non-Clinical Trash
// - D4: 5-category encrypted data health audit + database orphan scanner/repair
// - D3: 30-day non-clinical recycle bin (appointments, waitlist, expenses only)
//       with explicit clinical immutability protection notice
// =======================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type { PatientRecord, SessionRecord } from '../../types/clinical';
import type { RecycleBinEntry, RecycleBinItemType } from '../../types/clinicManagement';
import {
  computeClinicDataHealthReport,
  getRemainingRecycleDays,
  resolveOrphanRecord,
  scanDatabaseOrphanRecords,
  type ClinicDataHealthReport,
  type DataHealthCategoryId,
  type DataHealthCategoryItem,
  type DataHealthIssueDetail,
  type OrphanRecordItem,
} from '../../utils/dataQualityPhaseD';
import { Num } from '../ui/Primitives';
import {
  Activity,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  FileWarning,
  HardDrive,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';

export interface DataHealthAndTrashPanelProps {
  patients: PatientRecord[];
  draftSessions: SessionRecord[];
  onOpenPatientSession: (patient: PatientRecord, sessionId?: string | null) => void;
  onOpenBilling: () => void;
  onOpenBackup: () => void;
}

const CATEGORY_ICON_MAP: Record<DataHealthCategoryId, React.ComponentType<{ className?: string }>> = {
  missing_demographics: Users,
  unsigned_notes: FileWarning,
  unpaid_invoices: Banknote,
  orphan_records: Database,
  unverified_backup: HardDrive,
};

const RECYCLE_ITEM_TYPE_LABELS: Record<
  RecycleBinItemType,
  { ar: string; en: string; ckb: string; badgeClass: string }
> = {
  appointment: {
    ar: 'موعد',
    en: 'Appointment',
    ckb: 'نۆرە',
    badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  },
  waiting_list: {
    ar: 'قائمة انتظار',
    en: 'Waiting List',
    ckb: 'لیستی چاوەڕوانی',
    badgeClass: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
  },
  expense: {
    ar: 'مصروف',
    en: 'Expense',
    ckb: 'خەرجی',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  },
};

const DATA_HEALTH_CATEGORY_CKB: Record<
  DataHealthCategoryId,
  { title: string; description: string; fixLabel: string }
> = {
  missing_demographics: {
    title: 'داتای کەمی نەخۆش',
    description: 'دۆسیەی نەخۆشە چالاکەکان کە ژمارەی مۆبایل یان تەمەنیان تێدا نییە',
    fixLabel: 'تەواوکردنی داتای نەخۆش',
  },
  unsigned_notes: {
    title: 'تێبینیی دانیشتنە واژۆنەکراوەکان',
    description: 'ڕەشنووسی دانیشتنەکان کە هێشتا پەسەند و واژۆ نەکراون',
    fixLabel: 'پێداچوونەوە و واژۆکردنی دانیشتنەکان',
  },
  unpaid_invoices: {
    title: 'پسوڵە پارەنەدراوەکان / قەرزەکان',
    description: 'پسوڵە کراوەکان کە بڕی پارەی ماوەیان لەسەرە',
    fixLabel: 'کردنەوەی تۆماری دارایی',
  },
  orphan_records: {
    title: 'تۆمارە دابڕاوەکانی بنکەدراوە',
    description: 'تۆمارە کلینیکی یان کارگێڕییەکان کە دۆسیەی باوکیان نەماوە',
    fixLabel: 'چاککردنی تۆمارە دابڕاوەکان',
  },
  unverified_backup: {
    title: 'پاشەکەوت و تاقیکردنەوەی گەڕاندنەوە',
    description: 'بارودۆخی پاشەکەوتی شفرەکراو و تاقیکردنەوەی خولی گەڕاندنەوە',
    fixLabel: 'کردنەوەی پاشەکەوت و گەڕاندنەوە',
  },
};

function getCategoryToneClasses(severity: DataHealthCategoryItem['severity']): {
  card: string;
  pill: string;
  icon: string;
} {
  if (severity === 'critical') {
    return {
      card: 'border-rose-500/35 bg-rose-500/5',
      pill: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35',
      icon: 'text-rose-700 dark:text-rose-400',
    };
  }
  if (severity === 'warning') {
    return {
      card: 'border-amber-500/35 bg-amber-500/5',
      pill: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35',
      icon: 'text-amber-700 dark:text-amber-400',
    };
  }
  return {
    card: 'border-line-2 bg-surface',
    pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    icon: 'text-emerald-700 dark:text-emerald-400',
  };
}

export const DataHealthAndTrashPanel: React.FC<DataHealthAndTrashPanelProps> = ({
  patients,
  draftSessions,
  onOpenPatientSession,
  onOpenBilling,
  onOpenBackup,
}) => {
  const { isRtl, bi } = useLanguage();
  const { dek, isRecoveryDrillDue } = useVault();

  const [opsVersion, setOpsVersion] = useState(0);
  const [manualScanTick, setManualScanTick] = useState(0);
  const [orphanRecords, setOrphanRecords] = useState<OrphanRecordItem[]>([]);
  const [scanningOrphans, setScanningOrphans] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [reassignTargets, setReassignTargets] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    const bump = () => setOpsVersion((v) => v + 1);
    const unsub = ClinicOperationsService.subscribe(bump);
    window.addEventListener('physiorecord-modules-updated', bump);
    return () => {
      unsub();
      window.removeEventListener('physiorecord-modules-updated', bump);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setScanningOrphans(true);
    void scanDatabaseOrphanRecords()
      .then((rows) => {
        if (!cancelled) {
          setOrphanRecords(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOrphanRecords([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setScanningOrphans(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [opsVersion, patients.length, manualScanTick]);

  const dataHealthEnabled = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.isDataHealthScreenEnabled();
  }, [opsVersion]);

  const trashEnabled = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.isTrashRecycleBinEnabled();
  }, [opsVersion]);

  const recycleBinItems: RecycleBinEntry[] = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.getRecycleBinItems();
  }, [opsVersion]);

  const backupMeta = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.getBackupMeta();
  }, [opsVersion]);

  const invoices = useMemo(() => {
    void opsVersion;
    return ClinicOperationsService.getInvoicesIQD();
  }, [opsVersion]);

  const reassignablePatients = useMemo(() => {
    const active = patients.filter((p) => p.isArchived !== 1 && !p.data.isDemo);
    return active.length > 0 ? active : patients;
  }, [patients]);

  const defaultTargetPatientId = reassignablePatients[0]?.id;

  const draftSessionEntries = useMemo(
    () =>
      draftSessions.map((session) => {
        const patient = patients.find((p) => p.id === session.patientId);
        return {
          session,
          patientNameAr: patient?.data.fullNameAr || patient?.data.fullName,
          patientNameEn: patient?.data.fullName || patient?.data.fullNameAr,
        };
      }),
    [draftSessions, patients]
  );

  const report: ClinicDataHealthReport = useMemo(
    () =>
      computeClinicDataHealthReport({
        patients,
        draftSessions: draftSessionEntries,
        invoices,
        orphanRecords,
        backupMeta,
        recoveryDrillDue: isRecoveryDrillDue,
      }),
    [patients, draftSessionEntries, invoices, orphanRecords, backupMeta, isRecoveryDrillDue]
  );

  const healthScore = useMemo(() => {
    if (report.totalIssues === 0) return 100;
    let score = 100;
    for (const cat of report.categories) {
      if (cat.count <= 0) continue;
      const basePenalty = cat.severity === 'critical' ? 15 : 10;
      const extraPenalty = Math.min(10, (cat.count - 1) * 2);
      score -= basePenalty + extraPenalty;
    }
    return Math.max(0, Math.min(100, score));
  }, [report]);

  const handleRescan = useCallback(() => {
    setFeedback(null);
    setManualScanTick((t) => t + 1);
  }, []);

  const handleResolveSingleOrphan = useCallback(
    async (item: DataHealthIssueDetail) => {
      const matchedOrphan = item.orphan;
      if (!matchedOrphan) return;
      setBusyActionId(item.id);
      setFeedback(null);
      try {
        if (!matchedOrphan.isClinicalRecord) {
          await resolveOrphanRecord({
            orphan: matchedOrphan,
            action: 'delete_non_clinical',
            dek: dek ?? undefined,
          });
          setFeedback({
            kind: 'success',
            text: bi(
              'تم حذف السجل غير السريري المعزول بنجاح.',
              'Removed orphaned non-clinical record.',
              'تۆمارە دابڕاوە ناکلینیکییەکە بە سەرکەوتوویی سڕدرایەوە.'
            ),
          });
        } else if (
          matchedOrphan.missingParentType === 'patient' &&
          (reassignTargets[item.id] || defaultTargetPatientId) &&
          dek
        ) {
          const targetId = reassignTargets[item.id] || defaultTargetPatientId;
          await resolveOrphanRecord({
            orphan: matchedOrphan,
            action: 'reassign_patient',
            targetPatientId: targetId,
            dek,
          });
          setFeedback({
            kind: 'success',
            text: bi(
              'تمت إعادة ربط السجل السريري بالمريض المحدد وتحديث التشفير.',
              'Clinical record reassigned and re-encrypted under selected patient.',
              'تۆمارە کلینیکییەکە بە نەخۆشە دیاریکراوەکەوە بەسترایەوە و شفرەکەی نوێکرایەوە.'
            ),
          });
        } else {
          setFeedback({
            kind: 'error',
            text: bi(
              'السجل السريري محمي من الحذف؛ يرجى استعادة الارتباط من النسخة الاحتياطية المشفرة أو توفر ملف مريض هدف.',
              'Clinical orphans cannot be deleted; restore from encrypted backup or ensure a target patient exists.',
              'تۆماری کلینیکی لە سڕینەوە پارێزراوە؛ تکایە پەیوەندییەکە لە پاشەکەوتی شفرەکراو بگەڕێنەوە یان دۆسیەی نەخۆشێکی ئامانج دیاری بکە.'
            ),
          });
          return;
        }
        setManualScanTick((t) => t + 1);
      } catch (err) {
        setFeedback({
          kind: 'error',
          text:
            err instanceof Error
              ? err.message
              : bi(
                  'تعذرت معالجة السجل المعزول.',
                  'Failed to resolve orphan record.',
                  'چارەسەرکردنی تۆمارە دابڕاوەکە سەرکەوتوو نەبوو.'
                ),
        });
      } finally {
        setBusyActionId(null);
      }
    },
    [bi, dek, defaultTargetPatientId, reassignTargets]
  );

  const handleCategoryFix = useCallback(
    async (cat: DataHealthCategoryItem) => {
      setFeedback(null);
      if (cat.id === 'missing_demographics') {
        const firstPatientId = cat.items[0]?.patientId;
        const patient = patients.find((p) => p.id === firstPatientId);
        if (patient) onOpenPatientSession(patient);
        return;
      }

      if (cat.id === 'unsigned_notes') {
        const firstItem = cat.items[0];
        const patient = patients.find((p) => p.id === firstItem?.patientId);
        if (patient) onOpenPatientSession(patient, firstItem?.sessionId);
        return;
      }

      if (cat.id === 'unpaid_invoices') {
        onOpenBilling();
        return;
      }

      if (cat.id === 'unverified_backup') {
        onOpenBackup();
        return;
      }

      if (cat.id === 'orphan_records') {
        setBusyActionId('cat_orphan_records');
        try {
          const nonClinical = cat.items
            .map((it) => it.orphan)
            .filter((o): o is OrphanRecordItem => Boolean(o && !o.isClinicalRecord));

          if (nonClinical.length > 0) {
            for (const orphan of nonClinical) {
              await resolveOrphanRecord({
                orphan,
                action: 'delete_non_clinical',
                dek: dek ?? undefined,
              });
            }
            setFeedback({
              kind: 'success',
              text: `${bi('تم تنظيف', 'Cleaned', 'پاککرایەوە:')} ${nonClinical.length} ${bi(
                'سجل غير سريري معزول.',
                'non-clinical orphan record(s).',
                'تۆماری دابڕاوی ناکلینیکی.'
              )}`,
            });
          } else {
            setFeedback({
              kind: 'success',
              text: bi(
                'تم تحديث الفحص. السجلات السريرية المعزولة تتطلب إعادة ربط فردية لحمايتها من الحذف.',
                'Scan refreshed. Clinical orphan records require individual reassignment or backup restoration.',
                'پشکنین نوێکرایەوە. تۆمارە کلینیکییە دابڕاوەکان پێویستیان بە بەستنەوەی تاکەکەسی هەیە بۆ پاراستنیان لە سڕینەوە.'
              ),
            });
          }
          setManualScanTick((t) => t + 1);
        } catch (err) {
          setFeedback({
            kind: 'error',
            text:
              err instanceof Error
                ? err.message
                : bi(
                    'تعذر تنظيف السجلات المعزولة.',
                    'Failed to clean orphan records.',
                    'پاککردنەوەی تۆمارە دابڕاوەکان سەرکەوتوو نەبوو.'
                  ),
          });
        } finally {
          setBusyActionId(null);
        }
      }
    },
    [bi, dek, onOpenBackup, onOpenBilling, onOpenPatientSession, patients]
  );

  const handleRestoreTrashItem = useCallback(
    (item: RecycleBinEntry) => {
      const res = ClinicOperationsService.restoreRecycleBinItem(item.id);
      if (res.restored) {
        setFeedback({
          kind: 'success',
          text: `${bi('تمت استعادة', 'Restored', 'گەڕێندرایەوە:')} "${bi(
            item.titleAr || item.titleEn,
            item.titleEn || item.titleAr
          )}" ${bi('بنجاح.', 'successfully.', 'بە سەرکەوتوویی.')}`,
        });
      }
    },
    [bi]
  );

  const handlePurgeTrashItem = useCallback(
    (item: RecycleBinEntry) => {
      ClinicOperationsService.permanentlyDeleteRecycleBinItem(item.id);
      setFeedback({
        kind: 'success',
        text: `${bi(
          'تم الحذف النهائي للعنصر غير السريري',
          'Permanently purged non-clinical item',
          'بە هەمیشەیی سڕدرایەوە:'
        )} "${bi(item.titleAr || item.titleEn, item.titleEn || item.titleAr)}".`,
      });
    },
    [bi]
  );

  if (!dataHealthEnabled && !trashEnabled) {
    return (
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="p-6 rounded-2xl bg-card border border-card-line text-center text-xs text-muted-foreground-1"
      >
        {bi(
          'تم إيقاف وحدات صحة البيانات وسلة المهملات من إعدادات الأقسام.',
          'Data Health Screen and 30-Day Recycle Bin are currently disabled in Settings > Modules.',
          'بەشەکانی تەندروستیی داتا و سەبەتەی خۆڵ لە ڕێکخستنی بەشەکان ناچالاک کراون.'
        )}
      </div>
    );
  }

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-5">
      {feedback && (
        <div
          role="status"
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
            feedback.kind === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-bold underline cursor-pointer shrink-0 min-h-[32px] px-2"
          >
            {bi('إغلاق', 'Dismiss', 'داخستن')}
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* SECTION A: DATA HEALTH SCREEN & ORPHAN SCANNER (PHASE D4)        */}
      {/* ================================================================ */}
      {dataHealthEnabled && (
        <section
          data-testid="data-health-screen-panel"
          className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line space-y-4 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-divider pb-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Activity className="size-4 text-primary shrink-0" />
                <h2 className="text-sm font-extrabold text-foreground">
                  {bi(
                    'شاشة صحة البيانات وسلامة السجلات',
                    'Clinic Data Health & Integrity Screen',
                    'پەڕەی تەندروستیی داتا و دروستیی تۆمارەکان'
                  )}
                </h2>
                <span
                  data-testid="data-health-score-badge"
                  className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${
                    healthScore >= 90
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                      : healthScore >= 70
                      ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35'
                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35'
                  }`}
                >
                  <Num value={healthScore} suffix="%" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground-1">
                {bi(
                  'تدقيق محلي فوري للبيانات الديموغرافية، الملاحظات غير المعتمدة، الفواتير، السجلات المعزولة والنسخ الاحتياطي.',
                  'Offline integrity audit across demographics, draft notes, unpaid invoices, database orphans & verified backups.',
                  'وردبینیی ناوخۆیی خێرا بۆ داتای کەسایەتی، تێبینییە واژۆنەکراوەکان، پسوڵەکان، تۆمارە دابڕاوەکان و پاشەکەوتی پارێزراو.'
                )}
              </p>
            </div>

            <button
              type="button"
              data-testid="rescan-data-health-btn"
              onClick={handleRescan}
              disabled={scanningOrphans}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${scanningOrphans ? 'animate-spin' : ''}`} />
              <span>
                {bi(
                  'إعادة فحص السجلات المعزولة',
                  'Rescan Orphan Records',
                  'پشکنینەوەی تۆمارە دابڕاوەکان'
                )}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {report.categories.map((cat) => {
              const Icon = CATEGORY_ICON_MAP[cat.id];
              const tone = getCategoryToneClasses(cat.severity);
              const isExpanded = Boolean(expandedCategories[cat.id]);
              const visibleItems = isExpanded ? cat.items : cat.items.slice(0, 5);

              return (
                <div
                  key={cat.id}
                  data-testid={`data-health-card-${cat.id}`}
                  className={`p-3.5 rounded-xl border space-y-3 flex flex-col justify-between ${tone.card}`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2 min-w-0">
                        <Icon className={`size-4 mt-0.5 shrink-0 ${tone.icon}`} />
                        <div className="min-w-0">
                          <h3 className="text-xs font-extrabold text-foreground">
                            {bi(
                              cat.titleAr,
                              cat.titleEn,
                              DATA_HEALTH_CATEGORY_CKB[cat.id]?.title
                            )}
                          </h3>
                          <p className="text-xs text-muted-foreground-1 mt-0.5">
                            {bi(
                              cat.descriptionAr,
                              cat.descriptionEn,
                              DATA_HEALTH_CATEGORY_CKB[cat.id]?.description
                            )}
                          </p>
                        </div>
                      </div>

                      <span
                        data-testid={`data-health-count-${cat.id}`}
                        className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border shrink-0 ${tone.pill}`}
                      >
                        <Num value={cat.count} />
                      </span>
                    </div>

                    {cat.count === 0 ? (
                      <div className="p-2.5 rounded-lg bg-card/70 border border-line-2 text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 shrink-0" />
                        <span>
                          {bi(
                            'لا توجد ملاحظات أو مشاكل في هذه الفئة.',
                            'All clear — zero issues detected.',
                            'هیچ تێبینی یان کێشەیەک لەم پۆلەدا نییە.'
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {visibleItems.map((item) => {
                          const itemPatient = item.patientId
                            ? patients.find((p) => p.id === item.patientId)
                            : undefined;
                          const orphan = item.orphan;
                          const canReassign =
                            Boolean(orphan) &&
                            orphan?.missingParentType === 'patient' &&
                            reassignablePatients.length > 0 &&
                            Boolean(dek);

                          return (
                            <div
                              key={item.id}
                              className="p-2.5 rounded-lg bg-card border border-line-2 text-xs space-y-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-foreground truncate">
                                    {bi(item.labelAr, item.labelEn)}
                                  </p>
                                  {(item.secondaryAr || item.secondaryEn) && (
                                    <p className="text-xs text-muted-foreground-1 truncate">
                                      {bi(
                                        item.secondaryAr || item.secondaryEn || '',
                                        item.secondaryEn || item.secondaryAr || ''
                                      )}
                                    </p>
                                  )}
                                </div>

                                {(cat.id === 'missing_demographics' || cat.id === 'unsigned_notes') &&
                                  itemPatient && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenPatientSession(
                                          itemPatient,
                                          cat.id === 'unsigned_notes' ? item.sessionId : undefined
                                        )
                                      }
                                      className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground cursor-pointer shrink-0"
                                    >
                                      {bi('فتح', 'Open', 'کردنەوە')}
                                    </button>
                                  )}

                                {orphan && (
                                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                    {orphan.isClinicalRecord && (
                                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold">
                                        {bi('سريري محمي', 'Clinical', 'کلینیکیی پارێزراو')}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      data-testid={`resolve-orphan-btn-${item.id}`}
                                      disabled={busyActionId === item.id}
                                      onClick={() => void handleResolveSingleOrphan(item)}
                                      className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-xs font-bold cursor-pointer disabled:opacity-50"
                                    >
                                      {!orphan.isClinicalRecord
                                        ? bi(
                                            'حذف السجل الميت',
                                            'Delete Dead Orphan',
                                            'سڕینەوەی تۆماری دابڕاو'
                                          )
                                        : canReassign
                                        ? bi(
                                            'ربط بالمريض',
                                            'Reassign Patient',
                                            'بەستنەوە بە نەخۆش'
                                          )
                                        : bi(
                                            'يتطلب استعادة',
                                            'Needs Backup',
                                            'پێویستی بە گەڕاندنەوەیە'
                                          )}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {orphan && orphan.isClinicalRecord && canReassign && (
                                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-card-divider">
                                  <label htmlFor={`orphan-reassign-${item.id}`} className="text-xs font-semibold text-muted-foreground-1">
                                    {bi('ربط إلى المريض:', 'Target patient:', 'بەستنەوە بە نەخۆش:')}
                                  </label>
                                  <select
                                    id={`orphan-reassign-${item.id}`}
                                    value={reassignTargets[item.id] || defaultTargetPatientId || ''}
                                    onChange={(e) =>
                                      setReassignTargets((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }))
                                    }
                                    className="flex-1 min-w-[160px] px-2 py-1 rounded-lg bg-surface border border-layer-line text-xs text-foreground"
                                  >
                                    {reassignablePatients.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {bi(
                                          p.data.fullNameAr || p.data.fullName || '',
                                          p.data.fullName || p.data.fullNameAr || '',
                                          p.data.fullNameAr || p.data.fullName || ''
                                        )}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {cat.items.length > 5 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCategories((prev) => ({
                                ...prev,
                                [cat.id]: !isExpanded,
                              }))
                            }
                            className="w-full py-1.5 px-2.5 rounded-lg bg-layer/60 hover:bg-layer-hover border border-layer-line text-xs font-bold text-foreground inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="size-3.5" />
                                <span>{bi('عرض أقل', 'Show Less', 'پیشاندانی کەمتر')}</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="size-3.5" />
                                <span>
                                  {bi('عرض الكل', 'Show All', 'پیشاندانی هەموو')} (<Num value={cat.items.length} />)
                                </span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {cat.count > 0 && (
                    <div className="pt-1 flex justify-end">
                      <button
                        type="button"
                        data-testid={`data-health-fix-btn-${cat.id}`}
                        disabled={busyActionId === `cat_${cat.id}`}
                        onClick={() => void handleCategoryFix(cat)}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <ShieldCheck className="size-3.5" />
                        <span>
                          {bi(
                            cat.fixActionLabelAr,
                            cat.fixActionLabelEn,
                            DATA_HEALTH_CATEGORY_CKB[cat.id]?.fixLabel
                          )}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* SECTION B: 30-DAY NON-CLINICAL RECYCLE BIN (PHASE D3)            */}
      {/* ================================================================ */}
      {trashEnabled && (
        <section
          data-testid="recycle-bin-panel"
          className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line space-y-4 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-divider pb-3">
            <div className="flex items-center gap-2">
              <Trash2 className="size-4 text-primary shrink-0" />
              <h2 className="text-sm font-extrabold text-foreground">
                {bi(
                  'سلة المهملات التشغيلية (احتفاظ 30 يوماً)',
                  '30-Day Non-Clinical Recycle Bin',
                  'سەبەتەی خۆڵی کارگێڕی (پاراستن بۆ ٣٠ ڕۆژ)'
                )}
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-surface border border-line-2 text-xs font-bold text-foreground">
              <Num value={recycleBinItems.length} /> {bi('عنصر', 'items', 'بڕگە')}
            </span>
          </div>

          {/* Clinical Immutability Protection Notice */}
          <div
            data-testid="recycle-bin-clinical-immutability-notice"
            className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200"
          >
            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-extrabold">
                {bi(
                  'حماية عدم قابلية تعديل السجلات السريرية المعتمدة',
                  'Clinical Immutability Guarantee — Clinical Records Never Enter Trash',
                  'پاراستنی نەگۆڕاویی تۆمارە کلینیکییە پەسەندکراوەکان'
                )}
              </p>
              <p className="leading-relaxed">
                {bi(
                  'السجلات السريرية المعتمدة (ملاحظات SOAP، الجلسات العلاجية، وحلقات الرعاية) غير قابلة للتعديل أو النقل إلى سلة المهملات أو الحذف نهائياً؛ وتقتصر السلة لمدة 30 يوماً على العناصر التشغيلية غير السريرية فقط (المواعيد، قائمة الانتظار، والمصاريف).',
                  'Finalized clinical records (SOAP notes, treatment sessions, and episodes) are strictly immutable and can never be moved to trash or deleted; this 30-day recycle bin holds non-clinical operational items only (appointments, waiting-list entries, and expenses).',
                  'تۆمارە کلینیکییە پەسەندکراوەکان (تێبینییەکانی SOAP، دانیشتنە چارەسەرییەکان و ئەڵقەکانی چاودێری) ناگۆڕدرێن و هەرگیز ناچنە سەبەتەی خۆڵ یان بسڕدرێنەوە؛ ئەم سەبەتەی ٣٠ ڕۆژییە تەنها بۆ بڕگە کارگێڕییە ناکلینیکییەکانە (نۆرەکان، لیستی چاوەڕوانی و خەرجییەکان).'
                )}
              </p>
            </div>
          </div>

          {recycleBinItems.length === 0 ? (
            <div className="p-6 rounded-xl bg-surface border border-line-2 text-center space-y-1.5">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <p className="text-xs font-bold text-foreground">
                {bi(
                  'سلة المهملات غير السريرية فارغة',
                  'Non-clinical recycle bin is empty',
                  'سەبەتەی خۆڵی ناکلینیکی بەتاڵە'
                )}
              </p>
              <p className="text-xs text-muted-foreground-1">
                {bi(
                  'عند حذف موعد أو عنصر انتظار أو مصروف، سيُحفظ هنا لمدة 30 يوماً قبل الحذف التلقائي.',
                  'Deleted appointments, waiting-list entries, or expenses appear here for 30 days so you can restore them anytime.',
                  'کاتێک نۆرە، بڕگەی چاوەڕوانی یان خەرجییەک دەسڕیتەوە، بۆ ماوەی ٣٠ ڕۆژ لێرە هەڵدەگیرێت تا بتوانیت هەر کاتێک بتەوێت بیگەڕێنیتەوە.'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recycleBinItems.map((item) => {
                const typeMeta = RECYCLE_ITEM_TYPE_LABELS[item.itemType];
                const daysLeft = getRemainingRecycleDays(item);

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-surface border border-line-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md border text-xs font-bold ${typeMeta.badgeClass}`}
                        >
                          {bi(typeMeta.ar, typeMeta.en, typeMeta.ckb)}
                        </span>
                        <span className="font-extrabold text-foreground">
                          {bi(item.titleAr || item.titleEn, item.titleEn || item.titleAr)}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-layer border border-layer-line text-xs font-semibold text-muted-foreground-1">
                          <Num value={daysLeft} /> {bi('يوم متبقي', 'days left', 'ڕۆژ ماوە')}
                        </span>
                      </div>
                      {(item.subtitleAr || item.subtitleEn) && (
                        <p className="text-xs text-muted-foreground-1">
                          {bi(
                            item.subtitleAr || item.subtitleEn || '',
                            item.subtitleEn || item.subtitleAr || ''
                          )}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        data-testid={`recycle-bin-restore-btn-${item.id}`}
                        onClick={() => handleRestoreTrashItem(item)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="size-3.5" />
                        <span>{bi('استعادة', 'Restore', 'گەڕاندنەوە')}</span>
                      </button>
                      <button
                        type="button"
                        data-testid={`recycle-bin-purge-btn-${item.id}`}
                        onClick={() => handlePurgeTrashItem(item)}
                        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                        <span>{bi('حذف نهائي', 'Purge Permanently', 'سڕینەوەی هەمیشەیی')}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default DataHealthAndTrashPanel;
