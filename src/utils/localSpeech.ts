// =======================================================================
// PhysioRecord — Strict Local-Only Voice Dictation Guard (5.5)
// Enforces Web Speech API `processLocally: true`.
// If no on-device model is available, returns mode='hidden' so dictation is
// hidden cleanly. Cloud speech is NEVER used unless explicitly opted-in.
// =======================================================================

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0?: { transcript?: string };
  }>;
}

export interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionLike;
  available?: (options: {
    langs: string[];
    processLocally?: boolean;
  }) => Promise<'available' | 'downloading' | 'downloadable' | 'unavailable'>;
}

export type DictationAvailabilityMode = 'local_ready' | 'cloud_opt_in' | 'hidden';

export interface DictationCapabilityStatus {
  mode: DictationAvailabilityMode;
  onDeviceSupported: boolean;
  onDeviceState: 'available' | 'downloading' | 'downloadable' | 'unavailable';
  browserHasSpeechApi: boolean;
  reasonAr: string;
  reasonEn: string;
}

function getSpeechConstructor(): SpeechRecognitionConstructorLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | SpeechRecognitionConstructorLike
    | undefined;
  return typeof ctor === 'function' ? ctor : null;
}

/**
 * Inspect whether on-device speech recognition (`processLocally: true`) is available
 * for the requested clinical dictation language.
 * NEVER falls back to cloud Web Speech unless `allowCloudFallbackOptIn === true`.
 */
export async function detectSpeechDictationSupport(
  langTag: string,
  allowCloudFallbackOptIn = false
): Promise<DictationCapabilityStatus> {
  const ctor = getSpeechConstructor();
  if (!ctor) {
    return {
      mode: 'hidden',
      onDeviceSupported: false,
      onDeviceState: 'unavailable',
      browserHasSpeechApi: false,
      reasonAr: 'المتصفح الحالي لا يدعم واجهة التعرف الصوتي (Web Speech API).',
      reasonEn: 'Current browser does not expose the Web Speech API.',
    };
  }

  // Standard Chrome / Web Speech on-device check requires static `available({ langs, processLocally: true })`
  // or explicit prototype property `processLocally`. Without this API, browsers send audio to cloud servers.
  // CRITICAL: In Chromium 130+ / Android System WebView / Electron, the native C++ Blink binding
  // `webkitSpeechRecognition.available()` segfaults the renderer process (SIGSEGV) when SODA Mojo is unbound.
  // Only invoke `ctor.available` when it is a non-native JS implementation/mock or explicitly safe.
  let onDeviceState: 'available' | 'downloading' | 'downloadable' | 'unavailable' = 'unavailable';
  const availableFn = typeof ctor.available === 'function' ? ctor.available : null;
  const hasAvailableFn = availableFn !== null;
  const isNativeBlinkStub =
    hasAvailableFn &&
    Function.prototype.toString.call(availableFn).includes('[native code]');
  const hasProcessLocallyProp =
    'processLocally' in (ctor.prototype || {}) ||
    (hasAvailableFn && !isNativeBlinkStub);

  if (availableFn && !isNativeBlinkStub) {
    try {
      onDeviceState = await availableFn.call(ctor, {
        langs: [langTag],
        processLocally: true,
      });
    } catch {
      onDeviceState = 'unavailable';
    }
  }

  const onDeviceReady =
    hasProcessLocallyProp &&
    (onDeviceState === 'available' || onDeviceState === 'downloading');

  if (onDeviceReady) {
    return {
      mode: 'local_ready',
      onDeviceSupported: true,
      onDeviceState,
      browserHasSpeechApi: true,
      reasonAr: 'نموذج التعرف الصوتي المحلي داخل الجهاز جاهز ويعمل بدون اتصال.',
      reasonEn: 'On-device speech model ready (`processLocally: true`).',
    };
  }

  if (allowCloudFallbackOptIn) {
    return {
      mode: 'cloud_opt_in',
      onDeviceSupported: false,
      onDeviceState,
      browserHasSpeechApi: true,
      reasonAr: 'تنبيه خصوصية: تم تفعيل وضع السحابة الاختياري لعدم توفر نموذج محلي.',
      reasonEn: 'Privacy notice: explicit cloud opt-in active because local model is unavailable.',
    };
  }

  return {
    mode: 'hidden',
    onDeviceSupported: false,
    onDeviceState,
    browserHasSpeechApi: true,
    reasonAr:
      'تم إخفاء الإملاء الصوتي تلقائياً لعدم توفر نموذج تعرّف محلي على هذا الجهاز (processLocally: true غير متاح).',
    reasonEn:
      'Voice dictation hidden automatically because on-device speech (`processLocally: true`) is unavailable.',
  };
}

export function createLocalSpeechSession(params: {
  langTag: string;
  requireLocalOnly: boolean;
  onTranscriptChunk: (text: string, isFinal: boolean) => void;
  onError: (code: string) => void;
  onEnd: () => void;
}): SpeechRecognitionLike {
  const Ctor = getSpeechConstructor();
  if (!Ctor) {
    throw new Error('SpeechRecognition unavailable');
  }

  const rec = new Ctor();
  rec.lang = params.langTag;
  rec.continuous = true;
  rec.interimResults = true;
  if (params.requireLocalOnly) {
    rec.processLocally = true;
  }

  rec.onresult = (event) => {
    let finalChunk = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const text = res?.[0]?.transcript || '';
      if (res.isFinal && text.trim()) {
        finalChunk += `${text.trim()} `;
      }
    }
    if (finalChunk.trim()) {
      params.onTranscriptChunk(finalChunk.trim(), true);
    }
  };

  rec.onerror = (evt) => {
    params.onError(evt?.error || 'speech_error');
  };

  rec.onend = () => {
    params.onEnd();
  };

  rec.start();
  return rec;
}
