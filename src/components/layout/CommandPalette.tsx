// =======================================================================
// PhysioRecord — Global Command Palette & Instant Patient Search (Ctrl/Cmd+K)
// Provides quick actions, direct route navigation, workspace utilities,
// and Arabic-aware MiniSearch patient jumping in <= 2 keystrokes.
// =======================================================================

import React from 'react';
import {
  Command,
  X,
  UserPlus,
  PlayCircle,
  Wallet,
  Calendar,
  Database,
  BarChart3,
  TabletSmartphone,
  Users,
  CalendarClock,
  Settings,
  EyeOff,
  Sun,
  Moon,
  Lock,
  Dumbbell,
  Compass,
  BookOpen,
} from 'lucide-react';
import { ModalDialog } from '../ui/Dialog';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { getPatientDisplayName, getPatientMrn } from '../../utils/mrn';
import { formatIraqiPhoneDisplay } from '../../utils/date';
import type { PatientRecord } from '../../types/clinical';
import type { ClinicNavTab } from './Sidebar';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  highlightIdx: number;
  onHighlightIdxChange: React.Dispatch<React.SetStateAction<number>>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  filteredPatients: PatientRecord[];
  isSoloMode: boolean;
  showExerciseLibrary: boolean;
  showAnalyticsModule: boolean;
  enableKioskModule: boolean;
  hasDemoRecords: boolean;
  onOpenNewPatient: () => void;
  onNavigate: (nav: ClinicNavTab) => void;
  onOpenBookAppointment: () => void;
  onOpenNewInvoice: () => void;
  onOpenBackup: () => void;
  onOpenSettings: () => void;
  onOpenPrivacyCover: () => void;
  onOpenKiosk: () => void;
  onOpenDemoModal: () => void;
  onOpenFullWalkthrough?: () => void;
  onOpenSpotlightTour?: () => void;
  onOpenQuickGuide?: () => void;
  onLockVault: () => void;
  onSelectPatient: (patientId: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  query,
  onQueryChange,
  highlightIdx,
  onHighlightIdxChange,
  inputRef,
  filteredPatients,
  isSoloMode,
  showExerciseLibrary,
  showAnalyticsModule,
  enableKioskModule,
  hasDemoRecords,
  onOpenNewPatient,
  onNavigate,
  onOpenBookAppointment,
  onOpenNewInvoice,
  onOpenBackup,
  onOpenSettings,
  onOpenPrivacyCover,
  onOpenKiosk,
  onOpenDemoModal,
  onOpenFullWalkthrough,
  onOpenSpotlightTour,
  onOpenQuickGuide,
  onLockVault,
  onSelectPatient,
}) => {
  const { language, isRtl, bi, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const commandActions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [
      {
        id: 'new_patient',
        label: bi('تسجيل مريض جديد', 'New Patient', 'تۆمارکردنی نەخۆشی نوێ'),
        keywords: 'new patient mريض مريض جديد اضافة نەخۆش intake',
        icon: UserPlus,
        run: onOpenNewPatient,
      },
      {
        id: 'book_appointment',
        label: bi('حجز موعد جديد', 'Book Appointment', 'تۆمارکردنی نۆرەی نوێ'),
        keywords: 'book appointment schedule موعد حجز نۆرە',
        icon: Calendar,
        run: onOpenBookAppointment,
      },
      {
        id: 'new_invoice',
        label: bi('إصدار فاتورة أو دفعة', 'New Invoice / Payment', 'دەرکردنی پسوولە یان پارەدان'),
        keywords: 'record payment invoice finance دفع فاتورة مالية قبض پارەدان',
        icon: Wallet,
        run: onOpenNewInvoice,
      },
      {
        id: 'nav_today',
        label: isSoloMode
          ? bi('الانتقال إلى: اليوم والطابور', 'Go to: Today Queue', 'چوونە: ئەمڕۆ و نۆرە')
          : bi('الانتقال إلى: الاستقبال والطابور', 'Go to: Reception', 'چوونە: پێشوازی'),
        keywords: 'today queue reception session اليوم الطابور جلسة الاستقبال',
        icon: isSoloMode ? CalendarClock : PlayCircle,
        run: () => onNavigate(isSoloMode ? 'today' : 'reception'),
      },
      {
        id: 'nav_schedule',
        label: bi('الانتقال إلى: المواعيد والجدول', 'Go to: Schedule', 'چوونە: خشتەی نۆرەکان'),
        keywords: 'schedule calendar appointments المواعيد الجدول',
        icon: Calendar,
        run: () => onNavigate('schedule'),
      },
      {
        id: 'nav_directory',
        label: bi('الانتقال إلى: سجل المرضى', 'Go to: Patients Directory', 'چوونە: تۆماری نەخۆشەکان'),
        keywords: 'patients directory records المرضى السجل الدليل',
        icon: Users,
        run: () => onNavigate('directory'),
      },
      {
        id: 'nav_finance',
        label: bi('الانتقال إلى: الحسابات والمالية', 'Go to: Finance Ledger', 'چوونە: ژمێریاری'),
        keywords: 'finance ledger iqd expenses الحسابات المالية المصاريف',
        icon: Wallet,
        run: () => onNavigate('finance'),
      },
      ...(showExerciseLibrary
        ? [
            {
              id: 'nav_exercises',
              label: bi('الانتقال إلى: مكتبة التمارين (HEP)', 'Go to: Exercise Library (HEP)', 'کتێبخانەی ڕاهێنانەکان'),
              keywords: 'exercise hep تمارين',
              icon: Dumbbell,
              run: () => onNavigate('exercises'),
            },
          ]
        : []),
      ...(showAnalyticsModule
        ? [
            {
              id: 'nav_analytics',
              label: bi('الانتقال إلى: التحليلات المحلية', 'Go to: Local Analytics', t('analytics.nav')),
              keywords: 'analytics reports stats احصائيات تحليلات شیکاری',
              icon: BarChart3,
              run: () => onNavigate('analytics'),
            },
          ]
        : []),
      {
        id: 'open_settings',
        label: bi('فتح الإعدادات والخيارات', 'Open Settings', 'کردنەوەی ڕێکخستنەکان'),
        keywords: 'settings preferences currency modules backup الإعدادات العملة اللغة المظهر',
        icon: Settings,
        run: onOpenSettings,
      },
      {
        id: 'backup_now',
        label: bi('نسخ احتياطي مشفر الآن', 'Backup & Restore Now', 'پاشەکەوتی کۆدکراو ئێستا'),
        keywords: 'backup now restore ptbackup نسخ احتياطي پاشەکەوت',
        icon: Database,
        run: onOpenBackup,
      },
      {
        id: 'privacy_cover',
        label: bi('تفعيل ستار الخصوصية (Esc×2)', 'Activate Privacy Cover (Esc×2)', 'داپۆشەری نهێنی'),
        keywords: 'privacy blur hide cover خصوصية ستار اخفاء',
        icon: EyeOff,
        run: onOpenPrivacyCover,
      },
      {
        id: 'toggle_theme',
        label:
          theme === 'dark'
            ? bi('التبديل إلى الوضع النهاري', 'Switch to Light Mode', 'گۆڕین بۆ دۆخی ڕووناک')
            : bi('التبديل إلى الوضع الليلي', 'Switch to Dark Mode', 'گۆڕین بۆ دۆخی تاریک'),
        keywords: 'theme dark light ليلي نهاري مظهر',
        icon: theme === 'dark' ? Sun : Moon,
        run: toggleTheme,
      },
      ...(enableKioskModule
        ? [
            {
              id: 'launch_kiosk',
              label: bi('تشغيل وضع كشك المريض', 'Launch Patient Kiosk Mode', 'دۆخی کیۆسک'),
              keywords: 'kiosk check in tablet كشك مريض کیۆسک',
              icon: TabletSmartphone,
              run: onOpenKiosk,
            },
          ]
        : []),
      ...(hasDemoRecords
        ? [
            {
              id: 'manage_demo',
              label: bi('إدارة البيانات التجريبية (DEMO)', 'Manage Demo Data', 'بەڕێوەبردنی داتای تاقیکاری'),
              keywords: 'demo seed test بيانات تجريبية عرض',
              icon: Database,
              run: onOpenDemoModal,
            },
          ]
        : []),
      ...(onOpenFullWalkthrough
        ? [
            {
              id: 'full_app_walkthrough',
              label: bi('الجولة الشاملة لكل التطبيق', 'Full-App Walkthrough Tour', 'گەشتی گشتی بۆ هەموو ئەپەکە'),
              keywords: 'full tour walkthrough onboarding welcome جولة شاملة ترحيب شرح كل التطبيق گەشتی گشتی',
              icon: PlayCircle,
              run: onOpenFullWalkthrough,
            },
          ]
        : []),
      ...(onOpenSpotlightTour
        ? [
            {
              id: 'page_spotlight_tour',
              label: bi('جولة تسليط الضوء في هذه الصفحة', 'Spotlight Tour on This Page', 'گەشتی ڕوونکردنەوەی ئەم پەڕەیە'),
              keywords: 'tour spotlight guide help شرح جولة مساعدة دليل تفاعلي ڕێبەر',
              icon: Compass,
              run: onOpenSpotlightTour,
            },
          ]
        : []),
      ...(onOpenQuickGuide
        ? [
            {
              id: 'open_quick_guide',
              label: bi('الدليل الكامل (حاسوب / هاتف) والاختصارات', 'Full Guide (Desktop / Mobile) & Shortcuts', 'ڕێبەری تەواو (کۆمپیوتەر / مۆبایل)'),
              keywords: 'guide manual help shortcuts desktop mobile دليل مساعدة اختصارات شرح حاسبة هاتف موبايل ڕێبەر',
              icon: BookOpen,
              run: onOpenQuickGuide,
            },
          ]
        : []),
      {
        id: 'lock_vault',
        label: bi('قفل الخزينة المشفرة (Ctrl+L)', 'Lock Vault (Ctrl+L)', 'قوفڵکردنی قاسە'),
        keywords: 'lock vault security خروج قفل قاسە',
        icon: Lock,
        run: onLockVault,
      },
    ];

    if (!q) return list.slice(0, 8);
    return list.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.keywords.toLowerCase().includes(q)
    );
  }, [
    query,
    bi,
    t,
    isSoloMode,
    showExerciseLibrary,
    showAnalyticsModule,
    enableKioskModule,
    hasDemoRecords,
    theme,
    toggleTheme,
    onOpenNewPatient,
    onOpenBookAppointment,
    onOpenNewInvoice,
    onNavigate,
    onOpenSettings,
    onOpenBackup,
    onOpenPrivacyCover,
    onOpenKiosk,
    onOpenDemoModal,
    onOpenFullWalkthrough,
    onOpenSpotlightTour,
    onOpenQuickGuide,
    onLockVault,
  ]);

  const visiblePatients = filteredPatients.slice(0, 10);

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="sm"
      hideCloseButton
      hideSheetHandle
      ariaLabel={bi(
        'لوحة الأوامر والبحث السريع',
        'Command Palette & Patient Search',
        'پانێڵی فەرمانەکان و گەڕانی خێرا'
      )}
      closeLabel={bi('إغلاق البحث', 'Close search', 'داخستنی گەڕان')}
      dir={isRtl ? 'rtl' : 'ltr'}
      overlayClassName="items-start justify-center pt-10 sm:pt-20 px-3 sm:px-4"
      className="bg-card border-0 rounded-3xl rounded-b-3xl max-w-lg shadow-2xl"
      bodyClassName="flex flex-col overflow-hidden"
    >
      <div className="p-3 sm:p-3.5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center gap-2.5">
        <Command className="w-4 h-4 text-primary shrink-0" />
        <input
          ref={inputRef}
          autoFocus
          type="text"
          aria-label={bi('بحث شامل أو أمر سريع', 'Quick command or patient search', 'فەرمانی خێرا یان گەڕان')}
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            onHighlightIdxChange(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            const totalItems = commandActions.length + visiblePatients.length;
            if (totalItems === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              onHighlightIdxChange((idx) => (idx + 1) % totalItems);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              onHighlightIdxChange((idx) => (idx - 1 + totalItems) % totalItems);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const clampedIdx = Math.min(highlightIdx, totalItems - 1);
              if (clampedIdx < commandActions.length) {
                onClose();
                commandActions[clampedIdx].run();
              } else {
                const p = visiblePatients[clampedIdx - commandActions.length];
                if (p) {
                  onClose();
                  onSelectPatient(p.id);
                }
              }
            }
          }}
          placeholder={bi(
            'اكتب أمراً أو ابحث عن مريض (الاسم، الهاتف، MRN)...',
            'Type a command or search patient (name, phone, MRN)...',
            'فەرمانێک بنووسە یان بۆ نەخۆش بگەڕێ (ناو، ژمارە، MRN)...'
          )}
          className="flex-1 min-w-0 min-h-[44px] sm:min-h-[38px] bg-transparent text-base sm:text-sm text-foreground placeholder:text-muted-foreground-1 focus:outline-none border-0 pr-input-bare"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={bi('إغلاق البحث', 'Close search', 'داخستنی گەڕان')}
          className="size-11 sm:size-9 rounded-xl text-muted-foreground-1 hover:text-foreground hover:bg-surface inline-flex items-center justify-center cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        tabIndex={0}
        aria-label={bi('نتائج البحث السريع', 'Quick search results', 'ئەنجامەکانی گەڕان')}
        className="max-h-[65dvh] sm:max-h-96 overflow-y-auto divide-y divide-black/[0.05] dark:divide-white/[0.06] pb-3 focus:outline-none"
      >
        {commandActions.length > 0 && (
          <div className="p-2 space-y-1 bg-surface/40">
            <div className="px-2 py-1 text-xs font-bold text-muted-foreground-1">
              {bi('أوامر وتنقل سريع', 'Quick Actions & Jump', 'کردارە خێراکان و گەڕانەوە')}
            </div>
            {commandActions.map((act, actionIdx) => {
              const ActIcon = act.icon;
              const highlighted = highlightIdx === actionIdx;
              return (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    act.run();
                  }}
                  className={`w-full min-h-[44px] sm:min-h-[36px] px-3 py-2 rounded-xl text-start flex items-center justify-between gap-2 text-xs font-bold transition-colors cursor-pointer ${
                    highlighted
                      ? 'bg-primary/15 text-primary'
                      : 'text-foreground hover:bg-layer-hover'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <ActIcon className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate">{act.label}</span>
                  </span>
                  <span className="hidden sm:inline text-xs text-muted-foreground-1 shrink-0">↵</span>
                </button>
              );
            })}
          </div>
        )}

        {visiblePatients.length === 0 ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'لا يوجد مريض مطابق للبحث.',
                'No matching patients found.',
                'هیچ نەخۆشێک نەدۆزرایەوە کە لەگەڵ گەڕانەکە بگونجێت.'
              )}
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenNewPatient();
              }}
              className="min-h-[44px] sm:min-h-[36px] px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>{bi('+ تسجيل مريض جديد', '+ Add New Patient', '+ تۆمارکردنی نەخۆشی نوێ')}</span>
            </button>
          </div>
        ) : (
          <div>
            <div className="px-4 py-1.5 text-xs font-bold text-muted-foreground-1 bg-surface/25">
              {bi('المرضى', 'Patients', 'نەخۆشەکان')}
            </div>
            {visiblePatients.map((p, idx) => {
              const mrn = getPatientMrn(p, idx);
              const name = getPatientDisplayName(p.data, language);
              const itemIdx = commandActions.length + idx;
              const highlighted = highlightIdx === itemIdx;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectPatient(p.id);
                  }}
                  className={`w-full min-h-[48px] px-4 py-2.5 text-start flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    highlighted ? 'bg-primary/10' : 'hover:bg-layer-hover'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{name}</p>
                    <p className="text-xs text-muted-foreground-1 tabular-nums">
                      <bdi dir="ltr" className="font-mono">
                        {mrn}
                      </bdi>
                      {(p.data.phoneNumber || p.data.phone) && (
                        <>
                          {' · '}
                          <bdi dir="ltr">
                            {formatIraqiPhoneDisplay(p.data.phoneNumber || p.data.phone)}
                          </bdi>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-primary shrink-0">
                    {bi('فتح الملف', 'Open', 'کردنەوە')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ModalDialog>
  );
};
