// =======================================================================
// PhysioRecord — High-Precision Anatomical Body Chart Widget
// Medical-grade SVG with Anterior & Posterior View, Aspect Ratio Lock,
// Pin Drop, Symptom Type, and NRS Severity (0-10)
// =======================================================================

import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import {
  PAIN_TYPE_SUGGESTIONS,
  normalizeMarkerHexColor,
  resolveMarkerDisplayMeta,
  sanitizePainTypeCustom,
} from '../../utils/bodyChartMarkers';
import {
  type PatientBodyChartData,
  type BodyChartMarker,
  type BodyChartView,
  type BodySymptomType,
  BODY_SYMPTOM_TYPES,
} from '../../types/clinical';
import { resolveAnatomicalRegionFromPoint } from '../../data/clinicalToolkit/bodyChartRegions';
import { AnatomicalFrontSvg, AnatomicalBackSvg } from './AnatomicalBodySvgs';
import { Fraction, AutoResizeTextarea } from '../ui/Primitives';
import { SpectrumColorPicker } from '../ui/SpectrumColorPicker';
import { Trash2, Palette } from 'lucide-react';

interface BodyChartWidgetProps {
  value: PatientBodyChartData | undefined;
  onChange: (updated: PatientBodyChartData) => void;
  readOnly?: boolean;
}

