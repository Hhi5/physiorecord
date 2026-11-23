# PhysioRecord — Database & Storage Migration Notes (`docs/MIGRATIONS.md`)

> **Schema Invariant**: Historical Dexie schema definitions (`v1` through `v10` in [`src/db/db.ts`](../src/db/db.ts)) are strictly immutable. Never edit past `this.version(n).stores(...)` blocks; append higher versions (`v11`, `v12`, ...) only.

## 1. Dexie / IndexedDB Schema Evolution (`v1` -> `v11`)

`PhysioRecordDB` currently operates on **Dexie v11** with **29 object stores**:
- **24 portable clinical & operational stores** registered in [`src/db/registry.ts`](../src/db/registry.ts) (`CLINICAL_STORES_REGISTRY`) — automatically included in `.ptbackup` export, inspection, merge, and restore.
- **5 device-local technical stores** listed in `EXCLUDED_DEVICE_STORES` (`vaultMeta`, `episodeSequences`, `migrationState`, `fsHandles`, `drafts`) — excluded from portable backups and reconstructed or initialized per device.

| Version | Added Stores / Index Changes | Upgrade / Integrity Purpose |
| --- | --- | --- |
| **v1** | `patients` (`&id, createdAt, updatedAt, isArchived`), `episodes`, `sessions`, `soapNotes` (`&sessionId`), `vaultMeta` | Initial encrypted core clinical database |
| **v2** | Runs `upgrade()` transition hook on `vaultMeta` & soft-archive patient workflow (`archivePatient` / `unarchivePatient`) | Early schema upgrade continuity & patient archive lifecycle |
| **v3** | Adds `clinicalAddenda` (`&id, sessionId, patientId, targetId, createdAt`) + upgrade transition | Append-only clinical addenda; permanently blocks deleting sessions/episodes/patients with addenda |
| **v4** | Adds `episodeSequences` (`&episodeId`) | Monotonic session numbering state (`max(sessionNumber) + 1`, draft-delete safe) |
| **v5** | Adds `appointments`, `waitingList`, `invoices`, `payments`, `expenses`, `auditLogs`, `staffState`, `episodeClinical` (`&id, &episodeId`), `migrationState` | Full local clinic operations + encrypted episode assessments + resumable localStorage migration state |
| **v6** | Adds `waitingList.patientId` index and `auditLogs.patientId`, `auditLogs.episodeId` indexes | Enables indexed cascade audit/deletion & privacy-preserving `patientId` scrubbing on hard delete |
| **v7** | Adds `customWidgets`, `migrationReports`, `recurringSchedules`, `recurringSkippedDates`, `clinicSettings`, `patientMedications` (`&id, &patientId`), `fsHandles` (`&id, updatedAt`) | Custom Widget Studio, recurring schedules, Clinic Settings, medication tracking, and File System Access directory handles |
| **v8** | Adds `consents` (`&id, patientId, episodeId, createdAt, updatedAt`), `cashCloses` (`&id, dateKey, createdAt, updatedAt`) | Bilingual informed consents (signature canvas) and Daily Z-Reports |
| **v9** | Adds `attachments` (`&id, patientId, episodeId, category, createdAt, updatedAt`), `noteTemplates` (`&id, category, createdAt, updatedAt`) | Encrypted clinical binary attachments & CC0 note template/snippet packs |
| **v10** | Adds `drafts` (`&id, draftType, entityId, patientId, updatedAt`) | Encrypted power-cut / crash-resilient in-progress form drafts (SOAP, flowsheet, invoice, appointment) written with strict IndexedDB durability |
| **v11** | Adds `deletionTombstones` (`&id, storeName, recordId, deletedAt`) | Encrypted deletion tombstones preventing resurrection of explicitly deleted records across backup merges (including legacy pre-v11 backups) and multi-device sync |

---

## 2. Detailed Per-Version Dexie Migration Reference (`v1` – `v11`)

Every Dexie version block in [`src/db/db.ts`](../src/db/db.ts) is **append-only**. Opening a database created on any historical version (`v1`–`v10`) automatically executes intermediate `.upgrade(tx)` hooks in sequence without decrypting or invalidating existing `AES-256-GCM` ciphertexts.

### Version 1 (`v1`) — Initial Encrypted Core Clinical Vault
- **Stores Added**:
  - `patients`: `&id, createdAt, updatedAt, isArchived`
  - `episodes`: `&id, patientId, status, startDate, createdAt, updatedAt`
  - `sessions`: `&id, episodeId, patientId, sessionDate, sessionType, createdAt`
  - `soapNotes`: `&id, sessionId, patientId, createdAt`
  - `vaultMeta`: `&id`
