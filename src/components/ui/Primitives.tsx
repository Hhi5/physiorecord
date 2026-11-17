// =======================================================================
// PhysioRecord — Core Clinical UI Primitives (Batch 1 & Batch 2)
// - <Num />: Always renders inside <bdi dir="ltr"> with proper minus (−) & ar-IQ-u-nu-latn
// - <Fraction value total />: Always renders inside <bdi dir="ltr"> so 3/10 is never 10/3
// - <Money amount />: IQD formatter inside <bdi dir="ltr">, proper minus, red if <0, neutral if 0
// - <MoneyInput />: Live thousand-separated IQD currency input ("75,000 د.ع")
// - <DatePickerInput />: Custom dd/mm/yyyy date picker with Iraqi month names (no native mm/dd/yyyy)
// - <PhoneInput />: Iraqi phone input masked as 07XX XXX XXXX, stored as +964
// - <ClinicalAbbr />: Standard clinical abbreviations (<abbr title="...">) wrapped in <bdi>
// - <AutoResizeTextarea />: Auto-growing clinical narrative textarea that never clips text
// - <DemoBadge />: Visible DEMO badge for synthetic/demo records
// =======================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import {
  IRAQI_MONTHS_AR,
  IRAQI_MONTHS_CKB,
  MONTHS_EN_LONG,
  formatDateDDMMYYYY,
  formatTimeIraq,
  localDate,
  maskIraqiPhoneInput,
  normalizeIraqiPhoneStorage,
} from '../../utils/date';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Minus,
  Plus,
  Mic,
  MicOff,
  Sparkles,
} from 'lucide-react';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import {
  createLocalSpeechSession,
  detectSpeechDictationSupport,
  type DictationCapabilityStatus,
  type SpeechRecognitionLike,
} from '../../utils/localSpeech';
import type { NoteTemplateCategory, NoteTemplateSnippet } from '../../types/clinicManagement';

const MINUS_SIGN = '\u2212'; // Proper typographic minus "−"

export function formatSignedNumber(
  value: number,
  options?: Intl.NumberFormatOptions & { showPlus?: boolean }
): string {
  if (!Number.isFinite(value)) return '0';
  const absFormatted = new Intl.NumberFormat('ar-IQ-u-nu-latn', options).format(
    Math.abs(value)
  );
  if (value < 0) return `${MINUS_SIGN}${absFormatted}`;
  if (value > 0 && options?.showPlus) return `+${absFormatted}`;
  return absFormatted;
}

export interface NumProps {
  value: number | string | null | undefined;
  prefix?: string;
  suffix?: string;
  showPlus?: boolean;
  /** When true, negative numbers are styled red and zero/positive are neutral (never green) */
  colorize?: boolean;
  className?: string;
}

export const Num: React.FC<NumProps> = ({
  value,
  prefix = '',
  suffix = '',
  showPlus = false,
  colorize = false,
  className = '',
}) => {
  if (value === null || value === undefined || value === '') {
    return (
      <bdi dir="ltr" className={`tabular-nums ${className}`}>
        —
      </bdi>
    );
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  const isNumber = !Number.isNaN(numeric) && typeof value !== 'boolean';

  const formatted = isNumber
    ? formatSignedNumber(numeric, { showPlus })
    : String(value).replace(/^-/, MINUS_SIGN);

  const toneClass =
    colorize && isNumber
      ? numeric < 0
        ? 'text-rose-600 dark:text-rose-400'
        : numeric === 0
        ? 'text-muted-foreground-1'
        : ''
      : '';

  return (
    <bdi dir="ltr" className={`tabular-nums inline-block ${toneClass} ${className}`.trim()}>
      {prefix}
      {formatted}
      {suffix}
    </bdi>
  );
};

export interface FractionProps {
  value: number | string | null | undefined;
  total: number | string;
  className?: string;
}

export const Fraction: React.FC<FractionProps> = ({ value, total, className = '' }) => {
  const displayValue =
    value === null || value === undefined || value === ''
      ? '—'
      : typeof value === 'number' && value < 0
      ? `${MINUS_SIGN}${Math.abs(value)}`
      : String(value);

  return (
    <bdi
      dir="ltr"
      className={`tabular-nums inline-block whitespace-nowrap ${className}`.trim()}
    >
      {displayValue}/{total}
    </bdi>
  );
};

export interface MoneyProps {
  amount: number | null | undefined;
  showCurrency?: boolean;
  /** By default, negative amounts are red, zero is neutral gray, positive inherits text color (never green) */
  colorize?: boolean;
  className?: string;
}

export const Money: React.FC<MoneyProps> = ({
  amount,
  showCurrency = true,
  colorize = true,
  className = '',
}) => {
  const { language, bi } = useLanguage();
  const { currency } = useCurrency();
  const useArabicDigitsLocale = language !== 'en';
  const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;

  const formattedAbs = new Intl.NumberFormat(useArabicDigitsLocale ? 'ar-IQ-u-nu-latn' : 'en-US', {
    maximumFractionDigits: currency.decimals,
    minimumFractionDigits: currency.decimals > 0 && Math.abs(safeAmount) % 1 !== 0 ? 2 : 0,
  }).format(Math.abs(safeAmount));

  const signedNumber = safeAmount < 0 ? `${MINUS_SIGN}${formattedAbs}` : formattedAbs;
  const currencySymbol = bi(currency.symbolAr, currency.symbolEn, currency.symbolAr);

  const colorClass = colorize
    ? safeAmount < 0
      ? 'text-rose-700 dark:text-rose-300'
      : safeAmount === 0
      ? 'text-muted-foreground-1'
      : ''
    : '';

  return (
    <span
      className={`tabular-nums inline-flex items-baseline gap-1 whitespace-nowrap ${colorClass} ${className}`.trim()}
    >
      <bdi dir="ltr">{signedNumber}</bdi>
      {showCurrency && (
        <span className="text-[length:max(0.85em,12px)] font-medium select-none">
          {currencySymbol}
        </span>
      )}
    </span>
  );
};

export interface TimeDisplayProps {
  time: string | Date | number | undefined | null;
  className?: string;
}

export const TimeDisplay: React.FC<TimeDisplayProps> = ({ time, className = '' }) => {
  const { language, isRtl } = useLanguage();
  const formatted = formatTimeIraq(time, language);
  if (!formatted || formatted === '—') {
    return <span className={`tabular-nums ${className}`.trim()}>—</span>;
  }
  const parts = formatted.trim().split(/\s+/);
  const hhmm = parts[0] || formatted;
  const period = parts.slice(1).join(' ');

  return (
    <span
      dir={isRtl ? 'rtl' : 'ltr'}
      className={`tabular-nums font-sans inline-flex items-baseline gap-1 whitespace-nowrap ${className}`.trim()}
    >
      <bdi dir="ltr">{hhmm}</bdi>
      {period && <span className="font-semibold">{period}</span>}
    </span>
  );
};

export interface MoneyInputProps {
  id?: string;
  ariaLabel?: string;
  value: number;
  onChange: (amount: number) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({
  id,
  ariaLabel,
  value,
  onChange,
  placeholder = '0',
  required = false,
  disabled = false,
  className = '',
}) => {
  const { language, bi } = useLanguage();
  const { currency } = useCurrency();
  const useArabicDigitsLocale = language !== 'en';

  const formattedDisplay =
    Number.isFinite(value) && value > 0
      ? new Intl.NumberFormat(useArabicDigitsLocale ? 'ar-IQ-u-nu-latn' : 'en-US', {
          maximumFractionDigits: currency.decimals,
        }).format(value)
      : value === 0
      ? '0'
      : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/[^\d]/g, '');
    if (!rawDigits) {
      onChange(0);
      return;
    }
    const parsed = parseInt(rawDigits, 10);
    onChange(Number.isFinite(parsed) ? parsed : 0);
  };

  const currencySymbol = bi(currency.symbolAr, currency.symbolEn, currency.symbolAr);

  return (
    <div dir="ltr" className="relative flex items-center w-full">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        value={formattedDisplay}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={ariaLabel || bi('المبلغ المالي', 'Monetary amount', 'بڕی پارە')}
        className={`w-full ps-3 pe-14 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground tabular-nums font-bold focus:outline-none focus:border-primary ${className}`.trim()}
      />
      <span className="absolute end-3 text-xs font-semibold text-muted-foreground-1 pointer-events-none select-none">
        {currencySymbol}
      </span>
    </div>
  );
};

