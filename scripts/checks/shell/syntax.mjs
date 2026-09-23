#!/usr/bin/env node

import {
  runShellSyntaxCheck,
} from '../../lib/ci/shell-syntax-core.mjs';

export {
  LEGACY_CHANGED_FILES_ENV,
  SHELL_CHANGED_FILES_ENV,
  SHELL_CHANGED_SCOPE_ENV,
  runShellSyntaxCheck,
} from '../../lib/ci/shell-syntax-core.mjs';

function run() {
  const result = runShellSyntaxCheck();
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
