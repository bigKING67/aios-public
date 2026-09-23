import {
  auditFrontendQualityDocs,
  formatFrontendQualityDocsFailure,
  summarizeFrontendQualityDocs,
} from './frontend-quality-docs-drift-core.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Frontend quality docs drift behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const REQUIRED_SCRIPT_NAMES = [
  'build',
  'start',
  'verify:frontend:preflight',
  'verify:frontend:smoke-behavior',
  'verify:frontend:coverage-ratchet-behavior',
  'verify:frontend:coverage-ratchet',
  'verify:frontend:build-fingerprint-behavior',
  'verify:frontend:bundle-budget',
  'verify:frontend:prod-css-integrity-behavior',
  'verify:frontend:prod-css-integrity',
  'verify:frontend:preview-contract-behavior',
  'verify:frontend:preview-contract',
  'verify:frontend:quality-docs-drift-behavior',
  'verify:frontend:quality-docs-drift',
  'verify:frontend:design-evolution-behavior',
  'verify:frontend:design-evolution',
  'test:frontend:smoke:public',
  'test:frontend:smoke:anonymous-auth',
  'test:frontend:smoke:authenticated',
  'test:frontend:smoke:preview',
  'test:frontend:smoke:preview:performance',
  'test:frontend:smoke:preview:anonymous-auth',
  'test:frontend:smoke:preview:authenticated',
  'test:frontend:smoke:preview:authenticated:performance',
  'test:frontend:smoke',
  'test:frontend:coverage',
];

const smokeConfig = {
  version: 1,
  description: 'Fixture route-aware smoke config.',
  routes: [
    {
      path: '/',
      description: 'Home fixture.',
      minBodyTextLength: 120,
      expectedText: ['Home'],
    },
    {
      path: '/login',
      description: 'Login fixture.',
      minBodyTextLength: 20,
      expectedText: ['Login'],
    },
    {
      path: '/dashboard',
      description: 'Dashboard fixture.',
      minBodyTextLength: 80,
      expectedText: ['Dashboard'],
    },
    {
      path: '/dashboard?tab=douyin&dimension=live',
      description: 'Dashboard live fixture.',
      authState: 'authenticated',
      enabledByDefault: false,
      minBodyTextLength: 80,
      expectedText: ['Dashboard'],
      expectedCssVariables: [
        '--dashboard-inverse-text',
      ],
      expectedFinalPath: '/dashboard',
      expectedFinalSearchIncludes: ['dimension=live'],
      authenticatedProfile: {
        authState: 'authenticated',
        minBodyTextLength: 80,
        expectedText: ['Dashboard'],
        expectedCssVariables: [
          '--dashboard-inverse-text',
        ],
        expectedFinalPath: '/dashboard',
        expectedFinalSearchIncludes: ['dimension=live'],
      },
    },
    {
      path: '/docs',
      description: 'Docs fixture.',
      minBodyTextLength: 120,
      expectedText: ['Docs'],
    },
    {
      path: '/reports/weekly',
      description: 'Weekly fixture protected route.',
      authState: 'anonymous-redirect',
      enabledByDefault: false,
      minBodyTextLength: 20,
      authenticatedProfile: {
        authState: 'authenticated',
        minBodyTextLength: 80,
        expectedText: ['Weekly protected fixture'],
        expectedFinalPath: '/reports/weekly',
      },
      expectedText: ['Login'],
      expectedFinalPath: '/login',
      expectedFinalSearchIncludes: ['redirect=%2Freports%2Fweekly'],
    },
    {
      path: '/ops/dataops',
      description: 'DataOps fixture protected route.',
      authState: 'anonymous-redirect',
      enabledByDefault: false,
      minBodyTextLength: 20,
      expectedText: ['Login'],
      expectedFinalPath: '/login',
      expectedFinalSearchIncludes: ['redirect=%2Fops%2Fdataops'],
    },
  ],
};

