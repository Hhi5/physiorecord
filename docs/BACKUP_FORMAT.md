# Encrypted Backup Format Specification (`docs/BACKUP_FORMAT.md`)

Implemented in [`src/crypto/backup.ts`](../src/crypto/backup.ts) and [`src/crypto/vault.ts`](../src/crypto/vault.ts).

## 1. File Envelope (`PHYSIORECORD_BACKUP_V3.0`)

Backups export as gzip-compressed, `256 KB` AES-256-GCM chunked `.ptbackup` JSON envelopes (`ExportedBackupPackage`) with a canonical authenticated metadata `header` and per-chunk AAD binding:

```json
{
  "header": {
    "formatVersion": "3.0",
    "magic": "PHYSIORECORD_BACKUP_V3.0",
    "exportDateUtc": "2026-11-23T...",
    "clinicTimezone": "Asia/Baghdad",
    "schemaVersion": 11,
    "kdfAlgorithm": "PBKDF2-HMAC-SHA256",
    "kdfIterations": 600000,
    "keyExpansion": "HKDF-SHA256",
    "hkdfHash": "SHA-256",
    "hkdfSalt": [/* bytes */],
    "hkdfInfoDekWrap": "physiorecord-backup-dek-wrap-v3.0",
    "hkdfInfoPayloadEnc": "physiorecord-backup-payload-enc-v3.0",
    "derivedKeyLengthBits": 256,
    "backupSalt": [/* bytes */],
    "backupDekIv": [/* 12-byte GCM IV */],
    "backupWrappedDek": [/* encrypted backup DEK */],
    "backupDataIv": [/* 12-byte GCM IV */],
    "dekVersion": 2,
    "encryptionInvocationCount": 0,
    "maxBackupSizeBytes": 26214400,
    "payloadLength": 12345,
    "compression": "gzip",
    "compressedLength": 3456,
    "chunkSizeBytes": 262144,
    "totalChunks": 1
  },
  "chunks": [
    {
      "chunkIndex": 0,
      "totalChunks": 1,
      "isFinal": true,
      "iv": [/* 12-byte GCM IV */],
      "ciphertext": [/* AES-GCM ciphertext + tag */]
    }
  ]
}
```

## 2. Supported Format Versions & Bounds

- **Magic Headers**:
  - `PHYSIORECORD_BACKUP_V1.1` (legacy core stores; backward-compatible restore supported).
  - `PHYSIORECORD_BACKUP_V2.0` (single-ciphertext Dexie v5/v6 snapshot; backward-compatible restore supported).
  - `PHYSIORECORD_BACKUP_V3.0` (current default: Dexie `v11` full 24-store portable encrypted snapshot with gzip `CompressionStream` + `256 KiB` AES-GCM chunks, including `consents`, `cashCloses`, `attachments`, `noteTemplates`, and `deletionTombstones`, removing legacy 25 MiB monolith memory bounds; older `V3.0` archives exported from `v9`/`v10` without `deletionTombstones` restore seamlessly).

## 3. Authenticated Encryption, Post-Export Verification & Merge Restore

1. **Header & Chunk AAD Binding**: Canonical header AAD (`buildCanonicalBackupHeaderAAD`) is hashed with `SHA-256` (`computeHeaderAadHashHex`) and bound into each chunk's `buildChunkAAD` (`headerHash|magic|chunkIndex|totalChunks|isFinal`) to prevent header mutation, chunk reordering, or truncation.
2. **Post-Export Verify (`verifyBackupPackage`)**: Every export runs an in-memory round-trip verification pass checking container integrity, chunk authentication, gzip decompression, and record decryptability before reporting success.
3. **Replace vs Merge Modes (`restoreBackupPackage`)**:
   - **Replace**: Replaces local stores cleanly under a newly rotated `CryptoKey` DEK, preserving all `deletionTombstones` stored in the backup.
   - **Merge**: Reconciles `deletionTombstones` **first** across both local vault and incoming backup, suppresses resurrection of explicitly deleted records (including when merging legacy pre-v11 backups that lack `deletionTombstones`, logging `resolution: 'skipped_deleted'`), preserves finalized immutable `soapNotes`, `clinicalAddenda`, signed `consents`, and closed `cashCloses`, merges mutable entities by newest timestamp, and outputs structured `MergeConflictRecord[]` entries.
4. **Emergency Safety Backup & File System Access**: Live restores save an emergency snapshot in secondary IndexedDB `PhysioRecordEmergencyRecoveryDB` and external `.ptbackup` via File System Access API (`src/crypto/fileSystemBackup.ts`) with browser download fallback. See [`docs/MIGRATIONS.md`](MIGRATIONS.md) for schema & format version upgrade paths.