- **Upgrade Hook**: Initial database creation; no prior version transition.
- **Backup Portability**: `patients`, `episodes`, `sessions`, and `soapNotes` are portable encrypted stores; `vaultMeta` is device-local key-wrapping metadata.
- **Safety Guarantees**: Primary keys use stable UUID strings (`&id`).

### Version 2 (`v2`) — Metadata Hardening & Soft-Archive Lifecycle
- **Stores Added / Index Changes**:
  - Updated `episodes` indexes to `&id, patientId, createdAt, updatedAt` (removed `status` and `startDate` from unencrypted IndexedDB indexes so all clinical state stays strictly inside `AES-256-GCM` ciphertext).
- **Upgrade Hook**: Iterates `tx.table('episodes')` and deletes any residual unencrypted wrapper properties (`status`, `primarySpecialty`, `startDate`, `endDate`).
- **Backup Portability**: Preserves full `.ptbackup` compatibility; encrypted payloads and `AAD` bindings remain unchanged.
- **Safety Guarantees**: Non-destructive in-place wrapper cleanup inside Dexie's `versionchange` transaction.

### Version 3 (`v3`) — 1:1 Unique Session SOAP & Append-Only Clinical Addenda
- **Stores Added / Index Changes**:
  - Added `clinicalAddenda`: `&id, sessionId, patientId, targetId, createdAt`
  - Updated `sessions`: `&id, episodeId, patientId, createdAt, updatedAt` (removed `sessionDate` and `sessionType` from unencrypted wrapper indexes)
  - Updated `soapNotes`: `&id, &sessionId, episodeId, patientId, createdAt, updatedAt` (enforced unique `&sessionId` 1:1 constraint)
- **Upgrade Hook**: Scrubs residual plaintext `sessionType`, `sessionDate`, `sessionStatus`, and `status` fields from `sessions` wrapper rows.
- **Backup Portability**: `clinicalAddenda` is registered in `CLINICAL_STORES_REGISTRY` and included in all `.ptbackup` archives.
- **Safety Guarantees**: Once a `clinicalAddendum` exists for a session or patient, `deleteSessionCascade`, `deleteEpisodeCascade`, and `deletePatientPermanently` permanently block deletion (`PatientHardDeletionBlockedError`).

### Version 4 (`v4`) — Cross-Tab Monotonic Episode Session Sequences
- **Stores Added**:
  - `episodeSequences`: `&episodeId`
- **Upgrade Hook**: Schema-only addition; counters initialize lazily from `max(sessionNumber) + 1` on next session creation.
- **Backup Portability**: Listed in `EXCLUDED_DEVICE_STORES` (device-local); automatically reconstructed from decrypted session records after `.ptbackup` restore.
- **Safety Guarantees**: Prevents duplicate `sessionNumber` assignment when draft sessions are deleted or multiple tabs are open.

### Version 5 (`v5`) — Encrypted Clinic Operations, Billing, Audit Chain & Episode Clinical Store
- **Stores Added**:
  - `appointments`: `&id, patientId, createdAt, updatedAt`
  - `waitingList`: `&id, createdAt, updatedAt`
  - `invoices`: `&id, patientId, episodeId, createdAt, updatedAt`
  - `payments`: `&id, invoiceId, patientId, createdAt, updatedAt`
  - `expenses`: `&id, createdAt, updatedAt`
  - `auditLogs`: `&id, createdAt`
  - `staffState`: `&id, updatedAt`
  - `episodeClinical`: `&id, &episodeId, patientId, createdAt, updatedAt`
  - `customWidgets`: `&id, createdAt, updatedAt`
  - `migrationReports`: `&id, createdAt`
  - `migrationState`: `&id`
- **Upgrade Hook**: Post-unlock `LocalStorageMigrationService` migrates legacy `physiorecord_*` keys into encrypted Dexie stores under a `navigator.locks` mutex and records completion in `migrationState`.
- **Backup Portability**: All operational/clinical tables above are in `CLINICAL_STORES_REGISTRY` except `migrationState` (device-local).
- **Safety Guarantees**: Plaintext `localStorage` keys are deleted only after round-trip decryption and deep-equality verification pass.

### Version 6 (`v6`) — Patient & Episode Index Expansion for Cascade Audits
- **Stores Added / Index Changes**:
  - Updated `waitingList`: `&id, patientId, createdAt, updatedAt`
  - Updated `auditLogs`: `&id, patientId, episodeId, createdAt`
- **Upgrade Hook**: Native IndexedDB index build over existing wrapper fields; zero ciphertext mutation.
- **Backup Portability**: Fully portable in `CLINICAL_STORES_REGISTRY`.
- **Safety Guarantees**: Enables `deletePatientPermanently()` to scrub `patientId` and `episodeId` from historical `auditLogs` wrapper rows while appending a name-free SHA-256 purge audit entry.

