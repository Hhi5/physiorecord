// =======================================================================
// PhysioRecord — HL7 FHIR R4 Bundle Exporter (5.1)
// Exports decrypted per-patient clinical summary as standard FHIR R4 JSON:
// Patient, EpisodeOfCare, Condition, Encounter, Observation (NPRS & Outcomes).
// Runs 100% locally in the browser (zero network calls).
// =======================================================================

import type {
  EpisodeRecord,
  PatientRecord,
  SessionRecord,
  SoapNoteRecord,
} from '../types/clinical';
import type { EpisodeScopedClinicalStore } from '../types/clinicManagement';
import { computePatientAge } from './date';

export interface FhirR4Bundle {
  resourceType: 'Bundle';
  id: string;
  meta: {
    lastUpdated: string;
    profile: string[];
  };
  type: 'collection';
  timestamp: string;
  entry: Array<{
    fullUrl: string;
    resource: Record<string, unknown>;
  }>;
}

export interface PatientFhirExportInput {
  patient: PatientRecord;
  episodes: EpisodeRecord[];
  sessions: SessionRecord[];
  soaps: SoapNoteRecord[];
  episodeStores?: EpisodeScopedClinicalStore[];
  clinicName?: string;
}

function mapFhirGender(gender?: string): 'male' | 'female' | 'other' | 'unknown' {
  if (gender === 'male' || gender === 'female' || gender === 'other') return gender;
  return 'unknown';
}

function mapEpisodeStatusToFhir(status?: string): string {
  switch (status) {
    case 'completed':
      return 'finished';
    case 'on_hold':
      return 'onhold';
    case 'archived':
      return 'cancelled';
    default:
      return 'active';
  }
}

function mapSessionStatusToFhir(session: SessionRecord): string {
  if (session.attendanceStatus === 'no_show') return 'cancelled';
  if (session.status === 'cancelled') return 'cancelled';
  if (session.status === 'finalized') return 'finished';
  return 'in-progress';
}

