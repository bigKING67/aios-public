#!/usr/bin/env node

/**
 * Frontend quality-system documentation drift audit.
 *
 * docs/FRONTEND_QUALITY_SYSTEM.md is the operating manual for frontend quality
 * gates. This guard binds it to package scripts, bundle-budget config, runtime
 * smoke config, and verify:ci manifest semantics so docs cannot silently drift.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
  readRequiredJsonFile,
  readRequiredPackageJson,
} from '../../lib/shared/guard-utils.mjs';
import {
  FRONTEND_BUNDLE_BUDGET_PATH,
  FRONTEND_COVERAGE_RATCHET_PATH,
  FRONTEND_QUALITY_DOC_PATH,
  FRONTEND_SMOKE_ROUTES_PATH,
  auditFrontendQualityDocs,
  formatFrontendQualityDocsFailure,
  summarizeFrontendQualityDocs,
} from '../../lib/frontend/frontend-quality-docs-drift-core.mjs';

export {
  auditFrontendQualityDocs,
  formatFrontendQualityDocsFailure,
  summarizeFrontendQualityDocs,
} from '../../lib/frontend/frontend-quality-docs-drift-core.mjs';

const GUARD_NAME = 'frontend-quality-docs-drift';

const { fail, reportOk } = createCheckGuard(GUARD_NAME, { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  const documentSource = readRequiredFile(repoRoot, FRONTEND_QUALITY_DOC_PATH, fail, {
    missingMessage: `${FRONTEND_QUALITY_DOC_PATH} not found.`,
  });
  const packageJson = readRequiredPackageJson(repoRoot, fail);
  const budgetConfig = readRequiredJsonFile(repoRoot, FRONTEND_BUNDLE_BUDGET_PATH, fail, {
    missingMessage: `${FRONTEND_BUNDLE_BUDGET_PATH} not found.`,
  });
  const coverageConfig = readRequiredJsonFile(repoRoot, FRONTEND_COVERAGE_RATCHET_PATH, fail, {
    missingMessage: `${FRONTEND_COVERAGE_RATCHET_PATH} not found.`,
  });
  const smokeConfig = readRequiredJsonFile(repoRoot, FRONTEND_SMOKE_ROUTES_PATH, fail, {
    missingMessage: `${FRONTEND_SMOKE_ROUTES_PATH} not found.`,
  });
  const readmeSource = readRequiredFile(repoRoot, 'README.md', fail, {
    missingMessage: 'README.md not found.',
  });

  const findings = auditFrontendQualityDocs({
    budgetConfig,
    coverageConfig,
    documentSource,
    packageJson,
    readmeSource,
    smokeConfig,
  });

  if (findings.length > 0) {
    console.error(formatFrontendQualityDocsFailure(findings));
    process.exit(1);
  }

  reportOk(summarizeFrontendQualityDocs({ budgetConfig, coverageConfig, smokeConfig }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
