// =======================================================================
// PhysioRecord Clinical Component — Medication Schedule
// Interactive Daily Dosing Timeline, Adherence Status & PT Interaction Alerts
// =======================================================================

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import {
  Pill,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  ShieldAlert,
  Sun,
  Sunset,
  Moon,
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
    labelAr: 'مضاد التهاب غير ستيرويدي (NSAID)',
    labelEn: 'NSAID Anti-inflammatory',
    labelCkb: 'دژەهەوکردنی ناستیرۆیدی (NSAID)',
    precautionAr: 'قد يخفي شدة الألم الحقيقي أثناء التمارين العلاجية التحميلية.',
    precautionEn: 'May mask acute pain response during heavy therapeutic loading.',
    precautionCkb: 'لەوانەیە توندیی ئازاری ڕاستەقینە بشارێتەوە لە کاتی ڕاهێنانە قورسەکاندا.',
    badgeClass: 'text-primary',
  },
  muscle_relaxant: {
    labelAr: 'مرخي عضلي (Muscle Relaxant)',
    labelEn: 'Muscle Relaxant',
    labelCkb: 'خاوکەرەوەی ماسولکە (Muscle Relaxant)',
    precautionAr: 'انتبه للدوار أو نعاس المريض أثناء تمارين التوازن والمشي.',
    precautionEn: 'Monitor for drowsiness/dizziness during balance & gait training.',
    precautionCkb: 'ئاگاداری سەرگێژخواردن یان خەواڵوویی نەخۆش بە لە کاتی ڕاهێنانی هاوسەنگی و ڕۆیشتندا.',
    badgeClass: 'text-orange-600 dark:text-orange-400',
  },
  anticoagulant: {
    labelAr: 'مميع دم (Anticoagulant)',
    labelEn: 'Anticoagulant / Blood Thinner',
    labelCkb: 'شڵکەرەوەی خوێن (Anticoagulant)',
    precautionAr: 'تجنب الإبر الجافة العميقة (Dry Needling) أو المساج العنيف لمنع النزف والكدمات.',
    precautionEn: 'Avoid deep dry needling or aggressive soft-tissue mobilization (bruising risk).',
    precautionCkb: 'خۆبەدوورگرتن لە دەرزیی وشکی قووڵ (Dry Needling) یان مەساجی توند بۆ ڕێگری لە خوێنبەربوون و شینبوونەوە.',
    badgeClass: 'text-rose-700 dark:text-rose-400',
  },
  analgesic: {
    labelAr: 'مسكن ألم (Analgesic)',
    labelEn: 'Analgesic',
    labelCkb: 'ئازارشکێن (Analgesic)',
    precautionAr: 'تقييم مستوى الألم قبل ذروة مفعول المسكن للحصول على خط أساس دقيق.',
    precautionEn: 'Assess baseline VAS pain prior to peak analgesic effect.',
    precautionCkb: 'هەڵسەنگاندنی ئاستی ئازار پێش لوتکەی کاریگەریی ئازارشکێنەکە بۆ دەستکەوتنی خاڵی بنەڕەتی ورد.',
    badgeClass: 'text-primary',
  },
  corticosteroid: {
    labelAr: 'كورتيكوستيرويد (Corticosteroid)',
    labelEn: 'Corticosteroid',
    labelCkb: 'کۆرتیکۆستیرۆید (Corticosteroid)',
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

export const OrganMedicationSchedule: React.FC<OrganMedicationScheduleProps> = ({
  patientId,
  currentMedicationsText,
  onUpdateMedicationsText,
  readOnly = false,
}) => {
  const { bi } = useLanguage();

  const [meds, setMeds] = useState<MedicationScheduleItem[]>([]);
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

    // Bootstrap from currentMedicationsText if present
    if (currentMedicationsText && currentMedicationsText.trim()) {
      const parts = currentMedicationsText
        .split(/[,،\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const initial: MedicationScheduleItem[] = parts.map((part, idx) => {
        const lower = part.toLowerCase();
        let cat: MedicationScheduleItem['category'] = 'other';
        if (lower.includes('ibuprofen') || lower.includes('voltaren') || lower.includes('diclofenac') || lower.includes('celebrex') || lower.includes('مضاد التهاب')) {
          cat = 'nsaid';
        } else if (lower.includes('baclofen') || lower.includes('mydocalm') || lower.includes('مرخي')) {
          cat = 'muscle_relaxant';
        } else if (lower.includes('aspirin') || lower.includes('warfarin') || lower.includes('eliquis') || lower.includes('مميع')) {
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

  const handleAddMedication = () => {
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
    setNewName('');
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

  return (
    <div className="rounded-2xl pr-surface p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.045] dark:border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Pill className="size-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-foreground">
              {bi('الجدول الدوائي وتنبيهات العلاج الطبيعي', 'Medication Schedule & PT Interactions', 'خشتەی دەرمان و ئاگادارکردنەوەکانی چارەسەری سروشتی')}
            </h3>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'متابعة الجرعات اليومية وتأثير الأدوية على الجلسة العلاجية',
                'Daily dosing timeline and clinical physical therapy precautions',
                'بەدواداچوونی ژەمە ڕۆژانەکان و کاریگەریی دەرمانەکان لەسەر دانیشتنی چارەسەر'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
            <bdi dir="ltr">{meds.filter((m) => m.status === 'taken').length}/{meds.length}</bdi>{' '}
            {bi('تم تناولها', 'Taken', 'خوراوە')}
          </span>
        </div>
      </div>

      {/* Add Medication Quick Bar */}
      {!readOnly && (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-surface/65 p-3 rounded-2xl">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={bi('اسم الدواء (مثال: Diclofenac, Baclofen)...', 'Medication name (e.g. Ibuprofen)...', 'ناوی دەرمان (نموونە: Diclofenac, Baclofen)...')}
            className="sm:col-span-4 px-3 py-1.5 text-xs rounded-xl bg-card text-foreground"
          />
          <input
            type="text"
            value={newDosage}
            onChange={(e) => setNewDosage(e.target.value)}
            placeholder={bi('الجرعة (50mg)', 'Dosage (50mg)', 'بڕەژەم (50mg)')}
            className="sm:col-span-2 px-2.5 py-1.5 text-xs font-mono rounded-xl bg-card text-foreground tabular-nums"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as MedicationScheduleItem['category'])}
            className="sm:col-span-3 px-2.5 py-1.5 text-xs rounded-xl bg-card text-foreground"
          >
            <option value="nsaid">{bi('مضاد التهاب (NSAID)', 'NSAID', 'دژەهەوکردن (NSAID)')}</option>
            <option value="muscle_relaxant">{bi('مرخي عضلي', 'Muscle Relaxant', 'خاوکەرەوەی ماسولکە')}</option>
            <option value="analgesic">{bi('مسكن ألم', 'Analgesic', 'ئازارشکێن')}</option>
            <option value="anticoagulant">{bi('مميع دم', 'Anticoagulant', 'شڵکەرەوەی خوێن')}</option>
            <option value="corticosteroid">{bi('كورتيزون', 'Corticosteroid', 'کۆرتیزۆن')}</option>
            <option value="other">{bi('أخرى', 'Other', 'هی تر')}</option>
          </select>
          <select
            value={newFreq}
            onChange={(e) => setNewFreq(e.target.value as MedicationScheduleItem['frequency'])}
            className="sm:col-span-2 px-2.5 py-1.5 text-xs rounded-xl bg-card text-foreground"
          >
            <option value="morning">{bi('صباحاً (08:00)', 'Morning', 'بەیانیان (08:00)')}</option>
            <option value="noon">{bi('ظهراً (13:00)', 'Noon', 'نیوەڕۆیان (13:00)')}</option>
            <option value="evening">{bi('مساءً (19:00)', 'Evening', 'ئێواران (19:00)')}</option>
            <option value="bedtime">{bi('قبل النوم', 'Bedtime', 'پێش خەوتن')}</option>
            <option value="prn">{bi('عند اللزوم', 'PRN', 'لە کاتی پێویستدا')}</option>
          </select>
          <button
            type="button"
            onClick={handleAddMedication}
            aria-label={bi('إضافة للجدول الدوائي', 'Add medication', 'زیادکردن بۆ خشتەی دەرمان')}
            className="compact-btn sm:col-span-1 px-3 py-1.5 min-h-[36px] rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold flex items-center justify-center cursor-pointer transition-colors"
            title={bi('إضافة للجدول الدوائي', 'Add medication', 'زیادکردن بۆ خشتەی دەرمان')}
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}

      {/* Timeline List */}
      {meds.length === 0 ? (
        <div className="p-5 text-center rounded-2xl bg-surface/50 text-xs text-muted-foreground-1">
          {bi(
            'لا توجد أدوية مسجلة في الجدول اليومي. أضف الأدوية أعلاه لتحليل تداخلاتها مع العلاج الطبيعي.',
            'No active medications scheduled. Add medications above to track dosing and PT precautions.',
            'هیچ دەرمانێک لە خشتەی ڕۆژانەدا تۆمار نەکراوە. دەرمانەکان لە سەرەوە زیاد بکە بۆ شیکردنەوەی کارلێکیان لەگەڵ چارەسەری سروشتیدا.'
          )}
        </div>
      ) : (
        <div className="divide-y divide-black/[0.045] dark:divide-white/[0.06] rounded-2xl bg-surface/50 overflow-hidden">
          {meds.map((med) => {
            const meta = CATEGORY_META[med.category];
            return (
              <div
                key={med.id}
                className="p-3 hover:bg-surface/80 flex flex-wrap items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(med.id)}
                    className={`compact-btn px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer tabular-nums shrink-0 ${
                      med.status === 'taken'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : med.status === 'missed'
                        ? 'bg-card text-rose-700 dark:text-rose-400'
                        : 'bg-card text-foreground'
                    }`}
                  >
                    {med.timeSlot} •{' '}
                    {med.status === 'taken'
                      ? bi('تم أخذها', 'Taken', 'خوراوە')
                      : med.status === 'missed'
                      ? bi('فائتة', 'Missed', 'لەدەستچووە')
                      : bi('مجدولة', 'Scheduled', 'خشتەدانراو')}
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-foreground">
                        {med.name}
                      </span>
                      <span className="text-xs font-mono font-semibold text-primary tabular-nums">
                        {med.dosage}
                      </span>
                      <span className={`text-xs font-bold ${meta.badgeClass}`}>
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
                    <div className="inline-flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          handleDelete(med.id);
                          setConfirmDeleteId(null);
                        }}
                        className="compact-btn px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                      >
                        {bi('تأكيد', 'Confirm', 'دڵنیاکردنەوە')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="compact-btn px-2.5 py-1 rounded-lg bg-card text-xs text-foreground cursor-pointer"
                      >
                        {bi('إلغاء', 'Cancel', 'پاشگەزبوونەوە')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(med.id)}
                      aria-label={bi('حذف الدواء', 'Delete medication', 'سڕینەوەی دەرمان')}
                      className="compact-btn p-1.5 text-muted-foreground-2 hover:text-rose-600 rounded-lg hover:bg-card cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Physical Therapy Precaution Notice if Anticoagulant Active (Red text on neutral surface, zero box) */}
      {activePrecautions.some((m) => m.category === 'anticoagulant') && (
        <div className="px-3 py-2 rounded-xl bg-surface/65 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-400">
          <ShieldAlert className="size-4 shrink-0" />
          <span className="font-bold">
            {bi(
              'تنبيه سريري حرج: المريض يتناول مميعات دم — يُحظر الوخز بالإبر الجافة العميقة أو تحريك الأنسجة الرخوة العنيف.',
              'Critical PT Alert: Patient is on Anticoagulants — Avoid deep dry needling and high-force instrument-assisted soft tissue mobilization.',
              'ئاگادارکردنەوەی کلینیکی هەستیار: نەخۆش شڵکەرەوەی خوێن بەکاردەهێنێت — دەرزیی وشکی قووڵ و جووڵاندنی توندی شانە نەرمەکان قەدەغەیە.'
            )}
          </span>
        </div>
      )}
    </div>
  );
};
