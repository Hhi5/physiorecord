// =======================================================================
// PhysioRecord — Accessible Modal & Drawer Primitives (React Aria Components)
// RTL-aware focus trapping, keyboard Escape dismissal, and semantic surface tokens.
// =======================================================================

import React from 'react';
import {
  Dialog as AriaDialog,
  Heading,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { X } from 'lucide-react';

export interface ModalDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  ariaLabel?: string;
  dir?: 'rtl' | 'ltr';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  role?: 'dialog' | 'alertdialog';
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  hideCloseButton?: boolean;
  hideSheetHandle?: boolean;
  closeLabel?: string;
  overlayClassName?: string;
  className?: string;
  bodyClassName?: string;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<ModalDialogProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-6xl',
  full: 'max-w-[95vw]',
};

/**
 * Pure geometric background decoration (concentric rings, rotated squares,
 * floating circles, dot grid, and cross) rendered inside themed modal/drawer headers.
 */
export const GeometricHeaderBackdrop: React.FC = () => (
  <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none select-none">
    {/* Concentric Circles & Rings */}
    <div className="absolute -top-10 -end-10 size-40 rounded-full border-2 border-primary-foreground/20" />
    <div className="absolute -top-5 -end-5 size-28 rounded-full border border-dashed border-primary-foreground/25" />

    {/* Rotated Diamonds & Squares */}
    <div className="absolute top-2 end-1/3 size-12 rounded-xl border-2 border-primary-foreground/15 rotate-45" />
    <div className="absolute -bottom-8 start-8 size-28 rounded-2xl border-2 border-primary-foreground/10 -rotate-12" />
    <div className="absolute -bottom-4 start-12 size-20 rounded-xl border border-dashed border-primary-foreground/15 -rotate-12" />

    {/* Geometric Floating Circles */}
    <div className="absolute top-4 start-1/4 size-7 rounded-full border border-primary-foreground/20" />
    <div className="absolute bottom-3 end-1/3 size-4 rounded-full bg-primary-foreground/15" />

    {/* Dot Grid */}
    <div className="absolute bottom-4 end-16 flex gap-1.5 opacity-30">
      <div className="size-1 rounded-full bg-primary-foreground" />
      <div className="size-1 rounded-full bg-primary-foreground" />
      <div className="size-1 rounded-full bg-primary-foreground" />
    </div>

    {/* Geometric Cross */}
    <div className="absolute top-5 end-24 opacity-25">
      <div className="relative size-5">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-primary-foreground rounded-full" />
        <div className="absolute inset-y-0 start-1/2 w-0.5 -translate-x-1/2 bg-primary-foreground rounded-full" />
      </div>
    </div>
  </div>
);

/**
 * Accessible modal dialog built on React Aria Components (`Apache-2.0`).
 */
export const ModalDialog: React.FC<ModalDialogProps> = ({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  ariaLabel,
  dir,
  size = 'lg',
  role = 'dialog',
  isDismissable = true,
  isKeyboardDismissDisabled,
  hideCloseButton = false,
  hideSheetHandle = false,
  closeLabel = 'Close',
  overlayClassName = '',
  className = '',
  bodyClassName,
  headerActions,
  footer,
  children,
}) => {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled ?? !isDismissable}
      className={`fixed inset-0 z-50 flex ${overlayClassName || 'items-end sm:items-center justify-center p-0 sm:p-6'} bg-slate-950/60 backdrop-blur-xs entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out`.trim()}
    >
      <Modal
        dir={dir}
        className={`w-full ${SIZE_CLASSES[size]} max-h-[92dvh] sm:max-h-[88dvh] rounded-t-2xl sm:rounded-2xl bg-layer border border-layer-line text-foreground shadow-2xl overflow-hidden flex flex-col outline-none ${className}`.trim()}
      >
        <AriaDialog
          role={role}
          aria-label={title ? undefined : ariaLabel || closeLabel}
          className="flex flex-col max-h-[92dvh] sm:max-h-[88dvh] min-h-0 outline-none"
        >
          {({ close }) => {
            const hasHeader = Boolean(title || !hideCloseButton || headerActions);
            return (
              <>
                {!hasHeader && !hideSheetHandle && <div className="pr-sheet-handle" aria-hidden="true" />}
                {hasHeader && (
                  <div className="relative overflow-hidden px-4 sm:px-5 pt-2.5 sm:pt-4 pb-3.5 bg-primary text-primary-foreground flex flex-col gap-2 shrink-0 shadow-xs">
                    <GeometricHeaderBackdrop />
                    {!hideSheetHandle && (
                      <div className="relative z-10 w-10 h-1 bg-primary-foreground/40 rounded-full mx-auto mb-1 sm:hidden" aria-hidden="true" />
                    )}
                    <div className="relative z-10 flex items-start justify-between gap-2.5">
                      <div className="flex-1 min-w-0">
                        {title && (
                          <Heading
                            slot="title"
                            className="text-base sm:text-lg font-bold text-primary-foreground leading-snug break-words"
                          >
                            {title}
                          </Heading>
                        )}
                        {subtitle && (
                          <p className="text-xs text-primary-foreground/85 mt-0.5 leading-relaxed">
                            {subtitle}
                          </p>
                        )}
                      </div>
                      {!hideCloseButton && (
                        <button
                          type="button"
                          onClick={close}
                          aria-label={closeLabel}
                          className="size-9 !p-0 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {headerActions && (
                      <div className="relative z-10 flex flex-wrap items-center gap-1.5 pt-2 border-t border-primary-foreground/20">
                        {headerActions}
                      </div>
                    )}
                  </div>
                )}

              <div tabIndex={0} className={bodyClassName ?? 'flex-1 overflow-y-auto min-h-0 p-4 sm:p-6'}>{children}</div>

              {footer && (
                <div className="px-4 sm:px-5 py-3 border-t border-card-divider bg-muted/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  {footer}
                </div>
              )}
            </>
          );
          }}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
};

