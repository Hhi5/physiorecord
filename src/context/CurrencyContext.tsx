// =======================================================================
// PhysioRecord — Currency Context (App-Wide Currency Configuration)
// Supports Changing Primary Currency from Settings with Persistence
// =======================================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  CurrencyConfig,
  DEFAULT_CURRENCY_CODE,
  getCurrencyConfig,
  WORLD_CURRENCIES,
} from '../utils/currencies';

interface CurrencyContextType {
  currency: CurrencyConfig;
  setCurrencyCode: (code: string) => void;
  availableCurrencies: CurrencyConfig[];
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const CURRENCY_STORAGE_KEY = 'physiorecord_primary_currency_code';

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currencyCode, setCurrencyCodeState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (saved && WORLD_CURRENCIES.some((c) => c.code === saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return DEFAULT_CURRENCY_CODE;
  });

  const currency = getCurrencyConfig(currencyCode);

  const setCurrencyCode = (code: string) => {
    const validConfig = getCurrencyConfig(code);
    setCurrencyCodeState(validConfig.code);
    try {
      localStorage.setItem(CURRENCY_STORAGE_KEY, validConfig.code);
      window.dispatchEvent(
        new CustomEvent('physiorecord-currency-changed', {
          detail: { code: validConfig.code },
        })
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CURRENCY_STORAGE_KEY && e.newValue) {
        setCurrencyCodeState(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrencyCode,
        availableCurrencies: WORLD_CURRENCIES,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