export const BodyChartWidget: React.FC<BodyChartWidgetProps> = ({
  value,
  onChange,
  readOnly = false,
}) => {
  const { language, bi } = useLanguage();

  const [activeViewMode, setActiveViewMode] = useState<'both' | 'anterior' | 'posterior'>('both');
  const [selectedSymptomType, setSelectedSymptomType] = useState<BodySymptomType>('pain_sharp');
  const [customPainType, setCustomPainType] = useState('');
  const [customPainColor, setCustomPainColor] = useState<string>('');
  const [defaultSeverityNrs, setDefaultSeverityNrs] = useState<number>(6);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  const anteriorCanvasRef = useRef<HTMLDivElement>(null);
  const posteriorCanvasRef = useRef<HTMLDivElement>(null);
  const colorPickerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isColorPickerOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (
        colorPickerContainerRef.current &&
        !colorPickerContainerRef.current.contains(e.target as Node)
      ) {
        setIsColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isColorPickerOpen]);

  const markers = value?.markers || [];
  const clinicianSummaryNotes = value?.clinicianSummaryNotes || '';

  const handleCanvasClick = (
    e: React.MouseEvent<HTMLDivElement>,
    view: BodyChartView,
    canvasRef: React.RefObject<HTMLDivElement | null>
  ) => {
    if (readOnly || !canvasRef.current) return;

    const target = e.target as HTMLElement;
    if (target.closest('.body-marker-pin') || target.closest('button')) {
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    const resolved = resolveAnatomicalRegionFromPoint(view, xPercent, yPercent);

    const newMarker: BodyChartMarker = {
      markerId: typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `mk-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      symptomType: selectedSymptomType,
      painTypeCustom: sanitizePainTypeCustom(customPainType),
      colorHex: normalizeMarkerHexColor(customPainColor),
      view,
      xPercent: resolved.xPercent,
      yPercent: resolved.yPercent,
      anatomicalRegionCode: resolved.regionCode,
      anatomicalRegionLabelAr: resolved.labelAr,
      anatomicalRegionLabelEn: resolved.labelEn,
      severityNrs: defaultSeverityNrs,
      description: '',
      createdAt: new Date().toISOString(),
    };

    const updatedMarkers = [...markers, newMarker];
    setSelectedMarkerId(newMarker.markerId);

    onChange({
      chartVersion: '1.0.0',
      markers: updatedMarkers,
      clinicianSummaryNotes,
      lastUpdatedAt: new Date().toISOString(),
    });
  };

  const handleRemoveMarker = (markerId: string) => {
    if (readOnly) return;
    const updatedMarkers = markers.filter((m) => m.markerId !== markerId);
    if (selectedMarkerId === markerId) {
      setSelectedMarkerId(null);
    }
    onChange({
      chartVersion: '1.0.0',
      markers: updatedMarkers,
      clinicianSummaryNotes,
      lastUpdatedAt: new Date().toISOString(),
    });
  };

  const handleClearAll = () => {
    if (readOnly) return;
    onChange({
      chartVersion: '1.0.0',
      markers: [],
      clinicianSummaryNotes,
      lastUpdatedAt: new Date().toISOString(),
    });
    setSelectedMarkerId(null);
  };

  const renderMarkerPins = (view: BodyChartView) => {
    return markers
      .filter((m) => m.view === view)
      .map((marker) => {
        const globalIndex = markers.findIndex((m) => m.markerId === marker.markerId) + 1;
        const markerMeta = resolveMarkerDisplayMeta(marker, language);
        const isSelected = selectedMarkerId === marker.markerId;

        return (
          <div
            key={marker.markerId}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedMarkerId(marker.markerId);
            }}
            title={`${globalIndex}. ${markerMeta.symbolLabel} ${markerMeta.label} — ${bi(
              marker.anatomicalRegionLabelAr || marker.anatomicalRegionLabelEn || '',
              marker.anatomicalRegionLabelEn || marker.anatomicalRegionLabelAr || ''
            )} (${marker.severityNrs ?? defaultSeverityNrs}/10)`}
            className={`body-marker-pin absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform select-none flex items-center justify-center rounded-full text-white font-bold font-mono text-xs shadow-lg ${
              isSelected
                ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900 z-20 animate-pulse'
                : 'hover:scale-115'
            }`}
            style={{
              left: `${marker.xPercent}%`,
              top: `${marker.yPercent}%`,
              backgroundColor: markerMeta.colorHex,
              width: '26px',
              height: '26px',
            }}
          >
            {globalIndex}
          </div>
        );
      });
  };

  const selectedMarker = markers.find((m) => m.markerId === selectedMarkerId);

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-layer p-1 rounded-lg border border-layer-line text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveViewMode('both')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeViewMode === 'both'
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            {bi('الجهتان معاً', 'Both Views', 'هەردوو لایەن')}
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode('anterior')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeViewMode === 'anterior'
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            {bi('أمامي (Anterior)', 'Anterior', 'پێشەوە (Anterior)')}
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode('posterior')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeViewMode === 'posterior'
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground-1 hover:text-foreground'
            }`}
          >
            {bi('خلفي (Posterior)', 'Posterior', 'پشتەوە (Posterior)')}
          </button>
        </div>

        {/* Symptom Type Picker (Horizontally scrollable strip) */}
        <div className="w-full rounded-2xl border border-line-2 bg-card/80 p-1 overflow-hidden">
          <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5 px-0.5">
            {(Object.keys(BODY_SYMPTOM_TYPES) as BodySymptomType[]).map((typeKey) => {
              const config = BODY_SYMPTOM_TYPES[typeKey];
              const isSelected = selectedSymptomType === typeKey;
              return (
                <button
                  key={typeKey}
                  type="button"
                  onClick={(e) => {
                    setSelectedSymptomType(typeKey);
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-primary/40 shadow-xs'
                      : 'opacity-80 hover:opacity-100 bg-white dark:bg-slate-900'
                  }`}
                  style={{
                    borderColor: config.colorHex,
                    color: isSelected ? '#ffffff' : undefined,
                    backgroundColor: isSelected ? config.colorHex : undefined,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isSelected ? '#ffffff' : config.colorHex }}
                  />
                  {bi(config.ar, config.en)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Manual Pain Type & Popover Color Picker */}
        {!readOnly && (
          <div className="w-full pt-2 mt-1 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <input
                type="text"
                aria-label={bi('نوع ألم مخصص أو يدوي', 'Optional manual pain type', 'جۆری ئازاری دەستی یان تایبەت')}
                value={customPainType}
                onChange={(e) => setCustomPainType(e.target.value)}
                maxLength={80}
                placeholder={bi(
                  'نوع ألم مخصص / يدوي (اختياري)...',
                  'Optional manual pain type...',
                  'جۆری ئازاری دەستی / تایبەت (بژاردەیی)...'
                )}
                className="flex-1 min-w-[200px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />

              {/* Popover Color Picker for Marker Pin */}
              <div className="relative shrink-0" ref={colorPickerContainerRef}>
                <button
                  type="button"
                  onClick={() => setIsColorPickerOpen((prev) => !prev)}
                  title={bi('تغيير لون العلامة', 'Change Pin Color', 'گۆڕینی ڕەنگی نیشانە')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-primary/50 transition-colors cursor-pointer shadow-2xs"
                >
                  <span
                    className="size-3.5 rounded-full border border-black/15 dark:border-white/20 shrink-0 shadow-2xs"
                    style={{
                      backgroundColor:
                        customPainColor || BODY_SYMPTOM_TYPES[selectedSymptomType].colorHex,
                    }}
                  />
                  <span>{bi('لون العلامة', 'Pin Color', 'ڕەنگی نیشانە')}</span>
                  <Palette className="size-3 text-slate-500" />
                </button>

                {isColorPickerOpen && (
                  <div
                    role="dialog"
                    aria-label={bi('لون العلامة', 'Pin Color', 'ڕەنگی نیشانە')}
                    className="absolute top-full mt-2 end-0 z-50 w-72 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl space-y-2.5 animate-in fade-in-50 zoom-in-95 duration-150"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span
                          className="size-3 rounded-full border border-black/15 shrink-0"
                          style={{
                            backgroundColor:
                              customPainColor || BODY_SYMPTOM_TYPES[selectedSymptomType].colorHex,
                          }}
                        />
                        {bi('لون العلامة', 'Pin Color', 'ڕەنگی نیشانە')}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsColorPickerOpen(false)}
                        className="text-xs font-semibold text-primary hover:underline cursor-pointer px-1 py-0.5"
                      >
                        {bi('تم', 'Done', 'تەواو')}
                      </button>
                    </div>

                    <SpectrumColorPicker
                      compact
                      label={bi('اختر اللون', 'Pick Color', 'ڕەنگ هەڵبژێرە')}
                      value={customPainColor}
                      defaultColor={BODY_SYMPTOM_TYPES[selectedSymptomType].colorHex}
                      onChange={(hex) => setCustomPainColor(hex)}
                      onReset={() => setCustomPainColor('')}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="pr-hscroll overflow-x-auto flex items-center gap-1.5 whitespace-nowrap pb-1 pt-0.5">
              {PAIN_TYPE_SUGGESTIONS.slice(0, 4).map((sug) => {
                const txt = language === 'en' ? sug.en : language === 'ckb' ? sug.ckb : sug.ar;
                return (
                  <button
                    key={sug.en}
                    type="button"
                    onClick={() => setCustomPainType(txt)}
                    className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap shrink-0 hover:border-primary/40 transition-colors"
                  >
                    {txt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Severity Slider & Clear */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="bodychart-default-severity" className="text-slate-600 dark:text-slate-300 font-medium">
              {bi('الشدة:', 'Severity:', 'توندی:')}
            </label>
            <input
              id="bodychart-default-severity"
              type="range"
              min="1"
              max="10"
              value={defaultSeverityNrs}
              onChange={(e) => setDefaultSeverityNrs(Number(e.target.value))}
              className="w-20 accent-primary"
            />
            <span
              className={`px-2 py-0.5 rounded font-bold text-xs ${
                defaultSeverityNrs >= 7
                  ? 'bg-red-600 text-white'
                  : defaultSeverityNrs >= 4
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-emerald-700 text-white'
              }`}
            >
              <Fraction value={defaultSeverityNrs} total={10} />
            </span>
          </div>

          {markers.length > 0 && !readOnly &&
            (confirmClearAll ? (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    handleClearAll();
                    setConfirmClearAll(false);
                  }}
                  className="px-2 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  {bi('تأكيد المسح', 'Confirm Clear', 'دڵنیاکردنەوەی سڕینەوە')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                aria-label={bi('مسح كافة النقاط', 'Clear all pins', 'سڕینەوەی هەموو خاڵەکان')}
                title={bi('مسح كافة النقاط', 'Clear all pins', 'سڕینەوەی هەموو خاڵەکان')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ))}
        </div>
      </div>

      {/* Main Body Drawing Canvas Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Anatomical Diagrams Canvas */}
        <div
          className={`${
            markers.length > 0 ? 'lg:col-span-8' : 'lg:col-span-12'
          } p-6 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-inner flex flex-wrap justify-center items-center gap-10 min-h-[440px]`}
        >
          {/* Anterior Canvas */}
          {(activeViewMode === 'both' || activeViewMode === 'anterior') && (
            <div className="flex flex-col items-center">
              <div className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                <span>{bi('المنظر الأمامي', 'Anterior View', 'دیمەنی پێشەوە')}</span>
                <span className="text-xs text-primary font-normal">
                  ({bi('اضغط لتثبيت نقطة ألم', 'Click to pin', 'کرتە بکە بۆ دانانی خاڵی ئازار')})
                </span>
              </div>
              <div
                ref={anteriorCanvasRef}
                onClick={(e) => handleCanvasClick(e, 'anterior', anteriorCanvasRef)}
                className="relative w-[180px] sm:w-[210px] aspect-[148/318] bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 hover:border-primary/50 transition-colors cursor-crosshair select-none flex items-center justify-center text-slate-300 dark:text-slate-400"
              >
                <AnatomicalFrontSvg className="w-full h-full text-slate-400 hover:text-slate-300 transition-colors" />
                {renderMarkerPins('anterior')}
              </div>
            </div>
          )}

          {/* Posterior Canvas */}
          {(activeViewMode === 'both' || activeViewMode === 'posterior') && (
            <div className="flex flex-col items-center">
              <div className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                <span>{bi('المنظر الخلفي', 'Posterior View', 'دیمەنی پشتەوە')}</span>
                <span className="text-xs text-primary font-normal">
                  ({bi('اضغط لتثبيت نقطة ألم', 'Click to pin', 'کرتە بکە بۆ دانانی خاڵی ئازار')})
                </span>
              </div>
              <div
                ref={posteriorCanvasRef}
                onClick={(e) => handleCanvasClick(e, 'posterior', posteriorCanvasRef)}
                className="relative w-[180px] sm:w-[210px] aspect-[148/315] bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 hover:border-primary/50 transition-colors cursor-crosshair select-none flex items-center justify-center text-slate-300 dark:text-slate-400"
              >
                <AnatomicalBackSvg className="w-full h-full text-slate-400 hover:text-slate-300 transition-colors" />
                {renderMarkerPins('posterior')}
              </div>
            </div>
          )}
        </div>

        {/* Markers Sidebar List (when points exist) */}
        {markers.length > 0 && (
          <div
            tabIndex={0}
            aria-label={bi('قائمة الأعراض المحددة', 'Identified symptoms list', 'لیستی نیشانە دیاریکراوەکان')}
            className="lg:col-span-4 space-y-3 bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 max-h-[460px] overflow-y-auto focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {bi(
                  `الأعراض المحددة (${markers.length})`,
                  `Identified Symptoms (${markers.length})`,
                  `نیشانە دیاریکراوەکان (${markers.length})`
                )}
              </h3>
              <span className="text-xs text-primary font-medium">
                {bi('مرتبة بالترقيم', 'Numbered', 'ژمارەکراو')}
              </span>
            </div>

            <div className="space-y-2">
              {markers.map((marker, idx) => {
                const markerMeta = resolveMarkerDisplayMeta(marker, language);
                const isSelected = selectedMarkerId === marker.markerId;

                return (
                  <div
                    key={marker.markerId}
                    onClick={() => setSelectedMarkerId(marker.markerId)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start justify-between gap-2 ${
                      isSelected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary'
                        : 'border-card-line bg-surface hover:bg-layer-hover'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <span
                        className="w-5 h-5 rounded-full text-white font-bold flex items-center justify-center shrink-0 text-xs"
                        style={{ backgroundColor: markerMeta.colorHex }}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {bi(
                            marker.anatomicalRegionLabelAr || marker.anatomicalRegionLabelEn || '',
                            marker.anatomicalRegionLabelEn || marker.anatomicalRegionLabelAr || ''
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground-1">
                          <span aria-hidden="true">{markerMeta.symbolLabel} </span>
                          {markerMeta.label} •{' '}
                          <span className="font-bold text-primary">
                            <Fraction value={marker.severityNrs ?? defaultSeverityNrs} total={10} />
                          </span>
                        </p>
                      </div>
                    </div>

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveMarker(marker.markerId);
                        }}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-red-600 p-1.5 rounded-md transition-colors cursor-pointer"
                        aria-label={bi('حذف هذه النقطة', 'Remove pin', 'سڕینەوەی ئەم خاڵە')}
                        title={bi('حذف هذه النقطة', 'Remove pin', 'سڕینەوەی ئەم خاڵە')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Selected Marker Pain Type, Color & Severity editor */}
            {selectedMarker && !readOnly && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                <label htmlFor="bodychart-selected-pain-type" className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  {bi(
                    'تخصيص نوع الألم ولون العلامة المحددة:',
                    'Customize Selected Marker Type & Color:',
                    'تایبەتکردنی جۆری ئازار و ڕەنگی نیشانەی هەڵبژێردراو:'
                  )}
                </label>
                <input
                  id="bodychart-selected-pain-type"
                  type="text"
                  value={selectedMarker.painTypeCustom || ''}
                  maxLength={80}
                  placeholder={bi(
                    'نوع ألم مخصص (اختياري)...',
                    'Custom pain type...',
                    'جۆری ئازاری تایبەت (بژاردەیی)...'
                  )}
                  onChange={(e) => {
                    const val = e.target.value;
                    const updated = markers.map((m) =>
                      m.markerId === selectedMarker.markerId
                        ? { ...m, painTypeCustom: val }
                        : m
                    );
                    onChange({
                      chartVersion: '1.0.0',
                      markers: updated,
                      clinicianSummaryNotes,
                      lastUpdatedAt: new Date().toISOString(),
                    });
                  }}
                  className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <SpectrumColorPicker
                  compact
                  value={selectedMarker.colorHex || ''}
                  defaultColor={
                    (
                      BODY_SYMPTOM_TYPES[selectedMarker.symptomType] ||
                      BODY_SYMPTOM_TYPES.pain_sharp
                    ).colorHex
                  }
                  onChange={(hex) => {
                    const updated = markers.map((m) =>
                      m.markerId === selectedMarker.markerId ? { ...m, colorHex: hex } : m
                    );
                    onChange({
                      chartVersion: '1.0.0',
                      markers: updated,
                      clinicianSummaryNotes,
                      lastUpdatedAt: new Date().toISOString(),
                    });
                  }}
                  onReset={() => {
                    const updated = markers.map((m) =>
                      m.markerId === selectedMarker.markerId ? { ...m, colorHex: undefined } : m
                    );
                    onChange({
                      chartVersion: '1.0.0',
                      markers: updated,
                      clinicianSummaryNotes,
                      lastUpdatedAt: new Date().toISOString(),
                    });
                  }}
                />
                <label htmlFor="bodychart-selected-severity" className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  {bi(
                    'تعديل شدة النقطة المحددة:',
                    'Edit Pin Severity:',
                    'دەستکاریکردنی توندی خاڵی هەڵبژێردراو:'
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="bodychart-selected-severity"
                    type="range"
                    min="1"
                    max="10"
                    value={selectedMarker.severityNrs ?? 5}
                    onChange={(e) => {
                      const newSev = Number(e.target.value);
                      const updated = markers.map((m) =>
                        m.markerId === selectedMarker.markerId ? { ...m, severityNrs: newSev } : m
                      );
                      onChange({
                        chartVersion: '1.0.0',
                        markers: updated,
                        clinicianSummaryNotes,
                        lastUpdatedAt: new Date().toISOString(),
                      });
                    }}
                    className="w-full accent-primary"
                  />
                  <span className="font-bold text-xs text-primary shrink-0">
                    <Fraction value={selectedMarker.severityNrs ?? 5} total={10} />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clinician Summary Notes */}
      <div>
        <label htmlFor="bodychart-summary-notes" className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
          {bi(
            'ملاحظات المعالج السريرية حول موضع وطبيعة الأعراض:',
            'Clinician Body Chart Summary Notes:',
            'تێبینییەکانی چارەسەرکار سەبارەت بە شوێن و شێوازی نیشانەکان:'
          )}
        </label>
        <AutoResizeTextarea
          id="bodychart-summary-notes"
          minRows={2}
          value={clinicianSummaryNotes}
          disabled={readOnly}
          onChange={(e) =>
            onChange({
              chartVersion: '1.0.0',
              markers,
              clinicianSummaryNotes: e.target.value,
              lastUpdatedAt: new Date().toISOString(),
            })
          }
          placeholder={bi(
            'مثال: ألم حاد ينتشر من الفقرات القطنية L4-L5 نحو الفخذ الأيسر، يزداد مع الانثناء إلى الأمام...',
            'e.g., Sharp radiating pain originating at L4-L5 spreading down posterior left thigh...',
            'بۆ نموونە: ئازاری تیژ کە لە بڕبڕەی کەمەرەوە L4-L5 بۆ ڕانی چەپ بڵاودەبێتەوە...'
          )}
          className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-primary text-slate-800 dark:text-slate-200"
        />
      </div>
    </div>
  );
};
