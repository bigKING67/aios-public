#!/usr/bin/env node

/**
 * Ensures apps/web-vite/src/styles/echarts.css fallback literals and public CSS aliases stay
 * mapped to the canonical AIOS chart/platform/text token sources.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
  readRequiredJsonFile,
} from '../../lib/shared/guard-utils.mjs';
import {
  auditEchartsCssTokenSync,
  DOMAIN_SOURCE_PATH,
  ECHARTS_CSS_PATH,
  formatEchartsCssTokenSyncFailure,
  PLATFORM_SOURCE_PATH,
  summarizeEchartsCssTokenSync,
  SYNC_CONFIG_PATH,
  TOKEN_JSON_PATH,
} from '../../lib/design/echarts-css-token-sync-core.mjs';

export {
  auditEchartsCssTokenSync,
  formatEchartsCssTokenSyncFailure,
  summarizeEchartsCssTokenSync,
} from '../../lib/design/echarts-css-token-sync-core.mjs';

const { fail, reportOk } = createCheckGuard('echarts-css-token-sync', { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  const tokens = readRequiredJsonFile(repoRoot, TOKEN_JSON_PATH, fail);
  const syncConfig = readRequiredJsonFile(repoRoot, SYNC_CONFIG_PATH, fail);
  const sources = {
    platform: readRequiredFile(repoRoot, PLATFORM_SOURCE_PATH, fail),
    domain: readRequiredFile(repoRoot, DOMAIN_SOURCE_PATH, fail),
  };
  const cssSource = readRequiredFile(repoRoot, ECHARTS_CSS_PATH, fail);
  const {
    expectedAliases,
    expectedFallbacks,
    findings,
  } = auditEchartsCssTokenSync({ cssSource, sources, syncConfig, tokens }, { fail });

  if (findings.length > 0) {
    console.error(formatEchartsCssTokenSyncFailure(findings));
    process.exit(1);
  }

  reportOk(summarizeEchartsCssTokenSync({ expectedAliases, expectedFallbacks }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
