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
  title?: string;
  subtitle?: string;
  ariaLabel?: string;
  dir?: 'rtl' | 'ltr';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  role?: 'dialog' | 'alertdialog';
  isDismissable?: boolean;
  isKeyboardDismissDisabled?: boolean;
  hideCloseButton?: boolean;
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
      className={`fixed inset-0 z-50 flex ${overlayClassName || 'items-center justify-center p-3 sm:p-6'} bg-slate-950/60 backdrop-blur-xs entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out`.trim()}
    >
      <Modal
        dir={dir}
        className={`w-full ${SIZE_CLASSES[size]} max-h-[88dvh] bg-layer border border-layer-line text-foreground rounded-2xl shadow-2xl overflow-hidden flex flex-col outline-none ${className}`.trim()}
      >
        <AriaDialog
          role={role}
          aria-label={title ? undefined : ariaLabel || closeLabel}
          className="flex flex-col max-h-[88dvh] min-h-0 outline-none"
        >
          {({ close }) => (
            <>
              {(title || !hideCloseButton || headerActions) && (
                <div className="px-4 sm:px-5 py-3.5 border-b border-card-divider bg-surface/60 flex items-start justify-between gap-3 shrink-0">
                  <div className="min-w-0">
                    {title && (
                      <Heading
                        slot="title"
                        className="text-base sm:text-lg font-bold text-foreground leading-snug"
                      >
                        {title}
                      </Heading>
                    )}
                    {subtitle && (
                      <p className="text-xs text-muted-foreground-1 mt-0.5 leading-relaxed">
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {headerActions}
                    {!hideCloseButton && (
                      <button
                        type="button"
                        onClick={close}
                        aria-label={closeLabel}
                        className="min-w-[36px] min-h-[36px] p-2 rounded-xl text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div tabIndex={0} className={bodyClassName ?? 'flex-1 overflow-y-auto min-h-0 p-4 sm:p-6'}>{children}</div>

              {footer && (
                <div className="px-4 sm:px-5 py-3 border-t border-card-divider bg-muted/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  {footer}
                </div>
              )}
            </>
          )}
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
      className={`fixed inset-0 z-50 flex ${anchorClass} bg-slate-950/60 backdrop-blur-xs`}
    >
      <Modal
        dir={dir}
        className={`w-full ${maxWidthClassName} h-full bg-layer border-s border-e border-layer-line text-foreground shadow-2xl flex flex-col outline-none ${className}`.trim()}
      >
        <AriaDialog
          aria-label={title ? undefined : ariaLabel || closeLabel}
          className="flex flex-col h-full outline-none"
        >
          {({ close }) => (
            <>
              {(title || subtitle) && (
                <div className="px-5 py-4 border-b border-card-divider bg-surface/60 flex items-start justify-between gap-3 flex-shrink-0">
                  <div className="min-w-0">
                    {title && (
                      <Heading
                        slot="title"
                        className="text-base font-bold text-foreground"
                      >
                        {title}
                      </Heading>
                    )}
                    {subtitle && (
                      <p className="text-xs text-muted-foreground-1 mt-0.5">
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label={closeLabel}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center p-2 rounded-xl text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div tabIndex={0} className={bodyClassName ?? 'flex-1 overflow-y-auto p-5 focus:outline-none'}>
                {children}
              </div>

              {footer && (
                <div className="px-5 py-3.5 border-t border-card-divider bg-muted/40 flex items-center justify-end gap-2.5 flex-shrink-0">
                  {footer}
                </div>
              )}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
};
