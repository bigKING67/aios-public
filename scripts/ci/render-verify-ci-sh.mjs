#!/usr/bin/env node

/**
 * Compatibility renderer for the top-level verify-ci wrapper.
 *
 * The long static npm-run manifest was retired in favor of
 * scripts/quality-runner.mjs. Keep this small renderer only so older checks and
 * docs have a stable way to assert the wrapper contract.
 */

export function renderVerifyCiSh() {
  return [
    '#!/usr/bin/env bash',
    '',
    'set -euo pipefail',
    '',
    'PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"',
    '',
    'node "${PROJECT_ROOT}/scripts/quality-runner.mjs" run ci "$@"',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(renderVerifyCiSh());
}
