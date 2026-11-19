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
  Money,
  MoneyInput,
  Num,
} from '../ui/Primitives';
import { ModalDialog } from '../ui/Dialog';
import type {
  ClinicExpenseIQD,
  ExpenseCategoryIQD,
  RecurringExpenseTemplate,
} from '../../types/clinicManagement';
import {
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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

  // Add Card Modal & Details Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCardTemplateId, setSelectedCardTemplateId] = useState<string | null>(null);
  const [addInitialAmountIQD, setAddInitialAmountIQD] = useState<number>(0);
  const [addInitialDate, setAddInitialDate] = useState<string>(() => localDate());
  const [addInitialNotes, setAddInitialNotes] = useState<string>('');

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

  const currentMonthKey = localDate().slice(0, 7);

  const activeTemplateCards = useMemo(() => {
    const monthExpenses = expenses.filter((exp) =>
      (exp.date || '').startsWith(currentMonthKey)
    );
    return templates
      .filter((t) => t.isActive)
      .map((tpl) => {
        const clampedDay = Math.max(
          1,
          Math.min(28, Math.round(Number(tpl.dayOfMonth) || 1))
        );
        const suggestedDueDate = `${currentMonthKey}-${String(clampedDay).padStart(2, '0')}`;
        const loggedThisMonth = monthExpenses.filter(
          (exp) =>
            exp.recurringTemplateId === tpl.id ||
            (exp.category === tpl.category &&
              ((tpl.titleAr && exp.titleAr.trim() === tpl.titleAr.trim()) ||
                (tpl.titleEn && exp.titleEn.trim() === tpl.titleEn.trim())))
        );
        const totalPaidThisMonth = loggedThisMonth.reduce(
          (sum, e) => sum + (e.amountIQD || 0),
          0
        );
        return {
          tpl,
          suggestedDueDate,
          loggedThisMonth,
          totalPaidThisMonth,
          isPaidThisMonth: loggedThisMonth.length > 0,
        };
      });
  }, [templates, expenses, currentMonthKey]);

  const selectedCardInfo = useMemo(
    () =>
      selectedCardTemplateId
        ? activeTemplateCards.find((c) => c.tpl.id === selectedCardTemplateId) || null
        : null,
    [activeTemplateCards, selectedCardTemplateId]
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
    setAddInitialAmountIQD(0);
    setAddInitialDate(localDate());
    setAddInitialNotes('');
  };

  const openAddCardModal = () => {
    resetTemplateForm();
    setIsAddModalOpen(true);
  };

  const startEditTemplate = (tpl: RecurringExpenseTemplate) => {
    setEditingTemplateId(tpl.id);
    setTplCategory(tpl.category);
    setTplCustomCategoryLabel(tpl.customCategoryLabel || '');
    setTplTitleAr(tpl.titleAr);
    setTplTitleEn(tpl.titleEn);
    setTplDayOfMonth(Math.max(1, Math.min(28, tpl.dayOfMonth || 1)));
    setAddInitialAmountIQD(0);
    setAddInitialDate(localDate());
    setAddInitialNotes('');
    setSelectedCardTemplateId(null);
    setIsAddModalOpen(true);
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
    let targetTemplateId = editingTemplateId;
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
      const createdId = `rec_exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      targetTemplateId = createdId;
      const created: RecurringExpenseTemplate = {
        id: createdId,
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

    if (!editingTemplateId && addInitialAmountIQD > 0 && targetTemplateId) {
      const updatedExpenses = ClinicOperationsService.logRecurringExpenseForMonth({
        templateId: targetTemplateId,
        amountIQD: addInitialAmountIQD,
        date: addInitialDate || localDate(),
        customCategoryLabel: cleanCustomLabel,
        notes: addInitialNotes.trim() || undefined,
      });
      onExpensesUpdated(updatedExpenses);
      setTemplates(ClinicOperationsService.getRecurringExpenseTemplates());
    }

    resetTemplateForm();
    setIsAddModalOpen(false);
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
      className="p-4 sm:p-5 border-b border-card-divider bg-surface/40 space-y-3.5 text-xs"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
            <Repeat className="size-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
              <span>{bi('المصاريف المتكررة', 'Recurring Expenses', 'خەرجییە دووبارەبووەکان')}</span>
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold text-xs tabular-nums">
                {dueSuggestions.length > 0
                  ? `${dueSuggestions.length} ${bi('مستحق', 'due', 'شایستە')}`
                  : bi('مكتمل', 'All paid', 'تەواو')}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground-1">
              {bi(
                'أضف بطاقة مصروف بالضغط على + أو اضغط على أي بطاقة لعرض التفاصيل والدفع',
                'Tap + to add a recurring card or tap any card for details and payment',
                'بۆ زیادکردنی کارت کرتە لە + بکە یان کرتە لە هەر کارتێک بکە بۆ وردەکاری و پارەدان'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={openAddCardModal}
            aria-label={bi('إضافة بطاقة مصروف', 'Add recurring expense card', 'زیادکردنی کارتی خەرجی')}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
          >
            <Plus className="size-4" />
            <span>{bi('إضافة', 'Add', 'زیادکردن')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowManager((v) => !v)}
            aria-label={bi('إدارة القوالب والفئات', 'Manage Templates & Categories', 'بەڕێوەبردنی قاڵب و پۆلەکان')}
            title={bi('إدارة القوالب والفئات', 'Manage Templates & Categories', 'بەڕێوەبردنی قاڵب و پۆلەکان')}
            className={`min-h-[36px] min-w-[36px] px-2.5 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              showManager
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-layer-line bg-layer hover:bg-layer-hover text-foreground'
            }`}
          >
            <Settings2 className="size-3.5 text-primary" />
            <span className="hidden sm:inline">
              {bi('إدارة القوالب', 'Manage', 'بەڕێوەبردن')}
            </span>
          </button>
        </div>
      </div>

      {/* Compact Small Cards Grid */}
      {activeTemplateCards.length === 0 ? (
        <div className="p-4 rounded-2xl bg-card border border-dashed border-line-2 text-center text-muted-foreground-1 space-y-2">
          <p className="text-xs font-medium">
            {bi(
              'لا توجد مصاريف متكررة مضافة بعد. اضغط على زر (+) لإضافة بطاقة مصروف جديدة.',
              'No recurring expense cards yet. Tap (+) to add one.',
              'هێشتا هیچ کارتێکی خەرجیی دووبارەبووەوە نییە. کرتە لە (+) بکە بۆ زیادکردن.'
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {activeTemplateCards.map((card) => {
            const { tpl, suggestedDueDate, loggedThisMonth, totalPaidThisMonth, isPaidThisMonth } = card;
            const catLabel =
              tpl.customCategoryLabel?.trim() ||
              bi(
                EXPENSE_CATEGORY_LABELS[tpl.category].ar,
                EXPENSE_CATEGORY_LABELS[tpl.category].en,
                EXPENSE_CATEGORY_CKB[tpl.category]
              );
            const lastPayDate = loggedThisMonth[loggedThisMonth.length - 1]?.date || suggestedDueDate;

            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  setFormNotice(null);
                  setSelectedCardTemplateId(tpl.id);
                }}
                className={`w-full text-start p-3 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between gap-2 shadow-2xs hover:shadow-sm ${
                  isPaidThisMonth
                    ? 'bg-card border-emerald-500/25 hover:border-emerald-500/50'
                    : 'bg-card border-card-line hover:border-primary/45'
                }`}
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <div className="min-w-0">
                    <div className="font-bold text-foreground text-xs sm:text-sm truncate">
                      {bi(tpl.titleAr, tpl.titleEn)}
                    </div>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-surface border border-line-2 text-muted-foreground-1 text-[11px]">
                      {catLabel}
                    </span>
                  </div>

                  {isPaidThisMonth ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold shrink-0">
                      <CheckCircle2 className="size-3" />
                      <span>{bi('مدفوع', 'Paid', 'دراوە')}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-800 dark:text-amber-300 text-[11px] font-bold shrink-0">
                      <span className="size-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
                      <span>{bi('مستحق', 'Due', 'شایستە')}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-card-divider/70 w-full text-[11px] tabular-nums">
                  {isPaidThisMonth ? (
                    <span className="font-bold text-emerald-700 dark:text-emerald-400 truncate">
                      <Money amount={totalPaidThisMonth} colorize={false} /> ·{' '}
                      <bdi dir="ltr" className="font-normal text-muted-foreground-1">
                        {formatDateDDMMYYYY(lastPayDate)}
                      </bdi>
                    </span>
                  ) : (
                    <span className="text-muted-foreground-1 inline-flex items-center gap-1 truncate">
                      <CalendarCheck2 className="size-3 text-primary shrink-0" />
                      <span>
                        {bi('الاستحقاق:', 'Due:', 'شایستە:')}{' '}
                        <bdi dir="ltr">{formatDateDDMMYYYY(suggestedDueDate)}</bdi>
                      </span>
                    </span>
                  )}

                  <span className="inline-flex items-center gap-0.5 font-bold text-primary shrink-0">
                    <span>{bi('التفاصيل', 'Details', 'وردەکاری')}</span>
                    {isRtl ? <ChevronLeft className="size-3" /> : <ChevronRight className="size-3" />}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Template Manager Compact List (when toggled) */}
      {showManager && (
        <div className="p-3.5 rounded-2xl bg-card border border-card-line space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-foreground">
              {bi(
                'إدارة كافة القوالب (المفعّلة والمتوقفة)',
                'All Recurring Templates (Active & Paused)',
                'بەڕێوەبردنی هەموو قاڵبەکان (چالاک و وەستاو)'
              )}
            </h3>
            <button
              type="button"
              onClick={openAddCardModal}
              className="text-xs font-bold text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <Plus className="size-3.5" />
              <span>{bi('إضافة قالب جديد', 'Add New Template', 'زیادکردنی قاڵبی نوێ')}</span>
            </button>
          </div>

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
                        className={`px-2.5 py-1.5 min-h-[34px] rounded-lg border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer ${
                          tpl.isActive
                            ? 'border-layer-line bg-layer text-emerald-700 dark:text-emerald-300'
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
                        className="p-1.5 min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-foreground cursor-pointer"
                        title={bi('تعديل القالب', 'Edit Template', 'دەستکاریکردنی قاڵب')}
                        aria-label={bi('تعديل القالب', 'Edit Template', 'دەستکاریکردنی قاڵب')}
                      >
                        <Edit3 className="size-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="p-1.5 min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border border-layer-line bg-layer hover:bg-layer-hover text-muted-foreground-1 hover:text-rose-700 cursor-pointer"
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

      {/* Add / Edit Recurring Expense Card Modal */}
      <ModalDialog
        isOpen={isAddModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddModalOpen(false);
            resetTemplateForm();
          }
        }}
        title={
          editingTemplateId
            ? bi('تعديل بطاقة المصروف', 'Edit Expense Card', 'دەستکاریکردنی کارتی خەرجی')
            : bi('إضافة بطاقة مصروف متكرر', 'Add Recurring Expense Card', 'زیادکردنی کارتی خەرجیی دووبارەبووەوە')
        }
        ariaLabel={bi('إضافة أو تعديل بطاقة مصروف', 'Add or Edit Expense Card', 'زیادکردن یان دەستکاریکردنی کارتی خەرجی')}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        size="md"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <form onSubmit={handleSaveTemplate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="rec-tpl-title-ar" className="block text-xs font-bold text-foreground mb-1">
                {bi('اسم البطاقة / المصروف *:', 'Card / Expense Name *:', 'ناوی کارت / خەرجی *:')}
              </label>
              <input
                id="rec-tpl-title-ar"
                type="text"
                required
                value={tplTitleAr}
                onChange={(e) => setTplTitleAr(e.target.value)}
                placeholder={bi('مثال: إيجار العيادة، اشتراك الإنترنت...', 'e.g., Clinic Rent, Internet Bill...', 'نموونە: کرێی کلینیک، پارەی ئینتەرنێت...')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="rec-tpl-cat" className="block text-xs font-bold text-foreground mb-1">
                {bi('الفئة:', 'Category:', 'پۆل:')}
              </label>
              <select
                id="rec-tpl-cat"
                value={tplCategory}
                onChange={(e) => setTplCategory(e.target.value as ExpenseCategoryIQD)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line text-foreground"
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
              <label htmlFor="rec-tpl-day" className="block text-xs font-bold text-foreground mb-1">
                {bi('يوم الاستحقاق بالشهر (1–28):', 'Monthly Due Day (1–28):', 'ڕۆژی شایستەبوون (١–٢٨):')}
              </label>
              <input
                id="rec-tpl-day"
                type="number"
                min={1}
                max={28}
                dir="ltr"
                value={tplDayOfMonth}
                onChange={(e) =>
                  setTplDayOfMonth(Math.max(1, Math.min(28, Number(e.target.value) || 1)))
                }
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line text-foreground tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="rec-tpl-custom-cat" className="block text-xs font-bold text-foreground mb-1">
                {bi('تصنيف مخصص (اختياري):', 'Custom Label (Optional):', 'ناوی تایبەت (بژاردەیی):')}
              </label>
              <input
                id="rec-tpl-custom-cat"
                type="text"
                value={tplCustomCategoryLabel}
                onChange={(e) => setTplCustomCategoryLabel(e.target.value)}
                placeholder={bi('مثال: اشتراكات / نظافة...', 'e.g., Subscriptions...', 'نموونە: بەشداریکردن...')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line text-foreground"
              />
            </div>

            <div>
              <label htmlFor="rec-tpl-title-en" className="block text-xs font-bold text-foreground mb-1">
                {bi('الاسم بالإنجليزية (اختياري):', 'English Name (Optional):', 'ناو بە ئینگلیزی (بژاردەیی):')}
              </label>
              <input
                id="rec-tpl-title-en"
                type="text"
                dir="ltr"
                value={tplTitleEn}
                onChange={(e) => setTplTitleEn(e.target.value)}
                placeholder="English title"
                className="w-full px-3 py-2 text-xs rounded-xl bg-surface border border-layer-line text-foreground"
              />
            </div>
          </div>

          {!editingTemplateId && (
            <div className="p-3.5 rounded-2xl bg-surface border border-line-2 space-y-3">
              <div className="text-xs font-bold text-foreground">
                {bi('تفاصيل الدفع لهذا الشهر (اختياري):', 'Payment Details for This Month (Optional):', 'وردەکاری پارەدانی ئەم مانگە (بژاردەیی):')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rec-add-amt" className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                    {bi('المبلغ المدفوع:', 'Amount Paid:', 'بڕی پارەدراو:')}
                  </label>
                  <MoneyInput
                    id="rec-add-amt"
                    ariaLabel={bi('المبلغ المدفوع', 'Amount Paid', 'بڕی پارەدراو')}
                    value={addInitialAmountIQD}
                    onChange={(val) => setAddInitialAmountIQD(val)}
                  />
                </div>
                <div>
                  <label htmlFor="rec-add-date" className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                    {bi('تاريخ الدفع:', 'Payment Date:', 'بەرواری پارەدان:')}
                  </label>
                  <DatePickerInput
                    id="rec-add-date"
                    ariaLabel={bi('تاريخ الدفع', 'Payment Date', 'بەرواری پارەدان')}
                    value={addInitialDate}
                    onChange={(val) => setAddInitialDate(val)}
                  />
                </div>
              </div>
              <input
                type="text"
                value={addInitialNotes}
                onChange={(e) => setAddInitialNotes(e.target.value)}
                placeholder={bi('ملاحظات الدفع (اختياري)...', 'Payment notes (optional)...', 'تێبینی پارەدان (بژاردەیی)...')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-card border border-layer-line text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-card-divider">
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                resetTemplateForm();
              }}
              className="min-h-[38px] px-4 py-2 rounded-xl bg-layer border border-layer-line text-xs font-semibold text-foreground cursor-pointer"
            >
              {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
            </button>
            <button
              type="submit"
              className="min-h-[38px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Check className="size-3.5" />
              <span>{bi('تم', 'Done', 'تەواو')}</span>
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Recurring Expense Card Details & Payment Modal */}
      <ModalDialog
        isOpen={Boolean(selectedCardInfo)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCardTemplateId(null);
            setFormNotice(null);
          }
        }}
        title={
          selectedCardInfo ? bi(selectedCardInfo.tpl.titleAr, selectedCardInfo.tpl.titleEn) : ''
        }
        subtitle={
          selectedCardInfo
            ? `${
                selectedCardInfo.tpl.customCategoryLabel?.trim() ||
                bi(
                  EXPENSE_CATEGORY_LABELS[selectedCardInfo.tpl.category].ar,
                  EXPENSE_CATEGORY_LABELS[selectedCardInfo.tpl.category].en,
                  EXPENSE_CATEGORY_CKB[selectedCardInfo.tpl.category]
                )
              } · ${bi('استحقاق يوم', 'Monthly day', 'ڕۆژی')} ${selectedCardInfo.tpl.dayOfMonth}`
            : undefined
        }
        ariaLabel={bi('تفاصيل المصروف المتكرر', 'Recurring Expense Details', 'وردەکاری خەرجیی دووبارەبووەوە')}
        closeLabel={bi('إغلاق', 'Close', 'داخستن')}
        size="md"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {selectedCardInfo && (() => {
          const { tpl, suggestedDueDate, loggedThisMonth, totalPaidThisMonth, isPaidThisMonth } = selectedCardInfo;
          const draft = getDraft(tpl.id);

          return (
            <div className="space-y-4">
              {/* Current Month Summary Strip */}
              <div className="p-3.5 rounded-2xl bg-surface border border-card-line flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="text-[11px] text-muted-foreground-1">
                    {bi('حالة الدفع لهذا الشهر:', 'This Month Status:', 'باری پارەدانی ئەم مانگە:')}
                  </div>
                  {isPaidThisMonth ? (
                    <div className="text-sm font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="size-4" />
                      <span>{bi('مدفوع:', 'Paid:', 'دراوە:')}</span>
                      <Money amount={totalPaidThisMonth} colorize={false} />
                    </div>
                  ) : (
                    <div className="text-sm font-black text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <CalendarCheck2 className="size-4" />
                      <span>{bi('مستحق للدفع', 'Payment Due', 'شایستەی پارەدانە')}</span>
                    </div>
                  )}
                </div>

                <div className="text-end text-xs text-muted-foreground-1 tabular-nums">
                  <div>{bi('تاريخ الاستحقاق:', 'Due Date:', 'بەرواری شایستە:')}</div>
                  <div className="font-bold text-foreground">
                    <bdi dir="ltr">{formatDateDDMMYYYY(suggestedDueDate)}</bdi>
                  </div>
                </div>
              </div>

              {/* Logged Payments This Month */}
              {loggedThisMonth.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-foreground">
                    {bi('الدفعات المسجلة هذا الشهر:', 'Logged Payments This Month:', 'پارەدانە تۆمارکراوەکانی ئەم مانگە:')}
                  </div>
                  <div className="space-y-1.5">
                    {loggedThisMonth.map((exp) => (
                      <div
                        key={exp.id}
                        className="p-2.5 rounded-xl bg-surface border border-line-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-foreground tabular-nums">
                            <bdi dir="ltr">{formatDateDDMMYYYY(exp.date)}</bdi> · {exp.paidBy}
                          </div>
                          {exp.notes && (
                            <div className="text-[11px] text-muted-foreground-1 mt-0.5 truncate">
                              {exp.notes}
                            </div>
                          )}
                        </div>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                          <Money amount={exp.amountIQD} colorize={false} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formNotice && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
                  <span>{formNotice}</span>
                  <button
                    type="button"
                    onClick={() => setFormNotice(null)}
                    className="p-1 rounded hover:bg-black/5 cursor-pointer"
                    aria-label={bi('إغلاق', 'Dismiss', 'داخستن')}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              {/* Log New Payment Section */}
              <div className="p-3.5 rounded-2xl bg-surface border border-line-2 space-y-3">
                <div className="text-xs font-bold text-foreground">
                  {isPaidThisMonth
                    ? bi('تسجيل دفعة إضافية:', 'Log Another Payment:', 'تۆمارکردنی پارەدانی زیاتر:')
                    : bi('تسجيل الدفع الآن:', 'Log Payment Now:', 'تۆمارکردنی پارەدان ئێستا:')}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor={`rec-amt-${tpl.id}`} className="block text-xs font-semibold text-muted-foreground-1 mb-1">
                      {bi('المبلغ:', 'Amount:', 'بڕ:')}
                    </label>
                    <MoneyInput
                      id={`rec-amt-${tpl.id}`}
                      ariaLabel={`${bi('المبلغ', 'Amount', 'بڕ')} — ${bi(tpl.titleAr, tpl.titleEn)}`}
                      value={draft.amountIQD}
                      onChange={(val) => patchDraft(tpl.id, { amountIQD: val })}
                    />
                  </div>
                  <div>
                    <label htmlFor={`rec-date-${tpl.id}`} className="block text-xs font-semibold text-muted-foreground-1 mb-1">
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
                  onChange={(e) => patchDraft(tpl.id, { notes: e.target.value })}
                  aria-label={bi('ملاحظات المصروف المتكرر', 'Recurring expense notes', 'تێبینی خەرجیی دووبارەبووەوە')}
                  placeholder={bi('ملاحظات (اختياري)...', 'Notes (optional)...', 'تێبینی (بژاردەیی)...')}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-card border border-layer-line text-foreground focus:outline-none focus:border-primary"
                />

                <button
                  type="button"
                  disabled={draft.amountIQD <= 0}
                  onClick={() => handleLogDueExpense(tpl.id)}
                  className="w-full py-2.5 px-4 min-h-[38px] rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:bg-card disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed"
                >
                  <Check className="size-4" />
                  <span>{bi('تم · تسجيل الدفع', 'Done · Log Payment', 'تەواو · تۆمارکردنی پارەدان')}</span>
                </button>
              </div>

              {/* Card Management Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-card-divider">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => startEditTemplate(tpl)}
                    className="min-h-[34px] px-3 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="size-3.5" />
                    <span>{bi('تعديل البطاقة', 'Edit Card', 'دەستکاریکردن')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleToggleActive(tpl.id);
                      setSelectedCardTemplateId(null);
                    }}
                    className="min-h-[34px] px-3 py-1.5 rounded-xl border border-layer-line bg-layer hover:bg-layer-hover text-muted-foreground-1 hover:text-foreground text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pause className="size-3.5" />
                    <span>{bi('إيقاف مؤقت', 'Pause', 'وەستاندن')}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    handleDeleteTemplate(tpl.id);
                    setSelectedCardTemplateId(null);
                  }}
                  className="min-h-[34px] px-3 py-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/15 text-rose-700 dark:text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                  <span>{bi('حذف', 'Delete', 'سڕینەوە')}</span>
                </button>
              </div>
            </div>
          );
        })()}
      </ModalDialog>
    </div>
  );
};

export default RecurringExpensesPanel;
