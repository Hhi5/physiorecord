// =======================================================================
// PhysioRecord — Interactive Clinical Reference Toolkit Modal
// High Z-Index (z-[70]) Overlay Modal Supporting Seamless Cross-Modal Reference
// =======================================================================

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { DermatomesMapTab } from './DermatomesMapTab';
import { MyotomesTab } from './MyotomesTab';
import { DtrReferenceTab } from './DtrReferenceTab';
import { X, Layers, Activity, Stethoscope, ShieldCheck, BookOpen } from 'lucide-react';
import { GeometricHeaderBackdrop } from '../ui/Dialog';

export type ToolkitTabId = 'dermatomes' | 'myotomes' | 'dtr';

interface ClinicalToolkitModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ToolkitTabId;
}

export const ClinicalToolkitModal: React.FC<ClinicalToolkitModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'dermatomes',
}) => {
  const { isRtl, bi } = useLanguage();

  const [activeTab, setActiveTab] = useState<ToolkitTabId>(initialTab);

  // Sync tab if initialTab changes when opening
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Handle ESC key press to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[70] flex justify-end bg-slate-950/60 backdrop-blur-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="toolkit-modal-title"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl h-full bg-card shadow-2xl border-s border-card-line flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header Bar */}
        <div className="relative overflow-hidden px-5 sm:px-6 pt-3 sm:pt-4 pb-4 bg-primary text-primary-foreground flex flex-col gap-2.5 shrink-0 shadow-xs">
          <GeometricHeaderBackdrop />
          <div className="relative z-10 w-10 h-1 bg-primary-foreground/40 rounded-full mx-auto sm:hidden shrink-0" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 rounded-xl bg-primary-foreground/15 text-primary-foreground border border-primary-foreground/25 flex items-center justify-center shrink-0">
                <Stethoscope className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 id="toolkit-modal-title" className="text-sm sm:text-base font-bold text-primary-foreground truncate">
                  {bi('المراجع السريرية التفاعلية', 'Interactive Clinical Reference Toolkit', 'سەرچاوە کلینیکییە کارلێکەکان')}
                </h2>
                <p className="text-xs text-primary-foreground/85 truncate">
                  {bi(
                    'دليل الفحص العصبي الشامل: القطاعات الجلدية، العضلية، والمنعكسات الوترية العميقة',
                    'Comprehensive Neurological Reference: Dermatomes, Myotomes & Deep Tendon Reflexes',
                    'ڕێبەری گشتگیری پشکنینی دەمار: دێرماتۆمەکان، مایۆتۆمەکان و کاردانەوەی ژێیە قووڵەکان'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={bi('إغلاق المرجع (Esc)', 'Close toolkit (Esc)', 'داخستنی سەرچاوە (Esc)')}
              className="size-9 !p-0 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher Navigation */}
        <div className="bg-muted/60 px-4 sm:px-6 py-2.5 border-b border-card-divider flex items-center justify-between gap-2 overflow-x-auto flex-shrink-0">
          <div className="flex items-center gap-2">
            
            {/* Dermatomes Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('dermatomes')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'dermatomes'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-layer text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover border border-layer-line'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>{bi('خريطة القطاعات الجلدية (Dermatomes)', 'Dermatomes Map', 'نەخشەی دێرماتۆمەکان (Dermatomes)')}</span>
            </button>

            {/* Myotomes Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('myotomes')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'myotomes'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-layer text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover border border-layer-line'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>{bi('القطاعات العضلية (Myotomes)', 'Myotomes Reference', 'مایۆتۆمەکان (Myotomes)')}</span>
            </button>

            {/* DTR Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('dtr')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'dtr'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-layer text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover border border-layer-line'
              }`}
            >
              <Stethoscope className="w-4 h-4" />
              <span>{bi('المنعكسات الوترية العميقة (DTR)', 'Deep Tendon Reflexes', 'کاردانەوەی ژێیە قووڵەکان (DTR)')}</span>
            </button>

          </div>

          <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground-1">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            <span>{bi('مراجع مفتوحة ومتاحة محلياً', 'Local Offline Clinical Reference', 'سەرچاوە کلینیکییە ناوخۆییە بەردەستەکان')}</span>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background">
          {activeTab === 'dermatomes' && <DermatomesMapTab />}
          {activeTab === 'myotomes' && <MyotomesTab />}
          {activeTab === 'dtr' && <DtrReferenceTab />}
        </div>

        {/* Scientific Sources & Verification Footer */}
        <div className="bg-muted/40 px-5 sm:px-6 py-3 border-t border-card-divider flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>
              {bi(
                'المعايير المعتمدة: ASIA / ISNCSCI (2025) • Foerster (1933) • Lee et al. (2008) • Kendall (5th Ed) • NINDS Guidelines',
                'Validated Standards: ASIA / ISNCSCI (2025) • Foerster (1933) • Lee et al. (2008) • Kendall (5th Ed) • NINDS Guidelines',
                'پێوەرە پەسەندکراوەکان: ASIA / ISNCSCI (2025) • Foerster (1933) • Lee et al. (2008) • Kendall (5th Ed) • NINDS Guidelines'
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-foreground bg-layer border border-layer-line hover:bg-layer-hover transition-colors cursor-pointer"
          >
            {bi('إغلاق المرجع', 'Close', 'داخستنی سەرچاوە')}
          </button>
        </div>

      </div>
    </div>
  );
};
