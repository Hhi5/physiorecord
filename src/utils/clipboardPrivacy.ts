/**
 * src/utils/clipboardPrivacy.ts
 * Copies sensitive secrets (Emergency Recovery Keys) to clipboard and schedules
 * automatic clipboard clearing after 60 seconds so secrets do not linger in copy history.
 */

export const CLIPBOARD_AUTO_CLEAR_MS = 60_000;

let activeClearTimer: ReturnType<typeof setTimeout> | null = null;
let lastCopiedMarker: string | null = null;

export function cancelPendingClipboardClear(): void {
  if (activeClearTimer) {
    clearTimeout(activeClearTimer);
    activeClearTimer = null;
  }
  lastCopiedMarker = null;
}

export async function copySecretWithAutoClear(
  secretText: string,
  clearAfterMs: number = CLIPBOARD_AUTO_CLEAR_MS
): Promise<{ copied: boolean; clearScheduled: boolean }> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return { copied: false, clearScheduled: false };
  }

  await navigator.clipboard.writeText(secretText);
  cancelPendingClipboardClear();
  lastCopiedMarker = secretText;

  if (clearAfterMs > 0 && typeof setTimeout !== 'undefined') {
    activeClearTimer = setTimeout(() => {
      activeClearTimer = null;
      const expectedSecret = lastCopiedMarker;
      lastCopiedMarker = null;
      void (async () => {
        try {
          if (typeof navigator.clipboard?.readText === 'function') {
            const current = await navigator.clipboard.readText().catch(() => expectedSecret);
            if (expectedSecret && current !== expectedSecret) {
              return;
            }
          }
          await navigator.clipboard.writeText('');
        } catch {
          // Ignore browser focus / permission restrictions on background clipboard overwrite
        }
      })();
    }, clearAfterMs);
    return { copied: true, clearScheduled: true };
  }

  return { copied: true, clearScheduled: false };
}
