import { test, expect } from '@playwright/test';

const DB_NAME = 'PhysioRecordDB';

const V10_OBJECT_STORES: Array<{ name: string; keyPath: string }> = [
  { name: 'patients', keyPath: 'id' },
  { name: 'episodes', keyPath: 'id' },
  { name: 'sessions', keyPath: 'id' },
  { name: 'soapNotes', keyPath: 'id' },
  { name: 'clinicalAddenda', keyPath: 'id' },
  { name: 'appointments', keyPath: 'id' },
  { name: 'waitingList', keyPath: 'id' },
  { name: 'invoices', keyPath: 'id' },
  { name: 'payments', keyPath: 'id' },
  { name: 'expenses', keyPath: 'id' },
  { name: 'auditLogs', keyPath: 'id' },
  { name: 'staffState', keyPath: 'id' },
  { name: 'episodeClinical', keyPath: 'id' },
  { name: 'customWidgets', keyPath: 'id' },
  { name: 'migrationReports', keyPath: 'id' },
  { name: 'recurringSchedules', keyPath: 'id' },
  { name: 'recurringSkippedDates', keyPath: 'id' },
  { name: 'clinicSettings', keyPath: 'id' },
  { name: 'patientMedications', keyPath: 'id' },
  { name: 'consents', keyPath: 'id' },
  { name: 'cashCloses', keyPath: 'id' },
  { name: 'attachments', keyPath: 'id' },
  { name: 'noteTemplates', keyPath: 'id' },
  { name: 'fsHandles', keyPath: 'id' },
  { name: 'migrationState', keyPath: 'id' },
  { name: 'vaultMeta', keyPath: 'id' },
  { name: 'episodeSequences', keyPath: 'episodeId' },
  { name: 'drafts', keyPath: 'id' },
];

