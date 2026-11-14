// =======================================================================
// PhysioRecord — Accessible Popover Primitive (React Aria Components)
// Viewport collision-aware anchored popover for menus, hints, and pickers.
// =======================================================================

import React from 'react';
import {
  Dialog as AriaDialog,
  DialogTrigger,
  Popover as AriaPopover,
  type Placement,
} from 'react-aria-components';

export interface AccessiblePopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  placement?: Placement;
  className?: string;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  ariaLabel?: string;
}

export const AccessiblePopover: React.FC<AccessiblePopoverProps> = ({
  trigger,
  children,
  placement = 'bottom start',
  className = '',
  isOpen,
  onOpenChange,
  ariaLabel,
}) => {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      <AriaPopover
        placement={placement}
        offset={6}
        className={`z-50 bg-layer border border-layer-line text-foreground rounded-xl shadow-lg p-3 outline-none entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out ${className}`.trim()}
      >
        <AriaDialog aria-label={ariaLabel} className="outline-none">
          {({ close }) =>
            typeof children === 'function' ? children(close) : children
          }
        </AriaDialog>
      </AriaPopover>
    </DialogTrigger>
  );
};
