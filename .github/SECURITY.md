# Security Policy (`SECURITY.md`)

## Supported Architecture

PhysioRecord runs 100% locally in the clinician's browser using WebCrypto (`AES-GCM`, `PBKDF2-SHA256`, `HKDF-SHA256`) and IndexedDB (`Dexie`). There is **no central backend or telemetry server**.

## Reporting a Vulnerability

If you discover a cryptographic flaw, XSS vector, plaintext storage leak, backup integrity bypass, or data loss risk:

1. **Do not** disclose the exploit publicly in an issue before maintainers can review it.
2. Open a private GitHub Security Advisory at `https://github.com/Hhi5/physiorecord/security/advisories` (or contact the repository owner privately).
3. Include minimal reproduction steps, browser environment, affected file paths, and potential clinical/data impact.

## Known Security Boundaries

For full transparency regarding what browser-based local encryption protects—and what it cannot protect against (compromised browser extensions, OS memory inspection while unlocked, shared physical devices, and unmigrated legacy `localStorage` keys if auto-migration is interrupted)—see [`docs/THREAT_MODEL.md`](../docs/THREAT_MODEL.md).
