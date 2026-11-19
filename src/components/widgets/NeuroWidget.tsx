// =======================================================================
// PhysioRecord — Modern Expansive Neurological Screening Widget
// Dermatomes Interactive Map, Myotomes (Motor), and DTR Reflexes
// =======================================================================

import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type {
  NeuroScreeningBatteryData,
  ReflexGradeValue,
  MmtGradeValue,
  DermatomeSensoryEntry,
  SensoryTableModalityGrade,
} from '../../types/clinical';
import { AsiaSensoryTable } from '../toolkit/AsiaSensoryTable';

interface NeuroWidgetProps {
  value: NeuroScreeningBatteryData | undefined;
  onChange: (updated: NeuroScreeningBatteryData) => void;
  readOnly?: boolean;
}

const DEFAULT_MYOTOMES = [
  { root: 'C5', en: 'Shoulder Abduction', ar: 'تبعيد الكتف' },
  { root: 'C6', en: 'Elbow Flexion / Wrist Ext', ar: 'ثني المرفق / بسط الرسغ' },
  { root: 'C7', en: 'Elbow Ext / Wrist Flex', ar: 'بسط المرفق / ثني الرسغ' },
  { root: 'C8', en: 'Finger Flexion', ar: 'ثني الأصابع' },
  { root: 'T1', en: 'Finger Abduction', ar: 'تبعيد الأصابع' },
  { root: 'L2', en: 'Hip Flexion', ar: 'ثني الورك' },
  { root: 'L3', en: 'Knee Extension', ar: 'بسط الركبة' },
  { root: 'L4', en: 'Ankle Dorsiflexion', ar: 'العطف الظهري للكاحل' },
  { root: 'L5', en: 'Great Toe Extension', ar: 'بسط إبهام القدم' },
  { root: 'S1', en: 'Ankle Plantarflexion', ar: 'العطف الأخمصي للكاحل' },
];

const DEFAULT_REFLEXES = [
  { id: 'biceps', root: 'C5-C6', en: 'Biceps Reflex', ar: 'منعكس العضلة ذات الرأسين' },
  { id: 'brachioradialis', root: 'C6', en: 'Brachioradialis Reflex', ar: 'منعكس العضدية الكعبرية' },
  { id: 'triceps', root: 'C7', en: 'Triceps Reflex', ar: 'منعكس العضلة ثلاثية الرؤوس' },
  { id: 'patellar', root: 'L3-L4', en: 'Patellar (Knee Jerk)', ar: 'منعكس الرضفة (نفضة الركبة)' },
  { id: 'achilles', root: 'S1', en: 'Achilles (Ankle Jerk)', ar: 'منعكس وتر العرقوب (الكاحل)' },
] as const;

