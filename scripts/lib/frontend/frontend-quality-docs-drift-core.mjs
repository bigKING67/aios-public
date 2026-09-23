import {
  VERIFY_CI_POST_SHELL_GATES,
  VERIFY_CI_RUN_GATES,
} from '../ci/verify-ci-gates.mjs';
import {
  FRONTEND_COVERAGE_RATCHET_PATH,
  validateFrontendCoverageRatchetManifest,
} from './frontend-coverage-ratchet-core.mjs';

export { FRONTEND_COVERAGE_RATCHET_PATH } from './frontend-coverage-ratchet-core.mjs';

const GUARD_NAME = 'frontend-quality-docs-drift';

export const FRONTEND_QUALITY_DOC_PATH = 'docs/FRONTEND_QUALITY_SYSTEM.md';
export const FRONTEND_BUNDLE_BUDGET_PATH = 'scripts/config/frontend/bundle-budget.json';
export const FRONTEND_SMOKE_ROUTES_PATH = 'scripts/config/frontend/smoke-routes.json';
export const VITE_DIST_PATH = 'apps/web-vite/dist';
const MAX_BUNDLE_TARGET_RATIO = 0.9;

const REQUIRED_PACKAGE_SCRIPT_NAMES = Object.freeze([
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
]);

const REQUIRED_README_PHRASES = Object.freeze([
  'disabled_manually',
  '本地 `.githooks/pre-push` + `npm run verify:prepush`',
  'AIOS Quality Runner',
  'npm run verify:affected',
  'FRONTEND_SMOKE_COOKIE_HEADER',
  'aios_access_token',
]);

const REQUIRED_DOC_COMMANDS = Object.freeze(
  REQUIRED_PACKAGE_SCRIPT_NAMES.map((scriptName) => `npm run ${scriptName}`),
);

const REQUIRED_SMOKE_ENV_NAMES = Object.freeze([
  'FRONTEND_SMOKE_BASE_URL',
  'FRONTEND_SMOKE_ROUTES',
  'FRONTEND_SMOKE_TIMEOUT_MS',
  'FRONTEND_SMOKE_CHROME_PATH',
  'FRONTEND_SMOKE_ALLOW_CONSOLE_ERRORS',
  'FRONTEND_SMOKE_PERFORMANCE_BUDGET',
  'FRONTEND_SMOKE_AUTH_PROFILE',
  'FRONTEND_SMOKE_AUTH_COOKIE',
  'FRONTEND_SMOKE_COOKIE_HEADER',
  'FRONTEND_SMOKE_INCLUDE_OPTIONAL',
]);

const REQUIRED_DOC_PHRASES = Object.freeze([
  'Runtime smoke is intentionally not wired into `verify:ci`',
  '`verify:frontend:smoke-behavior` is wired into `verify:ci`',
  '`build` immediately before `verify:frontend:bundle-budget`',
  '`verify:frontend:prod-css-integrity` immediately after `verify:frontend:bundle-budget`',
  '`verify:frontend:preview-contract` immediately after `verify:frontend:prod-css-integrity`',
  'Production CSS integrity',
  'Production preview contract',
  'expectedCssVariables',
  '--dashboard-inverse-text',
  'aios-build-manifest.json',
  'sourceFingerprint',
  FRONTEND_SMOKE_ROUTES_PATH,
  FRONTEND_BUNDLE_BUDGET_PATH,
  VITE_DIST_PATH,
  'enabledByDefault: false',
  'Optional authenticated preview routes',
  'test:frontend:smoke:authenticated',
  '/v1/auth/session/me',
  'aios_access_token',
  'aios_refresh_token',
  'AIOS_ACCESS_COOKIE_NAME',
  'AIOS_REFRESH_COOKIE_NAME',
  'FRONTEND_SMOKE_AUTH_COOKIE',
  'authenticatedProfile',
  'Authenticated route expectations must not reuse anonymous redirect assertions',
  'verify:frontend:design-evolution',
  'DESIGN.md',
  'design-evolution',
  FRONTEND_COVERAGE_RATCHET_PATH,
  '85 / 85 / 85 / 80',
  'Legacy ratchets are domain-scoped',
]);

