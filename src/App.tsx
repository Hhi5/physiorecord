// =======================================================================
// PhysioRecord — Next-Gen Main Application Root Component
// Mounting Providers, ThemeProvider, Vault Lock Gate, and Clinical AppLayout
// =======================================================================

import React, { Suspense, lazy, useMemo, useState } from 'react';
import { I18nProvider } from 'react-aria-components';
import { VaultProvider, useVault } from './context/VaultContext';
import { PatientProvider } from './context/PatientContext';
import { EpisodeProvider } from './context/EpisodeContext';
import { SessionProvider } from './context/SessionContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { RefreshCw } from 'lucide-react';
import { triggerPwaInstallPrompt, usePwaStatus } from './pwa/pwaClient';
import { isNativeAppShell } from './platform/nativeBridge';
import { resolvePlatformAccessGate } from './pwa/platformAccessGate';

const LockScreen = lazy(() =>
  import('./components/auth/LockScreen').then((m) => ({ default: m.LockScreen }))
);
const AppLayout = lazy(() =>
  import('./components/layout/AppLayout').then((m) => ({ default: m.AppLayout }))
);
const PlatformAccessGateScreen = lazy(() =>
  import('./components/auth/PlatformAccessGateScreen').then((m) => ({
    default: m.PlatformAccessGateScreen,
  }))
);

const AppContent: React.FC = () => {
  const { ready, isInitialized, isLocked } = useVault();
  const { language, isRtl, bi } = useLanguage();
  const pwa = usePwaStatus();
  const [allowExistingVaultRescue, setAllowExistingVaultRescue] = useState(false);
  const locale = language === 'ar' ? 'ar-IQ' : language === 'ckb' ? 'ckb-IQ' : 'en-US';

  const platformGate = useMemo(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return {
        mode: 'allow' as const,
        desktopOs: 'other' as const,
        isMacSafari: false,
        isDevOrPreviewHost: true,
      };
    }
    return resolvePlatformAccessGate({
      hostname: window.location.hostname || '',
      protocol: window.location.protocol || '',
      search: window.location.search || '',
      userAgent: navigator.userAgent || '',
      maxTouchPoints: typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0,
      isStandalone: pwa.isStandalone,
      isNativeShell: isNativeAppShell(),
    });
  }, [pwa.isStandalone]);

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

  // Enforce hosted-web platform access & iOS/macOS standalone install gate
  if (platformGate.mode !== 'allow' && !(isInitialized && allowExistingVaultRescue)) {
    return (
      <I18nProvider locale={locale}>
        <Suspense fallback={loadingFallback}>
          <PlatformAccessGateScreen
            mode={platformGate.mode}
            desktopOs={platformGate.desktopOs}
            isMacSafari={platformGate.isMacSafari}
            canInstallPrompt={pwa.canInstallPrompt}
            onTriggerInstallPrompt={() => {
              void triggerPwaInstallPrompt();
            }}
            hasExistingVault={isInitialized}
            onAllowExistingVaultBackup={() => setAllowExistingVaultRescue(true)}
          />
        </Suspense>
      </I18nProvider>
    );
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
