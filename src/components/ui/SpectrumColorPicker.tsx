import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

export interface SpectrumColorPickerProps {
  /** Current hex color (e.g. "#E11D48") or empty string when inheriting default. */
  value: string;
  /** Default color displayed when value is empty and used by Reset when no custom onReset is supplied. */
  defaultColor?: string;
  /** Called with normalized uppercase #RRGGBB hex string whenever color changes. */
  onChange: (hex: string) => void;
  /** Optional reset handler (e.g., clears override to empty string so severity color takes effect). */
  onReset?: () => void;
  /** Optional field label shown above/beside header controls. */
  label?: string;
  /** Show compact native color input trigger button alongside the hex readout. */
  showNativeButton?: boolean;
  /** Compact layout for inline marker editors. */
  compact?: boolean;
  className?: string;
}

interface HsvColor {
  h: number; // 0..360
  s: number; // 0..100
  v: number; // 0..100
}

function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const r = withHash[1];
    const g = withHash[2];
    const b = withHash[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    return withHash.toUpperCase();
  }
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const norm = normalizeHex(hex) ?? '#E11D48';
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const hexBody = [clampByte(r), clampByte(g), clampByte(b)]
    .map((channel) => channel.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return `#${hexBody}`;
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const vv = Math.max(0, Math.min(100, v)) / 100;

  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function hexToHsv(hex: string): HsvColor {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0.0001) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max <= 0.0001 ? 0 : (delta / max) * 100;
  const v = max * 100;
  return { h, s, v };
}

/**
 * Pure HTML5 Canvas + CSS continuous HSV color spectrum picker.
 * Built without external packages or inline vector markup.
 */
