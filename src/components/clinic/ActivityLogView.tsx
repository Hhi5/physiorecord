// =======================================================================
// PhysioRecord — Activity Log & Staff Labels (Governance & Audit)
// Local-First Activity Trail & Transparent Staff Attribution
// =======================================================================

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import {
  ClinicOperationsService,
  ROLE_PERMISSIONS,
} from '../../services/clinicOperationsService';
import { formatClinicalDate } from '../../utils/date';
import type {
  ClinicStaffMember,
  AuditLogEntry,
  AuditChainVerificationResult,
  DailyAuditDigest,
} from '../../types/clinicManagement';
import { localDate } from '../../utils/date';
import {
  UserCheck,
  FileText,
  CheckCircle2,
  Database,
  ShieldAlert,
  ShieldCheck,
  Info,
  KeyRound,
  Download,
  Printer,
  RefreshCw,
} from 'lucide-react';

interface ActivityLogViewProps {
  onRoleChanged?: (staff: ClinicStaffMember) => void;
}

const ROLE_LABEL_CKB: Record<string, string> = {
  admin: 'بەڕێوەبەر / خاوەنی کلینیک',
  lead_therapist: 'چارەسەرکاری سەرەکی',
  therapist: 'چارەسەرکاری فیزیایی',
  assistant_therapist: 'یاریدەدەری چارەسەرکار',
  reception: 'پێشوازی و ڕێکخستن',
  trainee: 'مەشقپێکراو',
};

