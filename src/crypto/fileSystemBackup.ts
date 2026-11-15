// =======================================================================
// PhysioRecord — File System Access & Multi-Platform Native Backup Persistence (Phase 1.9)
// Supports choosing a local backup folder (stored as FileSystemDirectoryHandle in db.fsHandles
// or persisted path in Windows Electron) plus native Save File picker (Windows Electron IPC,
// Android SAF ACTION_CREATE_DOCUMENT / Share Sheet, or Web File System Access API)
// with browser download fallback.
// =======================================================================

import { db } from '../db/db';
import {
  getAndroidNativePlugin,
  getElectronDesktopBridge,
  saveTextFilePortable,
} from '../platform/nativeBridge';

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

  const electronBridge = getElectronDesktopBridge();
  if (electronBridge) {
    return {
      savePicker: Boolean(electronBridge.saveFile),
      directoryPicker: Boolean(electronBridge.pickBackupDirectory),
    };
  }

  const androidPlugin = getAndroidNativePlugin();
  if (androidPlugin) {
    return {
      savePicker: Boolean(androidPlugin.saveFileToDevice || androidPlugin.shareFile),
      directoryPicker: false,
    };
  }

  const w = window as PickerWindow;
  return {
    savePicker: typeof w.showSaveFilePicker === 'function',
    directoryPicker: typeof w.showDirectoryPicker === 'function',
  };
}

/**
 * Prompts the user to select a local folder for automatic/one-click backups and saves handle in IndexedDB
 * (or in Electron main process settings on Windows).
 */
export async function pickAndPersistBackupFolder(): Promise<{ name: string } | null> {
  const electronBridge = getElectronDesktopBridge();
  if (electronBridge?.pickBackupDirectory) {
    const res = await electronBridge.pickBackupDirectory();
    if (res.cancelled || !res.configured) return null;
    return { name: res.folderName || res.folderPath || 'Backup Folder' };
  }

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
  const electronBridge = getElectronDesktopBridge();
  if (electronBridge?.getConfiguredBackupDirectory) {
    try {
      const res = await electronBridge.getConfiguredBackupDirectory();
      if (res.configured) {
        return { configured: true, folderName: res.folderName || res.folderPath || 'Backup Folder' };
      }
      return { configured: false };
    } catch {
      return { configured: false };
    }
  }

  try {
    const rec = await db.fsHandles.get(AUTO_BACKUP_DIR_HANDLE_ID);
    if (!rec || !rec.handle) return { configured: false };
    return { configured: true, folderName: rec.folderName || 'Backup Folder' };
  } catch {
    return { configured: false };
  }
}

export async function clearConfiguredBackupFolder(): Promise<void> {
  const electronBridge = getElectronDesktopBridge();
  if (electronBridge?.clearConfiguredBackupDirectory) {
    await electronBridge.clearConfiguredBackupDirectory();
  }
  await db.fsHandles.delete(AUTO_BACKUP_DIR_HANDLE_ID);
}

/**
 * Write backup file directly to the persisted directory handle if permission is granted/granted interactively.
 */
export async function writeBackupToConfiguredFolder(
  content: string,
  filename: string
): Promise<{ written: boolean; folderName?: string }> {
  const electronBridge = getElectronDesktopBridge();
  if (electronBridge?.writeToConfiguredBackupDirectory) {
    try {
      const res = await electronBridge.writeToConfiguredBackupDirectory({ filename, content });
      if (res.written) {
        return { written: true, folderName: res.folderName || 'Backup Folder' };
      }
    } catch {
      // Fall through
    }
  }

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
 * Save backup file using configured folder, Native OS/Android SAF Save Picker, Web File System Save Picker, or browser download fallback.
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
  // 1. If a configured backup directory is set and user didn't explicitly force picker over directory
  if (!preferPicker) {
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
      // Fall through
    }
  }

  // 2. Native Electron or Android SAF / Share bridge
  const electronBridge = getElectronDesktopBridge();
  const androidPlugin = getAndroidNativePlugin();
  if (electronBridge?.saveFile || androidPlugin?.saveFileToDevice || androidPlugin?.shareFile) {
    const portableRes = await saveTextFilePortable({
      filename,
      content,
      mimeType: 'application/json',
      description: 'PhysioRecord Encrypted Backup (.ptbackup)',
      extensions: ['ptbackup', 'json'],
    });
    if (portableRes.confirmedSaved) {
      return {
        method: 'fs-picker',
        confirmedSaved: true,
        filename: portableRes.filename,
      };
    }
  }

  // 3. Try Web File System Save Picker if requested and supported
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

  // 4. Try configured directory handle if present
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

  // 5. Browser download fallback
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
