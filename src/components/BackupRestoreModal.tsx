// =======================================================================
// PhysioRecord — Backup & Restoration Modal (v1.1)
// With Full Data Loss Prevention & Restore Confirmation Inspection
// =======================================================================

import React, { useState } from 'react';
import { db } from '../db/db';
import { useVault } from '../context/VaultContext';
import { usePatients } from '../context/PatientContext';
import { useLanguage } from '../context/LanguageContext';
import {
  exportBackupPackage,
  verifyBackupPackage,
  restoreBackupPackage,
  inspectBackupPreview,
  type BackupPreviewSummary,
  type BackupVerificationResult,
  type RestoredBackupSummary,
} from '../crypto/backup';
import {
  createDurablePreRestoreRecoveryBackup,
  saveExternalRecoveryBackupFile,
} from '../crypto/recovery';
import {
  isFileSystemAccessSupported,
  pickAndPersistBackupFolder,
  getConfiguredBackupFolder,
  clearConfiguredBackupFolder,
  saveBackupPackageToDevice,
} from '../crypto/fileSystemBackup';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import type { BackupRestoreMode } from '../types/clinicManagement';
import { localDate, formatClinicalDate } from '../utils/date';
import {
  isNativeAndroid,
  saveTextFilePortable,
  shareGeneratedFileOnAndroid,
} from '../platform/nativeBridge';
import { DrawerDialog } from './ui/Dialog';
import {
  X,
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  FileText,
  RefreshCw,
  ArrowRight,
  Database,
  FolderOpen,
  HardDrive,
  Trash2,
  GitMerge,
  Share2,
} from 'lucide-react';

