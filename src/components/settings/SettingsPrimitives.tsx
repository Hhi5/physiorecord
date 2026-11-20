import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SettingsAccordionProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (nextOpen: boolean) => void;
  testId?: string;
  children: React.ReactNode;
}

export const SettingsAccordion: React.FC<SettingsAccordionProps> = ({
  title,
  subtitle,
  meta,
  icon,
  defaultOpen = false,
  open,
  onOpenChange,
  testId,
  children,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open !== undefined ? open : internalOpen;

  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  return (
    <section
      data-testid={testId}
      className="rounded-2xl bg-card border border-card-line overflow-hidden transition-colors"
    >
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={toggle}
        className="w-full px-4 py-3.5 text-start flex items-center justify-between gap-3 hover:bg-surface/70 cursor-pointer transition-colors"
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {icon && (
            <span className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-bold text-foreground leading-snug">{title}</span>
              {meta && (
                <>
                  <span aria-hidden="true" className="hidden sm:inline text-muted-foreground-2 text-xs">
                    ·
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground-1">{meta}</span>
                </>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground-1 leading-relaxed mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <ChevronDown
          className={`size-4 text-muted-foreground-1 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="px-4 pb-4 pt-3 border-t border-card-divider space-y-3">{children}</div>
      )}
    </section>
  );
};

interface SettingsSwitchRowProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  testId?: string;
  statusText?: string;
  onLabel?: string;
  offLabel?: string;
  children?: React.ReactNode;
}

export const SettingsSwitchRow: React.FC<SettingsSwitchRowProps> = ({
  title,
  description,
  checked,
  onChange,
  testId,
  statusText,
  onLabel = 'مفعّلة',
  offLabel = 'معطّلة',
  children,
}) => {
  return (
    <div className="py-3 first:pt-1 last:pb-1 border-b border-card-divider/70 last:border-b-0 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-xs font-bold text-foreground leading-snug">{title}</span>
            {statusText && (
              <>
                <span aria-hidden="true" className="text-muted-foreground-2 text-xs">
                  ·
                </span>
                <span
                  className={`text-xs font-semibold ${
                    checked
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-muted-foreground-1'
                  }`}
                >
                  {statusText}
                </span>
              </>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground-1 leading-relaxed mt-0.5">{description}</p>
          )}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          data-testid={testId}
          onClick={() => onChange(!checked)}
          className="compact-btn group relative -mt-0.5 inline-flex h-8 w-[46px] shrink-0 items-center justify-center rounded-full bg-transparent cursor-pointer focus-visible:outline-none before:content-[''] before:absolute before:-inset-1.5"
        >
          <span className="sr-only">{checked ? onLabel : offLabel}</span>
          <span
            aria-hidden="true"
            className={`relative inline-flex h-[24px] w-[42px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200 ease-out ${
              checked
                ? 'bg-primary'
                : 'bg-slate-300 dark:bg-slate-600 group-hover:bg-slate-400/90 dark:group-hover:bg-slate-500'
            }`}
          >
            <span
              className={`pointer-events-none block size-[18px] shrink-0 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.24)] transition-transform duration-200 ease-out ${
                checked ? 'translate-x-[18px] rtl:-translate-x-[18px]' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
      </div>

      {children && <div className="pt-1">{children}</div>}
    </div>
  );
};
