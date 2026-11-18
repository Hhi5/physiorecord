import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ImagePlus,
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
  WeekdayIndex,
  WhatsAppTemplatesConfig,
} from '../../types/clinicManagement';
import { processClinicImageUpload, isValidEncryptedImageDataUrl } from '../../utils/imageUtils';
import { Money, MoneyInput, TimePickerInput } from '../ui/Primitives';

interface ClinicProfileSettingsTabProps {
  isModalOpen: boolean;
  isSoloMode: boolean;
  onSoloModeChanged: (isSolo: boolean) => void;
}

export const ClinicProfileSettingsTab: React.FC<ClinicProfileSettingsTabProps> = ({
  isModalOpen,
  isSoloMode,
  onSoloModeChanged,
}) => {
  const { bi } = useLanguage();

  const [clinicProfile, setClinicProfile] = useState<ClinicProfileData>(() =>
    ClinicOperationsService.getClinicProfile()
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplatesConfig>(() =>
    ClinicOperationsService.getWhatsAppTemplates()
  );
  const [waSaving, setWaSaving] = useState(false);
  const [waSaved, setWaSaved] = useState(false);

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

  const handleSaveClinicProfile = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <form onSubmit={(e) => void handleSaveClinicProfile(e)} className="space-y-4">
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-1.5">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Building2 className="size-4 text-primary" />
          <span>
            {bi(
              'ملف العيادة المشفر (محلياً على هذا الجهاز)',
              'Encrypted Clinic Profile',
              'پرۆفایلی کۆدکراوی کلینیک (ناوخۆیی لەسەر ئەم ئامێرە)'
            )}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'تُحفظ بيانات العيادة مشفرة في IndexedDB بدلاً من تخزين المتصفح وتُستخدم في ترويسة التقارير والوصولات.',
            'Stored encrypted in IndexedDB for clinical summaries and invoices.',
            'زانیارییەکانی کلینیک بە کۆدکراوی لە IndexedDB پاشەکەوت دەکرێن و لە سەرپەڕەی ڕاپۆرت و پسوڵەکاندا بەکاردەهێنرێن.'
          )}
        </p>
      </div>

      {profileSaved && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>
            {bi(
              'تم حفظ بيانات العيادة في المخزن المشفر.',
              'Clinic profile saved cleanly.',
              'زانیارییەکانی کلینیک لە کۆگای کۆدکراودا پاشەکەوت کران.'
            )}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <label htmlFor="clinic-name-ar" className="block text-xs font-bold text-foreground mb-1">
            {bi('اسم العيادة (بالعربية)', 'Clinic Name (Arabic)', 'ناوی کلینیک (عەرەبی)')}
          </label>
          <input
            id="clinic-name-ar"
            type="text"
            value={clinicProfile.clinicNameAr}
            onChange={(e) => setClinicProfile((p) => ({ ...p, clinicNameAr: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
          />
        </div>
        <div>
          <label htmlFor="clinic-name-en" className="block text-xs font-bold text-foreground mb-1">
            {bi('اسم العيادة (بالإنجليزية)', 'Clinic Name (English)', 'ناوی کلینیک (ئینگلیزی)')}
          </label>
          <input
            id="clinic-name-en"
            type="text"
            dir="ltr"
            value={clinicProfile.clinicNameEn}
            onChange={(e) => setClinicProfile((p) => ({ ...p, clinicNameEn: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
          />
        </div>
        <div>
          <label htmlFor="clinic-therapist-ar" className="block text-xs font-bold text-foreground mb-1">
            {bi('اسم المعالج المسؤول (عربي)', 'Lead Therapist (Arabic)', 'ناوی چارەسەرکاری بەرپرس (عەرەبی)')}
          </label>
          <input
            id="clinic-therapist-ar"
            type="text"
            value={clinicProfile.therapistNameAr}
            onChange={(e) => setClinicProfile((p) => ({ ...p, therapistNameAr: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
          />
        </div>
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
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
          />
        </div>
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
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono text-foreground text-start"
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
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-mono text-foreground text-start"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="clinic-address-ar" className="block text-xs font-bold text-foreground mb-1">
            {bi('العنوان (عربي)', 'Clinic Address (Arabic)', 'ناونیشان (عەرەبی)')}
          </label>
          <input
            id="clinic-address-ar"
            type="text"
            value={clinicProfile.addressAr}
            onChange={(e) => setClinicProfile((p) => ({ ...p, addressAr: e.target.value }))}
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
          />
        </div>
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
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
          />
        </div>

        {/* 4.4 Receipt / Report Footer */}
        <div>
          <label htmlFor="clinic-footer-ar" className="block text-xs font-bold text-foreground mb-1">
            {bi('تذييل الفواتير والتقارير (عربي)', 'Receipt / Report Footer (Arabic)', 'بنپەڕی پسوڵە و ڕاپۆرتەکان (عەرەبی)')}
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
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground"
          />
        </div>
        <div>
          <label htmlFor="clinic-footer-en" className="block text-xs font-bold text-foreground mb-1">
            {bi('تذييل الفواتير والتقارير (إنجليزي)', 'Receipt / Report Footer (English)', 'بنپەڕی پسوڵە و ڕاپۆرتەکان (ئینگلیزی)')}
          </label>
          <input
            id="clinic-footer-en"
            type="text"
            dir="ltr"
            value={clinicProfile.receiptFooterEn || ''}
            onChange={(e) => setClinicProfile((p) => ({ ...p, receiptFooterEn: e.target.value }))}
            placeholder="Wishing you a speedy recovery..."
            className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
          />
        </div>

        {/* 4.4 Working Days & Schedule Hours */}
        <div className="sm:col-span-2 p-3.5 rounded-xl bg-surface border border-line-2 space-y-3">
          <div className="text-xs font-bold text-foreground">
            {bi(
              'أيام وساعات عمل العيادة والمدة الافتراضية للجلسة',
              'Working Days, Clinic Hours & Default Session Duration',
              'ڕۆژ و کاتژمێرەکانی کارکردنی کلینیک و ماوەی بنەڕەتی دانیشتن'
            )}
          </div>

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
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
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
                    const nextDays = active
                      ? days.filter((x) => x !== day.d)
                      : [...days, day.d];
                    setClinicProfile((p) => ({
                      ...p,
                      workingDaysPreset: 'custom',
                      workingDays: nextDays,
                    }));
                  }}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
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
                className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs font-bold tabular-nums text-foreground"
              />
            </div>
          </div>
        </div>

        {/* 4.4 Encrypted Clinic Logo & Stamp/Signature Upload */}
        <div className="sm:col-span-2 p-3.5 rounded-xl bg-surface border border-line-2 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <ImagePlus className="size-4 text-primary" />
            <span>
              {bi(
                'شعار العيادة وختم / توقيع المعالج (للمطبوعات المشفرة)',
                'Clinic Logo & Therapist Stamp/Signature (for Printed Documents)',
                'لۆگۆی کلینیک و مۆر / واژۆی چارەسەرکار (بۆ چاپکراوە کۆدکراوەکان)'
              )}
            </span>
          </div>

          {imageUploadError && (
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-400">
              {imageUploadError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-2.5 rounded-xl bg-card border border-card-line space-y-2">
              <div className="text-xs font-semibold text-foreground">
                {bi('شعار العيادة (PNG/JPEG/WebP)', 'Clinic Logo', 'لۆگۆی کلینیک (PNG/JPEG/WebP)')}
              </div>
              {isValidEncryptedImageDataUrl(clinicProfile.logoDataUrl) && (
                <img
                  src={clinicProfile.logoDataUrl}
                  alt={bi('معاينة شعار العيادة', 'Clinic Logo Preview', 'پێشبینی لۆگۆی کلینیک')}
                  className="h-14 object-contain rounded border border-line-2 bg-white p-1"
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-xs font-semibold cursor-pointer">
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
                    className="px-2 py-1 rounded-lg text-xs text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                  >
                    {bi('حذف', 'Clear', 'سڕینەوە')}
                  </button>
                )}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-card border border-card-line space-y-2">
              <div className="text-xs font-semibold text-foreground">
                {bi('الختم أو التوقيع الرسمي', 'Stamp / Signature', 'مۆر یان واژۆی فەرمی')}
              </div>
              {isValidEncryptedImageDataUrl(clinicProfile.stampSignatureDataUrl) && (
                <img
                  src={clinicProfile.stampSignatureDataUrl}
                  alt={bi('معاينة الختم', 'Stamp Preview', 'پێشبینی مۆر')}
                  className="h-14 object-contain rounded border border-line-2 bg-white p-1"
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-xs font-semibold cursor-pointer">
                  {bi('رفع ختم/توقيع', 'Upload Stamp', 'بارکردنی مۆر/واژۆ')}
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
                    className="px-2 py-1 rounded-lg text-xs text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                  >
                    {bi('حذف', 'Clear', 'سڕینەوە')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={profileSaving}
        className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold cursor-pointer"
      >
        {profileSaving
          ? bi('جاري الحفظ...', 'Saving...', 'پاشەکەوت دەکرێت...')
          : bi('حفظ ملف العيادة المشفر', 'Save Encrypted Clinic Profile', 'پاشەکەوتکردنی پرۆفایلی کۆدکراوی کلینیک')}
      </button>

      {/* 4.7 Encrypted WhatsApp Message Templates Editor */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <MessageSquare className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>
              {bi(
                'قوالب رسائل واتساب القابلة للتخصيص (4.7)',
                'Customizable WhatsApp Templates (4.7)',
                'داڕشتەکانی نامەی واتساپ کە دەتوانرێن دەستکاری بکرێن (4.7)'
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleResetWhatsAppTemplates()}
            className="px-2.5 py-1 rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-xs text-muted-foreground-1 inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>{bi('استعادة الافتراضي', 'Reset Defaults', 'گەڕاندنەوە بۆ بنەڕەتی')}</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground-1">
          {bi(
            'المتغيرات المدعومة: {patientName}، {date}، {time}، {clinicName}، {hepList}، {receiptNumber}، {invoiceNumber}، {amount}، {balanceDue}. الإرسال يتم يدوياً دائماً بمبادرة المستخدم.',
            'Placeholders: {patientName}, {date}, {time}, {clinicName}, {hepList}, {receiptNumber}, {invoiceNumber}, {amount}, {balanceDue}. Always user-initiated only (no background sending).',
            'گۆڕاوە پشتگیریکراوەکان: {patientName}، {date}، {time}، {clinicName}، {hepList}، {receiptNumber}، {invoiceNumber}، {amount}، {balanceDue}. ناردن هەمیشە بە دەست و بە بڕیاری بەکارهێنەر دەبێت.'
          )}
        </p>

        {waSaved && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
            {bi(
              'تم حفظ قوالب واتساب المشفرة.',
              'Encrypted WhatsApp templates saved.',
              'داڕشتە کۆدکراوەکانی واتساپ پاشەکەوت کران.'
            )}
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div>
            <label htmlFor="wa-tpl-reminder-ar" className="block font-bold text-foreground mb-1">
              {bi(
                'قالب تذكير الموعد (عربي / إنجليزي)',
                'Appointment Reminder Template (AR / EN)',
                'داڕشتەی بیرخستنەوەی چاوپێکەوتن (عەرەبی / ئینگلیزی)'
              )}
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
              className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground mb-1.5"
            />
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
              className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
            />
          </div>

          <div>
            <label htmlFor="wa-tpl-hep-ar" className="block font-bold text-foreground mb-1">
              {bi(
                'قالب برنامج التمارين المنزلية HEP (عربي / إنجليزي)',
                'HEP Program Template (AR / EN)',
                'داڕشتەی بەرنامەی ڕاهێنانی ماڵەوە HEP (عەرەبی / ئینگلیزی)'
              )}
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
              className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground mb-1.5"
            />
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
              className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
            />
          </div>

          <div>
            <label htmlFor="wa-tpl-receipt-ar" className="block font-bold text-foreground mb-1">
              {bi(
                'قالب وصل الدفع المالي (عربي / إنجليزي)',
                'Payment Receipt Template (AR / EN)',
                'داڕشتەی پسوڵەی پارەدان (عەرەبی / ئینگلیزی)'
              )}
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
              className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground mb-1.5"
            />
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
              className="w-full px-3 py-2 rounded-xl bg-layer border border-layer-line text-xs text-foreground text-start"
            />
          </div>

          <button
            type="button"
            disabled={waSaving}
            onClick={() => void handleSaveWhatsAppTemplates()}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {waSaving
              ? bi('جاري حفظ القوالب...', 'Saving Templates...', 'داڕشتەکان پاشەکەوت دەکرێن...')
              : bi('حفظ قوالب واتساب المشفرة', 'Save WhatsApp Templates', 'پاشەکەوتکردنی داڕشتەکانی واتساپ')}
          </button>
        </div>
      </div>

      {/* Workspace Mode Switcher (Solo Therapist vs Multi-Staff Team) - 2.1 */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <UserCheck className="size-4 text-primary" />
            <span>
              {bi(
                'نمط تشغيل العيادة (فردي / فريق)',
                'Clinic Workspace Mode',
                'شێوازی کارکردنی کلینیک (تاک / تیم)'
              )}
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
            {isSoloMode
              ? bi('معالج منفرد (Solo)', 'Solo Therapist', 'چارەسەرکاری تاک (Solo)')
              : bi('فريق متعدد (Team)', 'Team Clinic', 'کلینیکی تیم (Team)')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'وضع المعالج الفردي يبسّط القوائم في شاشة "اليوم" ويزيل تبديل الكادر ورمز المدير التلقائي، بينما يفعّل وضع الفريق الاستقبال والطابور وصلاحيات الكادر.',
            'Solo Mode streamlines navigation around "Today" and removes staff switchers and Admin PIN prompts. Switch to Team Mode anytime if you add staff.',
            'شێوازی چارەسەرکاری تاک لیستەکانی شاشەی "ئەمڕۆ" سادە دەکاتەوە و گۆڕینی ستاف و داواکردنی کۆدی بەڕێوەبەر لادەبات، لەکاتێکدا شێوازی تیم پێشوازی و ڕیز و دەسەڵاتی ستاف چالاک دەکات.'
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

      {/* My Clinic Services & Custom Price List (EMPTY by default per 2.6 & R2) */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Tag className="size-4 text-primary" />
            <span>
              {bi(
                'خدماتي وأسعاري المخصصة (اختياري)',
                'My Clinic Services & Packages (Optional)',
                'خزمەتگوزاری و نرخە تایبەتەکانم (بژاردەیی)'
              )}
            </span>
          </div>
          <span className="text-xs text-muted-foreground-1 font-semibold">
            {bi('فارغة افتراضياً', 'Empty by default', 'بە بنەڕەتی بەتاڵە')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'لا يفرض النظام أي أسعار جاهزة. يمكنك تعريف أسماء خدماتك أو كورساتك هنا لاختيارها بسرعة عند التحصيل، أو تركها فارغة وإدخال المبلغ يدوياً كل مرة.',
            'Zero preset fees are assumed. Add your own session or package items here for quick billing lookup, or keep empty and type amounts manually.',
            'سیستەم هیچ نرخێکی ئامادەکراو ناسەپێنێت. دەتوانیت ناوی خزمەتگوزاری یان کۆرسەکانت لێرە پێناسە بکەیت بۆ هەڵبژاردنی خێرا لە کاتی وەرگرتنی پارە، یان بە بەتاڵی جێی بهێڵیت و هەموو جارێک بڕەکە بە دەست بنووسیت.'
          )}
        </p>

        <div className="p-3 rounded-xl bg-card border border-card-line space-y-2.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              aria-label={bi('اسم الخدمة بالعربية', 'Service Name (Arabic)', 'ناوی خزمەتگوزاری بە عەرەبی')}
              value={newSvcNameAr}
              onChange={(e) => setNewSvcNameAr(e.target.value)}
              placeholder={bi(
                'اسم الخدمة بالعربية (مثال: جلسة علاجية)',
                'Service Name (Arabic)',
                'ناوی خزمەتگوزاری (نموونە: دانیشتنی چارەسەر)'
              )}
              className="w-full px-3 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground"
            />
            <input
              type="text"
              dir="ltr"
              aria-label={bi('اسم الخدمة بالإنجليزية', 'Service Name (English)', 'ناوی خزمەتگوزاری بە ئینگلیزی')}
              value={newSvcNameEn}
              onChange={(e) => setNewSvcNameEn(e.target.value)}
              placeholder="Service Name (English)"
              className="w-full px-3 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground text-start"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div>
              <label htmlFor="settings-svc-type" className="block text-xs font-bold text-foreground mb-1">
                {bi('النوع:', 'Type:', 'جۆر:')}
              </label>
              <select
                id="settings-svc-type"
                value={newSvcType}
                onChange={(e) =>
                  setNewSvcType(e.target.value as ClinicServiceItem['invoiceType'])
                }
                className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-xs text-foreground"
              >
                <option value="single_session">{bi('جلسة مفردة', 'Single Session', 'دانیشتنی تاک')}</option>
                <option value="rehab_package">{bi('كورس', 'Course Package', 'کۆرس')}</option>
                <option value="evaluation">{bi('فحص', 'Evaluation', 'پشکنین')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="settings-svc-fee" className="block text-xs font-bold text-foreground mb-1">
                {bi('السعر:', 'Fee:', 'نرخ:')}
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
                  {bi('عدد جلسات الكورس:', 'Sessions in Course:', 'ژمارەی دانیشتنەکانی کۆرس:')}
                </label>
                <input
                  id="settings-svc-pkg-sessions"
                  type="number"
                  min={2}
                  max={60}
                  value={newSvcPkgSessions}
                  onChange={(e) => setNewSvcPkgSessions(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-xs font-mono text-foreground"
                />
              </div>
            ) : (
              <div />
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={(e) => void handleAddClinicService(e)}
              disabled={!newSvcNameAr.trim() && !newSvcNameEn.trim()}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>{bi('إضافة للقائمة', 'Add Service', 'زیادکردن بۆ لیست')}</span>
            </button>
          </div>
        </div>

        {clinicServices.length === 0 ? (
          <p className="text-xs text-muted-foreground-1 italic">
            {bi(
              'لا توجد خدمات مضافة حالياً.',
              'No custom services configured yet.',
              'لە ئێستادا هیچ خزمەتگوزارییەکی زیادکراو نییە.'
            )}
          </p>
        ) : (
          <div className="space-y-1.5">
            {clinicServices.map((svc) => (
              <div
                key={svc.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-layer border border-layer-line text-xs"
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
                    className="size-9 rounded-lg text-muted-foreground-2 hover:text-rose-600 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
};
