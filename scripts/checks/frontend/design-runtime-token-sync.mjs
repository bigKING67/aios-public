#!/usr/bin/env node

/**
 * Runtime token sync audit.
 *
 * DESIGN_TOKENS.json and apps/web-vite/src/lib/design-tokens.ts are structural mirrors, but
 * the browser consumes apps/web-vite/src/styles/design-tokens.css. This guard ensures
 * high-risk non-color token families do not drift between the JSON/TS mirror
 * and runtime CSS variables.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
  readRequiredJsonFile,
} from '../../lib/shared/guard-utils.mjs';
import {
  DESIGN_CSS_PATH,
  TOKEN_JSON_PATH,
  auditDesignRuntimeTokens,
  formatDesignRuntimeTokenFailure,
  summarizeDesignRuntimeTokens,
} from '../../lib/design/design-runtime-token-sync-core.mjs';

export {
  DESIGN_CSS_PATH,
  TOKEN_JSON_PATH,
  auditDesignRuntimeTokens,
  formatDesignRuntimeTokenFailure,
  summarizeDesignRuntimeTokens,
} from '../../lib/design/design-runtime-token-sync-core.mjs';

const { fail, reportOk } = createCheckGuard('design-runtime-token-sync', { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  const tokens = readRequiredJsonFile(repoRoot, TOKEN_JSON_PATH, fail);
  const cssSource = readRequiredFile(repoRoot, DESIGN_CSS_PATH, fail);
  const { diffs, expectedRuntimeTokens } = auditDesignRuntimeTokens({ cssSource, tokens });

  if (diffs.length > 0) {
    console.error(formatDesignRuntimeTokenFailure(diffs));
    process.exit(1);
  }

  reportOk(summarizeDesignRuntimeTokens(expectedRuntimeTokens));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
