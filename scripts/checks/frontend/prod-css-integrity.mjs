#!/usr/bin/env node

import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  checkFrontendProdCssIntegrity,
  formatFrontendProdCssIntegrityFindings,
  summarizeFrontendProdCssIntegrity,
} from '../../lib/frontend/frontend-prod-css-integrity-core.mjs';

export {
  DIST_ASSETS_PATH,
  REQUIRED_PRODUCTION_CSS_TOKENS,
  checkFrontendProdCssIntegrity,
  findMissingProductionCssTokens,
  findPureGlobalRootCssModules,
  findSideEffectCssModuleImports,
  formatFrontendProdCssIntegrityFindings,
  summarizeFrontendProdCssIntegrity,
} from '../../lib/frontend/frontend-prod-css-integrity-core.mjs';

const GUARD_NAME = 'frontend-prod-css-integrity';

function main() {
  const { reportOk } = createCheckGuard(GUARD_NAME, { errorPrefix: '' });
  let result;

  try {
    result = checkFrontendProdCssIntegrity(getRepoRoot());
  } catch (error) {
    console.error(`[${GUARD_NAME}] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const findings = formatFrontendProdCssIntegrityFindings(result);
  if (findings.length > 0) {
    console.error(`[${GUARD_NAME}] Production CSS integrity drift was detected:`);
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    console.error('\nKeep global CSS side effects in plain .css files and verify production dist tokens after npm run build.');
    process.exit(1);
  }

  reportOk(summarizeFrontendProdCssIntegrity(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
