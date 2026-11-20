import React, { useRef } from 'react';
import { useViewportClampedMenu } from '../../utils/menuViewportClamp';

export interface ClampedMenuPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  margin?: number;
}

/**
 * Drop-in floating menu panel that clamps itself inside the horizontal viewport
 * on mount and window resize so RTL/LTR dropdowns never clip past screen borders.
 */
export const ClampedMenuPanel: React.FC<ClampedMenuPanelProps> = ({
  margin = 8,
  children,
  ...rest
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useViewportClampedMenu(true, panelRef, margin);

  return (
    <div ref={panelRef} {...rest}>
      {children}
    </div>
  );
};
