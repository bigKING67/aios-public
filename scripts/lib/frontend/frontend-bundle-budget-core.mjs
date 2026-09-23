/**
 * Production Vite bundle budget gate.
 *
 * This check reads the already-built apps/web-vite/dist output and compares
 * gzip sizes against scripts/config/frontend/bundle-budget.json. It intentionally
 * fails when dist is missing so CI and local runs do not accidentally green
 * light a stale or absent production bundle.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { getRepoRoot } from '../shared/guard-utils.mjs';
import {
  FRONTEND_BUILD_MANIFEST_PATH,
  computeFrontendBuildFingerprint,
} from './frontend-build-fingerprint.mjs';

const GUARD_NAME = 'frontend-bundle-budget';
const DIST_PATH = 'apps/web-vite/dist';
const BUDGET_PATH = 'scripts/config/frontend/bundle-budget.json';
const BYTE_UNITS = Object.freeze(['B', 'KiB', 'MiB']);
const MAX_TARGET_RATIO = 0.9;

const METRIC_CONFIGS = Object.freeze([
  {
    key: 'maxJsChunkGzipBytes',
    label: 'max JS chunk gzip',
    budgetKey: 'maxJsChunkGzipBytes',
  },
  {
    key: 'maxCssAssetGzipBytes',
    label: 'max CSS asset gzip',
    budgetKey: 'maxCssAssetGzipBytes',
  },
  {
    key: 'vendorEchartsGzipBytes',
    label: 'vendor-echarts gzip',
    budgetKey: 'vendorEchartsGzipBytes',
  },
  {
    key: 'totalJsGzipBytes',
    label: 'total JS gzip',
    budgetKey: 'totalJsGzipBytes',
  },
  {
    key: 'totalCssGzipBytes',
    label: 'total CSS gzip',
    budgetKey: 'totalCssGzipBytes',
  },
]);

class BundleBudgetCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BundleBudgetCheckError';
  }
}

function createBundleBudgetIo(options = {}) {
  return {
    exists: options.exists ?? existsSync,
    isDirectory: options.isDirectory ?? ((filePath) => statSync(filePath).isDirectory()),
    isFile: options.isFile ?? ((filePath) => statSync(filePath).isFile()),
    listDir: options.listDir ?? ((filePath) => readdirSync(filePath, { withFileTypes: true })),
    readFile: options.readFile ?? readFileSync,
  };
}

function formatBytes(bytes) {
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${BYTE_UNITS[unitIndex]}`;
}

function listFilesRecursive(dirPath, io) {
  const entries = io.listDir(dirPath);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, io));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function gzipFileSize(filePath, io) {
  return gzipSync(io.readFile(filePath), { level: 9 }).length;
}

function readJsonFile(repoRoot, filePath, fail, io, missingMessage) {
  const absPath = path.join(repoRoot, filePath);
  if (!io.exists(absPath) || !io.isFile(absPath)) {
    fail(missingMessage);
  }

  try {
    return JSON.parse(String(io.readFile(absPath)));
  } catch (error) {
    fail(`${filePath} parse failed: ${error.message}`);
  }
}

function readBudget(repoRoot, fail, io) {
  const budget = readJsonFile(
    repoRoot,
    BUDGET_PATH,
    fail,
    io,
    `${BUDGET_PATH} not found. Restore the frontend bundle budget file before running this gate.`,
  );

  if (!budget || typeof budget !== 'object' || Array.isArray(budget)) {
    fail(`${BUDGET_PATH} must contain a JSON object.`);
  }

  if (typeof budget.description !== 'string' || budget.description.trim() === '') {
    fail(`${BUDGET_PATH} must include a non-empty top-level description field.`);
  }

  if (typeof budget.reason !== 'string' || budget.reason.trim() === '') {
    fail(`${BUDGET_PATH} must include a non-empty top-level reason field.`);
  }

  if (
    !Number.isFinite(budget.targetRatio)
    || budget.targetRatio <= 0
    || budget.targetRatio > MAX_TARGET_RATIO
  ) {
    fail(`${BUDGET_PATH} targetRatio must be a number greater than 0 and no greater than ${MAX_TARGET_RATIO}.`);
  }

  if (!budget.budgets || typeof budget.budgets !== 'object' || Array.isArray(budget.budgets)) {
    fail(`${BUDGET_PATH} must include a budgets object.`);
  }

  for (const metric of METRIC_CONFIGS) {
    const entry = budget.budgets[metric.budgetKey];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`${BUDGET_PATH} is missing budgets.${metric.budgetKey}.`);
    }
    if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) {
      fail(`${BUDGET_PATH} budgets.${metric.budgetKey}.bytes must be a positive integer.`);
    }
    if (typeof entry.description !== 'string' || entry.description.trim() === '') {
      fail(`${BUDGET_PATH} budgets.${metric.budgetKey}.description must be a non-empty string.`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      fail(`${BUDGET_PATH} budgets.${metric.budgetKey}.reason must be a non-empty string.`);
    }
  }

  return budget;
}

function collectAssets(repoRoot, fail, io) {
  const distPath = path.join(repoRoot, DIST_PATH);
  if (!io.exists(distPath) || !io.isDirectory(distPath)) {
    fail(`${DIST_PATH} not found. Run npm run build before npm run verify:frontend:bundle-budget.`);
  }

  const assets = listFilesRecursive(distPath, io)
    .filter((filePath) => filePath.endsWith('.js') || filePath.endsWith('.css'))
    .map((filePath) => {
      const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/');
      const gzipBytes = gzipFileSize(filePath, io);
      return {
        gzipBytes,
        relativePath,
        type: filePath.endsWith('.js') ? 'js' : 'css',
      };
    });

  const jsAssets = assets.filter((asset) => asset.type === 'js');
  const cssAssets = assets.filter((asset) => asset.type === 'css');

  if (jsAssets.length === 0) {
    fail(`${DIST_PATH} does not contain any JavaScript assets. Run npm run build and check the Vite output.`);
  }
  if (cssAssets.length === 0) {
    fail(`${DIST_PATH} does not contain any CSS assets. Run npm run build and check the Vite output.`);
  }

  return { assets, cssAssets, jsAssets };
}

function verifyBuildManifest(repoRoot, fail, io, options = {}) {
  const manifest = readJsonFile(
    repoRoot,
    FRONTEND_BUILD_MANIFEST_PATH,
    fail,
    io,
    `${FRONTEND_BUILD_MANIFEST_PATH} not found. Run npm run build before npm run verify:frontend:bundle-budget so the production bundle includes a current build manifest.`,
  );

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail(`${FRONTEND_BUILD_MANIFEST_PATH} must contain a JSON object.`);
  }
  if (manifest.version !== 1) {
    fail(`${FRONTEND_BUILD_MANIFEST_PATH} must use version 1.`);
  }
  if (typeof manifest.sourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sourceFingerprint)) {
    fail(`${FRONTEND_BUILD_MANIFEST_PATH} must include a sha256 sourceFingerprint.`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail(`${FRONTEND_BUILD_MANIFEST_PATH} must include a non-empty files array.`);
  }
  if (!Array.isArray(manifest.envKeys) || manifest.envKeys.length === 0) {
    fail(`${FRONTEND_BUILD_MANIFEST_PATH} must include a non-empty envKeys array.`);
  }

  const current = computeFrontendBuildFingerprint(repoRoot, {
    ...io,
    env: options.env ?? process.env,
  });
  if (!arraysEqual(manifest.files, current.files)) {
    fail(
      [
        `${FRONTEND_BUILD_MANIFEST_PATH} files list does not match the current frontend source/config/env input set.`,
        `manifest files: ${manifest.files.length}`,
        `current files:  ${current.files.length}`,
        'Run npm run build before npm run verify:frontend:bundle-budget.',
      ].join('\n'),
    );
  }
  if (!arraysEqual(manifest.envKeys, current.envKeys)) {
    fail(
      [
        `${FRONTEND_BUILD_MANIFEST_PATH} envKeys list does not match the current frontend build env input set.`,
        `manifest envKeys: ${manifest.envKeys.join(', ')}`,
        `current envKeys:  ${current.envKeys.join(', ')}`,
        'Run npm run build before npm run verify:frontend:bundle-budget.',
      ].join('\n'),
    );
  }
  if (manifest.sourceFingerprint !== current.fingerprint) {
    fail(
      [
        `${DIST_PATH} is stale: ${FRONTEND_BUILD_MANIFEST_PATH} sourceFingerprint does not match the current frontend source/config/env fingerprint.`,
        `manifest fingerprint: ${manifest.sourceFingerprint}`,
        `current fingerprint:  ${current.fingerprint}`,
        'Run npm run build before npm run verify:frontend:bundle-budget.',
      ].join('\n'),
    );
  }

  return manifest;
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function maxAsset(assets) {
  return assets.reduce((largest, asset) => (
    largest === null || asset.gzipBytes > largest.gzipBytes ? asset : largest
  ), null);
}

function sumGzipBytes(assets) {
  return assets.reduce((total, asset) => total + asset.gzipBytes, 0);
}

function computeMetrics(collectedAssets, fail) {
  const { cssAssets, jsAssets } = collectedAssets;
  const vendorEchartsAssets = jsAssets.filter((asset) => (
    path.basename(asset.relativePath).startsWith('vendor-echarts-')
  ));

  if (vendorEchartsAssets.length === 0) {
    fail(`${DIST_PATH} is missing the vendor-echarts JavaScript chunk. Check apps/web-vite/vite.config.ts codeSplitting groups.`);
  }

  const largestJsAsset = maxAsset(jsAssets);
  const largestCssAsset = maxAsset(cssAssets);

  return {
    maxCssAssetGzipBytes: {
      bytes: largestCssAsset.gzipBytes,
      detail: largestCssAsset.relativePath,
    },
    maxJsChunkGzipBytes: {
      bytes: largestJsAsset.gzipBytes,
      detail: largestJsAsset.relativePath,
    },
    totalCssGzipBytes: {
      bytes: sumGzipBytes(cssAssets),
      detail: `${cssAssets.length} CSS assets`,
    },
    totalJsGzipBytes: {
      bytes: sumGzipBytes(jsAssets),
      detail: `${jsAssets.length} JS assets`,
    },
    vendorEchartsGzipBytes: {
      bytes: sumGzipBytes(vendorEchartsAssets),
      detail: vendorEchartsAssets.map((asset) => asset.relativePath).join(', '),
    },
  };
}

function strictTargetBytes(hardLimit, targetRatio) {
  return Math.ceil(hardLimit * targetRatio) - 1;
}

function targetPercentage(targetRatio) {
  return `${Number((targetRatio * 100).toFixed(4))}%`;
}

function metricAssessments(metrics, budget) {
  return METRIC_CONFIGS.map((metric) => {
    const actual = metrics[metric.key];
    const hardLimit = budget.budgets[metric.budgetKey].bytes;
    const strictTarget = strictTargetBytes(hardLimit, budget.targetRatio);
    const headroomPercentage = ((hardLimit - actual.bytes) / hardLimit) * 100;

    return {
      actual,
      hardLimit,
      headroomPercentage,
      label: metric.label,
      passed: actual.bytes <= strictTarget,
      strictTarget,
    };
  });
}

function formatAssessment(assessment, targetRatio) {
  const status = assessment.passed ? 'PASS' : 'FAIL';
  return [
    `- ${status} ${assessment.label}:`,
    `actual ${formatBytes(assessment.actual.bytes)} (${assessment.actual.bytes} B);`,
    `hard limit ${formatBytes(assessment.hardLimit)} (${assessment.hardLimit} B);`,
    `strict ${targetPercentage(targetRatio)} target ${formatBytes(assessment.strictTarget)} (${assessment.strictTarget} B);`,
    `headroom ${assessment.headroomPercentage.toFixed(2)}%;`,
    `detail ${assessment.actual.detail}`,
  ].join(' ');
}

export function checkFrontendBundleBudget(repoRoot = getRepoRoot(), options = {}) {
  const io = createBundleBudgetIo(options);
  const fail = (message) => {
    throw new BundleBudgetCheckError(message);
  };

  try {
    const budget = readBudget(repoRoot, fail, io);
    const collectedAssets = collectAssets(repoRoot, fail, io);
    const manifest = verifyBuildManifest(repoRoot, fail, io, options);
    const metrics = computeMetrics(collectedAssets, fail);
    const assessments = metricAssessments(metrics, budget);
    const metricLines = assessments.map((assessment) => formatAssessment(assessment, budget.targetRatio));
    const failed = assessments.some((assessment) => !assessment.passed);

    if (failed) {
      return {
        status: 1,
        stdout: '',
        stderr: [
          `[${GUARD_NAME}] Strict bundle target exceeded:`,
          ...metricLines,
          '',
          'Run npm run build, inspect apps/web-vite/dist/assets, and reduce bundle usage. Do not raise hard ceilings to recover target headroom.',
          '',
        ].join('\n'),
      };
    }

    return {
      status: 0,
      stdout: [
        `[${GUARD_NAME}] OK: bundle gzip hard ceilings and strict ${targetPercentage(budget.targetRatio)} targets passed with current build manifest (${manifest.files.length} files):`,
        ...metricLines,
        '',
      ].join('\n'),
      stderr: '',
    };
  } catch (error) {
    if (error instanceof BundleBudgetCheckError) {
      return {
        status: 1,
        stdout: '',
        stderr: `[${GUARD_NAME}] ${error.message}\n`,
      };
    }
    throw error;
  }
}