export const SpectrumColorPicker: React.FC<SpectrumColorPickerProps> = ({
  value,
  defaultColor = '#E11D48',
  onChange,
  onReset,
  label,
  showNativeButton = true,
  compact = false,
  className = '',
}) => {
  const { bi } = useLanguage();
  const fallbackHex = useMemo(() => normalizeHex(defaultColor) ?? '#E11D48', [defaultColor]);
  const activeHex = useMemo(() => normalizeHex(value) ?? fallbackHex, [value, fallbackHex]);
  const hasCustomValue = Boolean(normalizeHex(value)) && normalizeHex(value) !== fallbackHex;

  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(activeHex));
  const [hexDraft, setHexDraft] = useState<string>(activeHex);
  const lastEmittedHexRef = useRef<string | null>(null);

  const svAreaRef = useRef<HTMLDivElement | null>(null);
  const svCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hueStripRef = useRef<HTMLDivElement | null>(null);
  const draggingSvRef = useRef(false);
  const draggingHueRef = useRef(false);

  // Sync external value changes while preserving hue when dragging along grayscale/black edges
  useEffect(() => {
    setHexDraft(activeHex);
    if (lastEmittedHexRef.current === activeHex) {
      return;
    }
    const parsed = hexToHsv(activeHex);
    setHsv((prev) => ({
      h: parsed.s < 1 ? prev.h : parsed.h,
      s: parsed.s,
      v: parsed.v,
    }));
  }, [activeHex]);

  // Draw crisp 2D Saturation (x: 0->100%) / Brightness Value (y: 100%->0%) gradient onto Canvas
  useEffect(() => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const pureHueHex = hsvToHex(hsv.h, 100, 100);
    ctx.fillStyle = pureHueHex;
    ctx.fillRect(0, 0, w, h);

    const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
    whiteGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, w, h);

    const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
    blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    blackGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, w, h);
  }, [hsv.h]);

  const commitHsv = useCallback(
    (next: HsvColor) => {
      const clamped: HsvColor = {
        h: Math.max(0, Math.min(360, next.h)),
        s: Math.max(0, Math.min(100, next.s)),
        v: Math.max(0, Math.min(100, next.v)),
      };
      setHsv(clamped);
      const nextHex = hsvToHex(clamped.h, clamped.s, clamped.v);
      lastEmittedHexRef.current = nextHex;
      setHexDraft(nextHex);
      onChange(nextHex);
    },
    [onChange]
  );

  const updateSvFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const box = svAreaRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0 || box.height <= 0) return;
      const ratioX = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
      const ratioY = Math.max(0, Math.min(1, (clientY - box.top) / box.height));
      commitHsv({
        h: hsv.h,
        s: ratioX * 100,
        v: (1 - ratioY) * 100,
      });
    },
    [commitHsv, hsv.h]
  );

  const updateHueFromClientX = useCallback(
    (clientX: number) => {
      const box = hueStripRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0) return;
      const ratioX = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
      commitHsv({
        h: ratioX * 360,
        s: hsv.s,
        v: hsv.v,
      });
    },
    [commitHsv, hsv.s, hsv.v]
  );

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      if (draggingSvRef.current) {
        updateSvFromClientPoint(event.clientX, event.clientY);
      } else if (draggingHueRef.current) {
        updateHueFromClientX(event.clientX);
      }
    };
    const handleWindowPointerUp = () => {
      draggingSvRef.current = false;
      draggingHueRef.current = false;
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [updateHueFromClientX, updateSvFromClientPoint]);

  const handleSvKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      commitHsv({ ...hsv, s: hsv.s + step });
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commitHsv({ ...hsv, s: hsv.s - step });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      commitHsv({ ...hsv, v: hsv.v + step });
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      commitHsv({ ...hsv, v: hsv.v - step });
    }
  };

  const handleHueKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 15 : 5;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      commitHsv({ ...hsv, h: (hsv.h + step) % 360 });
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      commitHsv({ ...hsv, h: (hsv.h - step + 360) % 360 });
    }
  };

  const handleHexInputChange = (raw: string) => {
    setHexDraft(raw);
    const valid = normalizeHex(raw);
    if (valid) {
      lastEmittedHexRef.current = valid;
      const nextHsv = hexToHsv(valid);
      setHsv((prev) => ({
        h: nextHsv.s < 1 ? prev.h : nextHsv.h,
        s: nextHsv.s,
        v: nextHsv.v,
      }));
      onChange(valid);
    }
  };

  const handleHexBlur = () => {
    const valid = normalizeHex(hexDraft);
    setHexDraft(valid ?? activeHex);
  };

  const handleReset = () => {
    lastEmittedHexRef.current = null;
    if (onReset) {
      onReset();
    } else {
      onChange(fallbackHex);
    }
  };

  const thumbLeftPct = `${Math.max(0, Math.min(100, hsv.s))}%`;
  const thumbTopPct = `${Math.max(0, Math.min(100, 100 - hsv.v))}%`;
  const hueLeftPct = `${Math.max(0, Math.min(100, (hsv.h / 360) * 100))}%`;
  const pureHuePreview = hsvToHex(hsv.h, 100, 100);

  return (
    <div
      className={`rounded-xl border border-card-line bg-background/80 p-2.5 space-y-2.5 ${className}`.trim()}
      data-testid="spectrum-color-picker"
    >
      {label && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-foreground">{label}</span>
          {!normalizeHex(value) && (
            <span className="text-xs text-muted-foreground-1">
              {bi('تلقائي حسب الشدة', 'Auto by severity', 'خۆکار بەپێی توندی')}
            </span>
          )}
        </div>
      )}

      {/* Explicit LTR coordinate frame so Hue/Saturation geometry matches pointer coordinates in RTL/LTR */}
      <div dir="ltr" className="space-y-2 select-none">
        {/* 2D Saturation / Brightness Canvas */}
        <div
          ref={svAreaRef}
          role="slider"
          tabIndex={0}
          aria-label={bi('مساحة التشبع والسطوع للون', 'Color saturation and brightness area', 'ڕووبەری تێری و ڕووناکی ڕەنگ')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.v * 100)}
          aria-valuetext={activeHex}
          onKeyDown={handleSvKeyDown}
          onPointerDown={(event) => {
            event.preventDefault();
            draggingSvRef.current = true;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // synthetic pointer events in tests may not provide active pointerId
            }
            updateSvFromClientPoint(event.clientX, event.clientY);
          }}
          className={`relative w-full ${compact ? 'h-24' : 'h-32'} rounded-lg overflow-hidden border border-card-line cursor-crosshair touch-none focus:outline-none focus:ring-2 focus:ring-primary/40`}
        >
          <canvas
            ref={svCanvasRef}
            width={240}
            height={140}
            className="block w-full h-full pointer-events-none"
          />
          <div
            aria-hidden="true"
            style={{
              left: thumbLeftPct,
              top: thumbTopPct,
              backgroundColor: activeHex,
            }}
            className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.55)] pointer-events-none"
          />
        </div>

        {/* Continuous 360-degree Hue Spectrum Bar */}
        <div
          ref={hueStripRef}
          role="slider"
          tabIndex={0}
          aria-label={bi('شريط طيف درجة اللون', 'Color hue spectrum slider', 'هێڵی شەبەنگی ڕەنگ')}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          onKeyDown={handleHueKeyDown}
          onPointerDown={(event) => {
            event.preventDefault();
            draggingHueRef.current = true;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // synthetic pointer events in tests may not provide active pointerId
            }
            updateHueFromClientX(event.clientX);
          }}
          style={{
            background:
              'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
          }}
          className="relative w-full h-3.5 rounded-full border border-card-line cursor-pointer touch-none focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <div
            aria-hidden="true"
            style={{
              left: hueLeftPct,
              backgroundColor: pureHuePreview,
            }}
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)] pointer-events-none"
          />
        </div>
      </div>

      {/* Live Swatch Circle + Hex Readout/Input + Native Color Button + Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            role="img"
            aria-label={bi('معاينة اللون المختار', 'Selected color preview', 'پێشبینینی ڕەنگی هەڵبژێردراو')}
            className="size-6 rounded-full border border-card-line shadow-inner shrink-0"
            style={{ backgroundColor: activeHex }}
          />
          <input
            type="text"
            dir="ltr"
            value={hexDraft}
            onChange={(e) => handleHexInputChange(e.target.value)}
            onBlur={handleHexBlur}
            maxLength={7}
            aria-label={bi('رمز اللون السداسي', 'Hex color code', 'کۆدی ڕەنگی هێکس')}
            className="w-22 px-2 py-1 rounded-md border border-card-line bg-card text-xs font-mono uppercase text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {showNativeButton && (
            <label
              title={bi('اختيار لون من منتقي النظام', 'Pick via system color dialog', 'هەڵبژاردن لە هەڵبژێری ڕەنگی سیستەم')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-card-line bg-card hover:bg-muted/40 text-xs font-medium text-foreground cursor-pointer"
            >
              <input
                type="color"
                value={activeHex}
                onChange={(e) => {
                  const norm = normalizeHex(e.target.value);
                  if (norm) {
                    lastEmittedHexRef.current = norm;
                    setHsv(hexToHsv(norm));
                    setHexDraft(norm);
                    onChange(norm);
                  }
                }}
                aria-label={bi('منتقي ألوان النظام', 'System color picker', 'هەڵبژێری ڕەنگی سیستەم')}
                className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
              />
            </label>
          )}
        </div>

        {(onReset || hasCustomValue) && (
          <button
            type="button"
            onClick={handleReset}
            className="px-2 py-1 rounded-md border border-card-line bg-card hover:bg-muted/40 text-xs font-semibold text-muted-foreground-1 hover:text-foreground cursor-pointer transition-colors"
          >
            {bi('افتراضي', 'Reset', 'بنەڕەت')}
          </button>
        )}
      </div>
    </div>
  );
};
