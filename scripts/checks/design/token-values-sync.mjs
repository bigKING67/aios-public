#!/usr/bin/env node

/**
 * Guards apps/web-vite/src/lib/design-token-values.ts as the canonical runtime value helper
 * consumed by Ant Design, ECharts, and other theme adapters.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
} from '../../lib/shared/guard-utils.mjs';
import {
  CANONICAL_TOKEN_PATH,
  TOKEN_MIRROR_PATH,
  VALUE_HELPER_PATH,
  auditDesignTokenValuesSource,
  formatDesignTokenValuesFailure,
  summarizeDesignTokenValues,
} from '../../lib/design/design-token-values-sync-core.mjs';

export {
  CANONICAL_TOKEN_PATH,
  CHART_SERIES_MAPPINGS,
  COLOR_VALUE_MAPPINGS,
  TOKEN_MIRROR_PATH,
  VALUE_HELPER_PATH,
  auditDesignTokenValuesSource,
  formatDesignTokenValuesFailure,
  summarizeDesignTokenValues,
} from '../../lib/design/design-token-values-sync-core.mjs';

const { fail, reportOk } = createCheckGuard('design-token-values-sync', { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  const source = readRequiredFile(repoRoot, VALUE_HELPER_PATH, fail);
  const canonicalTokens = JSON.parse(readRequiredFile(repoRoot, CANONICAL_TOKEN_PATH, fail));
  const tokenMirrorSource = readRequiredFile(repoRoot, TOKEN_MIRROR_PATH, fail);
  const findings = auditDesignTokenValuesSource(source, {
    canonicalTokens,
    tokenMirrorSource,
    fail,
  });

  if (findings.length > 0) {
    console.error(formatDesignTokenValuesFailure(findings));
    process.exit(1);
  }

  reportOk(summarizeDesignTokenValues());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
