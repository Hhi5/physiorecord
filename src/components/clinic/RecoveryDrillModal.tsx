// =======================================================================
// PhysioRecord — Phase A4: Quarterly Recovery Drill & Backup Sandbox Test
// 1. Verifies 1 random 4-character Recovery Key group against stored SHA-256
//    salted digests (no full recovery key prompt except legacy one-time backfill).
// 2. Decrypts a selected `.ptbackup` inside an ephemeral isolated sandbox IndexedDB,
//    runs referential integrity & sample decryption checks, discards sandbox, and
//    records a verified timestamp + green badge.
// =======================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileArchive,
} from 'lucide-react';
import { ModalDialog } from '../ui/Dialog';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { db } from '../../db/db';
import {
  verifyRecoveryKeyGroup,
  verifyAndBackfillRecoveryKeyForDrill,
  recordRecoveryDrillSuccess,
} from '../../crypto/vault';
import {
  verifyBackupInSandboxDb,
  type SandboxBackupTestResult,
} from '../../crypto/backup';
import { formatClinicalDate } from '../../utils/date';
import type { VaultMetaEntity } from '../../types/clinical';
import { Num } from '../ui/Primitives';

interface RecoveryDrillModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function pickRandomRecoveryGroupIndex(): number {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 8;
}

