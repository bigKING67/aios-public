import path from 'node:path';
import { gzipSync } from 'node:zlib';

import {
  FRONTEND_BUILD_MANIFEST_PATH,
  computeFrontendBuildFingerprint,
} from './frontend-build-fingerprint.mjs';
import { checkFrontendBundleBudget } from './frontend-bundle-budget-core.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('frontend bundle budget behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const BUDGET_PATH = 'scripts/config/frontend/bundle-budget.json';
const DIST_ASSETS_PATH = 'apps/web-vite/dist/assets';
const FIXTURE_REPO_ROOT = '/fixture';

function gzipSize(text) {
  return gzipSync(Buffer.from(text), { level: 9 }).length;
}

const TARGET_RATIO = 0.9;

function strictTargetBytes(hardLimit, targetRatio = TARGET_RATIO) {
  return Math.ceil(hardLimit * targetRatio) - 1;
}

function hardLimitWithExactStrictTarget(strictTarget, targetRatio = TARGET_RATIO) {
  return Math.floor(strictTarget / targetRatio) + 1;
}

function budgetJson(budgets, options = {}) {
  const {
    targetRatio = TARGET_RATIO,
    writeTargetRatio = true,
  } = options;
  const metricBudgets = Object.fromEntries(
    Object.entries(budgets).map(([key, bytes]) => [
      key,
      {
        bytes,
        description: `fixture ${key}`,
        reason: `fixture reason for ${key}`,
      },
    ]),
  );

  const budget = {
    version: 1,
    description: 'Fixture frontend bundle budget.',
    reason: 'Fixture budget for behavior coverage.',
    budgets: metricBudgets,
  };
  if (writeTargetRatio) {
    budget.targetRatio = targetRatio;
  }

  return JSON.stringify(
    budget,
    null,
    2,
  );
}

function fixtureSources() {
  return {
    'app-fixture.js': 'export const app = "x".repeat(120);\nconsole.log(app);\n',
    'page-fixture.css': '.fixture { color: #123456; padding: 12px; margin: 8px; }\n',
    'vendor-echarts-fixture.js': 'export const chart = "echarts".repeat(80);\nconsole.log(chart);\n',
  };
}

function fixtureMetrics(sources = fixtureSources()) {
  const jsEntries = Object.entries(sources).filter(([name]) => name.endsWith('.js'));
  const cssEntries = Object.entries(sources).filter(([name]) => name.endsWith('.css'));
  const vendorEntries = jsEntries.filter(([name]) => name.startsWith('vendor-echarts-'));
  const jsSizes = jsEntries.map(([, source]) => gzipSize(source));
  const cssSizes = cssEntries.map(([, source]) => gzipSize(source));

  return {
    maxCssAssetGzipBytes: Math.max(...cssSizes),
    maxJsChunkGzipBytes: Math.max(...jsSizes),
    totalCssGzipBytes: cssSizes.reduce((total, size) => total + size, 0),
    totalJsGzipBytes: jsSizes.reduce((total, size) => total + size, 0),
    vendorEchartsGzipBytes: vendorEntries.reduce((total, [, source]) => total + gzipSize(source), 0),
  };
}

function passingBudgets(sources = fixtureSources()) {
  return Object.fromEntries(
    Object.entries(fixtureMetrics(sources)).map(([key, actualBytes]) => [
      key,
      hardLimitWithExactStrictTarget(actualBytes),
    ]),
  );
}

function toRepoPath(absPath) {
  const normalizedPath = absPath.split('\\').join('/');
  return normalizedPath.startsWith(`${FIXTURE_REPO_ROOT}/`)
    ? normalizedPath.slice(FIXTURE_REPO_ROOT.length + 1)
    : normalizedPath;
}

function createDirEntry(name, type) {
  return {
    name,
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
  };
}

function createMemoryIo(files) {
  function hasFile(repoPath) {
    return Object.prototype.hasOwnProperty.call(files, repoPath);
  }

  function hasDirectory(repoPath) {
    const prefix = repoPath ? `${repoPath}/` : '';
    return Object.keys(files).some((filePath) => filePath.startsWith(prefix) && filePath !== repoPath);
  }

  return {
    exists: (absPath) => {
      const repoPath = toRepoPath(absPath);
      return hasFile(repoPath) || hasDirectory(repoPath);
    },
    isDirectory: (absPath) => hasDirectory(toRepoPath(absPath)),
    isFile: (absPath) => hasFile(toRepoPath(absPath)),
    listDir: (absPath) => {
      const repoPath = toRepoPath(absPath);
      const prefix = repoPath ? `${repoPath}/` : '';
      const entries = new Map();
      for (const filePath of Object.keys(files)) {
        if (!filePath.startsWith(prefix)) {
          continue;
        }
        const rest = filePath.slice(prefix.length);
        if (!rest) {
          continue;
        }
        const [name, ...remaining] = rest.split('/');
        entries.set(name, remaining.length > 0 ? 'directory' : 'file');
      }
      return [...entries.entries()].map(([name, type]) => createDirEntry(name, type));
    },
    readFile: (absPath) => Buffer.from(files[toRepoPath(absPath)]),
  };
}