function hasDocumentText(documentSource, text) {
  return documentSource.includes(text);
}

function assertDocumentIncludes(documentSource, text, findings, guidance) {
  if (!hasDocumentText(documentSource, text)) {
    findings.push(`${guidance}: missing ${JSON.stringify(text)}`);
  }
}

function assertPackageScripts(packageJson, findings) {
  const scripts = packageJson.scripts ?? {};
  for (const scriptName of REQUIRED_PACKAGE_SCRIPT_NAMES) {
    if (typeof scripts[scriptName] !== 'string' || scripts[scriptName].trim() === '') {
      findings.push(`package.json is missing required script ${scriptName}`);
    }
  }
}

function assertDocumentScripts(documentSource, findings) {
  for (const command of REQUIRED_DOC_COMMANDS) {
    assertDocumentIncludes(
      documentSource,
      command,
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must list frontend quality package commands`,
    );
  }
}

function assertBundleBudgetConfig(budgetConfig, findings) {
  if (budgetConfig?.version !== 1) {
    findings.push(`${FRONTEND_BUNDLE_BUDGET_PATH} must use version 1`);
  }
  if (!budgetConfig?.budgets || typeof budgetConfig.budgets !== 'object' || Array.isArray(budgetConfig.budgets)) {
    findings.push(`${FRONTEND_BUNDLE_BUDGET_PATH} must include a budgets object`);
  }
  if (
    !Number.isFinite(budgetConfig?.targetRatio)
    || budgetConfig.targetRatio <= 0
    || budgetConfig.targetRatio > MAX_BUNDLE_TARGET_RATIO
  ) {
    findings.push(`${FRONTEND_BUNDLE_BUDGET_PATH} targetRatio must be greater than 0 and no greater than ${MAX_BUNDLE_TARGET_RATIO}`);
  }
}

function assertBundleBudgetDocs(documentSource, budgetConfig, findings) {
  assertDocumentIncludes(
    documentSource,
    '`npm run build`',
    findings,
    `${FRONTEND_QUALITY_DOC_PATH} must document the build-before-budget contract`,
  );
  assertDocumentIncludes(
    documentSource,
    '`npm run verify:frontend:bundle-budget`',
    findings,
    `${FRONTEND_QUALITY_DOC_PATH} must document the bundle-budget command`,
  );

  const targetRatio = budgetConfig?.targetRatio;
  if (Number.isFinite(targetRatio) && targetRatio > 0 && targetRatio <= MAX_BUNDLE_TARGET_RATIO) {
    const targetPercentage = Number((targetRatio * 100).toFixed(4));
    assertDocumentIncludes(
      documentSource,
      `targetRatio = ${targetRatio}`,
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must document the configured strict bundle target ratio`,
    );
    assertDocumentIncludes(
      documentSource,
      `strictly below ${targetPercentage}%`,
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must document strict bundle target semantics`,
    );
    assertDocumentIncludes(
      documentSource,
      'headroom percentage',
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must document bundle headroom reporting`,
    );
  }

  for (const [budgetKey, budgetEntry] of Object.entries(budgetConfig.budgets ?? {})) {
    assertDocumentIncludes(
      documentSource,
      budgetKey,
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must list every configured bundle budget key`,
    );
    assertDocumentIncludes(
      documentSource,
      String(budgetEntry.bytes),
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must list every configured bundle budget byte ceiling`,
    );
    assertDocumentIncludes(
      documentSource,
      budgetEntry.description,
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must list every configured bundle budget description`,
    );
    if (Number.isFinite(targetRatio) && targetRatio > 0 && targetRatio <= MAX_BUNDLE_TARGET_RATIO) {
      const strictTarget = Math.ceil(budgetEntry.bytes * targetRatio) - 1;
      assertDocumentIncludes(
        documentSource,
        String(strictTarget),
        findings,
        `${FRONTEND_QUALITY_DOC_PATH} must list every strict bundle target byte ceiling`,
      );
    }
  }
}

function assertCoverageRatchetConfig(coverageConfig, findings) {
  for (const finding of validateFrontendCoverageRatchetManifest(coverageConfig)) {
    findings.push(`${FRONTEND_COVERAGE_RATCHET_PATH}: ${finding}`);
  }
}

function assertCoverageRatchetDocs(documentSource, coverageConfig, findings) {
  assertDocumentIncludes(
    documentSource,
    FRONTEND_COVERAGE_RATCHET_PATH,
    findings,
    `${FRONTEND_QUALITY_DOC_PATH} must document the coverage ratchet manifest`,
  );

  for (const file of coverageConfig?.critical?.files ?? []) {
    assertDocumentIncludes(
      documentSource,
      file,
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must list every critical coverage file`,
    );
  }

  for (const group of coverageConfig?.legacy ?? []) {
    assertDocumentIncludes(
      documentSource,
      group.id,
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must list every legacy coverage group`,
    );
    for (const value of Object.values(group.thresholds ?? {})) {
      assertDocumentIncludes(
        documentSource,
        String(value),
        findings,
        `${FRONTEND_QUALITY_DOC_PATH} must list every legacy coverage threshold`,
      );
    }
  }
}

function normalizeRoutePath(routePath) {
  if (typeof routePath !== 'string' || routePath.trim() === '') {
    return null;
  }
  const trimmed = routePath.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function routeMarkdownMarker(routePath) {
  return `- \`${routePath}\``;
}

function assertSmokeRoutesConfig(smokeConfig, findings) {
  if (smokeConfig?.version !== 1) {
    findings.push(`${FRONTEND_SMOKE_ROUTES_PATH} must use version 1`);
  }
  if (!Array.isArray(smokeConfig?.routes) || smokeConfig.routes.length === 0) {
    findings.push(`${FRONTEND_SMOKE_ROUTES_PATH} must include a non-empty routes array`);
  }
  if (!smokeConfig.routes.some((route) => route?.enabledByDefault === false && route?.authenticatedProfile)) {
    findings.push(`${FRONTEND_SMOKE_ROUTES_PATH} must include at least one optional route with authenticatedProfile coverage`);
  }
}

function sectionBetween(documentSource, heading, nextHeading) {
  const start = documentSource.indexOf(heading);
  if (start === -1) {
    return '';
  }
  const bodyStart = start + heading.length;
  const candidateEnds = [nextHeading]
    .flat()
    .filter(Boolean)
    .map((headingName) => documentSource.indexOf(headingName, bodyStart))
    .filter((index) => index !== -1);
  const end = candidateEnds.length > 0 ? Math.min(...candidateEnds) : -1;
  return documentSource.slice(bodyStart, end === -1 ? undefined : end);
}

function assertSmokeRouteDocs(documentSource, smokeConfig, findings) {
  assertDocumentIncludes(
    documentSource,
    'Default route-aware smoke routes',
    findings,
    `${FRONTEND_QUALITY_DOC_PATH} must list default runtime smoke routes`,
  );
  assertDocumentIncludes(
    documentSource,
    'Optional protected anonymous redirect routes',
    findings,
    `${FRONTEND_QUALITY_DOC_PATH} must list optional protected runtime smoke routes`,
  );

  if (
    smokeConfig.routes.some((route) => (
      route?.enabledByDefault === false
      && route?.authenticatedProfile
      && route.authState === 'authenticated'
    ))
  ) {
    assertDocumentIncludes(
      documentSource,
      'Optional authenticated preview routes',
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must list optional authenticated preview runtime smoke routes`,
    );
  }

  const routes = Array.isArray(smokeConfig.routes) ? smokeConfig.routes : [];
  const defaultSection = sectionBetween(
    documentSource,
    'Default route-aware smoke routes',
    ['Optional protected anonymous redirect routes', 'Optional authenticated preview routes'],
  );
  const authenticatedPreviewSection = sectionBetween(
    documentSource,
    'Optional authenticated preview routes',
    ['Optional protected anonymous redirect routes', 'Viewport concepts'],
  );
  for (const route of routes) {
    const routePath = normalizeRoutePath(route.path);
    if (!routePath) {
      findings.push(`${FRONTEND_SMOKE_ROUTES_PATH} contains a route without a valid path`);
      continue;
    }
    const defaultEnabled = route.enabledByDefault !== false;
    const routeClass = defaultEnabled
      ? 'default'
      : route.authenticatedProfile
        ? 'optional authenticated preview'
        : 'optional protected';
    assertDocumentIncludes(
      documentSource,
      routeMarkdownMarker(routePath),
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must list ${routeClass} smoke route ${routePath}`,
    );

    if (route.enabledByDefault === false && route.authenticatedProfile) {
      assertDocumentIncludes(
        documentSource,
        'authenticatedProfile',
        findings,
        `${FRONTEND_QUALITY_DOC_PATH} must document authenticated smoke route profile semantics`,
      );
      if (route.authState === 'authenticated') {
        if (defaultSection.includes(routeMarkdownMarker(routePath))) {
          findings.push(`${FRONTEND_QUALITY_DOC_PATH} must not list authenticated-only smoke route ${routePath} under default route-aware smoke routes`);
        }
        if (!authenticatedPreviewSection.includes(routeMarkdownMarker(routePath))) {
          findings.push(`${FRONTEND_QUALITY_DOC_PATH} must list authenticated-only smoke route ${routePath} under Optional authenticated preview routes`);
        }
      }
    }
  }

  for (const envName of REQUIRED_SMOKE_ENV_NAMES) {
    assertDocumentIncludes(
      documentSource,
      envName,
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must document runtime smoke environment overrides`,
    );
  }
}

function assertVerifyCiManifest(findings, options = {}) {
  const {
    runGates = VERIFY_CI_RUN_GATES,
    postShellGates = VERIFY_CI_POST_SHELL_GATES,
  } = options;
  const runNames = runGates.map((gate) => gate.name);
  const postShellNames = postShellGates.map((gate) => gate.name);

  if (!runNames.includes('verify:frontend:smoke-behavior')) {
    findings.push('verify:frontend:smoke-behavior must stay wired into VERIFY_CI_RUN_GATES');
  }
  if (!runNames.includes('verify:frontend:coverage-ratchet-behavior')) {
    findings.push('verify:frontend:coverage-ratchet-behavior must stay wired into VERIFY_CI_RUN_GATES');
  }
  if (!runNames.includes('verify:frontend:coverage-ratchet')) {
    findings.push('verify:frontend:coverage-ratchet must stay wired into VERIFY_CI_RUN_GATES');
  }
  if (!runNames.includes('verify:frontend:prod-css-integrity')) {
    findings.push('verify:frontend:prod-css-integrity must stay wired into VERIFY_CI_RUN_GATES');
  }
  if (!runNames.includes('verify:frontend:preview-contract')) {
    findings.push('verify:frontend:preview-contract must stay wired into VERIFY_CI_RUN_GATES');
  }
  if (!runNames.includes('verify:frontend:design-evolution')) {
    findings.push('verify:frontend:design-evolution must stay wired into VERIFY_CI_RUN_GATES');
  }
  if (runNames.includes('test:frontend:smoke') || postShellNames.includes('test:frontend:smoke')) {
    findings.push('test:frontend:smoke must stay outside verify:ci because it needs a running service and browser runtime');
  }

  const buildIndex = runNames.indexOf('build');
  const budgetIndex = runNames.indexOf('verify:frontend:bundle-budget');
  if (buildIndex === -1 || budgetIndex === -1) {
    findings.push('VERIFY_CI_RUN_GATES must contain build and verify:frontend:bundle-budget');
    return;
  }
  if (budgetIndex !== buildIndex + 1) {
    findings.push('VERIFY_CI_RUN_GATES must keep build immediately before verify:frontend:bundle-budget');
  }
  const prodCssIndex = runNames.indexOf('verify:frontend:prod-css-integrity');
  if (prodCssIndex !== -1 && prodCssIndex !== budgetIndex + 1) {
    findings.push('VERIFY_CI_RUN_GATES must keep verify:frontend:prod-css-integrity immediately after verify:frontend:bundle-budget');
  }
  const previewContractIndex = runNames.indexOf('verify:frontend:preview-contract');
  if (prodCssIndex !== -1 && previewContractIndex !== -1 && previewContractIndex !== prodCssIndex + 1) {
    findings.push('VERIFY_CI_RUN_GATES must keep verify:frontend:preview-contract immediately after verify:frontend:prod-css-integrity');
  }
}

function assertVerifyCiDocs(documentSource, findings) {
  for (const phrase of REQUIRED_DOC_PHRASES) {
    assertDocumentIncludes(
      documentSource,
      phrase,
      findings,
      `${FRONTEND_QUALITY_DOC_PATH} must document current verify:ci, runtime smoke, and budget semantics`,
    );
  }
}

function assertReadmeDocs(readmeSource, findings) {
  for (const phrase of REQUIRED_README_PHRASES) {
    assertDocumentIncludes(
      readmeSource,
      phrase,
      findings,
      'README.md must document current frontend quality commands and remote workflow state',
    );
  }
}

export function auditFrontendQualityDocs({
  budgetConfig,
  coverageConfig,
  documentSource,
  packageJson,
  readmeSource,
  smokeConfig,
  verifyCiPostShellGates = VERIFY_CI_POST_SHELL_GATES,
  verifyCiRunGates = VERIFY_CI_RUN_GATES,
}) {
  const findings = [];

  assertPackageScripts(packageJson, findings);
  assertDocumentScripts(documentSource, findings);
  assertBundleBudgetConfig(budgetConfig, findings);
  assertBundleBudgetDocs(documentSource, budgetConfig, findings);
  assertCoverageRatchetConfig(coverageConfig, findings);
  assertCoverageRatchetDocs(documentSource, coverageConfig, findings);
  assertSmokeRoutesConfig(smokeConfig, findings);
  assertSmokeRouteDocs(documentSource, smokeConfig, findings);
  assertVerifyCiManifest(findings, {
    postShellGates: verifyCiPostShellGates,
    runGates: verifyCiRunGates,
  });
  assertVerifyCiDocs(documentSource, findings);
  assertReadmeDocs(readmeSource, findings);

  return findings;
}

export function formatFrontendQualityDocsFailure(findings) {
  return [
    `[${GUARD_NAME}] Frontend quality documentation drift was detected:`,
    ...findings.map((finding) => `- ${finding}`),
    '',
    `Update ${FRONTEND_QUALITY_DOC_PATH}, package scripts, ${FRONTEND_BUNDLE_BUDGET_PATH}, ${FRONTEND_COVERAGE_RATCHET_PATH}, or ${FRONTEND_SMOKE_ROUTES_PATH} so the quality manual matches executable gates.`,
  ].join('\n');
}

export function summarizeFrontendQualityDocs({ budgetConfig, coverageConfig, smokeConfig }) {
  const defaultRouteCount = smokeConfig.routes.filter((route) => route.enabledByDefault !== false).length;
  const optionalRouteCount = smokeConfig.routes.length - defaultRouteCount;
  const budgetCount = Object.keys(budgetConfig.budgets ?? {}).length;
  const coverageGroupCount = 1 + (coverageConfig.legacy?.length ?? 0);
  return `${REQUIRED_PACKAGE_SCRIPT_NAMES.length} scripts, ${defaultRouteCount} default routes, ${optionalRouteCount} optional routes, ${budgetCount} bundle budgets, ${coverageGroupCount} coverage groups, and verify:ci semantics are documented.`;
}
