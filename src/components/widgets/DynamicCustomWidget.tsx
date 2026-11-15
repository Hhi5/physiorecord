// =======================================================================
// PhysioRecord — Dynamic Custom Widget Engine (AI-Generated Tests)
// Renders JSON-defined clinical tests with live state binding
// =======================================================================

import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { CustomWidgetDefinition } from '../../types/clinicalWidgets';
import { Sparkles, Info, CheckCircle2 } from 'lucide-react';

interface DynamicCustomWidgetProps {
  definition: CustomWidgetDefinition;
  value: Record<string, unknown> | undefined;
  onChange: (updated: Record<string, unknown>) => void;
  readOnly?: boolean;
}

export const DynamicCustomWidget: React.FC<DynamicCustomWidgetProps> = ({
  definition,
  value = {},
  onChange,
  readOnly = false,
}) => {
  const { bi } = useLanguage();

  const handleFieldChange = (fieldId: string, val: unknown) => {
    if (readOnly) return;
    onChange({
      ...value,
      [fieldId]: val,
    });
  };

  // Calculate score if fields have numeric score options
  let totalScore = 0;
  let hasScores = false;

  definition.fields.forEach((f) => {
    const userVal = value[f.id];
    if (f.type === 'slider' || f.type === 'number') {
      if (typeof userVal === 'number') {
        totalScore += userVal;
        hasScores = true;
      }
    } else if (f.options) {
      const selectedOpt = f.options.find((o) => o.value === userVal);
      if (selectedOpt && typeof selectedOpt.score === 'number') {
        totalScore += selectedOpt.score;
        hasScores = true;
      }
    }
  });

  const matchingInterp = definition.interpretations?.find(
    (interp) => totalScore >= interp.minScore && totalScore <= interp.maxScore
  );

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="p-3 bg-teal-50/50 dark:bg-teal-950/20 rounded-xl border border-teal-200 dark:border-teal-800/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <div>
            <h3 className="text-xs font-bold text-teal-950 dark:text-teal-200">
              {bi(definition.titleAr, definition.titleEn)}
            </h3>
            <p className="text-xs text-teal-800 dark:text-teal-400">
              {bi(definition.descriptionAr, definition.descriptionEn)}
            </p>
          </div>
        </div>

        {hasScores && (
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-teal-200 dark:border-teal-800 shadow-xs">
            <span className="text-xs text-slate-600 dark:text-slate-400 font-bold uppercase">
              {bi('المجموع:', 'Score:', 'کۆی گشتی:')}
            </span>
            <span className="font-mono font-black text-sm text-teal-700 dark:text-teal-400">
              {totalScore}
            </span>
          </div>
        )}
      </div>

      {/* Dynamic Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {definition.fields.map((field) => {
          const val = value[field.id] ?? field.defaultValue;
          const fieldInputId = `custom-widget-${definition.id}-${field.id}`;

          return (
            <div
              key={field.id}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-850 space-y-2"
            >
              <div className="flex items-center justify-between">
                {field.options ? (
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {bi(field.labelAr, field.labelEn)}
                  </span>
                ) : (
                  <label htmlFor={fieldInputId} className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {bi(field.labelAr, field.labelEn)}
                  </label>
                )}
                {field.unit && (
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">{field.unit}</span>
                )}
              </div>

              {/* Slider Field */}
              {field.type === 'slider' && (
                <div className="flex items-center gap-3">
                  <input
                    id={fieldInputId}
                    type="range"
                    min={field.min ?? 0}
                    max={field.max ?? 10}
                    step={field.step ?? 1}
                    disabled={readOnly}
                    value={typeof val === 'number' ? val : 0}
                    onChange={(e) => handleFieldChange(field.id, Number(e.target.value))}
                    className="w-full accent-teal-600"
                  />
                  <span className="w-10 text-center font-bold font-mono text-xs text-teal-700 dark:text-teal-400">
                    {typeof val === 'number' ? val : 0}
                  </span>
                </div>
              )}

              {/* Number Field */}
              {field.type === 'number' && (
                <input
                  id={fieldInputId}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  disabled={readOnly}
                  value={typeof val === 'number' || typeof val === 'string' ? val : ''}
                  onChange={(e) =>
                    handleFieldChange(field.id, e.target.value === '' ? null : Number(e.target.value))
                  }
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-slate-900 dark:text-white"
                />
              )}

              {/* Select or Radio Options */}
              {field.options && (
                <div className="flex flex-wrap gap-1.5">
                  {field.options.map((opt) => {
                    const isSelected = val === opt.value;
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={readOnly}
                        onClick={() => handleFieldChange(field.id, opt.value)}
                        className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {bi(opt.labelAr, opt.labelEn)}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Text Field */}
              {field.type === 'text' && (
                <textarea
                  id={fieldInputId}
                  rows={2}
                  disabled={readOnly}
                  value={typeof val === 'string' ? val : ''}
                  onChange={(e) => handleFieldChange(field.id, e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Clinical Interpretation Result */}
      {matchingInterp && (
        <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-300 dark:border-teal-800 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-teal-900 dark:text-teal-200 block">
              {bi(matchingInterp.severityAr, matchingInterp.severityEn)}
            </span>
            {(matchingInterp.clinicalRecommendationAr || matchingInterp.clinicalRecommendationEn) && (
              <p className="text-xs text-teal-700 dark:text-teal-300 mt-0.5">
                {bi(
                  matchingInterp.clinicalRecommendationAr || matchingInterp.clinicalRecommendationEn || '',
                  matchingInterp.clinicalRecommendationEn || matchingInterp.clinicalRecommendationAr || ''
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