function createFixtureFiles(options = {}) {
  const {
    budgets,
    sources = fixtureSources(),
    targetRatio = TARGET_RATIO,
    writeBudget = true,
    writeDist = true,
    writeManifest = true,
    writeTargetRatio = true,
    mutateManifest,
  } = options;
  const files = {
    'apps/web-vite/index.html': '<div id="root"></div>\n',
    'apps/web-vite/src/main.tsx': 'console.log("fixture");\n',
    'apps/web-vite/vite.config.ts': 'export default {};\n',
    'package-lock.json': '{"lockfileVersion":3}\n',
    'package.json': '{"name":"frontend-bundle-budget-fixture","private":true}\n',
    'apps/web-vite/src/app/page.tsx': 'export const page = 1;\n',
  };

  if (writeBudget) {
    files[BUDGET_PATH] = `${budgetJson(budgets ?? passingBudgets(sources), {
      targetRatio,
      writeTargetRatio,
    })}\n`;
  }

  if (writeDist) {
    for (const [fileName, source] of Object.entries(sources)) {
      files[path.join(DIST_ASSETS_PATH, fileName).split(path.sep).join('/')] = source;
    }
  }

  if (writeManifest) {
    const io = createMemoryIo(files);
    const fingerprint = computeFrontendBuildFingerprint(FIXTURE_REPO_ROOT, io);
    const manifest = {
      version: 1,
      generatedAt: '2026-05-09T00:00:00.000Z',
      sourceFingerprint: fingerprint.fingerprint,
      envKeys: fingerprint.envKeys,
      files: fingerprint.files,
    };
    files[FRONTEND_BUILD_MANIFEST_PATH] = `${JSON.stringify(typeof mutateManifest === 'function' ? mutateManifest(manifest) : manifest, null, 2)}\n`;
  }

  return files;
}

function runBudget(files) {
  return checkFrontendBundleBudget(FIXTURE_REPO_ROOT, createMemoryIo(files));
}

function withFixture(options, assertion) {
  const files = createFixtureFiles(options);
  assertion(runBudget(files), files);
}

