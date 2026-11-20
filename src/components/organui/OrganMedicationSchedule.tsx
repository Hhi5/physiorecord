// =======================================================================
// PhysioRecord Clinical Component — Medication Schedule (Read-First UX)
// Clean active medication timeline, PT interaction alerts, & modal add drawer
// =======================================================================

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { ModalDialog } from '../ui/Dialog';
import {
  Pill,
  Plus,
  Trash2,
  ShieldAlert,
  Info,
} from 'lucide-react';

export interface MedicationScheduleItem {
  id: string;
  name: string;
  dosage: string;
  frequency: 'morning' | 'noon' | 'evening' | 'bedtime' | 'prn';
  timeSlot: string;
  category: 'nsaid' | 'analgesic' | 'muscle_relaxant' | 'anticoagulant' | 'corticosteroid' | 'other';
  status: 'taken' | 'scheduled' | 'missed';
  ptPrecautionAr?: string;
  ptPrecautionEn?: string;
}

interface OrganMedicationScheduleProps {
  patientId: string;
  currentMedicationsText: string;
  onUpdateMedicationsText?: (text: string) => void;
  readOnly?: boolean;
}

const CATEGORY_META: Record<
  MedicationScheduleItem['category'],
  {
    labelAr: string;
    labelEn: string;
    labelCkb: string;
    precautionAr: string;
    precautionEn: string;
    precautionCkb: string;
    badgeClass: string;
  }
> = {
  nsaid: {
    labelAr: 'مضاد التهاب (NSAID)',
    labelEn: 'NSAID Anti-inflammatory',
    labelCkb: 'دژەهەوکردنی ناستیرۆیدی (NSAID)',
    precautionAr: 'قد يخفي شدة الألم الحقيقي أثناء التمارين العلاجية التحميلية.',
    precautionEn: 'May mask acute pain response during heavy therapeutic loading.',
    precautionCkb: 'لەوانەیە توندیی ئازاری ڕاستەقینە بشارێتەوە لە کاتی ڕاهێنانە قورسەکاندا.',
    badgeClass: 'text-primary',
  },
  muscle_relaxant: {
    labelAr: 'مرخي عضلي',
    labelEn: 'Muscle Relaxant',
    labelCkb: 'خاوکەرەوەی ماسولکە',
    precautionAr: 'انتبه للدوار أو نعاس المريض أثناء تمارين التوازن والمشي.',
    precautionEn: 'Monitor for drowsiness/dizziness during balance & gait training.',
    precautionCkb: 'ئاگاداری سەرگێژخواردن یان خەواڵوویی نەخۆش بە لە کاتی ڕاهێنانی هاوسەنگی و ڕۆیشتندا.',
    badgeClass: 'text-orange-600 dark:text-orange-400',
  },
  anticoagulant: {
    labelAr: 'مميع دم',
    labelEn: 'Anticoagulant',
    labelCkb: 'شڵکەرەوەی خوێن',
    precautionAr: 'تجنب الإبر الجافة العميقة (Dry Needling) أو المساج العنيف لمنع النزف والكدمات.',
    precautionEn: 'Avoid deep dry needling or aggressive soft-tissue mobilization (bruising risk).',
    precautionCkb: 'خۆبەدوورگرتن لە دەرزیی وشکی قووڵ (Dry Needling) یان مەساجی توند بۆ ڕێگری لە خوێنبەربوون و شینبوونەوە.',
    badgeClass: 'text-rose-700 dark:text-rose-400',
  },
  analgesic: {
    labelAr: 'مسكن ألم',
    labelEn: 'Analgesic',
    labelCkb: 'ئازارشکێن',
    precautionAr: 'تقييم مستوى الألم قبل ذروة مفعول المسكن للحصول على خط أساس دقيق.',
    precautionEn: 'Assess baseline VAS pain prior to peak analgesic effect.',
    precautionCkb: 'هەڵسەنگاندنی ئاستی ئازار پێش لوتکەی کاریگەریی ئازارشکێنەکە بۆ دەستکەوتنی خاڵی بنەڕەتی ورد.',
    badgeClass: 'text-primary',
  },
  corticosteroid: {
    labelAr: 'كورتيكوستيرويد',
    labelEn: 'Corticosteroid',
    labelCkb: 'کۆرتیکۆستیرۆید',
    precautionAr: 'احذر من ضعف الأوتار والأنسجة الضامة عند تطبيق مقاومات عالية.',
    precautionEn: 'Caution with high-load eccentric tendon loading post-steroid use.',
    precautionCkb: 'ئاگاداری لاوازیی ژێیەکان و شانە بەستەرەکان بە لە کاتی بەکارهێنانی بەرگریی بەرزدا.',
    badgeClass: 'text-orange-600 dark:text-orange-400',
  },
  other: {
    labelAr: 'دواء عام / مكمل',
    labelEn: 'General Medication',
    labelCkb: 'دەرمانی گشتی / تەواوکەر',
    precautionAr: 'مراجعة توافق الدواء مع الجهد البدني.',
    precautionEn: 'Standard exercise tolerance monitoring.',
    precautionCkb: 'پێداچوونەوەی گونجانی دەرمانەکە لەگەڵ ماندووبوونی جەستەییدا.',
    badgeClass: 'text-muted-foreground-1',
  },
};

