import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  auditReportApiContract,
} from './frontend-report-api-contract-core.mjs';

function writeFixtureFile(repoRoot, filePath, source) {
  const fullPath = path.join(repoRoot, filePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, source, 'utf8');
}

function reportQuerySource() {
  return `
export function normalizeQueryValue() {}
export function normalizeWeekPeriodValue() {}
export function looksLikeWeekPeriod() {}
export function normalizeSummaryScopeValue() {}
export function resolveWeeklySummaryQuery() {}
`;
}

function requestPolicySource() {
  return `
export const CACHE_CONFIG = {};
export function getBackendCacheControl() {}
export function getRequestTransportError() {}
export function getRequestErrorCode() {}
export function createApiClientError() {}
export function mergeRequestConfig() {}
`;
}

function weeklySource(extra = '') {
  return `
export async function getWeeklyReport() {}
export async function getLatestWeeklyPeriod() {}
export async function getAllWeeklyPeriods() {}
export async function getWeeklyMetadata() {}
export async function listReports() {}
${extra}
`;
}

function monthlySource() {
  return `
export async function getMonthlyReport() {}
export async function getLatestMonthlyPeriod() {}
export async function getAllMonthlyPeriods() {}
export async function getMonthlyMetadata() {}
`;
}

function summarySource() {
  return `
export interface WeeklySummaryConclusionsInput {}
export async function generateSummary() {}
export async function getSummaryStatus() {}
export async function getSummary() {}
export async function updateSummary() {}
`;
}

function apiSource(methods = []) {
  return `
import { CACHE_CONFIG } from './report-api/request-policy';
import {
  getWeeklyReport,
  getLatestWeeklyPeriod,
  getAllWeeklyPeriods,
  getWeeklyMetadata,
  listReports,
} from './report-api/weekly';
import {
  getMonthlyReport,
  getLatestMonthlyPeriod,
  getAllMonthlyPeriods,
  getMonthlyMetadata,
} from './report-api/monthly';
import {
  type WeeklySummaryConclusionsInput,
  generateSummary,
  getSummaryStatus,
  getSummary,
  updateSummary,
} from './report-api/summary';

export { CACHE_CONFIG };
export type { WeeklySummaryConclusionsInput };

export const reportApi = {
  ${methods.join(',\n  ')},
};

export default reportApi;
`;
}

const expectedMethods = [
  'getWeeklyReport',
  'getLatestWeeklyPeriod',
  'getAllWeeklyPeriods',
  'getWeeklyMetadata',
  'listReports',
  'getMonthlyReport',
  'getLatestMonthlyPeriod',
  'getAllMonthlyPeriods',
  'getMonthlyMetadata',
  'generateSummary',
  'getSummaryStatus',
  'getSummary',
  'updateSummary',
];

function createFixture(overrides = {}) {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'aios-report-api-contract-'));
  writeFixtureFile(repoRoot, 'apps/web-vite/src/lib/report-api/report-query.ts', overrides.reportQuery ?? reportQuerySource());
  writeFixtureFile(repoRoot, 'apps/web-vite/src/lib/report-api/request-policy.ts', overrides.requestPolicy ?? requestPolicySource());
  writeFixtureFile(repoRoot, 'apps/web-vite/src/lib/report-api/weekly.ts', overrides.weekly ?? weeklySource());
  writeFixtureFile(repoRoot, 'apps/web-vite/src/lib/report-api/monthly.ts', overrides.monthly ?? monthlySource());
  writeFixtureFile(repoRoot, 'apps/web-vite/src/lib/report-api/summary.ts', overrides.summary ?? summarySource());
  writeFixtureFile(repoRoot, 'apps/web-vite/src/lib/report-api/report-api-contract.test.ts', 'export {};\n');
  writeFixtureFile(repoRoot, 'apps/web-vite/src/lib/api.ts', overrides.api ?? apiSource(expectedMethods));
  for (const [filePath, source] of Object.entries(overrides.extraFiles ?? {})) {
    writeFixtureFile(repoRoot, filePath, source);
  }
  return repoRoot;
}

function withFixture(overrides, callback) {
  const repoRoot = createFixture(overrides);
  try {
    callback(auditReportApiContract(repoRoot));
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
}

export function runFrontendReportApiContractBehaviorFixtures({
  assertEqual,
  assertIncludes,
}) {
  withFixture({}, (findings) => {
    assertEqual(findings.length, 0, `baseline split report API contract should pass: ${findings.join('\n')}`);
  });

  withFixture({ api: apiSource(expectedMethods.filter((method) => method !== 'updateSummary')) }, (findings) => {
    assertIncludes(findings.join('\n'), 'reportApi keys drifted', 'facade method drift should fail');
  });

  withFixture({ weekly: weeklySource("import { reportApi } from '../api';") }, (findings) => {
    assertIncludes(findings.join('\n'), 'must not import the public API facade', 'report API modules should stay acyclic');
  });

  withFixture({
    extraFiles: {
      'apps/web-vite/src/lib/report-api/unowned-module.ts': 'export {};\n',
    },
  }, (findings) => {
    assertIncludes(findings.join('\n'), 'files must be', 'unexpected report API modules should fail');
  });

  withFixture({
    extraFiles: {
      'apps/web-vite/src/hooks/use-report-api-internal.ts': "import { getWeeklyReport } from '@/lib/report-api/weekly';\n",
    },
  }, (findings) => {
    assertIncludes(findings.join('\n'), 'must import report client APIs from @/lib/api', 'external direct report-api imports should fail');
  });

  return 'baseline, facade drift, file ownership, cycle, and external direct import fixtures passed.';
}
