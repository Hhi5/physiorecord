// =======================================================================
// PhysioRecord — Episode Discharge / Closing Modal (Phase 2B.1)
// Clinical discharge documentation, final outcome summary, and end date
// =======================================================================

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import type { EpisodeRecord } from '../types/clinical';
import { localDate } from '../utils/date';
import { X, CheckCircle, AlertTriangle } from 'lucide-react';

interface EpisodeDischargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  episode: EpisodeRecord;
  onConfirmDischarge: (dischargeInfo: {
    endDate: string;
    dischargeSummary: string;
    dischargeCriteriaSummary?: string;
  }) => Promise<void>;
}

export const EpisodeDischargeModal: React.FC<EpisodeDischargeModalProps> = ({
  isOpen,
  onClose,
  episode,
  onConfirmDischarge,
}) => {
  const { isRtl, bi } = useLanguage();
  const [endDate, setEndDate] = useState(localDate());
  const [dischargeReason, setDischargeReason] = useState('goals_met');
  const [dischargeSummary, setDischargeSummary] = useState('');
  const [dischargeCriteriaSummary, setDischargeCriteriaSummary] = useState(
    episode.data.dischargeCriteriaSummary || ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEndDate(localDate());
    setDischargeReason('goals_met');
    setDischargeSummary('');
    setDischargeCriteriaSummary(episode.data.dischargeCriteriaSummary || '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, episode.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!dischargeSummary.trim()) {
      setError('يرجى كتابة ملخص الخروج والنتائج السريرية المحققة.');
      return;
    }

    setSubmitting(true);
    try {
      const fullSummary = `[سبب الخروج: ${getReasonLabel(dischargeReason)}]\n${dischargeSummary.trim()}`;
      await onConfirmDischarge({
        endDate,
        dischargeSummary: fullSummary,
        dischargeCriteriaSummary: dischargeCriteriaSummary.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      console.error('Failed to close episode:', err);
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء إغلاق حلقة الرعاية.');
    } finally {
      setSubmitting(false);
    }
  };

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'goals_met':
        return bi('تحقق الأهداف التأهيلية المخططة بالكامل (Goals Met)', 'Planned Rehabilitation Goals Met');
      case 'maximum_medical_improvement':
        return bi('الوصول للحد الأقصى للتحسن السريري (MMI)', 'Maximum Medical Improvement (MMI)');
      case 'patient_self_discharged':
        return bi('خروج بطلب المريض أو انقطاع طوعي', 'Patient Self-Discharged');
      case 'referred_other':
        return bi('إحالة إلى تخصص أو مركز آخر', 'Referred to Other Specialist');
      default:
        return bi('أخرى', 'Other');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="episode-discharge-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      dir={isRtl ? 'rtl' : 'ltr'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card rounded-xl max-w-xl w-full shadow-2xl border border-card-line overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-6 py-4 bg-primary text-primary-foreground flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-foreground/15 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 id="episode-discharge-modal-title" className="text-base font-bold">
                {bi('إغلاق وتخريج حلقة الرعاية السريرية', 'Discharge & Close Episode of Care')}
              </h2>
              <p className="text-xs text-primary-foreground/85">{episode.data.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={bi('إغلاق', 'Close')}
            className="w-8 h-8 rounded-full bg-primary-foreground/15 hover:bg-primary-foreground/25 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 flex-1 overflow-y-auto">
          
          {error && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* End Date & Discharge Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="discharge-end-date-input" className="block text-xs font-bold text-foreground mb-1">
                {bi('تاريخ انتهاء / تخريج الحلقة', 'Discharge Date')} <span className="text-rose-500">*</span>
              </label>
              <input
                id="discharge-end-date-input"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-line-2 bg-layer text-foreground text-xs sm:text-sm focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="discharge-reason-select" className="block text-xs font-bold text-foreground mb-1">
                {bi('سبب التخريج (Discharge Reason)', 'Discharge Reason')}
              </label>
              <select
                id="discharge-reason-select"
                value={dischargeReason}
                onChange={(e) => setDischargeReason(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-line-2 text-xs font-medium focus:ring-2 focus:ring-primary bg-layer text-foreground"
              >
                <option value="goals_met">{bi('تحقق الأهداف العلاجية (Goals Met)', 'Rehabilitation Goals Met')}</option>
                <option value="maximum_medical_improvement">{bi('أقصى تحسن سريري ممكن (MMI)', 'Maximum Medical Improvement (MMI)')}</option>
                <option value="patient_self_discharged">{bi('انقطاع أو خروج بطلب المريض', 'Patient Self-Discharged')}</option>
                <option value="referred_other">{bi('إحالة إلى استشاري / تخصص آخر', 'Referred to Another Specialist')}</option>
              </select>
            </div>
          </div>

          {/* Discharge Summary Narrative */}
          <div>
            <label htmlFor="discharge-summary-textarea" className="block text-xs font-bold text-foreground mb-1">
              {bi('ملخص الخروج والنتائج السريرية المحققة (Discharge Summary)', 'Clinical Discharge Summary')} <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="discharge-summary-textarea"
              required
              rows={4}
              value={dischargeSummary}
              onChange={(e) => setDischargeSummary(e.target.value)}
              placeholder={bi(
                'اكتب خلاصة الاستجابة للعلاج، التحسن في مقياس الألم VAS، استعادة المدى الحركي والقوة العضلية، والتوصيات للبرنامج المنزلي المستمر...',
                'Summarize treatment response, NPRS/VAS pain reduction, ROM/MMT gains, and ongoing home program recommendations...'
              )}
              className="w-full px-3.5 py-2.5 rounded-xl border border-line-2 bg-layer text-foreground placeholder:text-muted-foreground-1 text-xs sm:text-sm focus:ring-2 focus:ring-primary leading-relaxed"
            />
          </div>

          {/* Discharge Criteria Check */}
          <div>
            <label htmlFor="discharge-criteria-input" className="block text-xs font-bold text-foreground mb-1">
              {bi('معايير الخروج المكتملة (Criteria Achievement)', 'Completed Discharge Criteria')}
            </label>
            <input
              id="discharge-criteria-input"
              type="text"
              value={dischargeCriteriaSummary}
              onChange={(e) => setDischargeCriteriaSummary(e.target.value)}
              placeholder={bi(
                'مثال: تحقيق 130 درجة ثني الركبة، قوة عضلية 5/5، وعدم وجود ألم أثناء المشي.',
                'e.g. Achieved 130° knee flexion, 5/5 quadriceps strength, pain-free ambulation.'
              )}
              className="w-full px-3.5 py-2 rounded-xl border border-line-2 bg-layer text-foreground placeholder:text-muted-foreground-1 text-xs focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="p-3.5 bg-primary/10 border border-primary/25 rounded-2xl text-xs text-foreground leading-relaxed">
            {bi(
              'بإغلاق هذه الحلقة، سيتم تحديث حالتها إلى "مكتملة / Completed"، وسيبقى كامل سجلها السريري وتاريخ جلساتها محفوظاً ومشفراً ضمن السجل التاريخي للمريض.',
              'Closing this episode marks it as "Completed" while preserving all encrypted clinical sessions and outcomes in the patient longitudinal history.'
            )}
          </div>

        </form>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-surface border-t border-card-divider flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-foreground bg-layer border border-line-2 hover:bg-layer-hover cursor-pointer"
          >
            {bi('إلغاء', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 rounded-xl text-xs font-bold text-primary-foreground bg-primary hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{submitting ? bi('جاري الإغلاق...', 'Closing...') : bi('تأكيد التخريج وإغلاق الحلقة', 'Confirm Discharge & Close')}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
