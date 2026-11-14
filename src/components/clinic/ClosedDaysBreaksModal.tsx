// =======================================================================
// PhysioRecord — Closed Days, Weekly Breaks, Practice Locations & Hijri Modal (Phase C2–C3)
// Lazy-loaded via React.lazy from AppointmentScheduleView.
// - WeeklyBreakWindow[] CRUD (lunch/prayer breaks, weekdays, TimePickerInput)
// - ClosedDateRangeEntry[] CRUD (custom closed dates/ranges; NO bundled holiday calendar)
// - PracticeLocationItem[] CRUD (add/edit/toggle active/delete)
// - Optional Hijri date display toggle (browser Intl Islamic calendar)
// =======================================================================

import React, { useEffect, useState } from 'react';
import {
  Building2,
  Calendar,
  CalendarOff,
  CheckCircle2,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Power,
  Trash2,
  X,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type {
  ClosedDateRangeEntry,
  PracticeLocationItem,
  PracticeLocationType,
  WeekdayIndex,
  WeeklyBreakWindow,
} from '../../types/clinicManagement';
import {
  WEEKDAYS_IRAQI_ORDER,
  formatWeekdaysSummary,
  localDate,
} from '../../utils/date';
import {
  IRAQ_GOVERNORATES,
  PRACTICE_LOCATION_TYPE_LABELS,
  formatClosedDateRangeSummary,
  formatHijriDate,
  isValidTimeRange,
} from '../../utils/iraqScheduleLocationsC1C3';
import { ModalDialog } from '../ui/Dialog';
import {
  AccessibleTab,
  AccessibleTabList,
  AccessibleTabPanel,
  AccessibleTabs,
} from '../ui/Tabs';
import { DatePickerInput, Num, TimeDisplay, TimePickerInput } from '../ui/Primitives';

export type ClosedDaysBreaksModalTab = 'breaks' | 'closed' | 'locations';

export interface ClosedDaysBreaksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  initialTab?: ClosedDaysBreaksModalTab;
}

const GOVERNORATE_CKB: Record<string, string> = {
  Baghdad: 'بەغدا',
  Basra: 'بەسرە',
  Nineveh: 'نەینەوا',
  Erbil: 'هەولێر',
  Najaf: 'نەجەف',
  Karbala: 'کەربەلا',
  Babil: 'بابل',
  Anbar: 'ئەنبار',
  Diyala: 'دیالە',
  Kirkuk: 'کەرکووک',
  Sulaymaniyah: 'سلێمانی',
  Duhok: 'دهۆک',
  Wasit: 'واست',
  Maysan: 'میسان',
  'Dhi Qar': 'زیقار',
  Muthanna: 'موسەننا',
  'Al-Qadisiyah': 'قادسیە',
  Saladin: 'سەلاحەدین',
};

const LOCATION_TYPE_CKB: Record<PracticeLocationType, string> = {
  clinic: 'کلینیکی سەرەکی',
  home_visits: 'سەردانی ماڵەوە',
  hospital: 'نەخۆشخانە',
  second_clinic: 'کلینیکی لاوەکی',
};

