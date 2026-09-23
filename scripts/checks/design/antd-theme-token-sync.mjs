#!/usr/bin/env node

/**
 * Guards Ant Design theme adapters against token drift.
 *
 * AntD is a runtime consumption surface for AIOS design tokens. The light
 * theme must map through apps/web-vite/src/lib/design-token-values.ts instead of local raw
 * colors. The only raw colors allowed here are the explicitly isolated dark
 * adapter exception values. The value helper's own mapping contract is owned
 * by verify:design:token-values-sync.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
  readRequiredJsonFile,
} from '../../lib/shared/guard-utils.mjs';
import {
  ANT_THEME_PATH,
  TOKEN_JSON_PATH,
  VITE_PROVIDER_PATH,
  auditAntdThemeTokenSync,
  formatAntdThemeTokenSyncFailure,
  summarizeAntdThemeTokenSync,
} from '../../lib/design/antd-theme-token-sync-core.mjs';

export {
  auditAntdThemeTokenSync,
  formatAntdThemeTokenSyncFailure,
  summarizeAntdThemeTokenSync,
} from '../../lib/design/antd-theme-token-sync-core.mjs';

const { fail, reportOk } = createCheckGuard('antd-theme-token-sync', { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  const tokens = readRequiredJsonFile(repoRoot, TOKEN_JSON_PATH, fail);
  const antThemeSource = readRequiredFile(repoRoot, ANT_THEME_PATH, fail);
  const viteProviderSource = readRequiredFile(repoRoot, VITE_PROVIDER_PATH, fail);
  const findings = auditAntdThemeTokenSync({ antThemeSource, tokens, viteProviderSource }, { fail });

  if (findings.length > 0) {
    console.error(formatAntdThemeTokenSyncFailure(findings));
    process.exit(1);
  }

  reportOk(summarizeAntdThemeTokenSync());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