export const NeuroWidget: React.FC<NeuroWidgetProps> = ({
  value,
  onChange,
  readOnly = false,
}) => {
  const { bi } = useLanguage();

  const [activeTab, setActiveTab] = useState<'dermatomes' | 'reflexes' | 'myotomes'>('dermatomes');

  const dermatomes = value?.dermatomes || [];
  const sensoryTable = value?.sensoryTable || {};
  const myotomes = value?.myotomes || [];
  const reflexes = value?.reflexes || [];
  const clinicalNotes = value?.clinicalNotes || '';

  const handleUpdateDermatomes = (
    updatedDermatomes: DermatomeSensoryEntry[],
    updatedSensoryTable: Record<string, SensoryTableModalityGrade>
  ) => {
    if (readOnly) return;
    onChange({
      batteryVersion: '1.0.0',
      dermatomes: updatedDermatomes,
      sensoryTable: updatedSensoryTable,
      myotomes,
      reflexes,
      clinicalNotes,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateReflex = (
    reflexId: 'biceps' | 'brachioradialis' | 'triceps' | 'patellar' | 'achilles',
    side: 'right' | 'left',
    grade: ReflexGradeValue
  ) => {
    if (readOnly) return;
    const refConfig = DEFAULT_REFLEXES.find((r) => r.id === reflexId);
    const existingIndex = reflexes.findIndex((r) => r.reflexId === reflexId);
    const updatedReflexes = [...reflexes];

    if (existingIndex >= 0) {
      updatedReflexes[existingIndex] = {
        ...updatedReflexes[existingIndex],
        [side === 'right' ? 'rightGrade' : 'leftGrade']: grade,
      };
    } else {
      updatedReflexes.push({
        reflexId,
        reflexLabelEn: refConfig?.en || reflexId,
        reflexLabelAr: refConfig?.ar || reflexId,
        rootLevel: refConfig?.root || '',
        rightGrade: side === 'right' ? grade : null,
        leftGrade: side === 'left' ? grade : null,
      });
    }

    onChange({
      batteryVersion: '1.0.0',
      dermatomes,
      sensoryTable,
      myotomes,
      reflexes: updatedReflexes,
      clinicalNotes,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateMyotome = (
    rootLevel: string,
    side: 'right' | 'left',
    grade: MmtGradeValue | 'NT' | null
  ) => {
    if (readOnly) return;
    const myoConfig = DEFAULT_MYOTOMES.find((m) => m.root === rootLevel);
    const existingIndex = myotomes.findIndex((m) => m.rootLevel === rootLevel);
    const updatedMyotomes = [...myotomes];

    if (existingIndex >= 0) {
      updatedMyotomes[existingIndex] = {
        ...updatedMyotomes[existingIndex],
        [side === 'right' ? 'rightGrade' : 'leftGrade']: grade,
      };
    } else {
      updatedMyotomes.push({
        rootLevel,
        movementLabelEn: myoConfig?.en || '',
        movementLabelAr: myoConfig?.ar || '',
        rightGrade: side === 'right' ? grade : null,
        leftGrade: side === 'left' ? grade : null,
      });
    }

    onChange({
      batteryVersion: '1.0.0',
      dermatomes,
      sensoryTable,
      myotomes: updatedMyotomes,
      reflexes,
      clinicalNotes,
      updatedAt: new Date().toISOString(),
    });
  };

  const getReflexGrade = (
    reflexId: 'biceps' | 'brachioradialis' | 'triceps' | 'patellar' | 'achilles',
    side: 'right' | 'left'
  ): ReflexGradeValue | null => {
    const found = reflexes.find((r) => r.reflexId === reflexId);
    return side === 'right' ? found?.rightGrade ?? null : found?.leftGrade ?? null;
  };

  const getMyotomeGrade = (rootLevel: string, side: 'right' | 'left'): string | null => {
    const found = myotomes.find((m) => m.rootLevel === rootLevel);
    return side === 'right' ? found?.rightGrade ?? null : found?.leftGrade ?? null;
  };

  const REFLEX_GRADES: ReflexGradeValue[] = ['0', '1+', '2+', '3+', '4+'];

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher (Horizontally scrollable strip) */}
      <div className="rounded-2xl bg-surface/60 p-1.5 space-y-1.5 overflow-hidden">
        <div className="pr-hscroll overflow-x-auto flex items-center gap-1 whitespace-nowrap pb-1 pt-0.5 px-0.5">
          <button
            type="button"
            onClick={(e) => {
              setActiveTab('dermatomes');
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
            className={`compact-btn h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'dermatomes'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:bg-card hover:text-foreground'
            }`}
          >
            {bi('خريطة القطاعات الجلدية (C2–S5)', 'Interactive Dermatomes (C2–S5)', 'نەخشەی دێرماتۆمەکان (C2–S5)')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              setActiveTab('reflexes');
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
            className={`compact-btn h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'reflexes'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:bg-card hover:text-foreground'
            }`}
          >
            {bi('المنعكسات الوترية العميقة (DTR)', 'Deep Tendon Reflexes (DTR)', 'پەرچەکرداری ژێی قووڵ (DTR)')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              setActiveTab('myotomes');
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
            className={`compact-btn h-8 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'myotomes'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground-1 hover:bg-card hover:text-foreground'
            }`}
          >
            {bi('القطع العضلية العصبية (Myotomes)', 'Key Motor Myotomes', 'مایۆتۆمە سەرەکییەکان (Myotomes)')}
          </button>
        </div>

        <div className="text-xs text-primary font-semibold px-2">
          {activeTab === 'dermatomes'
            ? bi('معيار ASIA الحسي ثنائي الجانب', 'ASIA ISNCSCI Sensory Mapping', 'پێوانەی هەستەوەری ASIA لە هەردوو لا')
            : activeTab === 'reflexes'
            ? bi('2+ يمثل الاستجابة الطبيعية', '2+ represents normal reflex', '2+ نیشانەی پەرچەکرداری ئاساییە')
            : bi('فحص القوة العصبية للجذور C5-S1', 'Motor root screening C5-S1', 'پشکنینی هێزی ڕەگی دەمار C5-S1')}
        </div>
      </div>

      {/* Tab 1: Table-First ASIA / ISNCSCI Sensory Screening (C2..S4-5) */}
      {activeTab === 'dermatomes' && (
        <AsiaSensoryTable
          dermatomes={dermatomes}
          sensoryTable={sensoryTable}
          onChange={handleUpdateDermatomes}
          readOnly={readOnly}
        />
      )}

      {/* Tab 2: Reflexes View */}
      {activeTab === 'reflexes' && (
        <div className="space-y-2.5">
          {DEFAULT_REFLEXES.map((ref) => {
            const rGrade = getReflexGrade(ref.id, 'right');
            const lGrade = getReflexGrade(ref.id, 'left');

            return (
              <div
                key={ref.id}
                className="p-3 rounded-2xl bg-surface/65 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3"
              >
                <div className="min-w-0 md:min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-primary/10 text-primary font-mono shrink-0">
                      {ref.root}
                    </span>
                    <h3 className="text-xs font-bold text-foreground truncate">
                      {bi(ref.ar, ref.en)}
                    </h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 flex-1 min-w-0">
                  {/* Right */}
                  <div className="flex items-center justify-between gap-1.5 p-1.5 bg-card rounded-xl">
                    <span className="text-xs font-bold text-muted-foreground-1 px-1 shrink-0">
                      {bi('الأيمن (R):', 'Right:', 'ڕاست (R):')}
                    </span>
                    <div className="flex items-center gap-0.5 flex-wrap" dir="ltr">
                      {REFLEX_GRADES.map((g) => (
                        <button
                          key={g}
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleUpdateReflex(ref.id, 'right', g)}
                          className={`compact-btn h-8 min-w-[30px] px-1.5 text-xs font-mono font-bold rounded-lg transition-colors cursor-pointer tabular-nums ${
                            rGrade === g
                              ? g === '2+'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-primary text-primary-foreground'
                              : 'bg-surface/75 text-muted-foreground-1 hover:bg-surface'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Left */}
                  <div className="flex items-center justify-between gap-1.5 p-1.5 bg-card rounded-xl">
                    <span className="text-xs font-bold text-muted-foreground-1 px-1 shrink-0">
                      {bi('الأيسر (L):', 'Left:', 'چەپ (L):')}
                    </span>
                    <div className="flex items-center gap-0.5 flex-wrap" dir="ltr">
                      {REFLEX_GRADES.map((g) => (
                        <button
                          key={g}
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleUpdateReflex(ref.id, 'left', g)}
                          className={`compact-btn h-8 min-w-[30px] px-1.5 text-xs font-mono font-bold rounded-lg transition-colors cursor-pointer tabular-nums ${
                            lGrade === g
                              ? g === '2+'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-primary text-primary-foreground'
                              : 'bg-surface/75 text-muted-foreground-1 hover:bg-surface'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: Myotomes View */}
      {activeTab === 'myotomes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {DEFAULT_MYOTOMES.map((myo) => {
            const rGrade = getMyotomeGrade(myo.root, 'right');
            const lGrade = getMyotomeGrade(myo.root, 'left');

            return (
              <div
                key={myo.root}
                className="p-3 rounded-2xl bg-surface/65 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-6 rounded-md font-bold font-mono text-xs flex items-center justify-center bg-primary/10 text-primary">
                      {myo.root}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {bi(myo.ar, myo.en)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center justify-between gap-2 p-1.5 bg-card rounded-xl text-xs">
                    <span className="text-xs font-bold text-muted-foreground-1">R:</span>
                    <div className="flex flex-wrap items-center gap-1 font-mono tabular-nums">
                      {(['5', '4', '3', '2', '1', '0', 'NT'] as Array<MmtGradeValue | 'NT'>).map((g) => (
                        <button
                          key={g}
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleUpdateMyotome(myo.root, 'right', rGrade === g ? null : g)}
                          className={`compact-btn min-w-[28px] h-7 px-1.5 text-xs font-bold rounded-lg cursor-pointer ${
                            rGrade === g
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-surface/75 text-muted-foreground-1 hover:bg-surface'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 p-1.5 bg-card rounded-xl text-xs">
                    <span className="text-xs font-bold text-muted-foreground-1">L:</span>
                    <div className="flex flex-wrap items-center gap-1 font-mono tabular-nums">
                      {(['5', '4', '3', '2', '1', '0', 'NT'] as Array<MmtGradeValue | 'NT'>).map((g) => (
                        <button
                          key={g}
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleUpdateMyotome(myo.root, 'left', lGrade === g ? null : g)}
                          className={`compact-btn min-w-[28px] h-7 px-1.5 text-xs font-bold rounded-lg cursor-pointer ${
                            lGrade === g
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-surface/75 text-muted-foreground-1 hover:bg-surface'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Clinical Notes */}
      <div>
        <label htmlFor="neuro-clinical-notes" className="text-xs font-semibold text-foreground block mb-1">
          {bi('ملاحظات الفحص العصبي (Dermatomal pattern / Babinski / Clonus):', 'Neurological Findings Notes:', 'تێبینییەکانی پشکنینی دەماری (Dermatomal / Babinski / Clonus):')}
        </label>
        <textarea
          id="neuro-clinical-notes"
          rows={2}
          value={clinicalNotes}
          disabled={readOnly}
          onChange={(e) =>
            onChange({
              batteryVersion: '1.0.0',
              dermatomes,
              sensoryTable,
              myotomes,
              reflexes,
              clinicalNotes: e.target.value,
              updatedAt: new Date().toISOString(),
            })
          }
          placeholder={bi(
            'مثال: لا يوجد نقص حس جلدي واضح، منعكس الرضفة متماثل بالجهتين (2+)، عدم وجود استجابة بابينسكي مرضية...',
            'e.g., Sensation intact across L4-S1 dermatomes, Babinski negative, no clonus detected...',
            'نموونە: هەستکردنی پێست ئاساییە لە L4-S1، پەرچەکرداری ئەژنۆ هاوسەنگە (+2)، بابینسکی نەرێنییە...'
          )}
          className="w-full px-3 py-2 text-xs rounded-xl bg-surface/75 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
      </div>
    </div>
  );
};
