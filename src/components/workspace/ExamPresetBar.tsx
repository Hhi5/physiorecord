// =======================================================================
// PhysioRecord — One-Tap Regional Exam Presets Bar (Phase B1 — ESSENTIAL)
// CC0-1.0 regional exam starters + user customization + JSON pack share.
// =======================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import {
  applyExamPresetToEpisodeStore,
  BUILT_IN_EXAM_PRESETS_CC0,
  parseExamPresetPack,
  removeExamPresetFromEpisodeStore,
  serializeExamPresetPack,
  toggleExamPresetInEpisodeStore,
} from '../../data/clinicalToolkit/examPresetsCc0';
import type {
  EpisodeScopedClinicalStore,
  RegionalExamPresetDefinition,
} from '../../types/clinicManagement';
import { saveTextFilePortable } from '../../platform/nativeBridge';
import { OUTCOME_INSTRUMENTS } from '../../utils/outcomeMeasures';
import { ModalDialog } from '../ui/Dialog';
import {
  Sparkles,
  Download,
  Upload,
  Sliders,
  AlertTriangle,
  Check,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';

interface ExamPresetBarProps {
  episodeStore: EpisodeScopedClinicalStore;
  onApplyStore: (
    updated: EpisodeScopedClinicalStore,
    preset: RegionalExamPresetDefinition,
    action?: 'applied' | 'removed'
  ) => void;
  embeddedInSheet?: boolean;
}

const ALL_WIDGET_IDS: RegionalExamPresetDefinition['widgetsToEnable'] = [
  'body_chart',
  'rom',
  'mmt',
  'neuro',
  'special_tests',
  'gait_posture',
  'functional_scales',
];

export const ExamPresetBar: React.FC<ExamPresetBarProps> = ({
  episodeStore,
  onApplyStore,
  embeddedInSheet = false,
}) => {
  const { language, bi } = useLanguage();
  const [customPresets, setCustomPresets] = useState<RegionalExamPresetDefinition[]>(() =>
    ClinicOperationsService.getCustomExamPresets()
  );
  const [lastAppliedPreset, setLastAppliedPreset] = useState<RegionalExamPresetDefinition | null>(
    null
  );
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [packMessage, setPackMessage] = useState<string | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('physiorecord_exam_preset_collapsed');
      if (saved !== null) return saved === 'true';
    } catch {
      // ignore
    }
    return true;
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('physiorecord_exam_preset_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Editor state for cloning/editing or creating a custom preset
  const [editingId, setEditingId] = useState<string>('');
  const [editTitleAr, setEditTitleAr] = useState('');
  const [editTitleEn, setEditTitleEn] = useState('');
  const [editSummaryAr, setEditSummaryAr] = useState('');
  const [editSummaryEn, setEditSummaryEn] = useState('');
  const [editScaleId, setEditScaleId] =
    useState<RegionalExamPresetDefinition['recommendedScaleId']>('odi');
  const [editWidgets, setEditWidgets] = useState<RegionalExamPresetDefinition['widgetsToEnable']>([
    'body_chart',
    'rom',
    'mmt',
    'special_tests',
    'functional_scales',
  ]);
  const [editSourcePreset, setEditSourcePreset] = useState<RegionalExamPresetDefinition | null>(
    null
  );

  useEffect(() => {
    return ClinicOperationsService.subscribe(() => {
      setCustomPresets(ClinicOperationsService.getCustomExamPresets());
    });
  }, []);

  const mergedPresets = useMemo(() => {
    const customMap = new Map(customPresets.map((c) => [c.id, c]));
    const builtInMerged = BUILT_IN_EXAM_PRESETS_CC0.map((b) => customMap.get(b.id) || b);
    const extras = customPresets.filter(
      (c) => !BUILT_IN_EXAM_PRESETS_CC0.some((b) => b.id === c.id)
    );
    return [...builtInMerged, ...extras];
  }, [customPresets]);

  const appliedSet = useMemo(
    () => new Set(episodeStore.appliedPresetIds || []),
    [episodeStore.appliedPresetIds]
  );

  const handleOpenCustomize = (seed?: RegionalExamPresetDefinition) => {
    const src = seed || mergedPresets[0];
    setEditSourcePreset(src);
    setEditingId(seed ? src.id : `preset_custom_${Date.now()}`);
    setEditTitleAr(seed ? src.titleAr : '');
    setEditTitleEn(seed ? src.titleEn : '');
    setEditSummaryAr(seed ? src.summaryAr : '');
    setEditSummaryEn(seed ? src.summaryEn : '');
    setEditScaleId(src.recommendedScaleId);
    setEditWidgets([...src.widgetsToEnable]);
    setPackError(null);
    setPackMessage(null);
    setShowEditorModal(true);
  };

  const handleSaveCustomPreset = () => {
    const cleanAr = editTitleAr.trim() || editTitleEn.trim();
    const cleanEn = editTitleEn.trim() || editTitleAr.trim();
    if (!cleanAr) return;
    const base = editSourcePreset || BUILT_IN_EXAM_PRESETS_CC0[0];
    const nextPreset: RegionalExamPresetDefinition = {
      ...base,
      id: editingId || `preset_custom_${Date.now()}`,
      regionId: editSourcePreset?.id === editingId ? base.regionId : cleanEn.toLowerCase().replace(/\s+/g, '_'),
      titleAr: cleanAr,
      titleCkb: cleanAr,
      titleEn: cleanEn,
      summaryAr: editSummaryAr.trim() || base.summaryAr,
      summaryEn: editSummaryEn.trim() || base.summaryEn,
      widgetsToEnable: editWidgets.length > 0 ? editWidgets : ['body_chart', 'functional_scales'],
      recommendedScaleId: editScaleId,
      license: 'CC0-1.0',
      isBuiltIn: false,
      updatedAt: new Date().toISOString(),
    };
    ClinicOperationsService.saveCustomExamPreset(nextPreset);
    setShowEditorModal(false);
  };

  const handleExportPack = async () => {
    const jsonStr = serializeExamPresetPack(mergedPresets);
    try {
      await saveTextFilePortable({
        filename: 'physiorecord-exam-presets-cc0.json',
        content: jsonStr,
        mimeType: 'application/json;charset=utf-8',
        description: 'PhysioRecord Exam Presets JSON (CC0-1.0)',
        extensions: ['json'],
      });
      setPackMessage(
        bi(
          'تم تصدير حزمة القوالب بصيغة JSON (CC0-1.0).',
          'Exported CC0-1.0 exam preset JSON pack.',
          'پاکێجی تێمپلەیتەکان بە JSON (CC0-1.0) هەناردە کرا.'
        )
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setPackError(
        bi(
          'تعذر تصدير حزمة القوالب.',
          'Could not export preset pack.',
          'نەتوانرا پاکێجی تێمپلەیت هەناردە بکرێت.'
        )
      );
    }
  };

  const handleImportPackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPackError(null);
    setPackMessage(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseExamPresetPack(text);
      const count = ClinicOperationsService.importCustomExamPresets(parsed);
      setPackMessage(
        bi(
          `تم استيراد ${count} قالب فحص إقليمي بنجاح.`,
          `Imported ${count} regional exam preset(s).`,
          `${count} تێمپلەیتی پشکنین بە سەرکەوتوویی هاوردە کرا.`
        )
      );
    } catch (err) {
      setPackError(err instanceof Error ? err.message : 'Failed to import JSON pack.');
    }
  };

  const getTitle = (p: RegionalExamPresetDefinition) =>
    language === 'en' ? p.titleEn : language === 'ckb' ? p.titleCkb : p.titleAr;

  const appliedPresets = useMemo(
    () => mergedPresets.filter((p) => appliedSet.has(p.id)),
    [mergedPresets, appliedSet]
  );
  const [showAllRegions, setShowAllRegions] = useState<boolean>(
    () => embeddedInSheet || appliedPresets.length === 0
  );
  const primaryAppliedPreset =
    appliedPresets[0] ||
    (lastAppliedPreset && appliedSet.has(lastAppliedPreset.id) ? lastAppliedPreset : null);

  const visiblePresets =
    embeddedInSheet || (appliedPresets.length > 0 && !showAllRegions)
      ? embeddedInSheet
        ? mergedPresets
        : appliedPresets
      : mergedPresets;

  const widgetLabels: Record<RegionalExamPresetDefinition['widgetsToEnable'][number], string> = {
    body_chart: bi('مخطط الجسم', 'Body Chart', 'هێڵکاری جەستە'),
    rom: bi('المدى الحركي ROM', 'ROM', 'ROM'),
    mmt: bi('القوة العضلية MMT', 'MMT', 'MMT'),
    neuro: bi('الفحص العصبي', 'Neuro', 'دەماری'),
    special_tests: bi('اختبارات خاصة', 'Special Tests', 'تاقیکردنەوەکان'),
    gait_posture: bi('المشي والقوام', 'Gait & Posture', 'ڕۆیشتن'),
    functional_scales: bi('المقاييس الوظيفية', 'Scales', 'پێوەرەکان'),
  };

  const activeRedFlagPreset =
    (lastAppliedPreset && appliedSet.has(lastAppliedPreset.id) ? lastAppliedPreset : null) ||
    appliedPresets[appliedPresets.length - 1] ||
    null;

  const handleClearAllAppliedPresets = () => {
    if (appliedPresets.length === 0) return;
    let working = episodeStore;
    for (const preset of appliedPresets) {
      working = removeExamPresetFromEpisodeStore(working, preset, mergedPresets);
    }
    setLastAppliedPreset(null);
    onApplyStore(working, appliedPresets[0], 'removed');
  };

  if (isCollapsed && !embeddedInSheet) {
    return (
      <div
        data-testid="exam-preset-bar"
        className="px-3.5 py-2.5 rounded-2xl pr-surface flex flex-wrap items-center justify-between gap-2 transition-all"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground shrink-0">
            <Sparkles className="size-3.5 text-primary shrink-0" />
            <span>{bi('قالب الفحص:', 'Exam Preset:', 'تێمپلەیت:')}</span>
          </div>

          <select
            aria-label={bi('اختر قالب الفحص الإقليمي', 'Choose regional exam preset', 'هەڵبژاردنی تێمپلەیتی پشکنین')}
            value={primaryAppliedPreset?.id || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                handleClearAllAppliedPresets();
                return;
              }
              const target = mergedPresets.find((p) => p.id === val);
              if (!target) return;
              const updated = applyExamPresetToEpisodeStore(episodeStore, target);
              setLastAppliedPreset(target);
              setShowAllRegions(false);
              onApplyStore(updated, target, 'applied');
            }}
            className="h-8 !min-h-[32px] py-1 px-2.5 rounded-xl text-xs font-semibold bg-surface/80 hover:bg-surface text-foreground border-0 outline-none focus:ring-2 focus:ring-primary/25 max-w-full sm:max-w-[260px] cursor-pointer"
          >
            <option value="">
              {appliedPresets.length > 0
                ? bi('— إلغاء القوالب المحددة —', '— Clear selected presets —', '— هەڵوەشاندنەوەی تێمپلەیت —')
                : bi(`اختر منطقة (${mergedPresets.length})...`, `Select region (${mergedPresets.length})...`, `ناوچە هەڵبژێرە (${mergedPresets.length})...`)}
            </option>
            {mergedPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {getTitle(preset)}
              </option>
            ))}
          </select>

          {primaryAppliedPreset && (
            <button
              type="button"
              onClick={() => {
                const res = toggleExamPresetInEpisodeStore(
                  episodeStore,
                  primaryAppliedPreset,
                  mergedPresets
                );
                if (!res.applied) setLastAppliedPreset(null);
                onApplyStore(res.store, primaryAppliedPreset, res.applied ? 'applied' : 'removed');
              }}
              title={bi('إلغاء القالب', 'Remove preset', 'سڕینەوەی تێمپلەیت')}
              className="hidden md:inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-rose-600 cursor-pointer"
            >
              <Check className="size-3.5 shrink-0" />
              <span>{getTitle(primaryAppliedPreset)}</span>
              <X className="size-3 shrink-0" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleOpenCustomize()}
            aria-label={bi('تخصيص القوالب', 'Customize Presets', 'تایبەتکردنی تێمپلەیتەکان')}
            className="compact-btn h-8 px-2.5 rounded-xl hover:bg-surface/80 text-xs font-semibold text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
          >
            <Sliders className="size-3.5 text-primary" />
            <span className="hidden sm:inline">{bi('تخصيص', 'Customize', 'تایبەتکردن')}</span>
          </button>
          <button
            type="button"
            onClick={toggleCollapse}
            data-testid="expand-exam-preset-btn"
            className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-foreground inline-flex items-center gap-1 cursor-pointer"
          >
            <span>{bi('القوالب', 'Presets', 'تێمپلەیتەکان')}</span>
            <ChevronDown className="size-3.5 text-muted-foreground-1" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="exam-preset-bar"
      className={embeddedInSheet ? 'space-y-3' : 'px-3.5 py-3 rounded-2xl pr-surface space-y-2.5'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary shrink-0" />
          <h2 className="text-xs font-bold text-foreground">
            {bi(
              'قوالب الفحص الإقليمي السريع',
              'Regional Exam Presets',
              'تێمپلەیتەکانی پشکنینی خێرا'
            )}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleOpenCustomize()}
            className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-foreground inline-flex items-center gap-1 cursor-pointer"
          >
            <Sliders className="size-3 text-primary" />
            <span>{bi('تخصيص القوالب', 'Customize Presets', 'تایبەتکردنی تێمپلەیتەکان')}</span>
          </button>
          {!embeddedInSheet && (
            <button
              type="button"
              onClick={toggleCollapse}
              data-testid="collapse-exam-preset-btn"
              title={bi('طي الشريط', 'Collapse bar', 'کۆکردنەوەی شریت')}
              className="compact-btn h-8 px-2.5 rounded-xl bg-surface/80 hover:bg-surface text-xs font-semibold text-foreground inline-flex items-center gap-1 cursor-pointer"
            >
              <ChevronUp className="size-3 text-muted-foreground-1" />
              <span>{bi('طي', 'Collapse', 'کۆکردنەوە')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Regional One-Tap Preset Chips (click selected chip again to unselect cleanly) */}
      <div className="flex flex-wrap gap-1.5">
        {visiblePresets.map((preset) => {
          const isApplied = appliedSet.has(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={isApplied}
              data-testid={`exam-preset-btn-${preset.regionId}`}
              title={
                isApplied
                  ? bi('اضغط مرة أخرى لإلغاء تحديد القالب', 'Tap again to unselect preset', 'دووبارە پەنجەی پێدا بنێ بۆ لابردن')
                  : bi(preset.summaryAr, preset.summaryEn)
              }
              onClick={() => {
                const { store: updated, applied } = toggleExamPresetInEpisodeStore(
                  episodeStore,
                  preset,
                  mergedPresets
                );
                if (applied) {
                  setLastAppliedPreset(preset);
                } else if (lastAppliedPreset?.id === preset.id) {
                  setLastAppliedPreset(null);
                }
                if (!embeddedInSheet && applied) setShowAllRegions(false);
                onApplyStore(updated, preset, applied ? 'applied' : 'removed');
              }}
              className={`compact-btn h-8 px-2.5 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer ${
                isApplied
                  ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                  : 'bg-surface/80 hover:bg-surface text-foreground'
              }`}
            >
              {isApplied && <Check className="size-3 shrink-0" />}
              <span>{getTitle(preset)}</span>
              {isApplied && <X className="size-3 opacity-80 shrink-0" aria-hidden="true" />}
            </button>
          );
        })}
        {appliedPresets.length > 0 && (
          <button
            type="button"
            data-testid="exam-preset-clear-all-btn"
            onClick={handleClearAllAppliedPresets}
            className="compact-btn h-8 px-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/15 text-rose-700 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
          >
            <X className="size-3 shrink-0" />
            <span>{bi('إلغاء التحديد', 'Clear All', 'هەڵوەشاندنەوە')}</span>
          </button>
        )}
        {!embeddedInSheet && appliedPresets.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAllRegions((prev) => !prev)}
            className="compact-btn h-8 px-2.5 rounded-xl text-xs font-semibold bg-surface/60 hover:bg-surface text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
          >
            <span>
              {showAllRegions
                ? bi('إخفاء المناطق الأخرى', 'Show Active Only', 'تەنها چالاک نیشان بدە')
                : bi(
                    `تغيير المنطقة (${mergedPresets.length})`,
                    `All Regions (${mergedPresets.length})`,
                    `گۆڕینی ناوچە (${mergedPresets.length})`
                  )}
            </span>
          </button>
        )}
      </div>

      {embeddedInSheet && appliedPresets.length > 0 && (
        <div className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold flex items-center justify-between gap-2">
          <span>
            {bi(
              `تم تجهيز ${appliedPresets.length} قالب — اضغط «تم» للعودة وستجد أدوات الفحص والتنبيهات جاهزة على شاشة الجلسة.`,
              `${appliedPresets.length} preset(s) active — tap Done to see ready exam sections on the visit sheet.`,
              `${appliedPresets.length} تێمپلەیت چالاک کرا — پەنجە بنێ بە «تەواو» بۆ بینینی لە پەڕەی دانیشتندا.`
            )}
          </span>
        </div>
      )}

      {/* Red-Flag Safety Reminder for Applied Preset */}
      {activeRedFlagPreset && (
        <div
          data-testid="exam-preset-redflag-reminder"
          className="px-3 py-2 rounded-xl bg-surface/65 flex items-start justify-between gap-2 text-xs text-rose-700 dark:text-rose-400"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold">
                {bi(
                  `تذكير السلامة والعلامات الحمراء (${getTitle(activeRedFlagPreset)}): `,
                  `Red-Flag Screen Reminder (${getTitle(activeRedFlagPreset)}): `,
                  `ئاگاداری سەلامەتی و نیشانە سوورەکان (${getTitle(activeRedFlagPreset)}): `
                )}
              </span>
              <span>
                {bi(activeRedFlagPreset.redFlagReminderAr, activeRedFlagPreset.redFlagReminderEn)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleOpenCustomize(activeRedFlagPreset)}
            className="compact-btn h-7 px-2 rounded-lg bg-card hover:bg-surface text-foreground text-xs font-bold shrink-0 cursor-pointer"
          >
            {bi('تعديل', 'Edit', 'دەستکاری')}
          </button>
        </div>
      )}

      {/* Customize / Share JSON Pack Modal */}
      <ModalDialog
        isOpen={showEditorModal}
        onOpenChange={setShowEditorModal}
        size="lg"
        title={bi(
          'تخصيص ومشاركة حزم قوالب الفحص (CC0-1.0)',
          'Customize & Share Exam Preset Packs',
          'تایبەتکردن و هاوبەشکردنی پاکێجی تێمپلەیتەکانی پشکنین'
        )}
        subtitle={bi(
          'أنشئ أو عدّل قوالب الفحص الإقليمي الخاصة بعيادتك وصدّرها أو استوردها بصيغة JSON نقية.',
          'Edit built-in templates, add custom presets, or share pure JSON CC0-1.0 packs across clinics.',
          'تێمپلەیتی پشکنینی تایبەت بە کلینیکەکەت دروست بکە یان دەستکاری بکە و بە JSON هەناردە یان هاوردەی بکە.'
        )}
      >
        <div className="space-y-4 text-xs">
          {/* Import / Export Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-surface/65">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportPack()}
                className="compact-btn h-8 px-3 rounded-xl bg-card hover:bg-surface font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="size-3.5 text-primary" />
                <span>{bi('تصدير حزمة JSON', 'Export JSON Pack', 'هەناردەکردنی پاکێجی JSON')}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="compact-btn h-8 px-3 rounded-xl bg-card hover:bg-surface font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="size-3.5 text-primary" />
                <span>{bi('استيراد حزمة JSON', 'Import JSON Pack', 'هاوردەکردنی پاکێجی JSON')}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={(e) => void handleImportPackFile(e)}
                className="hidden"
              />
            </div>

            <button
              type="button"
              onClick={() => handleOpenCustomize()}
              className="compact-btn h-8 px-3 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>{bi('قالب جديد', 'New Custom Preset', 'تێمپلەیتی نوێ')}</span>
            </button>
          </div>

          {packMessage && (
            <div className="text-emerald-700 dark:text-emerald-400 font-bold">
              {packMessage}
            </div>
          )}
          {packError && (
            <div className="text-rose-700 dark:text-rose-400 font-bold">
              {packError}
            </div>
          )}

          {/* Edit Selected / New Preset Form */}
          <div className="p-4 rounded-2xl bg-surface/65 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="preset-editor-select" className="font-bold text-foreground">
                {bi('تحرير القالب:', 'Preset Editor:', 'دەستکاریکەری تێمپلەیت:')}
              </label>
              <select
                id="preset-editor-select"
                value={editSourcePreset?.id || ''}
                onChange={(e) => {
                  const found = mergedPresets.find((m) => m.id === e.target.value);
                  if (found) handleOpenCustomize(found);
                }}
                className="px-2.5 py-1 rounded-xl bg-card text-xs"
              >
                {mergedPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {getTitle(p)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="preset-title-ar" className="font-semibold block mb-1">
                  {bi('الاسم بالعربية', 'Arabic Title', 'ناونیشان بە عەرەبی')}
                </label>
                <input
                  id="preset-title-ar"
                  type="text"
                  value={editTitleAr}
                  onChange={(e) => setEditTitleAr(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-card text-foreground"
                />
              </div>
              <div>
                <label htmlFor="preset-title-en" className="font-semibold block mb-1">
                  {bi('الاسم بالإنجليزية', 'English Title', 'ناونیشان بە ئینگلیزی')}
                </label>
                <input
                  id="preset-title-en"
                  type="text"
                  dir="ltr"
                  value={editTitleEn}
                  onChange={(e) => setEditTitleEn(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-card text-foreground"
                />
              </div>
            </div>

            <div>
              <label htmlFor="preset-scale-select" className="font-semibold block mb-1">
                {bi('المقياس الوظيفي المقترح', 'Recommended Outcome Scale', 'پێوەری فەرمانی پێشنیارکراو')}
              </label>
              <select
                id="preset-scale-select"
                value={editScaleId}
                onChange={(e) =>
                  setEditScaleId(e.target.value as RegionalExamPresetDefinition['recommendedScaleId'])
                }
                className="w-full px-3 py-1.5 rounded-xl bg-card text-foreground"
              >
                {Object.values(OUTCOME_INSTRUMENTS).map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.code} — {bi(inst.nameAr, inst.nameEn)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="font-semibold block mb-1.5">
                {bi(
                  'أدوات الفحص المفعّلة مع هذا القالب:',
                  'Widgets Enabled by Preset:',
                  'ئامرازە چالاککراوەکان لەم تێمپلەیتەدا:'
                )}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ALL_WIDGET_IDS.map((wid) => {
                  const active = editWidgets.includes(wid);
                  return (
                    <button
                      key={wid}
                      type="button"
                      onClick={() =>
                        setEditWidgets((prev) =>
                          active ? prev.filter((x) => x !== wid) : [...prev, wid]
                        )
                      }
                      className={`compact-btn h-8 px-2.5 rounded-xl font-semibold cursor-pointer ${
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-card text-foreground hover:bg-surface'
                      }`}
                    >
                      {widgetLabels[wid] || wid}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {customPresets.some((c) => c.id === editingId) ? (
                <button
                  type="button"
                  onClick={() => {
                    ClinicOperationsService.deleteCustomExamPreset(editingId);
                    setShowEditorModal(false);
                  }}
                  className="compact-btn h-8 px-3 rounded-xl text-rose-700 dark:text-rose-400 hover:bg-surface font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                  <span>{bi('حذف التخصيص', 'Delete Override', 'سڕینەوەی دەستکاری')}</span>
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleSaveCustomPreset}
                className="compact-btn h-8 px-4 rounded-xl bg-primary text-primary-foreground font-extrabold cursor-pointer"
              >
                {bi('حفظ القالب', 'Save Preset', 'پاشەکەوتکردنی تێمپلەیت')}
              </button>
            </div>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
};
