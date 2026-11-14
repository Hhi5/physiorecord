// =======================================================================
// PhysioRecord — Legacy Unmigrated Items Resolution Screen (Phase 1.3)
// Allows per-item Retry, Manual JSON Import, Export, or Confirmed Discard.
// Dismissible; enforces >= 12px readable clinical text and RTL parity.
// =======================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { ModalDialog } from './ui/Dialog';
import { useVault } from '../context/VaultContext';
import { useLanguage } from '../context/LanguageContext';
import { db } from '../db/db';
import {
  LocalStorageMigrationService,
  type UnmigratedResolutionItem,
} from '../services/localStorageMigrationService';
import {
  AlertTriangle,
  RotateCcw,
  FileCode2,
  Trash2,
  Download,
  CheckCircle2,
  X,
} from 'lucide-react';

interface MigrationResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResolved?: (remainingCount: number) => void;
}

export const MigrationResolutionModal: React.FC<MigrationResolutionModalProps> = ({
  isOpen,
  onClose,
  onResolved,
}) => {
  const { dek, lastMigrationResult } = useVault();
  const { bi } = useLanguage();

  const [items, setItems] = useState<UnmigratedResolutionItem[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string>('');
  const [discardConfirmKey, setDiscardConfirmKey] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);

  const reloadItems = useCallback(() => {
    const scanned = LocalStorageMigrationService.scanUnmigratedItems(
      lastMigrationResult?.report
    );
    setItems(scanned);
    onResolved?.(scanned.length);
  }, [lastMigrationResult, onResolved]);

  useEffect(() => {
    if (isOpen) {
      setStatusError(null);
      setStatusSuccess(null);
      setEditingKey(null);
      setDiscardConfirmKey(null);
      reloadItems();
    }
  }, [isOpen, reloadItems]);

  const handleRetry = async (item: UnmigratedResolutionItem) => {
    if (!dek) return;
    setBusyKey(item.key);
    setStatusError(null);
    setStatusSuccess(null);
    try {
      await LocalStorageMigrationService.retryUnmigratedItem(item.key, dek, db);
      setStatusSuccess(
        bi(
          `تم ترحيل العنصر (${item.key}) بنجاح إلى المخزن المشفر.`,
          `Successfully migrated (${item.key}) into encrypted storage.`,
          `بڕگەی (${item.key}) بە سەرکەوتوویی گوازرایەوە بۆ خەزێنەی نهێنیکراو.`
        )
      );
      reloadItems();
    } catch (err: unknown) {
      setStatusError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر ترحيل السجل تلقائياً.',
              'Automatic migration retry failed.',
              'هەوڵی گواستنەوەی خۆکار سەرکەوتوو نەبوو.'
            )
      );
      reloadItems();
    } finally {
      setBusyKey(null);
    }
  };

  const handleManualImport = async (item: UnmigratedResolutionItem) => {
    if (!dek) return;
    setBusyKey(item.key);
    setStatusError(null);
    setStatusSuccess(null);
    try {
      await LocalStorageMigrationService.manualImportUnmigratedItem(
        item.key,
        editedText,
        dek,
        db
      );
      setEditingKey(null);
      setEditedText('');
      setStatusSuccess(
        bi(
          `تم استيراد وترحيل (${item.key}) يدوياً بنجاح.`,
          `Manually imported and migrated (${item.key}).`,
          `بڕگەی (${item.key}) بە دەستی بە سەرکەوتوویی هاوردەکرا و گوازرایەوە.`
        )
      );
      reloadItems();
    } catch (err: unknown) {
      setStatusError(
        err instanceof Error
          ? err.message
          : bi(
              'صيغة JSON غير صالحة أو فشل الاستيراد اليدوي.',
              'Invalid JSON payload or manual import failed.',
              'شێوازی JSON نادروستە یان هاوردەکردنی دەستی سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleDiscard = (item: UnmigratedResolutionItem) => {
    LocalStorageMigrationService.discardUnmigratedItem(item.key);
    setDiscardConfirmKey(null);
    setEditingKey(null);
    setStatusSuccess(
      bi(
        `تم تجاهل وحذف (${item.key}) من التخزين المؤقت.`,
        `Discarded and removed (${item.key}).`,
        `بڕگەی (${item.key}) پشتگوێ خرا و سڕدرایەوە.`
      )
    );
    reloadItems();
  };

  const handleExportAll = () => {
    if (items.length === 0) return;
    const exportPayload: Record<string, { category: string; rawValue: string; errorReason: string }> = {};
    for (const item of items) {
      exportPayload[item.key] = {
        category: item.category,
        rawValue: item.rawValue,
        errorReason: item.errorReason,
      };
    }
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `physiorecord_unmigrated_items_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const categoryLabel = (category: UnmigratedResolutionItem['category']) => {
    switch (category) {
      case 'corrupt':
        return bi('بيانات غير صالحة', 'Malformed Payload', 'داتای نادروست');
      case 'orphan_flowsheet':
        return bi(
          'ملاحظة جلسة قديمة بدون حلقة رعاية',
          'Orphan Session Flowsheet',
          'تۆماری دانیشتنی کۆن بەبێ خولی چاودێری'
        );
      case 'residual_key':
      default:
        return bi('مفتاح قديم متبقٍ', 'Residual Legacy Key', 'کلیلی کۆنی ماوە');
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="xl"
      title={bi(
        'مراجعة ومعالجة السجلات القديمة غير المرحّلة',
        'Review & Resolve Legacy Unmigrated Items',
        'پێداچوونەوە و چارەسەرکردنی تۆمارە کۆنە نەگوازراوەکان'
      )}
      subtitle={bi(
        'يمكنك إعادة محاولة الترحيل، تعديل البيانات واستيرادها يدوياً، تصديرها للنسخ، أو حذفها بعد التأكيد.',
        'Retry migration, edit and manually import JSON, export for inspection, or discard items after confirmation.',
        'دەتوانیت دووبارە هەوڵی گواستنەوە بدەیتەوە، داتای JSON دەستکاری بکەیت و بە دەستی هاوردەی بکەیت، هەناردەی بکەیت یان دوای دڵنیاکردنەوە بیسڕیتەوە.'
      )}
      closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          {items.length > 0 ? (
            <button
              type="button"
              onClick={handleExportAll}
              className="px-3 py-2 rounded-xl bg-surface border border-card-line hover:bg-layer-hover text-xs font-bold text-foreground inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="size-3.5 text-primary" />
              <span>
                {bi(
                  'تصدير كل العناصر (JSON)',
                  'Export all items (.json)',
                  'هەناردەکردنی هەموو بڕگەکان (.json)'
                )}
              </span>
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
          >
            {bi('إغلاق', 'Dismiss', 'داخستن')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {statusError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center justify-between gap-2">
            <span>{statusError}</span>
            <button type="button" onClick={() => setStatusError(null)} className="cursor-pointer">
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {statusSuccess && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{statusSuccess}</span>
          </div>
        )}

        {items.length === 0 ? (
          <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-center space-y-2">
            <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
            <p className="text-sm font-bold text-foreground">
              {bi(
                'جميع السجلات القديمة مرحّلة وآمنة',
                'All legacy storage items are resolved',
                'هەموو تۆمارە کۆنەکان گوازراونەتەوە و پارێزراون'
              )}
            </p>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'لا توجد أي مفاتيح غير مشفرة أو عالقة في التخزين المحلي المتصفح.',
                'Zero unmigrated clinical or operational keys remain in browser localStorage.',
                'هیچ کلیلێکی نەگوازراو یان نەهێنیکراو لە کۆگای ناوخۆیی وێبگەڕدا نەماوەتەوە.'
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isBusy = busyKey === item.key;
              const isEditing = editingKey === item.key;
              const isConfirmingDiscard = discardConfirmKey === item.key;

              return (
                <div
                  key={item.key}
                  className="p-4 rounded-2xl border border-card-line bg-surface space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                        <code dir="ltr" className="text-xs font-mono font-bold text-foreground break-all">
                          {item.key}
                        </code>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                          {categoryLabel(item.category)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground-1">{item.errorReason}</p>
                    </div>
                  </div>

                  {item.rawPreview && !isEditing && (
                    <pre
                      dir="ltr"
                      className="p-2.5 rounded-xl bg-layer border border-layer-line text-xs font-mono text-muted-foreground-1 overflow-x-auto max-h-24"
                    >
                      {item.rawPreview}
                    </pre>
                  )}

                  {isEditing && (
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-foreground">
                        {bi(
                          'تحرير النص الخام (JSON) قبل إعادة الاستيراد:',
                          'Edit raw payload (JSON) before importing:',
                          'دەستکاریکردنی داتای خاو (JSON) پێش دووبارە هاوردەکردن:'
                        )}
                      </label>
                      <textarea
                        dir="ltr"
                        rows={5}
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        className="w-full p-3 rounded-xl bg-layer border border-layer-line text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                      />
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingKey(null);
                            setEditedText('');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-xs font-semibold cursor-pointer"
                        >
                          {bi('إلغاء', 'Cancel')}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleManualImport(item)}
                          className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold disabled:opacity-50 cursor-pointer"
                        >
                          {isBusy
                            ? bi('جاري الاستيراد...', 'Importing...', 'هاوردەکردن لە جێبەجێکردندایە...')
                            : bi(
                                'حفظ واستيراد للمخزن المشفر',
                                'Import to Encrypted Vault',
                                'پاشەکەوتکردن و هاوردەکردن بۆ خەزێنەی نهێنیکراو'
                              )}
                        </button>
                      </div>
                    </div>
                  )}

                  {isConfirmingDiscard ? (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-rose-700 dark:text-rose-300">
                        {bi(
                          'تأكيد حذف هذا المفتاح نهائياً من المتصفح؟ لا يمكن التراجع بعد الحذف.',
                          'Permanently discard this legacy key? This cannot be undone.',
                          'دڵنیایت لە سڕینەوەی هەمیشەیی ئەم کلیلە لە وێبگەڕ؟ دوای سڕینەوە پەشیمانبوونەوە نییە.'
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDiscardConfirmKey(null)}
                          className="px-3 py-1.5 rounded-lg bg-surface border border-card-line text-xs font-semibold cursor-pointer"
                        >
                          {bi('تراجع', 'Cancel', 'پاشگەزبوونەوە')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDiscard(item)}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                        >
                          {bi('تأكيد التجاهل والحذف', 'Confirm Discard', 'دڵنیاکردنەوەی سڕینەوە')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isBusy || !dek}
                        onClick={() => void handleRetry(item)}
                        className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <RotateCcw className="size-3.5" />
                        <span>{bi('إعادة المحاولة', 'Retry', 'دووبارە هەوڵبدەرەوە')}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setDiscardConfirmKey(null);
                          setEditingKey(item.key);
                          setEditedText(item.rawValue || '{}');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileCode2 className="size-3.5 text-muted-foreground-1" />
                        <span>{bi('استيراد يدوي / تعديل', 'Manual Import', 'هاوردەکردنی دەستی / دەستکاری')}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingKey(null);
                          setDiscardConfirmKey(item.key);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                        <span>{bi('تجاهل', 'Discard', 'پشتگوێخستن')}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalDialog>
  );
};
