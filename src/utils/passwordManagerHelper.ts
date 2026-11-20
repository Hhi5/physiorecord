// =======================================================================
// PhysioRecord — OS & Browser Password Manager Integration Helper
// Uses standard Web Credential Management API (Google Password Manager,
// iCloud Keychain, Chrome/Edge/Safari autofill) 100% locally & offline.
// Zero network calls; silently degrades when unsupported.
// =======================================================================

export const VAULT_CREDENTIAL_USERNAME = 'physiorecord-local-vault';

interface PasswordCredentialInitCompat {
  id: string;
  password: string;
  name?: string;
}

interface PasswordCredentialConstructorCompat {
  new (data: PasswordCredentialInitCompat): Credential;
}

interface WindowWithPasswordCredential extends Window {
  PasswordCredential?: PasswordCredentialConstructorCompat;
}

/**
 * Detect whether the current browser context supports OS/browser credential storage
 * or standard form-based password manager autofill.
 */
export function isCredentialManagerStoreSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.location?.protocol === 'app:') return false;
  const win = window as WindowWithPasswordCredential & { electronAPI?: { isElectron?: boolean } };
  if (win.electronAPI?.isElectron) return false;
  return Boolean(
    window.isSecureContext &&
      navigator.credentials &&
      typeof navigator.credentials.store === 'function' &&
      typeof win.PasswordCredential === 'function'
  );
}

/**
 * Prompt the browser / OS password manager (Google Password Manager, Edge, Chrome, etc.)
 * to save or update the local vault master password after setup, login, or password reset.
 * Note: Safari / iCloud Keychain primarily triggers save prompts automatically via standard
 * `<form>` fields with `autocomplete="username"` + `autocomplete="current-password|new-password"`.
 */
export async function saveVaultPasswordToBrowserManager(
  password: string,
  displayName = 'PhysioRecord Local Vault'
): Promise<boolean> {
  if (!password || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  try {
    const win = window as WindowWithPasswordCredential;
    if (
      !window.isSecureContext ||
      !navigator.credentials ||
      typeof navigator.credentials.store !== 'function' ||
      typeof win.PasswordCredential !== 'function'
    ) {
      return false;
    }

    const credential = new win.PasswordCredential({
      id: VAULT_CREDENTIAL_USERNAME,
      name: displayName,
      password,
    });
    await navigator.credentials.store(credential);
    return true;
  } catch {
    // Non-fatal: browser policy, private mode, or iframe restriction may decline programmatic store.
    // Form autocomplete semantics still allow native browser save/autofill prompts.
    return false;
  }
}
