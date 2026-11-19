import React from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';
import type { PhysicalAgentFlowsheetEntry, SessionRecord } from '../../../types/clinical';
import type {
  FinishUndoSnapshot,
  QuickSoapChip,
  QuickSoapChipCategory,
} from '../../../types/clinicManagement';
import type { ModalitySafetyRule } from '../../../utils/modalitySafetyChecker';
import type { NoteCompletenessReport } from '../../../utils/reEvalNudge';
import { ModalDialog } from '../../ui/Dialog';
import { AutoResizeTextarea } from '../../ui/Primitives';
import { FinishSessionFlowModal } from '../FinishSessionFlowModal';

export interface SessionModalsProps {
  session: SessionRecord;
  episodeTitle: string;
  showFinishFlowModal: boolean;
  setShowFinishFlowModal: (open: boolean) => void;
  completenessReport: NoteCompletenessReport | null;
  missingLockFields: string[];
  saveError: string | null;
  onFinalizeStep: () => Promise<boolean>;
  onFinishCompleted: (undoSnapshot: FinishUndoSnapshot, summaryAr: string, summaryEn: string) => void;

  showChipEditorModal: boolean;
  setShowChipEditorModal: (open: boolean) => void;
  newChipCategory: QuickSoapChipCategory;
  setNewChipCategory: (cat: QuickSoapChipCategory) => void;
  newChipLabelAr: string;
  setNewChipLabelAr: (v: string) => void;
  newChipLabelEn: string;
  setNewChipLabelEn: (v: string) => void;
  newChipDetail: string;
  setNewChipDetail: (v: string) => void;
  onAddCustomChip: (e: React.FormEvent) => void;
  favoriteChips: QuickSoapChip[];
  confirmDeleteChipId: string | null;
  setConfirmDeleteChipId: (id: string | null) => void;
  onDeleteFavoriteChip: (id: string) => void;
  confirmResetChips: boolean;
  setConfirmResetChips: (v: boolean) => void;
  onResetDefaultChips: () => void;

  showShortcutsModal: boolean;
  setShowShortcutsModal: (open: boolean) => void;

  pendingModalityCandidate: {
    modality: PhysicalAgentFlowsheetEntry['modality'];
    modalityAr: string;
    defaultParams: string;
    rules: ModalitySafetyRule[];
  } | null;
  modalityOverrideReason: string;
  setModalityOverrideReason: (v: string) => void;
  onCancelModalityOverride: () => void;
  onConfirmModalityOverride: () => void;
}