export interface PhoneInputProps {
  id?: string;
  ariaLabel?: string;
  value: string;
  onChange: (maskedOrStored: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  id,
  ariaLabel,
  value,
  onChange,
  placeholder = '0770 123 4567',
  required = false,
  disabled = false,
  className = '',
}) => {
  const { bi, isRtl } = useLanguage();
  const displayMasked = maskIraqiPhoneInput(value);

  return (
    <div dir="ltr" className="relative flex items-center w-full">
      <span className="px-2.5 py-2 text-xs rounded-s-xl bg-muted border border-e-0 border-layer-line text-muted-foreground-1 font-semibold tabular-nums select-none">
        +964
      </span>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        dir="ltr"
        required={required}
        disabled={disabled}
        value={displayMasked}
        onChange={(e) => {
          const masked = maskIraqiPhoneInput(e.target.value);
          onChange(masked);
        }}
        onBlur={() => {
          if (value && value.trim()) {
            onChange(normalizeIraqiPhoneStorage(value));
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel || bi('رقم الهاتف', 'Phone number', 'ژمارەی تەلەفۆن')}
        className={`w-full px-3 py-2 text-xs rounded-e-xl bg-layer border border-layer-line text-foreground tabular-nums ${isRtl ? 'text-right' : 'text-left'} focus:outline-none focus:border-primary ${className}`.trim()}
      />
    </div>
  );
};

function useAnchoredPopover(
  open: boolean,
  setOpen: React.Dispatch<React.SetStateAction<boolean>>,
  isRtl: boolean,
  preferredWidth = 272,
  estimatedHeight = 330
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  const updatePopoverPosition = useCallback(() => {
    const triggerEl = containerRef.current;
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const width = Math.min(preferredWidth, Math.max(240, viewportW - 16));

    let left = isRtl ? rect.right - width : rect.left;
    left = Math.max(8, Math.min(left, viewportW - width - 8));

    let top = rect.bottom + 6;
    if (top + estimatedHeight > viewportH - 8 && rect.top > estimatedHeight + 12) {
      top = Math.max(8, rect.top - estimatedHeight - 6);
    } else if (top + estimatedHeight > viewportH - 8) {
      top = Math.max(8, viewportH - estimatedHeight - 8);
    }

    setPopoverPos({ top, left, width });
  }, [isRtl, preferredWidth, estimatedHeight]);

  useEffect(() => {
    if (!open) return;
    updatePopoverPosition();
    const handleReposition = () => updatePopoverPosition();
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    document.addEventListener('mousedown', handleOutside);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [open, setOpen, updatePopoverPosition]);

  return { containerRef, popoverRef, popoverPos };
}

export interface DatePickerInputProps {
  id?: string;
  ariaLabel?: string;
  value: string; // YYYY-MM-DD
  onChange: (yyyyMmDd: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const DatePickerInput: React.FC<DatePickerInputProps> = ({
  id,
  ariaLabel,
  value,
  onChange,
  min,
  max,
  placeholder,
  required = false,
  disabled = false,
  className = '',
}) => {
  const { language, isRtl, bi } = useLanguage();
  const [open, setOpen] = useState(false);
  const [textDraft, setTextDraft] = useState(() =>
    value ? formatDateDDMMYYYY(value) : ''
  );

  const parsedCurrent = (() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return { year: y, month: m - 1, day: d };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  })();

  const [viewYear, setViewYear] = useState(parsedCurrent.year);
  const [viewMonth, setViewMonth] = useState(parsedCurrent.month);
  const { containerRef, popoverRef, popoverPos } = useAnchoredPopover(
    open,
    setOpen,
    isRtl,
    272,
    320
  );

  useEffect(() => {
    setTextDraft(value ? formatDateDDMMYYYY(value) : '');
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [value]);

  const handleTextInput = (raw: string) => {
    const cleaned = raw.replace(/[^\d/]/g, '').slice(0, 10);
    setTextDraft(cleaned);
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cleaned);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = Number(m[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
        const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (min && iso < min) return;
        if (max && iso > max) return;
        onChange(iso);
      }
    }
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayWeekday = new Date(viewYear, viewMonth, 1).getDay();

  const selectDay = (day: number) => {
    const iso = `${String(viewYear).padStart(4, '0')}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (min && iso < min) return;
    if (max && iso > max) return;
    onChange(iso);
    setOpen(false);
  };

  const monthNames =
    language === 'ckb'
      ? IRAQI_MONTHS_CKB
      : language === 'en'
      ? MONTHS_EN_LONG
      : IRAQI_MONTHS_AR;
  const weekdayHeaders =
    language === 'ckb'
      ? ['یە', 'دو', 'سێ', 'چو', 'پێ', 'هە', 'شە']
      : language === 'en'
      ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
      : ['أح', 'إث', 'ثل', 'أر', 'خم', 'جم', 'سب'];

  return (
    <div ref={containerRef} className="relative w-full">
      <div dir="ltr" className="relative flex items-center w-full">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          dir="ltr"
          required={required}
          disabled={disabled}
          value={textDraft}
          onChange={(e) => handleTextInput(e.target.value)}
          onFocus={() => !disabled && setOpen(true)}
          placeholder={placeholder || 'dd/mm/yyyy'}
          aria-label={ariaLabel || bi('التاريخ', 'Date', 'بەروار')}
          className={`w-full ps-3 pe-9 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground tabular-nums text-left focus:outline-none focus:border-primary ${className}`.trim()}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-label={bi('فتح التقويم', 'Open calendar', 'کردنەوەی ڕۆژژمێر')}
          className="absolute end-1.5 size-7 flex items-center justify-center rounded-lg text-muted-foreground-1 hover:text-primary cursor-pointer"
        >
          <Calendar className="size-4" />
        </button>
      </div>

      {open &&
        !disabled &&
        popoverPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            dir={isRtl ? 'rtl' : 'ltr'}
            style={{
              position: 'fixed',
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`,
              width: `${popoverPos.width}px`,
              zIndex: 9999,
            }}
            className="rounded-2xl bg-card border border-card-line shadow-2xl p-3 space-y-2.5 max-w-[calc(100vw-16px)]"
          >
            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 0) {
                    setViewMonth(11);
                    setViewYear((y) => y - 1);
                  } else {
                    setViewMonth((m) => m - 1);
                  }
                }}
                aria-label={bi('الشهر السابق', 'Previous month', 'مانگی پێشوو')}
                className="size-7 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line flex items-center justify-center text-foreground cursor-pointer compact-btn"
              >
                {isRtl ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
              </button>

              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground min-w-0">
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(Number(e.target.value))}
                  aria-label={bi('الشهر', 'Month', 'مانگ')}
                  className="px-1.5 py-1 rounded-lg bg-layer border border-layer-line text-xs font-bold text-foreground max-w-[105px]"
                >
                  {monthNames.map((mName, idx) => (
                    <option key={mName} value={idx}>
                      {mName}
                    </option>
                  ))}
                </select>
                <select
                  value={viewYear}
                  onChange={(e) => setViewYear(Number(e.target.value))}
                  dir="ltr"
                  aria-label={bi('السنة', 'Year', 'ساڵ')}
                  className="px-1.5 py-1 rounded-lg bg-layer border border-layer-line text-xs font-bold tabular-nums text-foreground"
                >
                  {Array.from({ length: 115 }, (_, i) => new Date().getFullYear() + 2 - i).map(
                    (yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    )
                  )}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (viewMonth === 11) {
                    setViewMonth(0);
                    setViewYear((y) => y + 1);
                  } else {
                    setViewMonth((m) => m + 1);
                  }
                }}
                aria-label={bi('الشهر التالي', 'Next month', 'مانگی داهاتوو')}
                className="size-7 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line flex items-center justify-center text-foreground cursor-pointer compact-btn"
              >
                {isRtl ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-muted-foreground-1">
              {weekdayHeaders.map((w) => (
                <div key={w} className="py-0.5">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs tabular-nums">
              {Array.from({ length: firstDayWeekday }, (_, i) => (
                <div key={`empty_${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const iso = `${String(viewYear).padStart(4, '0')}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isDisabled = Boolean((min && iso < min) || (max && iso > max));
                const isSelected = value === iso;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => selectDay(day)}
                    className={`size-8 rounded-lg font-semibold flex items-center justify-center transition-colors cursor-pointer text-xs compact-btn mx-auto ${
                      isSelected
                        ? 'bg-primary text-primary-foreground font-bold'
                        : isDisabled
                        ? 'opacity-30 cursor-not-allowed text-muted-foreground-1'
                        : 'hover:bg-primary/10 text-foreground'
                    }`}
                    style={{ minHeight: 'unset' }}
                  >
                    <bdi dir="ltr">{day}</bdi>
                  </button>
                );
              })}
            </div>

            <div className="pt-1.5 border-t border-card-divider flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  const todayIso = localDate();
                  if ((!min || todayIso >= min) && (!max || todayIso <= max)) {
                    onChange(todayIso);
                    setOpen(false);
                  }
                }}
                className="text-primary font-bold hover:underline cursor-pointer compact-btn"
              >
                {bi('اليوم', 'Today', 'ئەمڕۆ')}
              </button>
              <span dir="ltr" className="text-muted-foreground-1 tabular-nums">
                {value ? formatDateDDMMYYYY(value) : 'dd/mm/yyyy'}
              </span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export interface TimePickerInputProps {
  id?: string;
  ariaLabel?: string;
  value: string; // canonical "HH:mm" (24h)
  onChange: (hhMm: string) => void;
  disabled?: boolean;
  className?: string;
}

export const TimePickerInput: React.FC<TimePickerInputProps> = ({
  id,
  value,
  onChange,
  disabled = false,
  className = '',
}) => {
  const { language, isRtl, bi } = useLanguage();
  const [open, setOpen] = useState(false);

  const { containerRef, popoverRef, popoverPos } = useAnchoredPopover(
    open,
    setOpen,
    isRtl,
    284,
    360
  );

  const { hours24, minutes } = (() => {
    const match = /^(\d{1,2}):(\d{2})$/.exec((value || '09:00').trim());
    if (match) {
      const h = Math.min(23, Math.max(0, Number(match[1])));
      const m = Math.min(59, Math.max(0, Number(match[2])));
      return { hours24: h, minutes: m };
    }
    return { hours24: 9, minutes: 0 };
  })();

  const isPm = hours24 >= 12;
  const hour12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  const emitTime = (h24: number, m: number) => {
    const clampedH = ((h24 % 24) + 24) % 24;
    const clampedM = ((m % 60) + 60) % 60;
    onChange(`${String(clampedH).padStart(2, '0')}:${String(clampedM).padStart(2, '0')}`);
  };

  const handleSelectHour12 = (h12: number) => {
    const h24 = isPm ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
    emitTime(h24, minutes);
  };

  const handleSetPeriod = (toPm: boolean) => {
    if (toPm === isPm) return;
    emitTime(toPm ? hours24 + 12 : hours24 - 12, minutes);
  };

  const handleSelectNow = () => {
    const now = new Date();
    emitTime(now.getHours(), now.getMinutes());
    setOpen(false);
  };

  const hoursGrid = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutePresets = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`w-full ps-3 pe-9 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground tabular-nums font-bold flex items-center justify-between text-start hover:border-primary/60 focus:outline-none focus:border-primary cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border-line-2 disabled:cursor-not-allowed relative ${className}`.trim()}
      >
        <TimeDisplay time={`${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`} />
        <span className="absolute end-2.5 text-muted-foreground-1 pointer-events-none">
          <Clock className="size-4" />
        </span>
      </button>

      {open &&
        !disabled &&
        popoverPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            dir={isRtl ? 'rtl' : 'ltr'}
            style={{
              position: 'fixed',
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`,
              width: `${popoverPos.width}px`,
              zIndex: 9999,
            }}
            className="rounded-2xl bg-card border border-card-line shadow-2xl p-3 space-y-2.5 max-w-[calc(100vw-16px)]"
          >
            {/* Header: Digital Display + AM/PM Segmented Switch */}
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-card-divider">
              <div className="px-2.5 py-1 rounded-lg bg-layer border border-layer-line text-sm font-extrabold text-primary tabular-nums">
                <bdi dir="ltr">
                  {formatTimeIraq(
                    `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
                    language
                  )}
                </bdi>
              </div>

              <div className="inline-flex p-0.5 rounded-xl bg-surface border border-line-2 gap-0.5">
                <button
                  type="button"
                  onClick={() => handleSetPeriod(false)}
                  style={{ minHeight: 'unset' }}
                  className={`compact-btn px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    !isPm
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground-1 hover:text-foreground'
                  }`}
                >
                  {bi('ص', 'AM', 'پ.ن')}
                </button>
                <button
                  type="button"
                  onClick={() => handleSetPeriod(true)}
                  style={{ minHeight: 'unset' }}
                  className={`compact-btn px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    isPm
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground-1 hover:text-foreground'
                  }`}
                >
                  {bi('م', 'PM', 'د.ن')}
                </button>
              </div>
            </div>

            {/* Hours Grid */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground-1 px-0.5">
                <span>{bi('الساعة', 'Hour', 'کاتژمێر')}</span>
                <span className="font-mono text-xs opacity-80" dir="ltr">
                  {!isPm ? bi('صباحاً', 'AM', 'بەیانی') : bi('مساءً', 'PM', 'ئێوارە')}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1 text-center tabular-nums" dir="ltr">
                {hoursGrid.map((h) => {
                  const isSelected = hour12 === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleSelectHour12(h)}
                      style={{ minHeight: 'unset' }}
                      className={`compact-btn size-8 rounded-lg font-semibold flex items-center justify-center transition-colors cursor-pointer text-xs mx-auto ${
                        isSelected
                          ? 'bg-primary text-primary-foreground font-bold shadow-2xs'
                          : 'hover:bg-primary/10 text-foreground'
                      }`}
                    >
                      {String(h).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Minutes Fine Slider & 5-Min Quick Grid */}
            <div className="space-y-1.5 pt-1 border-t border-card-divider">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground-1 px-0.5">
                <span>{bi('الدقيقة', 'Minute', 'خولەک')}</span>
                <div className="flex items-center gap-1" dir="ltr">
                  <button
                    type="button"
                    onClick={() => emitTime(hours24, minutes - 1)}
                    aria-label={bi('إنقاص دقيقة', 'Decrease minute', 'کەمکردنەوەی خولەک')}
                    style={{ minHeight: 'unset' }}
                    className="compact-btn size-7 rounded-md bg-layer border border-layer-line hover:bg-layer-hover text-foreground flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={String(minutes).padStart(2, '0')}
                    aria-label={bi('الدقيقة', 'Minute', 'خولەک')}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      if (!Number.isNaN(parsed)) {
                        emitTime(hours24, Math.min(59, Math.max(0, parsed)));
                      }
                    }}
                    style={{ minHeight: 'unset' }}
                    className="w-11 h-7 text-center text-xs font-mono font-bold rounded-md bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => emitTime(hours24, minutes + 1)}
                    aria-label={bi('زيادة دقيقة', 'Increase minute', 'زیادکردنی خولەک')}
                    style={{ minHeight: 'unset' }}
                    className="compact-btn size-7 rounded-md bg-layer border border-layer-line hover:bg-layer-hover text-foreground flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Exact 0–59 Minute Slider */}
              <div dir="ltr" className="px-0.5">
                <input
                  type="range"
                  min={0}
                  max={59}
                  step={1}
                  value={minutes}
                  aria-label={bi('شريط تمرير الدقائق', 'Minutes slider', 'خلیسکێنەری خولەک')}
                  onChange={(e) => emitTime(hours24, Number(e.target.value))}
                  className="w-full h-1.5 accent-primary cursor-pointer"
                />
              </div>

              {/* 5-minute preset pills */}
              <div className="grid grid-cols-6 gap-1 text-center tabular-nums" dir="ltr">
                {minutePresets.map((m) => {
                  const isSelected = minutes === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => emitTime(hours24, m)}
                      style={{ minHeight: 'unset' }}
                      className={`compact-btn size-8 rounded-lg font-semibold flex items-center justify-center transition-colors cursor-pointer text-xs mx-auto ${
                        isSelected
                          ? 'bg-primary text-primary-foreground font-bold shadow-2xs'
                          : 'hover:bg-primary/10 text-foreground'
                      }`}
                    >
                      :{String(m).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer (Matching Calendar Footer) */}
            <div className="pt-1.5 border-t border-card-divider flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handleSelectNow}
                style={{ minHeight: 'unset' }}
                className="text-primary font-bold hover:underline cursor-pointer compact-btn"
              >
                {bi('الآن', 'Now', 'ئێستا')}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ minHeight: 'unset' }}
                className="compact-btn px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {bi('تأكيد', 'Done', 'تەواو')}
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

const CLINICAL_ABBR_DICTIONARY: Record<string, { ar: string; en: string; ckb?: string }> = {
  NPRS: {
    ar: 'مقياس تقييم الألم الرقمي (Numeric Pain Rating Scale 0–10)',
    en: 'Numeric Pain Rating Scale (0–10)',
    ckb: 'پێوەری ژمارەیی هەڵسەنگاندنی ئازار (0–10)',
  },
  ROM: {
    ar: 'المدى الحركي المفصلي (Range of Motion)',
    en: 'Joint Range of Motion',
    ckb: 'مەودای جووڵەی جومگە (Range of Motion)',
  },
  MMT: {
    ar: 'اختبار القوة العضلية اليدوي (Manual Muscle Testing 0–5)',
    en: 'Manual Muscle Testing (MRC 0–5)',
    ckb: 'تاقیکردنەوەی هێزی ماسولکە بە دەست (MRC 0–5)',
  },
  SOAP: {
    ar: 'التوثيق السريري المنهجي (Subjective, Objective, Assessment, Plan)',
    en: 'Subjective, Objective, Assessment, Plan',
    ckb: 'تۆمارکردنی کلینیکی سیستەماتیک (SOAP)',
  },
  ASIA: {
    ar: 'مقياس الجمعية الأمريكية لإصابات الحبل الشوكي (ASIA Impairment Scale)',
    en: 'American Spinal Injury Association Impairment Scale',
    ckb: 'پێوەری کۆمەڵەی ئەمریکی بۆ پێکانەکانی دڕکەپەتک (ASIA)',
  },
  HEP: {
    ar: 'برنامج التمارين العلاجية المنزلية (Home Exercise Program)',
    en: 'Home Exercise Program',
    ckb: 'بەرنامەی ڕاهێنانی چارەسەری لە ماڵەوە (HEP)',
  },
  ODI: {
    ar: 'مؤشر أوسويستري للإعاقة القطنية (Oswestry Disability Index)',
    en: 'Oswestry Disability Index',
    ckb: 'پێوەری ئۆسوێستری بۆ پەککەوتەیی پشت (ODI)',
  },
  TENS: {
    ar: 'التحفيز الكهربائي للعصب عبر الجلد (Transcutaneous Electrical Nerve Stimulation)',
    en: 'Transcutaneous Electrical Nerve Stimulation',
    ckb: 'وریاکردنەوەی کارەبایی دەمار لە ڕێگەی پێستەوە (TENS)',
  },
  NMES: {
    ar: 'التحفيز الكهربائي العصبي العضلي (Neuromuscular Electrical Stimulation)',
    en: 'Neuromuscular Electrical Stimulation',
    ckb: 'وریاکردنەوەی کارەبایی دەمار و ماسولکە (NMES)',
  },
};

export const ClinicalAbbr: React.FC<{ code: string; className?: string }> = ({
  code,
  className = '',
}) => {
  const { bi } = useLanguage();
  const entry = CLINICAL_ABBR_DICTIONARY[code.toUpperCase()];
  const title = entry ? bi(entry.ar, entry.en, entry.ckb) : code;
  return (
    <abbr
      title={title}
      className={`font-semibold no-underline border-b border-dotted border-current/40 cursor-help ${className}`.trim()}
    >
      <bdi dir="ltr">{code}</bdi>
    </abbr>
  );
};

export interface AutoResizeTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number;
  enableSnippets?: boolean;
  enableDictation?: boolean;
  snippetCategory?: NoteTemplateCategory;
}

export const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = ({
  minRows = 2,
  value,
  onChange,
  className = '',
  style,
  enableSnippets = true,
  enableDictation = true,
  snippetCategory,
  onKeyDown,
  ...rest
}) => {
  const { language, bi } = useLanguage();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [templatesEnabled, setTemplatesEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isTemplatesModuleEnabled()
  );
  const [dictationEnabled, setDictationEnabled] = useState<boolean>(() =>
    ClinicOperationsService.isVoiceDictationModuleEnabled()
  );
  const [cloudOptIn, setCloudOptIn] = useState<boolean>(() =>
    ClinicOperationsService.isCloudSpeechFallbackOptIn()
  );
  const [speechStatus, setSpeechStatus] = useState<DictationCapabilityStatus | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  // Slash command (`/`) template expansion state
  const [slashMatch, setSlashMatch] = useState<{ startIndex: number; query: string } | null>(null);
  const [activeSlashIdx, setActiveSlashIdx] = useState(0);

  useEffect(() => {
    const syncFlags = () => {
      setTemplatesEnabled(ClinicOperationsService.isTemplatesModuleEnabled());
      setDictationEnabled(ClinicOperationsService.isVoiceDictationModuleEnabled());
      setCloudOptIn(ClinicOperationsService.isCloudSpeechFallbackOptIn());
    };
    syncFlags();
    return ClinicOperationsService.subscribe(syncFlags);
  }, []);

  useEffect(() => {
    if (!enableDictation || !dictationEnabled || rest.disabled || rest.readOnly) {
      setSpeechStatus(null);
      return;
    }
    let cancelled = false;
    const langTag = language === 'en' ? 'en-US' : language === 'ckb' ? 'ckb-IQ' : 'ar-IQ';
    void detectSpeechDictationSupport(langTag, cloudOptIn).then((status) => {
      if (!cancelled) setSpeechStatus(status);
    });
    return () => {
      cancelled = true;
    };
  }, [enableDictation, dictationEnabled, cloudOptIn, language, rest.disabled, rest.readOnly]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore cleanup stop errors
      }
      recognitionRef.current = null;
    };
  }, []);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const minHeight = minRows * 22 + 16;
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [value, minRows]);

  const emitSyntheticValueChange = (nextValue: string) => {
    const el = textareaRef.current;
    if (el) {
      el.value = nextValue;
    }
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as React.ChangeEvent<HTMLTextAreaElement>);
  };

  const [noteTemplatesRev, setNoteTemplatesRev] = React.useState(0);

  React.useEffect(() => {
    if (!enableSnippets || !templatesEnabled || !slashMatch) return;
    void ClinicOperationsService.ensureColdStoreLoadedAsync('noteTemplates');
    return ClinicOperationsService.subscribe(() => setNoteTemplatesRev((r) => r + 1));
  }, [enableSnippets, templatesEnabled, Boolean(slashMatch)]);

  const snippetCandidates = React.useMemo<NoteTemplateSnippet[]>(() => {
    if (!enableSnippets || !templatesEnabled || !slashMatch) return [];
    const all = ClinicOperationsService.getAllNoteTemplates();
    const q = slashMatch.query.trim().toLowerCase();
    const filtered = all.filter((item) => {
      if (!q) return true;
      return (
        item.slashTrigger.toLowerCase().includes(q) ||
        item.titleAr.toLowerCase().includes(q) ||
        item.titleEn.toLowerCase().includes(q)
      );
    });
    return filtered
      .sort((a, b) => {
        const aCat = snippetCategory && a.category === snippetCategory ? 0 : 1;
        const bCat = snippetCategory && b.category === snippetCategory ? 0 : 1;
        if (aCat !== bCat) return aCat - bCat;
        return a.slashTrigger.localeCompare(b.slashTrigger);
      })
      .slice(0, 8);
  }, [enableSnippets, templatesEnabled, slashMatch, snippetCategory, noteTemplatesRev]);

  const detectSlashTrigger = (textVal: string, cursorPos: number | null) => {
    if (!enableSnippets || !templatesEnabled || rest.disabled || rest.readOnly) {
      setSlashMatch(null);
      return;
    }
    const pos = typeof cursorPos === 'number' ? cursorPos : textVal.length;
    const beforeCursor = textVal.slice(0, pos);
    const match = beforeCursor.match(/(?:^|\s)(\/[a-z0-9_\u0600-\u06FF-]*)$/i);
    if (match && match[1]) {
      const startIndex = pos - match[1].length;
      setSlashMatch({ startIndex, query: match[1].slice(1) });
      setActiveSlashIdx(0);
    } else {
      setSlashMatch(null);
    }
  };

  const applySnippet = (snippet: NoteTemplateSnippet) => {
    if (!slashMatch) return;
    const currentStr = String(value ?? '');
    const el = textareaRef.current;
    const cursorPos = el?.selectionStart ?? currentStr.length;
    const snippetBody =
      language === 'en'
        ? snippet.bodyEn || snippet.bodyAr
        : snippet.bodyAr || snippet.bodyEn;
    const before = currentStr.slice(0, slashMatch.startIndex);
    const after = currentStr.slice(cursorPos);
    const nextValue = `${before}${snippetBody}${after}`;
    emitSyntheticValueChange(nextValue);
    setSlashMatch(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const nextPos = before.length + snippetBody.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextPos, nextPos);
      }
      adjustHeight();
    }, 0);
  };

  const toggleVoiceDictation = () => {
    if (!speechStatus || speechStatus.mode === 'hidden') return;
    setSpeechError(null);
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      return;
    }

    const langTag = language === 'en' ? 'en-US' : language === 'ckb' ? 'ckb-IQ' : 'ar-IQ';
    try {
      const rec = createLocalSpeechSession({
        langTag,
        requireLocalOnly: speechStatus.mode === 'local_ready',
        onTranscriptChunk: (chunk) => {
          const prevStr = String(textareaRef.current?.value ?? value ?? '');
          const separator = prevStr.trim().length > 0 && !/\s$/.test(prevStr) ? ' ' : '';
          emitSyntheticValueChange(`${prevStr}${separator}${chunk}`);
        },
        onError: (code) => {
          setIsListening(false);
          setSpeechError(
            bi(
              `تعذّر الإملاء الصوتي (${code})`,
              `Dictation error: ${code}`,
              `هەڵەی تۆمارکردنی دەنگی (${code})`
            )
          );
        },
        onEnd: () => {
          setIsListening(false);
        },
      });
      recognitionRef.current = rec;
      setIsListening(true);
    } catch (err) {
      setIsListening(false);
      setSpeechError(err instanceof Error ? err.message : String(err));
    }
  };

  const canShowMic =
    Boolean(enableDictation) &&
    dictationEnabled &&
    !rest.disabled &&
    !rest.readOnly &&
    Boolean(speechStatus && speechStatus.mode !== 'hidden');

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        rows={minRows}
        value={value}
        onChange={(e) => {
          adjustHeight();
          onChange?.(e);
          detectSlashTrigger(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) {
            onKeyDown?.(e);
            return;
          }
          if (slashMatch && snippetCandidates.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveSlashIdx((idx) => (idx + 1) % snippetCandidates.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveSlashIdx(
                (idx) => (idx - 1 + snippetCandidates.length) % snippetCandidates.length
              );
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              applySnippet(snippetCandidates[activeSlashIdx] || snippetCandidates[0]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setSlashMatch(null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        style={{
          overflow: 'hidden',
          resize: 'vertical',
          ...(canShowMic ? { paddingInlineEnd: '2.5rem' } : {}),
          ...style,
        }}
        className={className}
        {...rest}
      />

      {canShowMic && (
        <button
          type="button"
          onClick={toggleVoiceDictation}
          aria-label={
            isListening
              ? bi('إيقاف الإملاء الصوتي', 'Stop voice dictation', 'وەستاندنی تۆمارکردنی دەنگی')
              : speechStatus?.mode === 'local_ready'
                ? bi(
                    'بدء الإملاء الصوتي المحلي (على الجهاز)',
                    'Start on-device voice dictation',
                    'دەستپێکردنی تۆمارکردنی دەنگی ناوخۆیی (لەسەر ئامێر)'
                  )
                : bi(
                    'بدء الإملاء الصوتي (وضع السحابة الاختياري)',
                    'Start cloud opt-in dictation',
                    'دەستپێکردنی تۆمارکردنی دەنگی (دۆخی هەور)'
                  )
          }
          title={
            speechStatus
              ? bi(speechStatus.reasonAr, speechStatus.reasonEn)
              : undefined
          }
          className={`absolute top-2 end-2 p-1.5 rounded-lg border transition-colors cursor-pointer ${
            isListening
              ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
              : speechStatus?.mode === 'local_ready'
                ? 'bg-primary/15 text-primary border-primary/35 hover:bg-primary/25'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35'
          }`}
        >
          {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>
      )}

      {speechError && (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{speechError}</p>
      )}

      {slashMatch && snippetCandidates.length > 0 && (
        <div
          role="listbox"
          aria-label={bi('قوالب الملاحظات السريرية', 'Clinical note snippets', 'قاڵبەکانی تێبینی کلینیکی')}
          className="mt-1 rounded-xl border border-card-stroke bg-layer shadow-xl overflow-hidden z-30"
        >
          <div className="px-3 py-1.5 bg-surface border-b border-card-divider flex items-center justify-between text-xs text-muted-foreground-1">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              {bi('إدراج قالب سريع (/)', 'Clinical Snippets (/)', 'دانانی قاڵبی خێرا (/)')}
            </span>
            <span>Enter ↵</span>
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-card-divider">
            {snippetCandidates.map((snip, idx) => (
              <button
                key={snip.id}
                type="button"
                role="option"
                aria-selected={idx === activeSlashIdx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySnippet(snip);
                }}
                className={`w-full px-3 py-2 text-start transition-colors cursor-pointer ${
                  idx === activeSlashIdx
                    ? 'bg-primary/15 text-foreground'
                    : 'hover:bg-layer-hover text-foreground'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold">
                    {bi(snip.titleAr, snip.titleEn)}
                  </span>
                  <span
                    dir="ltr"
                    className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground-1 font-mono text-xs"
                  >
                    /{snip.slashTrigger}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground-1 mt-0.5 line-clamp-1">
                  {language === 'en'
                    ? snip.bodyEn || snip.bodyAr
                    : snip.bodyAr || snip.bodyEn}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const DemoBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span
      dir="ltr"
      className={`text-xs font-mono font-extrabold tracking-wide text-amber-700 dark:text-amber-300 shrink-0 ${className}`.trim()}
      title="Demo / Synthetic Record"
    >
      DEMO
    </span>
  );
};

export interface NprsControlProps {
  value: number | undefined | null;
  onChange: (val: number) => void;
  notRecorded?: boolean;
  onToggleNotRecorded?: () => void;
  showNotRecordedOption?: boolean;
  disabled?: boolean;
  label?: React.ReactNode;
  className?: string;
}

export function getNprsSeverityStyles(score: number | undefined | null): {
  activeBtn: string;
  badgeText: string;
  sliderAccent: string;
} {
  if (score === undefined || score === null || Number.isNaN(score)) {
    return {
      activeBtn: 'bg-primary text-primary-foreground border-primary',
      badgeText: 'text-muted-foreground-1',
      sliderAccent: 'accent-primary',
    };
  }
  if (score <= 3) {
    return {
      activeBtn: 'bg-emerald-700 text-white border-emerald-800',
      badgeText: 'text-emerald-700 dark:text-emerald-300',
      sliderAccent: 'accent-emerald-700',
    };
  }
  if (score <= 6) {
    return {
      activeBtn: 'bg-amber-600 text-white border-amber-700',
      badgeText: 'text-amber-700 dark:text-amber-400',
      sliderAccent: 'accent-amber-700',
    };
  }
  return {
    activeBtn: 'bg-rose-700 text-white border-rose-800',
    badgeText: 'text-rose-700 dark:text-rose-300',
    sliderAccent: 'accent-rose-600',
  };
}

export const NprsControl: React.FC<NprsControlProps> = ({
  value,
  onChange,
  notRecorded = false,
  onToggleNotRecorded,
  showNotRecordedOption = false,
  disabled = false,
  label,
  className = '',
}) => {
  const { bi } = useLanguage();

  const clampedValue =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(10, Math.round(value)))
      : undefined;

  const severity = getNprsSeverityStyles(notRecorded ? undefined : clampedValue);

  const currentVal = notRecorded ? 0 : (clampedValue ?? 0);
  const percent = (currentVal / 10) * 100;
  const fillColor =
    notRecorded || clampedValue === undefined
      ? '#94a3b8'
      : clampedValue <= 3
      ? '#059669'
      : clampedValue <= 6
      ? '#d97706'
      : '#e11d48';
  const trackBg = `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${percent}%, rgba(148, 163, 184, 0.25) ${percent}%, rgba(148, 163, 184, 0.25) 100%)`;

  const handleSelect = (raw: number) => {
    const valid = Math.max(0, Math.min(10, Math.round(raw)));
    onChange(valid);
  };

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      {label !== undefined && (
        <div className="flex items-center justify-between gap-2 text-xs font-bold tabular-nums">
          <span className="text-foreground">{label}</span>
          <span className={`text-xs font-extrabold ${severity.badgeText}`}>
            {notRecorded ? (
              bi('لم يُسجّل', 'Not recorded', 'تۆمار نەکراوە')
            ) : clampedValue !== undefined ? (
              <Fraction value={clampedValue} total={10} />
            ) : (
              bi('غير محدد', 'Unselected', 'دیاری نەکراوە')
            )}
          </span>
        </div>
      )}

      {/* Desktop: Interactive 0-10 slider + single-row segmented control (Always LTR) */}
      <div className="hidden sm:flex flex-col gap-1.5" dir="ltr">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex flex-wrap items-center rounded-xl bg-card border border-card-line p-0.5 gap-0.5">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
              const isSelected = !notRecorded && clampedValue === num;
              const numStyle = getNprsSeverityStyles(num);
              return (
                <button
                  key={num}
                  type="button"
                  data-testid={`nprs-num-${num}`}
                  aria-pressed={isSelected}
                  disabled={disabled}
                  onClick={() => handleSelect(num)}
                  className={`size-8 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                    isSelected
                      ? numStyle.activeBtn
                      : 'bg-transparent text-foreground border-transparent hover:bg-muted'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {num}
                </button>
              );
            })}
          </div>

          {showNotRecordedOption && onToggleNotRecorded && (
            <button
              type="button"
              disabled={disabled}
              onClick={onToggleNotRecorded}
              className={`ms-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                notRecorded
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card text-muted-foreground-1 border-card-line hover:text-foreground'
              }`}
            >
              {bi('لم يُسجّل', 'Not recorded', 'تۆمار نەکراوە')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 max-w-sm">
          <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">0</span>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            dir="ltr"
            disabled={disabled}
            value={clampedValue ?? 0}
            onChange={(e) => handleSelect(Number(e.target.value))}
            aria-label="NPRS Pain Slider 0-10"
            style={{
              background: trackBg,
              ['--thumb-color' as string]: fillColor,
            }}
            className={`nprs-slider flex-1 h-2 rounded-lg cursor-pointer ${severity.sliderAccent} ${
              notRecorded ? 'opacity-45' : ''
            }`}
          />
          <span className="text-xs font-mono font-bold text-rose-700 dark:text-rose-300">10</span>
        </div>
      </div>

      {/* Mobile: Slider (Always LTR 0→10) */}
      <div className="flex sm:hidden items-center gap-2.5" dir="ltr">
        <span className="text-xs font-mono text-emerald-700 dark:text-emerald-300 font-bold">0</span>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          dir="ltr"
          disabled={disabled}
          value={clampedValue ?? 0}
          onChange={(e) => handleSelect(Number(e.target.value))}
          aria-label="NPRS 0-10"
          style={{
            background: trackBg,
            ['--thumb-color' as string]: fillColor,
          }}
          className={`nprs-slider flex-1 h-2 rounded-lg cursor-pointer ${severity.sliderAccent}`}
        />
        <span className="text-xs font-mono text-rose-700 dark:text-rose-300 font-bold">10</span>
        {label === undefined && (
          <span className={`min-w-[42px] text-end text-xs font-mono font-extrabold ${severity.badgeText}`}>
            {notRecorded ? '—' : <Fraction value={clampedValue ?? 0} total={10} />}
          </span>
        )}
        {showNotRecordedOption && onToggleNotRecorded && (
          <button
            type="button"
            disabled={disabled}
            onClick={onToggleNotRecorded}
            className={`px-2 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
              notRecorded
                ? 'bg-foreground text-background border-foreground'
                : 'bg-card text-muted-foreground-1 border-card-line'
            }`}
          >
            {bi('لم يُسجّل', 'N/R', 'تۆمار نەکراوە')}
          </button>
        )}
      </div>
    </div>
  );
};
