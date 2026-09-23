#!/usr/bin/env node

/**
 * Ensures ECharts theme adapters consume AIOS token helpers instead of
 * reintroducing local chart colors.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
} from '../../lib/shared/guard-utils.mjs';
import {
  auditEchartsThemeTokenSync,
  ECHARTS_STYLE_PATH,
  ECHARTS_THEME_PATH,
  formatEchartsThemeTokenSyncFailure,
  summarizeEchartsThemeTokenSync,
} from '../../lib/design/echarts-theme-token-sync-core.mjs';

export {
  auditEchartsThemeTokenSync,
  formatEchartsThemeTokenSyncFailure,
  summarizeEchartsThemeTokenSync,
} from '../../lib/design/echarts-theme-token-sync-core.mjs';

const { fail, reportOk } = createCheckGuard('echarts-theme-token-sync', { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  const echartsStyleSource = readRequiredFile(repoRoot, ECHARTS_STYLE_PATH, fail);
  const echartsThemeSource = readRequiredFile(repoRoot, ECHARTS_THEME_PATH, fail);
  const findings = auditEchartsThemeTokenSync({ echartsStyleSource, echartsThemeSource });

  if (findings.length > 0) {
    console.error(formatEchartsThemeTokenSyncFailure(findings));
    process.exit(1);
  }

  reportOk(summarizeEchartsThemeTokenSync());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