export function runFrontendBundleBudgetBehaviorFixtures(assertions) {
  useAssertions(assertions);

  withFixture(
    {
      writeDist: false,
      writeManifest: false,
    },
    (result) => {
      assertEqual(result.status, 1, 'missing dist should fail');
      assertIncludes(result.stderr, 'apps/web-vite/dist not found', 'missing dist should identify the expected build directory');
      assertIncludes(result.stderr, 'npm run build', 'missing dist should tell developers to build first');
    },
  );

  withFixture(
    {
      writeBudget: false,
    },
    (result) => {
      assertEqual(result.status, 1, 'missing budget file should fail');
      assertIncludes(result.stderr, 'scripts/config/frontend/bundle-budget.json not found', 'missing budget file should be reported');
    },
  );

  withFixture(
    {
      writeTargetRatio: false,
    },
    (result) => {
      assertEqual(result.status, 1, 'missing targetRatio should fail');
      assertIncludes(result.stderr, 'targetRatio must be a number', 'missing targetRatio should report the strict target contract');
    },
  );

  withFixture(
    {
      targetRatio: 0.91,
    },
    (result) => {
      assertEqual(result.status, 1, 'targetRatio above the ten-percent-headroom boundary should fail');
      assertIncludes(result.stderr, 'no greater than 0.9', 'invalid targetRatio should report the maximum accepted ratio');
    },
  );

  withFixture(
    {
      writeManifest: false,
    },
    (result) => {
      assertEqual(result.status, 1, 'missing build manifest should fail');
      assertIncludes(
        result.stderr,
        'apps/web-vite/dist/aios-build-manifest.json not found',
        'missing build manifest should identify the expected manifest file',
      );
    },
  );

  withFixture(
    {},
    (result) => {
      assertEqual(result.status, 0, 'baseline fixture with current build manifest should pass');
      assertIncludes(result.stdout, 'current build manifest', 'passing output should mention build manifest freshness');
    },
  );

  withFixture(
    {},
    (result, files) => {
      assertEqual(result.status, 0, 'initial stale-manifest fixture should pass before source mutation');
      files['apps/web-vite/src/app/page.tsx'] = 'export const page = 2;\n';
      const staleResult = runBudget(files);
      assertEqual(staleResult.status, 1, 'source mutation after manifest generation should fail as stale dist');
      assertIncludes(staleResult.stderr, 'apps/web-vite/dist is stale', 'stale dist should be reported explicitly');
      assertIncludes(staleResult.stderr, 'sourceFingerprint', 'stale dist output should mention the fingerprint mismatch');
    },
  );

  withFixture(
    {
      mutateManifest: (manifest) => ({
        ...manifest,
        files: manifest.files.slice(1),
      }),
    },
    (result) => {
      assertEqual(result.status, 1, 'build manifest with mismatched files should fail');
      assertIncludes(
        result.stderr,
        'files list does not match',
        'mismatched manifest files should be reported',
      );
    },
  );

  withFixture(
    {
      mutateManifest: (manifest) => ({
        ...manifest,
        envKeys: manifest.envKeys.filter((envKey) => envKey !== 'VITE_API_GATEWAY_PREFIX'),
      }),
    },
    (result) => {
      assertEqual(result.status, 1, 'build manifest with mismatched envKeys should fail');
      assertIncludes(
        result.stderr,
        'envKeys list does not match',
        'mismatched manifest envKeys should be reported',
      );
    },
  );

  withFixture(
    {
      budgets: passingBudgets(),
    },
    (result) => {
      assertEqual(result.status, 0, 'baseline fixture under budget should pass');
      assertIncludes(result.stdout, 'strict 90% targets passed', 'passing output should summarize strict targets');
      assertIncludes(result.stdout, 'actual', 'passing output should report actual bytes');
      assertIncludes(result.stdout, 'hard limit', 'passing output should report hard ceilings');
      assertIncludes(result.stdout, 'strict 90% target', 'passing output should report strict targets');
      assertIncludes(result.stdout, 'headroom', 'passing output should report headroom percentage');
      assertIncludes(result.stdout, 'detail', 'passing output should report the measured asset or asset count');
    },
  );

  withFixture(
    {
      budgets: passingBudgets(),
    },
    (result) => {
      const actualMaxJs = fixtureMetrics().maxJsChunkGzipBytes;
      const maxJsHardLimit = passingBudgets().maxJsChunkGzipBytes;
      assertEqual(
        strictTargetBytes(maxJsHardLimit),
        actualMaxJs,
        'fixture should place actual max JS exactly on the strict target',
      );
      assertEqual(result.status, 0, 'actual bytes equal to the strict target should pass');
    },
  );

  withFixture(
    {
      budgets: {
        ...passingBudgets(),
        maxJsChunkGzipBytes: hardLimitWithExactStrictTarget(fixtureMetrics().maxJsChunkGzipBytes - 1),
      },
    },
    (result) => {
      const actualMaxJs = fixtureMetrics().maxJsChunkGzipBytes;
      const hardLimit = hardLimitWithExactStrictTarget(actualMaxJs - 1);
      assertEqual(actualMaxJs <= hardLimit, true, 'strict-target failure fixture must remain below the hard limit');
      assertEqual(result.status, 1, 'one byte over the strict target should fail even below the hard limit');
      assertIncludes(result.stderr, 'Strict bundle target exceeded', 'strict-target failure should use the strict failure header');
      assertIncludes(result.stderr, `(${actualMaxJs} B)`, 'strict-target failure should report exact actual bytes');
      assertIncludes(result.stderr, `(${hardLimit} B)`, 'strict-target failure should report the unchanged hard limit');
      assertIncludes(result.stderr, `(${actualMaxJs - 1} B)`, 'strict-target failure should report the exact strict target');
      assertIncludes(result.stderr, 'headroom', 'strict-target failure should report headroom percentage');
      assertIncludes(result.stderr, 'vendor-echarts-fixture.js', 'strict-target failure should report the measured asset');
    },
  );

  withFixture(
    {
      budgets: {
        ...passingBudgets(),
        maxJsChunkGzipBytes: 1,
        totalJsGzipBytes: 1,
        vendorEchartsGzipBytes: 1,
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'over-budget fixture should fail');
      assertIncludes(result.stderr, 'Strict bundle target exceeded', 'over-budget output should include the failure header');
      assertIncludes(result.stderr, 'max JS chunk gzip', 'over-budget output should report max JS chunk gzip');
      assertIncludes(result.stderr, 'total JS gzip', 'over-budget output should report total JS gzip');
      assertIncludes(result.stderr, 'vendor-echarts gzip', 'over-budget output should report vendor-echarts gzip');
    },
  );

  withFixture(
    {
      sources: {
        'app-fixture.js': fixtureSources()['app-fixture.js'],
        'page-fixture.css': fixtureSources()['page-fixture.css'],
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'missing vendor-echarts chunk should fail');
      assertIncludes(result.stderr, 'codeSplitting groups', 'missing vendor output should reference the current Vite chunk architecture');
    },
  );

  return 'missing dist/budget/target/vendor, manifest freshness, strict boundary, output detail, passing baseline, and over-budget behavior checks passed.';
}
