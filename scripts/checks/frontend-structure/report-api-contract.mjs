#!/usr/bin/env node

/**
 * Report API facade contract audit.
 *
 * `apps/web-vite/src/lib/api.ts` is the public client facade consumed by report hooks and
 * pages. The implementation may be split under `apps/web-vite/src/lib/report-api/`, but
 * external callers should keep importing from `@/lib/api` so future module
 * moves do not leak through the application surface.
 */

import {
  createCheckGuard,
  getRepoRoot,
} from '../../lib/shared/guard-utils.mjs';
import {
  EXPECTED_MODULES,
  EXPECTED_REPORT_API_KEYS,
  auditReportApiContract,
} from '../../lib/frontend/frontend-report-api-contract-core.mjs';

const GUARD_NAME = 'frontend-report-api-contract';

function main() {
  const repoRoot = getRepoRoot();
  const findings = auditReportApiContract(repoRoot);
  if (findings.length > 0) {
    console.error(`[${GUARD_NAME}] Report API facade contract drift was detected:`);
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    console.error('\nKeep apps/web-vite/src/lib/api.ts as the public facade and update this contract when report API modules intentionally change.');
    process.exit(1);
  }

  createCheckGuard(GUARD_NAME).reportOk(`${EXPECTED_REPORT_API_KEYS.length} facade methods across ${Object.keys(EXPECTED_MODULES).length} report API modules.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  auditReportApiContract,
};