const budgetConfig = {
  version: 1,
  description: 'Fixture bundle budgets.',
  reason: 'Fixture budget values for quality-docs drift behavior coverage.',
  targetRatio: 0.9,
  budgets: {
    maxJsChunkGzipBytes: {
      bytes: 1000,
      description: 'Largest JS fixture chunk after gzip.',
      reason: 'Fixture JS reason.',
    },
    maxCssAssetGzipBytes: {
      bytes: 200,
      description: 'Largest CSS fixture asset after gzip.',
      reason: 'Fixture CSS reason.',
    },
    totalJsGzipBytes: {
      bytes: 2000,
      description: 'Total fixture JS gzip bytes.',
      reason: 'Fixture total JS reason.',
    },
  },
};

const coverageConfig = {
  version: 1,
  description: 'Fixture frontend coverage ratchets.',
  critical: {
    thresholds: {
      statements: 85,
      lines: 85,
      functions: 85,
      branches: 80,
    },
    files: [
      'apps/web-vite/src/lib/request.ts',
    ],
  },
  legacy: [
    {
      id: 'docs-loaders',
      description: 'Fixture legacy docs coverage.',
      thresholds: {
        statements: 78,
        lines: 77.08,
        functions: 89.28,
        branches: 66.66,
      },
      files: [
        'apps/web-vite/src/app/docs/docs-workspace-loader.ts',
      ],
    },
  ],
};

function packageJson(scriptNames = REQUIRED_SCRIPT_NAMES) {
  const scripts = Object.fromEntries(scriptNames.map((scriptName) => [
    scriptName,
    scriptName === 'build'
      ? 'vite build --config apps/web-vite/vite.config.ts'
      : `fixture command for ${scriptName}`,
  ]));
  return { name: 'frontend-quality-docs-fixture', private: true, scripts };
}

function routeList(routes) {
  return routes.map((route) => `- \`${route.path}\` - ${route.description}`).join('\n');
}

function budgetTable(budgets, targetRatio) {
  return Object.entries(budgets)
    .map(([key, entry]) => (
      `| \`${key}\` | ${entry.bytes} | ${Math.ceil(entry.bytes * targetRatio) - 1} | ${entry.description} |`
    ))
    .join('\n');
}