### Version 7 (`v7`) — Recurring Schedules, Clinic Settings, Medications & File Handles
- **Stores Added**:
  - `recurringSchedules`: `&id, patientId, createdAt, updatedAt`
  - `recurringSkippedDates`: `&id, createdAt`
  - `clinicSettings`: `&id, createdAt, updatedAt`
  - `patientMedications`: `&id, &patientId, createdAt, updatedAt`
  - `fsHandles`: `&id, updatedAt`
- **Upgrade Hook**: Schema expansion; existing `v6` stores remain untouched.
- **Backup Portability**: `recurringSchedules`, `recurringSkippedDates`, `clinicSettings`, and `patientMedications` are portable encrypted stores; `fsHandles` is in `EXCLUDED_DEVICE_STORES` because browser `FileSystemDirectoryHandle` objects cannot be serialized across devices.
- **Safety Guarantees**: All clinic profile, currency, WhatsApp templates, locations, and module toggles are encrypted at rest inside `clinicSettings`.

### Version 8 (`v8`) — Bilingual Informed Consents & Daily Cash Closes (`Z-Reports`)
- **Stores Added**:
  - `consents`: `&id, patientId, episodeId, createdAt, updatedAt`
  - `cashCloses`: `&id, dateKey, createdAt, updatedAt`
- **Upgrade Hook**: Schema expansion only.
- **Backup Portability**: Both `consents` and `cashCloses` are portable encrypted stores in `CLINICAL_STORES_REGISTRY`.
- **Safety Guarantees**: Signed consent signature strokes and daily Z-Report reconciliation totals are bound by `AES-256-GCM` AAD (`tableName`, `recordId`, `parentIds`).

### Version 9 (`v9`) — Encrypted Binary Attachments & CC0 Clinical Note Templates
- **Stores Added**:
  - `attachments`: `&id, patientId, episodeId, category, createdAt, updatedAt`
  - `noteTemplates`: `&id, category, createdAt, updatedAt`
- **Upgrade Hook**: Schema expansion paired with `.ptbackup` **V3.0** streaming gzip + 256 KB chunked encryption to support multi-megabyte imaging/PDF vaults.
- **Backup Portability**: Both `attachments` and `noteTemplates` are portable encrypted stores in `CLINICAL_STORES_REGISTRY`.
- **Safety Guarantees**: Binary attachments (MRI/X-ray reports, posture photos, PDFs) are encrypted inside IndexedDB and cascade-deleted if their parent patient is permanently purged.

### Version 10 (`v10`) — Power-Cut Resilient Encrypted Form Drafts (Phase A1)
- **Stores Added**:
  - `drafts`: `&id, draftType, entityId, patientId, updatedAt`
- **Upgrade Hook**: Appends the `drafts` store while keeping `v1`–`v9` definitions strictly untouched; enables `chromeTransactionDurability` (`strict` for critical clinical commits, `relaxed` for high-frequency autosaves).
- **Backup Portability**: Listed in `EXCLUDED_DEVICE_STORES` (device-local transient crash buffer; automatically cleared when the parent SOAP note, invoice, or appointment is saved or finalized).
- **Safety Guarantees**: Flushes encrypted draft ciphertexts on a `2s` debounce and immediately on `visibilitychange` / `pagehide`; surfaced on next vault unlock via `RecoveredWorkBanner`.

### Version 11 (`v11`) — Encrypted Deletion Tombstones & Proactive Downgrade Guard
- **Stores Added**:
  - `deletionTombstones`: `&id, storeName, recordId, deletedAt`
- **Upgrade Hook**: Non-destructive schema expansion; `v1`–`v10` definitions and all existing encrypted records remain strictly untouched.
- **Backup Portability**: Registered in `CLINICAL_STORES_REGISTRY` (24th portable encrypted store). Automatically included in `.ptbackup` `V3.0` exports and multi-device sync payloads (`ClinicSyncPayload.deletionTombstones`).
- **Safety Guarantees**:
  - Explicit clinician-confirmed deletions (e.g., `SessionService.deleteSession`, `SessionService.deleteFinalizedSession`) record encrypted tombstones (`storeName`, `recordId`, `deletedAt`, optional `reason`).
  - During `.ptbackup` **merge** restore (including merging legacy pre-v11 backups lacking `deletionTombstones`), tombstones are reconciled first and suppress resurrection of deleted records (logged as `skipped_deleted`).
  - During multi-device sync, ordinary absence of a record on a peer device still **never** deletes local data; only explicit tombstones propagate deletion and prevent resurrection.

---

## 2B. Backward Compatibility, Downgrade Policy & Multi-Tab Lifecycle

