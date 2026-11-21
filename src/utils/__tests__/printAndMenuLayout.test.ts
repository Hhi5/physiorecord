import { describe, it, expect } from 'vitest';
import { computeHorizontalViewportShift } from '../menuViewportClamp';
import {
  A4_HEIGHT_PX,
  A4_SINGLE_PAGE_INNER_BUDGET_PX,
  A4_WIDTH_PX,
  buildCleanReferringDoctorSalutation,
  computeFloatingA4Scale,
  computeSinglePagePrintScale,
} from '../printLayoutFit';

describe('computeHorizontalViewportShift', () => {
  it('returns 0 when the menu already fits within viewport margins', () => {
    expect(computeHorizontalViewportShift({ left: 16, right: 224 }, 390, 8)).toBe(0);
  });

  it('shifts an RTL overflowing menu left when its right edge crosses viewport bounds', () => {
    // Example from Screenshot 1: w-52 (208px) opened near right edge -> left: 255, right: 463 on 390px phone
    const shift = computeHorizontalViewportShift({ left: 255, right: 463 }, 390, 8);
    expect(shift).toBe(382 - 463); // -81px so right lands at 382 (8px inside 390)
    expect(255 + shift).toBeGreaterThanOrEqual(8);
    expect(463 + shift).toBeLessThanOrEqual(382);
  });

  it('shifts an LTR overflowing menu right when its left edge crosses viewport bounds', () => {
    const shift = computeHorizontalViewportShift({ left: -64, right: 144 }, 390, 8);
    expect(shift).toBe(72); // left lands at 8, right at 216 <= 382
  });

  it('clamps shift so the opposite edge does not cross past its viewport margin', () => {
    // 370px wide menu slightly past right edge on 390px screen (max margin box is 374px wide)
    const shift = computeHorizontalViewportShift({ left: 20, right: 390 }, 390, 8);
    expect(shift).toBe(-8); // left: 12, right: 382
  });

  it('returns 0 when menu already exceeds both left and right viewport edges', () => {
    expect(computeHorizontalViewportShift({ left: -10, right: 410 }, 390, 8)).toBe(0);
  });
});

describe('computeSinglePagePrintScale & Floating A4 Preview', () => {
  it('returns 1 when content height fits inside A4 single-page budget', () => {
    expect(computeSinglePagePrintScale({ contentHeightPx: 880 })).toBe(1);
    expect(
      computeSinglePagePrintScale({ contentHeightPx: A4_SINGLE_PAGE_INNER_BUDGET_PX })
    ).toBe(1);
  });

  it('computes proportional zoom < 1 so overflowing content fits on a single A4 page', () => {
    const scale = computeSinglePagePrintScale({
      contentHeightPx: 1120,
      targetHeightPx: A4_SINGLE_PAGE_INNER_BUDGET_PX,
    });
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThan(0.84);
    expect(1120 * scale).toBeLessThanOrEqual(A4_SINGLE_PAGE_INNER_BUDGET_PX);
  });

  it('respects minimum scale floor for extremely long documents', () => {
    expect(
      computeSinglePagePrintScale({
        contentHeightPx: 2500,
        targetHeightPx: A4_SINGLE_PAGE_INNER_BUDGET_PX,
        minScale: 0.72,
      })
    ).toBe(0.72);
  });

  it('keeps floating A4 paper miniature with clean margins on mobile and desktop', () => {
    const mobileMini = computeFloatingA4Scale({
      containerWidth: 390,
      containerHeight: 600,
      contentHeightPx: A4_HEIGHT_PX,
      zoomMode: 'mini',
    });
    expect(mobileMini.scaledWidth).toBeLessThanOrEqual(340);
    expect(mobileMini.scaledWidth).toBeGreaterThanOrEqual(240);
    expect(mobileMini.scaledHeight).toBeLessThanOrEqual(540);

    const desktopMini = computeFloatingA4Scale({
      containerWidth: 1440,
      containerHeight: 740,
      contentHeightPx: A4_HEIGHT_PX,
      zoomMode: 'mini',
    });
    expect(desktopMini.scaledWidth).toBeLessThanOrEqual(500);
    expect(desktopMini.scaledWidth).toBeGreaterThanOrEqual(360);

    const desktopReadable = computeFloatingA4Scale({
      containerWidth: 1440,
      containerHeight: 740,
      contentHeightPx: A4_HEIGHT_PX,
      zoomMode: 'readable',
    });
    expect(desktopReadable.scale).toBeGreaterThan(desktopMini.scale);
    expect(desktopReadable.scaledWidth).toBeLessThanOrEqual(A4_WIDTH_PX);
  });

  it('prevents duplicated Arabic/English doctor titles in referral salutations', () => {
    expect(
      buildCleanReferringDoctorSalutation({ doctorName: 'الزميل الدكتور', isAr: true })
    ).toBe('تحية طيبة وبعد، إلى الزميل الدكتور المحترم');
    expect(
      buildCleanReferringDoctorSalutation({ doctorName: 'د. علي الشمري', isAr: true })
    ).toBe('تحية طيبة وبعد، إلى د. علي الشمري المحترم');
    expect(
      buildCleanReferringDoctorSalutation({
        doctorName: 'أحمد كريم',
        doctorSpecialty: 'جراحة العظام',
        isAr: true,
      })
    ).toBe('تحية طيبة وبعد، إلى الدكتور/ة أحمد كريم المحترم (جراحة العظام)');
    expect(buildCleanReferringDoctorSalutation({ doctorName: '', isAr: true })).toBe(
      'تحية طيبة وبعد، إلى الزميل الدكتور المحترم'
    );
    expect(
      buildCleanReferringDoctorSalutation({ doctorName: 'Dr. Sarah Al-Ani', isAr: false })
    ).toBe('Dear Dr. Sarah Al-Ani,');
    expect(buildCleanReferringDoctorSalutation({ doctorName: 'John Doe', isAr: false })).toBe(
      'Dear Dr. John Doe,'
    );
    expect(
      buildCleanReferringDoctorSalutation({ doctorName: 'Colleague Physician', isAr: false })
    ).toBe('Dear Colleague Physician,');
    expect(buildCleanReferringDoctorSalutation({ doctorName: '', isAr: false })).toBe(
      'Dear Colleague Physician,'
    );
  });
});
