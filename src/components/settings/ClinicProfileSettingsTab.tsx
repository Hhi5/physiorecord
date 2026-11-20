import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  ImagePlus,
  Languages,
  MessageSquare,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type {
  ClinicProfileData,
  ClinicServiceItem,
  SettingsViewMode,
  WeekdayIndex,
  WhatsAppTemplatesConfig,
} from '../../types/clinicManagement';
import { processClinicImageUpload, isValidEncryptedImageDataUrl } from '../../utils/imageUtils';
import { Money, MoneyInput, TimePickerInput } from '../ui/Primitives';
import { SettingsAccordion } from './SettingsPrimitives';

interface ClinicProfileSettingsTabProps {
  isModalOpen: boolean;
  isSoloMode: boolean;
  settingsViewMode?: SettingsViewMode;
  onSoloModeChanged: (isSolo: boolean) => void;
}

export const ClinicProfileSettingsTab: React.FC<ClinicProfileSettingsTabProps> = ({
  isModalOpen,
  isSoloMode,
  onSoloModeChanged,
}) => {
  const { language, bi } = useLanguage();

  const [clinicProfile, setClinicProfile] = useState<ClinicProfileData>(() =>
    ClinicOperationsService.getClinicProfile()
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [showEnglishFields, setShowEnglishFields] = useState<boolean>(language === 'en');

  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplatesConfig>(() =>
    ClinicOperationsService.getWhatsAppTemplates()
  );
  const [waSaving, setWaSaving] = useState(false);
  const [waSaved, setWaSaved] = useState(false);
  const [showWaEnglish, setShowWaEnglish] = useState<boolean>(language === 'en');

  const [switchingMode, setSwitchingMode] = useState(false);
  const [clinicServices, setClinicServices] = useState<ClinicServiceItem[]>(() =>
    ClinicOperationsService.getClinicServices()
  );
  const [newSvcNameAr, setNewSvcNameAr] = useState('');
  const [newSvcNameEn, setNewSvcNameEn] = useState('');
  const [newSvcType, setNewSvcType] = useState<ClinicServiceItem['invoiceType']>('single_session');
  const [newSvcPrice, setNewSvcPrice] = useState<number>(0);
  const [newSvcPkgSessions, setNewSvcPkgSessions] = useState<string>('6');

  useEffect(() => {
    const syncClinicState = () => {
      setWhatsappTemplates(ClinicOperationsService.getWhatsAppTemplates());
      setClinicServices(ClinicOperationsService.getClinicServices());
    };
    if (isModalOpen) {
      setClinicProfile(ClinicOperationsService.getClinicProfile());
      setImageUploadError(null);
      syncClinicState();
    }
    return ClinicOperationsService.subscribe(syncClinicState);
  }, [isModalOpen]);

  const handleSaveClinicProfile = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const updated = await ClinicOperationsService.saveClinicProfileAsync({
        clinicNameAr: clinicProfile.clinicNameAr.trim(),
        clinicNameEn: clinicProfile.clinicNameEn.trim(),
        therapistNameAr: clinicProfile.therapistNameAr.trim(),
        therapistNameEn: clinicProfile.therapistNameEn.trim(),
        phone: clinicProfile.phone.trim(),
        addressAr: clinicProfile.addressAr.trim(),
        addressEn: clinicProfile.addressEn.trim(),
        licenseNumber: clinicProfile.licenseNumber.trim(),
        logoDataUrl: clinicProfile.logoDataUrl,
        stampSignatureDataUrl: clinicProfile.stampSignatureDataUrl,
        receiptFooterAr: clinicProfile.receiptFooterAr?.trim() || '',
        receiptFooterEn: clinicProfile.receiptFooterEn?.trim() || '',
        workingDaysPreset: clinicProfile.workingDaysPreset || 'sun_thu',
        workingDays:
          clinicProfile.workingDays && clinicProfile.workingDays.length > 0
            ? clinicProfile.workingDays
            : [0, 1, 2, 3, 4],
        workHoursStart: clinicProfile.workHoursStart || '09:00',
        workHoursEnd: clinicProfile.workHoursEnd || '21:00',
        defaultSessionDurationMinutes: Math.max(
          10,
          Math.min(240, Number(clinicProfile.defaultSessionDurationMinutes || 45))
        ),
      });
      setClinicProfile(updated);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUploadClinicImage = async (
    file: File | undefined,
    target: 'logoDataUrl' | 'stampSignatureDataUrl'
  ) => {
    if (!file) return;
    setImageUploadError(null);
    try {
      const processed = await processClinicImageUpload(file, {
        maxWidthPx: target === 'logoDataUrl' ? 400 : 480,
        maxHeightPx: target === 'logoDataUrl' ? 240 : 220,
      });
      setClinicProfile((p) => ({ ...p, [target]: processed }));
    } catch (err) {
      setImageUploadError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveWhatsAppTemplates = async () => {
    setWaSaving(true);
    setWaSaved(false);
    try {
      const saved = await ClinicOperationsService.saveWhatsAppTemplatesAsync({
        appointmentReminder: whatsappTemplates.appointmentReminder,
        hepProgram: whatsappTemplates.hepProgram,
        paymentReceipt: whatsappTemplates.paymentReceipt,
      });
      setWhatsappTemplates(saved);
      setWaSaved(true);
      setTimeout(() => setWaSaved(false), 2500);
    } finally {
      setWaSaving(false);
    }
  };

  const handleResetWhatsAppTemplates = async () => {
    const reset = await ClinicOperationsService.resetWhatsAppTemplatesAsync();
    setWhatsappTemplates(reset);
    setWaSaved(true);
    setTimeout(() => setWaSaved(false), 2500);
  };

  const handleSwitchWorkspaceMode = async (mode: 'solo' | 'team') => {
    setSwitchingMode(true);
    try {
      await ClinicOperationsService.switchWorkspaceModeAsync(mode);
      onSoloModeChanged(mode === 'solo');
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleAddClinicService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSvcNameAr.trim() && !newSvcNameEn.trim()) return;
    const ar = newSvcNameAr.trim() || newSvcNameEn.trim();
    const en = newSvcNameEn.trim() || newSvcNameAr.trim();
    const pkgCount =
      newSvcType === 'rehab_package'
        ? Math.max(2, parseInt(newSvcPkgSessions, 10) || 6)
        : undefined;
    const item: ClinicServiceItem = {
      id: `svc_${crypto.randomUUID()}`,
      nameAr: ar,
      nameEn: en,
      invoiceType: newSvcType,
      priceIQD: Math.max(0, newSvcPrice || 0),
      packageSessions: pkgCount,
      isActive: true,
    };
    const next = [...clinicServices, item];
    setClinicServices(next);
    setNewSvcNameAr('');
    setNewSvcNameEn('');
    setNewSvcPrice(0);
    await ClinicOperationsService.saveClinicServicesAsync(next);
  };

  const handleDeleteClinicService = async (id: string) => {
    const next = clinicServices.filter((s) => s.id !== id);
    setClinicServices(next);
    await ClinicOperationsService.saveClinicServicesAsync(next);
  };

  const hoursSummary = `${clinicProfile.workHoursStart || '09:00'} – ${
    clinicProfile.workHoursEnd || '21:00'
  } · ${clinicProfile.defaultSessionDurationMinutes ?? 45} ${bi('د', 'min', 'خ')}`;

  const brandingSummary =
    clinicProfile.logoDataUrl || clinicProfile.stampSignatureDataUrl
      ? bi('مضاف', 'Added', 'زیادکراوە')
      : bi('اختياري', 'Optional', 'بژاردەیی');

  const inputClass =
    'w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

  return (
    <form onSubmit={(e) => void handleSaveClinicProfile(e)} className="space-y-3.5">
      {profileSaved && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>
            {bi(
              'تم حفظ بيانات العيادة بنجاح.',
              'Clinic profile saved cleanly.',
              'زانیارییەکانی کلینیک بە سەرکەوتوویی پاشەکەوت کران.'
            )}
          </span>
        </div>
      )}

      {/* 1. Core Clinic Identity (Open by default) */}
      <SettingsAccordion
        defaultOpen
        icon={<Building2 className="size-4" />}
        title={bi('الهوية وترويسة المطبوعات', 'Clinic Identity & Letterhead', 'ناسنامە و سەرپەڕەی چاپکراوەکان')}
        subtitle={bi(
          'تُستخدم في ترويسة التقارير الطبية ووصولات الدفع (محفوظة محلياً ومشفّرة).',
          'Used on printed clinical reports and payment receipts (stored encrypted locally).',
          'لە سەرپەڕەی ڕاپۆرتە پزیشکییەکان و پسوڵەکاندا بەکاردەهێنرێت (بە کۆدکراوی ناوخۆیی پاشەکەوت دەکرێت).'
        )}
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowEnglishFields((v) => !v)}
            className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Languages className="size-3.5" />
            <span>
              {showEnglishFields
                ? bi('إخفاء الحقول الإنجليزية', 'Hide English Fields', 'شاردنەوەی خانە ئینگلیزییەکان')
                : bi('إضافة الاسم والعنوان بالإنجليزية', 'Add English Name & Address', 'زیادکردنی ناو و ناونیشان بە ئینگلیزی')}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label htmlFor="clinic-name-ar" className="block text-xs font-bold text-foreground mb-1">
              {bi('اسم العيادة', 'Clinic Name (Arabic)', 'ناوی کلینیک')}
            </label>
            <input
              id="clinic-name-ar"
              type="text"
              value={clinicProfile.clinicNameAr}
              onChange={(e) => setClinicProfile((p) => ({ ...p, clinicNameAr: e.target.value }))}
              className={inputClass}
            />
          </div>

          {showEnglishFields && (
            <div>
              <label htmlFor="clinic-name-en" className="block text-xs font-bold text-foreground mb-1">
                {bi('اسم العيادة (إنجليزي)', 'Clinic Name (English)', 'ناوی کلینیک (ئینگلیزی)')}
              </label>
              <input
                id="clinic-name-en"
                type="text"
                dir="ltr"
                value={clinicProfile.clinicNameEn}
                onChange={(e) => setClinicProfile((p) => ({ ...p, clinicNameEn: e.target.value }))}
                className={`${inputClass} text-start`}
              />
            </div>
          )}

          <div>
            <label htmlFor="clinic-therapist-ar" className="block text-xs font-bold text-foreground mb-1">
              {bi('اسم المعالج المسؤول', 'Lead Therapist (Arabic)', 'ناوی چارەسەرکاری بەرپرس')}
            </label>
            <input
              id="clinic-therapist-ar"
              type="text"
              value={clinicProfile.therapistNameAr}
              onChange={(e) => setClinicProfile((p) => ({ ...p, therapistNameAr: e.target.value }))}
              className={inputClass}
            />
          </div>

          {showEnglishFields && (
            <div>
              <label htmlFor="clinic-therapist-en" className="block text-xs font-bold text-foreground mb-1">
                {bi('اسم المعالج المسؤول (إنجليزي)', 'Lead Therapist (English)', 'ناوی چارەسەرکاری بەرپرس (ئینگلیزی)')}
              </label>
              <input
                id="clinic-therapist-en"
                type="text"
                dir="ltr"
                value={clinicProfile.therapistNameEn}
                onChange={(e) => setClinicProfile((p) => ({ ...p, therapistNameEn: e.target.value }))}
                className={`${inputClass} text-start`}
              />
            </div>
          )}

          <div>
            <label htmlFor="clinic-phone" className="block text-xs font-bold text-foreground mb-1">
              {bi('هاتف العيادة', 'Clinic Phone', 'تەلەفۆنی کلینیک')}
            </label>
            <input
              id="clinic-phone"
              type="text"
              dir="ltr"
              value={clinicProfile.phone}
              onChange={(e) => setClinicProfile((p) => ({ ...p, phone: e.target.value }))}
              className={`${inputClass} font-mono text-start`}
            />
          </div>

          <div>
            <label htmlFor="clinic-license" className="block text-xs font-bold text-foreground mb-1">
              {bi('رقم الإجازة / التسجيل', 'License / Registration #', 'ژمارەی مۆڵەت / تۆمارکردن')}
            </label>
            <input
              id="clinic-license"
              type="text"
              dir="ltr"
              value={clinicProfile.licenseNumber}
              onChange={(e) => setClinicProfile((p) => ({ ...p, licenseNumber: e.target.value }))}
              className={`${inputClass} font-mono text-start`}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="clinic-address-ar" className="block text-xs font-bold text-foreground mb-1">
              {bi('عنوان العيادة', 'Clinic Address (Arabic)', 'ناونیشانی کلینیک')}
            </label>
            <input
              id="clinic-address-ar"
              type="text"
              value={clinicProfile.addressAr}
              onChange={(e) => setClinicProfile((p) => ({ ...p, addressAr: e.target.value }))}
              className={inputClass}
            />
          </div>

          {showEnglishFields && (
            <div className="sm:col-span-2">
              <label htmlFor="clinic-address-en" className="block text-xs font-bold text-foreground mb-1">
                {bi('العنوان (إنجليزي)', 'Clinic Address (English)', 'ناونیشان (ئینگلیزی)')}
              </label>
              <input
                id="clinic-address-en"
                type="text"
                dir="ltr"
                value={clinicProfile.addressEn}
                onChange={(e) => setClinicProfile((p) => ({ ...p, addressEn: e.target.value }))}
                className={`${inputClass} text-start`}
              />
            </div>
          )}

          <div className={showEnglishFields ? '' : 'sm:col-span-2'}>
            <label htmlFor="clinic-footer-ar" className="block text-xs font-bold text-foreground mb-1">
              {bi('تذييل الفواتير والتقارير', 'Receipt / Report Footer (Arabic)', 'بنپەڕی پسوڵە و ڕاپۆرتەکان')}
            </label>
            <input
              id="clinic-footer-ar"
              type="text"
              value={clinicProfile.receiptFooterAr || ''}
              onChange={(e) => setClinicProfile((p) => ({ ...p, receiptFooterAr: e.target.value }))}
              placeholder={bi(
                'مع تمنياتنا لكم بالشفاء العاجل...',
                'Arabic footer text...',
                'هیوای چاکبوونەوەی خێراتان بۆ دەخوازین...'
              )}
              className={inputClass}
            />
          </div>

          {showEnglishFields && (
            <div>
              <label htmlFor="clinic-footer-en" className="block text-xs font-bold text-foreground mb-1">
                {bi('تذييل المطبوعات (إنجليزي)', 'Receipt / Report Footer (English)', 'بنپەڕی چاپکراوەکان (ئینگلیزی)')}
              </label>
              <input
                id="clinic-footer-en"
                type="text"
                dir="ltr"
                value={clinicProfile.receiptFooterEn || ''}
                onChange={(e) => setClinicProfile((p) => ({ ...p, receiptFooterEn: e.target.value }))}
                placeholder="Wishing you a speedy recovery..."
                className={`${inputClass} text-start`}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={profileSaving}
            className="min-h-[38px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer transition-colors"
          >
            {profileSaving
              ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
              : bi('حفظ بيانات العيادة', 'Save Clinic Profile', 'پاشەکەوتکردنی زانیاری کلینیک')}
          </button>
        </div>
      </SettingsAccordion>

      {/* 2. Working Days & Hours (Collapsed by default with clear live summary) */}
      <SettingsAccordion
        icon={<Clock className="size-4" />}
        title={bi('أيام وساعات الدوام ومدة الجلسة', 'Working Days, Hours & Session Duration', 'ڕۆژ و کاتژمێرەکانی کار و ماوەی دانیشتن')}
        meta={hoursSummary}
      >
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'sun_thu', days: [0, 1, 2, 3, 4] as WeekdayIndex[], ar: 'الأحد – الخميس', en: 'Sun – Thu', ckb: 'یەکشەممە – پێنجشەممە' },
              { id: 'sat_thu', days: [6, 0, 1, 2, 3, 4] as WeekdayIndex[], ar: 'السبت – الخميس', en: 'Sat – Thu', ckb: 'شەممە – پێنجشەممە' },
              { id: 'custom', days: clinicProfile.workingDays || ([0, 1, 2, 3, 4] as WeekdayIndex[]), ar: 'مخصص', en: 'Custom', ckb: 'تایبەت' },
            ] as const
          ).map((preset) => {
            const active = (clinicProfile.workingDaysPreset || 'sun_thu') === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  setClinicProfile((p) => ({
                    ...p,
                    workingDaysPreset: preset.id,
                    workingDays: [...preset.days],
                  }))
                }
                className={`min-h-[36px] px-3 py-1 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-layer border-layer-line text-foreground hover:bg-layer-hover'
                }`}
              >
                {bi(preset.ar, preset.en, preset.ckb)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { d: 6 as WeekdayIndex, ar: 'سبت', en: 'Sat', ckb: 'شەممە' },
              { d: 0 as WeekdayIndex, ar: 'أحد', en: 'Sun', ckb: 'یەکشەممە' },
              { d: 1 as WeekdayIndex, ar: 'اثنين', en: 'Mon', ckb: 'دووشەممە' },
              { d: 2 as WeekdayIndex, ar: 'ثلاثاء', en: 'Tue', ckb: 'سێشەممە' },
              { d: 3 as WeekdayIndex, ar: 'أربعاء', en: 'Wed', ckb: 'چوارشەممە' },
              { d: 4 as WeekdayIndex, ar: 'خميس', en: 'Thu', ckb: 'پێنجشەممە' },
              { d: 5 as WeekdayIndex, ar: 'جمعة', en: 'Fri', ckb: 'هەینی' },
            ] as const
          ).map((day) => {
            const days = clinicProfile.workingDays || [0, 1, 2, 3, 4];
            const active = days.includes(day.d);
            return (
              <button
                key={day.d}
                type="button"
                onClick={() => {
                  const nextDays = active ? days.filter((x) => x !== day.d) : [...days, day.d];
                  setClinicProfile((p) => ({
                    ...p,
                    workingDaysPreset: 'custom',
                    workingDays: nextDays,
                  }));
                }}
                className={`min-h-[36px] px-2.5 py-1 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                  active
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-layer border-layer-line text-muted-foreground-1'
                }`}
              >
                {bi(day.ar, day.en, day.ckb)}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label htmlFor="clinic-work-hours-start" className="block text-xs font-semibold text-muted-foreground-1 mb-1">
              {bi('بدء الدوام', 'Hours Start', 'دەستپێکردنی دەوام')}
            </label>
            <TimePickerInput
              id="clinic-work-hours-start"
              value={clinicProfile.workHoursStart || '09:00'}
              onChange={(v) => setClinicProfile((p) => ({ ...p, workHoursStart: v }))}
            />
          </div>
          <div>
            <label htmlFor="clinic-work-hours-end" className="block text-xs font-semibold text-muted-foreground-1 mb-1">
              {bi('انتهاء الدوام', 'Hours End', 'کۆتاییهاتنی دەوام')}
            </label>
            <TimePickerInput
              id="clinic-work-hours-end"
              value={clinicProfile.workHoursEnd || '21:00'}
              onChange={(v) => setClinicProfile((p) => ({ ...p, workHoursEnd: v }))}
            />
          </div>
          <div>
            <label htmlFor="clinic-default-duration" className="block text-xs font-semibold text-muted-foreground-1 mb-1">
              {bi('المدة الافتراضية (دقيقة)', 'Default Duration (min)', 'ماوەی بنەڕەتی (خولەک)')}
            </label>
            <input
              id="clinic-default-duration"
              type="number"
              min={10}
              max={240}
              value={clinicProfile.defaultSessionDurationMinutes ?? 45}
              onChange={(e) =>
                setClinicProfile((p) => ({
                  ...p,
                  defaultSessionDurationMinutes: Math.max(10, Number(e.target.value) || 45),
                }))
              }
              className={`${inputClass} font-bold tabular-nums`}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={profileSaving}
            className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
          >
            {profileSaving
              ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
              : bi('حفظ أوقات الدوام', 'Save Schedule Hours', 'پاشەکەوتکردنی کاتەکانی دەوام')}
          </button>
        </div>
      </SettingsAccordion>

      {/* 3. Logo & Stamp/Signature */}
      <SettingsAccordion
        icon={<ImagePlus className="size-4" />}
        title={bi('شعار العيادة والختم والتوقيع', 'Clinic Logo & Stamp / Signature', 'لۆگۆی کلینیک و مۆر و واژۆ')}
        meta={brandingSummary}
        subtitle={bi(
          'تظهر تلقائياً على الفواتير والتقارير الطبية المطبوعة.',
          'Automatically placed on printed receipts and clinical reports.',
          'بە شێوەی خۆکار لەسەر پسوڵە و ڕاپۆرتە پزیشکییە چاپکراوەکان دەردەکەون.'
        )}
      >
        {imageUploadError && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400">
            {imageUploadError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-surface border border-line-2 space-y-2.5">
            <div className="text-xs font-bold text-foreground">
              {bi('شعار العيادة', 'Clinic Logo', 'لۆگۆی کلینیک')}
            </div>
            {isValidEncryptedImageDataUrl(clinicProfile.logoDataUrl) && (
              <img
                src={clinicProfile.logoDataUrl}
                alt={bi('معاينة شعار العيادة', 'Clinic Logo Preview', 'پێشبینی لۆگۆی کلینیک')}
                className="h-14 object-contain rounded-lg border border-line-2 bg-white p-1"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="min-h-[34px] px-3 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-xs font-semibold inline-flex items-center cursor-pointer">
                {bi('رفع شعار', 'Upload Logo', 'بارکردنی لۆگۆ')}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => void handleUploadClinicImage(e.target.files?.[0], 'logoDataUrl')}
                />
              </label>
              {clinicProfile.logoDataUrl && (
                <button
                  type="button"
                  onClick={() => setClinicProfile((p) => ({ ...p, logoDataUrl: undefined }))}
                  className="min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                >
                  {bi('حذف', 'Clear', 'سڕینەوە')}
                </button>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-line-2 space-y-2.5">
            <div className="text-xs font-bold text-foreground">
              {bi('الختم أو التوقيع الرسمي', 'Stamp / Signature', 'مۆر یان واژۆی فەرمی')}
            </div>
            {isValidEncryptedImageDataUrl(clinicProfile.stampSignatureDataUrl) && (
              <img
                src={clinicProfile.stampSignatureDataUrl}
                alt={bi('معاينة الختم', 'Stamp Preview', 'پێشبینی مۆر')}
                className="h-14 object-contain rounded-lg border border-line-2 bg-white p-1"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="min-h-[34px] px-3 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-xs font-semibold inline-flex items-center cursor-pointer">
                {bi('رفع ختم / توقيع', 'Upload Stamp', 'بارکردنی مۆر / واژۆ')}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) =>
                    void handleUploadClinicImage(e.target.files?.[0], 'stampSignatureDataUrl')
                  }
                />
              </label>
              {clinicProfile.stampSignatureDataUrl && (
                <button
                  type="button"
                  onClick={() =>
                    setClinicProfile((p) => ({ ...p, stampSignatureDataUrl: undefined }))
                  }
                  className="min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                >
                  {bi('حذف', 'Clear', 'سڕینەوە')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={profileSaving}
            className="min-h-[36px] px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
          >
            {profileSaving
              ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
              : bi('حفظ الشعار والختم', 'Save Logo & Stamp', 'پاشەکەوتکردنی لۆگۆ و مۆر')}
          </button>
        </div>
      </SettingsAccordion>

      {/* 4. WhatsApp Templates */}
      <SettingsAccordion
        icon={<MessageSquare className="size-4" />}
        title={bi('قوالب رسائل واتساب', 'WhatsApp Message Templates', 'داڕشتەکانی نامەی واتساپ')}
        subtitle={bi(
          'تخصيص نصوص تذكير المواعيد، التمارين المنزلية، ووصولات الدفع.',
          'Customize appointment reminders, home exercise messages, and payment receipts.',
          'دەستکاریکردنی دەقی بیرخستنەوەی چاوپێکەوتن، ڕاهێنانی ماڵەوە و پسوڵەی پارەدان.'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowWaEnglish((v) => !v)}
            className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Languages className="size-3.5" />
            <span>
              {showWaEnglish
                ? bi('إخفاء النسخة الإنجليزية', 'Hide English Templates', 'شاردنەوەی دەقی ئینگلیزی')
                : bi('تعديل النسخة الإنجليزية أيضاً', 'Edit English Templates', 'دەستکاریکردنی دەقی ئینگلیزیش')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleResetWhatsAppTemplates()}
            className="px-2.5 py-1 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-xs text-muted-foreground-1 inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>{bi('استعادة الافتراضي', 'Reset Defaults', 'گەڕاندنەوە بۆ بنەڕەتی')}</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'المتغيرات: {patientName}، {date}، {time}، {clinicName}، {hepList}، {receiptNumber}، {invoiceNumber}، {amount}، {balanceDue}.',
            'Placeholders: {patientName}, {date}, {time}, {clinicName}, {hepList}, {receiptNumber}, {invoiceNumber}, {amount}, {balanceDue}.',
            'گۆڕاوەکان: {patientName}، {date}، {time}، {clinicName}، {hepList}، {receiptNumber}، {invoiceNumber}، {amount}، {balanceDue}.'
          )}
        </p>

        {waSaved && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
            {bi('تم حفظ قوالب واتساب.', 'WhatsApp templates saved.', 'داڕشتەکانی واتساپ پاشەکەوت کران.')}
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div>
            <label htmlFor="wa-tpl-reminder-ar" className="block font-bold text-foreground mb-1">
              {bi('تذكير الموعد', 'Appointment Reminder', 'بیرخستنەوەی چاوپێکەوتن')}
            </label>
            <textarea
              id="wa-tpl-reminder-ar"
              rows={2}
              value={whatsappTemplates.appointmentReminder.ar}
              onChange={(e) =>
                setWhatsappTemplates((w) => ({
                  ...w,
                  appointmentReminder: { ...w.appointmentReminder, ar: e.target.value },
                }))
              }
              className={`${inputClass} mb-1.5`}
            />
            {showWaEnglish && (
              <textarea
                id="wa-tpl-reminder-en"
                aria-label={bi('قالب تذكير الموعد بالإنجليزية', 'Appointment reminder template English', 'داڕشتەی بیرخستنەوەی چاوپێکەوتن بە ئینگلیزی')}
                rows={2}
                dir="ltr"
                value={whatsappTemplates.appointmentReminder.en}
                onChange={(e) =>
                  setWhatsappTemplates((w) => ({
                    ...w,
                    appointmentReminder: { ...w.appointmentReminder, en: e.target.value },
                  }))
                }
                className={`${inputClass} text-start`}
              />
            )}
          </div>

          <div>
            <label htmlFor="wa-tpl-hep-ar" className="block font-bold text-foreground mb-1">
              {bi('برنامج التمارين المنزلية (HEP)', 'HEP Program', 'بەرنامەی ڕاهێنانی ماڵەوە (HEP)')}
            </label>
            <textarea
              id="wa-tpl-hep-ar"
              rows={2}
              value={whatsappTemplates.hepProgram.ar}
              onChange={(e) =>
                setWhatsappTemplates((w) => ({
                  ...w,
                  hepProgram: { ...w.hepProgram, ar: e.target.value },
                }))
              }
              className={`${inputClass} mb-1.5`}
            />
            {showWaEnglish && (
              <textarea
                id="wa-tpl-hep-en"
                aria-label={bi('قالب برنامج التمارين المنزلية بالإنجليزية', 'HEP program template English', 'داڕشتەی بەرنامەی ڕاهێنانی ماڵەوە بە ئینگلیزی')}
                rows={2}
                dir="ltr"
                value={whatsappTemplates.hepProgram.en}
                onChange={(e) =>
                  setWhatsappTemplates((w) => ({
                    ...w,
                    hepProgram: { ...w.hepProgram, en: e.target.value },
                  }))
                }
                className={`${inputClass} text-start`}
              />
            )}
          </div>

          <div>
            <label htmlFor="wa-tpl-receipt-ar" className="block font-bold text-foreground mb-1">
              {bi('وصل الدفع المالي', 'Payment Receipt', 'پسوڵەی پارەدان')}
            </label>
            <textarea
              id="wa-tpl-receipt-ar"
              rows={2}
              value={whatsappTemplates.paymentReceipt.ar}
              onChange={(e) =>
                setWhatsappTemplates((w) => ({
                  ...w,
                  paymentReceipt: { ...w.paymentReceipt, ar: e.target.value },
                }))
              }
              className={`${inputClass} mb-1.5`}
            />
            {showWaEnglish && (
              <textarea
                id="wa-tpl-receipt-en"
                aria-label={bi('قالب وصل الدفع بالإنجليزية', 'Payment receipt template English', 'داڕشتەی پسوڵەی پارەدان بە ئینگلیزی')}
                rows={2}
                dir="ltr"
                value={whatsappTemplates.paymentReceipt.en}
                onChange={(e) =>
                  setWhatsappTemplates((w) => ({
                    ...w,
                    paymentReceipt: { ...w.paymentReceipt, en: e.target.value },
                  }))
                }
                className={`${inputClass} text-start`}
              />
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={waSaving}
              onClick={() => void handleSaveWhatsAppTemplates()}
              className="min-h-[36px] px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {waSaving
                ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
                : bi('حفظ قوالب واتساب', 'Save WhatsApp Templates', 'پاشەکەوتکردنی داڕشتەکانی واتساپ')}
            </button>
          </div>
        </div>
      </SettingsAccordion>

      {/* 5. Workspace Mode (Solo vs Team) & Custom Price List */}
      <SettingsAccordion
        icon={<UserCheck className="size-4" />}
        title={bi('نمط العمل وقائمة الخدمات المخصصة', 'Workspace Mode & Custom Services', 'شێوازی کار و لیستی خزمەتگوزارییەکان')}
        meta={
          isSoloMode
            ? bi(`فردي · ${clinicServices.length} خدمات`, `Solo · ${clinicServices.length} services`, `تاک · ${clinicServices.length} خزمەتگوزاری`)
            : bi(`فريق · ${clinicServices.length} خدمات`, `Team · ${clinicServices.length} services`, `تیم · ${clinicServices.length} خزمەتگوزاری`)
        }
      >
        <div className="space-y-2.5 pb-3 border-b border-card-divider">
          <div className="text-xs font-bold text-foreground">
            {bi('نمط تشغيل العيادة', 'Clinic Workspace Mode', 'شێوازی کارکردنی کلینیک')}
          </div>
          <p className="text-xs text-muted-foreground-1 leading-relaxed">
            {bi(
              'وضع المعالج الفردي يبسّط القوائم ويزيل تبديل الكادر، بينما يفعّل وضع الفريق الاستقبال والطابور وصلاحيات الكادر.',
              'Solo Mode streamlines navigation and hides staff switchers; Team Mode enables reception queue and multi-staff permissions.',
              'شێوازی چارەسەرکاری تاک لیستەکان سادە دەکاتەوە، لەکاتێکدا شێوازی تیم پێشوازی و ڕیز و دەسەڵاتی ستاف چالاک دەکات.'
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={switchingMode}
              onClick={() => void handleSwitchWorkspaceMode('solo')}
              className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                isSoloMode
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-layer border-layer-line text-foreground hover:bg-layer-hover'
              }`}
            >
              {bi('أنا معالج منفرد (Solo)', 'I Work Alone (Solo Mode)', 'من بە تەنیا کاردەکەم (Solo)')}
            </button>
            <button
              type="button"
              disabled={switchingMode}
              onClick={() => void handleSwitchWorkspaceMode('team')}
              className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                !isSoloMode
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-layer border-layer-line text-foreground hover:bg-layer-hover'
              }`}
            >
              {bi('عيادة مع فريق وكادر (Team)', 'I Have a Team (Team Mode)', 'کلینیک لەگەڵ تیم و ستاف (Team)')}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Tag className="size-4 text-primary" />
              <span>
                {bi('خدماتي وأسعاري المخصصة (اختياري)', 'My Clinic Services & Packages (Optional)', 'خزمەتگوزاری و نرخە تایبەتەکانم (بژاردەیی)')}
              </span>
            </div>
            <span className="text-xs text-muted-foreground-1">
              {bi('فارغة افتراضياً', 'Empty by default', 'بە بنەڕەتی بەتاڵە')}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-line-2 space-y-2.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                aria-label={bi('اسم الخدمة بالعربية', 'Service Name (Arabic)', 'ناوی خزمەتگوزاری بە عەرەبی')}
                value={newSvcNameAr}
                onChange={(e) => setNewSvcNameAr(e.target.value)}
                placeholder={bi(
                  'اسم الخدمة (مثال: جلسة علاجية)',
                  'Service Name (Arabic)',
                  'ناوی خزمەتگوزاری (نموونە: دانیشتنی چارەسەر)'
                )}
                className={inputClass}
              />
              <input
                type="text"
                dir="ltr"
                aria-label={bi('اسم الخدمة بالإنجليزية', 'Service Name (English)', 'ناوی خزمەتگوزاری بە ئینگلیزی')}
                value={newSvcNameEn}
                onChange={(e) => setNewSvcNameEn(e.target.value)}
                placeholder="Service Name (English — optional)"
                className={`${inputClass} text-start`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <div>
                <label htmlFor="settings-svc-type" className="block text-xs font-bold text-foreground mb-1">
                  {bi('النوع', 'Type', 'جۆر')}
                </label>
                <select
                  id="settings-svc-type"
                  value={newSvcType}
                  onChange={(e) =>
                    setNewSvcType(e.target.value as ClinicServiceItem['invoiceType'])
                  }
                  className={inputClass}
                >
                  <option value="single_session">{bi('جلسة مفردة', 'Single Session', 'دانیشتنی تاک')}</option>
                  <option value="rehab_package">{bi('كورس', 'Course Package', 'کۆرس')}</option>
                  <option value="evaluation">{bi('فحص', 'Evaluation', 'پشکنین')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="settings-svc-fee" className="block text-xs font-bold text-foreground mb-1">
                  {bi('السعر', 'Fee', 'نرخ')}
                </label>
                <MoneyInput
                  id="settings-svc-fee"
                  value={newSvcPrice}
                  onChange={setNewSvcPrice}
                  className="w-full"
                />
              </div>
              {newSvcType === 'rehab_package' ? (
                <div>
                  <label htmlFor="settings-svc-pkg-sessions" className="block text-xs font-bold text-foreground mb-1">
                    {bi('عدد الجلسات', 'Sessions', 'ژمارەی دانیشتن')}
                  </label>
                  <input
                    id="settings-svc-pkg-sessions"
                    type="number"
                    min={2}
                    max={60}
                    value={newSvcPkgSessions}
                    onChange={(e) => setNewSvcPkgSessions(e.target.value)}
                    className={`${inputClass} font-mono tabular-nums`}
                  />
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={(e) => void handleAddClinicService(e)}
                    disabled={!newSvcNameAr.trim() && !newSvcNameEn.trim()}
                    className="w-full sm:w-auto min-h-[38px] px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>{bi('إضافة', 'Add', 'زیادکردن')}</span>
                  </button>
                </div>
              )}
            </div>

            {newSvcType === 'rehab_package' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={(e) => void handleAddClinicService(e)}
                  disabled={!newSvcNameAr.trim() && !newSvcNameEn.trim()}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{bi('إضافة للقائمة', 'Add Service', 'زیادکردن بۆ لیست')}</span>
                </button>
              </div>
            )}
          </div>

          {clinicServices.length === 0 ? (
            <p className="text-xs text-muted-foreground-1">
              {bi('لا توجد خدمات مضافة حالياً.', 'No custom services configured yet.', 'لە ئێستادا هیچ خزمەتگوزارییەکی زیادکراو نییە.')}
            </p>
          ) : (
            <div className="divide-y divide-card-divider rounded-xl border border-card-line bg-layer/40">
              {clinicServices.map((svc) => (
                <div
                  key={svc.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-foreground">
                      {bi(svc.nameAr, svc.nameEn, svc.nameAr)}
                    </span>
                    <span className="text-muted-foreground-1 ms-2">
                      {svc.invoiceType === 'rehab_package'
                        ? bi(
                            `كورس (${svc.packageSessions || 0} جلسات)`,
                            `Package (${svc.packageSessions || 0})`,
                            `کۆرس (${svc.packageSessions || 0} دانیشتن)`
                          )
                        : svc.invoiceType === 'evaluation'
                        ? bi('فحص', 'Evaluation', 'پشکنین')
                        : bi('جلسة مفردة', 'Single Session', 'دانیشتنی تاک')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Money amount={svc.priceIQD} className="font-bold text-primary" />
                    <button
                      type="button"
                      onClick={() => void handleDeleteClinicService(svc.id)}
                      aria-label={bi('حذف الخدمة', 'Delete service', 'سڕینەوەی خزمەتگوزاری')}
                      className="size-8 rounded-lg text-muted-foreground-2 hover:text-rose-600 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsAccordion>
    </form>
  );
};
