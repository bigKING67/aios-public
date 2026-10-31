#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareDependencyManifests } from '../../build/prepare-docker-dependencies.mjs';

const manifest = {
  name: 'cache-fixture', version: '1.2.3', private: true,
  dependencies: { example: '2.3.4' }, devDependencies: { tool: '3.4.5' },
  scripts: { build: 'node build.mjs' }, engines: { node: '>=24' },
  overrides: { example: '2.3.4' }, config: { mode: 'production' },
};
const lock = {
  name: manifest.name, version: manifest.version, lockfileVersion: 3,
  packages: {
    '': { name: manifest.name, version: manifest.version, dependencies: manifest.dependencies },
    'node_modules/example': { version: '2.3.4', resolved: 'https://example.test/example.tgz', integrity: 'sha512-fixture' },
  },
};
const original = structuredClone({ manifest, lock });
const prepared = prepareDependencyManifests(manifest, lock);
const changedVersion = structuredClone(original);
changedVersion.manifest.version = '9.9.9';
changedVersion.lock.version = '9.9.9';
changedVersion.lock.packages[''].version = '9.9.9';
assert.deepEqual(prepareDependencyManifests(changedVersion.manifest, changedVersion.lock), prepared);
assert.deepEqual({ manifest, lock }, original, 'input objects must remain unchanged');
assert.deepEqual(prepared.lock.packages['node_modules/example'], lock.packages['node_modules/example']);

for (const field of ['dependencies', 'devDependencies', 'scripts', 'engines', 'overrides', 'config']) {
  const changed = structuredClone(manifest);
  changed[field].fixture = 'changed';
  assert.notDeepEqual(prepareDependencyManifests(changed, lock), prepared, `${field} changes must invalidate cache`);
}
const changedLock = structuredClone(lock);
changedLock.packages['node_modules/example'].integrity = 'sha512-changed';
assert.notDeepEqual(prepareDependencyManifests(manifest, changedLock), prepared);
for (const name of ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare', 'dependencies']) {
  const sensitive = { ...manifest, scripts: { ...manifest.scripts, [name]: 'node install.mjs' } };
  assert.deepEqual(prepareDependencyManifests(sensitive, lock), { manifest: sensitive, lock });
}
assert.throws(() => prepareDependencyManifests(manifest, { lockfileVersion: 1 }), /v2\/v3 lock/);

const directory = mkdtempSync(path.join(os.tmpdir(), 'aios-docker-dependency-behavior-'));
try {
  const sourceDir = path.join(directory, 'source');
  const outputDir = path.join(directory, 'output');
  mkdirSync(sourceDir);
  for (const [name, data] of [['package.json', manifest], ['package-lock.json', lock]]) {
    writeFileSync(path.join(sourceDir, name), JSON.stringify(data));
  }
  const script = fileURLToPath(new URL('../../build/prepare-docker-dependencies.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, sourceDir, outputDir], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(path.join(outputDir, 'package.json'), 'utf8')), prepared.manifest);
  assert.deepEqual(JSON.parse(readFileSync(path.join(outputDir, 'package-lock.json'), 'utf8')), prepared.lock);
  assert.equal(JSON.parse(readFileSync(path.join(sourceDir, 'package.json'), 'utf8')).version, manifest.version);
  assert.notEqual(spawnSync(process.execPath, [script, sourceDir, sourceDir]).status, 0);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('[frontend-docker-dependency-cache-behavior] PASS: version reuse, install-input invalidation, lifecycle fallback and CLI source preservation.');
