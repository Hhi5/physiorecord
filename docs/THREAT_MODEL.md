# PhysioRecord Threat Model (`docs/THREAT_MODEL.md`)

This document states clearly what PhysioRecord protects against **today**, what operational assumptions apply, and what known gaps remain documented for upcoming hardening.

## 1. Protected Assets

1. Patient identities, phone numbers, medical history, red flags, and diagnostic notes.
2. Clinical episode assessments (`ROM`, `MMT`, `Body Chart`, special tests, outcome scores), `SOAP` records, and immutable addenda.
3. Clinic operations data (appointments, invoices, payments, expenses, staff attribution logs).
4. Exported offline backups (`.ptbackup`).

## 2. Cryptographic Controls in Place (`src/crypto/`)

- **Web Worker Key Derivation**: Vault password derives a Key-Encryption Key (KEK) off the main thread (`src/crypto/cryptoWorker.ts`) via `PBKDF2-HMAC-SHA256` (`600,000` default iterations, clamped up to `5,000,000`) with progress feedback.
- **DEK Isolation & Per-Record HKDF Subkeys (`v2`)**: A non-extractable random master DEK derives record-specific AES-256-GCM subkeys (`HKDF-SHA256` from DEK secret + `storeName` + `recordId` + 128-bit `recordSalt`), with legacy `v1` payload compatibility preserved on read.
- **GCM Budget & Auto-Rotation**: Encryption invocations reserve counter blocks (`BLOCK_SIZE = 64`) in memory to minimize `vaultMeta` write amplification; key usage % displays in Settings > Security and auto-rotates at `70%` (`rotateAllKeys`).
- **Tamper-Evident Audit Hash Chain**: Audit entries (`db.auditLogs`) are encrypted and chained sequentially via `SHA-256` (`prevHash`, `entryHash`, `sequence`), verifiable on demand (`Verify Chain`) and exportable as a daily digest. These integrity checks are **not** a legal electronic signature.
- **Emergency Recovery & Optional WebAuthn PRF**: Base32 recovery key (`PBKDF2-HMAC-SHA256` `100,000` iterations) enables offline vault reset; supported browsers can optionally wrap DEK copy with WebAuthn `prf` hardware/biometric passkeys (`src/crypto/webauthnPrf.ts`).
- **Zero Network Exposure & Strict CSP**: No backend API exists; strict Content-Security-Policy (`connect-src 'none'` on production document, `object-src 'none'`, `frame-ancestors 'none'`) and Playwright tests block non-same-origin requests.
- **Inactivity Auto-Lock**: Configurable timer inside `VaultContext` clears active key material and locks UI on idle (user may set `"Never"` explicitly in clinic settings).

## 3. Honest Trust Boundaries & Out-of-Scope Threats

Local browser cryptography **CANNOT** defend against:

1. **Malicious Browser Extensions / Compromised Host OS**: Any privileged process reading browser memory while the vault is unlocked can read decrypted state.
2. **Shoulder Surfing / Unlocked Attendant Terminals**: Leaving the workstation unlocked or choosing `"Never"` auto-lock removes idle protection.
3. **Staff Role Attribution Model (`clinicSettings/admin_auth`)**: Staff Admin PIN switching uses per-install salted `PBKDF2-HMAC-SHA256` stored inside encrypted Dexie `clinicSettings` with exponential failure backoff (`5s`/`15s`/`60s`/`300s`) and forces setup away from defaults on first run. Even so, inside a single unlocked workstation browser, staff roles are **staff attribution labels only — not multi-tenant authentication**.
4. **Device Theft or Browser Profile Wipe Without Backups**: Although `navigator.storage.persist()` is requested automatically, browser profile deletion or OS reinstallation without exported `.ptbackup` files causes permanent data loss.
