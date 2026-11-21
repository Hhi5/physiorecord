import { useEffect, useState } from 'react';
import {
  getDeviceFormFactor,
  type DeviceFormFactor,
} from '../platform/nativeBridge';
import type {
  BiometricUnavailableReason,
  BiometricUnlockMode,
} from '../crypto/webauthnPrf';

export function useDeviceFormFactor(): DeviceFormFactor {
  const [formFactor, setFormFactor] = useState<DeviceFormFactor>(() =>
    getDeviceFormFactor()
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      setFormFactor(getDeviceFormFactor());
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);

  return formFactor;
}

export interface TrilingualText {
  ar: string;
  en: string;
  ckb: string;
}

export interface LockScreenBiometricCopy {
  unlockButton: TrilingualText;
  unlockFailed: TrilingualText;
  forgotPasswordLink: TrilingualText;
  recoveryTab: TrilingualText;
  recoveryDescription: TrilingualText;
  recoverySubmit: TrilingualText;
}

export interface SecuritySettingsDeviceCopy {
  deviceProfileBadge: TrilingualText;
  autoLockScopeHint: TrilingualText;
  biometricTitle: TrilingualText;
  biometricDescription: TrilingualText;
  biometricEnableButton: TrilingualText;
  biometricResetPasswordButton: TrilingualText;
  biometricIframeBlockedError: TrilingualText;
  quickPinSummary: TrilingualText;
  quickPinTitle: TrilingualText;
  quickPinDescription: TrilingualText;
  passwordManagerNote: TrilingualText;
  passwordChangeBiometricTab: TrilingualText;
  passwordChangeBiometricSubmit: TrilingualText;
}