export const SessionModals: React.FC<SessionModalsProps> = ({
  session,
  episodeTitle,
  showFinishFlowModal,
  setShowFinishFlowModal,
  completenessReport,
  missingLockFields,
  saveError,
  onFinalizeStep,
  onFinishCompleted,
  showChipEditorModal,
  setShowChipEditorModal,
  newChipCategory,
  setNewChipCategory,
  newChipLabelAr,
  setNewChipLabelAr,
  newChipLabelEn,
  setNewChipLabelEn,
  newChipDetail,
  setNewChipDetail,
  onAddCustomChip,
  favoriteChips,
  confirmDeleteChipId,
  setConfirmDeleteChipId,
  onDeleteFavoriteChip,
  confirmResetChips,
  setConfirmResetChips,
  onResetDefaultChips,
  showShortcutsModal,
  setShowShortcutsModal,
  pendingModalityCandidate,
  modalityOverrideReason,
  setModalityOverrideReason,
  onCancelModalityOverride,
  onConfirmModalityOverride,
}) => {
  const { bi } = useLanguage();

  return (
    <>
      <FinishSessionFlowModal
        isOpen={showFinishFlowModal}
        onOpenChange={setShowFinishFlowModal}
        session={session}
        episodeTitle={episodeTitle}
        completenessReport={completenessReport}
        advisoryWarnings={missingLockFields}
        finalizeError={saveError}
        onFinalizeStep={onFinalizeStep}
        onFinishCompleted={onFinishCompleted}
      />

      {/* Favorite Quick SOAP Chips Editor Dialog */}
      <ModalDialog
        isOpen={showChipEditorModal}
        onOpenChange={setShowChipEditorModal}
        title={bi(
          'تخصيص بطاقات التدخل السريع',
          'Customize Quick SOAP Favorite Chips',
          'تایبەتمەندکردنی کارتەکانی تۆماری خێرا'
        )}
        subtitle={bi(
          'أضف أو احذف اختصارات التمارين والعلاج اليدوي والأجهزة المستخدمة بكثرة في عيادتك.',
          'Add or remove frequently used exercises, manual techniques, and modalities.',
          'قەدبڕەکانی ڕاهێنان، چارەسەری دەستی و ئامێرە زۆر بەکارهێنراوەکانی کلینیکەکەت زیاد بکە یان بسڕەوە.'
        )}
        size="lg"
      >
        <div className="space-y-4 text-xs">
          <form onSubmit={onAddCustomChip} className="p-3.5 rounded-xl bg-surface border border-line-2 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label htmlFor="chip-new-category" className="font-bold text-foreground block mb-1">
                  {bi('الفئة:', 'Category:', 'پۆل:')}
                </label>
                <select
                  id="chip-new-category"
                  value={newChipCategory}
                  onChange={(e) => setNewChipCategory(e.target.value as QuickSoapChipCategory)}
                  className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-foreground"
                >
                  <option value="modality">{bi('جهاز فيزيائي', 'Physical Modality', 'ئامێری فیزیایی')}</option>
                  <option value="manual">{bi('علاج يدوي', 'Manual Therapy', 'چارەسەری دەستی')}</option>
                  <option value="exercise">{bi('تمرين علاجي', 'Therapeutic Exercise', 'ڕاهێنانی چارەسەری')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="chip-new-label-ar" className="font-bold text-foreground block mb-1">
                  {bi('الاسم بالعربية:', 'Arabic Label:', 'ناو بە عەرەبی:')}
                </label>
                <input
                  id="chip-new-label-ar"
                  type="text"
                  value={newChipLabelAr}
                  onChange={(e) => setNewChipLabelAr(e.target.value)}
                  placeholder={bi('مثال: شد فقرات عنقية', 'e.g. Cervical Traction', 'نموونە: ڕاکێشانی بڕبڕەی مل')}
                  className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-foreground"
                />
              </div>
              <div>
                <label htmlFor="chip-new-label-en" className="font-bold text-foreground block mb-1">
                  {bi('الاسم بالإنجليزية:', 'English Label:', 'ناو بە ئینگلیزی:')}
                </label>
                <input
                  id="chip-new-label-en"
                  type="text"
                  value={newChipLabelEn}
                  onChange={(e) => setNewChipLabelEn(e.target.value)}
                  placeholder="e.g. Cervical Traction"
                  className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-foreground"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="flex-1 min-w-[180px]">
                <label htmlFor="chip-new-detail" className="font-bold text-foreground block mb-1">
                  {bi('الإعدادات / الجرعة الافتراضية:', 'Default Parameters / Load:', 'ڕێکخستنەکان / بڕی بنەڕەتی:')}
                </label>
                <input
                  id="chip-new-detail"
                  type="text"
                  value={newChipDetail}
                  onChange={(e) => setNewChipDetail(e.target.value)}
                  placeholder={bi('مثال: 100Hz / Grade III / 10 kg', 'e.g. 100Hz / Grade III / 10 kg', 'نموونە: 100Hz / Grade III / 10 kg')}
                  className="w-full px-2.5 py-2 rounded-lg bg-layer border border-layer-line text-foreground"
                />
              </div>
              <button
                type="submit"
                disabled={!newChipLabelAr.trim() && !newChipLabelEn.trim()}
                className="min-h-[36px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed text-primary-foreground font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="size-3.5" />
                <span>{bi('إضافة بطاقة', 'Add Chip', 'زیادکردنی کارت')}</span>
              </button>
            </div>
          </form>

          <div tabIndex={0} className="space-y-2 max-h-60 overflow-y-auto focus:outline-none">
            {favoriteChips.map((chip) => (
              <div
                key={chip.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-layer border border-layer-line"
              >
                <div className="min-w-0">
                  <span className="font-bold text-foreground">{bi(chip.labelAr, chip.labelEn)}</span>
                  <span className="text-muted-foreground-1 ms-2">
                    (
                    {chip.category === 'exercise'
                      ? bi('تمرين', 'Exercise', 'ڕاهێنان')
                      : chip.category === 'manual'
                        ? bi('يدوي', 'Manual', 'دەستی')
                        : bi('جهاز', 'Modality', 'ئامێر')}
                    )
                  </span>
                </div>
                {confirmDeleteChipId === chip.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteFavoriteChip(chip.id);
                        setConfirmDeleteChipId(null);
                      }}
                      className="px-2 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                    >
                      {bi('تأكيد', 'Confirm', 'دڵنیاکردنەوە')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteChipId(null)}
                      className="px-2 py-1 rounded-lg bg-layer border border-layer-line text-xs text-muted-foreground-1 cursor-pointer"
                    >
                      {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteChipId(chip.id)}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center p-1.5 rounded-lg text-muted-foreground-2 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                    aria-label={bi('حذف البطاقة', 'Delete chip', 'سڕینەوەی کارت')}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-card-divider">
            {confirmResetChips ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onResetDefaultChips();
                    setConfirmResetChips(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  {bi('تأكيد الاستعادة', 'Confirm Restore', 'دڵنیاکردنەوەی گەڕاندنەوە')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetChips(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-surface border border-line-2 text-xs text-muted-foreground-1 cursor-pointer"
                >
                  {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmResetChips(true)}
                className="px-3 py-1.5 rounded-lg bg-surface border border-line-2 text-muted-foreground-1 hover:text-foreground font-semibold cursor-pointer"
              >
                {bi('استعادة البطاقات الافتراضية', 'Restore Default Chips', 'گەڕاندنەوەی کارتە بنەڕەتییەکان')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowChipEditorModal(false)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-bold cursor-pointer"
            >
              {bi('تم', 'Done', 'تەواو')}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* Keyboard Shortcuts Help Dialog */}
      <ModalDialog
        isOpen={showShortcutsModal}
        onOpenChange={setShowShortcutsModal}
        title={bi('اختصارات لوحة المفاتيح للجلسة', 'Session Keyboard Shortcuts', 'قەدبڕەکانی کیبۆرد بۆ دانیشتن')}
        size="sm"
      >
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-line-2">
            <span className="font-semibold text-foreground">
              {bi('حفظ المسودة فوراً', 'Save Draft Now', 'پاشەکەوتکردنی خێرای ڕەشنووس')}
            </span>
            <kbd className="px-2 py-1 rounded bg-layer border border-layer-line font-mono text-foreground" dir="ltr">
              Ctrl + Enter
            </kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-line-2">
            <span className="font-semibold text-foreground">
              {bi('إنهاء واعتماد الجلسة', 'Finish & Sign Session', 'تەواوکردن و پەسەندکردنی دانیشتن')}
            </span>
            <kbd className="px-2 py-1 rounded bg-layer border border-layer-line font-mono text-foreground" dir="ltr">
              Ctrl + Shift + Enter
            </kbd>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-line-2">
            <span className="font-semibold text-foreground">
              {bi('إظهار / إخفاء الاختصارات', 'Toggle Shortcuts Help', 'پیشاندان / شاردنەوەی قەدبڕەکان')}
            </span>
            <kbd className="px-2 py-1 rounded bg-layer border border-layer-line font-mono text-foreground" dir="ltr">
              ?
            </kbd>
          </div>
        </div>
      </ModalDialog>

      {/* Phase B6: Modality Contraindication / Precaution Non-Blocking Override Modal */}
      <ModalDialog
        isOpen={Boolean(pendingModalityCandidate)}
        onOpenChange={(open) => {
          if (!open) onCancelModalityOverride();
        }}
        title={bi(
          'تحذير سلامة الوسيلة الفيزيائية (B6)',
          'Physical Modality Safety Alert',
          'ئاگاداری سەلامەتیی ئامێری فیزیایی (B6)'
        )}
        size="md"
      >
        {pendingModalityCandidate && (
          <div data-testid="modality-safety-override-modal" className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-200">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  {bi(
                    `تم رصد تعارض/محذور سريري عند إضافة: ${pendingModalityCandidate.modalityAr}`,
                    `Safety alert detected for: ${pendingModalityCandidate.modality}`,
                    `ئاگاداری دژبەیەکیی کلینیکی دۆزرایەوە لە کاتی زیادکردنی: ${pendingModalityCandidate.modalityAr}`
                  )}
                </span>
              </div>
              <ul className="space-y-1.5">
                {pendingModalityCandidate.rules.map((rule) => (
                  <li key={rule.id} className="p-2 rounded-lg bg-surface/80 border border-rose-500/20 space-y-0.5">
                    <div className="font-bold text-rose-700 dark:text-rose-300">
                      {bi(rule.titleAr, rule.titleEn)} (
                      {rule.severity === 'absolute_contraindication'
                        ? bi('مانع مطلق', 'Absolute Contraindication', 'ڕێگری تەواو')
                        : bi('تحذير / احتياط', 'Precaution', 'ئاگاداری / خۆپارێزی')}
                      )
                    </div>
                    <p className="text-foreground">{bi(rule.rationaleAr, rule.rationaleEn)}</p>
                    <p className="text-muted-foreground-1 font-mono">{rule.citation}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label htmlFor="modality-override-rationale" className="block font-bold text-foreground mb-1">
                {bi(
                  'مبرر التجاوز السريري (اختياري — يُحفظ في سجل الجلسة):',
                  'Clinical Override Rationale (optional — recorded in session note):',
                  'هۆکاری تێپەڕاندنی کلینیکی (دڵخوازانە — لە تۆماری دانیشتندا پاشەکەوت دەکرێت):'
                )}
              </label>
              <AutoResizeTextarea
                id="modality-override-rationale"
                minRows={2}
                value={modalityOverrideReason}
                onChange={(e) => setModalityOverrideReason(e.target.value)}
                placeholder={bi(
                  'مثال: التطبيق بعيداً عن الصدر/الجهاز بعد التحقق السريري...',
                  'e.g., Distal extremity application only after clinical screening...',
                  'نموونە: بەکارهێنان دوور لە سنگ/ئامێر دوای پشکنینی کلینیکی...'
                )}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-layer-line text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-card-divider">
              <button
                type="button"
                onClick={onCancelModalityOverride}
                className="px-3.5 py-2 rounded-xl bg-layer border border-layer-line text-foreground font-semibold cursor-pointer"
              >
                {bi('إلغاء الإضافة', 'Cancel', 'هەڵوەشاندنەوە')}
              </button>
              <button
                type="button"
                data-testid="modality-safety-confirm-override-btn"
                onClick={onConfirmModalityOverride}
                className="px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 dark:bg-amber-700 dark:hover:bg-amber-600 text-white font-bold cursor-pointer"
              >
                {bi('تأكيد التجاوز وإضافة الجهاز', 'Override & Add Modality', 'پشتڕاستکردنەوە و زیادکردنی ئامێر')}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </>
  );
};