const CONFLICT_REASON_CKB: Record<string, string> = {
  'سجل معتمد غير قابل للتعديل: تم الإبقاء على النسخة المحلية دون استبدال.':
    'تۆمارێکی پەسەندکراوی نەگۆڕ: وەشانە ناوخۆییەکە وەک خۆی هێڵرایەوە بێ گۆڕانکاری.',
  'سجل النسخة الاحتياطية أحدث زمنياً: تم اعتماد تحديث النسخة.':
    'تۆماری کۆپی یەدەگ لە ڕووی کاتەوە نوێترە: نوێکردنەوەی کۆپییەکە پەسەند کرا.',
  'السجل المحلي أحدث أو مساوٍ: تم الاحتفاظ بالنسخة المحلية.':
    'تۆمارە ناوخۆییەکە نوێتر یان یەکسانە: وەشانە ناوخۆییەکە پارێزرا.',
};

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({ isOpen, onClose }) => {
  const { vaultKek, dek, unlock } = useVault();
  const { refreshPatients } = usePatients();
  const { bi, isRtl, language } = useLanguage();

  const [activeTab, setActiveTab] = useState<'export' | 'restore'>('export');
  const fsSupport = React.useMemo(() => isFileSystemAccessSupported(), []);
  const [configuredFolder, setConfiguredFolder] = useState<{
    configured: boolean;
    folderName?: string;
  }>({ configured: false });
  const [preferFsPicker, setPreferFsPicker] = useState<boolean>(
    () => fsSupport.savePicker || fsSupport.directoryPicker
  );

  // Export State
  const [exportPassword, setExportPassword] = useState('');
  const [confirmExportPassword, setConfirmExportPassword] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportVerification, setExportVerification] = useState<BackupVerificationResult | null>(null);
  const [exportSaveMethod, setExportSaveMethod] = useState<string | null>(null);
  const [lastExportedBackupPkg, setLastExportedBackupPkg] = useState<{
    filename: string;
    content: string;
  } | null>(null);

  // Restore State
  const [restoreFileContent, setRestoreFileContent] = useState<string | null>(null);
  const [restoreFileName, setRestoreFileName] = useState<string>('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<number | null>(null);
  const [previewSummary, setPreviewSummary] = useState<BackupPreviewSummary | null>(null);
  const [restoreMode, setRestoreMode] = useState<BackupRestoreMode>('replace');
  const [restoredSummary, setRestoredSummary] = useState<RestoredBackupSummary | null>(null);
  const [newVaultPassword, setNewVaultPassword] = useState('');
  const [confirmNewVaultPassword, setConfirmNewVaultPassword] = useState('');
  const [emergencyRecoveryPassword, setEmergencyRecoveryPassword] = useState('');
  const [confirmEmergencyRecoveryPassword, setConfirmEmergencyRecoveryPassword] = useState('');
  const [confirmedDataLoss, setConfirmedDataLoss] = useState(false);
  const [acknowledgedExternalRecovery, setAcknowledgedExternalRecovery] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [emergencyRecoverySnapshotId, setEmergencyRecoverySnapshotId] = useState<string | null>(null);
  const [emergencyRecoveryPackage, setEmergencyRecoveryPackage] = useState<string | null>(null);
  const [externalSaveMethod, setExternalSaveMethod] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    void getConfiguredBackupFolder().then((res) => setConfiguredFolder(res));
  }, [isOpen]);

  const handlePickBackupFolder = async () => {
    setExportError(null);
    try {
      const picked = await pickAndPersistBackupFolder();
      if (picked) {
        setConfiguredFolder({ configured: true, folderName: picked.name });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setExportError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر اختيار مجلد النسخ الاحتياطي.',
              'Could not select backup folder.',
              'نەتوانرا فۆڵدەری کۆپی یەدەگ هەڵبژێردرێت.'
            )
      );
    }
  };

  const handleClearBackupFolder = async () => {
    await clearConfiguredBackupFolder();
    setConfiguredFolder({ configured: false });
  };

  if (!isOpen) return null;

  // Handle Export
  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setExportError(null);

    if (exportPassword.length < 10) {
      setExportError(
        bi(
          'يجب ألا تقل كلمة مرور النسخة الاحتياطية عن 10 خانات.',
          'Backup password must be at least 10 characters.',
          'وشەی نهێنی کۆپی یەدەگ نابێت لە 10 پیت یان ژمارە کەمتر بێت.'
        )
      );
      return;
    }
    if (exportPassword !== confirmExportPassword) {
      setExportError(
        bi(
          'كلمتا المرور غير متطابقتين.',
          'Passwords do not match.',
          'هەردوو وشەی نهێنییەکە وەک یەک نین.'
        )
      );
      return;
    }
    if (!vaultKek) {
      setExportError(
        bi(
          'الخزينة مقفلة أو غير مهيأة.',
          'Vault is locked or not initialized.',
          'خەزێنەکە قفڵە یان ڕێکنەخراوە.'
        )
      );
      return;
    }

    setExportLoading(true);
    setExportProgress(5);
    setExportVerification(null);
    setExportSaveMethod(null);
    try {
      const meta = await db.vaultMeta.get('auth');
      if (!meta) {
        throw new Error(
          bi(
            'بيانات الخزينة المحلية غير موجودة.',
            'Local vault metadata not found.',
            'زانیاری خەزێنەی ناوخۆیی بوونی نییە.'
          )
        );
      }

      const backupPackageStr = await exportBackupPackage(
        db,
        meta,
        vaultKek,
        exportPassword,
        'Asia/Baghdad',
        (pct) => setExportProgress(Math.min(70, Math.round(pct * 0.7)))
      );

      // Post-export verification pass (decompresses + decrypts chunks + checks integrity in RAM)
      setExportProgress(75);
      const verification = await verifyBackupPackage(
        backupPackageStr,
        exportPassword,
        (pct) => setExportProgress(75 + Math.round(pct * 0.2))
      );

      const dateStr = localDate();
      const filename = `physiorecord_backup_${dateStr}.ptbackup`;
      const saveResult = await saveBackupPackageToDevice(
        backupPackageStr,
        filename,
        preferFsPicker
      );

      const nowIso = new Date().toISOString();
      await ClinicOperationsService.updateBackupMetaAsync({
        lastBackupAt: nowIso,
        lastVerifiedBackupAt: verification.verifiedAt,
        lastBackupMethod:
          saveResult.method === 'download-fallback' ? 'download' : 'fs-access',
      });

      setExportVerification(verification);
      setLastExportedBackupPkg({
        filename,
        content: backupPackageStr,
      });
      setExportSaveMethod(
        saveResult.method === 'fs-picker'
          ? bi(
              'تم الحفظ مباشرة عبر اختيار الملف (File System Access)',
              'Saved via native File Picker',
              'ڕاستەوخۆ پاشەکەوت کرا لە ڕێگەی هەڵبژاردنی فایل (File System Access)'
            )
          : saveResult.method === 'directory-handle'
          ? bi(
              `تم الحفظ في المجلد المحدد (${saveResult.folderName || 'Folder'})`,
              `Saved to configured folder (${saveResult.folderName || 'Folder'})`,
              `پاشەکەوت کرا لە فۆڵدەری دیاریکراودا (${saveResult.folderName || 'Folder'})`
            )
          : bi(
              'تم التنزيل عبر المتصفح (Download Fallback)',
              'Downloaded via browser fallback',
              'داگرتن کرا لە ڕێگەی وێبگەڕەوە (Download Fallback)'
            )
      );
      setExportSuccess(true);
      setExportPassword('');
      setConfirmExportPassword('');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setExportError(
          bi(
            'تم إلغاء حفظ ملف النسخة الاحتياطية.',
            'Backup save cancelled by user.',
            'پاشەکەوتکردنی فایلی کۆپی یەدەگ هەڵوەشێنرایەوە.'
          )
        );
      } else {
        setExportError(
          err instanceof Error
            ? err.message
            : bi(
                'فشل تصدير النسخة الاحتياطية.',
                'Failed to export backup.',
                'ناردنەدەرەوەی کۆپی یەدەگ سەرکەوتوو نەبوو.'
              )
        );
      }
    } finally {
      setExportLoading(false);
      setExportProgress(null);
    }
  };

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreFileName(file.name);
    setRestoreError(null);
    setPreviewSummary(null);
    setConfirmedDataLoss(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      setRestoreFileContent(event.target?.result as string);
    };
    reader.onerror = () => {
      setRestoreError(
        bi(
          'فشل قراءة الملف المختار.',
          'Failed to read the selected file.',
          'خوێندنەوەی فایلە هەڵبژێردراوەکە سەرکەوتوو نەبوو.'
        )
      );
    };
    reader.readAsText(file);
  };

  // Step 1 of Restore: Inspect and Preview Backup (Data Loss Prevention)
  const handleInspectPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    setRestoreError(null);

    if (!restoreFileContent) {
      setRestoreError(
        bi(
          'يرجى اختيار ملف النسخة الاحتياطية (.ptbackup) أولاً.',
          'Please select a backup file (.ptbackup) first.',
          'تکایە سەرەتا فایلی کۆپی یەدەگ (.ptbackup) هەڵبژێرە.'
        )
      );
      return;
    }
    if (!restorePassword) {
      setRestoreError(
        bi(
          'يرجى إدخال كلمة مرور النسخة الاحتياطية.',
          'Please enter the backup password.',
          'تکایە وشەی نهێنی کۆپی یەدەگ بنووسە.'
        )
      );
      return;
    }

    setRestoreLoading(true);
    try {
      const summary = await inspectBackupPreview(restoreFileContent, restorePassword, db);
      setPreviewSummary(summary);
    } catch (err: unknown) {
      setRestoreError(
        err instanceof Error
          ? err.message
          : bi(
              'فشل التحقق من النسخة الاحتياطية. تأكد من كلمة المرور وسلامة الملف.',
              'Failed to verify backup. Please check the password and file integrity.',
              'دڵنیابوونەوە لە کۆپی یەدەگ سەرکەوتوو نەبوو. تکایە دڵنیابە لە وشەی نهێنی و سەلامەتی فایلەکە.'
            )
      );
    } finally {
      setRestoreLoading(false);
    }
  };

  // Step 2 of Restore: Execute Replacement with Safety Recovery Backup
  const handleExecuteRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setRestoreError(null);

    if (!confirmedDataLoss) {
      setRestoreError(
        restoreMode === 'merge'
          ? bi(
              'يجب تأكيد الموافقة على دمج السجلات قبل المتابعة.',
              'Please confirm merge review before continuing.',
              'پێویستە پێش بەردەوامبوون ڕەزامەندی لەسەر تێکەڵکردنی تۆمارەکان پشتڕاست بکەیتەوە.'
            )
          : bi(
              'يجب الموافقة الصريحة على إقرار استبدال البيانات للمتابعة.',
              'Explicit confirmation of database replacement is required to continue.',
              'بۆ بەردەوامبوون پێویستە بە ڕاشکاوی ڕەزامەندی گۆڕینی داتابەیس پشتڕاست بکەیتەوە.'
            )
      );
      return;
    }
    if (restoreMode === 'merge' && !dek) {
      setRestoreError(
        bi(
          'يتطلب وضع الدمج أن تكون الخزينة مفتوحة على هذا الجهاز.',
          'Merge mode requires the local vault to be unlocked.',
          'شێوازی تێکەڵکردن پێویستی بەوەیە خەزێنە لەسەر ئەم ئامێرە کراوە بێت.'
        )
      );
      return;
    }
    if (newVaultPassword.length < 10) {
      setRestoreError(
        bi(
          'يجب ألا تقل كلمة مرور الخزينة الجديدة عن 10 خانات.',
          'New vault password must be at least 10 characters.',
          'وشەی نهێنی خەزێنەی نوێ نابێت لە 10 خانە کەمتر بێت.'
        )
      );
      return;
    }
    if (newVaultPassword !== confirmNewVaultPassword) {
      setRestoreError(
        bi(
          'كلمتا مرور الخزينة الجديدة غير متطابقتين.',
          'New vault passwords do not match.',
          'هەردوو وشەی نهێنی خەزێنە نوێیەکە وەک یەک نین.'
        )
      );
      return;
    }
    if (emergencyRecoveryPassword.length < 10) {
      setRestoreError(
        bi(
          'يجب ألا تقل كلمة مرور حماية نسخة التعافي الطارئة عن 10 خانات.',
          'Emergency recovery backup password must be at least 10 characters.',
          'وشەی نهێنی پاراستنی کۆپی فریاگوزاری لەناکاو نابێت لە 10 خانە کەمتر بێت.'
        )
      );
      return;
    }
    if (emergencyRecoveryPassword !== confirmEmergencyRecoveryPassword) {
      setRestoreError(
        bi(
          'كلمتا مرور حماية نسخة التعافي الطارئة غير متطابقتين.',
          'Emergency recovery backup passwords do not match.',
          'هەردوو وشەی نهێنی کۆپی فریاگوزاری لەناکاو وەک یەک نین.'
        )
      );
      return;
    }
    if (!acknowledgedExternalRecovery) {
      setRestoreError(
        bi(
          'يجب تأكيد إقرار حفظ نسخة التعافي الطارئة الخارجية والاحتفاظ بكلمة مرورها.',
          'Please acknowledge saving the external emergency recovery backup and retaining its password.',
          'پێویستە پەسەندکردنی پاشەکەوتکردنی کۆپی فریاگوزاری دەرەکی و پاراستنی وشەی نهێنییەکەی پشتڕاست بکەیتەوە.'
        )
      );
      return;
    }
    if (!restoreFileContent) return;

    setRestoreLoading(true);
    try {
      // 1. Create durable pre-restore emergency recovery backup of existing destination database
      let emergencyId: string | null = null;
      let emergencyPkg: string | null = null;
      let saveMethodDesc: string | null = null;

      const currentMeta = await db.vaultMeta.get('auth');
      if (currentMeta && vaultKek) {
        // Enforce mandatory emergency backup creation and full verification before restore!
        try {
          // A. Internal Logical Recovery Database (PhysioRecordEmergencyRecoveryDB)
          const recoveryResult = await createDurablePreRestoreRecoveryBackup(
            db,
            currentMeta,
            vaultKek,
            emergencyRecoveryPassword,
            bi(
              'نسخة تعافٍ طارئة قبل استبدال قاعدة البيانات',
              'Emergency pre-restore recovery snapshot',
              'کۆپی فریاگوزاری لەناکاو پێش گۆڕینی داتابەیس'
            )
          );
          emergencyId = recoveryResult.snapshotId;
          emergencyPkg = recoveryResult.backupPackageStr;

          // B. External Encrypted Emergency Backup (Physical file outside browser storage)
          try {
            const extResult = await saveExternalRecoveryBackupFile(recoveryResult.backupPackageStr);
            saveMethodDesc = extResult.confirmedSaved
              ? bi(
                  'تم الحفظ مباشرة على القرص عبر File System Access API',
                  'Saved directly to disk via File System Access API',
                  'ڕاستەوخۆ پاشەکەوت کرا لەسەر دیسک لە ڕێگەی File System Access API'
                )
              : bi(
                  'تم تصدير وتنزيل الملف عبر المتصفح (Download Fallback)',
                  'Exported and downloaded via browser fallback',
                  'هەناردەکرا و داگیرا لە ڕێگەی وێبگەڕەوە (Download Fallback)'
                );
          } catch (fileErr: unknown) {
            if (fileErr instanceof Error && fileErr.message.includes('إلغاء')) {
              setRestoreLoading(false);
              setRestoreError(
                bi(
                  'تم إلغاء عملية الاستعادة: ألغى المستخدم حفظ ملف نسخة التعافي الخارجي.',
                  'Restore cancelled: user cancelled saving the external emergency recovery file.',
                  'کرداری گەڕاندنەوە هەڵوەشایەوە: بەکارهێنەر پاشەکەوتکردنی فایلی فریاگوزاری دەرەکی هەڵوەشاندەوە.'
                )
              );
              return;
            }
            console.warn('External file save fallback:', fileErr);
          }
        } catch (backupErr: unknown) {
          // STRICT RULE: Halt restore immediately if emergency recovery backup fails!
          const msg = backupErr instanceof Error ? backupErr.message : String(backupErr);
          setRestoreLoading(false);
          setRestoreError(
            bi(
              `فشلت حماية البيانات السابقة: تعذر إنشاء نسخة التعافي الطارئة (${msg}). تم إيقاف عملية الاستعادة فوراً لحماية بياناتك من الضياع.`,
              `Previous data protection failed: could not create emergency recovery backup (${msg}). Restore halted immediately to prevent data loss.`,
              `پاراستنی داتاکانی پێشوو سەرکەوتوو نەبوو: نەتوانرا کۆپی فریاگوزاری لەناکاو دروست بکرێت (${msg}). گەڕاندنەوە دەستبەجێ ڕاگیرا بۆ پاراستنی داتاکانت لە لەناوچوون.`
            )
          );
          return;
        }
      }

      // 2. Execute atomic restoration (with staging counter and new DEK; Replace or Merge mode)
      setRestoreProgress(5);
      const summary = await restoreBackupPackage(
        restoreFileContent,
        restorePassword,
        newVaultPassword,
        db,
        {
          mode: restoreMode,
          existingLocalDek: restoreMode === 'merge' ? dek || undefined : undefined,
          onProgress: (pct) => setRestoreProgress(pct),
        }
      );

      // 3. Unlock with new password and refresh state
      await unlock(newVaultPassword);
      await refreshPatients();

      setRestoredSummary(summary);
      setEmergencyRecoverySnapshotId(emergencyId);
      setEmergencyRecoveryPackage(emergencyPkg);
      setExternalSaveMethod(saveMethodDesc);
      setRestoreSuccess(true);
    } catch (err: unknown) {
      setRestoreError(
        err instanceof Error
          ? err.message
          : bi(
              'فشل استعادة النسخة الاحتياطية.',
              'Failed to restore backup.',
              'گەڕاندنەوەی کۆپی یەدەگ سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setRestoreLoading(false);
      setRestoreProgress(null);
    }
  };

  return (
    <DrawerDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      side="end"
      dir={isRtl ? 'rtl' : 'ltr'}
      maxWidthClassName="max-w-2xl"
      className="bg-card border-card-line"
      ariaLabel={bi('النسخ الاحتياطي والاستعادة', 'Backup & Restore', 'کۆپی یەدەگ و گەڕاندنەوە')}
      closeLabel={bi('إغلاق نافذة النسخ الاحتياطي', 'Close backup modal', 'داخستنی پەنجەرەی کۆپی یەدەگ')}
      bodyClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
    >
        {/* Header */}
        <div className="px-6 py-4 border-b border-card-divider flex items-center justify-between bg-muted/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {bi('النسخ الاحتياطي والاستعادة', 'Backup & Restore', 'کۆپی یەدەگ و گەڕاندنەوە')}
              </h2>
              <p className="text-xs text-muted-foreground-1">
                {bi(
                  'النسخة الاحتياطية محمية بكلمة المرور التي تختارها. إذا فقدتها، لن تتمكن من فتح النسخة.',
                  'Backup is protected by the password you choose. If you lose it, the backup cannot be opened.',
                  'کۆپی یەدەگ بەو وشەی نهێنییەی هەڵیدەبژێریت پارێزراوە. ئەگەر لەدەستی بدەیت، ناتوانیت کۆپییەکە بکەیتەوە.'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={bi('إغلاق نافذة النسخ الاحتياطي', 'Close backup modal', 'داخستنی پەنجەرەی کۆپی یەدەگ')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div role="tablist" aria-label={bi('أقسام النسخ الاحتياطي والاستعادة', 'Backup & Restore Tabs')} className="flex border-b border-card-divider bg-card px-6 pt-3">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'export'}
            onClick={() => { setActiveTab('export'); setExportSuccess(false); setExportError(null); }}
            className={`pb-3 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'export'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>{bi('تصدير نسخة احتياطية (.ptbackup)', 'Export Backup (.ptbackup)', 'ناردنەدەرەوەی کۆپی یەدەگ (.ptbackup)')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'restore'}
            onClick={() => { setActiveTab('restore'); setRestoreSuccess(false); setRestoreError(null); }}
            className={`pb-3 px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'restore'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>{bi('استعادة نسخة احتياطية', 'Restore Backup', 'گەڕاندنەوەی کۆپی یەدەگ')}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* TAB 1: EXPORT */}
          {activeTab === 'export' && (
            <div>
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl text-foreground text-xs leading-relaxed mb-5 flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                <p className="text-foreground font-medium">
                  {bi(
                    'النسخة الاحتياطية محمية بكلمة المرور التي تختارها. إذا فقدتها، لن تتمكن من فتح النسخة.',
                    'Backup is protected by the password you choose. If you lose it, the backup cannot be opened.',
                    'کۆپی یەدەگ بەو وشەی نهێنییەی هەڵیدەبژێریت پارێزراوە. ئەگەر لەدەستی بدەیت، ناتوانیت کۆپییەکە بکەیتەوە.'
                  )}
                </p>
              </div>

              {exportError && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{exportError}</span>
                </div>
              )}

              {exportSuccess && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs space-y-2 mb-4">
                  <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-200">
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      {bi(
                        'تم تصدير النسخة الاحتياطية والتحقق من سلامتها بنجاح!',
                        'Backup exported & post-export verified successfully!',
                        'کۆپی یەدەگ بە سەرکەوتوویی نێردرایە دەرەوە و دڵنیایی سەلامەتی لێکرایەوە!'
                      )}
                    </span>
                  </div>
                  {exportVerification && (
                    <div className="p-2.5 rounded-lg bg-surface/80 border border-emerald-200/80 dark:border-emerald-800 space-y-1 text-foreground">
                      <p className="font-semibold">
                        {bi(
                          'تقرير التحقق التلقائي بعد التصدير:',
                          'Post-Export Integrity Verification:',
                          'ڕاپۆرتی دڵنیابوونەوەی خۆکار دوای ناردنەدەرەوە:'
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground-1">
                        {bi('الإصدار:', 'Format:', 'وەشان:')} <code className="font-mono">V{exportVerification.formatVersion}</code>
                        {' · '}
                        {bi('السجلات المفحوصة:', 'Verified Records:', 'تۆمارە پشکنراوەکان:')} <strong className="font-mono">{exportVerification.recordCount}</strong>
                        {' · '}
                        {bi('الحجم:', 'Size:', 'قەبارە:')}{' '}
                        <span className="font-mono">
                          {Math.max(1, Math.round((exportVerification.compressedBytes ?? exportVerification.uncompressedBytes) / 1024))} KB
                        </span>
                      </p>
                      {exportSaveMethod && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                          {exportSaveMethod}
                        </p>
                      )}
                      {isNativeAndroid() && lastExportedBackupPkg && (
                        <div className="pt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              void shareGeneratedFileOnAndroid({
                                filename: lastExportedBackupPkg.filename,
                                content: lastExportedBackupPkg.content,
                                mimeType: 'application/json',
                                title: lastExportedBackupPkg.filename,
                              });
                            }}
                            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>
                              {bi(
                                'مشاركة ملف النسخة الاحتياطية (واتساب / تيليجرام / درايف)',
                                'Share Backup File (WhatsApp / Telegram / Drive)',
                                'هاوبەشکردنی فایلی کۆپی یەدەگ (واتساپ / تێلیگرام / درایڤ)'
                              )}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <p>
                    {bi(
                      'احتفظ بهذا الملف في مكان آمن. ستحتاج إلى كلمة المرور التي اخترتها الآن عند استعادة السجلات.',
                      'Keep this file in a safe place. You will need the password you chose now when restoring.',
                      'ئەم فایلە لە شوێنێکی سەلامەت هەڵبگرە. لە کاتی گەڕاندنەوەی تۆمارەکاندا پێویستت بەو وشەی نهێنییە دەبێت کە ئێستا هەڵتبژارد.'
                    )}
                  </p>
                </div>
              )}

              {(fsSupport.directoryPicker || fsSupport.savePicker) && (
                <div className="p-3.5 bg-muted/40 border border-card-line rounded-xl text-xs space-y-2.5 mb-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <HardDrive className="w-4 h-4 text-primary shrink-0" />
                      <span>
                        {bi(
                          'خيارات الحفظ المباشر على الجهاز (File System Access)',
                          'Direct Device Storage Options',
                          'هەڵبژاردنەکانی پاشەکەوتکردنی ڕاستەوخۆ لەسەر ئامێر (File System Access)'
                        )}
                      </span>
                    </div>
                    {fsSupport.directoryPicker && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handlePickBackupFolder}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-layer-line text-foreground font-semibold hover:bg-layer-hover cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-primary" />
                          <span>
                            {configuredFolder.configured
                              ? bi(
                                  `تغيير المجلد (${configuredFolder.folderName})`,
                                  `Change Folder (${configuredFolder.folderName})`,
                                  `گۆڕینی فۆڵدەر (${configuredFolder.folderName})`
                                )
                              : bi(
                                  'تحديد مجلد للنسخ التلقائي',
                                  'Set Backup Folder',
                                  'دیاریکردنی فۆڵدەر بۆ کۆپی خۆکار'
                                )}
                          </span>
                        </button>
                        {configuredFolder.configured && (
                          <button
                            type="button"
                            onClick={handleClearBackupFolder}
                            title={bi('إزالة المجلد المحفوظ', 'Clear configured folder', 'لابردنی فۆڵدەری هەڵبژێردراو')}
                            className="p-1.5 rounded-lg border border-layer-line text-muted-foreground-1 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferFsPicker}
                      onChange={(e) => setPreferFsPicker(e.target.checked)}
                      className="w-4 h-4 rounded text-primary focus:ring-primary border-layer-line"
                    />
                    <span>
                      {bi(
                        'استخدام نافذة الحفظ المباشر على القرص عند التصدير (بدل تنزيل المتصفح الافتراضي عند الدعم)',
                        'Use native OS Save File / Directory picker on export when supported',
                        'بەکارهێنانی پەنجەرەی پاشەکەوتکردنی ڕاستەوخۆ لەسەر دیسک لە کاتی ناردنەدەرەوەدا (لە جیاتی داگرتنی ئاسایی وێبگەڕ کاتێک پشتگیری دەکرێت)'
                      )}
                    </span>
                  </label>
                </div>
              )}

              <form onSubmit={handleExport} className="space-y-4">
                <div>
                  <label htmlFor="export-password-input" className="block text-xs font-bold text-foreground mb-1">
                    {bi(
                      'كلمة مرور حماية النسخة الاحتياطية',
                      'Backup Protection Password',
                      'وشەی نهێنی پاراستنی کۆپی یەدەگ'
                    )}
                  </label>
                  <input
                    id="export-password-input"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    placeholder={bi(
                      'اختر كلمة مرور قوية (10 خانات على الأقل)',
                      'Choose a strong password (at least 10 characters)',
                      'وشەیەکی نهێنی بەهێز هەڵبژێرە (لانیکەم 10 خانە)'
                    )}
                    className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-lg bg-surface border border-layer-line text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-left font-mono"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label htmlFor="confirm-export-password-input" className="block text-xs font-bold text-foreground mb-1">
                    {bi('تأكيد كلمة المرور', 'Confirm Password', 'دڵنیابوونەوەی وشەی نهێنی')}
                  </label>
                  <input
                    id="confirm-export-password-input"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmExportPassword}
                    onChange={(e) => setConfirmExportPassword(e.target.value)}
                    placeholder={bi(
                      'أعد إدخال كلمة المرور',
                      'Re-enter password',
                      'وشەی نهێنی دووبارە بنووسەرەوە'
                    )}
                    className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-lg bg-surface border border-layer-line text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-left font-mono"
                    dir="ltr"
                  />
                </div>

                {exportLoading && exportProgress !== null && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground-1">
                      <span>
                        {bi(
                          'جاري الضغط والتشفير والتحقق...',
                          'Compressing, encrypting & verifying...',
                          'پەستەکردن، کۆدکردن و دڵنیابوونەوە لە جریان دایە...'
                        )}
                      </span>
                      <span className="font-mono">{exportProgress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-150"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={exportLoading || !exportPassword || !confirmExportPassword}
                    className="w-full py-3 px-4 bg-primary hover:bg-primary-hover text-primary-foreground text-xs sm:text-sm font-bold rounded-lg transition-all shadow-2xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {exportLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>
                          {bi(
                            'جاري التشفير والتحقق وتوليد الحزمة...',
                            'Encrypting, verifying & building package...',
                            'کۆدکردن، دڵنیابوونەوە و دروستکردنی پاکێج لە جریان دایە...'
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>
                          {bi(
                            'تصدير وتحقق وحفظ ملف النسخة (.ptbackup)',
                            'Export, Verify & Save Backup (.ptbackup)',
                            'ناردنەدەرەوە، پشکنین و پاشەکەوتکردنی فایلی کۆپی (.ptbackup)'
                          )}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: RESTORE */}
          {activeTab === 'restore' && (
            <div>
              {restoreError && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>{restoreError}</span>
                </div>
              )}

              {restoreSuccess && (
                <div className="p-5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-900 dark:text-emerald-200 text-xs space-y-3 mb-4 text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                  <h3 className="font-bold text-sm">
                    {restoredSummary?.mode === 'merge'
                      ? bi(
                          'تم دمج واستعادة السجلات بنجاح تام!',
                          'Records merged & restored successfully!',
                          'تۆمارەکان بە سەرکەوتوویی تێکەڵکران و گەڕێنرانەوە!'
                        )
                      : bi(
                          'تم استعادة وتحديث قاعدة البيانات بنجاح تام!',
                          'Database restored & updated successfully!',
                          'داتابەیس بە سەرکەوتوویی گەڕێنرایەوە و نوێکرایەوە!'
                        )}
                  </h3>
                  <p className="text-emerald-700 dark:text-emerald-300 leading-relaxed">
                    {bi(
                      'تم توليد مفتاح بيانات تشغيلي جديد تماماً (Non-Extractable DEK)، وإعادة تشفير كافة السجلات برقم إصدار مفتاح جديد (dekVersion)، وتثبيت استهلاك العداد المرحلي الفعلي (Staging Counter)، وتفعيل الخزينة بنجاح.',
                      'Generated a brand-new non-extractable DEK, re-encrypted all records under a new dekVersion, committed the staging counter, and unlocked the vault.',
                      'کلیلێکی داتای کارپێکردنی تەواو نوێ دروستکرا (Non-Extractable DEK)، هەموو تۆمارەکان بە وەشانێکی نوێی کلیل (dekVersion) کۆدکرانەوە، ژمێرەری قۆناغەکان جێگیرکرا (Staging Counter)، و خەزێنەکە بە سەرکەوتوویی چالاک کرا.'
                    )}
                  </p>

                  {restoredSummary && restoredSummary.mode === 'merge' && (
                    <div className="p-3 bg-surface border border-emerald-200 dark:border-emerald-900 rounded-xl text-foreground text-xs text-start space-y-2">
                      <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
                        <span>
                          {bi(
                            'تقرير الدمج السريري (Merge Report)',
                            'Clinical Merge Report',
                            'ڕاپۆرتی تێکەڵکردنی کلینیکی (Merge Report)'
                          )}
                        </span>
                        <span className="font-mono text-xs">
                          {restoredSummary.patientCount} {bi('مريض', 'patients', 'نەخۆش')} · {restoredSummary.soapCount} SOAP
                        </span>
                      </div>
                      {restoredSummary.skippedImmutableCount > 0 && (
                        <p className="text-xs text-primary font-semibold">
                          {bi(
                            `تمت حماية ${restoredSummary.skippedImmutableCount} سجل نهائي مقفل (SOAP نهائي أو إضافة سريرية) ومنع تعديلها أثناء الدمج.`,
                            `Protected ${restoredSummary.skippedImmutableCount} finalized immutable SOAP/addenda record(s) during merge.`,
                            `${restoredSummary.skippedImmutableCount} تۆماری کۆتایی قفڵدراو (SOAP کۆتایی یان زیادکراوی کلینیکی) پارێزرا و ڕێگری لە دەستکاریکردنیان کرا لە کاتی تێکەڵکردندا.`
                          )}
                        </p>
                      )}
                      {restoredSummary.conflicts.length === 0 ? (
                        <p className="text-xs text-muted-foreground-1">
                          {bi(
                            'لم تُرصد تعارضات زمنية بين السجلات المحلية والنسخة المستوردة.',
                            'No timestamp conflicts detected between local and backup records.',
                            'هیچ ناکۆکییەکی کاتی لە نێوان تۆمارە ناوخۆییەکان و کۆپی هاوردەکراودا نەدۆزرایەوە.'
                          )}
                        </p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1.5 border-t border-card-divider pt-2">
                          <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                            {bi(
                              `التعارضات المعالجة (${restoredSummary.conflicts.length}):`,
                              `Resolved Conflicts (${restoredSummary.conflicts.length}):`,
                              `ناکۆکییە چارەسەرکراوەکان (${restoredSummary.conflicts.length}):`
                            )}
                          </p>
                          {restoredSummary.conflicts.map((conflict, idx) => (
                            <div
                              key={`${conflict.storeName}-${conflict.recordId}-${idx}`}
                              className="p-2 rounded-lg bg-muted/40 border border-card-line text-xs"
                            >
                              <div className="flex items-center justify-between gap-2 font-mono font-bold text-foreground">
                                <span>{conflict.storeName}</span>
                                <span>{conflict.resolution}</span>
                              </div>
                              <p className="text-xs text-muted-foreground-1 mt-0.5">
                                {bi(
                                  conflict.reasonAr,
                                  conflict.reasonEn,
                                  CONFLICT_REASON_CKB[conflict.reasonAr]
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {emergencyRecoverySnapshotId && (
                    <div className="p-3 bg-surface border border-emerald-200 dark:border-emerald-900 rounded-xl text-foreground text-xs text-start space-y-1.5">
                      <p className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>
                          {bi(
                            'تم توثيق نسخة التعافي الطارئة لبياناتك السابقة (Dual Recovery):',
                            'Emergency recovery snapshot documented for previous data (Dual Recovery):',
                            'کۆپی فریاگوزاری لەناکاو بۆ داتاکانی پێشووت تۆمارکرا (Dual Recovery):'
                          )}
                        </span>
                      </p>
                      <p className="font-mono text-muted-foreground-1">
                        {bi(
                          `معرف اللقطة الداخلية: ${emergencyRecoverySnapshotId}`,
                          `Internal Snapshot ID: ${emergencyRecoverySnapshotId}`,
                          `ناسنامەی وێنەگیراوی ناوخۆیی: ${emergencyRecoverySnapshotId}`
                        )}
                      </p>
                      <p className="text-muted-foreground-1">
                        <strong>{bi('التخزين الداخلي:', 'Internal Storage:', 'کۆگای ناوخۆیی:')}</strong>{' '}
                        {bi(
                          'تم الحفظ منطقياً في قاعدة',
                          'Saved logically inside database',
                          'بە لۆژیکی لە داتابەیسدا پاشەکەوت کرا'
                        )}{' '}
                        <code>PhysioRecordEmergencyRecoveryDB</code>.
                      </p>
                      {externalSaveMethod && (
                        <p className="text-emerald-800 dark:text-emerald-300 font-semibold">
                          <strong>{bi('التصدير الخارجي:', 'External Export:', 'ناردنەدەرەوەی دەرەکی:')}</strong> {externalSaveMethod}.
                        </p>
                      )}
                      <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg border border-amber-200 dark:border-amber-900">
                        {bi(
                          'تنبيه أمني: كلمة المرور لم تُحفظ في المتصفح نهائياً. يرجى استخدام كلمة مرور التعافي التي عينتها لفك تشفير هذه النسخة في حال الرجوع إليها.',
                          'Security notice: This password is never stored in the browser. Use your emergency recovery password to decrypt this snapshot if needed.',
                          'ئاگاداری ئەمنی: وشەی نهێنی بە هیچ شێوەیەک لە وێبگەڕدا پاشەکەوت نەکراوە. تکایە ئەو وشەی نهێنی فریاگوزارییە بەکاربهێنە کە دیاریت کردووە بۆ کردنەوەی کۆپییەکە لە کاتی پێویستدا.'
                        )}
                      </p>
                      {emergencyRecoveryPackage && (
                        <button
                          type="button"
                          onClick={() => {
                            void saveTextFilePortable({
                              filename: `physiorecord_emergency_backup_${emergencyRecoverySnapshotId}.ptbackup`,
                              content: emergencyRecoveryPackage,
                              mimeType: 'application/json',
                              description: 'PhysioRecord Emergency Backup (.ptbackup)',
                              extensions: ['ptbackup', 'json'],
                            });
                          }}
                          className="mt-2 text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>
                            {bi(
                              'تحميل ملف نسخة التعافي الطارئة السابقة كملف محلي (.ptbackup)',
                              'Download previous emergency recovery backup locally (.ptbackup)',
                              'داگرتنی فایلی کۆپی فریاگوزاری لەناکاوی پێشوو وەک فایلێکی ناوخۆیی (.ptbackup)'
                            )}
                          </span>
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-3 px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700 shadow-2xs cursor-pointer"
                  >
                    {bi(
                      'إغلاق والعودة للسجلات السريرية',
                      'Close & Return to Clinical Records',
                      'داخستن و گەڕانەوە بۆ تۆمارە کلینیکییەکان'
                    )}
                  </button>
                </div>
              )}

              {!restoreSuccess && !previewSummary && (
                /* Step A: Select File and Enter Password to Preview */
                <form onSubmit={handleInspectPreview} className="space-y-4">
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-1">
                    <span className="font-bold">
                      {bi(
                        'المرحلة الأولى: فحص ومعاينة حزمة النسخ (Pre-Inspection)',
                        'Step 1: Inspect & Preview Backup Package (Pre-Inspection)',
                        'قۆناغی یەکەم: پشکنین و پێشبینینی پاکێجی کۆپی یەدەگ (Pre-Inspection)'
                      )}
                    </span>
                    <p>
                      {bi(
                        'اختر ملف النسخة وأدخل كلمة المرور الخاصة بها ليقوم النظام بفحص محتواها وعرض مقارنة دقيقة للسجلات قبل إجراء أي استبدال.',
                        'Select the backup file and enter its password so the system can inspect its contents and show an exact record comparison before making any changes.',
                        'فایلی کۆپی یەدەگ هەڵبژێرە و وشەی نهێنییەکەی بنووسە بۆ ئەوەی سیستەم ناوەڕۆکەکەی بپشکنێت و بەراوردێکی وردی تۆمارەکان پیشان بدات پێش هەر گۆڕانکارییەک.'
                      )}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="restore-file-input" className="block text-xs font-bold text-foreground mb-1.5">
                      {bi(
                        'اختر ملف النسخة الاحتياطية (.ptbackup)',
                        'Select Backup File (.ptbackup)',
                        'فایلی کۆپی یەدەگ هەڵبژێرە (.ptbackup)'
                      )}
                    </label>
                    <input
                      id="restore-file-input"
                      type="file"
                      accept=".ptbackup,.json,application/json,application/octet-stream,*/*"
                      onChange={handleFileChange}
                      className="w-full text-xs text-muted-foreground-1 file:mr-0 file:ml-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                    />
                    {restoreFileName && (
                      <p className="text-xs text-muted-foreground-1 mt-1 flex items-center gap-1 font-mono">
                        <FileText className="w-3.5 h-3.5" />
                        <span>
                          {bi('الملف المحدد:', 'Selected file:', 'فایلی دیاریکراو:')} {restoreFileName}
                        </span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="restore-password-input" className="block text-xs font-bold text-foreground mb-1">
                      {bi(
                        'كلمة مرور حماية النسخة الاحتياطية',
                        'Backup Protection Password',
                        'وشەی نهێنی پاراستنی کۆپی یەدەگ'
                      )}
                    </label>
                    <input
                      id="restore-password-input"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={restorePassword}
                      onChange={(e) => setRestorePassword(e.target.value)}
                      placeholder={bi(
                        'أدخل كلمة المرور التي حُمي بها الملف عند التصدير',
                        'Enter the password used to protect the file during export',
                        'ئەو وشەی نهێنییە بنووسە کە فایلەکە پێی پارێزراوە لە کاتی ناردنەدەرەوەدا'
                      )}
                      className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-lg bg-surface border border-layer-line text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-left font-mono"
                      dir="ltr"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={restoreLoading || !restoreFileContent || !restorePassword}
                    className="w-full py-3 px-4 bg-primary hover:bg-primary-hover text-primary-foreground text-xs sm:text-sm font-bold rounded-lg transition-all shadow-2xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {restoreLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>
                          {bi(
                            'جاري فك تشفير وفحص الترويسة والحمولة في الذاكرة...',
                            'Decrypting & inspecting header and payload in RAM...',
                            'کردنەوەی کۆد و پشکنینی سەرپەڕ و ناوەڕۆک لە بیرگەدا لە جریان دایە...'
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4" />
                        <span>
                          {bi(
                            'فحص ومعاينة السجلات قبل الاستعادة',
                            'Inspect & Preview Records Before Restore',
                            'پشکنین و پێشبینینی تۆمارەکان پێش گەڕاندنەوە'
                          )}
                        </span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {!restoreSuccess && previewSummary && (
                /* Step B: Comparison, Mode Selection, Confirmation & Safe Execution */
                <form onSubmit={handleExecuteRestore} className="space-y-5">

                  {/* Restore Mode Selector (Replace vs Merge) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setRestoreMode('replace')}
                      className={`p-3.5 rounded-xl border text-start transition-all cursor-pointer space-y-1 ${
                        restoreMode === 'replace'
                          ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-400 dark:border-rose-700 ring-2 ring-rose-500/20'
                          : 'bg-surface border-card-line hover:border-rose-300'
                      }`}
                    >
                      <div className="font-bold text-foreground flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          {bi(
                            'استبدال شامل (Replace All)',
                            'Full Replacement (Replace)',
                            'گۆڕینی تەواو (Replace All)'
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground-1 leading-relaxed">
                        {bi(
                          'يمسح قاعدة البيانات الحالية ويستبدلها بالكامل بالنسخة الواردة.',
                          'Replaces the entire local database with the imported backup.',
                          'داتابەیسی ئێستا دەسڕێتەوە و بە تەواوی بە کۆپی هاوردەکراو جێگەی دەگرێتەوە.'
                        )}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRestoreMode('merge')}
                      className={`p-3.5 rounded-xl border text-start transition-all cursor-pointer space-y-1 ${
                        restoreMode === 'merge'
                          ? 'bg-primary/10 border-primary ring-2 ring-primary/20'
                          : 'bg-surface border-card-line hover:border-primary/40'
                      }`}
                    >
                      <div className="font-bold text-foreground flex items-center gap-1.5">
                        <GitMerge className="w-4 h-4 text-primary shrink-0" />
                        <span>
                          {bi(
                            'دمج ذكي آمن (Smart Merge)',
                            'Safe Record Merge',
                            'تێکەڵکردنی زیرەک و سەلامەت (Smart Merge)'
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground-1 leading-relaxed">
                        {bi(
                          'يدمج السجلات حسب الأحدث مع حماية السجلات السريرية النهائية المقيدة بعدم التعديل وتقرير بالتعارضات.',
                          'Merges records by newest timestamp while preserving finalized immutable SOAP records + conflict report.',
                          'تۆمارەکان بەپێی نوێترین کات تێکەڵ دەکات لەگەڵ پاراستنی تۆمارە کلینیکییە کۆتایییە نەگۆڕەکان و ڕاپۆرتی ناکۆکییەکان.'
                        )}
                      </p>
                    </button>
                  </div>

                  {/* Mode Notice Box */}
                  {restoreMode === 'replace' ? (
                    <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-300 dark:border-rose-900 rounded-xl text-rose-900 dark:text-rose-200 text-xs space-y-2">
                      <div className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-300 text-sm">
                        <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                        <span>
                          {bi(
                            'تحذير سريري حاسم: استبدال شامل دون دمج (Full Replacement — No Merge)',
                            'Critical Clinical Warning: Full Replacement (No Merge)',
                            'ئاگاداری کلینیکی یەکلاکەرەوە: گۆڕینی تەواو بێ تێکەڵکردن (Full Replacement — No Merge)'
                          )}
                        </span>
                      </div>
                      <p className="leading-relaxed">
                        {bi(
                          'عملية الاستعادة الكاملة ستستبدل قاعدة البيانات الحالية على هذا الجهاز بالكامل، ولن يتم دمج البيانات. كافة السجلات التي أُضيفت على هذا الجهاز ولم تكن موجودة في النسخة سيتم استبدالها.',
                          'Full restore will completely replace the current database on this device without merging. Any records created on this device that are not present in the backup will be replaced.',
                          'کرداری گەڕاندنەوەی تەواو بە تەواوی داتابەیسی ئێستا لەسەر ئەم ئامێرە دەگۆڕێت، و داتاکان تێکەڵ ناکرێن. هەموو ئەو تۆمارانەی لەسەر ئەم ئامێرە زیادکراون و لە کۆپییەکەدا نەبوون دەگۆڕدرێن.'
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-primary/10 border border-primary/30 rounded-xl text-foreground text-xs space-y-2">
                      <div className="flex items-center gap-2 font-bold text-primary text-sm">
                        <GitMerge className="w-5 h-5 text-primary flex-shrink-0" />
                        <span>
                          {bi(
                            'وضع الدمج المحمي (Protected Merge Mode)',
                            'Protected Merge Mode',
                            'شێوازی تێکەڵکردنی پارێزراو (Protected Merge Mode)'
                          )}
                        </span>
                      </div>
                      <p className="leading-relaxed text-muted-foreground-1">
                        {bi(
                          'لن تُستبدل السجلات السريرية النهائية المقفلة (SOAP النهائية والإضافات السريرية). عند تعارض سجل قابل للتعديل يتم اعتماد الأحدث وتوثيق كل تعارض في التقرير.',
                          'Finalized immutable SOAP notes and addenda are never overwritten. Mutable conflicts pick the newest timestamp and produce a full conflict report.',
                          'تۆمارە کلینیکییە کۆتایییە قفڵدراوەکان (SOAP کۆتایی و زیادکراوە کلینیکییەکان) هەرگیز ناگۆڕدرێن. لە کاتی ناکۆکی لە تۆمارێکی گۆڕانکاریدا نوێترینیان هەڵدەبژێردرێت و هەموو ناکۆکییەک لە ڕاپۆرتدا تۆمار دەکرێت.'
                        )}
                      </p>
                    </div>
                  )}

                  {/* Side-by-side Comparison Matrix */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    
                    {/* Incoming Backup Metadata */}
                    <div className="p-3.5 bg-muted/40 border border-card-line rounded-xl space-y-2">
                      <div className="font-bold text-foreground flex items-center gap-1.5 border-b border-card-divider pb-1.5">
                        <Upload className="w-4 h-4 text-primary" />
                        <span>
                          {bi(
                            'بيانات النسخة الاحتياطية الواردة',
                            'Incoming Backup Details',
                            'زانیارییەکانی کۆپی یەدەگی هاوردەکراو'
                          )}
                        </span>
                      </div>
                      <div className="space-y-1 text-muted-foreground-1">
                        <p className="flex justify-between">
                          <span>{bi('تاريخ إنشاء النسخة:', 'Backup created:', 'بەرواری دروستکردنی کۆپی:')}</span>
                          <strong className="text-foreground font-mono">
                            {formatClinicalDate(previewSummary.exportDateUtc, language, { includeTime: true })}
                          </strong>
                        </p>
                        <p className="flex justify-between">
                          <span>{bi('إصدار المخطط:', 'Schema version:', 'وەشانی نەخشە:')}</span>
                          <strong className="text-foreground font-mono">{previewSummary.schemaVersion}</strong>
                        </p>
                        <p className="flex justify-between">
                          <span>{bi('عدد المرضى في النسخة:', 'Patients in backup:', 'ژمارەی نەخۆشەکان لە کۆپیدا:')}</span>
                          <strong className="text-primary font-bold">
                            {previewSummary.restoredPatientCount} {bi('مريض', 'patients', 'نەخۆش')}
                          </strong>
                        </p>
                        <p className="flex justify-between">
                          <span>{bi('عدد الجلسات السريرية:', 'Clinical sessions:', 'ژمارەی دانیشتنە کلینیکییەکان:')}</span>
                          <strong className="text-primary font-bold">
                            {previewSummary.restoredSessionCount} {bi('جلسة', 'sessions', 'دانیشتن')}
                          </strong>
                        </p>
                      </div>
                    </div>

                    {/* Current Destination Database State */}
                    <div className="p-3.5 bg-muted/40 border border-card-line rounded-xl space-y-2">
                      <div className="font-bold text-foreground flex items-center gap-1.5 border-b border-card-divider pb-1.5">
                        <Database className="w-4 h-4 text-amber-600" />
                        <span>
                          {bi(
                            'الوضع الحالي على هذا الجهاز',
                            'Current State on This Device',
                            'دۆخی ئێستا لەسەر ئەم ئامێرە'
                          )}
                        </span>
                      </div>
                      <div className="space-y-1 text-muted-foreground-1">
                        <p className="flex justify-between">
                          <span>{bi('المرضى الحاليون:', 'Current patients:', 'نەخۆشەکانی ئێستا:')}</span>
                          <strong className="text-foreground font-bold">
                            {previewSummary.currentPatientCount} {bi('مريض', 'patients', 'نەخۆش')}
                          </strong>
                        </p>
                        <p className="flex justify-between">
                          <span>{bi('آخر تعديل محلي مسجل:', 'Latest local modification:', 'دوایین گۆڕانکاری ناوخۆیی تۆمارکراو:')}</span>
                          <strong className="text-foreground font-mono">
                            {previewSummary.currentLatestModificationDate
                              ? formatClinicalDate(previewSummary.currentLatestModificationDate, language, { includeTime: true })
                              : bi('لا توجد سجلات بعد', 'No records yet', 'هێشتا هیچ تۆمارێک نییە')}
                          </strong>
                        </p>
                        <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200 dark:border-amber-900 mt-2">
                          {bi(
                            'سيتم حفظ نسخة تعافٍ تلقائية (Safety Backup) للبيانات الحالية قبل التنفيذ.',
                            'An automatic Safety Backup of existing data will be saved before execution.',
                            'کۆپییەکی فریاگوزاری خۆکار (Safety Backup) بۆ داتاکانی ئێستا پاشەکەوت دەکرێت پێش جێبەجێکردن.'
                          )}
                        </p>
                      </div>
                    </div>

                  </div>

                  {/* Explicit Confirmation Checkbox */}
                  <div className="p-3.5 bg-muted rounded-xl border border-card-line">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmedDataLoss}
                        onChange={(e) => setConfirmedDataLoss(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded text-primary focus:ring-primary border-layer-line"
                      />
                      <span className="text-xs font-bold text-foreground leading-relaxed">
                        {restoreMode === 'merge'
                          ? bi(
                              'أقر بأنني راجعت مقارنة السجلات أعلاه، وأطلب تنفيذ الدمج الآمن مع الحفاظ على السجلات السريرية النهائية.',
                              'I have reviewed the comparison above and authorize safe record merging while preserving immutable clinical records.',
                              'پشتڕاستی دەکەمەوە کە بەراوردی تۆمارەکانی سەرەوەم پشکنین بۆ کردووە و داوای تێکەڵکردنی سەلامەت دەکەم لەگەڵ پاراستنی تۆمارە کلینیکییە کۆتایییەکان.'
                            )
                          : bi(
                              'أقر بأنني راجعت المقارنة أعلاه، وعلى علم تام بأن الاستعادة ستستبدل قاعدة البيانات الحالية على هذا الجهاز ولن يتم دمجها، وأطلب المتابعة.',
                              'I have reviewed the comparison above, understand that restoring will replace the current database on this device without merging, and wish to proceed.',
                              'پشتڕاستی دەکەمەوە کە بەراوردەکەی سەرەوەم پشکنین بۆ کردووە، و بە تەواوی ئاگادارم گەڕاندنەوە داتابەیسی ئێستا لەسەر ئەم ئامێرە دەگۆڕێت و تێکەڵ ناکرێت، و داوای بەردەوامبوون دەکەم.'
                            )}
                      </span>
                    </label>
                  </div>

                  {/* New Vault Password on Destination Device */}
                  <div className="space-y-3 pt-1 border-t border-card-divider">
                    <p className="text-xs font-bold text-foreground">
                      {bi(
                        'اضبط كلمة مرور الخزينة المحلية الجديدة لهذا الجهاز (لحماية المفتاح المستعاد الجديد):',
                        'Set a new local vault password for this device (to protect the restored key):',
                        'وشەی نهێنی خەزێنەی ناوخۆیی نوێ بۆ ئەم ئامێرە دابنێ (بۆ پاراستنی کلیلە گەڕێنراوە نوێیەکە):'
                      )}
                    </p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="new-vault-password-input" className="block text-xs font-medium text-muted-foreground-1 mb-1">
                          {bi('كلمة مرور الخزينة الجديدة', 'New Vault Password', 'وشەی نهێنی خەزێنەی نوێ')}
                        </label>
                        <input
                          id="new-vault-password-input"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={newVaultPassword}
                          onChange={(e) => setNewVaultPassword(e.target.value)}
                          placeholder={bi('10 خانات على الأقل', 'At least 10 characters', 'لانیکەم 10 خانە')}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-left font-mono"
                          dir="ltr"
                        />
                      </div>

                      <div>
                        <label htmlFor="confirm-new-vault-password-input" className="block text-xs font-medium text-muted-foreground-1 mb-1">
                          {bi('تأكيد كلمة المرور', 'Confirm Password', 'دڵنیابوونەوەی وشەی نهێنی')}
                        </label>
                        <input
                          id="confirm-new-vault-password-input"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={confirmNewVaultPassword}
                          onChange={(e) => setConfirmNewVaultPassword(e.target.value)}
                          placeholder={bi('أعد إدخال كلمة المرور', 'Re-enter password', 'وشەی نهێنی دووبارە بنووسەرەوە')}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-left font-mono"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dual Pre-Restore Emergency Recovery Setup */}
                  <div className="space-y-3 pt-2 border-t border-card-divider">
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl space-y-1.5 text-foreground text-xs leading-relaxed">
                      <div className="font-bold text-xs flex items-center gap-1.5 text-primary">
                        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>
                          {bi(
                            'حماية البيانات الحالية عبر استراتيجية التعافي المزدوجة (Dual Recovery)',
                            'Protect Existing Data via Dual Recovery Strategy',
                            'پاراستنی داتاکانی ئێستا لە ڕێگەی ستراتیژی فریاگوزاری دووانە (Dual Recovery)'
                          )}
                        </span>
                      </div>
                      <p className="text-muted-foreground-1">
                        {bi(
                          'قبل التنفيذ، سيتم تشفير وتصدير نسخة تعافٍ كاملة (.ptbackup) لحفظها كملف خارجي مستقل على جهازك، بالإضافة لحفظها داخلياً كشبكة أمان منطقية في قاعدة',
                          'Before execution, a complete emergency backup (.ptbackup) will be encrypted and saved externally on your device, and also stored internally as a safety net inside',
                          'پێش جێبەجێکردن، کۆپییەکی تەواوی فریاگوزاری (.ptbackup) کۆددەکرێت و وەک فایلێکی دەرەکی سەربەخۆ لەسەر ئامێرەکەت پاشەکەوت دەکرێت، سەرەڕای پاشەکەوتکردنی لە ناوخۆدا وەک تۆڕی سەلامەتی لۆژیکی لە داتابەیسی'
                        )}{' '}
                        <code>PhysioRecordEmergencyRecoveryDB</code>.
                      </p>
                      <p className="text-xs text-primary font-medium">
                        {bi(
                          '* تنبيه: التخزين المحلي للمتصفح لا يحمي من مسح بيانات الموقع أو حذف المتصفح، لذا يُلزم تصدير الملف خارج المتصفح وحفظ كلمة مروره.',
                          '* Notice: Browser storage does not protect against clearing site data or uninstalling the browser, so exporting the file externally and saving its password is required.',
                          '* ئاگاداری: کۆگای ناوخۆیی وێبگەڕ ناتپارێزێت لە سڕینەوەی داتای ماڵپەڕ یان سڕینەوەی وێبگەڕ، بۆیە پێویستە فایلەکە لە دەرەوەی وێبگەڕ هەناردە بکرێت و وشەی نهێنییەکەی بپارێزرێت.'
                        )}
                      </p>
                    </div>

                    <p className="text-xs font-bold text-foreground">
                      {bi(
                        'اضبط كلمة مرور حماية نسخة التعافي الطارئة الخارجية:',
                        'Set password for external emergency recovery backup:',
                        'وشەی نهێنی پاراستنی کۆپی فریاگوزاری لەناکاوی دەرەکی دابنێ:'
                      )}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="emergency-recovery-password-input" className="block text-xs font-medium text-muted-foreground-1 mb-1">
                          {bi(
                            'كلمة مرور نسخة التعافي الطارئة',
                            'Emergency Recovery Password',
                            'وشەی نهێنی کۆپی فریاگوزاری لەناکاو'
                          )}
                        </label>
                        <input
                          id="emergency-recovery-password-input"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={emergencyRecoveryPassword}
                          onChange={(e) => setEmergencyRecoveryPassword(e.target.value)}
                          placeholder={bi('10 خانات على الأقل', 'At least 10 characters', 'لانیکەم 10 خانە')}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-left font-mono"
                          dir="ltr"
                        />
                      </div>

                      <div>
                        <label htmlFor="confirm-emergency-recovery-password-input" className="block text-xs font-medium text-muted-foreground-1 mb-1">
                          {bi('تأكيد كلمة المرور', 'Confirm Password', 'دڵنیابوونەوەی وشەی نهێنی')}
                        </label>
                        <input
                          id="confirm-emergency-recovery-password-input"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={confirmEmergencyRecoveryPassword}
                          onChange={(e) => setConfirmEmergencyRecoveryPassword(e.target.value)}
                          placeholder={bi('أعد إدخال كلمة المرور', 'Re-enter password', 'وشەی نهێنی دووبارە بنووسەرەوە')}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-left font-mono"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    {/* Explicit Acknowledgment of External Recovery */}
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={acknowledgedExternalRecovery}
                          onChange={(e) => setAcknowledgedExternalRecovery(e.target.checked)}
                          className="w-4 h-4 mt-0.5 rounded text-amber-600 focus:ring-amber-500 border-amber-300"
                        />
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-300 leading-relaxed">
                          {bi(
                            'أقر بأنني قمت بضبط كلمة مرور نسخة التعافي الطارئة وسأقوم بتأكيد حفظ الملف الخارجي (.ptbackup)، وأدرك أن التخزين الداخلي للمتصفح لا يحمي من مسح بيانات الموقع أو حذف المتصفح.',
                            'I confirm that I set the emergency recovery password, will save the external (.ptbackup) file, and understand that browser storage does not protect against clearing site data or deleting the browser.',
                            'پشتڕاستی دەکەمەوە کە وشەی نهێنی کۆپی فریاگوزاری لەناکاوم داناوە و پاشەکەوتکردنی فایلە دەرەکییەکە (.ptbackup) پشتڕاست دەکەمەوە، و دەزانم کۆگای ناوخۆیی وێبگەڕ ناتپارێزێت لە سڕینەوەی داتای ماڵپەڕ یان سڕینەوەی وێبگەڕ.'
                          )}
                        </span>
                      </label>
                    </div>
                  </div>

                  {restoreLoading && restoreProgress !== null && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium text-muted-foreground-1">
                        <span>
                          {bi(
                            'جاري فك التشفير والمعالجة الذرية...',
                            'Decrypting & applying atomic restore...',
                            'کردنەوەی کۆد و جێبەجێکردنی گەڕاندنەوەی تەواو لە جریان دایە...'
                          )}
                        </span>
                        <span className="font-mono">{restoreProgress}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-150"
                          style={{ width: `${restoreProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setPreviewSummary(null)}
                      className="px-4 py-2.5 rounded-lg border border-layer-line bg-layer text-muted-foreground-1 hover:text-foreground text-xs font-semibold hover:bg-layer-hover cursor-pointer"
                    >
                      {bi('إلغاء والعودة', 'Cancel & Back', 'هەڵوەشاندنەوە و گەڕانەوە')}
                    </button>

                    <button
                      type="submit"
                      disabled={
                        restoreLoading ||
                        !confirmedDataLoss ||
                        !acknowledgedExternalRecovery ||
                        !newVaultPassword ||
                        !confirmNewVaultPassword ||
                        !emergencyRecoveryPassword ||
                        !confirmEmergencyRecoveryPassword
                      }
                      className={`flex-1 py-3 px-4 text-white text-xs sm:text-sm font-bold rounded-lg transition-all shadow-2xs disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer ${
                        restoreMode === 'merge'
                          ? 'bg-primary hover:bg-primary-hover text-primary-foreground'
                          : 'bg-rose-600 hover:bg-rose-700'
                      }`}
                    >
                      {restoreLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>
                            {bi(
                              'جاري توليد المفتاح الجديد، إعادة التشفير، والتبديل الذري...',
                              'Generating new key, re-encrypting & committing atomic switch...',
                              'دروستکردنی کلیلی نوێ، دووبارە کۆدکردنەوە و گۆڕینی تەواو لە جریان دایە...'
                            )}
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>
                            {restoreMode === 'merge'
                              ? bi(
                                  'تأكيد دمج السجلات مع توليد DEK جديد',
                                  'Confirm Record Merge & Rotate DEK',
                                  'پشتڕاستکردنەوەی تێکەڵکردنی تۆمارەکان و نوێکردنەوەی DEK'
                                )
                              : bi(
                                  'تأكيد واستبدال قاعدة البيانات مع توليد DEK جديد',
                                  'Confirm Database Replacement & Rotate DEK',
                                  'پشتڕاستکردنەوە و گۆڕینی داتابەیس لەگەڵ نوێکردنەوەی DEK'
                                )}
                          </span>
                        </>
                      )}
                    </button>
                  </div>

                </form>
              )}

            </div>
          )}

        </div>

    </DrawerDialog>
  );
};
