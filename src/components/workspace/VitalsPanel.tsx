// =======================================================================
// PhysioRecord — Session Vitals Panel (BP / HR / SpO2) & SVG Trend (Phase B7)
// Configurable cited ACSM/AHA alert thresholds marked "Needs expert verification".
// =======================================================================

import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { SessionVitalsEntry } from '../../types/clinical';
import type { VitalsAlertThresholds } from '../../types/clinicManagement';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { evaluateVitalsAgainstThresholds } from '../../utils/modalitySafetyChecker';
import { HeartPulse, Settings2, AlertTriangle, Info } from 'lucide-react';

interface VitalsPanelProps {
  value: SessionVitalsEntry | undefined;
  history?: SessionVitalsEntry[];
  onChange: (updated: SessionVitalsEntry) => void;
  readOnly?: boolean;
}

export const VitalsPanel: React.FC<VitalsPanelProps> = ({
  value,
  history = [],
  onChange,
  readOnly = false,
}) => {
  const { language, bi } = useLanguage();
  const [thresholds, setThresholds] = useState<VitalsAlertThresholds>(() =>
    ClinicOperationsService.getVitalsThresholds()
  );
  const [showThresholdConfig, setShowThresholdConfig] = useState(false);

  const current: SessionVitalsEntry = value || {
    recordedAt: new Date().toISOString(),
    timing: 'pre_session',
    position: 'sitting',
  };

  const alerts = useMemo(
    () => evaluateVitalsAgainstThresholds(current, thresholds),
    [current, thresholds]
  );

  const updateNumeric = (
    key: 'bpSystolic' | 'bpDiastolic' | 'heartRateBpm' | 'spO2Percent',
    raw: string
  ) => {
    if (readOnly) return;
    const trimmed = raw.trim();
    const num = trimmed === '' ? undefined : Number(trimmed);
    const next: SessionVitalsEntry = {
      ...current,
      recordedAt: new Date().toISOString(),
      [key]: num !== undefined && !Number.isNaN(num) ? num : undefined,
    };
    const nextAlerts = evaluateVitalsAgainstThresholds(next, thresholds).map((a) => a.code);
    onChange({
      ...next,
      alertFlags: nextAlerts,
    });
  };

  // Combine historical vitals + current reading for lightweight SVG trend mini-chart
  const chartPoints = useMemo(() => {
    const merged = [...history];
    if (
      current.bpSystolic !== undefined ||
      current.heartRateBpm !== undefined ||
      current.spO2Percent !== undefined
    ) {
      merged.push(current);
    }
    return merged.slice(-8);
  }, [history, current]);

  const buildPolyline = (getter: (pt: SessionVitalsEntry) => number | undefined, minV: number, maxV: number) => {
    const valid = chartPoints
      .map((pt, i) => ({ val: getter(pt), i }))
      .filter((item): item is { val: number; i: number } => item.val !== undefined);
    if (valid.length < 2) return '';
    const w = 220;
    const h = 48;
    const stepX = valid.length > 1 ? w / (chartPoints.length - 1 || 1) : 0;
    return valid
      .map(({ val, i }) => {
        const x = Number((i * stepX + 10).toFixed(1));
        const norm = Math.max(0, Math.min(1, (val - minV) / Math.max(1, maxV - minV)));
        const y = Number((h - 6 - norm * (h - 12)).toFixed(1));
        return `${x},${y}`;
      })
      .join(' ');
  };

  const sbpPoly = buildPolyline((p) => p.bpSystolic, 70, 210);
  const hrPoly = buildPolyline((p) => p.heartRateBpm, 40, 160);
  const spo2Poly = buildPolyline((p) => p.spO2Percent, 80, 100);

  return (
    <div
      data-testid="vitals-panel"
      className="p-4 rounded-xl bg-surface border border-line-2 space-y-3 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <HeartPulse className="size-4 text-rose-600 shrink-0" />
          <span>
            {bi(
              'العلامات الحيوية (الضغط BP · النبض HR · الأكسجة SpO2)',
              'Session Vitals (BP · HR · SpO2)'
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 font-semibold inline-flex items-center gap-1">
            <Info className="size-3.5" />
            <span>
              {thresholds.verificationStatus === 'verified'
                ? bi('حدود موثقة', 'Verified thresholds')
                : bi('الحدود المرجعية تتطلب مراجعة مختص', 'Thresholds need expert verification')}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setShowThresholdConfig((v) => !v)}
            className="px-2.5 py-1 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line font-semibold inline-flex items-center gap-1 cursor-pointer"
          >
            <Settings2 className="size-3.5" />
            <span>{bi('تخصيص الحدود', 'Thresholds')}</span>
          </button>
        </div>
      </div>

      {/* BP / HR / SpO2 Inputs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div>
          <label className="font-semibold text-muted-foreground-1 block mb-1">
            {bi('الانقباضي BP Sys (mmHg)', 'BP Systolic (mmHg)')}
          </label>
          <input
            type="number"
            min={40}
            max={280}
            dir="ltr"
            disabled={readOnly}
            data-testid="vitals-sbp-input"
            value={current.bpSystolic ?? ''}
            onChange={(e) => updateNumeric('bpSystolic', e.target.value)}
            placeholder="120"
            className="w-full px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line font-mono text-center text-foreground"
          />
        </div>
        <div>
          <label className="font-semibold text-muted-foreground-1 block mb-1">
            {bi('الانبساطي BP Dia (mmHg)', 'BP Diastolic (mmHg)')}
          </label>
          <input
            type="number"
            min={30}
            max={180}
            dir="ltr"
            disabled={readOnly}
            data-testid="vitals-dbp-input"
            value={current.bpDiastolic ?? ''}
            onChange={(e) => updateNumeric('bpDiastolic', e.target.value)}
            placeholder="80"
            className="w-full px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line font-mono text-center text-foreground"
          />
        </div>
        <div>
          <label className="font-semibold text-muted-foreground-1 block mb-1">
            {bi('النبض HR (bpm)', 'Heart Rate (bpm)')}
          </label>
          <input
            type="number"
            min={25}
            max={240}
            dir="ltr"
            disabled={readOnly}
            data-testid="vitals-hr-input"
            value={current.heartRateBpm ?? ''}
            onChange={(e) => updateNumeric('heartRateBpm', e.target.value)}
            placeholder="74"
            className="w-full px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line font-mono text-center text-foreground"
          />
        </div>
        <div>
          <label className="font-semibold text-muted-foreground-1 block mb-1">
            {bi('الأكسجة SpO2 (%)', 'SpO2 (%)')}
          </label>
          <input
            type="number"
            min={50}
            max={100}
            dir="ltr"
            disabled={readOnly}
            data-testid="vitals-spo2-input"
            value={current.spO2Percent ?? ''}
            onChange={(e) => updateNumeric('spO2Percent', e.target.value)}
            placeholder="98"
            className="w-full px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line font-mono text-center text-foreground"
          />
        </div>
      </div>

      {/* Cited Alert Warnings */}
      {alerts.length > 0 && (
        <div
          data-testid="vitals-alerts-banner"
          className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1 text-rose-800 dark:text-rose-200"
        >
          {alerts.map((a) => (
            <div key={a.code} className="flex items-start gap-2 font-bold">
              <AlertTriangle className="size-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{language === 'en' ? a.labelEn : language === 'ckb' ? a.labelCkb : a.labelAr}</span>
            </div>
          ))}
          <p className="text-muted-foreground-1">
            {bi(
              'المصدر: إرشادات ACSM 11th ed. & AHA — القيم الإرشادية تتطلب تحقق المختص.',
              'Cited source: ACSM 11th ed. & AHA guidelines — threshold alerts need expert verification.'
            )}
          </p>
        </div>
      )}

      {/* Lightweight Programmatic SVG Mini-Chart */}
      {chartPoints.length >= 2 && (
        <div className="p-2.5 rounded-xl bg-layer border border-layer-line flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="font-bold text-foreground block">
              {bi('منحنى العلامات الحيوية خلال الجلسات', 'Vitals Trend Mini-Chart')}
            </span>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-rose-600">● SBP</span>
              <span className="text-sky-600">● HR</span>
              <span className="text-emerald-600">● SpO2</span>
            </div>
          </div>
          <svg
            data-testid="vitals-trend-svg"
            viewBox="0 0 240 52"
            className="w-60 h-14 shrink-0"
            role="img"
            aria-label={bi('منحنى العلامات الحيوية', 'Vitals trend chart')}
          >
            <line x1="8" y1="46" x2="232" y2="46" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1" />
            {sbpPoly && (
              <polyline fill="none" stroke="#e11d48" strokeWidth="2" points={sbpPoly} />
            )}
            {hrPoly && (
              <polyline fill="none" stroke="#0284c7" strokeWidth="2" points={hrPoly} />
            )}
            {spo2Poly && (
              <polyline fill="none" stroke="#059669" strokeWidth="2" points={spo2Poly} />
            )}
          </svg>
        </div>
      )}

      {/* Inline Configurable Thresholds Drawer */}
      {showThresholdConfig && (
        <div className="p-3 rounded-xl bg-layer border border-layer-line space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-foreground">
              {bi(
                'تعديل حدود التنبيه الحيوي للعيادة (ACSM / AHA — مراجعة المختص)',
                'Configure Clinic Vitals Alert Thresholds (ACSM / AHA)'
              )}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="space-y-0.5">
              <span>{bi('أعلى BP Sys', 'Max SBP')}</span>
              <input
                type="number"
                dir="ltr"
                value={thresholds.bpSystolicHigh}
                onChange={(e) =>
                  setThresholds((t) => ({ ...t, bpSystolicHigh: Number(e.target.value) || 180 }))
                }
                className="w-full px-2 py-1 rounded bg-surface border border-layer-line font-mono"
              />
            </label>
            <label className="space-y-0.5">
              <span>{bi('أدنى BP Sys', 'Min SBP')}</span>
              <input
                type="number"
                dir="ltr"
                value={thresholds.bpSystolicLow}
                onChange={(e) =>
                  setThresholds((t) => ({ ...t, bpSystolicLow: Number(e.target.value) || 90 }))
                }
                className="w-full px-2 py-1 rounded bg-surface border border-layer-line font-mono"
              />
            </label>
            <label className="space-y-0.5">
              <span>{bi('أعلى نبض HR', 'Max HR')}</span>
              <input
                type="number"
                dir="ltr"
                value={thresholds.hrHigh}
                onChange={(e) =>
                  setThresholds((t) => ({ ...t, hrHigh: Number(e.target.value) || 120 }))
                }
                className="w-full px-2 py-1 rounded bg-surface border border-layer-line font-mono"
              />
            </label>
            <label className="space-y-0.5">
              <span>{bi('أدنى SpO2 %', 'Min SpO2 %')}</span>
              <input
                type="number"
                dir="ltr"
                value={thresholds.spO2Low}
                onChange={(e) =>
                  setThresholds((t) => ({ ...t, spO2Low: Number(e.target.value) || 92 }))
                }
                className="w-full px-2 py-1 rounded bg-surface border border-layer-line font-mono"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                ClinicOperationsService.setVitalsThresholds(thresholds);
                setShowThresholdConfig(false);
              }}
              className="px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold cursor-pointer"
            >
              {bi('حفظ الحدود', 'Save Thresholds')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