export function getLockScreenBiometricCopy(
  device: DeviceFormFactor,
  biometricMode: BiometricUnlockMode
): LockScreenBiometricCopy {
  if (device === 'desktop') {
    return {
      unlockButton: {
        ar: 'فتح بقفل الحاسوب / البصمة',
        en: 'Unlock with PC Lock / Biometrics',
        ckb: 'کردنەوە بە قفڵی کۆمپیوتەر / پەنجەمۆر',
      },
      unlockFailed: {
        ar: 'تعذر فتح القفل بقفل الحاسوب. استخدم كلمة المرور الرئيسية.',
        en: 'PC Lock unlock failed. Use your master password.',
        ckb: 'کردنەوە بە قفڵی کۆمپیوتەر سەرکەوتوو نەبوو. وشەی نهێنی سەرەکی بەکاربهێنە.',
      },
      forgotPasswordLink: {
        ar: 'استعادة بقفل الحاسوب أو مفتاح الطوارئ',
        en: 'Recover with PC Lock or Key',
        ckb: 'گەڕاندنەوە بە قفڵی کۆمپیوتەر یان کلیل',
      },
      recoveryTab: {
        ar: 'بقفل الحاسوب (سريع)',
        en: 'PC Lock (Fast)',
        ckb: 'بە قفڵی کۆمپیوتەر',
      },
      recoveryDescription: {
        ar: 'استخدم قفل الحاسوب (Windows Hello / رمز الويندوز / Touch ID) لتعيين كلمة مرور رئيسية جديدة فوراً دون فقدان أي سجل.',
        en: 'Use your computer lock (Windows Hello / PC PIN / Touch ID) to set a new master password immediately without losing any clinical record.',
        ckb: 'قفڵی کۆمپیوتەر (Windows Hello / Touch ID / PIN) بەکاربهێنە بۆ دانانی وشەی نهێنی نوێ بەبێ لەدەستدانی هیچ تۆمارێک.',
      },
      recoverySubmit: {
        ar: 'تحقق بقفل الحاسوب وتعيين كلمة المرور',
        en: 'Verify PC Lock & Reset Password',
        ckb: 'پشکنینی قفڵی کۆمپیوتەر و دانانی وشەی نهێنی',
      },
    };
  }

  if (device === 'tablet') {
    return {
      unlockButton:
        biometricMode === 'android-native'
          ? {
              ar: 'فتح ببصمة التابلت',
              en: 'Unlock with Tablet Fingerprint',
              ckb: 'کردنەوە بە پەنجەمۆری تابلێت',
            }
          : {
              ar: 'فتح ببصمة التابلت أو الوجه',
              en: 'Unlock with Tablet Biometrics',
              ckb: 'کردنەوە بە پەنجەمۆر یان ڕووخساری تابلێت',
            },
      unlockFailed: {
        ar: 'تعذر الفتح ببصمة التابلت. استخدم كلمة المرور الرئيسية.',
        en: 'Tablet biometric unlock failed. Use your master password.',
        ckb: 'کردنەوە بە پەنجەمۆری تابلێت سەرکەوتوو نەبوو. وشەی نهێنی سەرەکی بەکاربهێنە.',
      },
      forgotPasswordLink: {
        ar: 'استعادة ببصمة التابلت أو مفتاح الطوارئ',
        en: 'Recover with Tablet Biometrics or Key',
        ckb: 'گەڕاندنەوە بە پەنجەمۆری تابلێت یان کلیل',
      },
      recoveryTab: {
        ar: 'ببصمة التابلت (سريع)',
        en: 'Tablet Biometrics (Fast)',
        ckb: 'بە پەنجەمۆری تابلێت',
      },
      recoveryDescription: {
        ar: 'استخدم بصمة التابلت (بصمة الإصبع أو Face ID) لتعيين كلمة مرور رئيسية جديدة فوراً دون فقدان أي سجل.',
        en: 'Use your tablet biometrics (Fingerprint or Face ID) to set a new master password immediately without losing any clinical record.',
        ckb: 'پەنجەمۆر یان ڕووخساری تابلێتەکەت بەکاربهێنە بۆ دانانی وشەی نهێنی نوێ بەبێ لەدەستدانی هیچ تۆمارێک.',
      },
      recoverySubmit: {
        ar: 'تحقق ببصمة التابلت وتعيين كلمة المرور',
        en: 'Verify Tablet Biometrics & Reset Password',
        ckb: 'پشکنینی پەنجەمۆری تابلێت و دانانی وشەی نهێنی',
      },
    };
  }

  // Mobile phone
  return {
    unlockButton:
      biometricMode === 'android-native'
        ? {
            ar: 'فتح ببصمة الهاتف',
            en: 'Unlock with Phone Fingerprint',
            ckb: 'کردنەوە بە پەنجەمۆری مۆبایل',
          }
        : {
            ar: 'فتح ببصمة الهاتف أو الوجه',
            en: 'Unlock with Phone Biometrics',
            ckb: 'کردنەوە بە پەنجەمۆر یان ڕووخساری مۆبایل',
          },
    unlockFailed: {
      ar: 'تعذر الفتح ببصمة الهاتف. استخدم كلمة المرور الرئيسية.',
      en: 'Phone biometric unlock failed. Use your master password.',
      ckb: 'کردنەوە بە پەنجەمۆری مۆبایل سەرکەوتوو نەبوو. وشەی نهێنی سەرەکی بەکاربهێنە.',
    },
    forgotPasswordLink: {
      ar: 'استعادة ببصمة الهاتف أو مفتاح الطوارئ',
      en: 'Recover with Phone Biometrics or Key',
      ckb: 'گەڕاندنەوە بە پەنجەمۆری مۆبایل یان کلیل',
    },
    recoveryTab: {
      ar: 'ببصمة الهاتف (سريع)',
      en: 'Phone Biometrics (Fast)',
      ckb: 'بە پەنجەمۆری مۆبایل',
    },
    recoveryDescription: {
      ar: 'استخدم بصمة هاتفك (بصمة الإصبع أو الوجه) لتعيين كلمة مرور رئيسية جديدة فوراً دون فقدان أي سجل.',
      en: 'Use your phone biometrics (Fingerprint or Face ID) to set a new master password immediately without losing any clinical record.',
      ckb: 'پەنجەمۆر یان ڕووخساری مۆبایلەکەت بەکاربهێنە بۆ دانانی وشەی نهێنی نوێ بەبێ لەدەستدانی هیچ تۆمارێک.',
    },
    recoverySubmit: {
      ar: 'تحقق ببصمة الهاتف وتعيين كلمة المرور',
      en: 'Verify Phone Biometrics & Reset Password',
      ckb: 'پشکنینی پەنجەمۆری مۆبایل و دانانی وشەی نهێنی',
    },
  };
}