1. **Forward Upgrade Only (`v10 -> v11`)**: Upgrading from `1.0.5` (`Dexie v10`, IndexedDB version `100`) to `v11` (`IndexedDB version 110`) is automatic, in-place, and non-destructive. Clinicians should still export a `.ptbackup` safety copy before upgrading major releases.
2. **Why Already-Shipped `1.0.5` Binaries Cannot Detect `v11` (Dexie 4 Empirical Behavior)**:
   - Dexie 4 multiplies declared schema versions by `10` in IndexedDB (`v10` = `100`, `v11` = `110`).
   - When an older Dexie 4 binary (`1.0.5`, max declared `version(10)`) opens an on-disk `v11` database (`110`), Dexie performs a versionless `indexedDB.open(name)` probe, sees `idbdb.version (110) > 100`, and **silently opens the database without throwing `VersionError`** (reporting `db.verno === 10` while `db.backendDB().version === 110`).
   - Because already-released `1.0.5` binaries are immutable, they cannot be retroactively patched to reject `v11` databases. **Never downgrade an installed binary (APK/EXE/PWA) back to `1.0.5` after upgrading a vault to `v11`.** Android `versionCode` remains strictly monotonic to prevent accidental APK downgrade.
3. **Proactive Guard in `v11+` (`inspectOpenedDatabaseSchemaDowngrade`)**:
   - Starting in `v11`, `VaultContext` runs a post-open inspection comparing `db.backendDB().version` (`> CURRENT_DEXIE_SCHEMA_VERSION * 10`), `vaultMeta.schemaVersion`, and unknown IndexedDB object stores against `CURRENT_DEXIE_SCHEMA_VERSION`.
   - If a future `v12+` database is ever opened by a `v11` binary, PhysioRecord immediately closes the handle, refuses to treat the vault as uninitialized, and displays a blocking update-required notice on `LockScreen`.
4. **Multi-Tab `versionchange` & `blocked` Coordination (`src/db/db.ts`)**:
   - When a newer tab requests a schema upgrade, older tabs receive `versionchange`, immediately close their IndexedDB handle and lock in-memory DEK material, and notify the user to reload.
   - If another tab refuses to release an older connection, the upgrading tab receives `blocked` and displays an explicit boot notice until the blocking tab closes, then automatically completes the upgrade.

---

## 3. `localStorage` -> Dexie Migration Engine

Legacy client keys (`physiorecord_*` excluding UI theme/language/notice flags in `ALLOWED_NON_PHI_LOCALSTORAGE_KEYS`) are migrated into encrypted IndexedDB stores by [`LocalStorageMigrationService`](../src/services/localStorageMigrationService.ts):
1. **Dry-Run & Audit**: Inspects legacy keys without writing or deleting.
2. **Idempotent Transactional Migration (`localStorage_v5_migration`)**: Uses `Web Locks` (`navigator.locks`) across tabs to prevent race duplicates, resolves pre-session pain flowsheet conflicts deterministically, scrubs patient names from legacy audit logs, encrypts payloads under the active DEK, verifies decryption & deep-equality before cleanup, and logs corrupt keys in encrypted `migrationReports` without deleting them.
3. **Destructive Cleanup**: Deletes verified plaintext `localStorage` keys only after decryption verification passes, leaving zero PHI in `localStorage`.

## 4. Cryptographic & Backup Format Migrations

- **Per-Record Key Derivation (`recordCryptoVersion: 1 -> 2`)**: Records written under `v2` derive a unique per-record subkey via `HKDF-SHA256` using a random 16-byte `recordSalt`, while `decryptRecordPayload()` seamlessly decrypts legacy `v1` records until re-encrypted on edit, key rotation, or backup restore.
- **PBKDF2 Work Factor Auto-Upgrade**: Vaults unlocked with legacy KDF iterations `< 600,000` or salt length `< 16` bytes are transparently re-wrapped (`autoUpgradeVaultKdf()`) to baseline `600,000` iterations without rotating the operational DEK.
- **`.ptbackup` Package Evolution (`V1.1 -> V2.0 -> V3.0`)**:
  - `V1.1` / `V2.0`: Single encrypted JSON payload (25 MB soft cap).
  - `V3.0` (current): `CompressionStream('gzip')` + 256 KB AES-GCM chunks bound via canonical SHA-256 header hash AAD (`hdrhash:<hex>`), supporting large clinics (attachments, consents, Z-reports) while maintaining backward-compatible restore of `V1.1` and `V2.0` archives.
- **Pre-Restore Recovery Safety Net**: Before destructive `replace` or `merge` restoration executes, an encrypted emergency snapshot is written both externally and to `PhysioRecordEmergencyRecoveryDB`, and `half_finalized_soap_repair_v1` repair markers are reset so restored half-finalized sessions repair automatically on unlock.