export const RecoveryDrillModal: React.FC<RecoveryDrillModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { bi, language } = useLanguage();
  const { refreshRecoveryDrillStatus, lastRecoveryDrillAt } = useVault();

  const [meta, setMeta] = useState<VaultMetaEntity | null>(null);
  const [groupIndex, setGroupIndex] = useState<number>(() => pickRandomRecoveryGroupIndex());
  const [groupInput, setGroupInput] = useState('');
  const [fullLegacyKeyInput, setFullLegacyKeyInput] = useState('');
  const [keyStatus, setKeyStatus] = useState<'idle' | 'verifying' | 'passed' | 'failed'>('idle');

  const [backupFileName, setBackupFileName] = useState('');
  const [backupJsonContent, setBackupJsonContent] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [sandboxStatus, setSandboxStatus] = useState<'idle' | 'running' | 'passed' | 'failed'>(
    'idle'
  );
  const [sandboxProgress, setSandboxProgress] = useState(0);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const [sandboxResult, setSandboxResult] = useState<SandboxBackupTestResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setGroupIndex(pickRandomRecoveryGroupIndex());
    setGroupInput('');
    setFullLegacyKeyInput('');
    setKeyStatus('idle');
    setBackupFileName('');
    setBackupJsonContent('');
    setBackupPassword('');
    setSandboxStatus('idle');
    setSandboxProgress(0);
    setSandboxError(null);
    setSandboxResult(null);
    void db.vaultMeta.get('auth').then((m) => setMeta(m || null));
  }, [isOpen]);

  const hasGroupDigests = useMemo(
    () =>
      Boolean(
        meta?.recoveryKeyGroupSalt &&
          Array.isArray(meta?.recoveryKeyGroupDigests) &&
          meta.recoveryKeyGroupDigests.length === 8
      ),
    [meta]
  );

  const handleVerifyKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meta) return;
    setKeyStatus('verifying');
    try {
      const ok = hasGroupDigests
        ? await verifyRecoveryKeyGroup(meta, groupIndex, groupInput)
        : await verifyAndBackfillRecoveryKeyForDrill(db, fullLegacyKeyInput);
      if (!ok) {
        setKeyStatus('failed');
        return;
      }
      setKeyStatus('passed');
      const latest = await db.vaultMeta.get('auth');
      setMeta(latest || meta);
      if (sandboxStatus === 'passed') {
        await recordRecoveryDrillSuccess(db);
        await refreshRecoveryDrillStatus();
      }
    } catch {
      setKeyStatus('failed');
    }
  };

  const handleSelectBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSandboxError(null);
    setSandboxStatus('idle');
    setSandboxResult(null);
    try {
      const txt = await file.text();
      setBackupFileName(file.name);
      setBackupJsonContent(txt);
    } catch {
      setSandboxError(
        bi(
          'تعذر قراءة ملف النسخة الاحتياطية.',
          'Could not read the selected backup file.',
          'نەتوانرا فایلی پاشەکەوتەکە بخوێندرێتەوە.'
        )
      );
    }
  };

  const handleRunSandboxTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupJsonContent || !backupPassword) return;
    setSandboxStatus('running');
    setSandboxError(null);
    setSandboxProgress(0);
    setSandboxResult(null);
    try {
      const res = await verifyBackupInSandboxDb(backupJsonContent, backupPassword, {
        onProgress: (p) => setSandboxProgress(p),
      });
      await recordRecoveryDrillSuccess(db, res.verifiedAt);
      await refreshRecoveryDrillStatus();
      setSandboxResult(res);
      setSandboxStatus('passed');
    } catch (err) {
      setSandboxStatus('failed');
      setSandboxError(
        err instanceof Error
          ? err.message
          : bi(
              'فشل التحقق من النسخة الاحتياطية (تأكد من كلمة مرور النسخة وسلامة الملف).',
              'Backup verification failed (check backup password and file integrity).',
              'پشکنینی پاشەکەوت سەرکەوتوو نەبوو (تێپەڕەوشە و فایلەکە بپشکنە).'
            )
      );
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="md"
      title={bi(
        'تمرين الاسترداد واختبار النسخة الاحتياطية',
        'Recovery Key & Backup Sandbox Drill',
        'ڕاهێنانی گەڕاندنەوە و تاقیکردنەوەی پاشەکەوت'
      )}
    >
      <div className="p-5 space-y-5 text-xs overflow-y-auto max-h-[80vh]">
        {/* Last Verified Status */}
        <div className="p-3 rounded-xl bg-surface border border-line-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <ShieldCheck className="size-4 text-primary shrink-0" />
            <span>
              {bi(
                'آخر فحص موثّق للاسترداد:',
                'Last Verified Recovery Drill:',
                'دوایین پشکنینی پشتڕاستکراوی گەڕاندنەوە:'
              )}
            </span>
          </div>
          {lastRecoveryDrillAt ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold">
              <CheckCircle2 className="size-3.5" />
              <span>{formatClinicalDate(lastRecoveryDrillAt, language === 'en' ? 'en' : 'ar')}</span>
            </span>
          ) : (
            <span className="text-amber-700 dark:text-amber-300 font-semibold">
              {bi('لم يُجرَ بعد', 'Not verified yet', 'هێشتا ئەنجام نەدراوە')}
            </span>
          )}
        </div>

        {/* Step 1: Spot-Check Random Recovery Key Group */}
        <form
          onSubmit={(e) => void handleVerifyKey(e)}
          className="p-4 rounded-2xl bg-card border border-card-line space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-sm text-foreground">
              <KeyRound className="size-4 text-primary shrink-0" />
              <span>
                {bi(
                  '1. التحقق السريع من مفتاح الاسترداد الطارئ',
                  '1. Recovery Key Spot-Check',
                  '١. پشکنینی خێرای کلیلی گەڕاندنەوەی فریاکەوتن'
                )}
              </span>
            </div>
            {keyStatus === 'passed' && (
              <span className="text-emerald-700 dark:text-emerald-400 font-bold inline-flex items-center gap-1">
                <CheckCircle2 className="size-3.5" />
                {bi('صحيح', 'Matched', 'دروستە')}
              </span>
            )}
          </div>

          {hasGroupDigests ? (
            <div className="space-y-2">
              <label className="block font-semibold text-foreground">
                {bi(
                  `أدخل المجموعة #${groupIndex + 1} فقط (4 أحرف/أرقام) من ورقة مفتاح الاسترداد:`,
                  `Enter only Group #${groupIndex + 1} (4 characters) from your printed Recovery Key:`,
                  `تەنها گرووپی #${groupIndex + 1} (٤ پیت/ژمارە) لە کلیلی گەڕاندنەوەکەت بنووسە:`
                )}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  dir="ltr"
                  maxLength={4}
                  required
                  value={groupInput}
                  onChange={(e) => {
                    setGroupInput(e.target.value.toUpperCase());
                    setKeyStatus('idle');
                  }}
                  placeholder="XXXX"
                  className="w-32 px-3 py-2 rounded-xl bg-surface border border-layer-line text-center font-mono text-sm font-bold tracking-widest uppercase text-foreground"
                />
                <button
                  type="submit"
                  disabled={keyStatus === 'verifying' || groupInput.trim().length < 4}
                  className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-bold cursor-pointer"
                >
                  {bi('تحقق', 'Verify Group', 'پشکنین')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block font-semibold text-foreground">
                {bi(
                  'أدخل مفتاح الاسترداد الكامل مرة واحدة لتفعيل فحص المجموعة الواحدة في التمارين القادمة:',
                  'Enter your full Recovery Key once to enable single-group spot checks in future drills:',
                  'کلیلی گەڕاندنەوەی تەواو یەکجار بنووسە بۆ چالاککردنی پشکنینی تاکە گرووپ:'
                )}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  dir="ltr"
                  required
                  value={fullLegacyKeyInput}
                  onChange={(e) => {
                    setFullLegacyKeyInput(e.target.value.toUpperCase());
                    setKeyStatus('idle');
                  }}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                  className="flex-1 px-3 py-2 rounded-xl bg-surface border border-layer-line font-mono text-xs font-bold uppercase text-foreground"
                />
                <button
                  type="submit"
                  disabled={keyStatus === 'verifying'}
                  className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-bold cursor-pointer"
                >
                  {bi('تحقق', 'Verify', 'پشکنین')}
                </button>
              </div>
            </div>
          )}

          {keyStatus === 'failed' && (
            <p className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>
                {bi(
                  'الرمز المدخل لا يطابق المجموعة المسجلة. راجع نسختك المحفوظة.',
                  'Entered characters do not match the expected group. Please check your saved sheet.',
                  'پیتە نووسراوەکان ناگونجێن لەگەڵ گرووپی تۆمارکراو.'
                )}
              </span>
            </p>
          )}
        </form>

        {/* Step 2: Test My Backup in Isolated Sandbox DB */}
        <form
          onSubmit={(e) => void handleRunSandboxTest(e)}
          className="p-4 rounded-2xl bg-card border border-card-line space-y-3"
        >
          <div className="flex items-center gap-2 font-bold text-sm text-foreground">
            <FileArchive className="size-4 text-primary shrink-0" />
            <span>
              {bi(
                '2. اختبار نسختي الاحتياطية في بيئة معزولة (.ptbackup)',
                '2. Test My Backup in Isolated Sandbox (.ptbackup)',
                '٢. تاقیکردنەوەی فایلە پاشەکەوتەکەم لە ژینگەیەکی جیاکراوە (.ptbackup)'
              )}
            </span>
          </div>
          <p className="text-muted-foreground-1 leading-relaxed">
            {bi(
              'يفك تشفير ملف النسخة في قاعدة بيانات مؤقتة منفصلة للتحقق من سلامة السجلات والروابط دون أي تأثير على بياناتك الحالية ثم يحذف القاعدة المؤقتة.',
              'Decrypts your backup into a temporary sandbox IndexedDB, verifies referential integrity and sample records without touching your live clinic data, then destroys the sandbox.',
              'فایلەکە لە بنکەدراوەیەکی کاتی جیاکراوە شفرەدەکاتەوە، پشکنینی دروستی تۆمارەکان دەکات بێ کاریگەری لەسەر داتای ئێستا و پاشان دەیسرێتەوە.'
            )}
          </p>

          <div className="space-y-2.5">
            <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-layer-line hover:border-primary/60 bg-surface cursor-pointer font-bold text-foreground">
              <Upload className="size-4 text-primary" />
              <span className="truncate">
                {backupFileName ||
                  bi(
                    'اختر أحدث ملف .ptbackup لاختباره',
                    'Choose latest .ptbackup file to test',
                    'دوایین فایلی .ptbackup هەڵبژێرە بۆ تاقیکردنەوە'
                  )}
              </span>
              <input
                type="file"
                accept=".ptbackup,.json"
                onChange={(e) => void handleSelectBackupFile(e)}
                className="hidden"
              />
            </label>

            {backupJsonContent && (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  placeholder={bi(
                    'كلمة مرور النسخة الاحتياطية',
                    'Backup passphrase',
                    'تێپەڕەوشەی پاشەکەوت'
                  )}
                  className="flex-1 px-3 py-2 rounded-xl bg-surface border border-layer-line text-foreground"
                />
                <button
                  type="submit"
                  disabled={sandboxStatus === 'running' || !backupPassword}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {sandboxStatus === 'running' && <Loader2 className="size-3.5 animate-spin" />}
                  <span>
                    {sandboxStatus === 'running'
                      ? `${sandboxProgress}%`
                      : bi('اختبار النسخة الآن', 'Run Sandbox Test', 'دەستپێکردنی پشکنین')}
                  </span>
                </button>
              </div>
            )}
          </div>

          {sandboxError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 font-semibold flex items-start gap-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{sandboxError}</span>
            </div>
          )}

          {sandboxStatus === 'passed' && sandboxResult && (
            <div
              data-testid="recovery-drill-verified-badge"
              className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-950 dark:text-emerald-200 space-y-1.5"
            >
              <div className="font-extrabold flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  {bi(
                    'تم التحقق بنجاح — نسختك الاحتياطية قابلة للاسترجاع 100%',
                    'Verified — your backup decrypted cleanly in an isolated sandbox',
                    'پشتڕاستکرایەوە — پاشەکەوتەکەت بە تەواوی شفرەدەکرێتەوە'
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-semibold">
                <span>
                  {bi('المرضى:', 'Patients:', 'نەخۆشەکان:')} <Num value={sandboxResult.patientCount} />
                </span>
                <span>
                  {bi('الجلسات:', 'Sessions:', 'دانیشتنەکان:')} <Num value={sandboxResult.sessionCount} />
                </span>
                <span>
                  {bi('السجلات:', 'Total records:', 'کۆی تۆمارەکان:')} <Num value={sandboxResult.totalRecordCount} />
                </span>
              </div>
            </div>
          )}
        </form>
      </div>
    </ModalDialog>
  );
};
