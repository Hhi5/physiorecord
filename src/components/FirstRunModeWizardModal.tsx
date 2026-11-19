// =======================================================================
// PhysioRecord — First-Run Workspace Mode Wizard (Phase 2.1)
// Allows solo clinicians to streamline UI on first unlock without losing
// optional team attribution & multi-staff workflows when needed.
// =======================================================================

import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { ClinicOperationsService } from '../services/clinicOperationsService';
import { ModalDialog } from './ui/Dialog';
import { UserCheck, Users, ShieldCheck, Sparkles, Check } from 'lucide-react';

interface FirstRunModeWizardModalProps {
  isOpen: boolean;
  onCompletedSolo: () => void;
  onCompletedTeam: () => void;
}

export const FirstRunModeWizardModal: React.FC<FirstRunModeWizardModalProps> = ({
  isOpen,
  onCompletedSolo,
  onCompletedTeam,
}) => {
  const { bi } = useLanguage();

  const [selectedMode, setSelectedMode] = useState<'solo' | 'team'>('solo');
  const [therapistName, setTherapistName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      if (selectedMode === 'solo') {
        await ClinicOperationsService.configureSoloModeAsync({
          ...(therapistName.trim()
            ? {
                therapistNameAr: therapistName.trim(),
                therapistNameEn: therapistName.trim(),
              }
            : {}),
          ...(clinicName.trim()
            ? {
                clinicNameAr: clinicName.trim(),
                clinicNameEn: clinicName.trim(),
              }
            : {}),
        });
        onCompletedSolo();
      } else {
        await ClinicOperationsService.configureTeamModeAsync();
        if (therapistName.trim() || clinicName.trim()) {
          await ClinicOperationsService.saveClinicProfileAsync({
            ...(therapistName.trim()
              ? {
                  therapistNameAr: therapistName.trim(),
                  therapistNameEn: therapistName.trim(),
                }
              : {}),
            ...(clinicName.trim()
              ? {
                  clinicNameAr: clinicName.trim(),
                  clinicNameEn: clinicName.trim(),
                }
              : {}),
          });
        }
        onCompletedTeam();
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : bi(
              'تعذر حفظ تفضيل وضع العمل.',
              'Failed to save workspace mode.',
              'پاشەکەوتکردنی دۆخی کارکردن سەرکەوتوو نەبوو.'
            )
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={() => undefined}
      isDismissable={false}
      hideCloseButton
      size="md"
      title={bi('مرحباً بك في PhysioRecord', 'Welcome to PhysioRecord', 'بەخێربێیت بۆ PhysioRecord')}
      subtitle={bi(
        'اختر طريقة عملك لتبسيط الواجهة (قابلة للتغيير لاحقاً من الإعدادات).',
        'Choose how you practice so we tailor the workspace cleanly (changeable anytime in Settings).',
        'شێوازی کارکردنت هەڵبژێرە بۆ ئەوەی ڕووکارەکە بەپێی کلینیکەکەت ئاسان بکرێت (دواتر دەتوانیت لە ڕێکخستنەکان بیگۆڕیت).'
      )}
    >
      <form onSubmit={handleConfirm} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Option 1: Solo Therapist Mode */}
          <button
            type="button"
            data-testid="wizard-mode-solo"
            onClick={() => setSelectedMode('solo')}
            className={`text-start p-4 rounded-2xl transition-all cursor-pointer flex flex-col gap-2.5 ${
              selectedMode === 'solo'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-surface/75 hover:bg-surface text-foreground'
            }`}
          >
            <div className="flex items-center justify-between">
              <div
                className={`size-10 rounded-xl flex items-center justify-center ${
                  selectedMode === 'solo'
                    ? 'bg-primary-foreground/15 text-primary-foreground'
                    : 'bg-card text-muted-foreground-1'
                }`}
              >
                <UserCheck className="size-5" />
              </div>
              {selectedMode === 'solo' && (
                <span className="inline-flex items-center gap-1 text-primary-foreground text-xs font-bold">
                  <Check className="size-3.5" />
                  <span>{bi('مُوصى به', 'Recommended', 'پێشنیارکراو')}</span>
                </span>
              )}
            </div>
            <div>
              <h3
                className={`text-sm font-extrabold ${
                  selectedMode === 'solo' ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {bi(
                  'أعمل بمفردي (عيادة فردية)',
                  'I work alone (Solo Mode)',
                  'بە تەنها کار دەکەم (کلینیکی تاکەکەسی)'
                )}
              </h3>
              <p
                className={`text-xs mt-1 leading-relaxed ${
                  selectedMode === 'solo' ? 'text-primary-foreground/85' : 'text-muted-foreground-1'
                }`}
              >
                {bi(
                  'شاشة رئيسية موحدة "اليوم"، مراجع سريع في 10 ثوانٍ، وتوثيق فوري دون تعقيد الكادر أو رمز PIN إضافي.',
                  'Unified "Today" home screen, 10s walk-in intake, Quick SOAP, and zero multi-staff or Admin PIN clutter.',
                  'شاشەی سەرەکی یەکگرتووی "ئەمڕۆ"، تۆمارکردنی خێرای نەخۆش لە ١٠ چرکەدا، و نووسینی دەستبەجێی SOAP بێ ئاڵۆزی ستاف یان کۆدی PINی زیادە.'
                )}
              </p>
            </div>
          </button>

          {/* Option 2: Team Mode */}
          <button
            type="button"
            data-testid="wizard-mode-team"
            onClick={() => setSelectedMode('team')}
            className={`text-start p-4 rounded-2xl transition-all cursor-pointer flex flex-col gap-2.5 ${
              selectedMode === 'team'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-surface/75 hover:bg-surface text-foreground'
            }`}
          >
            <div className="flex items-center justify-between">
              <div
                className={`size-10 rounded-xl flex items-center justify-center ${
                  selectedMode === 'team'
                    ? 'bg-primary-foreground/15 text-primary-foreground'
                    : 'bg-card text-muted-foreground-1'
                }`}
              >
                <Users className="size-5" />
              </div>
              {selectedMode === 'team' && (
                <span className="inline-flex items-center gap-1 text-primary-foreground text-xs font-bold">
                  <Check className="size-3.5" />
                </span>
              )}
            </div>
            <div>
              <h3
                className={`text-sm font-extrabold ${
                  selectedMode === 'team' ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {bi('لدي فريق عمل', 'I have a team', 'تیم و کارمەندم هەیە')}
              </h3>
              <p
                className={`text-xs mt-1 leading-relaxed ${
                  selectedMode === 'team' ? 'text-primary-foreground/85' : 'text-muted-foreground-1'
                }`}
              >
                {bi(
                  'شاشة استقبال منفصلة، قائمة كادر متعدد الصلاحيات، ومطالبة برمز PIN للمدير عند المهام الإدارية.',
                  'Separate Reception & Schedule screens, multi-staff attribution labels, and Admin PIN setup.',
                  'شاشەی پێشوازی جیاواز، لیستی ستافی فرەدەسەڵات، و داواکردنی کۆدی PINی بەڕێوەبەر بۆ کارە کارگێڕییەکان.'
                )}
              </p>
            </div>
          </button>
        </div>

        {/* Optional quick clinic & therapist identity */}
        <div className="p-3.5 rounded-xl bg-surface/65 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              {bi('اسمك السريري (اختياري):', 'Your Clinician Name (Optional):', 'ناوی کلینیکیت (ئارەزوومەندانە):')}
            </label>
            <input
              type="text"
              value={therapistName}
              onChange={(e) => setTherapistName(e.target.value)}
              placeholder={bi('مثال: د. علي الحسيني', 'e.g. Dr. Ali Al-Husseini', 'نموونە: د. عەلی ئەلحوسەینی')}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-black/10 dark:border-white/10 text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-foreground block mb-1">
              {bi('اسم العيادة (اختياري):', 'Clinic Name (Optional):', 'ناوی کلینیک (ئارەزوومەندانە):')}
            </label>
            <input
              type="text"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              placeholder={bi('مثال: مركز النور للعلاج الطبيعي', 'e.g. Al-Noor Physiotherapy Clinic', 'نموونە: سەنتەری نوور بۆ چارەسەری سروشتی')}
              className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-black/10 dark:border-white/10 text-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="p-3 rounded-xl bg-surface/65 flex items-center gap-2 text-xs text-muted-foreground-1">
          <ShieldCheck className="size-4 text-primary shrink-0" />
          <span>
            {bi(
              'جميع البيانات تبقى مشفرة محلياً على هذا الجهاز بكلمة مرور الخزينة التي أنشأتها للتو.',
              'All data stays encrypted locally on this device with your vault passphrase.',
              'هەموو داتاکان بە شێوەی ناوخۆیی و نهێنیکراو لەسەر ئەم ئامێرە دەمێننەوە بە وشەی نهێنی خەزێنەکە کە ئێستا دروستت کرد.'
            )}
          </span>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-surface/65 text-xs font-semibold text-rose-700 dark:text-rose-400">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end pt-1">
          <button
            type="submit"
            disabled={isSaving}
            data-testid="wizard-confirm-btn"
            className="w-full sm:w-auto justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Sparkles className="size-4" />
            <span>
              {isSaving
                ? bi('جاري الإعداد...', 'Configuring...', 'خەریکی ڕێکخستنە...')
                : selectedMode === 'solo'
                ? bi('بدء العمل الفردي الآن', 'Start Solo Practice', 'دەستپێکردنی کاری تاکەکەسی ئێستا')
                : bi('متابعة إعداد الفريق', 'Continue Team Setup', 'بەردەوامبوون لە ڕێکخستنی تیم')}
            </span>
          </button>
        </div>
      </form>
    </ModalDialog>
  );
};
