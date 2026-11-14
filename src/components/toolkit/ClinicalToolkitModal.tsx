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
        <div className="bg-muted/40 px-5 sm:px-6 py-4 border-b border-card-divider flex items-center justify-between gap-4 flex-shrink-0">
          
          {/* Title and Icon */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-2xs flex-shrink-0">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="toolkit-modal-title" className="text-base sm:text-lg font-bold text-foreground">
                  {bi('المراجع السريرية التفاعلية', 'Interactive Clinical Reference Toolkit', 'سەرچاوە کلینیکییە کارلێکەکان')}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground-1">
                {bi(
                  'دليل الفحص العصبي الشامل: القطاعات الجلدية، العضلية، والمنعكسات الوترية العميقة',
                  'Comprehensive Neurological Reference: Dermatomes, Myotomes & Deep Tendon Reflexes',
                  'ڕێبەری گشتگیری پشکنینی دەمار: دێرماتۆمەکان، مایۆتۆمەکان و کاردانەوەی ژێیە قووڵەکان'
                )}
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            title={bi('إغلاق المرجع (Esc)', 'Close toolkit (Esc)', 'داخستنی سەرچاوە (Esc)')}
            className="w-8 h-8 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-muted-foreground-1 hover:text-foreground flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
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