test.describe('Dexie v11 Real-Browser IndexedDB Compatibility & Multi-Tab Lifecycle', () => {
  test('1. upgrades real IndexedDB non-destructively from v10 (IDB 100, 28 stores) -> v11 (IDB 110, 29 stores) preserving existing records', async ({
    page,
  }) => {
    await page.goto('/manifest.webmanifest', { waitUntil: 'domcontentloaded' });

    // Seed an authentic Dexie v10 IndexedDB (version = 100, 28 stores, NO deletionTombstones)
    await page.evaluate(
      async ({ dbName, stores }) => {
        await new Promise<void>((resolve, reject) => {
          const del = indexedDB.deleteDatabase(dbName);
          del.onsuccess = () => resolve();
          del.onerror = () => reject(del.error);
          del.onblocked = () => resolve();
        });

        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open(dbName, 100);
          req.onupgradeneeded = () => {
            const idb = req.result;
            for (const s of stores) {
              if (!idb.objectStoreNames.contains(s.name)) {
                idb.createObjectStore(s.name, { keyPath: s.keyPath });
              }
            }
          };
          req.onsuccess = () => {
            const idb = req.result;
            const tx = idb.transaction(['vaultMeta', 'patients'], 'readwrite');
            tx.objectStore('vaultMeta').put({
              id: 'auth',
              salt: new Uint8Array(16).fill(7),
              wrappedDek: new Uint8Array(32).fill(3),
              wrappedDekIv: new Uint8Array(12).fill(1),
              verifierIv: new Uint8Array(12).fill(2),
              verifierCiphertext: new Uint8Array(32).fill(4),
              schemaVersion: 10,
              kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
              kdfIterations: 600000,
              dekVersion: 2,
              encryptionInvocationCount: 1,
              vaultGeneration: 1,
            });
            tx.objectStore('patients').put({
              id: 'pat-legacy-v10-survives',
              createdAt: '2026-11-20T09:00:00.000Z',
              updatedAt: '2026-11-20T09:00:00.000Z',
              isArchived: 0,
              recordCryptoVersion: 2,
              dekVersion: 2,
              recordSalt: new Uint8Array(16).fill(9),
              iv: new Uint8Array(12).fill(8),
              ciphertext: new Uint8Array(24).fill(5),
            });
            tx.oncomplete = () => {
              idb.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        });
      },
      { dbName: DB_NAME, stores: V10_OBJECT_STORES }
    );

    // Boot the built v11 app so it opens & upgrades the v10 database in-place
    await page.goto('/', { waitUntil: 'networkidle' });

    // Must render LockScreen in unlock mode (existing vault detected) and NOT downgrade block
    await expect(page.locator('[data-testid="schema-downgrade-blocked-card"]')).toHaveCount(0);
    await expect(page.locator('input#password')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input#confirmPassword')).toHaveCount(0);

    // Inspect the upgraded real IndexedDB on disk
    const dbState = await page.evaluate(async (dbName) => {
      return await new Promise<{
        version: number;
        storeNames: string[];
        hasPatientRow: boolean;
      }>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const idb = req.result;
          const storeNames = Array.from(idb.objectStoreNames).sort();
          const tx = idb.transaction('patients', 'readonly');
          const getReq = tx.objectStore('patients').get('pat-legacy-v10-survives');
          getReq.onsuccess = () => {
            const hasPatientRow = Boolean(getReq.result && getReq.result.id === 'pat-legacy-v10-survives');
            const version = idb.version;
            idb.close();
            resolve({ version, storeNames, hasPatientRow });
          };
          getReq.onerror = () => reject(getReq.error);
        };
        req.onerror = () => reject(req.error);
      });
    }, DB_NAME);

    expect(dbState.version).toBe(110); // Dexie v11 = IDB version 110
    expect(dbState.storeNames).toContain('deletionTombstones');
    expect(dbState.storeNames.length).toBe(29);
    expect(dbState.hasPatientRow).toBe(true);
  });

  test('2. verifies 1.0.5 silent-open root cause empirically and proves v11 proactive downgrade guard blocks future v12 DB', async ({
    page,
  }) => {
    await page.goto('/manifest.webmanifest', { waitUntil: 'domcontentloaded' });

    // A) Create a future v12 DB (IDB version = 120, extra future store, vaultMeta.schemaVersion = 12)
    await page.evaluate(
      async ({ dbName, stores }) => {
        await new Promise<void>((resolve, reject) => {
          const del = indexedDB.deleteDatabase(dbName);
          del.onsuccess = () => resolve();
          del.onerror = () => reject(del.error);
          del.onblocked = () => resolve();
        });

        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open(dbName, 120);
          req.onupgradeneeded = () => {
            const idb = req.result;
            for (const s of stores) {
              if (!idb.objectStoreNames.contains(s.name)) {
                idb.createObjectStore(s.name, { keyPath: s.keyPath });
              }
            }
            if (!idb.objectStoreNames.contains('deletionTombstones')) {
              idb.createObjectStore('deletionTombstones', { keyPath: 'id' });
            }
            if (!idb.objectStoreNames.contains('futureV12AuditStore')) {
              idb.createObjectStore('futureV12AuditStore', { keyPath: 'id' });
            }
          };
          req.onsuccess = () => {
            const idb = req.result;
            const tx = idb.transaction('vaultMeta', 'readwrite');
            tx.objectStore('vaultMeta').put({
              id: 'auth',
              salt: new Uint8Array(16).fill(1),
              wrappedDek: new Uint8Array(32).fill(2),
              wrappedDekIv: new Uint8Array(12).fill(3),
              verifierIv: new Uint8Array(12).fill(4),
              verifierCiphertext: new Uint8Array(32).fill(5),
              schemaVersion: 12,
              kdfAlgorithm: 'PBKDF2-HMAC-SHA256',
              kdfIterations: 600000,
              dekVersion: 2,
              encryptionInvocationCount: 0,
              vaultGeneration: 1,
            });
            tx.oncomplete = () => {
              idb.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        });
      },
      { dbName: DB_NAME, stores: V10_OBJECT_STORES }
    );

    // B) Verify empirically in real Chromium IDB:
    //    - versionless open() (what Dexie 4 uses when existing version > declared max) succeeds without throwing VersionError
    //    - explicit indexedDB.open(name, 100) DOES throw VersionError
    const empiricalProbe = await page.evaluate(async (dbName) => {
      const versionlessVersion = await new Promise<number>((resolve, reject) => {
        const r = indexedDB.open(dbName);
        r.onsuccess = () => {
          const v = r.result.version;
          r.result.close();
          resolve(v);
        };
        r.onerror = () => reject(r.error);
      });

      const explicitLowerErr = await new Promise<string | null>((resolve) => {
        const r = indexedDB.open(dbName, 100);
        r.onsuccess = () => {
          r.result.close();
          resolve(null);
        };
        r.onerror = () => resolve(r.error?.name ?? 'UnknownError');
      });

      return { versionlessVersion, explicitLowerErr };
    }, DB_NAME);

    expect(empiricalProbe.versionlessVersion).toBe(120);
    expect(empiricalProbe.explicitLowerErr).toBe('VersionError');

    // C) Boot the real built v11 app against this v12 DB:
    //    Despite Dexie 4's silent open, our proactive inspectOpenedDatabaseSchemaDowngrade MUST block LockScreen!
    await page.goto('/', { waitUntil: 'networkidle' });
    const downgradeCard = page.locator('[data-testid="schema-downgrade-blocked-card"]');
    await expect(downgradeCard).toBeVisible({ timeout: 15_000 });
    await expect(downgradeCard).toContainText(/12/);
    await expect(downgradeCard).toContainText(/futureV12AuditStore/);
    // Must NEVER offer first-time setup / overwrite
    await expect(page.locator('input#confirmPassword')).toHaveCount(0);
  });

  test('3. handles multi-tab versionchange (graceful release) and blocked (boot alert + auto-unblock) events in real Chromium', async ({
    context,
  }) => {
    // --- Part A: versionchange ---
    // Tab 1 boots normally on v11
    const tab1 = await context.newPage();
    await tab1.goto('/', { waitUntil: 'networkidle' });
    await expect(tab1.locator('input#password')).toBeVisible({ timeout: 15_000 });

    // Tab 2 opens the same origin (static asset, no competing Dexie instance) and upgrades the DB to v12 (IDB version 120)
    const tab2 = await context.newPage();
    await tab2.goto('/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
    const upgradeResult = await tab2.evaluate(async (dbName) => {
      return await new Promise<{ upgradedTo: number; sawBlocked: boolean }>((resolve, reject) => {
        let sawBlocked = false;
        const req = indexedDB.open(dbName, 120);
        req.onblocked = () => {
          sawBlocked = true;
        };
        req.onupgradeneeded = () => {
          // Schema bump simulation
        };
        req.onsuccess = () => {
          const v = req.result.version;
          req.result.close();
          resolve({ upgradedTo: v, sawBlocked });
        };
        req.onerror = () => reject(req.error);
      });
    }, DB_NAME);

    expect(upgradeResult.upgradedTo).toBe(120);
    // Because Tab 1's versionchange handler immediately calls db.close(), Tab 1 shows the multi-tab notice card
    await expect(tab1.locator('[data-testid="db-lifecycle-notice-card"]')).toBeVisible({
      timeout: 10_000,
    });

    await tab1.close();
    await tab2.close();

    // --- Part B: blocked ---
    // Reset DB to v10 and hold an unyielding raw IDB connection in Blocker Tab (ignores versionchange!)
    const blockerTab = await context.newPage();
    // Navigate blockerTab to same-origin static asset so it has ZERO Dexie connection of its own
    await blockerTab.goto('/manifest.webmanifest', { waitUntil: 'domcontentloaded' });

    await blockerTab.evaluate(
      async ({ dbName, stores }) => {
        await new Promise<void>((resolve, reject) => {
          const del = indexedDB.deleteDatabase(dbName);
          del.onsuccess = () => resolve();
          del.onerror = () => reject(del.error);
          del.onblocked = () => resolve();
        });

        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.open(dbName, 100);
          req.onupgradeneeded = () => {
            const idb = req.result;
            for (const s of stores) {
              if (!idb.objectStoreNames.contains(s.name)) {
                idb.createObjectStore(s.name, { keyPath: s.keyPath });
              }
            }
          };
          req.onsuccess = () => {
            const idb = req.result;
            // Deliberately refuse to close on versionchange to trigger a real 'blocked' event in Tab 2!
            idb.onversionchange = () => {
              (window as unknown as Record<string, unknown>).__sawVersionChange = true;
            };
            (window as unknown as Record<string, unknown>).__heldIdb = idb;
            resolve();
          };
          req.onerror = () => reject(req.error);
        });
      },
      { dbName: DB_NAME, stores: V10_OBJECT_STORES }
    );

    // Now open App Tab -> tries to upgrade v10 (100) -> v11 (110) and MUST get blocked!
    const upgradingTab = await context.newPage();
    await upgradingTab.goto('/', { waitUntil: 'domcontentloaded' });

    // App boot screen MUST show the multi-tab blocked alert card
    await expect(upgradingTab.locator('[data-testid="db-lifecycle-blocked-boot-card"]')).toBeVisible({
      timeout: 15_000,
    });

    // Release the blocking connection in Blocker Tab
    await blockerTab.evaluate(() => {
      const held = (window as unknown as Record<string, IDBDatabase | undefined>).__heldIdb;
      held?.close();
    });

    // Upgrading Tab MUST automatically unblock, complete v10 -> v11 upgrade, and render LockScreen!
    await expect(upgradingTab.locator('input#password')).toBeVisible({ timeout: 15_000 });
    await expect(upgradingTab.locator('[data-testid="db-lifecycle-blocked-boot-card"]')).toHaveCount(0);

    await blockerTab.close();
    await upgradingTab.close();
  });
});
