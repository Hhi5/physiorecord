// =======================================================================
// PhysioRecord — Phase C5: Recurring Expenses & Custom Category Templates
// Monthly due-expense suggestion cards (blank R2 amounts) & template CRUD
// =======================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { formatDateDDMMYYYY, localDate } from '../../utils/date';
import {
  EXPENSE_CATEGORY_LABELS,
  getDueRecurringExpenseSuggestions,
} from '../../utils/iraqFinanceC4C5';
import {
  DatePickerInput,
  MoneyInput,
  Num,
} from '../ui/Primitives';
import type {
  ClinicExpenseIQD,
  ExpenseCategoryIQD,
  RecurringExpenseTemplate,
} from '../../types/clinicManagement';
import {
  CalendarCheck2,
  CheckCircle2,
  Edit3,
  Pause,
  Play,
  Plus,
  Repeat,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';

export interface RecurringExpensesPanelProps {
  expenses: ClinicExpenseIQD[];
  onExpensesUpdated: (updated: ClinicExpenseIQD[]) => void;
}

interface DueDraftState {
  amountIQD: number;
  date: string;
  notes: string;
}

const EXPENSE_CATEGORY_ORDER: ExpenseCategoryIQD[] = [
  'rent',
  'electricity_generator',
  'medical_consumables',
  'equipment_maintenance',
  'staff_salaries',
  'marketing_other',
];

const EXPENSE_CATEGORY_CKB: Record<ExpenseCategoryIQD, string> = {
  rent: 'کرێی کلینیک',
  electricity_generator: 'کارەبا و مۆلیدە',
  medical_consumables: 'پێداویستییە پزیشکییە بەکاربردراوەکان',
  equipment_maintenance: 'چاککردنەوەی ئامێرەکان',
  staff_salaries: 'مووچەی ستاف',
  marketing_other: 'بازاڕکردن / خەرجیی تر',
};

export const RecurringExpensesPanel: React.FC<RecurringExpensesPanelProps> = ({
  expenses,
  onExpensesUpdated,
}) => {
  const { isRtl, bi } = useLanguage();

  const [templates, setTemplates] = useState<RecurringExpenseTemplate[]>(() =>
    ClinicOperationsService.getRecurringExpenseTemplates()
  );
  const [drafts, setDrafts] = useState<Record<string, DueDraftState>>({});
  const [showManager, setShowManager] = useState(false);

  // Add / Edit Template Form State (always zero default amount per R2)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null
  );
  const [tplCategory, setTplCategory] = useState<ExpenseCategoryIQD>('rent');
  const [tplCustomCategoryLabel, setTplCustomCategoryLabel] = useState('');
  const [tplTitleAr, setTplTitleAr] = useState('');
  const [tplTitleEn, setTplTitleEn] = useState('');
  const [tplDayOfMonth, setTplDayOfMonth] = useState<number>(1);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  useEffect(() => {
    const syncTemplates = () => {
      setTemplates(ClinicOperationsService.getRecurringExpenseTemplates());
    };
    syncTemplates();
    const unsub = ClinicOperationsService.subscribe(syncTemplates);
    window.addEventListener('physiorecord-modules-updated', syncTemplates);
    return () => {
      unsub();
      window.removeEventListener('physiorecord-modules-updated', syncTemplates);
    };
  }, []);

  const dueSuggestions = useMemo(
    () => getDueRecurringExpenseSuggestions(templates, expenses),
    [templates, expenses]
  );

  const getDraft = (tplId: string): DueDraftState =>
    drafts[tplId] || {
      amountIQD: 0,
      date: localDate(),
      notes: '',
    };

  const patchDraft = (tplId: string, patch: Partial<DueDraftState>) => {
    setFormNotice(null);
    setDrafts((prev) => ({
      ...prev,
      [tplId]: {
        ...getDraft(tplId),
        ...patch,
      },
    }));
  };

  const handleLogDueExpense = (tplId: string) => {
    const draft = getDraft(tplId);
    if (!Number.isFinite(draft.amountIQD) || draft.amountIQD <= 0) {
      setFormNotice(
        bi(
          'يرجى إدخال مبلغ أكبر من 0 قبل تسجيل المصروف المتكرر.',
          'Enter an amount greater than 0 before logging the recurring expense.',
          'تکایە بڕێکی گەورەتر لە ٠ بنووسە پێش تۆمارکردنی خەرجیی دووبارەبووەوە.'
        )
      );
      return;
    }

    const tpl = templates.find((t) => t.id === tplId);
    const updatedExpenses = ClinicOperationsService.logRecurringExpenseForMonth({
      templateId: tplId,
      amountIQD: draft.amountIQD,
      date: draft.date || localDate(),
      customCategoryLabel: tpl?.customCategoryLabel,
      notes: draft.notes.trim() || undefined,
    });
    onExpensesUpdated(updatedExpenses);
    setTemplates(ClinicOperationsService.getRecurringExpenseTemplates());
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[tplId];
      return next;
    });
    setFormNotice(null);
  };

  const resetTemplateForm = () => {
    setEditingTemplateId(null);
    setTplCategory('rent');
    setTplCustomCategoryLabel('');
    setTplTitleAr('');
    setTplTitleEn('');
    setTplDayOfMonth(1);
  };

  const startEditTemplate = (tpl: RecurringExpenseTemplate) => {
    setEditingTemplateId(tpl.id);
    setTplCategory(tpl.category);
    setTplCustomCategoryLabel(tpl.customCategoryLabel || '');
    setTplTitleAr(tpl.titleAr);
    setTplTitleEn(tpl.titleEn);
    setTplDayOfMonth(Math.max(1, Math.min(28, tpl.dayOfMonth || 1)));
    setShowManager(true);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAr = tplTitleAr.trim();
    const cleanEn = tplTitleEn.trim() || cleanAr;
    if (!cleanAr) return;

    const clampedDay = Math.max(
      1,
      Math.min(28, Math.round(Number(tplDayOfMonth) || 1))
    );
    const cleanCustomLabel = tplCustomCategoryLabel.trim() || undefined;

    let nextList: RecurringExpenseTemplate[];
    if (editingTemplateId) {
      nextList = templates.map((item) =>
        item.id === editingTemplateId
          ? {
              ...item,
              category: tplCategory,
              customCategoryLabel: cleanCustomLabel,
              titleAr: cleanAr,
              titleEn: cleanEn,
              defaultAmountIQD: 0,
              dayOfMonth: clampedDay,
            }
          : item
      );
    } else {
      const created: RecurringExpenseTemplate = {
        id: `rec_exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        category: tplCategory,
        customCategoryLabel: cleanCustomLabel,
        titleAr: cleanAr,
        titleEn: cleanEn,
        defaultAmountIQD: 0,
        dayOfMonth: clampedDay,
        isActive: true,
      };
      nextList = [...templates, created];
    }

    setTemplates(ClinicOperationsService.saveRecurringExpenseTemplates(nextList));
    resetTemplateForm();
  };

  const handleToggleActive = (tplId: string) => {
    const nextList = templates.map((item) =>
      item.id === tplId ? { ...item, isActive: !item.isActive } : item
    );
    setTemplates(ClinicOperationsService.saveRecurringExpenseTemplates(nextList));
  };

  const handleDeleteTemplate = (tplId: string) => {
    const nextList = templates.filter((item) => item.id !== tplId);
    setTemplates(ClinicOperationsService.saveRecurringExpenseTemplates(nextList));
    if (editingTemplateId === tplId) {
      resetTemplateForm();
    }
  };

  return (
    <div
      className="p-4 sm:p-5 border-b border-card-divider bg-surface/40 space-y-4 text-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
            <Repeat className="size-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
              <span>{bi('مستحق هذا الشهر', 'Due this month', 'شایستەی ئەم مانگە')}</span>
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold text-xs tabular-nums">
                <Num value={dueSuggestions.length} />
              </span>
            </h2>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'تسجيل سريع للمصاريف الشهرية المتكررة (أدخل المبلغ الفعلي عند الدفع)',
                'Quick-log monthly recurring expenses (enter actual amount when paid)',
                'تۆمارکردنی خێرای خەرجییە مانگانە دووبارەبووەکان (بڕی ڕاستەقینە بنووسە لە کاتی پارەداندا)'
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowManager((v) => !v)}
          className="px-3 py-1.5 min-h-[36px] rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Settings2 className="size-3.5 text-primary" />
          <span>
            {showManager
              ? bi(
                  'إخفاء إدارة القوالب',
                  'Hide Template Manager',
                  'شاردنەوەی بەڕێوەبەری قاڵبەکان'
                )
              : bi(
                  'إدارة القوالب والفئات',
                  'Manage Templates & Categories',
                  'بەڕێوەبردنی قاڵب و پۆلەکان'
                )}
          </span>
        </button>
      </div>

      {formNotice && (
        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <span>{formNotice}</span>
          <button
            type="button"
            onClick={() => setFormNotice(null)}
            className="p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg hover:bg-black/5 cursor-pointer"
            aria-label={bi('إغلاق', 'Dismiss', 'داخستن')}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Due This Month Suggestion Cards */}
      {dueSuggestions.length === 0 ? (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          <span className="font-semibold">
            {bi(
              'تم تسجيل جميع المصاريف المتكررة النشطة لهذا الشهر.',
              'All active recurring expenses for this month have been logged.',
              'هەموو خەرجییە دووبارەبووە چالاکەکانی ئەم مانگە تۆمارکراون.'
            )}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {dueSuggestions.map((tpl) => {
            const draft = getDraft(tpl.id);
            const catLabel =
              tpl.customCategoryLabel?.trim() ||
              bi(
                EXPENSE_CATEGORY_LABELS[tpl.category].ar,
                EXPENSE_CATEGORY_LABELS[tpl.category].en,
                EXPENSE_CATEGORY_CKB[tpl.category]
              );
            return (
              <div
                key={tpl.id}
                className="p-3.5 rounded-2xl bg-card border border-card-line shadow-2xs space-y-2.5 flex flex-col justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-foreground">
                      {bi(tpl.titleAr, tpl.titleEn)}
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-surface border border-line-2 text-muted-foreground-1 text-xs shrink-0">
                      {catLabel}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground-1 flex items-center gap-1.5">
                    <CalendarCheck2 className="size-3.5 text-primary shrink-0" />
                    <span>
                      {bi('تاريخ الاستحقاق المقترح: ', 'Suggested due: ', 'کاتی شایستەی پێشنیارکراو: ')}
                      <bdi dir="ltr">
                        {formatDateDDMMYYYY(tpl.suggestedDueDate)}
                      </bdi>
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`rec-amt-${tpl.id}`} className="block font-semibold text-muted-foreground-1 mb-1">
                        {bi('المبلغ:', 'Amount:', 'بڕ:')}
                      </label>
                      <MoneyInput
                        id={`rec-amt-${tpl.id}`}
                        ariaLabel={`${bi('المبلغ', 'Amount', 'بڕ')} — ${bi(tpl.titleAr, tpl.titleEn)}`}
                        value={draft.amountIQD}
                        onChange={(val) =>
                          patchDraft(tpl.id, { amountIQD: val })
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor={`rec-date-${tpl.id}`} className="block font-semibold text-muted-foreground-1 mb-1">
                        {bi('التاريخ:', 'Date:', 'ڕێکەوت:')}
                      </label>
                      <DatePickerInput
                        id={`rec-date-${tpl.id}`}
                        ariaLabel={`${bi('التاريخ', 'Date', 'ڕێکەوت')} — ${bi(tpl.titleAr, tpl.titleEn)}`}
                        value={draft.date}
                        onChange={(val) => patchDraft(tpl.id, { date: val })}
                      />
                    </div>
                  </div>

                  <input
                    type="text"
                    value={draft.notes}
                    onChange={(e) =>
                      patchDraft(tpl.id, { notes: e.target.value })
                    }
                    aria-label={bi('ملاحظات المصروف المتكرر', 'Recurring expense notes', 'تێبینی خەرجیی دووبارەبووەوە')}
                    placeholder={
                      bi('ملاحظات (اختياري)...', 'Notes (optional)...', 'تێبینی (بژاردەیی)...')
                    }
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-layer border border-layer-line text-foreground focus:outline-none focus:border-primary"
                  />

                  <button
                    type="button"
                    disabled={draft.amountIQD <= 0}
                    onClick={() => handleLogDueExpense(tpl.id)}
                    className="w-full py-2 px-3 min-h-[36px] rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
                  >
                    <Plus className="size-3.5" />
                    <span>{bi('تسجيل المصروف', 'Log Expense', 'تۆمارکردنی خەرجی')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template Manager Drawer/Section */}
      {showManager && (
        <div className="p-4 rounded-2xl bg-card border border-card-line space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs sm:text-sm font-bold text-foreground">
              {bi(
                'قوالب المصاريف المتكررة والفئات المخصصة',
                'Recurring Expense Templates & Custom Categories',
                'قاڵبەکانی خەرجیی دووبارەبووەوە و پۆلە تایبەتەکان'
              )}
            </h3>
            {editingTemplateId && (
              <button
                type="button"
                onClick={resetTemplateForm}
                className="text-xs font-semibold text-primary hover:underline min-h-[36px] inline-flex items-center cursor-pointer"
              >
                {bi('+ إضافة قالب جديد', '+ Add New Template', '+ زیادکردنی قاڵبێکی نوێ')}
              </button>
            )}
          </div>

          <form
            onSubmit={handleSaveTemplate}
            className="p-3.5 rounded-xl bg-surface border border-line-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
          >
            <div>
              <label htmlFor="rec-tpl-cat" className="block font-semibold text-foreground mb-1">
                {bi('الفئة الأساسية:', 'Category:', 'پۆلی سەرەکی:')}
              </label>
              <select
                id="rec-tpl-cat"
                value={tplCategory}
                onChange={(e) =>
                  setTplCategory(e.target.value as ExpenseCategoryIQD)
                }
                className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground"
              >
                {EXPENSE_CATEGORY_ORDER.map((cat) => (
                  <option key={cat} value={cat}>
                    {bi(
                      EXPENSE_CATEGORY_LABELS[cat].ar,
                      EXPENSE_CATEGORY_LABELS[cat].en,
                      EXPENSE_CATEGORY_CKB[cat]
                    )}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rec-tpl-custom-cat" className="block font-semibold text-foreground mb-1">
                {bi(
                  'تسمية فئة مخصصة (اختياري):',
                  'Custom Category Label:',
                  'ناوی پۆلی تایبەت (بژاردەیی):'
                )}
              </label>
              <input
                id="rec-tpl-custom-cat"
                type="text"
                value={tplCustomCategoryLabel}
                onChange={(e) => setTplCustomCategoryLabel(e.target.value)}
                placeholder={
                  bi(
                    'مثال: اشتراكات / نظافة...',
                    'e.g., Subscriptions / Cleaning...',
                    'نموونە: بەشداریکردن / پاککردنەوە...'
                  )
                }
                className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground"
              />
            </div>

            <div>
              <label htmlFor="rec-tpl-title-ar" className="block font-semibold text-foreground mb-1">
                {bi(
                  'عنوان القالب (عربي) *:',
                  'Title (Arabic / Primary) *:',
                  'ناونیشانی قاڵب (سەرەکی) *:'
                )}
              </label>
              <input
                id="rec-tpl-title-ar"
                type="text"
                required
                value={tplTitleAr}
                onChange={(e) => setTplTitleAr(e.target.value)}
                placeholder={
                  bi('مثال: اشتراك الإنترنت', 'e.g., Internet Bill', 'نموونە: پارەی ئینتەرنێت')
                }
                className="w-full px-3 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground"
              />
            </div>

            <div>
              <label htmlFor="rec-tpl-title-en" className="block font-semibold text-foreground mb-1">
                {bi(
                  'العنوان (EN اختياري) ويوم الشهر:',
                  'English Title & Day:',
                  'ناونیشان (ئینگلیزی) و ڕۆژی مانگ:'
                )}
              </label>
              <div className="flex gap-1.5">
                <input
                  id="rec-tpl-title-en"
                  type="text"
                  dir="ltr"
                  value={tplTitleEn}
                  onChange={(e) => setTplTitleEn(e.target.value)}
                  aria-label={bi('عنوان القالب بالإنجليزية', 'English template title', 'ناونیشانی قاڵب بە ئینگلیزی')}
                  placeholder="English title"
                  className="flex-1 min-w-0 px-2.5 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground"
                />
                <input
                  type="number"
                  min={1}
                  max={28}
                  dir="ltr"
                  value={tplDayOfMonth}
                  onChange={(e) =>
                    setTplDayOfMonth(
                      Math.max(1, Math.min(28, Number(e.target.value) || 1))
                    )
                  }
                  aria-label={bi('يوم الاستحقاق بالشهر (1–28)', 'Day of month (1–28)', 'ڕۆژی شایستەبوون لە مانگدا (١–٢٨)')}
                  title={bi(
                    'يوم الاستحقاق بالشهر (1–28)',
                    'Day of month (1–28)',
                    'ڕۆژی شایستەبوون لە مانگدا (١–٢٨)'
                  )}
                  className="w-16 px-2 py-2 text-xs rounded-xl bg-layer border border-layer-line text-foreground tabular-nums text-center"
                />
              </div>
            </div>

            <button
              type="submit"
              className="py-2 px-4 min-h-[36px] rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>
                {editingTemplateId
                  ? bi('تحديث القالب', 'Update Template', 'نوێکردنەوەی قاڵب')
                  : bi('إضافة قالب', 'Add Template', 'زیادکردنی قاڵب')}
              </span>
            </button>
          </form>

          {/* Existing Templates List */}
          <div className="divide-y divide-card-divider rounded-xl border border-line-2 overflow-hidden">
            {templates.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground-1">
                {bi(
                  'لا توجد قوالب مصاريف متكررة.',
                  'No recurring expense templates configured.',
                  'هیچ قاڵبێکی خەرجیی دووبارەبووەوە دانەنراوە.'
                )}
              </div>
            ) : (
              templates.map((tpl) => {
                const baseCat = bi(
                  EXPENSE_CATEGORY_LABELS[tpl.category].ar,
                  EXPENSE_CATEGORY_LABELS[tpl.category].en,
                  EXPENSE_CATEGORY_CKB[tpl.category]
                );
                return (
                  <div
                    key={tpl.id}
                    className={`p-3 flex flex-wrap items-center justify-between gap-2 bg-card ${
                      !tpl.isActive ? 'opacity-65' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-foreground flex flex-wrap items-center gap-2">
                        <span>{bi(tpl.titleAr, tpl.titleEn)}</span>
                        <span className="px-2 py-0.5 rounded-full bg-surface border border-line-2 text-muted-foreground-1 text-xs font-normal">
                          {tpl.customCategoryLabel
                            ? `${tpl.customCategoryLabel} (${baseCat})`
                            : baseCat}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground-1 tabular-nums">
                          {`${bi('يوم', 'Day', 'ڕۆژی')} ${tpl.dayOfMonth} ${bi('من الشهر', 'monthly', 'مانگانە')}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(tpl.id)}
                        className={`px-2.5 py-1.5 min-h-[36px] rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                          tpl.isActive
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-layer-line bg-layer text-muted-foreground-1'
                        }`}
                      >
                        {tpl.isActive ? (
                          <>
                            <Pause className="size-3.5" />
                            <span>{bi('مفعّل', 'Active', 'چالاک')}</span>
                          </>
                        ) : (
                          <>
                            <Play className="size-3.5" />
                            <span>{bi('متوقف', 'Paused', 'وەستاو')}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => startEditTemplate(tpl)}
                        className="p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-foreground cursor-pointer"
                        title={bi('تعديل القالب', 'Edit Template', 'دەستکاریکردنی قاڵب')}
                        aria-label={bi('تعديل القالب', 'Edit Template', 'دەستکاریکردنی قاڵب')}
                      >
                        <Edit3 className="size-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="p-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-layer-line bg-layer hover:bg-rose-500/10 text-muted-foreground-1 hover:text-rose-700 cursor-pointer"
                        title={bi('حذف القالب', 'Delete Template', 'سڕینەوەی قاڵب')}
                        aria-label={bi('حذف القالب', 'Delete Template', 'سڕینەوەی قاڵب')}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecurringExpensesPanel;