function qualityDocsSource(options = {}) {
  const {
    budgets = budgetConfig.budgets,
    routes = smokeConfig.routes,
    targetRatio = budgetConfig.targetRatio,
  } = options;
  const defaultRoutes = routes.filter((route) => route.enabledByDefault !== false);
  const anonymousRoutes = routes.filter((route) => route.enabledByDefault === false && !route.authenticatedProfile);
  const authenticatedPreviewRoutes = routes.filter((route) => route.enabledByDefault === false && route.authenticatedProfile);

  return [
    '# AIOS Frontend Quality System',
    '',
    '## Static gates',
    '',
    '```bash',
    'npm run verify:frontend:preflight',
    'npm run verify:frontend:smoke-behavior',
    'npm run verify:frontend:build-fingerprint-behavior',
    'npm run verify:frontend:coverage-ratchet-behavior',
    'npm run verify:frontend:coverage-ratchet',
    'npm run verify:frontend:prod-css-integrity-behavior',
    'npm run verify:frontend:prod-css-integrity',
    'npm run verify:frontend:preview-contract-behavior',
    'npm run verify:frontend:preview-contract',
    'npm run verify:frontend:quality-docs-drift-behavior',
    'npm run verify:frontend:quality-docs-drift',
    'npm run verify:frontend:design-evolution-behavior',
    'npm run verify:frontend:design-evolution',
    '```',
    '',
    '## Build and type gates',
    '',
    '```bash',
    'npm run build',
    'npm run start',
    'npm run test:frontend:coverage',
    '```',
    '',
    'Execution coverage uses `scripts/config/frontend/coverage-ratchet.json` and fixed `85 / 85 / 85 / 80` critical floors.',
    'Legacy ratchets are domain-scoped.',
    ...coverageConfig.critical.files.map((file) => `- \`${file}\``),
    ...coverageConfig.legacy.flatMap((group) => [
      `- \`${group.id}\``,
      ...Object.values(group.thresholds).map((value) => `- ${value}`),
    ]),
    '',
    '## Bundle budget',
    '',
    '```bash',
    'npm run build',
    'npm run verify:frontend:bundle-budget',
    'npm run verify:frontend:prod-css-integrity',
    'npm run verify:frontend:preview-contract',
    '```',
    '',
    '`build` immediately before `verify:frontend:bundle-budget` is required in verify:ci.',
    '`verify:frontend:prod-css-integrity` immediately after `verify:frontend:bundle-budget` is required in verify:ci.',
    '`verify:frontend:preview-contract` immediately after `verify:frontend:prod-css-integrity` is required in verify:ci.',
    'The bundle budget command is `npm run verify:frontend:bundle-budget`, and it must run after `npm run build`.',
    '`apps/web-vite/dist/aios-build-manifest.json` stores a `sourceFingerprint` so standalone bundle-budget checks fail on stale dist.',
    'The bundle budget reads `apps/web-vite/dist` and `scripts/config/frontend/bundle-budget.json`.',
    `The strict acceptance setting is \`targetRatio = ${targetRatio}\`: every metric must remain strictly below ${targetRatio * 100}% of its hard ceiling.`,
    'Gate output reports actual bytes, hard limit, strict target, headroom percentage, and asset detail.',
    'The fingerprint intentionally uses a conservative source/config/env input set.',
    'Production CSS integrity reads `apps/web-vite/dist/assets` after `npm run build`, blocks side-effect CSS Module imports, and checks critical runtime CSS tokens such as `--dashboard-inverse-text`.',
    'Production preview contract reads `apps/web-vite/dist/index.html`, `apps/web-vite/dist/aios-build-manifest.json`, referenced local assets, and emitted CSS tokens without launching a browser.',
    '',
    'Design-evolution gate: `verify:frontend:design-evolution` blocks new route/page-level design language unless the same change set updates `DESIGN.md`.',
    'The paired `verify:frontend:design-evolution-behavior` fixture keeps the design-evolution trigger semantics covered.',
    '',
    '| Budget key | Hard ceiling bytes | Strict target bytes | Description |',
    '|---|---:|---:|---|',
    budgetTable(budgets, targetRatio),
    '',
    '## Runtime smoke',
    '',
    '```bash',
    'npm run test:frontend:smoke:public',
    'npm run test:frontend:smoke:anonymous-auth',
    'npm run test:frontend:smoke:authenticated',
    'npm run test:frontend:smoke:preview',
    'npm run test:frontend:smoke:preview:performance',
    'npm run test:frontend:smoke:preview:anonymous-auth',
    'npm run test:frontend:smoke:preview:authenticated',
    'npm run test:frontend:smoke:preview:authenticated:performance',
    'npm run test:frontend:smoke',
    '```',
    '',
    'Runtime smoke is intentionally not wired into `verify:ci` because it needs a running service and a browser runtime.',
    '`verify:frontend:smoke-behavior` is wired into `verify:ci` to keep route assertions covered.',
    'Runtime route expectations live in `scripts/config/frontend/smoke-routes.json`.',
    'Routes can declare `expectedCssVariables` so production preview catches missing root CSS variables.',
    'Routes can declare `performanceBudget`; it is enforced only with `FRONTEND_SMOKE_PERFORMANCE_BUDGET=1`, `npm run test:frontend:smoke:preview:performance`, or `npm run test:frontend:smoke:preview:authenticated:performance`.',
    '',
    'Default route-aware smoke routes:',
    '',
    routeList(defaultRoutes),
    '',
    'Optional protected anonymous redirect routes (`enabledByDefault: false`):',
    '',
    routeList(anonymousRoutes),
    '',
    'Optional authenticated preview routes (`enabledByDefault: false` + `authenticatedProfile`):',
    '',
    routeList(authenticatedPreviewRoutes),
    '',
    'Optional protected route checks need `/v1/auth/session/me` to be reachable.',
    '',
    'Useful overrides:',
    '',
    '```bash',
    'FRONTEND_SMOKE_BASE_URL=http://localhost:3000 npm run test:frontend:smoke',
    'FRONTEND_SMOKE_ROUTES=/,/login npm run test:frontend:smoke',
    'FRONTEND_SMOKE_TIMEOUT_MS=20000 npm run test:frontend:smoke',
    'FRONTEND_SMOKE_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run test:frontend:smoke',
    'FRONTEND_SMOKE_ALLOW_CONSOLE_ERRORS=1 npm run test:frontend:smoke',
    'FRONTEND_SMOKE_PERFORMANCE_BUDGET=1 npm run test:frontend:smoke',
    'FRONTEND_SMOKE_AUTH_PROFILE=1 npm run test:frontend:smoke',
    'FRONTEND_SMOKE_COOKIE_HEADER="aios_access_token=...; aios_refresh_token=..." npm run test:frontend:smoke:authenticated',
    'FRONTEND_SMOKE_AUTH_COOKIE remains a deprecated compatibility alias.',
    'FRONTEND_SMOKE_INCLUDE_OPTIONAL=1 npm run test:frontend:smoke',
    '```',
    '',
    'Authenticated smoke validates `/v1/auth/session/me` before route checks.',
    'The default cookie names are `aios_access_token` and `aios_refresh_token`.',
    'Use `AIOS_ACCESS_COOKIE_NAME` and `AIOS_REFRESH_COOKIE_NAME` overrides when configured.',
    'Authenticated route expectations must not reuse anonymous redirect assertions.',
    'Routes that support authenticated smoke declare an `authenticatedProfile` in `scripts/config/frontend/smoke-routes.json`.',
    '',
  ].join('\n');
}

