// =======================================================================
// PhysioRecord — Unified Quick Add Menu (New Patient / Appointment / Invoice)
// Shared by Desktop Slim Rail and Mobile Auto-Hiding Floating Pill
// =======================================================================

import React, { useEffect, useRef } from 'react';
import { UserPlus, CalendarPlus, Receipt } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface QuickAddMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorSide: 'rail' | 'pill';
  triggerRef?: React.RefObject<HTMLElement | null>;
  onNewPatient: () => void;
  onBookAppointment: () => void;
  onNewInvoice: () => void;
  onUserInteraction?: () => void;
}

export const QuickAddMenu: React.FC<QuickAddMenuProps> = ({
  isOpen,
  onClose,
  anchorSide,
  triggerRef,
  onNewPatient,
  onBookAppointment,
  onNewInvoice,
  onUserInteraction,
}) => {
  const { bi } = useLanguage();
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'new_patient',
      testId: 'quick-add-patient-btn',
      icon: UserPlus,
      label: bi('مريض جديد', 'New Patient', 'نەخۆشی نوێ'),
      sub: bi('تسجيل سريع للملف', 'Fast intake drawer', 'تۆماری خێرا'),
      onClick: onNewPatient,
    },
    {
      id: 'book_appointment',
      testId: 'quick-add-appointment-btn',
      icon: CalendarPlus,
      label: bi('حجز موعد', 'Book Appointment', 'تۆمارکردنی نۆرە'),
      sub: bi('جلسة مفردة أو متكررة', 'Single or weekly recurring', 'تاک یان هەفتانە'),
      onClick: onBookAppointment,
    },
    {
      id: 'new_invoice',
      testId: 'quick-add-invoice-btn',
      icon: Receipt,
      label: bi('إصدار فاتورة / دفعة', 'New Invoice / Payment', 'دەرکردنی پسوولە'),
      sub: bi('جلسة · كورس · فحص', 'Session · Course · Eval', 'دانیشتن · کۆرس'),
      onClick: onNewInvoice,
    },
  ];

  const positionClass =
    anchorSide === 'rail'
      ? 'top-0 start-full ms-2.5 w-60'
      : 'bottom-full mb-3 left-1/2 -translate-x-1/2 w-[min(272px,calc(100vw-32px))]';

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="quick-add-menu"
      aria-label={bi('إضافة سريعة', 'Quick Add', 'زیادکردنی خێرا')}
      onPointerDown={() => onUserInteraction?.()}
      className={`absolute z-50 rounded-2xl bg-card/98 backdrop-blur-xl border border-line-2/85 shadow-2xl p-1.5 space-y-0.5 ${positionClass}`}
    >
      <div className="px-2.5 py-1.5 text-xs font-bold text-muted-foreground-1">
        {bi('إضافة سريعة', 'Quick Create', 'زیادکردنی خێرا')}
      </div>
      {actions.map((act) => {
        const Icon = act.icon;
        return (
          <button
            key={act.id}
            type="button"
            role="menuitem"
            data-testid={act.testId}
            onClick={() => {
              onClose();
              act.onClick();
            }}
            className="w-full min-h-[44px] md:min-h-[40px] px-2.5 py-2 rounded-xl hover:bg-primary/10 text-start flex items-center gap-2.5 transition-colors cursor-pointer group"
          >
            <span className="size-8 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground flex items-center justify-center shrink-0 transition-colors">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold text-foreground truncate">
                {act.label}
              </span>
              <span className="block text-xs text-muted-foreground-1 truncate">
                {act.sub}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
