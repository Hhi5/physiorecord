// =======================================================================
// PhysioRecord — Accessible ComboBox Primitive (React Aria Components)
// Supports searchable filtering and custom free-text clinical entry (R2).
// =======================================================================

import React from 'react';
import {
  Button,
  ComboBox as AriaComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  type Key,
} from 'react-aria-components';
import { ChevronDown } from 'lucide-react';

export interface ComboBoxOption {
  id: string;
  label: string;
  description?: string;
}

export interface AccessibleComboBoxProps {
  label?: string;
  options: ComboBoxOption[];
  selectedKey?: Key | null;
  onSelectionChange?: (key: Key | null) => void;
  inputValue?: string;
  onInputChange?: (value: string) => void;
  allowsCustomValue?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export const AccessibleComboBox: React.FC<AccessibleComboBoxProps> = ({
  label,
  options,
  selectedKey,
  onSelectionChange,
  inputValue,
  onInputChange,
  allowsCustomValue = true,
  placeholder,
  disabled = false,
  className = '',
  ariaLabel,
}) => {
  return (
    <AriaComboBox
      defaultItems={options}
      selectedKey={selectedKey}
      onSelectionChange={onSelectionChange}
      inputValue={inputValue}
      onInputChange={onInputChange}
      allowsCustomValue={allowsCustomValue}
      isDisabled={disabled}
      aria-label={ariaLabel || label}
      className={`flex flex-col gap-1.5 ${className}`.trim()}
    >
      {label && (
        <Label className="text-xs font-bold text-foreground">{label}</Label>
      )}
      <div className="relative flex items-center">
        <Input
          placeholder={placeholder}
          className="w-full pe-9 ps-3 py-2 text-xs sm:text-sm bg-layer border border-layer-line rounded-xl text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:ring-2 focus:ring-primary/35 focus:border-primary"
        />
        <Button
          aria-label="Toggle options"
          className="absolute end-1.5 p-1.5 rounded-lg text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover cursor-pointer"
        >
          <ChevronDown className="w-4 h-4" />
        </Button>
      </div>
      <Popover className="w-[--trigger-width] z-50 bg-layer border border-layer-line rounded-xl shadow-lg p-1 max-h-60 overflow-y-auto">
        <ListBox className="outline-none space-y-0.5">
          {(item: ComboBoxOption) => (
            <ListBoxItem
              key={item.id}
              id={item.id}
              textValue={item.label}
              className={({ isFocused, isSelected }) =>
                `px-3 py-2 rounded-lg text-xs cursor-pointer outline-none flex flex-col ${
                  isSelected
                    ? 'bg-primary text-primary-foreground font-bold'
                    : isFocused
                      ? 'bg-layer-hover text-foreground'
                      : 'text-foreground'
                }`
              }
            >
              <span>{item.label}</span>
              {item.description && (
                <span className="text-xs opacity-75">{item.description}</span>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaComboBox>
  );
};