function readmeSource() {
  return [
    '# Fixture README',
    '',
    'Current GitHub workflows can be `disabled_manually`.',
    'Default protection is 本地 `.githooks/pre-push` + `npm run verify:prepush`.',
    'AIOS Quality Runner supports npm run verify:affected.',
    'Authenticated smoke uses FRONTEND_SMOKE_COOKIE_HEADER with aios_access_token.',
    '',
  ].join('\n');
}

function runQualityDocsDrift(options = {}) {
  const {
    bundleBudgetConfig = budgetConfig,
    coverageRatchetConfig = coverageConfig,
    docs = qualityDocsSource(),
    packageScripts = REQUIRED_SCRIPT_NAMES,
    verifyCiPostShellGates = [],
    verifyCiRunGates = [
      { name: 'build' },
      { name: 'verify:frontend:bundle-budget' },
      { name: 'verify:frontend:prod-css-integrity' },
      { name: 'verify:frontend:preview-contract' },
      { name: 'verify:frontend:smoke-behavior' },
      { name: 'verify:frontend:coverage-ratchet-behavior' },
      { name: 'verify:frontend:coverage-ratchet' },
      { name: 'verify:frontend:design-evolution' },
    ],
  } = options;

  const findings = auditFrontendQualityDocs({
    budgetConfig: bundleBudgetConfig,
    coverageConfig: coverageRatchetConfig,
    documentSource: docs,
    packageJson: packageJson(packageScripts),
    readmeSource: readmeSource(),
    smokeConfig,
    verifyCiPostShellGates,
    verifyCiRunGates,
  });

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[frontend-quality-docs-drift] OK: ${summarizeFrontendQualityDocs({ budgetConfig: bundleBudgetConfig, coverageConfig: coverageRatchetConfig, smokeConfig })}\n`,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatFrontendQualityDocsFailure(findings)}\n`,
  };
}

function withFixture(options, assertion) {
  assertion(runQualityDocsDrift(options));
}