export interface DrawerDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title?: string;
  subtitle?: string;
  ariaLabel?: string;
  dir?: 'rtl' | 'ltr';
  side?: 'start' | 'end';
  isDismissable?: boolean;
  closeLabel?: string;
  maxWidthClassName?: string;
  className?: string;
  bodyClassName?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Accessible slide-over drawer respecting RTL/LTR writing direction (`start` / `end`).
 */
export const DrawerDialog: React.FC<DrawerDialogProps> = ({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  ariaLabel,
  dir,
  side = 'end',
  isDismissable = true,
  closeLabel = 'Close',
  maxWidthClassName = 'max-w-lg',
  className = '',
  bodyClassName,
  footer,
  children,
}) => {
  const anchorClass = side === 'start' ? 'justify-start' : 'justify-end';

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      className={`fixed inset-0 z-50 flex items-end sm:items-stretch justify-center sm:${anchorClass} bg-slate-950/60 backdrop-blur-xs`}
    >
      <Modal
        dir={dir}
        className={`w-full ${maxWidthClassName} max-h-[92dvh] sm:max-h-none sm:h-full rounded-t-2xl sm:rounded-none bg-layer border-t sm:border-t-0 sm:border-s sm:border-e border-layer-line text-foreground shadow-2xl flex flex-col outline-none overflow-hidden ${className}`.trim()}
      >
        <AriaDialog
          aria-label={title ? undefined : ariaLabel || closeLabel}
          className="flex flex-col max-h-[92dvh] sm:max-h-none sm:h-full min-h-0 outline-none"
        >
          {({ close }) => {
            const hasHeader = Boolean(title || subtitle);
            return (
              <>
                {!hasHeader && (
                  <div className="w-10 h-1 rounded-full bg-line-2 mx-auto mt-2.5 mb-0.5 sm:hidden shrink-0" aria-hidden="true" />
                )}
                {hasHeader && (
                  <div className="relative overflow-hidden px-5 pt-3 sm:pt-4 pb-4 bg-primary text-primary-foreground flex flex-col gap-2.5 flex-shrink-0 shadow-xs">
                    <GeometricHeaderBackdrop />
                    <div className="relative z-10 w-10 h-1 rounded-full bg-primary-foreground/40 mx-auto sm:hidden shrink-0" aria-hidden="true" />
                    <div className="relative z-10 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {title && (
                          <Heading
                            slot="title"
                            className="text-base font-bold text-primary-foreground leading-snug"
                          >
                            {title}
                          </Heading>
                        )}
                        {subtitle && (
                          <p className="text-xs text-primary-foreground/85 mt-0.5">
                            {subtitle}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={close}
                        aria-label={closeLabel}
                        className="size-9 !p-0 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div tabIndex={0} className={bodyClassName ?? 'flex-1 min-h-0 overflow-y-auto p-5 focus:outline-none'}>
                  {children}
                </div>

                {footer && (
                  <div className="px-5 py-3.5 border-t border-card-divider bg-muted/40 flex items-center justify-end gap-2.5 flex-shrink-0">
                    {footer}
                  </div>
                )}
              </>
            );
          }}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
};