export function buildPatientFhirR4Bundle(input: PatientFhirExportInput): FhirR4Bundle {
  const { patient, episodes, sessions, soaps, episodeStores = [], clinicName } = input;
  const nowIso = new Date().toISOString();
  const entries: FhirR4Bundle['entry'] = [];
  const patientRef = `Patient/${patient.id}`;
  const pd = patient.data;
  const phone = pd.phoneNumber || pd.phone;

  // 1. FHIR R4 Patient Resource
  const ageYears = computePatientAge(pd.dateOfBirth, pd.age);
  const patientNames: Array<Record<string, unknown>> = [];
  if (pd.fullName?.trim()) {
    patientNames.push({ use: 'official', text: pd.fullName.trim() });
  }
  if (pd.fullNameAr?.trim() && pd.fullNameAr.trim() !== pd.fullName?.trim()) {
    patientNames.push({ use: 'usual', text: pd.fullNameAr.trim() });
  }

  entries.push({
    fullUrl: `urn:uuid:patient-${patient.id}`,
    resource: {
      resourceType: 'Patient',
      id: patient.id,
      meta: { lastUpdated: patient.updatedAt },
      active: patient.isArchived === 0,
      identifier: pd.mrn
        ? [
            {
              use: 'usual',
              type: {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                    code: 'MR',
                    display: 'Medical Record Number',
                  },
                ],
              },
              value: pd.mrn,
            },
          ]
        : [],
      name: patientNames,
      gender: mapFhirGender(pd.gender),
      ...(pd.dateOfBirth ? { birthDate: pd.dateOfBirth } : {}),
      ...(phone
        ? {
            telecom: [{ system: 'phone', value: phone, use: 'mobile' }],
          }
        : {}),
      ...(pd.address
        ? {
            address: [{ use: 'home', text: pd.address }],
          }
        : {}),
      extension: [
        ...(ageYears !== undefined
          ? [
              {
                url: 'https://physiorecord.local/fhir/StructureDefinition/recorded-age-years',
                valueInteger: ageYears,
              },
            ]
          : []),
        ...(clinicName
          ? [
              {
                url: 'https://physiorecord.local/fhir/StructureDefinition/custodian-clinic',
                valueString: clinicName,
              },
            ]
          : []),
      ],
    },
  });

  // 2. FHIR R4 Condition Resources (Primary Episode Diagnoses + Patient Red Flags / Medical History)
  for (const ep of episodes) {
    const condId = `cond-ep-${ep.id}`;
    entries.push({
      fullUrl: `urn:uuid:${condId}`,
      resource: {
        resourceType: 'Condition',
        id: condId,
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: ep.data.status === 'completed' ? 'resolved' : 'active',
            },
          ],
        },
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'encounter-diagnosis',
                display: 'Encounter Diagnosis',
              },
            ],
          },
        ],
        code: {
          text: ep.data.medicalDiagnosis || ep.data.title,
          ...(ep.data.icd10Code
            ? {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/sid/icd-10',
                    code: ep.data.icd10Code,
                    display: ep.data.medicalDiagnosis || ep.data.title,
                  },
                ],
              }
            : {}),
        },
        subject: { reference: patientRef },
        ...(ep.data.onsetDate ? { onsetDateTime: ep.data.onsetDate } : {}),
        recordedDate: ep.createdAt,
        bodySite: ep.data.affectedBodyRegion
          ? [{ text: ep.data.affectedBodyRegion }]
          : undefined,
        note: ep.data.clinicalImpression ? [{ text: ep.data.clinicalImpression }] : undefined,
      },
    });

    // EpisodeOfCare linkage
    entries.push({
      fullUrl: `urn:uuid:episode-${ep.id}`,
      resource: {
        resourceType: 'EpisodeOfCare',
        id: ep.id,
        status: mapEpisodeStatusToFhir(ep.data.status),
        type: [
          {
            text: `Physical Therapy — ${ep.data.primarySpecialty}`,
          },
        ],
        diagnosis: [
          {
            condition: { reference: `Condition/${condId}` },
          },
        ],
        patient: { reference: patientRef },
        period: {
          start: ep.data.startDate || ep.createdAt.slice(0, 10),
          ...(ep.data.endDate ? { end: ep.data.endDate } : {}),
        },
      },
    });
  }

  if (pd.redFlags?.trim() || pd.medicalHistory?.trim()) {
    entries.push({
      fullUrl: `urn:uuid:cond-hx-${patient.id}`,
      resource: {
        resourceType: 'Condition',
        id: `cond-hx-${patient.id}`,
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'active',
            },
          ],
        },
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'problem-list-item',
              },
            ],
          },
        ],
        code: {
          text: [pd.redFlags?.trim(), pd.medicalHistory?.trim()].filter(Boolean).join(' | '),
        },
        subject: { reference: patientRef },
        recordedDate: patient.createdAt,
      },
    });
  }

  // 3. FHIR R4 Encounter + Observation (Pain NPRS) per Physiotherapy Session
  const soapBySessionId = new Map<string, SoapNoteRecord>();
  for (const s of soaps) {
    soapBySessionId.set(s.sessionId, s);
  }

  for (const sess of sessions) {
    const encId = sess.id;
    const soap = soapBySessionId.get(sess.id);
    const encRef = `Encounter/${encId}`;
    const startDateTime = sess.data.sessionTime
      ? `${sess.sessionDate}T${sess.data.sessionTime}:00`
      : sess.sessionDate;

    entries.push({
      fullUrl: `urn:uuid:encounter-${encId}`,
      resource: {
        resourceType: 'Encounter',
        id: encId,
        status: mapSessionStatusToFhir(sess),
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'AMB',
          display: 'ambulatory',
        },
        type: [
          {
            text: `Physical Therapy (${sess.sessionType}) — Session #${sess.sessionNumber}`,
          },
        ],
        subject: { reference: patientRef },
        episodeOfCare: sess.episodeId ? [{ reference: `EpisodeOfCare/${sess.episodeId}` }] : undefined,
        period: {
          start: startDateTime,
        },
        ...(soap?.data?.assessment?.clinicalImpressionCurrent
          ? {
              reasonCode: [{ text: soap.data.assessment.clinicalImpressionCurrent }],
            }
          : {}),
      },
    });

    const nprsScore =
      soap?.data?.subjective?.painNrsScore ?? soap?.data?.subjective?.painVasCurrent;
    if (typeof nprsScore === 'number' && Number.isFinite(nprsScore)) {
      const obsId = `obs-nprs-${encId}`;
      entries.push({
        fullUrl: `urn:uuid:${obsId}`,
        resource: {
          resourceType: 'Observation',
          id: obsId,
          status: sess.status === 'finalized' ? 'final' : 'preliminary',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'survey',
                  display: 'Survey',
                },
              ],
            },
          ],
          code: {
            coding: [
              {
                system: 'http://loinc.org',
                code: '72514-3',
                display: 'Pain severity - 0-10 verbal numeric rating [Score] - Reported',
              },
            ],
            text: 'Pain NPRS (0-10)',
          },
          subject: { reference: patientRef },
          encounter: { reference: encRef },
          effectiveDateTime: sess.sessionDate,
          valueQuantity: {
            value: nprsScore,
            unit: 'score (0-10)',
            system: 'http://unitsofmeasure.org',
            code: '{score}',
          },
        },
      });
    }
  }

  // 4. FHIR R4 Observation Resources from Episode Outcome Measure History
  for (const store of episodeStores) {
    const history = store.functionalScales?.history || [];
    for (const point of history) {
      const obsId = `obs-outcome-${point.id}`;
      entries.push({
        fullUrl: `urn:uuid:${obsId}`,
        resource: {
          resourceType: 'Observation',
          id: obsId,
          status: 'final',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                  code: 'survey',
                  display: 'Survey',
                },
              ],
            },
          ],
          code: {
            coding: [
              {
                system: 'https://physiorecord.local/fhir/CodeSystem/outcome-measure',
                code: point.scaleId,
                display: point.scaleNameEn,
              },
            ],
            text: `${point.scaleNameEn} (${point.scaleNameAr})`,
          },
          subject: { reference: patientRef },
          effectiveDateTime: point.date,
          valueQuantity: {
            value: typeof point.rawScore === 'number' ? point.rawScore : point.scorePercentage,
            unit: typeof point.rawScore === 'number' ? 'points' : '%',
          },
          interpretation: [
            {
              text: `${point.severityLabelEn} (${point.scorePercentage}%)`,
            },
          ],
        },
      });
    }
  }

  return {
    resourceType: 'Bundle',
    id: `physiorecord-fhir-r4-${patient.id}`,
    meta: {
      lastUpdated: nowIso,
      profile: ['http://hl7.org/fhir/R4/bundle.html'],
    },
    type: 'collection',
    timestamp: nowIso,
    entry: entries,
  };
}
