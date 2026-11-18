import React, { useState } from 'react';
import { CheckCircle2, Database, Sparkles, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { usePatients } from '../../context/PatientContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { DemoBadge } from '../ui/Primitives';

interface DeveloperSettingsTabProps {
  hasDemoRecords: boolean;
  onCloseModal: () => void;
  onOpenDemoModal: () => void;
}

export const DeveloperSettingsTab: React.FC<DeveloperSettingsTabProps> = ({
  hasDemoRecords,
  onCloseModal,
  onOpenDemoModal,
}) => {
  const { bi } = useLanguage();
  const { deleteAllDemoPatients, refreshPatients } = usePatients();
  const [deletingDemo, setDeletingDemo] = useState(false);
  const [confirmDeleteDemo, setConfirmDeleteDemo] = useState(false);
  const [demoDeletedMsg, setDemoDeletedMsg] = useState(false);

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

  return (
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
              onCloseModal();
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
    </div>
  );
};
