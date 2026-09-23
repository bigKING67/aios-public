import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const API_FACADE_FILE = 'apps/web-vite/src/lib/api.ts';
export const REPORT_API_DIR = 'apps/web-vite/src/lib/report-api';
export const EXPECTED_SUPPORT_FILES = Object.freeze([
  'report-api-contract.test.ts',
]);

export const EXPECTED_MODULES = Object.freeze({
  'report-query.ts': [
    'normalizeQueryValue',
    'normalizeWeekPeriodValue',
    'looksLikeWeekPeriod',
    'normalizeSummaryScopeValue',
    'resolveWeeklySummaryQuery',
  ],
  'request-policy.ts': [
    'CACHE_CONFIG',
    'getBackendCacheControl',
    'getRequestTransportError',
    'getRequestErrorCode',
    'createApiClientError',
    'mergeRequestConfig',
  ],
  'weekly.ts': [
    'getWeeklyReport',
    'getLatestWeeklyPeriod',
    'getAllWeeklyPeriods',
    'getWeeklyMetadata',
    'listReports',
  ],
  'monthly.ts': [
    'getMonthlyReport',
    'getLatestMonthlyPeriod',
    'getAllMonthlyPeriods',
    'getMonthlyMetadata',
  ],
  'summary.ts': [
    'WeeklySummaryConclusionsInput',
    'generateSummary',
    'getSummaryStatus',
    'getSummary',
    'updateSummary',
  ],
});

export const EXPECTED_REPORT_API_KEYS = Object.freeze([
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
]);

function readRepoFile(repoRoot, filePath) {
  return readFileSync(path.join(repoRoot, filePath), 'utf8');
}

function normalizeRepoPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function listSourceFiles(repoRoot, relativeDir) {
  const root = path.join(repoRoot, relativeDir);
  const files = [];

  function visit(dir) {
    for (const entry of readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (/\.(?:ts|tsx)$/u.test(entry)) {
        files.push(normalizeRepoPath(path.relative(repoRoot, fullPath)));
      }
    }
  }

  if (existsSync(root)) {
    visit(root);
  }

  return files.sort();
}

function parseReportApiObjectKeys(source) {
  const match = /export\s+const\s+reportApi\s*=\s*\{([\s\S]*?)\};/u.exec(source);
  if (!match) {
    return [];
  }

  return Array.from(match[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*,?\s*$/gmu), (item) => item[1]);
}

function hasNamedImport(source, modulePath, exportName) {
  const importPattern = new RegExp(
    `import\\s*\\{[\\s\\S]*?\\b${exportName}\\b[\\s\\S]*?\\}\\s*from\\s*['"]${modulePath.replaceAll('/', '\\/')}['"]`,
    'u',
  );
  return importPattern.test(source);
}

function hasNamedExport(source, exportName) {
  const escapedName = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+${escapedName}\\b`, 'u').test(source)
    || new RegExp(`\\bexport\\s+const\\s+${escapedName}\\b`, 'u').test(source)
    || new RegExp(`\\bexport\\s+interface\\s+${escapedName}\\b`, 'u').test(source);
}

function importTargetsReportApi(source) {
  return /(?:from\s*|import\s*\()\s*['"][^'"]*report-api(?:\/[^'"]*)?['"]/u.test(source);
}

function isReportApiInternalFile(filePath) {
  return filePath === API_FACADE_FILE || filePath.startsWith(`${REPORT_API_DIR}/`);
}

export function auditReportApiContract(repoRoot) {
  const findings = [];
  const apiPath = path.join(repoRoot, API_FACADE_FILE);
  const reportApiPath = path.join(repoRoot, REPORT_API_DIR);

  if (!existsSync(apiPath)) {
    return [`${API_FACADE_FILE} is missing`];
  }
  if (!existsSync(reportApiPath)) {
    return [`${REPORT_API_DIR}/ is missing`];
  }

  const apiSource = readRepoFile(repoRoot, API_FACADE_FILE);
  const expectedModuleNames = Object.keys(EXPECTED_MODULES).sort();
  const expectedFileNames = [...expectedModuleNames, ...EXPECTED_SUPPORT_FILES].sort();
  const actualModuleNames = readdirSync(reportApiPath)
    .filter((entry) => entry.endsWith('.ts'))
    .sort();

  if (actualModuleNames.join(',') !== expectedFileNames.join(',')) {
    findings.push(
      `${REPORT_API_DIR}/ files must be ${expectedFileNames.join(', ')}; got ${actualModuleNames.join(', ')}`,
    );
  }

  const reportApiKeys = parseReportApiObjectKeys(apiSource);
  if (reportApiKeys.join(',') !== EXPECTED_REPORT_API_KEYS.join(',')) {
    findings.push(
      `${API_FACADE_FILE} reportApi keys drifted; expected ${EXPECTED_REPORT_API_KEYS.join(', ')}, got ${reportApiKeys.join(', ')}`,
    );
  }

  for (const moduleName of expectedModuleNames) {
    const modulePath = `${REPORT_API_DIR}/${moduleName}`;
    if (!existsSync(path.join(repoRoot, modulePath))) {
      findings.push(`${modulePath} is missing`);
      continue;
    }

    const source = readRepoFile(repoRoot, modulePath);
    const importPath = `./report-api/${moduleName.replace(/\.ts$/u, '')}`;
    for (const exportName of EXPECTED_MODULES[moduleName]) {
      if (!hasNamedExport(source, exportName)) {
        findings.push(`${modulePath} must export ${exportName}`);
      }
      if (
        EXPECTED_REPORT_API_KEYS.includes(exportName)
        && !hasNamedImport(apiSource, importPath, exportName)
      ) {
        findings.push(`${API_FACADE_FILE} must import ${exportName} from ${importPath}`);
      }
    }

    if (/(?:from\s*|import\s*\()\s*['"](?:\.\.\/api|@\/lib\/api)['"]/u.test(source)) {
      findings.push(`${modulePath} must not import the public API facade; keep report-api modules acyclic`);
    }
  }

  if (!hasNamedImport(apiSource, './report-api/request-policy', 'CACHE_CONFIG')) {
    findings.push(`${API_FACADE_FILE} must import CACHE_CONFIG from ./report-api/request-policy`);
  }
  if (!apiSource.includes('export { CACHE_CONFIG };')) {
    findings.push(`${API_FACADE_FILE} must re-export CACHE_CONFIG`);
  }
  if (!hasNamedImport(apiSource, './report-api/summary', 'WeeklySummaryConclusionsInput')) {
    findings.push(`${API_FACADE_FILE} must import WeeklySummaryConclusionsInput from ./report-api/summary`);
  }
  if (!apiSource.includes('export type { WeeklySummaryConclusionsInput };')) {
    findings.push(`${API_FACADE_FILE} must re-export WeeklySummaryConclusionsInput`);
  }
  if (!apiSource.includes('export default reportApi;')) {
    findings.push(`${API_FACADE_FILE} must keep reportApi as the default export`);
  }

  for (const filePath of listSourceFiles(repoRoot, 'apps/web-vite/src')) {
    if (isReportApiInternalFile(filePath)) {
      continue;
    }
    const source = readRepoFile(repoRoot, filePath);
    if (importTargetsReportApi(source)) {
      findings.push(`${filePath} must import report client APIs from @/lib/api instead of ${REPORT_API_DIR}/`);
    }
  }

  return findings;
}