export const ClosedDaysBreaksModal: React.FC<ClosedDaysBreaksModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  initialTab = 'breaks',
}) => {
  const { language, isRtl, bi } = useLanguage();

  const [activeTab, setActiveTab] = useState<ClosedDaysBreaksModalTab>(initialTab);
  const [hijriEnabled, setHijriEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isHijriDateDisplayEnabled()
  );
  const [weeklyBreaks, setWeeklyBreaks] = useState<WeeklyBreakWindow[]>(() =>
    ClinicOperationsService.getWeeklyBreaks()
  );
  const [closedRanges, setClosedRanges] = useState<ClosedDateRangeEntry[]>(() =>
    ClinicOperationsService.getClosedDateRanges()
  );
  const [locations, setLocations] = useState<PracticeLocationItem[]>(() =>
    ClinicOperationsService.getPracticeLocations()
  );

  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Weekly break editor state
  const [editingBreakId, setEditingBreakId] = useState<string | null>(null);
  const [breakLabelAr, setBreakLabelAr] = useState('');
  const [breakLabelEn, setBreakLabelEn] = useState('');
  const [breakWeekdays, setBreakWeekdays] = useState<WeekdayIndex[]>([0, 1, 2, 3, 4]);
  const [breakStartTime, setBreakStartTime] = useState('13:00');
  const [breakEndTime, setBreakEndTime] = useState('14:00');
  const [breakActive, setBreakActive] = useState(true);

  // Closed date range editor state
  const [editingClosedId, setEditingClosedId] = useState<string | null>(null);
  const [closedLabelAr, setClosedLabelAr] = useState('');
  const [closedLabelEn, setClosedLabelEn] = useState('');
  const [closedStartDate, setClosedStartDate] = useState(localDate());
  const [closedEndDate, setClosedEndDate] = useState(localDate());
  const [closedNotes, setClosedNotes] = useState('');

  // Practice location editor state
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locType, setLocType] = useState<PracticeLocationType>('second_clinic');
  const [locNameAr, setLocNameAr] = useState('');
  const [locNameEn, setLocNameEn] = useState('');
  const [locGov, setLocGov] = useState('');
  const [locArea, setLocArea] = useState('');
  const [locActive, setLocActive] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setHijriEnabled(ClinicOperationsService.isHijriDateDisplayEnabled());
    setWeeklyBreaks(ClinicOperationsService.getWeeklyBreaks());
    setClosedRanges(ClinicOperationsService.getClosedDateRanges());
    setLocations(ClinicOperationsService.getPracticeLocations());
    setSavedNotice(null);
    setErrorMsg(null);
  }, [isOpen, initialTab]);

  const notifySaved = (msgAr: string, msgEn: string, msgCkb?: string) => {
    setErrorMsg(null);
    setSavedNotice(bi(msgAr, msgEn, msgCkb));
    onSaved?.();
  };

  const resetBreakForm = () => {
    setEditingBreakId(null);
    setBreakLabelAr('');
    setBreakLabelEn('');
    setBreakWeekdays([0, 1, 2, 3, 4]);
    setBreakStartTime('13:00');
    setBreakEndTime('14:00');
    setBreakActive(true);
  };

  const resetClosedForm = () => {
    setEditingClosedId(null);
    setClosedLabelAr('');
    setClosedLabelEn('');
    const today = localDate();
    setClosedStartDate(today);
    setClosedEndDate(today);
    setClosedNotes('');
  };

  const resetLocationForm = () => {
    setEditingLocationId(null);
    setLocType('second_clinic');
    setLocNameAr('');
    setLocNameEn('');
    setLocGov('');
    setLocArea('');
    setLocActive(true);
  };

  const handleToggleHijri = () => {
    const next = !hijriEnabled;
    ClinicOperationsService.setHijriDateDisplayEnabled(next);
    setHijriEnabled(next);
    notifySaved(
      next
        ? 'تم تفعيل عرض التاريخ الهجري في الجدول.'
        : 'تم إيقاف عرض التاريخ الهجري.',
      next
        ? 'Hijri date display enabled in the schedule.'
        : 'Hijri date display disabled.'
    );
  };

  // --- Weekly Break Handlers ---
  const toggleBreakWeekday = (day: WeekdayIndex) => {
    setBreakWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSaveBreak = (e: React.FormEvent) => {
    e.preventDefault();
    const ar = breakLabelAr.trim() || breakLabelEn.trim();
    const en = breakLabelEn.trim() || breakLabelAr.trim();
    if (!ar) {
      setErrorMsg(
        bi(
          'يرجى إدخال اسم فترة الاستراحة.',
          'Please enter a label for the weekly break.',
          'تکایە ناوی ماوەی پشووەکە بنووسە.'
        )
      );
      return;
    }
    if (breakWeekdays.length === 0) {
      setErrorMsg(
        bi(
          'يرجى اختيار يوم واحد على الأقل من أيام الأسبوع.',
          'Please select at least one weekday.',
          'تکایە لانیکەم یەک ڕۆژی هەفتە هەڵبژێرە.'
        )
      );
      return;
    }
    if (!isValidTimeRange(breakStartTime, breakEndTime)) {
      setErrorMsg(
        bi(
          'يجب أن يكون وقت الانتهاء بعد وقت البدء.',
          'Break end time must be after start time.',
          'کاتی کۆتایی دەبێت دوای کاتی دەستپێکردن بێت.'
        )
      );
      return;
    }

    const entry: WeeklyBreakWindow = {
      id:
        editingBreakId ||
        `brk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      labelAr: ar,
      labelEn: en,
      weekdays: [...breakWeekdays],
      startTime: breakStartTime,
      endTime: breakEndTime,
      isActive: breakActive,
    };

    const nextList = editingBreakId
      ? weeklyBreaks.map((b) => (b.id === editingBreakId ? entry : b))
      : [...weeklyBreaks, entry];

    const saved = ClinicOperationsService.saveWeeklyBreaks(nextList);
    setWeeklyBreaks(saved);
    resetBreakForm();
    notifySaved('تم حفظ الاستراحة الأسبوعية.', 'Weekly break saved.', 'پشووی هەفتانە پاشەکەوت کرا.');
  };

  const handleEditBreak = (brk: WeeklyBreakWindow) => {
    setEditingBreakId(brk.id);
    setBreakLabelAr(brk.labelAr);
    setBreakLabelEn(brk.labelEn);
    setBreakWeekdays([...brk.weekdays]);
    setBreakStartTime(brk.startTime);
    setBreakEndTime(brk.endTime);
    setBreakActive(brk.isActive);
    setErrorMsg(null);
  };

  const handleToggleBreakActive = (id: string) => {
    const nextList = weeklyBreaks.map((b) =>
      b.id === id ? { ...b, isActive: !b.isActive } : b
    );
    const saved = ClinicOperationsService.saveWeeklyBreaks(nextList);
    setWeeklyBreaks(saved);
    notifySaved('تم تحديث حالة الاستراحة.', 'Break status updated.');
  };

  const handleDeleteBreak = (id: string) => {
    const nextList = weeklyBreaks.filter((b) => b.id !== id);
    const saved = ClinicOperationsService.saveWeeklyBreaks(nextList);
    setWeeklyBreaks(saved);
    if (editingBreakId === id) resetBreakForm();
    notifySaved('تم حذف فترة الاستراحة.', 'Weekly break removed.');
  };

  // --- Closed Date Range Handlers ---
  const handleSaveClosedRange = (e: React.FormEvent) => {
    e.preventDefault();
    const ar = closedLabelAr.trim() || closedLabelEn.trim();
    const en = closedLabelEn.trim() || closedLabelAr.trim();
    if (!ar) {
      setErrorMsg(
        bi(
          'يرجى إدخال سبب أو مسمى يوم الإغلاق.',
          'Please enter a label for the closed date/range.',
          'تکایە ناو یان هۆکاری ڕۆژی داخستنەکە بنووسە.'
        )
      );
      return;
    }
    if (!closedStartDate) {
      setErrorMsg(
        bi(
          'يرجى تحديد تاريخ البدء.',
          'Please select a start date.',
          'تکایە بەرواری دەستپێکردن دیاری بکە.'
        )
      );
      return;
    }
    const resolvedEnd = closedEndDate || closedStartDate;
    if (resolvedEnd < closedStartDate) {
      setErrorMsg(
        bi(
          'تاريخ الانتهاء لا يمكن أن يكون قبل تاريخ البدء.',
          'End date cannot be earlier than start date.',
          'بەرواری کۆتایی ناتوانێت پێش بەرواری دەستپێکردن بێت.'
        )
      );
      return;
    }

    const entry: ClosedDateRangeEntry = {
      id:
        editingClosedId ||
        `closed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      labelAr: ar,
      labelEn: en,
      startDate: closedStartDate,
      endDate: resolvedEnd,
      ...(closedNotes.trim() ? { notes: closedNotes.trim() } : {}),
    };

    const nextList = editingClosedId
      ? closedRanges.map((c) => (c.id === editingClosedId ? entry : c))
      : [entry, ...closedRanges];

    const saved = ClinicOperationsService.saveClosedDateRanges(nextList);
    setClosedRanges(saved);
    resetClosedForm();
    notifySaved('تم حفظ فترة الإغلاق بنجاح.', 'Closed date range saved.', 'ماوەی داخستن بە سەرکەوتوویی پاشەکەوت کرا.');
  };

  const handleEditClosedRange = (entry: ClosedDateRangeEntry) => {
    setEditingClosedId(entry.id);
    setClosedLabelAr(entry.labelAr);
    setClosedLabelEn(entry.labelEn);
    setClosedStartDate(entry.startDate);
    setClosedEndDate(entry.endDate || entry.startDate);
    setClosedNotes(entry.notes || '');
    setErrorMsg(null);
  };

  const handleDeleteClosedRange = (id: string) => {
    const nextList = closedRanges.filter((c) => c.id !== id);
    const saved = ClinicOperationsService.saveClosedDateRanges(nextList);
    setClosedRanges(saved);
    if (editingClosedId === id) resetClosedForm();
    notifySaved('تم حذف يوم الإغلاق.', 'Closed date entry removed.');
  };

  // --- Practice Location Handlers ---
  const handleSaveLocation = (e: React.FormEvent) => {
    e.preventDefault();
    const ar = locNameAr.trim() || locNameEn.trim();
    const en = locNameEn.trim() || locNameAr.trim();
    if (!ar) {
      setErrorMsg(
        bi(
          'يرجى إدخال اسم الموقع.',
          'Please enter a practice location name.',
          'تکایە ناوی شوێنی کارکردنەکە بنووسە.'
        )
      );
      return;
    }

    const existing = editingLocationId
      ? locations.find((l) => l.id === editingLocationId)
      : undefined;

    const entry: PracticeLocationItem = {
      id:
        editingLocationId ||
        `loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: locType,
      nameAr: ar,
      nameEn: en,
      ...(locGov.trim() ? { governorate: locGov.trim() } : {}),
      ...(locArea.trim() ? { area: locArea.trim() } : {}),
      isDefault: existing?.isDefault,
      isActive: locActive,
    };

    const nextList = editingLocationId
      ? locations.map((l) => (l.id === editingLocationId ? entry : l))
      : [...locations, entry];

    const saved = ClinicOperationsService.savePracticeLocations(nextList);
    setLocations(saved);
    resetLocationForm();
    notifySaved('تم حفظ موقع العمل.', 'Practice location saved.', 'شوێنی کارکردن پاشەکەوت کرا.');
  };

  const handleEditLocation = (loc: PracticeLocationItem) => {
    setEditingLocationId(loc.id);
    setLocType(loc.type);
    setLocNameAr(loc.nameAr);
    setLocNameEn(loc.nameEn);
    setLocGov(loc.governorate || '');
    setLocArea(loc.area || '');
    setLocActive(loc.isActive !== false);
    setErrorMsg(null);
  };

  const handleToggleLocationActive = (id: string) => {
    const target = locations.find((l) => l.id === id);
    if (!target) return;
    const currentlyActiveCount = locations.filter((l) => l.isActive !== false).length;
    if (target.isActive !== false && currentlyActiveCount <= 1) {
      setErrorMsg(
        bi(
          'يجب أن يبقى موقع واحد نشطاً على الأقل.',
          'At least one practice location must remain active.',
          'دەبێت لانیکەم یەک شوێنی کارکردن بە چالاکی بمێنێتەوە.'
        )
      );
      return;
    }
    const nextList = locations.map((l) =>
      l.id === id ? { ...l, isActive: l.isActive === false } : l
    );
    const saved = ClinicOperationsService.savePracticeLocations(nextList);
    setLocations(saved);
    notifySaved('تم تحديث حالة الموقع.', 'Location status updated.', 'دۆخی شوێنەکە نوێکرایەوە.');
  };

  const handleDeleteLocation = (loc: PracticeLocationItem) => {
    if (loc.isDefault || locations.length <= 1) {
      setErrorMsg(
        bi(
          'لا يمكن حذف الموقع الافتراضي الأساسي.',
          'The default primary location cannot be deleted.',
          'شوێنی بنەڕەتیی سەرەکی ناتوانرێت بسڕدرێتەوە.'
        )
      );
      return;
    }
    const nextList = locations.filter((l) => l.id !== loc.id);
    const saved = ClinicOperationsService.savePracticeLocations(nextList);
    setLocations(saved);
    if (editingLocationId === loc.id) resetLocationForm();
    notifySaved('تم حذف الموقع.', 'Location removed.', 'شوێنەکە سڕایەوە.');
  };

  const todayHijriPreview = formatHijriDate(localDate(), language);

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
      title={bi(
        'إدارة أيام الإغلاق، الاستراحات، مواقع العمل والتقويم',
        'Closed Days, Breaks, Practice Locations & Calendar',
        'بەڕێوەبردنی ڕۆژانی داخستن، پشووەکان، شوێنەکانی کار و ڕۆژژمێر'
      )}
      subtitle={bi(
        'إعدادات محلية بالكامل لتنظيم فترات الاستراحة الأسبوعية وأيام الإغلاق ومواقع الخدمة.',
        'Offline clinic settings for weekly breaks, custom closed dates, practice locations, and Hijri display.',
        'ڕێکخستنی تەواو ناوخۆیی بۆ ڕێکخستنی پشووە هەفتانەکان، ڕۆژانی داخستن و شوێنەکانی خزمەتگوزاری.'
      )}
      closeLabel={bi('إغلاق', 'Close', 'داخستن')}
      footer={
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          className="w-full flex items-center justify-between gap-3"
        >
          <span className="text-xs text-muted-foreground-1">
            {bi(
              'تُحفظ التعديلات محلياً داخل الخزينة المشفرة.',
              'All changes are saved locally inside the encrypted vault.',
              'هەموو گۆڕانکارییەکان بە شێوەی ناوخۆیی لەناو خەزێنەی کۆدکراودا پاشەکەوت دەکرێن.'
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold shadow-xs cursor-pointer"
          >
            {bi('تم وإغلاق', 'Done', 'تەواو و داخستن')}
          </button>
        </div>
      }
    >
      <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-4 text-xs">
        <datalist id="iraq-governorates-modal-list">
          {IRAQ_GOVERNORATES.map((gov) => (
            <option
              key={gov.en}
              value={bi(gov.ar, gov.en, GOVERNORATE_CKB[gov.en] || gov.ar)}
            />
          ))}
        </datalist>

        {/* Feedback Banners */}
        {savedNotice && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{savedNotice}</span>
            </span>
            <button
              type="button"
              onClick={() => setSavedNotice(null)}
              aria-label={bi('إخفاء الإشعار', 'Dismiss notice', 'شاردنەوەی ئاگادارکردنەوە')}
              className="p-1 rounded-lg hover:bg-emerald-500/20 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 font-semibold flex items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              aria-label={bi('إغفاء التنبيه', 'Dismiss error', 'شاردنەوەی هەڵە')}
              className="p-1 rounded-lg hover:bg-rose-500/20 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* Optional Hijri Date Display Toggle Card */}
        <div className="p-3.5 rounded-xl bg-surface border border-line-2 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="font-bold text-foreground flex flex-wrap items-center gap-2">
              <Calendar className="size-4 text-primary shrink-0" />
              <span>
                {bi(
                  'عرض التاريخ الهجري في الجدول (اختياري)',
                  'Optional Hijri Date Display in Schedule',
                  'پیشاندانی بەرواری کۆچی لە خشتەکەدا (ئارەزوومەندانە)'
                )}
              </span>
              {hijriEnabled && todayHijriPreview && (
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                  {todayHijriPreview}
                </span>
              )}
            </div>
            <p className="text-muted-foreground-1 leading-relaxed">
              {bi(
                'يعرض التاريخ الهجري بجانب التاريخ الميلادي باستخدام تنسيق المتصفح المحلي دون أي اتصال بالإنترنت.',
                'Displays the Islamic (Hijri) date alongside Gregorian dates using offline browser Intl formatting.',
                'بەرواری کۆچی لە تەنیشت بەرواری زایینی پیشان دەدات بە بەکارهێنانی شێوازی ناوخۆیی وێبگەڕ بەبێ هیچ هێڵی ئینتەرنێت.'
              )}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={hijriEnabled}
            aria-label={bi(
              'تفعيل أو إيقاف عرض التاريخ الهجري',
              'Toggle Hijri date display',
              'چالاککردن یان ناچالاککردنی پیشاندانی بەرواری کۆچی'
            )}
            onClick={handleToggleHijri}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
              hijriEnabled
                ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                : 'bg-layer text-foreground border-layer-line hover:bg-layer-hover'
            }`}
          >
            {hijriEnabled
              ? bi('مفعّل', 'Enabled', 'چالاکە')
              : bi('معطّل', 'Disabled', 'ناچالاکە')}
          </button>
        </div>

        {/* Section Tabs */}
        <AccessibleTabs
          selectedKey={activeTab}
          onSelectionChange={(key) => {
            setActiveTab(key as ClosedDaysBreaksModalTab);
            setErrorMsg(null);
          }}
        >
          <AccessibleTabList
            ariaLabel={bi(
              'أقسام إدارة الجدول والمواقع',
              'Schedule and Location Management Tabs',
              'بەشەکانی بەڕێوەبردنی خشتە و شوێنەکان'
            )}
            className="pb-2 border-b border-card-divider"
          >
            <AccessibleTab id="breaks">
              <Clock className="size-3.5" />
              <span>{bi('الاستراحات الأسبوعية', 'Weekly Breaks', 'پشووە هەفتانەکان')}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-surface text-foreground tabular-nums">
                <Num value={weeklyBreaks.length} />
              </span>
            </AccessibleTab>

            <AccessibleTab id="closed">
              <CalendarOff className="size-3.5" />
              <span>{bi('أيام الإغلاق المخصصة', 'Closed Days', 'ڕۆژانی داخستن')}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-surface text-foreground tabular-nums">
                <Num value={closedRanges.length} />
              </span>
            </AccessibleTab>

            <AccessibleTab id="locations">
              <Building2 className="size-3.5" />
              <span>{bi('مواقع العمل', 'Practice Locations', 'شوێنەکانی کارکردن')}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-surface text-foreground tabular-nums">
                <Num value={locations.length} />
              </span>
            </AccessibleTab>
          </AccessibleTabList>

          {/* TAB 1: WEEKLY BREAKS */}
          <AccessibleTabPanel id="breaks" className="pt-4 space-y-4">
            <form
              onSubmit={handleSaveBreak}
              className="p-4 rounded-2xl bg-surface/70 border border-line-2 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-foreground">
                  {editingBreakId
                    ? bi('تعديل فترة الاستراحة', 'Edit Weekly Break', 'دەستکاریکردنی ماوەی پشوو')
                    : bi(
                        '+ إضافة استراحة أسبوعية (مثل الغداء / الصلاة)',
                        '+ Add Weekly Break (e.g., Lunch / Prayer)',
                        '+ زیادکردنی پشووی هەفتانە (وەک نانی نیوەڕۆ / نوێژ)'
                      )}
                </h4>
                {editingBreakId && (
                  <button
                    type="button"
                    onClick={resetBreakForm}
                    className="text-xs font-semibold text-muted-foreground-1 hover:text-foreground cursor-pointer"
                  >
                    {bi('إلغاء التعديل', 'Cancel Edit', 'هەڵوەشاندنەوەی دەستکاری')}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('اسم الاستراحة (عربي): *', 'Break Label (Arabic): *', 'ناوی پشوو (عەرەبی/کوردی): *')}
                  </label>
                  <input
                    type="text"
                    value={breakLabelAr}
                    onChange={(e) => setBreakLabelAr(e.target.value)}
                    placeholder={bi(
                      'مثال: استراحة الغداء والصلاة',
                      'e.g., استراحة الغداء',
                      'نموونە: پشووی نانی نیوەڕۆ و نوێژ'
                    )}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('الاسم بالإنجليزية (اختياري):', 'Break Label (English):', 'ناو بە ئینگلیزی (ئارەزوومەندانە):')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={breakLabelEn}
                    onChange={(e) => setBreakLabelEn(e.target.value)}
                    placeholder="e.g., Lunch / Prayer Break"
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="font-semibold text-foreground">
                    {bi('أيام الأسبوع:', 'Weekdays:', 'ڕۆژەکانی هەفتە:')}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setBreakWeekdays([0, 1, 2, 3, 4])}
                      className="px-2 py-0.5 rounded-md border border-line-2 bg-card text-primary font-semibold cursor-pointer"
                    >
                      {bi('أحد–خميس', 'Sun–Thu', 'یەک–پێنج')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBreakWeekdays([6, 0, 1, 2, 3, 4])}
                      className="px-2 py-0.5 rounded-md border border-line-2 bg-card text-primary font-semibold cursor-pointer"
                    >
                      {bi('سبت–خميس', 'Sat–Thu', 'شەم–پێنج')}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {WEEKDAYS_IRAQI_ORDER.map((day) => {
                    const selected = breakWeekdays.includes(day.index);
                    return (
                      <button
                        key={day.index}
                        type="button"
                        onClick={() => toggleBreakWeekday(day.index)}
                        className={`py-2 px-1 rounded-xl font-bold border text-center transition-colors cursor-pointer ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                            : 'bg-card text-foreground border-layer-line hover:bg-layer-hover'
                        }`}
                      >
                        {bi(day.ar, day.shortEn, day.ckb)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('من الساعة:', 'Start Time:', 'لە کاتژمێر:')}
                  </label>
                  <TimePickerInput
                    value={breakStartTime}
                    onChange={setBreakStartTime}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('إلى الساعة:', 'End Time:', 'تا کاتژمێر:')}
                  </label>
                  <TimePickerInput value={breakEndTime} onChange={setBreakEndTime} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 font-semibold text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={breakActive}
                      onChange={(e) => setBreakActive(e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    <span>{bi('مفعّلة', 'Active', 'چالاک')}</span>
                  </label>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>
                      {editingBreakId
                        ? bi('تحديث', 'Update', 'نوێکردنەوە')
                        : bi('إضافة', 'Add', 'زیادکردن')}
                    </span>
                  </button>
                </div>
              </div>
            </form>

            {/* Existing Breaks List */}
            <div className="space-y-2">
              {weeklyBreaks.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground-1">
                  {bi(
                    'لا توجد فترات استراحة مضافة حالياً.',
                    'No weekly breaks configured yet.',
                    'لە ئێستادا هیچ ماوەیەکی پشوو زیاد نەکراوە.'
                  )}
                </p>
              ) : (
                weeklyBreaks.map((brk) => (
                  <div
                    key={brk.id}
                    className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                      brk.isActive
                        ? 'bg-card border-card-line'
                        : 'bg-muted/40 border-line-2 text-muted-foreground-1'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-foreground">
                          {bi(
                            brk.labelAr || brk.labelEn,
                            brk.labelEn || brk.labelAr,
                            brk.labelAr || brk.labelEn
                          )}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            brk.isActive
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-surface text-muted-foreground-1 border border-line-2'
                          }`}
                        >
                          {brk.isActive
                            ? bi('نشط', 'Active', 'چالاک')
                            : bi('متوقف', 'Paused', 'وەستێنراو')}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground-1">
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                          <TimeDisplay time={brk.startTime} />
                          <span>—</span>
                          <TimeDisplay time={brk.endTime} />
                        </span>
                        <span>·</span>
                        <span>{formatWeekdaysSummary(brk.weekdays, language)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleBreakActive(brk.id)}
                        title={
                          brk.isActive
                            ? bi('إيقاف الاستراحة', 'Pause break', 'وەستاندنی پشوو')
                            : bi('تفعيل الاستراحة', 'Activate break', 'چالاککردنی پشوو')
                        }
                        aria-label={
                          brk.isActive
                            ? bi(
                                `إيقاف ${brk.labelAr}`,
                                `Pause ${brk.labelEn}`,
                                `وەستاندنی ${brk.labelAr || brk.labelEn}`
                              )
                            : bi(
                                `تفعيل ${brk.labelAr}`,
                                `Activate ${brk.labelEn}`,
                                `چالاککردنی ${brk.labelAr || brk.labelEn}`
                              )
                        }
                        className="p-2 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground cursor-pointer"
                      >
                        <Power className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditBreak(brk)}
                        title={bi('تعديل', 'Edit', 'دەستکاری')}
                        aria-label={bi(
                          `تعديل ${brk.labelAr}`,
                          `Edit ${brk.labelEn}`,
                          `دەستکاریکردنی ${brk.labelAr || brk.labelEn}`
                        )}
                        className="p-2 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground cursor-pointer"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBreak(brk.id)}
                        title={bi('حذف', 'Delete', 'سڕینەوە')}
                        aria-label={bi(
                          `حذف ${brk.labelAr}`,
                          `Delete ${brk.labelEn}`,
                          `سڕینەوەی ${brk.labelAr || brk.labelEn}`
                        )}
                        className="p-2 rounded-xl border border-layer-line bg-layer hover:bg-rose-500/10 hover:text-rose-600 text-muted-foreground-1 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </AccessibleTabPanel>

          {/* TAB 2: CLOSED DAYS & DATE RANGES */}
          <AccessibleTabPanel id="closed" className="pt-4 space-y-4">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 leading-relaxed font-medium">
              {bi(
                'ملاحظة: لا يتضمن التطبيق تقويم عطل رسمية مدمجاً مسبقاً؛ تقوم كل عيادة بإدخال تواريخ أو فترات الإغلاق الخاصة بها هنا يدوياً (مثل العطل أو الصيانة أو الإجازات).',
                'Note: No pre-bundled official holiday calendar is shipped. Each clinic enters its own custom closed dates or date ranges here (holidays, maintenance, or leave).',
                'تێبینی: بەرنامەکە ڕۆژژمێری پشووی فەرمی پێشوەختەی تێدا نییە؛ هەر کلینیکێک بە دەست بەروار یان ماوەی داخستنەکانی خۆی لێرە تۆمار دەکات (پشوو، نۆژەنکردنەوە یان مۆڵەت).'
              )}
            </div>

            <form
              onSubmit={handleSaveClosedRange}
              className="p-4 rounded-2xl bg-surface/70 border border-line-2 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-foreground">
                  {editingClosedId
                    ? bi('تعديل يوم / فترة إغلاق', 'Edit Closed Date / Range', 'دەستکاریکردنی ڕۆژ / ماوەی داخستن')
                    : bi('+ إضافة يوم أو فترة إغلاق', '+ Add Closed Date or Range', '+ زیادکردنی ڕۆژ یان ماوەی داخستن')}
                </h4>
                {editingClosedId && (
                  <button
                    type="button"
                    onClick={resetClosedForm}
                    className="text-xs font-semibold text-muted-foreground-1 hover:text-foreground cursor-pointer"
                  >
                    {bi('إلغاء التعديل', 'Cancel Edit', 'هەڵوەشاندنەوەی دەستکاری')}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('سبب الإغلاق (عربي): *', 'Closure Label (Arabic): *', 'هۆکاری داخستن (عەرەبی/کوردی): *')}
                  </label>
                  <input
                    type="text"
                    value={closedLabelAr}
                    onChange={(e) => setClosedLabelAr(e.target.value)}
                    placeholder={bi('مثال: إغلاق العيادة / عطلة', 'e.g., عطلة العيادة', 'نموونە: داخستنی کلینیک / پشوو')}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('المسمى بالإنجليزية (اختياري):', 'Closure Label (English):', 'ناو بە ئینگلیزی (ئارەزوومەندانە):')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={closedLabelEn}
                    onChange={(e) => setClosedLabelEn(e.target.value)}
                    placeholder="e.g., Clinic Closed / Leave"
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('من تاريخ:', 'Start Date:', 'لە بەرواری:')}
                  </label>
                  <DatePickerInput
                    value={closedStartDate}
                    onChange={(val) => {
                      setClosedStartDate(val);
                      if (!closedEndDate || closedEndDate < val) {
                        setClosedEndDate(val);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi(
                      'إلى تاريخ (نفس اليوم ليوم واحد):',
                      'End Date (same day for 1 day):',
                      'تا بەرواری (هەمان ڕۆژ بۆ یەک ڕۆژ):'
                    )}
                  </label>
                  <DatePickerInput
                    value={closedEndDate}
                    min={closedStartDate}
                    onChange={setClosedEndDate}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1">
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('ملاحظات إضافية (اختياري):', 'Notes (Optional):', 'تێبینی زیادە (ئارەزوومەندانە):')}
                  </label>
                  <input
                    type="text"
                    value={closedNotes}
                    onChange={(e) => setClosedNotes(e.target.value)}
                    placeholder={bi(
                      'مثال: تقتصر الحالات الطارئة على الاتصال',
                      'e.g., Emergency calls only',
                      'نموونە: حاڵەتە فریاگوزارییەکان تەنها بە تەلەفۆن'
                    )}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="submit"
                  className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="size-3.5" />
                  <span>
                    {editingClosedId
                      ? bi('تحديث', 'Update', 'نوێکردنەوە')
                      : bi('إضافة', 'Add', 'زیادکردن')}
                  </span>
                </button>
              </div>
            </form>

            {/* Closed Ranges List */}
            <div className="space-y-2">
              {closedRanges.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground-1">
                  {bi(
                    'لم تُسجّل أي أيام إغلاق بعد.',
                    'No custom closed dates recorded yet.',
                    'هێشتا هیچ ڕۆژێکی داخستن تۆمار نەکراوە.'
                  )}
                </p>
              ) : (
                closedRanges.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-3.5 rounded-xl bg-card border border-card-line flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="font-bold text-foreground">
                        {bi(
                          entry.labelAr || entry.labelEn,
                          entry.labelEn || entry.labelAr,
                          entry.labelAr || entry.labelEn
                        )}
                      </div>
                      <div className="text-muted-foreground-1 flex flex-wrap items-center gap-2">
                        <bdi dir="ltr" className="font-semibold text-primary tabular-nums">
                          {formatClosedDateRangeSummary(entry)}
                        </bdi>
                        {entry.notes && <span>· {entry.notes}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditClosedRange(entry)}
                        title={bi('تعديل', 'Edit', 'دەستکاری')}
                        aria-label={bi(
                          `تعديل ${entry.labelAr}`,
                          `Edit ${entry.labelEn}`,
                          `دەستکاریکردنی ${entry.labelAr || entry.labelEn}`
                        )}
                        className="p-2 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground cursor-pointer"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClosedRange(entry.id)}
                        title={bi('حذف', 'Delete', 'سڕینەوە')}
                        aria-label={bi(
                          `حذف ${entry.labelAr}`,
                          `Delete ${entry.labelEn}`,
                          `سڕینەوەی ${entry.labelAr || entry.labelEn}`
                        )}
                        className="p-2 rounded-xl border border-layer-line bg-layer hover:bg-rose-500/10 hover:text-rose-600 text-muted-foreground-1 cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </AccessibleTabPanel>

          {/* TAB 3: PRACTICE LOCATIONS */}
          <AccessibleTabPanel id="locations" className="pt-4 space-y-4">
            <form
              onSubmit={handleSaveLocation}
              className="p-4 rounded-2xl bg-surface/70 border border-line-2 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-foreground">
                  {editingLocationId
                    ? bi('تعديل موقع العمل', 'Edit Practice Location', 'دەستکاریکردنی شوێنی کارکردن')
                    : bi('+ إضافة موقع عمل / فرع جديد', '+ Add Practice Location', '+ زیادکردنی شوێنی کار / لق')}
                </h4>
                {editingLocationId && (
                  <button
                    type="button"
                    onClick={resetLocationForm}
                    className="text-xs font-semibold text-muted-foreground-1 hover:text-foreground cursor-pointer"
                  >
                    {bi('إلغاء التعديل', 'Cancel Edit', 'هەڵوەشاندنەوەی دەستکاری')}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('نوع الموقع:', 'Location Type:', 'جۆری شوێن:')}
                  </label>
                  <select
                    value={locType}
                    onChange={(e) => setLocType(e.target.value as PracticeLocationType)}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  >
                    {(
                      Object.keys(PRACTICE_LOCATION_TYPE_LABELS) as PracticeLocationType[]
                    ).map((key) => (
                      <option key={key} value={key}>
                        {bi(
                          PRACTICE_LOCATION_TYPE_LABELS[key].ar,
                          PRACTICE_LOCATION_TYPE_LABELS[key].en,
                          LOCATION_TYPE_CKB[key]
                        )}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('الاسم بالعربية: *', 'Name (Arabic): *', 'ناو بە عەرەبی/کوردی: *')}
                  </label>
                  <input
                    type="text"
                    value={locNameAr}
                    onChange={(e) => setLocNameAr(e.target.value)}
                    placeholder={bi('مثال: مستشفى الكندي', 'e.g., فرع المنصور', 'نموونە: نەخۆشخانەی سەرەکی / لق')}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('الاسم بالإنجليزية (اختياري):', 'Name (English):', 'ناو بە ئینگلیزی (ئارەزوومەندانە):')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={locNameEn}
                    onChange={(e) => setLocNameEn(e.target.value)}
                    placeholder="e.g., Mansour Branch"
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('المحافظة (اختياري):', 'Governorate (Optional):', 'پارێزگا (ئارەزوومەندانە):')}
                  </label>
                  <input
                    type="text"
                    list="iraq-governorates-modal-list"
                    value={locGov}
                    onChange={(e) => setLocGov(e.target.value)}
                    placeholder={bi('مثال: بغداد', 'e.g., Baghdad', 'نموونە: هەولێر / بەغدا')}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    {bi('المنطقة / الحي (اختياري):', 'Area / District (Optional):', 'ناوچە / گەڕەک (ئارەزوومەندانە):')}
                  </label>
                  <input
                    type="text"
                    value={locArea}
                    onChange={(e) => setLocArea(e.target.value)}
                    placeholder={bi('مثال: الكرادة / المنصور', 'e.g., Karrada / Mansour', 'نموونە: ئەندازیاران / مەنسوور')}
                    className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 font-semibold text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={locActive}
                      onChange={(e) => setLocActive(e.target.checked)}
                      className="size-4 rounded accent-primary"
                    />
                    <span>{bi('نشط', 'Active', 'چالاک')}</span>
                  </label>
                  <button
                    type="submit"
                    className="py-2 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>
                      {editingLocationId
                        ? bi('تحديث', 'Update', 'نوێکردنەوە')
                        : bi('إضافة', 'Add', 'زیادکردن')}
                    </span>
                  </button>
                </div>
              </div>
            </form>

            {/* Locations List */}
            <div className="space-y-2">
              {locations.map((loc) => {
                const active = loc.isActive !== false;
                const typeLabel = bi(
                  PRACTICE_LOCATION_TYPE_LABELS[loc.type].ar,
                  PRACTICE_LOCATION_TYPE_LABELS[loc.type].en,
                  LOCATION_TYPE_CKB[loc.type]
                );
                return (
                  <div
                    key={loc.id}
                    className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                      active
                        ? 'bg-card border-card-line'
                        : 'bg-muted/40 border-line-2 text-muted-foreground-1'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <MapPin className="size-3.5 text-primary shrink-0" />
                        <span className="font-bold text-foreground">
                          {bi(
                            loc.nameAr || loc.nameEn,
                            loc.nameEn || loc.nameAr,
                            loc.nameAr || loc.nameEn
                          )}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-surface border border-line-2 text-muted-foreground-1 font-semibold">
                          {typeLabel}
                        </span>
                        {loc.isDefault && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                            {bi('أساسي', 'Default', 'بنەڕەتی')}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            active
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-surface text-muted-foreground-1 border border-line-2'
                          }`}
                        >
                          {active
                            ? bi('نشط', 'Active', 'چالاک')
                            : bi('معطّل', 'Inactive', 'ناچالاک')}
                        </span>
                      </div>
                      {(loc.governorate || loc.area) && (
                        <div className="text-muted-foreground-1">
                          {[loc.governorate, loc.area].filter(Boolean).join(' — ')}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleLocationActive(loc.id)}
                        title={
                          active
                            ? bi('تعطيل الموقع', 'Deactivate location', 'ناچالاککردنی شوێن')
                            : bi('تفعيل الموقع', 'Activate location', 'چالاککردنی شوێن')
                        }
                        aria-label={
                          active
                            ? bi(
                                `تعطيل ${loc.nameAr}`,
                                `Deactivate ${loc.nameEn}`,
                                `ناچالاککردنی ${loc.nameAr || loc.nameEn}`
                              )
                            : bi(
                                `تفعيل ${loc.nameAr}`,
                                `Activate ${loc.nameEn}`,
                                `چالاککردنی ${loc.nameAr || loc.nameEn}`
                              )
                        }
                        className="p-2 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground cursor-pointer"
                      >
                        <Power className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditLocation(loc)}
                        title={bi('تعديل', 'Edit', 'دەستکاری')}
                        aria-label={bi(
                          `تعديل ${loc.nameAr}`,
                          `Edit ${loc.nameEn}`,
                          `دەستکاریکردنی ${loc.nameAr || loc.nameEn}`
                        )}
                        className="p-2 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground cursor-pointer"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(loc.isDefault) || locations.length <= 1}
                        onClick={() => handleDeleteLocation(loc)}
                        title={
                          loc.isDefault
                            ? bi(
                                'لا يمكن حذف الموقع الأساسي',
                                'Cannot delete default location',
                                'شوێنی بنەڕەتی ناتوانرێت بسڕدرێتەوە'
                              )
                            : bi('حذف', 'Delete', 'سڕینەوە')
                        }
                        aria-label={bi(
                          `حذف ${loc.nameAr}`,
                          `Delete ${loc.nameEn}`,
                          `سڕینەوەی ${loc.nameAr || loc.nameEn}`
                        )}
                        className="p-2 rounded-xl border border-layer-line bg-layer hover:bg-rose-500/10 hover:text-rose-600 text-muted-foreground-1 cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </AccessibleTabPanel>
        </AccessibleTabs>
      </div>
    </ModalDialog>
  );
};

export default ClosedDaysBreaksModal;
