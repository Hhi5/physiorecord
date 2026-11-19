# PhysioRecord HL7 FHIR R4 Export Mapping

This document specifies how PhysioRecord's locally decrypted patient data maps to an **HL7 FHIR R4 `Bundle`** (`type: "collection"`) via [`src/utils/fhirExport.ts`](../src/utils/fhirExport.ts). Exports are generated strictly offline on the clinician's device without external API calls.

## Resource Mapping Table

| PhysioRecord Source | FHIR R4 Resource | Key Elements Mapped |
| --- | --- | --- |
| `PatientRecord` (`db.patients`) | `Patient` | `id`, `identifier` (MRN typed `v2-0203#MR`), `name` (`official` / `usual`), `gender`, `birthDate`, `telecom` (phone), `address`, `active` (`!isArchived`), custodial clinic & recorded age extensions |
| `EpisodeRecord.data.medicalDiagnosis` + `icd10Code` | `Condition` | `clinicalStatus` (`active` / `resolved`), `category` (`encounter-diagnosis`), `code.coding` (`icd-10` when present), `subject`, `bodySite` (`affectedBodyRegion`), `onsetDateTime`, `recordedDate`, `note` (`clinicalImpression`) |
| `PatientClinicalData` (`redFlags`, `medicalHistory`) | `Condition` | `category` (`problem-list-item`), `code.text` combining red flags & medical history |
| `EpisodeRecord` | `EpisodeOfCare` | `status` (`active` / `finished` / `onhold` / `cancelled`), `diagnosis` -> `Condition`, `patient`, `period.start/end` |
| `SessionRecord` + `SoapNoteRecord` | `Encounter` | `status` (`finished` for finalized, `in-progress` for draft, `cancelled`), `class` (`AMB`), `type` (`sessionType` & `sessionNumber`), `episodeOfCare`, `period.start`, `reasonCode` |
| `SoapNoteData.subjective.painScale.scoreCurrent` | `Observation` | `category` (`survey`), LOINC `72514-3` (Pain severity 0–10 NPRS), `valueQuantity`, `encounter`, `effectiveDateTime` |
| `EpisodeScopedClinicalStore.functionalScales.history` | `Observation` | `category` (`survey`), scale code (`odi`, `ndi`, `quickdash`, `spadi`, `lefs`, `psfs`, `tug`, etc.), raw or `%` `valueQuantity`, severity `interpretation` |

## Limitations & Clinical Scope

- Generated bundles are intended for patient-owned portability and health information handoff.
- No server endpoint or FHIR validation server is contacted at runtime; validation uses structural invariants locally.
- Binary attachments (photos/PDFs) are exported separately inside encrypted `.ptbackup` backups or via full vault exports, rather than embedded inline as oversized FHIR `DocumentReference` blobs.
