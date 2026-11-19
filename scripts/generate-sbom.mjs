#!/usr/bin/env node
// =======================================================================
// PhysioRecord — Zero-Dependency CycloneDX 1.5 SBOM Generator (0.2)
// Produces sbom.cdx.json from package.json & package-lock.json without
// pulling external transitive dependencies outside the R3 license policy.
// =======================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const PKG_PATH = path.join(ROOT_DIR, 'package.json');
const LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');
const SBOM_PATH = path.join(ROOT_DIR, 'sbom.cdx.json');

function splitPackageName(fullName) {
  if (fullName.startsWith('@')) {
    const slashIdx = fullName.indexOf('/');
    if (slashIdx > 0) {
      return {
        group: fullName.slice(0, slashIdx),
        name: fullName.slice(slashIdx + 1),
      };
    }
  }
  return { group: undefined, name: fullName };
}

function normalizeLockPackageName(lockKey) {
  const idx = lockKey.lastIndexOf('node_modules/');
  return idx >= 0 ? lockKey.slice(idx + 'node_modules/'.length) : lockKey;
}

function buildPurl(fullName, version) {
  const { group, name } = splitPackageName(fullName);
  const encodedGroup = group ? `${encodeURIComponent(group)}/` : '';
  return `pkg:npm/${encodedGroup}${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function readPackageJson(lockKey) {
  const fullPath = path.join(ROOT_DIR, lockKey, 'package.json');
  if (!fs.existsSync(fullPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    return {};
  }
}

function formatAuthor(rawAuthor) {
  if (!rawAuthor) return undefined;
  if (typeof rawAuthor === 'string') return rawAuthor.trim();
  if (typeof rawAuthor === 'object' && typeof rawAuthor.name === 'string') {
    return rawAuthor.name.trim();
  }
  return undefined;
}

function formatLicenseField(raw) {
  const expr =
    typeof raw === 'string'
      ? raw.trim()
      : raw && typeof raw === 'object' && typeof raw.type === 'string'
        ? raw.type.trim()
        : '';
  if (!expr) return undefined;
  if (/[\s()]/.test(expr)) {
    return [{ expression: expr }];
  }
  return [{ license: { id: expr, acknowledgement: 'declared' } }];
}

function buildDeterministicSerial(seedInput) {
  const hash = crypto.createHash('sha256').update(seedInput).digest('hex');
  // UUID v4 formatting bits using deterministic digest bytes
  const p1 = hash.slice(0, 8);
  const p2 = hash.slice(8, 12);
  const p3 = '4' + hash.slice(13, 16);
  const variant = ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  const p4 = variant + hash.slice(17, 20);
  const p5 = hash.slice(20, 32);
  return `urn:uuid:${p1}-${p2}-${p3}-${p4}-${p5}`;
}

function resolveDependencyRef(parentLockKey, depName, keySet) {
  let cursor = parentLockKey;
  while (true) {
    const candidate = cursor ? `${cursor}/node_modules/${depName}` : `node_modules/${depName}`;
    if (keySet.has(candidate)) return candidate;
    if (!cursor) break;
    const nmIdx = cursor.lastIndexOf('/node_modules/');
    if (nmIdx >= 0) {
      cursor = cursor.slice(0, nmIdx);
    } else {
      cursor = '';
    }
  }
  return null;
}

function main() {
  if (!fs.existsSync(PKG_PATH) || !fs.existsSync(LOCK_PATH)) {
    console.error('❌ Missing package.json or package-lock.json');
    process.exit(1);
  }

  const rootPkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const lockRaw = fs.readFileSync(LOCK_PATH, 'utf8');
  const lock = JSON.parse(lockRaw);
  const packages = lock.packages || {};

  const rootVersion = rootPkg.version || '1.0.0';
  const rootName = rootPkg.name || 'physiorecord';
  const rootBomRef = `${rootName}@${rootVersion}`;

  const keyToBomRef = new Map();
  const seenBomRefs = new Set([rootBomRef]);
  const allLockKeys = Object.keys(packages).filter(Boolean).sort();
  const keySet = new Set(allLockKeys);

  for (const lockKey of allLockKeys) {
    const entry = packages[lockKey];
    const fullName = normalizeLockPackageName(lockKey);
    const version = entry.version || '0.0.0';
    let bomRef = `${fullName}@${version}`;
    if (seenBomRefs.has(bomRef)) {
      bomRef = `${lockKey}@${version}`;
    }
    seenBomRefs.add(bomRef);
    keyToBomRef.set(lockKey, bomRef);
  }

  const components = [];
  const dependencies = [];

  const rootEntry = packages[''] || {};
  const rootDirectDeps = {
    ...(rootEntry.dependencies || rootPkg.dependencies || {}),
    ...(rootEntry.devDependencies || rootPkg.devDependencies || {}),
  };
  const rootDependsOn = Object.keys(rootDirectDeps)
    .sort()
    .map((depName) => resolveDependencyRef('', depName, keySet))
    .filter(Boolean)
    .map((k) => keyToBomRef.get(k))
    .filter(Boolean);

  dependencies.push({
    ref: rootBomRef,
    ...(rootDependsOn.length > 0 ? { dependsOn: rootDependsOn } : {}),
  });

  for (const lockKey of allLockKeys) {
    const entry = packages[lockKey];
    const fullName = normalizeLockPackageName(lockKey);
    const { group, name } = splitPackageName(fullName);
    const version = entry.version || '0.0.0';
    const bomRef = keyToBomRef.get(lockKey);
    const diskMeta = readPackageJson(lockKey);
    const licenseExpr = entry.license ?? diskMeta.license;
    const licenses = formatLicenseField(licenseExpr);
    const author = formatAuthor(diskMeta.author);

    const externalReferences = [];
    const repoUrl =
      typeof diskMeta.repository === 'string'
        ? diskMeta.repository
        : diskMeta.repository?.url;
    if (repoUrl) {
      externalReferences.push({ url: repoUrl, type: 'vcs' });
    }
    if (typeof diskMeta.homepage === 'string' && diskMeta.homepage.trim()) {
      externalReferences.push({ url: diskMeta.homepage.trim(), type: 'website' });
    }
    if (typeof entry.resolved === 'string' && entry.resolved.trim()) {
      externalReferences.push({ url: entry.resolved.trim(), type: 'distribution' });
    }

    const component = {
      type: 'library',
      ...(group ? { group } : {}),
      name,
      version,
      'bom-ref': bomRef,
      scope: entry.dev ? 'optional' : 'required',
      ...(author ? { author } : {}),
      ...(diskMeta.description ? { description: String(diskMeta.description) } : {}),
      ...(licenses ? { licenses } : {}),
      purl: buildPurl(fullName, version),
      ...(externalReferences.length > 0 ? { externalReferences } : {}),
      properties: [
        {
          name: 'cdx:npm:package:path',
          value: lockKey,
        },
      ],
    };
    components.push(component);

    const directMap = {
      ...(entry.dependencies || {}),
      ...(entry.optionalDependencies || {}),
    };
    const dependsOn = Object.keys(directMap)
      .sort()
      .map((depName) => resolveDependencyRef(lockKey, depName, keySet))
      .filter(Boolean)
      .map((k) => keyToBomRef.get(k))
      .filter(Boolean);

    dependencies.push({
      ref: bomRef,
      ...(dependsOn.length > 0 ? { dependsOn: Array.from(new Set(dependsOn)) } : {}),
    });
  }

  const sbom = {
    $schema: 'http://cyclonedx.org/schema/bom-1.5.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: buildDeterministicSerial(lockRaw + (rootPkg.license || '')),
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: {
        components: [
          {
            type: 'application',
            name: 'physiorecord-generate-sbom',
            version: '1.0.0',
          },
        ],
      },
      component: {
        type: 'application',
        name: rootName,
        version: rootVersion,
        'bom-ref': rootBomRef,
        purl: buildPurl(rootName, rootVersion),
        ...(rootPkg.license ? { licenses: formatLicenseField(rootPkg.license) } : {}),
        properties: [
          {
            name: 'cdx:npm:package:private',
            value: String(Boolean(rootPkg.private)),
          },
        ],
      },
    },
    components,
    dependencies,
  };

  fs.writeFileSync(SBOM_PATH, JSON.stringify(sbom, null, 2) + '\n', 'utf8');
  console.log(`📦 Wrote sbom.cdx.json (${components.length} components, specVersion 1.5).`);
}

main();