export const ActivityLogView: React.FC<ActivityLogViewProps> = ({ onRoleChanged }) => {
  const { language, isRtl, bi } = useLanguage();
  const { persistenceGranted } = useVault();

  const [staffRoster, setStaffRoster] = useState<ClinicStaffMember[]>(() =>
    ClinicOperationsService.getStaffRoster()
  );
  const [activeStaff, setActiveStaff] = useState<ClinicStaffMember>(
    ClinicOperationsService.getActiveStaff()
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(
    ClinicOperationsService.getAuditLogs()
  );
  const [pendingAdminStaffId, setPendingAdminStaffId] = useState<string | null>(null);
  const [pinAttempt, setPinAttempt] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinChecking, setPinChecking] = useState(false);

  const [chainVerification, setChainVerification] =
    useState<AuditChainVerificationResult | null>(null);
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [dailyDigest, setDailyDigest] = useState<DailyAuditDigest | null>(null);
  const [buildingDigest, setBuildingDigest] = useState(false);

  useEffect(() => {
    const syncState = () => {
      setStaffRoster(ClinicOperationsService.getStaffRoster());
      setActiveStaff(ClinicOperationsService.getActiveStaff());
      setAuditLogs(ClinicOperationsService.getAuditLogs());
    };
    void ClinicOperationsService.ensureColdStoreLoadedAsync('auditLogs');
    const unsubscribe = ClinicOperationsService.subscribe(syncState);
    window.addEventListener('physiorecord-staff-updated', syncState);
    return () => {
      unsubscribe();
      window.removeEventListener('physiorecord-staff-updated', syncState);
    };
  }, []);

  const handleSelectStaff = (staffId: string) => {
    const target = staffRoster.find((s) => s.id === staffId);
    if (target?.role === 'admin' && activeStaff.role !== 'admin') {
      setPendingAdminStaffId(staffId);
      setPinAttempt('');
      setPinError(null);
      return;
    }
    const updated = ClinicOperationsService.setActiveStaff(staffId);
    setActiveStaff(updated);
    setAuditLogs(ClinicOperationsService.getAuditLogs());
    if (onRoleChanged) onRoleChanged(updated);
  };

  const handleConfirmAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAdminStaffId || pinChecking) return;
    setPinChecking(true);
    setPinError(null);
    try {
      const res = await ClinicOperationsService.verifyAdminPinAsync(pinAttempt);
      if (!res.ok) {
        if (res.requiresSetup) {
          setPinError(
            bi(
              'يجب تعيين رمز PIN خاص بالمدير أولاً من الإعدادات.',
              'An Admin PIN must be configured first in Settings.',
              'دەبێت سەرەتا کۆدی نهێنی PIN ـی بەڕێوەبەر لە ڕێکخستنەکان دابنرێت.'
            )
          );
        } else if (res.rateLimited) {
          setPinError(
            bi(
              `تم حظر المحاولات مؤقتاً. انتظر ${res.remainingSeconds || 5} ثانية.`,
              `Too many failed attempts. Wait ${res.remainingSeconds || 5}s.`,
              `هەوڵەکان بە شێوەیەکی کاتی بلۆککران. ${res.remainingSeconds || 5} چرکە چاوەڕێ بکە.`
            )
          );
        } else {
          setPinError(
            bi(
              'رمز PIN للمدير غير صحيح.',
              'Incorrect Staff Admin PIN.',
              'کۆدی PIN ـی بەڕێوەبەر هەڵەیە.'
            )
          );
        }
        return;
      }
      const updated = ClinicOperationsService.setActiveStaff(pendingAdminStaffId);
      setActiveStaff(updated);
      setAuditLogs(ClinicOperationsService.getAuditLogs());
      if (onRoleChanged) onRoleChanged(updated);
      setPendingAdminStaffId(null);
      setPinAttempt('');
      setPinError(null);
    } finally {
      setPinChecking(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifyingChain(true);
    try {
      const result = await ClinicOperationsService.verifyAuditChain();
      setChainVerification(result);
    } finally {
      setVerifyingChain(false);
    }
  };

  const handleGenerateDailyDigest = async () => {
    setBuildingDigest(true);
    try {
      const digest = await ClinicOperationsService.buildDailyAuditDigestAsync(localDate());
      setDailyDigest(digest);
    } finally {
      setBuildingDigest(false);
    }
  };

  const handleDownloadDigestJson = () => {
    if (!dailyDigest) return;
    const blob = new Blob([JSON.stringify(dailyDigest, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `physiorecord_audit_digest_${dailyDigest.dateKey}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const perms = ROLE_PERMISSIONS[activeStaff.role];

  return (
    <div
      className="max-w-[85rem] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Page Header: Title + 1 Status Chip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold text-foreground">
          {bi('سجل النشاط والكادر', 'Audit & Staff Roles', 'تۆماری چالاکی و ستاف')}
        </h1>

        {/* Persistence Status Badge */}
        <div className="inline-flex items-center gap-2 py-2 px-3 rounded-xl border border-layer-line text-xs font-semibold bg-layer shadow-2xs">
          <Database className="size-4 text-primary" />
          <span className="text-muted-foreground-1">
            {bi('حالة التخزين المحلي:', 'Local Storage:', 'دۆخی هەڵگرتنی ناوخۆیی:')}
          </span>
          <span className={persistenceGranted ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-amber-800 dark:text-amber-400 font-bold'}>
            {persistenceGranted
              ? bi('تخزين دائم ومثبت', 'Persistent Storage', 'هەڵگرتنی هەمیشەیی جێگیر')
              : bi('تخزين قياسي', 'Best-Effort', 'هەڵگرتنی ستاندارد')}
          </span>
        </div>
      </div>

      {/* Security & Data Responsibility Notice (Collapsible to preserve fold ergonomics) */}
      <details className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 text-amber-950 dark:text-amber-200 shadow-2xs">
        <summary className="min-h-[40px] flex items-center gap-2.5 text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-100 cursor-pointer select-none">
          <ShieldAlert className="size-4 text-amber-700 dark:text-amber-400 shrink-0" />
          <span>
            {bi(
              'إشعار المسؤولية وأمان البيانات السريرية (تخزين محلي بالكامل)',
              'Clinical Security & Data Responsibility Notice (100% Local)',
              'ئاگادارکردنەوەی بەرپرسیارێتی و ئاسایشی داتای کلینیکی (١٠٠٪ ناوخۆیی)'
            )}
          </span>
        </summary>
        <p className="mt-2 pt-2 border-t border-amber-500/20 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
          {bi(
            'يعمل PhysioRecord بنظام محلي كامل داخل متصفح هذا الجهاز. لا تخرج أي بيانات أو تشخيصات أو سجلات مرضى إلى خوادم سحابية. لا توجد أي نسخة احتياطية سحابية تلقائية، وفقدان كلمة مرور الخزينة ومفتاح الاسترداد يعني فقدان البيانات نهائياً وبشكل غير قابل للاسترجاع. تقع مسؤولية تصدير وحفظ النسخ الاحتياطية الدورية بصيغة (.ptbackup) على عاتق المعالج والعيادة بالكامل.',
            'PhysioRecord runs entirely client-side in this device’s browser (Local-First). No patient data, diagnoses, or records leave this device or touch cloud servers. No automatic cloud backup exists; losing both your vault password and recovery key results in permanent, irreversible data loss. Taking routine encrypted exports (.ptbackup) and keeping them secure is strictly the clinician’s and clinic’s responsibility.',
            'بەرنامەی PhysioRecord بە تەواوی بە شێوەی ناوخۆیی لەناو وێبگەڕی ئەم ئامێرەدا کار دەکات. هیچ داتا، دەستنیشانکردن یان تۆمارێکی نەخۆش ناچێتە سەر ڕاژە هەورییەکان. هیچ پاشەکەوتێکی خۆکاری هەوری بوونی نییە، و لەدەستدانی وشەی تێپەڕی قاسە و کلیلی گەڕاندنەوە دەبێتە هۆی لەدەستچوونی هەمیشەیی داتاکان. هەناردەکردن و پاراستنی پاشەکەوتی شفرەکراو (.ptbackup) بەرپرسیارێتی تەواوی چارەسەرکار و کلینیکە.'
          )}
        </p>
      </details>

      {/* Staff Label Clarification Notice */}
      <div className="p-4 bg-card border border-card-line rounded-2xl text-xs text-muted-foreground-1 flex items-start gap-3 shadow-2xs">
        <Info className="size-4 text-primary shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          {bi(
            'تنبيه الشفافية المعمارية: في التطبيقات المحلية الخالية من خادم وسيط، تعمل تصنيفات الكادر لأغراض التوثيق الإداري والسريري ونسب السجلات لأصحابها. يمكن لأي شخص يملك وصولاً فعلياً لهذا الجهاز تبديل هوية الكادر بحرية.',
            'Architectural Transparency Notice: In local-only browser apps without a central auth server, staff labels serve clinical and administrative attribution. Anyone with physical access to this unlocked device can switch identities.',
            'ئاگادارکردنەوەی ڕوونیی سیستەم: لە بەرنامە ناوخۆییەکانی بێ ڕاژەی ناوەندیدا، پۆلێنەکانی ستاف بۆ دەستنیشانکردنی کارگێڕی و کلینیکی بەکاردێن. هەر کەسێک دەستگەیشتنی فیزیکی بەم ئامێرە کراوەیە هەبێت دەتوانێت بە ئازادی ناسنامەی ستاف بگۆڕێت.'
          )}
        </p>
      </div>

      {/* Staff Label Switcher Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {staffRoster.map((staff) => {
          const isCurrent = activeStaff.id === staff.id;
          const rolePerm = ROLE_PERMISSIONS[staff.role];
          return (
            <button
              key={staff.id}
              type="button"
              onClick={() => handleSelectStaff(staff.id)}
              className={`text-start p-5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
                isCurrent
                  ? 'bg-primary/10 border-primary ring-2 ring-primary/20 shadow-xs'
                  : 'bg-card border-card-line hover:border-primary/40 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="py-0.5 px-2.5 rounded-full text-xs font-semibold bg-primary/15 text-primary">
                  {bi(rolePerm.labelAr, rolePerm.labelEn, ROLE_LABEL_CKB[staff.role])}
                </span>
                {isCurrent && (
                  <UserCheck className="size-4 text-primary" />
                )}
              </div>
              <h2 className="text-sm font-bold text-foreground">
                {bi(staff.nameAr, staff.nameEn)}
              </h2>
              <p className="text-xs text-muted-foreground-1">
                {bi(staff.specialtyAr, staff.specialtyEn)}
              </p>
            </button>
          );
        })}
      </div>

      {/* Active Role Intended Clinical Responsibilities */}
      <div className="bg-card p-5 sm:p-6 rounded-2xl border border-card-line shadow-2xs space-y-4">
        <h2 className="text-xs font-bold text-foreground">
          {`${bi(
            'المهام السريرية والإدارية المخصصة لهذا التصنيف',
            'Designated Clinical & Operational Tasks',
            'ئەرکە کلینیکی و کارگێڕییە دیاریکراوەکان'
          )} (${bi(perms.labelAr, perms.labelEn, ROLE_LABEL_CKB[activeStaff.role])}):`}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {[
            {
              ok: perms.canEditClinicalCharts,
              ar: 'توثيق السجلات والتقييمات السريرية والتمارين',
              en: 'Clinical Assessments & Flowsheets Documentation',
              ckb: 'تۆمارکردنی دۆسیە کلینیکییەکان، هەڵسەنگاندن و ڕاهێنانەکان',
            },
            {
              ok: perms.canFinalizeAndLockNotes,
              ar: 'اعتماد الملاحظات مع فحوصات النزاهة (SHA-256 — ليس توقيعاً إلكترونياً قانونياً)',
              en: 'Finalize Notes with Integrity Checks (SHA-256 — not a legal electronic signature)',
              ckb: 'پەسەندکردنی تێبینییەکان بە پشکنینی دروستی (SHA-256 — واژۆی یاسایی نییە)',
            },
            {
              ok: perms.canManageAppointments,
              ar: 'جدولة المواعيد وتنظيم قائمة الانتظار',
              en: 'Appointment Scheduling & Waitlist',
              ckb: 'خشتەکردنی نۆرەکان و ڕێکخستنی لیستی چاوەڕوانی',
            },
            {
              ok: perms.canCollectPaymentsIQD,
              ar: 'إصدار وصولات القبض واستلام النقد (IQD)',
              en: 'Issue Receipts & Collect IQD Cash',
              ckb: 'دەرکردنی پسوڵە و وەرگرتنی پارەی نەقد (IQD)',
            },
            {
              ok: perms.canDeleteFinancialRecords,
              ar: 'إدارة وتدقيق السجلات المالية والمصاريف',
              en: 'Financial Ledger & Expense Management',
              ckb: 'بەڕێوەبردن و وردبینی تۆمارە دارایی و خەرجییەکان',
            },
            {
              ok: perms.canViewAuditLogs,
              ar: 'الاطلاع على سجل النشاط والعمليات الموثقة',
              en: 'Inspect Local Activity Log',
              ckb: 'پشکنینی تۆماری چالاکی و کارە بەڵگەدارەکان',
            },
          ].map((item, i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl bg-surface border border-line-2 flex items-center gap-2.5"
            >
              <CheckCircle2
                className={`size-4 shrink-0 ${
                  item.ok
                    ? 'text-primary'
                    : 'text-muted-foreground-1/40'
                }`}
              />
              <span
                className={`font-semibold ${
                  item.ok
                    ? 'text-foreground'
                    : 'text-muted-foreground-1 line-through'
                }`}
              >
                {bi(item.ar, item.en, item.ckb)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Enterprise Activity Log Table */}
      <div className="bg-card rounded-2xl border border-card-line shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-card-divider bg-muted/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <FileText className="size-4" />
            </div>
            <h2 className="text-sm font-bold text-foreground">
              {bi(
                'سجل النشاط السريري والإداري',
                'Local Activity Log',
                'تۆماری چالاکیی کلینیکی و کارگێڕی'
              )}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleVerifyChain}
              disabled={verifyingChain}
              className="inline-flex items-center gap-1.5 py-2 px-3 min-h-[36px] rounded-lg bg-surface border border-layer-line text-xs font-semibold text-foreground hover:bg-layer-hover disabled:text-muted-foreground-2 disabled:border-line-2 disabled:cursor-not-allowed cursor-pointer"
            >
              {verifyingChain ? (
                <RefreshCw className="size-3.5 animate-spin text-primary" />
              ) : (
                <ShieldCheck className="size-3.5 text-primary" />
              )}
              <span>{bi('تحقق من السلسلة', 'Verify Chain', 'پشکنینی زنجیرە')}</span>
            </button>

            <button
              type="button"
              onClick={handleGenerateDailyDigest}
              disabled={buildingDigest}
              className="inline-flex items-center gap-1.5 py-2 px-3 min-h-[36px] rounded-lg bg-surface border border-layer-line text-xs font-semibold text-foreground hover:bg-layer-hover disabled:text-muted-foreground-2 disabled:border-line-2 disabled:cursor-not-allowed cursor-pointer"
            >
              <Printer className="size-3.5 text-primary" />
              <span>{bi('ملخص اليوم', 'Daily Digest', 'پوختەی ئەمڕۆ')}</span>
            </button>

            <span className="py-1 px-2.5 rounded-full text-xs font-mono font-semibold bg-surface border border-line-2 text-muted-foreground-1 tabular-nums">
              {auditLogs.length} {bi('عملية مسجلة', 'records', 'تۆمار')}
            </span>
          </div>
        </div>

        {chainVerification && (
          <div
            className={`px-5 py-3 border-b border-card-divider text-xs flex flex-wrap items-center justify-between gap-2 ${
              chainVerification.valid
                ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-500/10 text-rose-800 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {chainVerification.valid ? (
                <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <ShieldAlert className="size-4 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>
                {chainVerification.valid
                  ? bi(
                      `سلسلة تدقيق SHA-256 سليمة: تم التحقق من ${chainVerification.verifiedEntries} سجل متسلسل (${chainVerification.legacyUnchainedEntries} أرشيفي سابق).`,
                      `SHA-256 audit hash chain valid: ${chainVerification.verifiedEntries} chained entries verified (${chainVerification.legacyUnchainedEntries} legacy unchained).`,
                      `زنجیرەی وردبینیی SHA-256 دروستە: ${chainVerification.verifiedEntries} تۆماری زنجیرەدار پشکنرا (${chainVerification.legacyUnchainedEntries} ئەرشیفی پێشوو).`
                    )
                  : bi(
                      `تحذير: فشل التحقق من سلسلة التدقيق عند السجل ${chainVerification.brokenAtEntryId || '-'} (${chainVerification.brokenReason || ''})`,
                      `Audit hash chain failure at ${chainVerification.brokenAtEntryId || '-'}: ${chainVerification.brokenReason || ''}`,
                      `ئاگاداری: پشکنینی زنجیرەی وردبینی لە تۆماری ${chainVerification.brokenAtEntryId || '-'} سەرکەوتوو نەبوو (${chainVerification.brokenReason || ''})`
                    )}
              </span>
            </div>
            {chainVerification.headHash && (
              <span className="font-mono text-xs opacity-80">
                HEAD: {chainVerification.headHash.slice(0, 12)}…
              </span>
            )}
          </div>
        )}

        {dailyDigest && (
          <div className="px-5 py-4 border-b border-card-divider bg-surface/60 text-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-foreground">
                  {`${bi('ملخص التدقيق اليومي', 'Daily Audit Digest', 'پوختەی وردبینیی ڕۆژانە')} (${dailyDigest.dateKey})`}
                </p>
                <p className="text-xs text-muted-foreground-1">
                  {bi(
                    `السجلات: ${dailyDigest.totalEntries} · سلامة السلسلة: ${dailyDigest.chainValid ? 'سليمة' : 'تحتاج مراجعة'} · ليس توقيعاً إلكترونياً قانونياً`,
                    `Entries: ${dailyDigest.totalEntries} · Chain: ${dailyDigest.chainValid ? 'Valid' : 'Failed'} · Integrity check only (not a legal electronic signature)`,
                    `تۆمارەکان: ${dailyDigest.totalEntries} · دروستیی زنجیرە: ${dailyDigest.chainValid ? 'دروستە' : 'پێویستی بە پێداچوونەوەیە'} · تەنها پشکنینی دروستییە (واژۆی یاسایی نییە)`
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadDigestJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-layer border border-layer-line text-xs font-semibold text-foreground hover:bg-layer-hover cursor-pointer"
                >
                  <Download className="size-3.5 text-primary" />
                  <span>{bi('تصدير JSON', 'Export JSON', 'هەناردەکردنی JSON')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-layer border border-layer-line text-xs font-semibold text-foreground hover:bg-layer-hover cursor-pointer"
                >
                  <Printer className="size-3.5 text-primary" />
                  <span>{bi('طباعة', 'Print', 'چاپکردن')}</span>
                </button>
              </div>
            </div>
            <p className="font-mono text-xs text-muted-foreground-1 break-all">
              HEAD SHA-256: {dailyDigest.headHash}
            </p>
          </div>
        )}

        <div
          tabIndex={0}
          aria-label={bi('جدول سجل النشاط', 'Activity log table', 'خشتەی تۆماری چالاکی')}
          className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <table className="min-w-full divide-y divide-card-divider text-start text-xs">
            <thead className="bg-muted/50">
              <tr className="text-muted-foreground-1 font-semibold text-xs">
                <th className="py-3.5 px-4 text-start">{bi('التوقيت', 'Timestamp', 'کات')}</th>
                <th className="py-3.5 px-4 text-start">{bi('الموثق / التصنيف', 'Actor / Label', 'بەکارهێنەر / پلە')}</th>
                <th className="py-3.5 px-4 text-start">{bi('نوع الإجراء', 'Action Type', 'جۆری کار')}</th>
                <th className="py-3.5 px-4 text-start">{bi('تفاصيل النشاط الموثق', 'Activity Summary', 'پوختەی چالاکی')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-divider">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground-1">
                    {bi(
                      'سيتم توثيق كافة العمليات السريرية والمالية هنا تلقائياً.',
                      'All clinical and financial operations are recorded here automatically.',
                      'هەموو کارە کلینیکی و داراییەکان بە شێوەی خۆکار لێرە تۆمار دەکرێن.'
                    )}
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="tabular-nums hover:bg-muted/30 transition-colors">
                    <td className="py-3.5 px-4 text-muted-foreground-1 whitespace-nowrap">
                      {formatClinicalDate(log.timestamp, language, { includeTime: true })}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-foreground whitespace-nowrap">
                      {log.actorName}{' '}
                      <span className="text-xs font-normal text-muted-foreground-1">
                        ({log.actorRole})
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="py-0.5 px-2 rounded-md font-mono text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                        {log.actionType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground-1">
                      {bi(log.summaryAr, log.summaryEn)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pendingAdminStaffId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="activity-log-admin-pin-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setPendingAdminStaffId(null);
            }
          }}
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleConfirmAdminPin}
            className="bg-card border border-card-line rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-2.5 text-sm font-bold text-foreground">
              <KeyRound className="size-4 text-primary shrink-0" />
              <h2 id="activity-log-admin-pin-title">
                {bi('تأكيد رمز المدير السري', 'Enter Staff Admin PIN', 'دڵنیاکردنەوەی کۆدی PIN ـی بەڕێوەبەر')}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground-1 leading-relaxed">
              {bi(
                'أدخل رمز PIN المخصص لمدير العيادة. ملاحظة: تصنيفات الكادر لأغراض النسب الإداري فقط وليست نظام مصادقة مستقلاً.',
                'Enter your configured Clinic Admin PIN. Note: staff roles provide staff attribution only, not independent authentication.',
                'کۆدی نهێنیی PIN ـی بەڕێوەبەری کلینیک بنووسە. تێبینی: پلەکانی ستاف تەنها بۆ دەستنیشانکردنی کارگێڕین، نەک سەلماندنی سەربەخۆ.'
              )}
            </p>
            <input
              type="password"
              autoComplete="current-password"
              inputMode="numeric"
              aria-label={bi('رمز المدير السري PIN', 'Staff Admin PIN', 'کۆدی PIN ـی بەڕێوەبەر')}
              autoFocus
              required
              value={pinAttempt}
              onChange={(e) => {
                setPinAttempt(e.target.value);
                setPinError(null);
              }}
              placeholder="••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-layer-line text-center font-mono text-base font-bold text-foreground focus:outline-none focus:border-primary"
            />
            {pinError && (
              <p className="text-xs text-rose-700 dark:text-rose-400 font-semibold">
                {pinError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingAdminStaffId(null)}
                className="px-3.5 py-2 min-h-[36px] rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground cursor-pointer"
              >
                {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="submit"
                disabled={pinChecking}
                className="px-4 py-2 min-h-[36px] rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed cursor-pointer"
              >
                {pinChecking
                  ? bi('جاري التحقق...', 'Verifying...', 'خەریکی پشکنینە...')
                  : bi('تأكيد التبديل', 'Verify & Switch', 'دڵنیاکردنەوەی گۆڕین')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// Backwards-compatible alias for existing imports
export const AuditAndRbacView = ActivityLogView;
