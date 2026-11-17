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
  serializeExamPresetPack,
} from '../../data/clinicalToolkit/examPresetsCc0';
import type {
  EpisodeScopedClinicalStore,
  RegionalExamPresetDefinition,
} from '../../types/clinicManagement';
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
  Activity,
} from 'lucide-react';

interface ExamPresetBarProps {
  episodeStore: EpisodeScopedClinicalStore;
  onApplyStore: (updated: EpisodeScopedClinicalStore, preset: RegionalExamPresetDefinition) => void;
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

  const handleExportPack = () => {
    const jsonStr = serializeExamPresetPack(mergedPresets);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `physiorecord-exam-presets-cc0.json`;
    a.click();
    URL.revokeObjectURL(url);
    setPackMessage(
      bi(
        'تم تصدير حزمة القوالب بصيغة JSON (CC0-1.0).',
        'Exported CC0-1.0 exam preset JSON pack.',
        'پاکێجی تێمپلەیتەکان بە JSON (CC0-1.0) هەناردە کرا.'
      )
    );
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
  const [showAllRegions, setShowAllRegions] = useState<boolean>(() => appliedPresets.length === 0);
  const primaryAppliedPreset = appliedPresets[0] || lastAppliedPreset;

  const visiblePresets =
    appliedPresets.length > 0 && !showAllRegions ? appliedPresets : mergedPresets;

  if (isCollapsed) {
    return (
      <div
        data-testid="exam-preset-bar"
        className="px-3 py-2 rounded-xl bg-card shadow-2xs border border-card-line/60 flex flex-wrap items-center justify-between gap-2 transition-all"
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
              const target = mergedPresets.find((p) => p.id === e.target.value);
              if (!target) return;
              const updated = applyExamPresetToEpisodeStore(episodeStore, target);
              setLastAppliedPreset(target);
              setShowAllRegions(false);
              onApplyStore(updated, target);
            }}
            className="min-h-[34px] py-1 px-2.5 rounded-lg text-xs font-semibold bg-surface border border-transparent hover:border-line-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 max-w-full sm:max-w-[260px] cursor-pointer"
          >
            <option value="">
              {bi(`اختر منطقة (${mergedPresets.length})...`, `Select region (${mergedPresets.length})...`, `ناوچە هەڵبژێرە (${mergedPresets.length})...`)}
            </option>
            {mergedPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {getTitle(preset)}
              </option>
            ))}
          </select>

          {primaryAppliedPreset && (
            <span className="hidden md:inline-flex items-center gap-1 text-xs font-semibold text-primary">
              <Check className="size-3.5 shrink-0" />
              <span>{getTitle(primaryAppliedPreset)}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleOpenCustomize()}
            aria-label={bi('تخصيص القوالب', 'Customize Presets', 'تایبەتکردنی تێمپلەیتەکان')}
            className="min-h-[32px] px-2 py-1 rounded-lg hover:bg-layer-hover text-xs font-semibold text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
          >
            <Sliders className="size-3.5 text-primary" />
            <span className="hidden sm:inline">{bi('تخصيص', 'Customize', 'تایبەتکردن')}</span>
          </button>
          <button
            type="button"
            onClick={toggleCollapse}
            data-testid="expand-exam-preset-btn"
            className="min-h-[32px] px-2 py-1 rounded-lg bg-surface hover:bg-layer-hover text-xs font-semibold text-foreground inline-flex items-center gap-1 cursor-pointer"
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
      className="px-3 py-2.5 rounded-xl bg-card shadow-2xs border border-card-line/60 space-y-2"
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
            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-xs font-semibold text-foreground inline-flex items-center gap-1 cursor-pointer"
          >
            <Sliders className="size-3 text-primary" />
            <span>{bi('تخصيص القوالب', 'Customize Presets', 'تایبەتکردنی تێمپلەیتەکان')}</span>
          </button>
          <button
            type="button"
            onClick={toggleCollapse}
            data-testid="collapse-exam-preset-btn"
            title={bi('طي الشريط', 'Collapse bar', 'کۆکردنەوەی شریت')}
            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-xs font-semibold text-foreground inline-flex items-center gap-1 cursor-pointer"
          >
            <ChevronUp className="size-3 text-muted-foreground-1" />
            <span>{bi('طي', 'Collapse', 'کۆکردنەوە')}</span>
          </button>
        </div>
      </div>

      {/* Regional One-Tap Preset Chips (auto-compacts unselected regions when an exam preset is active) */}
      <div className="flex flex-wrap gap-1.5">
        {visiblePresets.map((preset) => {
          const isApplied = appliedSet.has(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`exam-preset-btn-${preset.regionId}`}
              title={bi(preset.summaryAr, preset.summaryEn)}
              onClick={() => {
                const updated = applyExamPresetToEpisodeStore(episodeStore, preset);
                setLastAppliedPreset(preset);
                setShowAllRegions(false);
                onApplyStore(updated, preset);
              }}
              className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1 cursor-pointer ${
                isApplied
                  ? 'bg-primary/12 text-primary border-primary/40'
                  : 'bg-surface hover:bg-layer-hover text-foreground border-line-2'
              }`}
            >
              {isApplied && <Check className="size-3 shrink-0" />}
              <span>{getTitle(preset)}</span>
            </button>
          );
        })}
        {appliedPresets.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAllRegions((prev) => !prev)}
            className="min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-semibold border border-dashed border-layer-line bg-layer hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
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

      {/* Red-Flag Safety Reminder for Applied Preset */}
      {lastAppliedPreset && (
        <div
          data-testid="exam-preset-redflag-reminder"
          className="px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-2 text-xs text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold">
                {bi(
                  `تذكير السلامة والعلامات الحمراء (${getTitle(lastAppliedPreset)}): `,
                  `Red-Flag Screen Reminder (${getTitle(lastAppliedPreset)}): `,
                  `ئاگاداری سەلامەتی و نیشانە سوورەکان (${getTitle(lastAppliedPreset)}): `
                )}
              </span>
              <span>
                {bi(lastAppliedPreset.redFlagReminderAr, lastAppliedPreset.redFlagReminderEn)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleOpenCustomize(lastAppliedPreset)}
            className="px-2 py-0.5 rounded-md bg-card border border-amber-500/30 text-xs font-bold shrink-0 cursor-pointer"
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
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-surface border border-line-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportPack}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="size-3.5 text-primary" />
                <span>{bi('تصدير حزمة JSON', 'Export JSON Pack', 'هەناردەکردنی پاکێجی JSON')}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line font-bold inline-flex items-center gap-1.5 cursor-pointer"
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
              onClick={() => handleOpenCustomize(undefined)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>{bi('قالب جديد', 'New Custom Preset', 'تێمپلەیتی نوێ')}</span>
            </button>
          </div>

          {packMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold">
              {packMessage}
            </div>
          )}
          {packError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 font-semibold">
              {packError}
            </div>
          )}

          {/* Edit Selected / New Preset Form */}
          <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
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
                className="px-2.5 py-1 rounded-lg bg-layer border border-layer-line text-xs"
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
                  className="w-full px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground"
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
                  className="w-full px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground"
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
                className="w-full px-3 py-1.5 rounded-lg bg-layer border border-layer-line text-foreground"
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
                      className={`px-2.5 py-1 rounded-lg border font-semibold cursor-pointer ${
                        active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-layer text-foreground border-layer-line'
                      }`}
                    >
                      {wid}
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
                  className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 font-bold inline-flex items-center gap-1 cursor-pointer"
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
                className="px-4 py-1.5 rounded-xl bg-primary text-primary-foreground font-extrabold cursor-pointer"
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
