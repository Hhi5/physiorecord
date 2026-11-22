// =======================================================================
// PhysioRecord — Shared Application Constants & Security Boundaries
// Single source of truth for repository coordinates, sync protocol limits,
// and prototype-pollution guards across services and utilities.
// =======================================================================

export const OFFICIAL_GITHUB_REPO = 'Hhi5/physiorecord';
export const OFFICIAL_GITHUB_REPO_URL = `https://github.com/${OFFICIAL_GITHUB_REPO}`;
export const OFFICIAL_RELEASES_URL = `${OFFICIAL_GITHUB_REPO_URL}/releases`;
export const OFFICIAL_LATEST_RELEASE_URL = `${OFFICIAL_RELEASES_URL}/latest`;
export const OFFICIAL_GITHUB_RELEASES_API_URL = `https://api.github.com/repos/${OFFICIAL_GITHUB_REPO}/releases?per_page=10`;

export const SYNC_ENVELOPE_MAGIC = 'PHYSIORECORD_SYNC_V1' as const;
export const DEFAULT_LAN_SYNC_PORT = 47821;
export const MAX_SYNC_ENVELOPE_BYTES = 35 * 1024 * 1024;

export const DANGEROUS_OBJECT_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);
