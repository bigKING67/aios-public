#!/usr/bin/env node

/**
 * Verifies that apps/web-vite/src/lib/design-tokens.ts is a full structural mirror of
 * DESIGN_TOKENS.json. This catches non-color token drift such as typography,
 * spacing, radius, shadow, and component tokens.
 */

import {
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
  readRequiredJsonFile,
} from '../../lib/shared/guard-utils.mjs';
import {
  TOKEN_JSON_PATH,
  TOKEN_TS_PATH,
  auditDesignTokenMirrorSync,
  formatDesignTokenMirrorFailure,
  parseTsMirrorSource,
} from '../../lib/design/design-token-mirror-sync-core.mjs';

const { fail, reportOk } = createCheckGuard('design-token-mirror-sync', { errorPrefix: '' });

function main() {
  const repoRoot = getRepoRoot();
  const jsonTokens = readRequiredJsonFile(repoRoot, TOKEN_JSON_PATH, fail);
  const content = readRequiredFile(repoRoot, TOKEN_TS_PATH, fail);
  let tsTokens;
  try {
    tsTokens = parseTsMirrorSource(content, TOKEN_TS_PATH);
  } catch (error) {
    fail(error.message);
  }

  const { diffs, leafCount } = auditDesignTokenMirrorSync({ jsonTokens, tsTokens });

  if (diffs.length > 0) {
    console.error(formatDesignTokenMirrorFailure({ diffs }));
    process.exit(1);
  }

  reportOk(`${TOKEN_TS_PATH} mirrors ${TOKEN_JSON_PATH} (${leafCount} leaf values).`);
}

main();
