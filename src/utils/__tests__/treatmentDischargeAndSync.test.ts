// =======================================================================
// Unit Tests — Treatment Completion Journey, Therapist Caseload &
// Non-Destructive AES-256-GCM Clinic Sync Engine
// =======================================================================

import { describe, it, expect } from 'vitest';
import {
  buildClinicalJourneySummary,
  computeTherapistCaseloadSummary,
  getPatientCompletionMeta,
} from '../treatmentJourneySummary';
import {
  decryptSyncEnvelope,
  encryptSyncEnvelope,
  mergeClinicSyncPayloads,
  type ClinicSyncPayload,
} from '../clinicSyncEngine';
import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../../types/clinical';
import type { ClinicStaffMember } from '../../types/clinicManagement';

const makePatient = (
  id: string,
  name: string,
  updatedAt: string,
  assignedStaffId?: string,
  assignedTherapistName?: string
): PatientRecord => ({
  id,
  createdAt: '2026-01-01T08:00:00.000Z',
  updatedAt,
  isArchived: 0,
  data: {
    fullName: name,
    fullNameAr: name,
    gender: 'male',
    assignedStaffId,
    assignedTherapistName,
  },
});

const makeEpisode = (
  id: string,
  patientId: string,
  status: EpisodeRecord['status'],
  startDate = '2026-01-01',
  endDate?: string
): EpisodeRecord => ({
  id,
  patientId,
  status,
  primarySpecialty: 'musculoskeletal',
  startDate,
  endDate,
  createdAt: `${startDate}T08:00:00.000Z`,
  updatedAt: `${endDate || startDate}T10:00:00.000Z`,
  data: {
    title: 'تأهيل الركبة',
    status,
    primarySpecialty: 'musculoskeletal',
    startDate,
    endDate,
    medicalDiagnosis: 'ACL Reconstruction Rehab',
    clinicalImpression: 'Post-op stiffness',
    affectedBodyRegion: 'knee',
    rehabilitationGoals: { shortTerm: ['Reduce pain'], longTerm: ['Full ROM'] },
    structuredGoals: [
      {
        id: 'g1',
        horizon: 'short_term',
        description: 'Pain <= 2/10',
        progressPercent: 100,
        status: 'achieved',
      },
      {
        id: 'g2',
        horizon: 'long_term',
        description: 'Return to jogging',
        progressPercent: 80,
        status: 'in_progress',
      },
    ],
  },
});