export function runFrontendQualityDocsDriftBehaviorFixtures(assertions) {
  useAssertions(assertions);

  withFixture({}, (result) => {
    assertEqual(result.status, 0, 'complete quality docs fixture should pass');
    assertIncludes(result.stdout, 'bundle budgets', 'passing output should summarize bundle budget docs');
  });

  withFixture(
    {
      docs: qualityDocsSource().replace('- `/docs` - Docs fixture.\n', ''),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing default route documentation should fail');
      assertIncludes(result.stderr, 'must list default smoke route /docs', 'missing default route should be reported');
    },
  );

  withFixture(
    {
      docs: qualityDocsSource().replace(
        'Optional authenticated preview routes (`enabledByDefault: false` + `authenticatedProfile`):\n\n- `/dashboard?tab=douyin&dimension=live` - Dashboard live fixture.',
        '',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing authenticated preview route documentation should fail');
      assertIncludes(
        result.stderr,
        'must list optional authenticated preview smoke route /dashboard?tab=douyin&dimension=live',
        'authenticated-only route should be required in its own docs section',
      );
    },
  );

  withFixture(
    {
      docs: qualityDocsSource().replace(
        'Default route-aware smoke routes:\n\n- `/` - Home fixture.',
        'Default route-aware smoke routes:\n\n- `/dashboard?tab=douyin&dimension=live` - Dashboard live fixture.\n- `/` - Home fixture.',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'authenticated route listed under default docs should fail');
      assertIncludes(
        result.stderr,
        'must not list authenticated-only smoke route /dashboard?tab=douyin&dimension=live under default route-aware smoke routes',
        'authenticated-only route should not be documented as a default route',
      );
    },
  );

  withFixture(
    {
      docs: qualityDocsSource().replaceAll('`enabledByDefault: false`', '`optional`'),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing optional enabledByDefault docs should fail');
      assertIncludes(result.stderr, 'enabledByDefault: false', 'optional route config wording should be required');
    },
  );

  withFixture(
    {
      docs: qualityDocsSource().replace('`scripts/config/frontend/bundle-budget.json`', '`scripts/budget.json`'),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing bundle budget path documentation should fail');
      assertIncludes(result.stderr, 'scripts/config/frontend/bundle-budget.json', 'bundle budget path should be required');
    },
  );

  withFixture(
    {
      docs: qualityDocsSource().replace('`docs-loaders`', '`legacy-docs`'),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing coverage ratchet group documentation should fail');
      assertIncludes(result.stderr, 'docs-loaders', 'coverage ratchet group drift should be reported');
    },
  );

  withFixture(
    {
      bundleBudgetConfig: {
        ...budgetConfig,
        targetRatio: undefined,
      },
    },
    (result) => {
      assertEqual(result.status, 1, 'missing targetRatio should fail quality-docs drift');
      assertIncludes(result.stderr, 'targetRatio must be greater than 0', 'missing targetRatio should report the executable config contract');
    },
  );

  withFixture(
    {
      docs: qualityDocsSource().replace('targetRatio = 0.9', 'target ratio is configured elsewhere'),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing targetRatio documentation should fail');
      assertIncludes(result.stderr, 'targetRatio = 0.9', 'targetRatio documentation drift should be reported');
    },
  );

  withFixture(
    {
      docs: qualityDocsSource().replace('| `maxJsChunkGzipBytes` | 1000 | 899 |', '| `maxJsChunkGzipBytes` | 1000 | 900 |'),
    },
    (result) => {
      assertEqual(result.status, 1, 'strict target byte drift should fail');
      assertIncludes(result.stderr, 'strict bundle target byte ceiling', 'strict target byte drift should be reported');
    },
  );

  withFixture(
    {
      packageScripts: REQUIRED_SCRIPT_NAMES.filter((scriptName) => scriptName !== 'verify:frontend:quality-docs-drift'),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing package quality-docs script should fail');
      assertIncludes(
        result.stderr,
        'package.json is missing required script verify:frontend:quality-docs-drift',
        'missing package script should be reported',
      );
    },
  );

  withFixture(
    {
      docs: qualityDocsSource().replace(
        'Runtime smoke is intentionally not wired into `verify:ci`',
        'Runtime smoke follows CI automatically',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'stale verify:ci runtime smoke wording should fail');
      assertIncludes(
        result.stderr,
        'Runtime smoke is intentionally not wired into `verify:ci`',
        'runtime smoke verify:ci boundary should be required',
      );
    },
  );

  return 'pass, missing route, optional route, coverage ratchet, bundle-budget ratio/strict target, package script, and verify:ci wording drift checks passed.';
}
