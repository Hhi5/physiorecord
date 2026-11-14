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
import { ClinicOperationsService } from '../clinicOperationsService';

describe('Appointments Concurrent Overbooking Support', () => {
  beforeEach(async () => {
    const db = createInMemoryDatabase(9) as unknown as PhysioRecordDatabase;
    const salt = randomBytes(CONSTANTS.SALT_BYTES);
    const kek = await deriveKEK('OverbookingPass#2026', salt, 1000);
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
      schemaVersion: 9,
      kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
      kdfIterations: 1000,
      dekVersion: CURRENT_DEK_VERSION,
      encryptionInvocationCount: 0,
      vaultGeneration: 1,
    });

    bindDekToGeneration(operationalDek, 1);
    await ClinicOperationsService.hydrateEncryptedCache(operationalDek, db);
  });

  it('allows booking multiple patients at the exact same time for the same therapist and different therapists', () => {
    const first = ClinicOperationsService.saveAppointment({
      patientId: 'pat-1',
      patientName: 'علي حسين',
      patientPhone: '07701234567',
      therapistName: 'د. سارة أحمد',
      date: '2026-11-15',
      startTime: '10:00',
      durationMinutes: 45,
      visitType: 'follow_up',
      status: 'scheduled',
      roomOrBed: 'وحدة العلاج الطبيعي 1',
    });

    const overlapSameTherapist = ClinicOperationsService.detectAppointmentConflicts({
      date: '2026-11-15',
      startTime: '10:00',
      durationMinutes: 45,
      therapistName: 'د. سارة أحمد',
      roomOrBed: 'وحدة العلاج الطبيعي 1',
    });
    expect(overlapSameTherapist.allowConcurrent).toBe(true);
    expect(overlapSameTherapist.hasConflict).toBe(true);
    expect(overlapSameTherapist.allOverlaps?.length).toBe(1);
    expect(overlapSameTherapist.therapistConflicts.length).toBe(1);

    // Must save cleanly without throwing for SAME therapist at IDENTICAL time
    const secondSameTherapist = ClinicOperationsService.saveAppointment({
      patientId: 'pat-2',
      patientName: 'فاطمة محمد',
      patientPhone: '07801112233',
      therapistName: 'د. سارة أحمد',
      date: '2026-11-15',
      startTime: '10:00',
      durationMinutes: 45,
      visitType: 'initial_evaluation',
      status: 'scheduled',
      roomOrBed: 'وحدة العلاج الطبيعي 1',
    });

    // Must also save cleanly for a DIFFERENT therapist at overlapping time (10:15)
    const thirdDiffTherapist = ClinicOperationsService.saveAppointment({
      patientId: 'pat-3',
      patientName: 'أحمد كريم',
      patientPhone: '07904445566',
      therapistName: 'د. مصطفى جبار',
      date: '2026-11-15',
      startTime: '10:15',
      durationMinutes: 30,
      visitType: 'follow_up',
      status: 'scheduled',
      roomOrBed: 'وحدة العلاج الطبيعي 2',
    });

    const allSaved = ClinicOperationsService.getAppointments().filter(
      (a) => a.date === '2026-11-15'
    );
    expect(allSaved.map((a) => a.id)).toEqual(
      expect.arrayContaining([first.id, secondSameTherapist.id, thirdDiffTherapist.id])
    );

    const checkThird = ClinicOperationsService.detectAppointmentConflicts({
      date: '2026-11-15',
      startTime: '10:15',
      durationMinutes: 45,
      therapistName: 'د. مصطفى جبار',
      roomOrBed: 'وحدة العلاج الطبيعي 2',
    });
    expect(checkThird.allOverlaps?.length).toBe(3);
    expect(checkThird.therapistConflicts.length).toBe(1);
  });
});
