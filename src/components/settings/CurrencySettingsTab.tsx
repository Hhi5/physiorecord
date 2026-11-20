import React, { useState } from 'react';
import { Check, Coins, RotateCcw, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCurrency } from '../../context/CurrencyContext';
import { CURRENCY_NAME_CKB } from './settingsI18nLabels';

export const CurrencySettingsTab: React.FC = () => {
  const { bi } = useLanguage();
  const { currency, setCurrencyCode, availableCurrencies } = useCurrency();
  const [currencySearch, setCurrencySearch] = useState('');

  const filteredCurrencies = availableCurrencies.filter((c) => {
    const q = currencySearch.toLowerCase().trim();
    if (!q) return true;
    return (
      c.code.toLowerCase().includes(q) ||
      c.nameAr.includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      (CURRENCY_NAME_CKB[c.code] || '').includes(q) ||
      c.symbolAr.includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-5 rounded-2xl bg-card border border-card-line space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 text-sm font-bold text-foreground">
            <span className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Coins className="size-4" />
            </span>
            <span>
              {bi('عملة العيادة المعتمدة', 'Active Clinic Currency', 'دراوی پەسەندکراوی کلینیک')}
            </span>
          </div>
          {currency.code !== 'IQD' ? (
            <button
              type="button"
              onClick={() => setCurrencyCode('IQD')}
              className="min-h-[36px] px-3 py-1.5 text-xs font-bold rounded-xl bg-surface border border-line-2 text-primary hover:bg-primary/10 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RotateCcw className="size-3.5" />
              <span>{bi('استعادة الدينار العراقي', 'Reset to IQD', 'گەڕانەوە بۆ دیناری عێراقی')}</span>
            </button>
          ) : (
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
              {bi('الدينار العراقي · افتراضي', 'IQD · Default', 'دیناری عێراقی · بنەڕەتی')}
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'تُطبق العملة المختارة تلقائياً في فواتير المرضى والسجل المالي والمصاريف، مع عرض رمز العملة بعد الرقم.',
            'Applied across invoices, financial ledgers, and expenses with post-number symbol formatting.',
            'دراوە هەڵبژێردراوەکە بە شێوەی خۆکار لە پسوڵەکانی نەخۆش، تۆماری دارایی، و خەرجییەکان بەکاردەهێنرێت.'
          )}
        </p>

        {/* Currency Search Input */}
        <div className="relative flex items-center">
          <Search className="size-3.5 absolute start-3 inset-y-0 my-auto text-muted-foreground-2 pointer-events-none z-10 shrink-0" />
          <input
            id="settings-currency-search"
            type="text"
            aria-label={bi('بحث عن العملة', 'Search currencies', 'گەڕان بۆ دراو')}
            value={currencySearch}
            onChange={(e) => setCurrencySearch(e.target.value)}
            placeholder={bi(
              'ابحث باسم العملة أو الرمز (مثال: USD، دينار، ريال)...',
              'Search by currency name or code (e.g. USD, EUR, SAR)...',
              'بە ناو یان کۆدی دراو بگەڕێ (نموونە: USD، دینار، یۆرۆ)...'
            )}
            className="w-full min-h-[38px] ps-9 pe-3 py-1.5 text-xs leading-normal rounded-xl bg-layer border border-line-2 text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
          />
        </div>

        {/* Currency List */}
        <div
          tabIndex={0}
          aria-label={bi('قائمة العملات', 'Currency list', 'لیستی دراوەکان')}
          className="max-h-80 overflow-y-auto divide-y divide-card-divider rounded-xl border border-card-line bg-layer/40 focus:outline-none"
        >
          {filteredCurrencies.map((c) => {
            const isSelected = currency.code === c.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => setCurrencyCode(c.code)}
                className={`w-full px-3.5 py-2.5 text-start flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-primary/10 text-primary font-bold'
                    : 'hover:bg-surface text-foreground'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono font-bold text-xs tabular-nums text-muted-foreground-1 w-10 shrink-0">
                    {c.code}
                  </span>
                  <span className="text-xs truncate">
                    {bi(c.nameAr, c.nameEn, CURRENCY_NAME_CKB[c.code] || c.nameAr)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold opacity-85">
                    {bi(c.symbolAr, c.symbolEn, c.symbolAr)}
                  </span>
                  {isSelected && <Check className="size-4 text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