const QUICK_MED_PRESETS: Array<{
  name: string;
  dosage: string;
  category: MedicationScheduleItem['category'];
}> = [
  { name: 'Diclofenac (Voltaren)', dosage: '50mg', category: 'nsaid' },
  { name: 'Paracetamol', dosage: '500mg', category: 'analgesic' },
  { name: 'Baclofen', dosage: '10mg', category: 'muscle_relaxant' },
  { name: 'Aspirin', dosage: '100mg', category: 'anticoagulant' },
];

export const OrganMedicationSchedule: React.FC<OrganMedicationScheduleProps> = ({
  patientId,
  currentMedicationsText,
  onUpdateMedicationsText,
  readOnly = false,
}) => {
  const { bi } = useLanguage();

  const [meds, setMeds] = useState<MedicationScheduleItem[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDosage, setNewDosage] = useState('500mg');
  const [newFreq, setNewFreq] = useState<MedicationScheduleItem['frequency']>('morning');
  const [newCategory, setNewCategory] = useState<MedicationScheduleItem['category']>('nsaid');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const saved = ClinicOperationsService.getPatientMedications(patientId);
    if (saved && saved.length > 0) {
      setMeds(saved as unknown as MedicationScheduleItem[]);
      return;
    }

    if (currentMedicationsText && currentMedicationsText.trim()) {
      const parts = currentMedicationsText
        .split(/[,،\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const initial: MedicationScheduleItem[] = parts.map((part, idx) => {
        const lower = part.toLowerCase();
        let cat: MedicationScheduleItem['category'] = 'other';
        if (
          lower.includes('ibuprofen') ||
          lower.includes('voltaren') ||
          lower.includes('diclofenac') ||
          lower.includes('celebrex') ||
          lower.includes('مضاد التهاب')
        ) {
          cat = 'nsaid';
        } else if (lower.includes('baclofen') || lower.includes('mydocalm') || lower.includes('مرخي')) {
          cat = 'muscle_relaxant';
        } else if (
          lower.includes('aspirin') ||
          lower.includes('warfarin') ||
          lower.includes('eliquis') ||
          lower.includes('مميع')
        ) {
          cat = 'anticoagulant';
        } else if (lower.includes('paracetamol') || lower.includes('panadol') || lower.includes('مسكن')) {
          cat = 'analgesic';
        }
        return {
          id: `med_${idx}_${Date.now()}`,
          name: part,
          dosage: '1 tab',
          frequency: idx % 2 === 0 ? 'morning' : 'evening',
          timeSlot: idx % 2 === 0 ? '08:00' : '20:00',
          category: cat,
          status: 'taken',
        };
      });
      setMeds(initial);
    } else {
      setMeds([]);
    }
  }, [patientId]);

  const persistMeds = (updated: MedicationScheduleItem[]) => {
    setMeds(updated);
    ClinicOperationsService.savePatientMedications(
      patientId,
      updated as unknown as Array<Record<string, unknown>>
    );
    if (onUpdateMedicationsText) {
      const summary = updated.map((m) => `${m.name} (${m.dosage})`).join('، ');
      onUpdateMedicationsText(summary);
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewDosage('500mg');
    setNewFreq('morning');
    setNewCategory('nsaid');
  };

  const handleAddMedication = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newName.trim() || readOnly) return;
    const defaultTime =
      newFreq === 'morning'
        ? '08:00'
        : newFreq === 'noon'
        ? '13:00'
        : newFreq === 'evening'
        ? '19:00'
        : newFreq === 'bedtime'
        ? '22:30'
        : 'PRN';

    const item: MedicationScheduleItem = {
      id: `med_${Date.now()}`,
      name: newName.trim(),
      dosage: newDosage.trim() || '1 tab',
      frequency: newFreq,
      timeSlot: defaultTime,
      category: newCategory,
      status: 'scheduled',
    };
    persistMeds([...meds, item]);
    resetForm();
    setIsAddModalOpen(false);
  };

  const handleToggleStatus = (id: string) => {
    if (readOnly) return;
    const order: MedicationScheduleItem['status'][] = ['scheduled', 'taken', 'missed'];
    const updated = meds.map((m) => {
      if (m.id !== id) return m;
      const next = order[(order.indexOf(m.status) + 1) % order.length];
      return { ...m, status: next };
    });
    persistMeds(updated);
  };

  const handleDelete = (id: string) => {
    if (readOnly) return;
    persistMeds(meds.filter((m) => m.id !== id));
  };

  const activePrecautions = meds.filter((m) => m.category !== 'other');
  const previewMeta = CATEGORY_META[newCategory];

  return (
    <div className="rounded-2xl pr-surface p-4 sm:p-5 space-y-3">
      {/* Compact Read-First Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Pill className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-foreground">
                {bi(
                  'الأدوية النشطة وتداخلاتها',
                  'Active Medications & PT Interactions',
                  'دەرمانە چالاکەکان و کارلێکەکانیان'
                )}
              </h3>
              {meds.length > 0 && (
                <span className="text-xs font-mono tabular-nums text-muted-foreground-1">
                  ·{' '}
                  <bdi dir="ltr">
                    {meds.filter((m) => m.status === 'taken').length}/{meds.length}
                  </bdi>{' '}
                  {bi('تم تناولها', 'taken', 'خوراوە')}
                </span>
              )}
            </div>
          </div>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="compact-btn min-h-[40px] px-3.5 rounded-xl bg-surface/90 hover:bg-surface text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="size-3.5 text-primary" />
            <span>{bi('إضافة دواء', 'Add Medication', 'زیادکردنی دەرمان')}</span>
          </button>
        )}
      </div>

      {/* Anticoagulant Critical Notice if present */}
      {activePrecautions.some((m) => m.category === 'anticoagulant') && (
        <div className="px-3 py-2.5 rounded-xl bg-surface/70 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-400">
          <ShieldAlert className="size-4 shrink-0 mt-0.5" />
          <span className="font-bold leading-relaxed">
            {bi(
              'تنبيه سريري حرج: المريض يتناول مميعات دم — يُحظر الوخز بالإبر الجافة العميقة أو تحريك الأنسجة الرخوة العنيف.',
              'Critical PT Alert: Patient is on Anticoagulants — Avoid deep dry needling and aggressive soft-tissue mobilization.',
              'ئاگادارکردنەوەی کلینیکی هەستیار: نەخۆش شڵکەرەوەی خوێن بەکاردەهێنێت — دەرزیی وشکی قووڵ و جووڵاندنی توندی شانە نەرمەکان قەدەغەیە.'
            )}
          </span>
        </div>
      )}

      {/* Medication List or Calm 1-Line Empty State */}
      {meds.length === 0 ? (
        <p className="text-xs text-muted-foreground-1 leading-relaxed py-1">
          {bi(
            'لا توجد أدوية مسجلة حالياً — أضف الأدوية لمراقبة تداخلاتها مع العلاج الطبيعي.',
            'No active medications recorded — add medications to track dosing and PT precautions.',
            'هیچ دەرمانێک تۆمار نەکراوە — دەرمانەکان زیاد بکە بۆ چاودێریکردنی کارلێکیان لەگەڵ چارەسەری سروشتیدا.'
          )}
        </p>
      ) : (
        <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06] rounded-2xl bg-surface/50 overflow-hidden">
          {meds.map((med) => {
            const meta = CATEGORY_META[med.category];
            return (
              <div
                key={med.id}
                className="p-3 hover:bg-surface/80 flex flex-wrap items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(med.id)}
                    className={`compact-btn min-h-[36px] px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer tabular-nums shrink-0 ${
                      med.status === 'taken'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : med.status === 'missed'
                        ? 'bg-card text-rose-700 dark:text-rose-400'
                        : 'bg-card text-foreground'
                    }`}
                  >
                    {med.timeSlot} ·{' '}
                    {med.status === 'taken'
                      ? bi('تم أخذها', 'Taken', 'خوراوە')
                      : med.status === 'missed'
                      ? bi('فائتة', 'Missed', 'لەدەستچووە')
                      : bi('مجدولة', 'Scheduled', 'خشتەدانراو')}
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-bold text-foreground">{med.name}</span>
                      <span className="font-mono font-semibold text-primary tabular-nums">
                        {med.dosage}
                      </span>
                      <span className="text-muted-foreground-2" aria-hidden="true">
                        ·
                      </span>
                      <span className={`font-semibold ${meta.badgeClass}`}>
                        {bi(meta.labelAr, meta.labelEn, meta.labelCkb)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground-1 mt-0.5 leading-relaxed">
                      {bi(meta.precautionAr, meta.precautionEn, meta.precautionCkb)}
                    </p>
                  </div>
                </div>

                {!readOnly &&
                  (confirmDeleteId === med.id ? (
                    <div className="inline-flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          handleDelete(med.id);
                          setConfirmDeleteId(null);
                        }}
                        className="compact-btn min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                      >
                        {bi('تأكيد', 'Confirm', 'دڵنیاکردنەوە')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="compact-btn min-h-[36px] px-2.5 py-1 rounded-lg bg-card text-xs text-foreground cursor-pointer"
                      >
                        {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(med.id)}
                      aria-label={bi('حذف الدواء', 'Delete medication', 'سڕینەوەی دەرمان')}
                      className="compact-btn min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-muted-foreground-2 hover:text-rose-600 rounded-xl hover:bg-card cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Medication Bottom-Sheet Modal */}
      <ModalDialog
        isOpen={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        title={bi('إضافة دواء للجدول اليومي', 'Add Active Medication', 'زیادکردنی دەرمان بۆ خشتەی ڕۆژانە')}
        subtitle={bi(
          'اختر التصنيف الدوائي لتفعيل تنبيهات التداخل مع العلاج الطبيعي تلقائياً',
          'Select medication category to surface clinical PT safety precautions',
          'جۆری دەرمان هەڵبژێرە بۆ دەرکەوتنی ئاگادارییە کلینیکییەکان بە شێوەی خۆکار'
        )}
        size="md"
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="compact-btn min-h-[44px] px-4 rounded-xl bg-surface hover:bg-surface/80 text-foreground text-xs font-bold cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
            </button>
            <button
              type="button"
              onClick={() => handleAddMedication()}
              disabled={!newName.trim()}
              className="compact-btn min-h-[44px] px-5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {bi('إضافة للجدول', 'Add Medication', 'زیادکردن بۆ خشتە')}
            </button>
          </div>
        }
      >
        <form onSubmit={handleAddMedication} className="space-y-4">
          {/* Quick Iraqi/PT Medication Presets */}
          <div>
            <span className="block text-xs font-semibold text-muted-foreground-1 mb-2">
              {bi('اختيار سريع:', 'Quick fill:', 'هەڵبژاردنی خێرا:')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_MED_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setNewName(preset.name);
                    setNewDosage(preset.dosage);
                    setNewCategory(preset.category);
                  }}
                  className="compact-btn min-h-[36px] px-3 py-1 rounded-xl bg-surface hover:bg-surface/80 text-xs font-semibold text-foreground cursor-pointer transition-colors"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="med-modal-name" className="block text-xs font-bold text-foreground mb-1.5">
                {bi('اسم الدواء:', 'Medication Name:', 'ناوی دەرمان:')}
              </label>
              <input
                id="med-modal-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={bi('مثال: Diclofenac, Baclofen...', 'e.g. Ibuprofen...', 'نموونە: Diclofenac...')}
                className="w-full min-h-[42px] px-3 py-2 text-xs rounded-xl bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <div>
              <label htmlFor="med-modal-dose" className="block text-xs font-bold text-foreground mb-1.5">
                {bi('الجرعة:', 'Dosage:', 'بڕەژەم:')}
              </label>
              <input
                id="med-modal-dose"
                type="text"
                value={newDosage}
                onChange={(e) => setNewDosage(e.target.value)}
                placeholder="50mg"
                className="w-full min-h-[42px] px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="med-modal-cat" className="block text-xs font-bold text-foreground mb-1.5">
                {bi('التصنيف الدوائي:', 'Category:', 'پۆلێنکردنی دەرمان:')}
              </label>
              <select
                id="med-modal-cat"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MedicationScheduleItem['category'])}
                className="w-full min-h-[42px] px-3 py-2 text-xs rounded-xl bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              >
                <option value="nsaid">{bi('مضاد التهاب (NSAID)', 'NSAID', 'دژەهەوکردن (NSAID)')}</option>
                <option value="muscle_relaxant">{bi('مرخي عضلي', 'Muscle Relaxant', 'خاوکەرەوەی ماسولکە')}</option>
                <option value="analgesic">{bi('مسكن ألم', 'Analgesic', 'ئازارشکێن')}</option>
                <option value="anticoagulant">{bi('مميع دم', 'Anticoagulant', 'شڵکەرەوەی خوێن')}</option>
                <option value="corticosteroid">{bi('كورتيزون', 'Corticosteroid', 'کۆرتیزۆن')}</option>
                <option value="other">{bi('أخرى', 'Other', 'هی تر')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="med-modal-freq" className="block text-xs font-bold text-foreground mb-1.5">
                {bi('التوقيت اليومي:', 'Dosing Time:', 'کاتی ڕۆژانە:')}
              </label>
              <select
                id="med-modal-freq"
                value={newFreq}
                onChange={(e) => setNewFreq(e.target.value as MedicationScheduleItem['frequency'])}
                className="w-full min-h-[42px] px-3 py-2 text-xs rounded-xl bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
              >
                <option value="morning">{bi('صباحاً (08:00)', 'Morning (08:00)', 'بەیانیان (08:00)')}</option>
                <option value="noon">{bi('ظهراً (13:00)', 'Noon (13:00)', 'نیوەڕۆیان (13:00)')}</option>
                <option value="evening">{bi('مساءً (19:00)', 'Evening (19:00)', 'ئێواران (19:00)')}</option>
                <option value="bedtime">{bi('قبل النوم (22:30)', 'Bedtime (22:30)', 'پێش خەوتن (22:30)')}</option>
                <option value="prn">{bi('عند اللزوم (PRN)', 'PRN', 'لە کاتی پێویستدا')}</option>
              </select>
            </div>
          </div>

          {/* Live PT Interaction Preview */}
          <div className="p-3 rounded-xl bg-surface/70 flex items-start gap-2 text-xs">
            <Info className={`size-4 shrink-0 mt-0.5 ${previewMeta.badgeClass}`} />
            <div className="space-y-0.5">
              <span className={`font-bold block ${previewMeta.badgeClass}`}>
                {bi(previewMeta.labelAr, previewMeta.labelEn, previewMeta.labelCkb)}
              </span>
              <p className="text-muted-foreground-1 leading-relaxed">
                {bi(previewMeta.precautionAr, previewMeta.precautionEn, previewMeta.precautionCkb)}
              </p>
            </div>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