describe('buildClinicalJourneySummary', () => {
  it('computes pain reduction, duration, sessions, and auto-drafted summary accurately', () => {
    const ep = makeEpisode('ep-1', 'p-1', 'active', '2026-02-01');
    const sessions: SessionRecord[] = [
      {
        id: 's-1',
        episodeId: 'ep-1',
        patientId: 'p-1',
        sessionNumber: 1,
        sessionDate: '2026-02-01',
        sessionType: 'initial_evaluation',
        status: 'finalized',
        attendanceStatus: 'attended',
        createdAt: '2026-02-01T09:00:00.000Z',
        updatedAt: '2026-02-01T09:30:00.000Z',
        data: {
          sessionNumber: 1,
          sessionDate: '2026-02-01',
          sessionType: 'initial_evaluation',
          status: 'finalized',
          attendanceStatus: 'attended',
        },
      },
      {
        id: 's-2',
        episodeId: 'ep-1',
        patientId: 'p-1',
        sessionNumber: 2,
        sessionDate: '2026-02-21',
        sessionType: 'follow_up',
        status: 'finalized',
        attendanceStatus: 'attended',
        createdAt: '2026-02-21T09:00:00.000Z',
        updatedAt: '2026-02-21T09:30:00.000Z',
        data: {
          sessionNumber: 2,
          sessionDate: '2026-02-21',
          sessionType: 'follow_up',
          status: 'finalized',
          attendanceStatus: 'attended',
        },
      },
    ];
    const soaps: SoapNoteRecord[] = [
      {
        id: 'soap-1',
        sessionId: 's-1',
        episodeId: 'ep-1',
        patientId: 'p-1',
        createdAt: '2026-02-01T09:00:00.000Z',
        updatedAt: '2026-02-01T09:30:00.000Z',
        data: {
          isFinalized: true,
          subjective: { painNrsScore: 8 },
          objective: {},
          assessment: {},
          plan: {},
        },
      },
      {
        id: 'soap-2',
        sessionId: 's-2',
        episodeId: 'ep-1',
        patientId: 'p-1',
        createdAt: '2026-02-21T09:00:00.000Z',
        updatedAt: '2026-02-21T09:30:00.000Z',
        data: {
          isFinalized: true,
          subjective: { painNrsScore: 3, postSessionPainNrs: 2 },
          objective: {},
          assessment: {},
          plan: {},
        },
      },
    ];

    const summary = buildClinicalJourneySummary({
      episode: ep,
      sessions,
      soaps,
      dischargeDateOverride: '2026-02-21',
    });

    expect(summary.totalSessions).toBe(2);
    expect(summary.durationDays).toBe(20);
    expect(summary.painFirst).toBe(8);
    expect(summary.painLatest).toBe(2);
    expect(summary.painDelta).toBe(6);
    expect(summary.painImprovementPercent).toBe(75);
    expect(summary.improvementBadge).toBe('significant');
    expect(summary.goalsAchievedCount).toBe(1);
    expect(summary.totalGoalsCount).toBe(2);
    expect(summary.suggestedSummaryAr).toContain('75%');
  });
});

describe('computeTherapistCaseloadSummary & getPatientCompletionMeta', () => {
  it('separates active vs completed patients per therapist for manager oversight', () => {
    const staffRoster: ClinicStaffMember[] = [
      {
        id: 'st-1',
        nameAr: 'د. علي',
        nameEn: 'Dr. Ali',
        role: 'admin',
        specialtyAr: 'علاج طبيعي',
        specialtyEn: 'Physiotherapy',
      },
      {
        id: 'st-2',
        nameAr: 'د. سارة',
        nameEn: 'Dr. Sara',
        role: 'senior_pt',
        specialtyAr: 'علاج طبيعي',
        specialtyEn: 'Physiotherapy',
      },
    ];
    const patients = [
      makePatient('p1', 'أحمد', '2026-02-01T00:00:00Z', 'st-1', 'د. علي'),
      makePatient('p2', 'نور', '2026-02-01T00:00:00Z', 'st-2', 'د. سارة'),
      makePatient('p3', 'حسن', '2026-02-01T00:00:00Z', 'st-2', 'د. سارة'),
    ];
    const episodes = [
      makeEpisode('e1', 'p1', 'active', '2026-02-01'),
      makeEpisode('e2', 'p2', 'completed', '2026-01-01', '2026-02-01'),
      makeEpisode('e3', 'p3', 'active', '2026-02-10'),
    ];

    const p2Meta = getPatientCompletionMeta(patients[1], [episodes[1]]);
    expect(p2Meta.isCompleted).toBe(true);
    expect(p2Meta.dischargeDate).toBe('2026-02-01');

    const overview = computeTherapistCaseloadSummary({ patients, episodes, staffRoster });
    expect(overview.totalActive).toBe(2);
    expect(overview.totalCompleted).toBe(1);
    const saraRow = overview.rows.find((r) => r.staffId === 'st-2');
    expect(saraRow?.activePatients).toBe(1);
    expect(saraRow?.completedPatients).toBe(1);
  });
});

