// =======================================================================
// PhysioRecord — Next-Gen Main Application Root Component
// Mounting Providers, ThemeProvider, Vault Lock Gate, and Clinical AppLayout
// =======================================================================

import React, { Suspense, lazy } from 'react';
import { I18nProvider } from 'react-aria-components';
import { VaultProvider, useVault } from './context/VaultContext';
import { PatientProvider } from './context/PatientContext';
import { EpisodeProvider } from './context/EpisodeContext';
import { SessionProvider } from './context/SessionContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { RefreshCw } from 'lucide-react';

const LockScreen = lazy(() =>
  import('./components/LockScreen').then((m) => ({ default: m.LockScreen }))
);
const AppLayout = lazy(() =>
  import('./components/layout/AppLayout').then((m) => ({ default: m.AppLayout }))
);

const AppContent: React.FC = () => {
  const { ready, isLocked } = useVault();
  const { language, isRtl, bi } = useLanguage();
  const locale = language === 'ar' ? 'ar-IQ' : language === 'ckb' ? 'ckb-IQ' : 'en-US';

  const loadingFallback = (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center text-slate-900 dark:text-white transition-colors"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <RefreshCw className="w-8 h-8 text-primary animate-spin mb-3" />
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
        {bi(
          'جاري فحص الخزينة المشفرة والتحقق من التخزين المحلي...',
          'Initializing local encrypted vault...'
        )}
      </p>
    </div>
  );

  // Still initializing IndexedDB vault metadata
  if (!ready) {
    return <I18nProvider locale={locale}>{loadingFallback}</I18nProvider>;
  }

  // Vault is locked -> Show Lock Screen; otherwise Main Next-Gen EHR Layout
  return (
    <I18nProvider locale={locale}>
      <Suspense fallback={loadingFallback}>
        {isLocked ? <LockScreen /> : <AppLayout />}
      </Suspense>
    </I18nProvider>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <CurrencyProvider>
          <VaultProvider>
            <PatientProvider>
              <EpisodeProvider>
                <SessionProvider>
                  <AppContent />
                </SessionProvider>
              </EpisodeProvider>
            </PatientProvider>
          </VaultProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
