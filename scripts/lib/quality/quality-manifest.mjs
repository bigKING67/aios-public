import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  createQualityCacheContext,
  expandGateInputFiles,
  getQualityCacheRoot,
} from './quality-cache.mjs';
import {
  createQualityRepoScan,
} from './quality-repo-scan.mjs';

const MANIFEST_SCHEMA_VERSION = 1;
const MANIFEST_DIR = 'manifests';

function hashString(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sortFileStats(left, right) {
  return left.path.localeCompare(right.path);
}

function expandManifestFiles(repoRoot, inputs, repoScan) {
  const context = createQualityCacheContext(repoRoot, { repoScan });
  return expandGateInputFiles(repoRoot, inputs, context);
}

export function createQualityManifestSnapshot(repoRoot, gates, options = {}) {
  const { mode = 'manual' } = options;
  const repoScan = options.repoScan ?? createQualityRepoScan(repoRoot);
  const inputSet = new Set();
  for (const gate of gates) {
    for (const input of gate.inputs ?? []) {
      if (typeof input === 'string' && input.trim()) {
        inputSet.add(input);
      }
    }
  }

  const inputs = [...inputSet].sort();
  const gateNames = [...new Set(gates.map((gate) => String(gate.name ?? '')).filter(Boolean))].sort();
  const files = expandManifestFiles(repoRoot, inputs, repoScan);
  const fileStats = files
    .map((file) => repoScan.statFile(file))
    .filter(Boolean)
    .sort(sortFileStats);
  const digest = hashString(JSON.stringify({
    files: fileStats,
    gateNames,
    inputs,
    mode,
    schema: MANIFEST_SCHEMA_VERSION,
  }));

  return {
    digest,
    files: fileStats,
    fileCount: fileStats.length,
    gateCount: gateNames.length,
    gateNames,
    inputCount: inputs.length,
    inputs,
    mode,
    schema: MANIFEST_SCHEMA_VERSION,
    scanFileCount: repoScan.trackedFiles.length,
    timestamp: new Date().toISOString(),
  };
}

export function qualityManifestPath(repoRoot, manifestId = 'latest') {
  const safeManifestId = String(manifestId).replace(/[^A-Za-z0-9_.-]/g, '_');
  return path.join(getQualityCacheRoot(repoRoot), MANIFEST_DIR, `${safeManifestId}.json`);
}

export function writeQualityManifestSnapshot(repoRoot, snapshot, options = {}) {
  const manifestPath = qualityManifestPath(repoRoot, options.manifestId ?? 'latest');
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return manifestPath;
}

export function hasQualityManifestSnapshot(repoRoot, manifestId = 'latest') {
  return existsSync(qualityManifestPath(repoRoot, manifestId));
}
