import { readFileSync } from 'node:fs';
import path from 'node:path';

export const FRONTEND_COVERAGE_RATCHET_PATH = 'scripts/config/frontend/coverage-ratchet.json';

const COVERAGE_METRICS = Object.freeze([
  'statements',
  'lines',
  'functions',
  'branches',
]);

const CRITICAL_MINIMUMS = Object.freeze({
  statements: 85,
  lines: 85,
  functions: 85,
  branches: 80,
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateThresholds(thresholds, label, findings, minimums = null) {
  if (!isRecord(thresholds)) {
    findings.push(`${label} must include a thresholds object`);
    return;
  }

  for (const metric of COVERAGE_METRICS) {
    const value = thresholds[metric];
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      findings.push(`${label}.${metric} must be a finite percentage between 0 and 100`);
      continue;
    }
    if (minimums && value < minimums[metric]) {
      findings.push(`${label}.${metric} must stay at or above ${minimums[metric]}`);
    }
  }
}

function validateFiles(files, label, findings, seenFiles) {
  if (!Array.isArray(files) || files.length === 0) {
    findings.push(`${label} must include at least one governed file`);
    return;
  }

  const sortedFiles = [...files].sort((left, right) => left.localeCompare(right));
  if (files.some((file, index) => file !== sortedFiles[index])) {
    findings.push(`${label} files must stay sorted for deterministic coverage configuration`);
  }

  for (const file of files) {
    if (
      typeof file !== 'string'
      || !file.startsWith('apps/web-vite/src/')
      || path.posix.isAbsolute(file)
      || file.split('/').includes('..')
    ) {
      findings.push(`${label} contains invalid frontend source path ${JSON.stringify(file)}`);
      continue;
    }
    if (seenFiles.has(file)) {
      findings.push(`${file} is governed by more than one coverage ratchet group`);
      continue;
    }
    seenFiles.add(file);
  }
}

export function validateFrontendCoverageRatchetManifest(manifest) {
  const findings = [];
  const seenFiles = new Set();

  if (!isRecord(manifest)) {
    return ['coverage ratchet manifest must be an object'];
  }
  if (manifest.version !== 1) {
    findings.push('coverage ratchet manifest must use version 1');
  }

  if (!isRecord(manifest.critical)) {
    findings.push('coverage ratchet manifest must include a critical group');
  } else {
    validateThresholds(
      manifest.critical.thresholds,
      'critical.thresholds',
      findings,
      CRITICAL_MINIMUMS,
    );
    validateFiles(manifest.critical.files, 'critical', findings, seenFiles);
  }

  if (!Array.isArray(manifest.legacy) || manifest.legacy.length === 0) {
    findings.push('coverage ratchet manifest must include at least one legacy group');
  } else {
    const seenIds = new Set();
    for (const [index, group] of manifest.legacy.entries()) {
      const label = `legacy[${index}]`;
      if (!isRecord(group)) {
        findings.push(`${label} must be an object`);
        continue;
      }
      if (typeof group.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(group.id)) {
        findings.push(`${label}.id must use lower-kebab-case`);
      } else if (seenIds.has(group.id)) {
        findings.push(`legacy coverage ratchet id ${group.id} is duplicated`);
      } else {
        seenIds.add(group.id);
      }
      validateThresholds(group.thresholds, `${label}.thresholds`, findings);
      validateFiles(group.files, label, findings, seenFiles);
    }
  }

  return findings;
}

function coveragePatternForFiles(files) {
  if (files.length === 1) {
    return files[0];
  }
  return `{${files.join(',')}}`;
}

function copyThresholds(thresholds) {
  return Object.fromEntries(
    COVERAGE_METRICS.map((metric) => [metric, thresholds[metric]]),
  );
}

export function buildFrontendCoverageRatchetOptions(manifest) {
  const findings = validateFrontendCoverageRatchetManifest(manifest);
  if (findings.length > 0) {
    throw new Error(`Invalid frontend coverage ratchet manifest:\n- ${findings.join('\n- ')}`);
  }

  const include = [
    ...manifest.critical.files,
    ...manifest.legacy.flatMap((group) => group.files),
  ];
  const thresholds = {};

  for (const file of manifest.critical.files) {
    thresholds[file] = copyThresholds(manifest.critical.thresholds);
  }
  for (const group of manifest.legacy) {
    thresholds[coveragePatternForFiles(group.files)] = copyThresholds(group.thresholds);
  }

  return Object.freeze({
    include: Object.freeze([...include]),
    thresholds: Object.freeze(thresholds),
  });
}

export function readFrontendCoverageRatchetManifest(repoRoot) {
  return JSON.parse(
    readFileSync(path.join(repoRoot, FRONTEND_COVERAGE_RATCHET_PATH), 'utf8'),
  );
}
