import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryDatabase } from '../../crypto/__tests__/testDbHelper';
import {
  CONSTANTS,
  CURRENT_DEK_VERSION,
  bindDekToGeneration,
  deriveKEK,
  generateAndWrapOperationalDEK,
  generateVerifier,
  randomBytes,
} from '../../crypto/vault';
import type { PhysioRecordDatabase } from '../../db/db';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type {
  ClinicAppointment,
  FinancialInvoiceIQD,
} from '../../types/clinicManagement';
import {
  DEFAULT_ICS_EXPORT_OPTIONS,
  buildDocumentShareSummaryText,
  buildDocumentWhatsAppFallbackUrl,
  buildIcsCalendarContent,
  buildShareableDocumentHtmlFile,
  computeFourPointCobbAngleDegrees,
  computePatientVisitCardSummary,
  computePhotoCalibrationScale,
  computePhotoDistanceMetrics,
  computeThreePointAngleDegrees,
  createDefaultPhotoArrowAnnotation,
  createDefaultPhotoCobbMeasurement,
  createDefaultPhotoDistanceMeasurement,
  findNextUpcomingAppointment,
  formatPhotoDistanceBadgeText,
  renderAnnotatedPhotoDataUrl,
  shareDocumentViaWebShareOrFallback,
} from '../sharingInteropPhaseE';

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function setupInitializedVault(initialVerno = 10): Promise<{
  db: PhysioRecordDatabase;
  dek: CryptoKey;
}> {
  const db = createInMemoryDatabase(initialVerno);
  const salt = randomBytes(CONSTANTS.SALT_BYTES);
  const kek = await deriveKEK('PhaseE-Test-Pass!1', salt, 1000);
  const { operationalDek, wrappedDek, wrappedDekIv } =
    await generateAndWrapOperationalDEK(kek, 1);
  const { verifierIv, verifierCiphertext } = await generateVerifier(kek);

  await db.vaultMeta.put({
    id: 'auth',
    salt,
    wrappedDek,
    wrappedDekIv,
    verifierIv,
    verifierCiphertext,
    schemaVersion: db.verno,
    kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
    kdfIterations: 1000,
    dekVersion: CURRENT_DEK_VERSION,
    encryptionInvocationCount: 0,
    vaultGeneration: 1,
  });

  bindDekToGeneration(operationalDek, 1);
  await ClinicOperationsService.hydrateEncryptedCache(operationalDek, db);
  return { db, dek: operationalDek };
}

