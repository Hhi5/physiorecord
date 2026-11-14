import { describe, expect, it } from 'vitest';
import {
  LOCALE_CATALOGS,
  LANGUAGE_METADATA,
  LANGUAGE_ORDER,
  LANGUAGE_SWITCHER_OPTIONS,
  getNextLanguage,
  resolveBiText,
} from '../../context/LanguageContext';
import { CKB_DICTIONARY, translateToKurdish } from '../ckbDictionary';
import { formatClinicalDate, formatTimeIraq, formatWeekdaysSummary } from '../../utils/date';
import { isRtlLanguage, getIntlLocaleTag } from '../../utils/i18nFormat';

describe('Kurdish Sorani (ckb) localization', () => {
  it('maintains 100% key parity across ar, en, and ckb JSON catalogs with non-empty strings', () => {
    const arKeys = Object.keys(LOCALE_CATALOGS.ar).sort();
    const enKeys = Object.keys(LOCALE_CATALOGS.en).sort();
    const ckbKeys = Object.keys(LOCALE_CATALOGS.ckb).sort();

    expect(ckbKeys).toEqual(arKeys);
    expect(enKeys).toEqual(arKeys);
    for (const key of arKeys) {
      expect(LOCALE_CATALOGS.ckb[key].trim().length).toBeGreaterThan(0);
    }
  });

  it('provides Sorani RTL metadata and 3-way language cycling ar -> ckb -> en -> ar', () => {
    expect(LANGUAGE_METADATA.ckb.dir).toBe('rtl');
    expect(isRtlLanguage('ckb')).toBe(true);
    expect(getIntlLocaleTag('ckb')).toBe('ckb-IQ-u-ca-gregory-nu-latn');
    expect(LANGUAGE_ORDER).toEqual(['ar', 'ckb', 'en']);
    expect(LANGUAGE_SWITCHER_OPTIONS.map((o) => o.code)).toEqual(['ar', 'ckb', 'en']);

    expect(getNextLanguage('ar')).toBe('ckb');
    expect(getNextLanguage('ckb')).toBe('en');
    expect(getNextLanguage('en')).toBe('ar');
  });

  it('resolves ckb dictionary translations and falls back to Arabic (never English) when unmapped', () => {
    expect(Object.keys(CKB_DICTIONARY).length).toBeGreaterThanOrEqual(150);
    expect(translateToKurdish('المرضى')).toBe('نەخۆشەکان');
    expect(translateToKurdish('المثبتون:')).toBe('جێگیرکراوەکان:');
    expect(translateToKurdish('+ حجز مريض آخر في نفس الوقت')).toBe(
      '+ دانانی نەخۆشێکی تر لە هەمان کاتدا'
    );

    expect(resolveBiText('ckb', 'المواعيد', 'Schedule')).toBe('کاتەکان');
    expect(resolveBiText('ckb', 'تسمية سريرية خاصة', 'Custom Clinical Label')).toBe(
      'تسمية سريرية خاصة'
    );
    expect(
      resolveBiText('ckb', 'المرضى', 'Patients', 'ناونیشانی تایبەتی کوردی')
    ).toBe('ناونیشانی تایبەتی کوردی');
    expect(resolveBiText('en', 'المرضى', 'Patients')).toBe('Patients');
    expect(resolveBiText('ar', 'المرضى', 'Patients')).toBe('المرضى');
  });

  it('formats dates, weekdays, and Iraqi time cleanly in ckb using Gregorian dates and Latin digits', () => {
    const formattedDate = formatClinicalDate('2026-03-15', 'ckb');
    expect(formattedDate).toContain('15');
    expect(formattedDate).toContain('ئازار');
    expect(formattedDate).toContain('2026');

    const formattedWeekdays = formatWeekdaysSummary([0, 2, 4], 'ckb');
    expect(formattedWeekdays).toBe('یەکشەممە، سێشەممە، پێنجشەممە');

    expect(formatTimeIraq('2026-03-15T14:30:00', 'ckb')).toBe('02:30 د.ن');
    expect(formatTimeIraq('2026-03-15T09:15:00', 'ckb')).toBe('09:15 پ.ن');
  });

  it('covers critical LockScreen, Settings, Clinical Chart, ROM/MMT, and Iraqi location strings', () => {
    expect(translateToKurdish('تشابه الاسم')).toBe('لێکچوونی ناو');
    expect(translateToKurdish('مفصل الركبة (Knee Joint)')).toBe('جومگەی ئەژنۆ (Knee Joint)');
    expect(translateToKurdish('اختبار لاكمان (Lachman)')).toBe('تاقیکردنەوەی لاکمان (Lachman)');
    expect(translateToKurdish('دمج سجلات المرضى المكررة')).toBe('یەکخستنی تۆمارە دووبارەکانی نەخۆش');
    expect(translateToKurdish('أربيل')).toBe('هەولێر');
    expect(translateToKurdish('جاري الحفظ...')).toBe('خەریکی پاشەکەوتکردنە...');
    expect(translateToKurdish('مختوم نهائياً')).toBe('مۆرکراوی کۆتایی');
  });
});
