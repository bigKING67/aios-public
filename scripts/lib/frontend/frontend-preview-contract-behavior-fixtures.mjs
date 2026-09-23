import {
  auditFrontendPreviewContract,
  checkFrontendPreviewContract,
} from './frontend-preview-contract-core.mjs';
import {
  computeFrontendBuildFingerprint,
} from './frontend-build-fingerprint.mjs';
import {
  REQUIRED_PRODUCTION_CSS_TOKENS,
} from './frontend-prod-css-integrity-core.mjs';
import {
  withFixtureWorkspace,
} from '../shared/gate-fixture-utils.mjs';

const FIXTURE_ENV = Object.freeze({
  NODE_ENV: 'production',
  VITE_API_URL: '/api',
});

function criticalTokenCss() {
  return REQUIRED_PRODUCTION_CSS_TOKENS
    .map((token) => `${token}: var(--fixture);`)
    .join('\n');
}

function indexHtml(options = {}) {
  const {
    cssAsset = '/assets/index-fixture.css',
    includeRoot = true,
    jsAsset = '/assets/index-fixture.js',
  } = options;
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <script type="module" crossorigin src="' + jsAsset + '"></script>',
    '    <link rel="stylesheet" crossorigin href="' + cssAsset + '">',
    '  </head>',
    '  <body>',
    includeRoot ? '    <div id="root"></div>' : '    <main id="root"></main>',
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function writeCurrentManifest(fixture, overrides = {}) {
  const current = computeFrontendBuildFingerprint(fixture.repoRoot, {
    env: FIXTURE_ENV,
  });
  fixture.write({
    'apps/web-vite/dist/aios-build-manifest.json': `${JSON.stringify({
      version: 1,
      generatedAt: '2026-05-22T00:00:00.000Z',
      sourceFingerprint: current.fingerprint,
      envKeys: current.envKeys,
      files: current.files,
      ...overrides,
    }, null, 2)}\n`,
  });
}

function withPreviewFixture(files, callback) {
  return withFixtureWorkspace({
    git: false,
    prefix: 'aios-preview-contract-',
    files: {
      'apps/web-vite/index.html': '<div id="root"></div>\n',
      'apps/web-vite/src/main.tsx': 'export const app = true;\n',
      'apps/web-vite/tsconfig.json': '{}\n',
      'apps/web-vite/vite.config.ts': 'export default {};\n',
      'package-lock.json': '{}\n',
      'postcss.config.js': 'export default {};\n',
      'tailwind.config.ts': 'export default {};\n',
      'tsconfig.json': '{}\n',
      'apps/web-vite/dist/index.html': indexHtml(),
      'apps/web-vite/dist/assets/index-fixture.css': `:root {\n${criticalTokenCss()}\n}\n`,
      'apps/web-vite/dist/assets/index-fixture.js': 'console.log("fixture");\n',
      ...files,
    },
  }, (fixture) => {
    writeCurrentManifest(fixture);
    return callback(fixture);
  });
}

export function runFrontendPreviewContractBehaviorFixtures(assertions) {
  const {
    assertDeepEqual,
    assertEqual,
    assertIncludes,
    assertTrue,
  } = assertions;

  withPreviewFixture({}, (fixture) => {
    const result = checkFrontendPreviewContract(fixture.repoRoot, { env: FIXTURE_ENV });
    assertEqual(result.status, 0, 'complete preview dist contract should pass');
    assertIncludes(result.stdout, 'HTML asset refs exist', 'passing output should summarize asset refs');

    const auditResult = auditFrontendPreviewContract(fixture.repoRoot, { env: FIXTURE_ENV });
    assertDeepEqual(
      auditResult.assetRefs,
      ['assets/index-fixture.css', 'assets/index-fixture.js'],
      'HTML local asset refs should be normalized and sorted',
    );
    assertEqual(auditResult.missingProductionTokens.length, 0, 'critical CSS tokens should be present');
  });

  withPreviewFixture({
    'apps/web-vite/dist/index.html': indexHtml({ cssAsset: '/assets/missing.css' }),
  }, (fixture) => {
    const result = checkFrontendPreviewContract(fixture.repoRoot, { env: FIXTURE_ENV });
    assertEqual(result.status, 1, 'missing referenced stylesheet should fail');
    assertIncludes(
      result.stderr,
      'references missing dist asset: /assets/missing.css',
      'missing referenced dist asset should be reported',
    );
  });

  withPreviewFixture({
    'apps/web-vite/dist/index.html': indexHtml({ includeRoot: false }),
  }, (fixture) => {
    const result = checkFrontendPreviewContract(fixture.repoRoot, { env: FIXTURE_ENV });
    assertEqual(result.status, 1, 'missing React root mount should fail');
    assertIncludes(
      result.stderr,
      'must include the React root mount',
      'root mount drift should be reported',
    );
  });

  withPreviewFixture({
    'apps/web-vite/dist/assets/index-fixture.css': ':root { --dashboard-inverse-text-missing: red; }\n',
  }, (fixture) => {
    const result = checkFrontendPreviewContract(fixture.repoRoot, { env: FIXTURE_ENV });
    assertEqual(result.status, 1, 'missing critical CSS token definitions should fail');
    assertIncludes(
      result.stderr,
      'is missing required production CSS token --dashboard-inverse-text',
      'critical production token drift should be reported',
    );
  });

  withPreviewFixture({}, (fixture) => {
    writeCurrentManifest(fixture, {
      sourceFingerprint: '0'.repeat(64),
    });
    const result = checkFrontendPreviewContract(fixture.repoRoot, { env: FIXTURE_ENV });
    assertEqual(result.status, 1, 'stale build manifest fingerprint should fail');
    assertIncludes(
      result.stderr,
      'sourceFingerprint does not match the current frontend source/config/env fingerprint',
      'stale dist fingerprint should be reported',
    );
  });

  withPreviewFixture({}, (fixture) => {
    writeCurrentManifest(fixture, {
      generatedAt: 'not-a-date',
    });
    const result = checkFrontendPreviewContract(fixture.repoRoot, { env: FIXTURE_ENV });
    assertEqual(result.status, 1, 'unparseable generatedAt should fail');
    assertIncludes(
      result.stderr,
      'must include a parseable generatedAt timestamp',
      'manifest timestamp drift should be reported',
    );
  });

  assertTrue(true, 'preview contract fixture assertions completed');
  return 'preview dist contract pass, missing asset, missing root, missing CSS token, stale manifest, and timestamp drift checks passed.';
}