export function getSecuritySettingsCopy(params: {
  device: DeviceFormFactor;
  isPrfSupported: boolean;
  biometricMode: BiometricUnlockMode;
  unavailableReason: BiometricUnavailableReason;
  isElectronShell: boolean;
}): SecuritySettingsDeviceCopy {
  const { device, isPrfSupported, biometricMode, unavailableReason, isElectronShell } = params;

  if (device === 'desktop') {
    let biometricDescription: TrilingualText;
    if (isPrfSupported) {
      biometricDescription =
        biometricMode === 'desktop-os'
          ? {
              ar: 'يستخدم رمز/كلمة مرور الحاسوب أو البصمة عبر النظام مباشرة (Windows Hello / Touch ID) مع تشفير DPAPI المحلي لفتح الخزينة أو تغيير كلمة المرور عند النسيان.',
              en: 'Uses your computer lock credentials directly (Windows Hello PC PIN/password/biometrics or Touch ID) backed by OS DPAPI encryption.',
              ckb: 'ڕاستەوخۆ وشەی نهێنی یان کۆدی PINی کۆمپیوتەر (Windows Hello / Touch ID) بەکاردەهێنێت لەگەڵ کۆدکردنی ناوخۆیی DPAPI.',
            }
          : {
              ar: 'يتيح فتح الخزينة بسرعة وكذلك تعيين كلمة مرور جديدة عبر قفل الحاسوب أو البصمة (Windows Hello / Touch ID / Passkey)، مع بقاء مفتاح الطوارئ فعالاً دائماً.',
              en: 'Unlocks quickly and resets a forgotten password using your PC lock (Windows Hello / Touch ID / Passkey), while keeping your Recovery Key intact.',
              ckb: 'ڕێگەت پێدەدات خێرا بیکەیتەوە و وشەی نهێنی نوێ دابنێیت بە قفڵی کۆمپیوتەر یان پەنجەمۆر (Windows Hello / Touch ID / Passkey).',
            };
    } else if (unavailableReason === 'restricted-iframe') {
      biometricDescription = {
        ar: 'المتصفح يمنع طلب قفل الحاسوب (Windows Hello / Passkey) داخل نافذة المعاينة المضمّنة. افتح التطبيق في تبويب متصفح مستقل لتفعيل الفتح بقفل الحاسوب مباشرة.',
        en: 'Your browser blocks PC Device Lock (Windows Hello / Passkeys) inside embedded preview frames. Open the app in a standalone browser tab to enable PC PIN/password unlock.',
        ckb: 'وێبگەڕ ڕێگە بە قفڵی کۆمپیوتەر (Windows Hello / Passkey) نادات لە ناو پەنجەرەی هاوپێچکراو. ئەپەکە لە تابێکی سەربەخۆدا بکەرەوە.',
      };
    } else if (unavailableReason === 'not-enrolled-os') {
      biometricDescription = isElectronShell
        ? {
            ar: 'لم يتم إعداد قفل الحاسوب (Windows Hello / رمز الويندوز) في إعدادات ويندوز بعد. فعّله من إعدادات الحساب في ويندوز ثم عد إلى هنا.',
            en: 'Windows Hello (PC PIN / biometrics) is not configured in Windows Settings yet. Set it up in Windows Accounts -> Sign-in options first.',
            ckb: 'هێشتا قفڵی کۆمپیوتەر (Windows Hello / PIN) لە ڕێکخستنەکانی ویندۆزدا دانەنراوە.',
          }
        : {
            ar: 'لم يتم إعداد قفل النظام أو البصمة على هذا الحاسوب بعد. فعّل Windows Hello أو Touch ID من إعدادات النظام أولاً ثم عد إلى هنا.',
            en: 'No PC PIN or biometric sign-in is configured on this computer yet. Set up Windows Hello or Touch ID in system settings first.',
            ckb: 'هێشتا هیچ قفڵی کۆمپیوتەر یان پەنجەمۆرێک لەسەر ئەم کۆمپیوتەرە دانەنراوە.',
          };
    } else if (unavailableReason === 'no-hardware') {
      biometricDescription = {
        ar: 'لا يتوفر قفل نظام مدعوم (Windows Hello / مستشعر بصمة) على هذا الحاسوب حالياً — يمكنك استخدام رمز PIN السريع للحاسوب بالأسفل.',
        en: 'No compatible OS lock or biometric hardware was detected on this computer — you can use the PC Quick PIN option below.',
        ckb: 'هیچ قفڵی سیستەم یان هەستەوەری پەنجەمۆر لەسەر ئەم کۆمپیوتەرە بەردەست نییە.',
      };
    } else {
      biometricDescription = {
        ar: 'هذا المتصفح لا يدعم مفتاح مرور النظام (WebAuthn Passkey). جرّب Chrome أو Edge في تبويب مستقل أو استخدم تطبيق الحاسوب (.exe).',
        en: 'This browser does not support WebAuthn Platform Passkeys. Try Chrome or Edge in a standalone tab or use the Windows Desktop app (.exe).',
        ckb: 'ئەم وێبگەڕە پشتگیری WebAuthn Passkey ناکات. لە Chrome یان Edge بە سەربەخۆیی بیکەرەوە یان ئەپی کۆمپیوتەر (.exe) بەکاربهێنە.',
      };
    }

    return {
      deviceProfileBadge: {
        ar: 'إعدادات الحاسوب (محلية لهذا الجهاز)',
        en: 'PC Settings (Local to this computer)',
        ckb: 'ڕێکخستنەکانی کۆمپیوتەر (ناوخۆیی)',
      },
      autoLockScopeHint: {
        ar: 'يُحفظ مؤقت القفل التلقائي محلياً لهذا الحاسوب فقط دون التأثير على الهاتف أو التابلت (ويمكنك القفل فوراً عبر Ctrl+L).',
        en: 'This timer is saved locally for this PC only without affecting your phone or tablet (press Ctrl+L to lock anytime).',
        ckb: 'ئەم کاتژمێرە تەنها بۆ ئەم کۆمپیوتەرە بە ناوخۆیی پاشەکەوت دەکرێت.',
      },
      biometricTitle: {
        ar: 'قفل الحاسوب والنظام (Windows Hello / Touch ID / رمز الويندوز)',
        en: 'PC & OS Lock (Windows Hello / Touch ID / PC PIN)',
        ckb: 'قفڵی کۆمپیوتەر و سیستەم (Windows Hello / Touch ID)',
      },
      biometricDescription,
      biometricEnableButton: {
        ar: 'تفعيل قفل الحاسوب / البصمة',
        en: 'Enable PC Lock',
        ckb: 'چالاککردنی قفڵی کۆمپیوتەر',
      },
      biometricResetPasswordButton: {
        ar: 'تعيين كلمة مرور بقفل الحاسوب',
        en: 'Reset Password via PC Lock',
        ckb: 'دانانی وشەی نهێنی بە قفڵی کۆمپیوتەر',
      },
      biometricIframeBlockedError: {
        ar: 'المتصفح يحجب طلب قفل الحاسوب (Windows Hello / Passkey) داخل نافذة المعاينة المضمّنة. افتح التطبيق في تبويب متصفح مستقل أو استخدم تطبيق الحاسوب (.exe).',
        en: 'Your browser blocks PC Device Lock (Windows Hello / Passkey) inside embedded preview frames. Open the app in a standalone tab or use the Desktop app.',
        ckb: 'وێبگەڕ ڕێگە بە قفڵی کۆمپیوتەر نادات لە ناو پەنجەرەی هاوپێچکراودا. ئەپەکە لە تابێکی سەربەخۆ بکەرەوە.',
      },
      quickPinSummary: {
        ar: 'بديل سريع للحاسوب: رمز PIN داخل التطبيق',
        en: 'PC Quick Alternative: In-App Quick PIN',
        ckb: 'جێگرەوەی خێرا بۆ کۆمپیوتەر: کۆدی PIN',
      },
      quickPinTitle: {
        ar: 'الفتح السريع برمز PIN (للحاسوب والمتصفحات)',
        en: 'Quick PIN Unlock (PC & Desktop Browser)',
        ckb: 'کردنەوەی خێرا بە کۆدی PIN (بۆ کۆمپیوتەر)',
      },
      quickPinDescription: {
        ar: 'بديل عملي على الحاسوب عندما لا تتوفر بصمة أو Windows Hello: افتح الخزينة برمز رقمي سريع عبر لوحة المفاتيح (4–12 رقماً)، مع تعطيله تلقائياً بعد 5 محاولات خاطئة وبقاء كلمة المرور الرئيسية كما هي.',
        en: 'Ideal for PCs & desktop browsers without biometrics: unlock your vault quickly from the keyboard with a numeric PIN (4–12 digits). Automatically disables after 5 failed attempts; your master password remains unchanged.',
        ckb: 'جێگرەوەی گونجاوە لەسەر کۆمپیوتەر کاتێک پەنجەمۆر بەردەست نەبێت: خەزێنە بە کۆدێکی ژمارەیی (٤–١٢ ژمارە) بکەرەوە.',
      },
      passwordManagerNote: {
        ar: 'يدعم الحفظ التلقائي في مدير كلمات مرور المتصفح على الحاسوب (Chrome / Edge / Safari / iCloud Keychain) محلياً دون أي خوادم.',
        en: 'Supports desktop browser password saving (Chrome / Edge / Safari / iCloud Keychain) locally with zero external servers.',
        ckb: 'پشتگیری پاشەکەوتکردنی خۆکار لە بەڕێوەبەری وشە نهێنییەکانی وێبگەڕی کۆمپیوتەر دەکات.',
      },
      passwordChangeBiometricTab: {
        ar: 'بقفل الحاسوب (بدون القديمة)',
        en: 'Via PC Lock (No Old PW)',
        ckb: 'بە قفڵی کۆمپیوتەر',
      },
      passwordChangeBiometricSubmit: {
        ar: 'تحقق بقفل الحاسوب وحفظ كلمة المرور',
        en: 'Verify PC Lock & Save',
        ckb: 'پشکنینی قفڵی کۆمپیوتەر و پاشەکەوت',
      },
    };
  }

  const isTablet = device === 'tablet';

  let biometricDescription: TrilingualText;
  if (isPrfSupported) {
    if (biometricMode === 'android-native') {
      biometricDescription = isTablet
        ? {
            ar: 'يستخدم بصمة الإصبع ومخزن المفاتيح الآمن في التابلت (Android Keystore) لفتح الخزينة بلمسة واحدة أو تعيين كلمة مرور جديدة عند النسيان.',
            en: 'Uses native tablet Fingerprint & Android Keystore to unlock quickly or reset a forgotten password without losing records.',
            ckb: 'پەنجەمۆری تابلێت و Android Keystore بەکاردەهێنێت بۆ کردنەوەی خێرا یان گۆڕینی وشەی نهێنی لە کاتی لەبیرچوونەوەدا.',
          }
        : {
            ar: 'يستخدم بصمة الإصبع ومخزن المفاتيح الآمن في هاتفك (Android Keystore) لفتح الخزينة بلمسة واحدة أو تعيين كلمة مرور جديدة عند النسيان.',
            en: 'Uses native phone Fingerprint & Android Keystore to unlock quickly or reset a forgotten password without losing records.',
            ckb: 'پەنجەمۆری مۆبایل و Android Keystore بەکاردەهێنێت بۆ کردنەوەی خێرا یان گۆڕینی وشەی نهێنی لە کاتی لەبیرچوونەوەدا.',
          };
    } else {
      biometricDescription = isTablet
        ? {
            ar: 'يتيح فتح الخزينة بلمسة وتعيين كلمة مرور جديدة عبر بصمة التابلت أو Face ID (Passkey)، مع بقاء مفتاح الطوارئ فعالاً دائماً.',
            en: 'Unlocks with a tap and resets a forgotten password using Tablet Fingerprint or Face ID (Passkey), while keeping your Recovery Key intact.',
            ckb: 'ڕێگەت پێدەدات خێرا بیکەیتەوە و وشەی نهێنی نوێ دابنێیت بە پەنجەمۆری تابلێت یان Face ID.',
          }
        : {
            ar: 'يتيح فتح الخزينة بلمسة وتعيين كلمة مرور جديدة عبر بصمة الهاتف أو الوجه (Fingerprint / Face ID / Passkey)، مع بقاء مفتاح الطوارئ فعالاً دائماً.',
            en: 'Unlocks with a tap and resets a forgotten password using Phone Fingerprint or Face ID (Passkey), while keeping your Recovery Key intact.',
            ckb: 'ڕێگەت پێدەدات خێرا بیکەیتەوە و وشەی نهێنی نوێ دابنێیت بە پەنجەمۆر یان ڕووخساری مۆبایل.',
          };
    }
  } else if (unavailableReason === 'restricted-iframe') {
    biometricDescription = isTablet
      ? {
          ar: 'المتصفح يمنع طلب بصمة التابلت داخل نافذة المعاينة المضمّنة. افتح التطبيق في تبويب متصفح مستقل أو ثبّته على التابلت لتفعيل البصمة.',
          en: 'Your browser blocks tablet biometrics inside embedded preview frames. Open the app in a standalone tab or install it to enable biometrics.',
          ckb: 'وێبگەڕ ڕێگە بە پەنجەمۆری تابلێت نادات لە ناو پەنجەرەی هاوپێچکراودا. ئەپەکە لە تابێکی سەربەخۆ بکەرەوە.',
        }
      : {
          ar: 'المتصفح يمنع طلب بصمة الهاتف داخل نافذة المعاينة المضمّنة. افتح التطبيق في تبويب متصفح مستقل أو استخدم تطبيق الأندرويد لتفعيل البصمة.',
          en: 'Your browser blocks phone biometrics inside embedded preview frames. Open the app in a standalone tab or use the Android app to enable biometrics.',
          ckb: 'وێبگەڕ ڕێگە بە پەنجەمۆری مۆبایل نادات لە ناو پەنجەرەی هاوپێچکراودا. ئەپەکە لە تابێکی سەربەخۆ بکەرەوە.',
        };
  } else if (unavailableReason === 'not-enrolled-os') {
    biometricDescription = isTablet
      ? {
          ar: 'لم يتم تسجيل بصمة إصبع في نظام التابلت بعد. أضف بصمة من إعدادات الأمان في التابلت أولاً ثم عد إلى هنا لتفعيلها.',
          en: 'No fingerprint is enrolled on this tablet yet. Add a fingerprint in Tablet Settings first, then return here to enable it.',
          ckb: 'هێشتا هیچ پەنجەمۆرێک لەسەر تابلێتەکە تۆمار نەکراوە. سەرەتا لە ڕێکخستنەکانی تابلێت پەنجەمۆر زیاد بکە.',
        }
      : {
          ar: 'لم يتم تسجيل بصمة إصبع في نظام الهاتف بعد. أضف بصمة من إعدادات الأمان في الهاتف أولاً ثم عد إلى هنا لتفعيلها.',
          en: 'No fingerprint is enrolled on this phone yet. Add a fingerprint in Phone Settings first, then return here to enable it.',
          ckb: 'هێشتا هیچ پەنجەمۆرێک لەسەر مۆبایلەکە تۆمار نەکراوە. سەرەتا لە ڕێکخستنەکانی مۆبایل پەنجەمۆر زیاد بکە.',
        };
  } else if (unavailableReason === 'no-hardware') {
    biometricDescription = isTablet
      ? {
          ar: 'لا يتوفر مستشعر بصمة مدعوم على هذا التابلت حالياً — يمكنك استخدام رمز PIN السريع بالأسفل.',
          en: 'No compatible biometric sensor was detected on this tablet — you can use the Quick PIN option below.',
          ckb: 'هیچ هەستەوەری پەنجەمۆر لەسەر ئەم تابلێتە بەردەست نییە.',
        }
      : {
          ar: 'لا يتوفر مستشعر بصمة مدعوم على هذا الهاتف حالياً — يمكنك استخدام رمز PIN السريع بالأسفل.',
          en: 'No compatible biometric sensor was detected on this phone — you can use the Quick PIN option below.',
          ckb: 'هیچ هەستەوەری پەنجەمۆر لەسەر ئەم مۆبایلە بەردەست نییە.',
        };
  } else {
    biometricDescription = isTablet
      ? {
          ar: 'هذا المتصفح على التابلت لا يدعم مفتاح المرور الحيوي (WebAuthn Passkey). جرّب Safari أو Chrome في تبويب مستقل أو رمز PIN السريع بالأسفل.',
          en: 'This tablet browser does not support WebAuthn Platform Passkeys. Try Safari or Chrome in a standalone tab or use Quick PIN below.',
          ckb: 'ئەم وێبگەڕە لەسەر تابلێت پشتگیری WebAuthn Passkey ناکات. Safari یان Chrome بە سەربەخۆیی بەکاربهێنە یان کۆدی PIN.',
        }
      : {
          ar: 'هذا المتصفح على الهاتف لا يدعم مفتاح المرور الحيوي (WebAuthn Passkey). جرّب Chrome أو Safari في تبويب مستقل، أو تطبيق الأندرويد (.apk)، أو رمز PIN السريع بالأسفل.',
          en: 'This mobile browser does not support WebAuthn Platform Passkeys. Try Chrome or Safari in a standalone tab, the Android app (.apk), or Quick PIN below.',
          ckb: 'ئەم وێبگەڕە لەسەر مۆبایل پشتگیری WebAuthn Passkey ناکات. Chrome یان Safari بە سەربەخۆیی بەکاربهێنە یان کۆدی PIN.',
        };
  }

  return {
    deviceProfileBadge: isTablet
      ? {
          ar: 'إعدادات التابلت (محلية لهذا الجهاز)',
          en: 'Tablet Settings (Local to this tablet)',
          ckb: 'ڕێکخستنەکانی تابلێت (ناوخۆیی)',
        }
      : {
          ar: 'إعدادات الهاتف (محلية لهذا الجهاز)',
          en: 'Phone Settings (Local to this phone)',
          ckb: 'ڕێکخستنەکانی مۆبایل (ناوخۆیی)',
        },
    autoLockScopeHint: isTablet
      ? {
          ar: 'يُحفظ مؤقت القفل التلقائي محلياً على هذا التابلت فقط دون التأثير على الحاسوب أو الهاتف.',
          en: 'This timer is saved locally for this tablet only without affecting your PC or phone.',
          ckb: 'ئەم کاتژمێرە تەنها بۆ ئەم تابلێتە بە ناوخۆیی پاشەکەوت دەکرێت.',
        }
      : {
          ar: 'يُحفظ مؤقت القفل التلقائي محلياً على هذا الهاتف فقط دون التأثير على الحاسوب أو التابلت.',
          en: 'This timer is saved locally for this phone only without affecting your PC or tablet.',
          ckb: 'ئەم کاتژمێرە تەنها بۆ ئەم مۆبایلە بە ناوخۆیی پاشەکەوت دەکرێت.',
        },
    biometricTitle: isTablet
      ? {
          ar: 'بصمة التابلت وقفل الشاشة (بصمة الإصبع / Face ID)',
          en: 'Tablet Biometrics (Fingerprint / Face ID)',
          ckb: 'پەنجەمۆری تابلێت و قفڵی شاشە (پەنجەمۆر / Face ID)',
        }
      : {
          ar: 'بصمة الهاتف وقفل الشاشة (بصمة الإصبع / الوجه)',
          en: 'Phone Biometrics (Fingerprint / Face ID)',
          ckb: 'پەنجەمۆری مۆبایل و قفڵی شاشە (پەنجەمۆر / ڕووخسار)',
        },
    biometricDescription,
    biometricEnableButton: isTablet
      ? {
          ar: 'تفعيل بصمة التابلت',
          en: 'Enable Tablet Biometrics',
          ckb: 'چالاککردنی پەنجەمۆری تابلێت',
        }
      : {
          ar: 'تفعيل بصمة الهاتف',
          en: 'Enable Phone Biometrics',
          ckb: 'چالاککردنی پەنجەمۆری مۆبایل',
        },
    biometricResetPasswordButton: isTablet
      ? {
          ar: 'تعيين كلمة مرور ببصمة التابلت',
          en: 'Reset Password via Tablet Biometrics',
          ckb: 'دانانی وشەی نهێنی بە پەنجەمۆری تابلێت',
        }
      : {
          ar: 'تعيين كلمة مرور ببصمة الهاتف',
          en: 'Reset Password via Phone Biometrics',
          ckb: 'دانانی وشەی نهێنی بە پەنجەمۆری مۆبایل',
        },
    biometricIframeBlockedError: isTablet
      ? {
          ar: 'المتصفح يحجب نافذة البصمة داخل صفحة المعاينة المضمّنة. افتح التطبيق في تبويب مستقل على التابلت.',
          en: 'Your browser blocks tablet biometrics inside embedded preview frames. Open the app in a standalone tab.',
          ckb: 'وێبگەڕ ڕێگە بە پەنجەمۆر نادات لە ناو پەنجەرەی هاوپێچکراودا. ئەپەکە لە تابێکی سەربەخۆ بکەرەوە.',
        }
      : {
          ar: 'المتصفح يحجب نافذة البصمة داخل صفحة المعاينة المضمّنة. افتح التطبيق في تبويب مستقل أو استخدم تطبيق الأندرويد.',
          en: 'Your browser blocks phone biometrics inside embedded preview frames. Open the app in a standalone tab or use the Android app.',
          ckb: 'وێبگەڕ ڕێگە بە پەنجەمۆر نادات لە ناو پەنجەرەی هاوپێچکراودا. ئەپەکە لە تابێکی سەربەخۆ بکەرەوە.',
        },
    quickPinSummary: {
      ar: 'بديل يدوي اختياري: رمز PIN داخل التطبيق',
      en: 'Optional Fallback: In-App Quick PIN',
      ckb: 'بژاردەی لاوەکی: کۆدی PINی ناوخۆیی',
    },
    quickPinTitle: isTablet
      ? {
          ar: 'الفتح السريع برمز PIN (بديل بصمة التابلت)',
          en: 'Quick PIN Unlock (Tablet Fallback)',
          ckb: 'کردنەوەی خێرا بە کۆدی PIN (بۆ تابلێت)',
        }
      : {
          ar: 'الفتح السريع برمز PIN (بديل بصمة الهاتف)',
          en: 'Quick PIN Unlock (Phone Fallback)',
          ckb: 'کردنەوەی خێرا بە کۆدی PIN (بۆ مۆبایل)',
        },
    quickPinDescription: isTablet
      ? {
          ar: 'خيار احتياطي بجانب البصمة على التابلت: افتح الخزينة برمز رقمي سريع (4–12 رقماً)، مع تعطيله تلقائياً بعد 5 محاولات خاطئة وبقاء كلمة المرور الرئيسية كما هي.',
          en: 'Optional backup alongside tablet biometrics: unlock your vault with a fast numeric PIN (4–12 digits). Automatically disables after 5 failed attempts; your master password remains unchanged.',
          ckb: 'بژاردەی یەدەگ لە تەنیشت پەنجەمۆر لەسەر تابلێت: خەزێنە بە کۆدێکی ژمارەیی (٤–١٢ ژمارە) بکەرەوە.',
        }
      : {
          ar: 'خيار احتياطي بجانب البصمة على الهاتف: افتح الخزينة برمز رقمي سريع (4–12 رقماً)، مع تعطيله تلقائياً بعد 5 محاولات خاطئة وبقاء كلمة المرور الرئيسية كما هي.',
          en: 'Optional backup alongside phone biometrics: unlock your vault with a fast numeric PIN (4–12 digits). Automatically disables after 5 failed attempts; your master password remains unchanged.',
          ckb: 'بژاردەی یەدەگ لە تەنیشت پەنجەمۆر لەسەر مۆبایل: خەزێنە بە کۆدێکی ژمارەیی (٤–١٢ ژمارە) بکەرەوە.',
        },
    passwordManagerNote: {
      ar: 'يدعم الحفظ التلقائي في مدير كلمات مرور الهاتف والتابلت (Google Password Manager / iCloud Keychain) محلياً دون أي خوادم.',
      en: 'Supports mobile/tablet OS password manager saving (Google Password Manager / iCloud Keychain) locally with zero external servers.',
      ckb: 'پشتگیری پاشەکەوتکردنی خۆکار لە بەڕێوەبەری وشە نهێنییەکانی مۆبایل و تابلێت (Google / iCloud) دەکات.',
    },
    passwordChangeBiometricTab: {
      ar: 'بالبصمة (بدون القديمة)',
      en: 'Via Biometrics (No Old PW)',
      ckb: 'بە پەنجەمۆر',
    },
    passwordChangeBiometricSubmit: {
      ar: 'تحقق بالبصمة وحفظ كلمة المرور',
      en: 'Verify Biometrics & Save',
      ckb: 'پشکنینی پەنجەمۆر و پاشەکەوت',
    },
  };
}
