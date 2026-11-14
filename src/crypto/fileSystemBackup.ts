// =======================================================================
// PhysioRecord — File System Access API Backup Persistence (Phase 1.9)
// Supports choosing a local backup folder (stored as FileSystemDirectoryHandle in db.fsHandles)
// plus native Save File picker with download fallback for cross-browser compatibility.
// =======================================================================

import { db } from '../db/db';

const AUTO_BACKUP_DIR_HANDLE_ID = 'auto_backup_dir';

interface PickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
}

export function isFileSystemAccessSupported(): {
  savePicker: boolean;
  directoryPicker: boolean;
} {
  if (typeof window === 'undefined') {
    return { savePicker: false, directoryPicker: false };
  }
  const w = window as PickerWindow;
  return {
    savePicker: typeof w.showSaveFilePicker === 'function',
    directoryPicker: typeof w.showDirectoryPicker === 'function',
  };
}

/**
 * Prompts the user to select a local folder for automatic/one-click backups and saves handle in IndexedDB.
 */
export async function pickAndPersistBackupFolder(): Promise<{ name: string } | null> {
  const w = typeof window !== 'undefined' ? (window as PickerWindow) : null;
  if (!w?.showDirectoryPicker) {
    throw new Error('ميزة اختيار مجلد النسخ التلقائي غير مدعومة في هذا المتصفح.');
  }

  const dirHandle = await w.showDirectoryPicker({
    id: 'physiorecord-backups',
    mode: 'readwrite',
  });

  await db.fsHandles.put({
    id: AUTO_BACKUP_DIR_HANDLE_ID,
    handle: dirHandle,
    folderName: dirHandle.name,
    updatedAt: new Date().toISOString(),
  });

  return { name: dirHandle.name };
}

export async function getConfiguredBackupFolder(): Promise<{
  configured: boolean;
  folderName?: string;
}> {
  try {
    const rec = await db.fsHandles.get(AUTO_BACKUP_DIR_HANDLE_ID);
    if (!rec || !rec.handle) return { configured: false };
    return { configured: true, folderName: rec.folderName || 'Backup Folder' };
  } catch {
    return { configured: false };
  }
}

export async function clearConfiguredBackupFolder(): Promise<void> {
  await db.fsHandles.delete(AUTO_BACKUP_DIR_HANDLE_ID);
}

/**
 * Write backup file directly to the persisted directory handle if permission is granted/granted interactively.
 */
export async function writeBackupToConfiguredFolder(
  content: string,
  filename: string
): Promise<{ written: boolean; folderName?: string }> {
  const rec = await db.fsHandles.get(AUTO_BACKUP_DIR_HANDLE_ID);
  if (!rec?.handle) {
    return { written: false };
  }

  const dirHandle = rec.handle as FileSystemDirectoryHandle & {
    queryPermission?: (desc: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (desc: { mode: 'readwrite' }) => Promise<PermissionState>;
  };

  if (typeof dirHandle.queryPermission === 'function') {
    let perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && typeof dirHandle.requestPermission === 'function') {
      perm = await dirHandle.requestPermission({ mode: 'readwrite' });
    }
    if (perm !== 'granted') {
      return { written: false };
    }
  }

  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();

  return { written: true, folderName: rec.folderName || dirHandle.name };
}

/**
 * Save backup file using configured folder, File System Save Picker, or browser download fallback.
 */
export async function saveBackupPackageToDevice(
  content: string,
  filename: string,
  preferPicker = true
): Promise<{
  method: 'directory-handle' | 'fs-picker' | 'download-fallback';
  confirmedSaved: boolean;
  filename: string;
  folderName?: string;
}> {
  // 1. Try File System Save Picker first if requested and supported
  const w = typeof window !== 'undefined' ? (window as PickerWindow) : null;
  if (preferPicker && w?.showSaveFilePicker) {
    try {
      const fileHandle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'PhysioRecord Encrypted Backup (.ptbackup)',
            accept: {
              'application/json': ['.ptbackup', '.json'],
            },
          },
        ],
      });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return {
        method: 'fs-picker',
        confirmedSaved: true,
        filename,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      // Fall through to folder/download fallback
    }
  }

  // 2. Try configured directory handle if present
  try {
    const folderResult = await writeBackupToConfiguredFolder(content, filename);
    if (folderResult.written) {
      return {
        method: 'directory-handle',
        confirmedSaved: true,
        filename,
        folderName: folderResult.folderName,
      };
    }
  } catch {
    // Fall through to download fallback
  }

  // 3. Browser download fallback
  if (typeof document !== 'undefined') {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    method: 'download-fallback',
    confirmedSaved: false,
    filename,
  };
}
