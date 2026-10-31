#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INSTALL_LIFECYCLE_SCRIPTS = [
  'preinstall', 'install', 'postinstall', 'prepublish',
  'preprepare', 'prepare', 'postprepare', 'dependencies',
];

export function prepareDependencyManifests(manifest, lock) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || !lock || typeof lock !== 'object' || Array.isArray(lock)
    || ![2, 3].includes(lock.lockfileVersion)
    || !lock.packages?.[''] || typeof lock.packages[''] !== 'object') {
    throw new Error('Docker dependency preparation requires a package manifest and a v2/v3 lock with a root package.');
  }

  const preparedManifest = structuredClone(manifest);
  const preparedLock = structuredClone(lock);
  // Root lifecycle scripts can observe npm_package_version. Preserve that input
  // if such a script is introduced, even though version bumps then miss cache.
  const versionSensitive = INSTALL_LIFECYCLE_SCRIPTS.some((name) => manifest.scripts?.[name]);
  if (!versionSensitive) {
    for (const root of [preparedManifest, preparedLock, preparedLock.packages['']]) {
      if (Object.hasOwn(root, 'version')) root.version = '0.0.0';
    }
  }
  return { manifest: preparedManifest, lock: preparedLock };
}

function main() {
  const [sourceDir, outputDir, ...extra] = process.argv.slice(2);
  if (!sourceDir || !outputDir || extra.length || path.resolve(sourceDir) === path.resolve(outputDir)) {
    throw new Error('Usage: prepare-docker-dependencies.mjs <source-dir> <different-output-dir>');
  }
  const manifest = JSON.parse(readFileSync(path.join(sourceDir, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(sourceDir, 'package-lock.json'), 'utf8'));
  const prepared = prepareDependencyManifests(manifest, lock);
  mkdirSync(outputDir, { recursive: true });
  for (const [name, value] of [['package.json', prepared.manifest], ['package-lock.json', prepared.lock]]) {
    writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
