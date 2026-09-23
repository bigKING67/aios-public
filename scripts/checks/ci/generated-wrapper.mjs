#!/usr/bin/env node

/**
 * verify:ci wrapper contract audit.
 *
 * The legacy generated long shell manifest has been retired. The only allowed
 * top-level shell entrypoint is now a thin wrapper around quality-runner.
 */

import { createCheckGuard, getRepoRoot, readRequiredFile } from '../../lib/shared/guard-utils.mjs';
import { renderVerifyCiSh } from '../../ci/render-verify-ci-sh.mjs';

const GUARD_NAME = 'verify-ci-generated';
const { fail, reportOk } = createCheckGuard(GUARD_NAME, { errorPrefix: '' });

export function checkGeneratedVerifyCiWrapper(actual, options = {}) {
  const {
    expected = renderVerifyCiSh(),
  } = options;

  return {
    expected,
    isCurrent: actual === expected,
  };
}

export function formatGeneratedVerifyCiWrapperFailure() {
  return [
    `[${GUARD_NAME}] scripts/verify-ci.sh wrapper drift was detected.`,
    '- Regenerate with: node scripts/ci/render-verify-ci-sh.mjs > scripts/verify-ci.sh',
  ].join('\n');
}

function main() {
  const repoRoot = getRepoRoot();
  const actual = readRequiredFile(repoRoot, 'scripts/verify-ci.sh', fail, {
    missingMessage: 'scripts/verify-ci.sh not found.',
  });
  const { isCurrent } = checkGeneratedVerifyCiWrapper(actual);

  if (!isCurrent) {
    console.error(formatGeneratedVerifyCiWrapperFailure());
    process.exit(1);
  }

  reportOk('scripts/verify-ci.sh is a thin quality-runner wrapper.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
