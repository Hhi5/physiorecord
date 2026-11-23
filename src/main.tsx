import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';

// Disable Zod v4 JIT globally at entry so strict CSP (`script-src 'self'`) records zero `eval` violations.
z.config({ jitless: true });

// Self-hosted offline fonts (OFL-1.1 — zero external font CDN calls)
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-sans-arabic/300.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';

import './index.css';
import App from './App.tsx';
import { initPwaClient } from './pwa/pwaClient';
import { installNativeExternalLinkInterceptor } from './platform/nativeBridge';

initPwaClient();
installNativeExternalLinkInterceptor();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root mount element #root was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