describe('Clinic Non-Destructive Sync Engine (AES-256-GCM + Additive Merge)', () => {
  const basePayload = (deviceId: string): ClinicSyncPayload => ({
    schemaVersion: 1,
    deviceId,
    deviceLabel: deviceId,
    exportedAt: '2026-03-01T12:00:00.000Z',
    patients: [],
    episodes: [],
    sessions: [],
    soapNotes: [],
    clinicalAddenda: [],
    appointments: [],
    invoices: [],
    episodeClinicalStores: [],
    staffRoster: [],
  });

  it('encrypts and decrypts sync envelope and rejects wrong passphrase', async () => {
    const payload = basePayload('dev-therapist-1');
    payload.patients.push(makePatient('p-local', 'مريض محلي', '2026-03-01T10:00:00.000Z'));

    // Use small PBKDF2 iterations strictly inside unit test for fast execution
    const envelope = await encryptSyncEnvelope(payload, 'ClinicSecret2026!', 1000);
    expect(envelope.magic).toBe('PHYSIORECORD_SYNC_V1');
    expect(JSON.stringify(envelope)).not.toContain('مريض محلي');

    const decrypted = await decryptSyncEnvelope(envelope, 'ClinicSecret2026!');
    expect(decrypted.patients).toHaveLength(1);
    expect(decrypted.patients[0].data.fullNameAr).toBe('مريض محلي');

    await expect(decryptSyncEnvelope(envelope, 'WrongPassword!')).rejects.toThrow();
  });

  it('guarantees zero local deletions and protects finalized SOAP notes from remote overwrites', () => {
    const local = basePayload('dev-therapist');
    local.patients.push(
      makePatient('p-only-local', 'مريض عند المعالج فقط', '2026-03-01T08:00:00.000Z'),
      makePatient('p-shared', 'اسم قديم', '2026-03-01T08:00:00.000Z')
    );
    local.soapNotes.push({
      id: 'soap-final',
      sessionId: 'sess-1',
      episodeId: 'ep-1',
      patientId: 'p-shared',
      createdAt: '2026-03-01T08:00:00.000Z',
      updatedAt: '2026-03-01T09:00:00.000Z',
      data: {
        isFinalized: true,
        subjective: { chiefComplaint: 'Original Finalized Note' },
        objective: {},
        assessment: {},
        plan: {},
      },
    });

    const remote = basePayload('dev-manager');
    // Remote does NOT contain 'p-only-local', updates 'p-shared', adds 'p-only-remote', and tries to alter finalized SOAP
    remote.patients.push(
      makePatient('p-shared', 'اسم محدّث من المدير', '2026-03-02T10:00:00.000Z'),
      makePatient('p-only-remote', 'مريض جديد من المدير', '2026-03-02T10:00:00.000Z')
    );
    remote.soapNotes.push({
      id: 'soap-final',
      sessionId: 'sess-1',
      episodeId: 'ep-1',
      patientId: 'p-shared',
      createdAt: '2026-03-01T08:00:00.000Z',
      updatedAt: '2026-03-05T10:00:00.000Z',
      data: {
        isFinalized: true,
        subjective: { chiefComplaint: 'Tampered Remote Note' },
        objective: {},
        assessment: {},
        plan: {},
      },
    });

    const result = mergeClinicSyncPayloads(local, [remote]);

    // 1. Local-only patient MUST NEVER be deleted
    expect(result.merged.patients.map((p) => p.id)).toContain('p-only-local');
    // 2. Remote-only patient MUST be added
    expect(result.merged.patients.map((p) => p.id)).toContain('p-only-remote');
    // 3. Shared mutable patient takes newer updatedAt
    const shared = result.merged.patients.find((p) => p.id === 'p-shared');
    expect(shared?.data.fullNameAr).toBe('اسم محدّث من المدير');
    // 4. Local finalized SOAP note MUST remain strictly immutable
    const finalSoap = result.merged.soapNotes.find((n) => n.id === 'soap-final');
    expect(finalSoap?.data.subjective?.chiefComplaint).toBe('Original Finalized Note');
    expect(result.stats.remoteFinalizedSkippedAsImmutable).toBe(1);
    expect(result.stats.patientsAdded).toBe(1);
    expect(result.stats.patientsUpdated).toBe(1);
  });
});
