// =======================================================================
// PhysioRecord — Global Currency System & ISO 4217 Open Data Catalog
// Default: IQD (الدينار العراقي), with full international coverage
// =======================================================================

export interface CurrencyConfig {
  code: string;       // ISO 4217 code (IQD, USD, EUR, etc.)
  symbolAr: string;   // Display symbol in Arabic (د.ع, $, €, إلخ)
  symbolEn: string;   // Display symbol in English (IQD, $, €, etc.)
  nameAr: string;     // Localized full name in Arabic
  nameEn: string;     // Localized full name in English
  decimals: number;   // Standard minor unit fraction digits
}

/**
 * Curated open catalog of world currencies (Arab region, major global & international currencies)
 * Based on open-source ISO 4217 standard definitions.
 */
export const WORLD_CURRENCIES: CurrencyConfig[] = [
  // 1. العراق والوطن العربي (Arab & Regional Currencies)
  {
    code: 'IQD',
    symbolAr: 'د.ع',
    symbolEn: 'IQD',
    nameAr: 'الدينار العراقي (الافتراضي)',
    nameEn: 'Iraqi Dinar (Default)',
    decimals: 0,
  },
  {
    code: 'USD',
    symbolAr: '$',
    symbolEn: '$',
    nameAr: 'الدولار الأمريكي',
    nameEn: 'US Dollar',
    decimals: 2,
  },
  {
    code: 'EUR',
    symbolAr: '€',
    symbolEn: '€',
    nameAr: 'اليورو الأوروبي',
    nameEn: 'Euro',
    decimals: 2,
  },
  {
    code: 'GBP',
    symbolAr: '£',
    symbolEn: '£',
    nameAr: 'الجنيه الإسترليني',
    nameEn: 'British Pound',
    decimals: 2,
  },
  {
    code: 'SAR',
    symbolAr: 'ر.س',
    symbolEn: 'SAR',
    nameAr: 'الريال السعودي',
    nameEn: 'Saudi Riyal',
    decimals: 2,
  },
  {
    code: 'AED',
    symbolAr: 'د.إ',
    symbolEn: 'AED',
    nameAr: 'الدرهم الإماراتي',
    nameEn: 'UAE Dirham',
    decimals: 2,
  },
  {
    code: 'KWD',
    symbolAr: 'د.ك',
    symbolEn: 'KWD',
    nameAr: 'الدينار الكويتي',
    nameEn: 'Kuwaiti Dinar',
    decimals: 3,
  },
  {
    code: 'QAR',
    symbolAr: 'ر.ق',
    symbolEn: 'QAR',
    nameAr: 'الريال القطري',
    nameEn: 'Qatari Riyal',
    decimals: 2,
  },
  {
    code: 'BHD',
    symbolAr: 'د.ب',
    symbolEn: 'BHD',
    nameAr: 'الدينار البحريني',
    nameEn: 'Bahraini Dinar',
    decimals: 3,
  },
  {
    code: 'OMR',
    symbolAr: 'ر.ع',
    symbolEn: 'OMR',
    nameAr: 'الريال العماني',
    nameEn: 'Omani Rial',
    decimals: 3,
  },
  {
    code: 'JOD',
    symbolAr: 'د.أ',
    symbolEn: 'JOD',
    nameAr: 'الدينار الأردني',
    nameEn: 'Jordanian Dinar',
    decimals: 3,
  },
  {
    code: 'EGP',
    symbolAr: 'ج.م',
    symbolEn: 'EGP',
    nameAr: 'الجنيه المصري',
    nameEn: 'Egyptian Pound',
    decimals: 2,
  },
  {
    code: 'LBP',
    symbolAr: 'ل.ل',
    symbolEn: 'LBP',
    nameAr: 'الليرة اللبنانية',
    nameEn: 'Lebanese Pound',
    decimals: 0,
  },
  {
    code: 'SYP',
    symbolAr: 'ل.س',
    symbolEn: 'SYP',
    nameAr: 'الليرة السورية',
    nameEn: 'Syrian Pound',
    decimals: 0,
  },
  {
    code: 'LYD',
    symbolAr: 'د.ل',
    symbolEn: 'LYD',
    nameAr: 'الدينار الليبي',
    nameEn: 'Libyan Dinar',
    decimals: 3,
  },
  {
    code: 'TND',
    symbolAr: 'د.ت',
    symbolEn: 'TND',
    nameAr: 'الدينار التونسي',
    nameEn: 'Tunisian Dinar',
    decimals: 3,
  },
  {
    code: 'DZD',
    symbolAr: 'د.ج',
    symbolEn: 'DZD',
    nameAr: 'الدينار الجزائري',
    nameEn: 'Algerian Dinar',
    decimals: 2,
  },
  {
    code: 'MAD',
    symbolAr: 'د.م',
    symbolEn: 'MAD',
    nameAr: 'الدرهم المغربي',
    nameEn: 'Moroccan Dirham',
    decimals: 2,
  },
  {
    code: 'SDG',
    symbolAr: 'ج.س',
    symbolEn: 'SDG',
    nameAr: 'الجنيه السوداني',
    nameEn: 'Sudanese Pound',
    decimals: 2,
  },
  {
    code: 'YER',
    symbolAr: 'ر.ي',
    symbolEn: 'YER',
    nameAr: 'الريال اليمني',
    nameEn: 'Yemeni Rial',
    decimals: 2,
  },
  // 2. عملات دولية رئيسية (Major International Currencies)
  {
    code: 'TRY',
    symbolAr: '₺',
    symbolEn: 'TRY',
    nameAr: 'الليرة التركية',
    nameEn: 'Turkish Lira',
    decimals: 2,
  },
  {
    code: 'CAD',
    symbolAr: 'CA$',
    symbolEn: 'CA$',
    nameAr: 'الدولار الكندي',
    nameEn: 'Canadian Dollar',
    decimals: 2,
  },
  {
    code: 'AUD',
    symbolAr: 'AU$',
    symbolEn: 'AU$',
    nameAr: 'الدولار الأسترالي',
    nameEn: 'Australian Dollar',
    decimals: 2,
  },
  {
    code: 'CHF',
    symbolAr: 'CHF',
    symbolEn: 'CHF',
    nameAr: 'الفرنك السويسري',
    nameEn: 'Swiss Franc',
    decimals: 2,
  },
  {
    code: 'JPY',
    symbolAr: '¥',
    symbolEn: '¥',
    nameAr: 'الين الياباني',
    nameEn: 'Japanese Yen',
    decimals: 0,
  },
  {
    code: 'CNY',
    symbolAr: '¥',
    symbolEn: 'CNY',
    nameAr: 'اليوان الصيني',
    nameEn: 'Chinese Yuan',
    decimals: 2,
  },
  {
    code: 'INR',
    symbolAr: '₹',
    symbolEn: 'INR',
    nameAr: 'الروبية الهندية',
    nameEn: 'Indian Rupee',
    decimals: 2,
  },
  {
    code: 'SEK',
    symbolAr: 'kr',
    symbolEn: 'SEK',
    nameAr: 'الكرونة السويدية',
    nameEn: 'Swedish Krona',
    decimals: 2,
  },
  {
    code: 'NOK',
    symbolAr: 'kr',
    symbolEn: 'NOK',
    nameAr: 'الكرونة النرويجية',
    nameEn: 'Norwegian Krone',
    decimals: 2,
  },
  {
    code: 'DKK',
    symbolAr: 'kr',
    symbolEn: 'DKK',
    nameAr: 'الكرونة الدنماركية',
    nameEn: 'Danish Krone',
    decimals: 2,
  },
  {
    code: 'MYR',
    symbolAr: 'RM',
    symbolEn: 'RM',
    nameAr: 'الرينغيت الماليزي',
    nameEn: 'Malaysian Ringgit',
    decimals: 2,
  },
];

export const DEFAULT_CURRENCY_CODE = 'IQD';

export function getCurrencyConfig(code = DEFAULT_CURRENCY_CODE): CurrencyConfig {
  const match = WORLD_CURRENCIES.find((c) => c.code.toUpperCase() === code.toUpperCase());
  return match || WORLD_CURRENCIES[0];
}
