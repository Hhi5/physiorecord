// =======================================================================
// PhysioRecord — Accessible Tabs Primitive (React Aria Components)
// Full RTL arrow-key navigation and Clinical Default semantic styling.
// =======================================================================

import React from 'react';
import {
  Tabs as AriaTabs,
  TabList as AriaTabList,
  Tab as AriaTab,
  TabPanel as AriaTabPanel,
  type Key,
} from 'react-aria-components';

export interface AccessibleTabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface AccessibleTabsProps {
  selectedKey?: Key;
  defaultSelectedKey?: Key;
  onSelectionChange?: (key: Key) => void;
  ariaLabel?: string;
  variant?: 'pills' | 'underline';
  className?: string;
  tabListClassName?: string;
  children: React.ReactNode;
}

export const AccessibleTabs: React.FC<AccessibleTabsProps> = ({
  selectedKey,
  defaultSelectedKey,
  onSelectionChange,
  className = '',
  children,
}) => {
  return (
    <AriaTabs
      selectedKey={selectedKey}
      defaultSelectedKey={defaultSelectedKey}
      onSelectionChange={onSelectionChange}
      className={className}
    >
      {children}
    </AriaTabs>
  );
};

export interface AccessibleTabListProps {
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}

export const AccessibleTabList: React.FC<AccessibleTabListProps> = ({
  ariaLabel,
  className = '',
  children,
}) => {
  return (
    <AriaTabList
      aria-label={ariaLabel}
      className={`flex items-center gap-1.5 flex-wrap ${className}`.trim()}
    >
      {children}
    </AriaTabList>
  );
};

export interface AccessibleTabProps {
  id: string;
  isDisabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const AccessibleTab: React.FC<AccessibleTabProps> = ({
  id,
  isDisabled = false,
  className = '',
  children,
}) => {
  return (
    <AriaTab
      id={id}
      isDisabled={isDisabled}
      className={({ isSelected, isFocusVisible }) =>
        `px-3 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer outline-none ${
          isSelected
            ? 'bg-primary text-primary-foreground shadow-2xs'
            : 'bg-layer text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover border border-layer-line'
        } ${
          isFocusVisible ? 'ring-2 ring-primary/50 ring-offset-1' : ''
        } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`.trim()
      }
    >
      {children}
    </AriaTab>
  );
};

export interface AccessibleTabPanelProps {
  id: string;
  className?: string;
  children: React.ReactNode;
}

export const AccessibleTabPanel: React.FC<AccessibleTabPanelProps> = ({
  id,
  className = '',
  children,
}) => {
  return (
    <AriaTabPanel id={id} className={`outline-none ${className}`.trim()}>
      {children}
    </AriaTabPanel>
  );
};