describe('Phase E — Sharing & Interop (E1–E4)', () => {
  beforeEach(() => {
    ClinicOperationsService.clearInMemoryCache();
  });

  it('E1: builds standalone offline share HTML files, uses Web Share file path when supported, and falls back to +964 WhatsApp & clipboard', async () => {
    const file = buildShareableDocumentHtmlFile({
      title: 'وصل قبض رقم REC-101',
      docType: 'receipt',
      sheetHtml: '<div><h1>Receipt REC-101</h1><script>alert(1)</script><p>25,000 د.ع</p></div>',
      dir: 'rtl',
      lang: 'ar',
      fileNameBase: 'receipt REC-101',
    });

    expect(file.name).toBe('receipt-REC-101.html');
    expect(file.type).toContain('text/html');
    const htmlBody = await file.text();
    expect(htmlBody).toContain('dir="rtl"');
    expect(htmlBody).toContain('25,000 د.ع');
    expect(htmlBody).not.toContain('<script>');

    const summary = buildDocumentShareSummaryText({
      docTitle: 'وصل قبض',
      clinicName: 'عيادة بغداد للعلاج الطبيعي',
      patientName: 'علي حسين',
      amountFormatted: '25,000 د.ع',
      nextAppointmentText: '15/11/2026 · 04:00 م',
      remainingSessions: 5,
      lang: 'ar',
    });
    expect(summary).toContain('علي حسين');
    expect(summary).toContain('25,000 د.ع');
    expect(summary).toContain('5');

    // Supported Web Share API with files
    let sharedPayload: unknown = null;
    const supportedRes = await shareDocumentViaWebShareOrFallback({
      title: 'وصل قبض',
      text: summary,
      file,
      patientPhone: '07701234567',
      navigatorObj: {
        canShare: ({ files }) => Boolean(files && files.length === 1),
        share: async (data) => {
          sharedPayload = data;
        },
      },
    });
    expect(supportedRes.method).toBe('web_share_file');
    expect((sharedPayload as { files?: File[] })?.files).toHaveLength(1);
    expect(supportedRes.whatsappUrl).toMatch(/^https:\/\/wa\.me\/9647701234567\?text=/);

    // Unsupported Web Share fallback -> +964 WhatsApp URL + clipboard
    let clipboardText = '';
    const fallbackRes = await shareDocumentViaWebShareOrFallback({
      title: 'وصل قبض',
      text: summary,
      file,
      patientPhone: '0780 999 8877',
      navigatorObj: {
        clipboard: {
          writeText: async (txt) => {
            clipboardText = txt;
          },
        },
      },
    });
    expect(fallbackRes.method).toBe('whatsapp_url');
    expect(fallbackRes.whatsappUrl).toMatch(/^https:\/\/wa\.me\/9647809998877\?text=/);
    expect(clipboardText).toBe(summary);

    // No-phone fallback builds general wa.me share URL and resolves clipboard
    const noPhoneWa = buildDocumentWhatsAppFallbackUrl(undefined, 'Hello PhysioRecord');
    expect(noPhoneWa).toBe('https://wa.me/?text=Hello%20PhysioRecord');
  });

  it('E2: exports RFC 5545 .ics calendar strictly matching user-selected privacy fields & selects next appointment', () => {
    const appts: ClinicAppointment[] = [
      {
        id: 'appt_cancelled',
        patientId: 'p1',
        patientName: 'مريض ملغى',
        patientPhone: '07700001111',
        therapistName: 'د. أحمد',
        date: '2026-11-15',
        startTime: '09:00',
        durationMinutes: 45,
        visitType: 'follow_up',
        status: 'cancelled',
        roomOrBed: 'Room 1',
      },
      {
        id: 'appt_next_2',
        patientId: 'p1',
        patientName: 'نور الهدى كريم',
        patientPhone: '07705556677',
        therapistName: 'د. زينب سعد',
        date: '2026-11-16',
        startTime: '17:00',
        durationMinutes: 60,
        visitType: 'initial_evaluation',
        appointmentMode: 'home_visit',
        homeVisitAddress: {
          governorate: 'بغداد',
          area: 'الكرادة',
          nearestLandmark: 'ساحة كهرمانة',
        },
        status: 'scheduled',
        notes: 'تقييم رباط صليبي',
      },
      {
        id: 'appt_next_1',
        patientId: 'p2',
        patientName: 'مصطفى جبار',
        patientPhone: '07801112233',
        therapistName: 'د. سجاد',
        date: '2026-11-15',
        startTime: '23:30',
        durationMinutes: 45,
        visitType: 'follow_up',
        roomOrBed: 'وحدة العلاج 2',
        status: 'scheduled',
      },
    ];

    const nextOverall = findNextUpcomingAppointment(appts, {
      fromDate: '2026-11-15',
      fromTime: '10:00',
    });
    expect(nextOverall?.id).toBe('appt_next_1');

    // Privacy-minimal export: NO name, NO phone, NO therapist, NO location, NO notes, NO alarm
    const minimalIcs = buildIcsCalendarContent({
      appointments: appts,
      options: {
        includePatientName: false,
        includePatientPhone: false,
        includeTherapistName: false,
        includeLocationAndRoom: false,
        includeVisitTypeAndNotes: false,
        includeReminderAlarmMinutes: null,
      },
      lang: 'ar',
    });

    expect(minimalIcs).toContain('BEGIN:VCALENDAR');
    expect(minimalIcs).toContain('END:VCALENDAR');
    // Cancelled appointment excluded
    expect(minimalIcs).not.toContain('appt_cancelled');
    // Midnight rollover: 2026-11-15 23:30 + 45m -> 20261116T001500
    expect(minimalIcs).toContain('DTSTART:20261115T233000');
    expect(minimalIcs).toContain('DTEND:20261116T001500');
    // Zero PII leaked
    expect(minimalIcs).not.toContain('مصطفى جبار');
    expect(minimalIcs).not.toContain('نور الهدى كريم');
    expect(minimalIcs).not.toContain('07801112233');
    expect(minimalIcs).not.toContain('د. سجاد');
    expect(minimalIcs).not.toContain('وحدة العلاج 2');
    expect(minimalIcs).not.toContain('تقييم رباط صليبي');
    expect(minimalIcs).not.toContain('BEGIN:VALARM');

    // Full-fields export: includes user-chosen fields + 30m VALARM
    const fullIcs = buildIcsCalendarContent({
      appointments: [appts[1]],
      options: {
        ...DEFAULT_ICS_EXPORT_OPTIONS,
        includePatientName: true,
        includePatientPhone: true,
        includeTherapistName: true,
        includeLocationAndRoom: true,
        includeVisitTypeAndNotes: true,
        includeReminderAlarmMinutes: 30,
      },
      lang: 'ar',
    });
    expect(fullIcs).toContain('نور الهدى كريم');
    expect(fullIcs).toContain('07705556677');
    expect(fullIcs).toContain('د. زينب سعد');
    expect(fullIcs).toContain('بغداد');
    expect(fullIcs).toContain('ساحة كهرمانة');
    expect(fullIcs).toContain('تقييم رباط صليبي');
    expect(fullIcs).toContain('BEGIN:VALARM');
    expect(fullIcs).toContain('TRIGGER:-PT30M');
  });

  it('E3: computes patient visit card next appointment & remaining package sessions ignoring voided invoices', () => {
    const appointments: ClinicAppointment[] = [
      {
        id: 'a_past',
        patientId: 'pt_visit',
        patientName: 'هدى عادل',
        therapistName: 'د. علي',
        date: '2026-11-10',
        startTime: '10:00',
        durationMinutes: 45,
        visitType: 'follow_up',
        status: 'completed',
      },
      {
        id: 'a_future_2',
        patientId: 'pt_visit',
        patientName: 'هدى عادل',
        therapistName: 'د. علي',
        date: '2026-11-20',
        startTime: '16:00',
        durationMinutes: 45,
        visitType: 'follow_up',
        status: 'scheduled',
      },
      {
        id: 'a_future_1',
        patientId: 'pt_visit',
        patientName: 'هدى عادل',
        therapistName: 'د. علي',
        date: '2026-11-16',
        startTime: '11:30',
        durationMinutes: 45,
        visitType: 'follow_up',
        status: 'scheduled',
      },
    ];

    const invoices: FinancialInvoiceIQD[] = [
      {
        id: 'inv_active_course',
        invoiceNumber: 'INV-2026-001',
        patientId: 'pt_visit',
        patientName: 'هدى عادل',
        date: '2026-11-01',
        invoiceType: 'rehab_package',
        titleAr: 'كورس تأهيل 10 جلسات',
        titleEn: '10-Session Rehab Package',
        totalAmountIQD: 250000,
        discountIQD: 0,
        netAmountIQD: 250000,
        paidAmountIQD: 200000,
        balanceDueIQD: 50000,
        status: 'partial',
        packageTotalSessions: 10,
        packageUsedSessions: 4,
        payments: [],
        createdBy: 'Admin',
      },
      {
        id: 'inv_void_course',
        invoiceNumber: 'INV-2026-002',
        patientId: 'pt_visit',
        patientName: 'هدى عادل',
        date: '2026-11-02',
        invoiceType: 'rehab_package',
        titleAr: 'كورس ملغى',
        titleEn: 'Voided Course',
        totalAmountIQD: 150000,
        discountIQD: 0,
        netAmountIQD: 150000,
        paidAmountIQD: 0,
        balanceDueIQD: 150000,
        status: 'void',
        packageTotalSessions: 8,
        packageUsedSessions: 0,
        payments: [],
        createdBy: 'Admin',
      },
    ];

    const summary = computePatientVisitCardSummary({
      patientId: 'pt_visit',
      patientName: 'هدى عادل',
      patientMrn: 'PR-2026-0042',
      patientPhone: '07701122334',
      appointments,
      invoices,
      referenceDateStr: '2026-11-15',
    });

    expect(summary.nextAppointment?.id).toBe('a_future_1');
    expect(summary.upcomingAppointments).toHaveLength(2);
    expect(summary.packageTotalSessions).toBe(10);
    expect(summary.packageUsedSessions).toBe(4);
    expect(summary.packageRemainingSessions).toBe(6);
    expect(summary.activeCourseInvoiceNumbers).toEqual(['INV-2026-001']);
    expect(summary.totalBalanceDueIQD).toBe(50000);
  });

  it('E4: computes accurate 3-point geometric angles and saves annotated copy in Dexie v9 without altering original', async () => {
    const rightAngle = computeThreePointAngleDegrees(
      { xNorm: 0.5, yNorm: 0.2 },
      { xNorm: 0.5, yNorm: 0.7 },
      { xNorm: 0.9, yNorm: 0.7 },
      1000,
      1000
    );
    expect(rightAngle.angleDegrees).toBe(90);
    expect(rightAngle.supplementaryDegrees).toBe(90);

    const straightAngle = computeThreePointAngleDegrees(
      { xNorm: 0.2, yNorm: 0.5 },
      { xNorm: 0.5, yNorm: 0.5 },
      { xNorm: 0.8, yNorm: 0.5 },
      800,
      600
    );
    expect(straightAngle.angleDegrees).toBe(180);
    expect(straightAngle.supplementaryDegrees).toBe(0);

    const acute60 = computeThreePointAngleDegrees(
      { xNorm: 0.5, yNorm: 0.5 - Math.sqrt(3) * 0.2 },
      { xNorm: 0.3, yNorm: 0.5 },
      { xNorm: 0.7, yNorm: 0.5 },
      1000,
      1000
    );
    expect(acute60.angleDegrees).toBeCloseTo(60, 0);

    // Encrypted Dexie v9 non-destructive annotated copy save + module defaults
    const { db } = await setupInitializedVault(10);
    expect(ClinicOperationsService.isWebShareInteropEnabled()).toBe(true);
    expect(ClinicOperationsService.isIcsCalendarExportEnabled()).toBe(true);
    expect(ClinicOperationsService.isScheduleVisitCardPrintEnabled()).toBe(true);
    expect(ClinicOperationsService.isPhotoMeasurementToolsEnabled()).toBe(true);

    const original = await ClinicOperationsService.saveAttachmentAsync({
      patientId: 'pt_e4_1',
      category: 'posture_before',
      title: 'Sagittal Standing',
      fileName: 'sagittal.png',
      mimeType: 'image/png',
      payloadDataUrl: VALID_PNG_DATA_URL,
      thumbnailDataUrl: VALID_PNG_DATA_URL,
      widthPx: 800,
      heightPx: 600,
      originalBytes: 120,
      storedBytes: 120,
      capturedAt: '2026-11-14',
    });

    const rendered = await renderAnnotatedPhotoDataUrl({
      sourceDataUrl: original.payloadDataUrl,
      widthPx: original.widthPx,
      heightPx: original.heightPx,
      annotations: {
        showPlumbLine: true,
        plumbLineXPercent: 52,
        showHorizontalLevel: true,
        horizontalLevelYPercent: 30,
        gridMode: '3x3',
        angles: [
          {
            id: 'ang_cva',
            label: 'CVA',
            pointA: { xNorm: 0.5, yNorm: 0.2 },
            vertexB: { xNorm: 0.5, yNorm: 0.7 },
            pointC: { xNorm: 0.9, yNorm: 0.7 },
            angleDegrees: rightAngle.angleDegrees,
            supplementaryDegrees: rightAngle.supplementaryDegrees,
          },
        ],
      },
    });
    expect(rendered.payloadDataUrl.startsWith('data:image/')).toBe(true);

    const copyRecord = await ClinicOperationsService.saveAttachmentAsync({
      patientId: original.patientId,
      category: original.category,
      title: `${original.title} — Measured Copy`,
      notes: 'CVA: 90°',
      fileName: 'sagittal-measured.svg',
      mimeType: 'image/svg+xml',
      payloadDataUrl: rendered.payloadDataUrl,
      thumbnailDataUrl: rendered.thumbnailDataUrl,
      widthPx: rendered.widthPx,
      heightPx: rendered.heightPx,
      originalBytes: rendered.storedBytes,
      storedBytes: rendered.storedBytes,
      capturedAt: original.capturedAt,
    });

    const list = ClinicOperationsService.getAttachmentsForPatient('pt_e4_1');
    expect(list).toHaveLength(2);
    expect(list.find((item) => item.id === original.id)?.payloadDataUrl).toBe(VALID_PNG_DATA_URL);
    expect(list.find((item) => item.id === copyRecord.id)?.title).toContain('Measured Copy');

    // Verify encrypted ciphertext in IndexedDB contains zero plaintext leaks
    const rawRow = await db.attachments.get(copyRecord.id);
    expect(rawRow).toBeDefined();
    const rawCipherText = new TextDecoder().decode(rawRow!.ciphertext);
    expect(rawCipherText).not.toContain('Measured Copy');
    expect(rawCipherText).not.toContain('CVA: 90');
  });

  it('computes 4-point Cobb angles accurately for parallel, perpendicular, and acute vertebra lines', () => {
    // Two horizontal parallel lines -> 0 deg Cobb angle
    const parallel = computeFourPointCobbAngleDegrees(
      { xNorm: 0.25, yNorm: 0.3 },
      { xNorm: 0.75, yNorm: 0.3 },
      { xNorm: 0.25, yNorm: 0.7 },
      { xNorm: 0.75, yNorm: 0.7 },
      100,
      100
    );
    expect(parallel.angleDegrees).toBe(0);
    expect(parallel.obtuseDegrees).toBe(180);

    // Horizontal vs vertical lines -> 90 deg Cobb angle
    const perpendicular = computeFourPointCobbAngleDegrees(
      { xNorm: 0.2, yNorm: 0.3 },
      { xNorm: 0.8, yNorm: 0.3 },
      { xNorm: 0.5, yNorm: 0.2 },
      { xNorm: 0.5, yNorm: 0.8 },
      100,
      100
    );
    expect(perpendicular.angleDegrees).toBe(90);
    expect(perpendicular.obtuseDegrees).toBe(90);

    // 45-degree sloped superior endplate vs horizontal inferior endplate -> 45 deg
    const acute45 = computeFourPointCobbAngleDegrees(
      { xNorm: 0.3, yNorm: 0.2 },
      { xNorm: 0.7, yNorm: 0.6 },
      { xNorm: 0.3, yNorm: 0.8 },
      { xNorm: 0.7, yNorm: 0.8 },
      100,
      100
    );
    expect(acute45.angleDegrees).toBeCloseTo(45, 1);
    expect(acute45.obtuseDegrees).toBeCloseTo(135, 1);
  });

  it('computes reference scale calibration and calibrated distance/delta metrics in mm and cm', () => {
    // 50% width on a 400px-wide image = 200px representing 100mm -> 2 px/mm
    const scale = computePhotoCalibrationScale(
      { xNorm: 0.25, yNorm: 0.5 },
      { xNorm: 0.75, yNorm: 0.5 },
      100,
      400,
      300
    );
    expect(scale).not.toBeNull();
    expect(scale!.pixelsPerMm).toBeCloseTo(2, 2);
    expect(scale!.knownLengthMm).toBe(100);

    // Invalid zero-length or zero-mm inputs return null safely
    expect(
      computePhotoCalibrationScale(
        { xNorm: 0.5, yNorm: 0.5 },
        { xNorm: 0.5, yNorm: 0.5 },
        100,
        400,
        300
      )
    ).toBeNull();
    expect(
      computePhotoCalibrationScale(
        { xNorm: 0.1, yNorm: 0.1 },
        { xNorm: 0.5, yNorm: 0.1 },
        0,
        400,
        300
      )
    ).toBeNull();

    // Vertical distance spanning 50% of 300px height = 150px -> 75mm = 7.5 cm
    const metrics = computePhotoDistanceMetrics(
      { xNorm: 0.5, yNorm: 0.25 },
      { xNorm: 0.5, yNorm: 0.75 },
      400,
      300,
      scale
    );
    expect(metrics.pixelLength).toBeCloseTo(150, 1);
    expect(metrics.deltaXPx).toBe(0);
    expect(metrics.deltaYPx).toBeCloseTo(150, 1);
    expect(metrics.lengthMm).toBeCloseTo(75, 1);
    expect(metrics.deltaXMm).toBe(0);
    expect(metrics.deltaYMm).toBeCloseTo(75, 1);
    expect(metrics.tiltFromHorizontalDeg).toBe(90);

    const baseDist = createDefaultPhotoDistanceMeasurement(1, 'en');
    expect(
      formatPhotoDistanceBadgeText({
        ...baseDist,
        label: 'Pelvic Tilt',
        pixelLength: 150,
        lengthMm: 75,
        deltaXMm: 0,
        deltaYMm: 75,
      })
    ).toContain('7.5 cm');
    expect(
      formatPhotoDistanceBadgeText({
        ...baseDist,
        label: 'Uncalibrated',
        pixelLength: 142.3,
        lengthMm: null,
        deltaXMm: null,
        deltaYMm: null,
      })
    ).toContain('142.3 px');
  });

  it('renders annotated photo payloads containing Cobb angles, distances, arrows, and 12x12 grid without crashing', async () => {
    const cobb = createDefaultPhotoCobbMeasurement(1, 'en', 400, 300);
    const calibration = computePhotoCalibrationScale(
      { xNorm: 0.2, yNorm: 0.9 },
      { xNorm: 0.45, yNorm: 0.9 },
      100,
      400,
      300
    );
    const dist = createDefaultPhotoDistanceMeasurement(1, 'en', 400, 300, calibration);
    const arrow = createDefaultPhotoArrowAnnotation(1, 'en');

    const rendered = await renderAnnotatedPhotoDataUrl({
      sourceDataUrl: VALID_PNG_DATA_URL,
      widthPx: 400,
      heightPx: 300,
      annotations: {
        showPlumbLine: true,
        plumbLineXPercent: 50,
        showHorizontalLevel: true,
        horizontalLevelYPercent: 48,
        gridMode: '12x12',
        angles: [],
        cobbAngles: [cobb],
        distances: [dist],
        arrows: [arrow],
        calibration,
      },
    });

    expect(rendered.payloadDataUrl.startsWith('data:image/')).toBe(true);
    expect(rendered.thumbnailDataUrl.startsWith('data:image/')).toBe(true);
    expect(rendered.widthPx).toBe(400);
    expect(rendered.heightPx).toBe(300);
    expect(rendered.storedBytes).toBeGreaterThan(0);

    if (rendered.payloadDataUrl.startsWith('data:image/svg+xml;base64,')) {
      const svgXml = Buffer.from(
        rendered.payloadDataUrl.replace('data:image/svg+xml;base64,', ''),
        'base64'
      ).toString('utf8');
      expect(svgXml).toContain('Cobb 1');
      expect(svgXml).toContain('Distance 1');
      expect(svgXml).toContain('Note 1');
    }
  });
});
