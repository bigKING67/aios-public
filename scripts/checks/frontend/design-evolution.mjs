#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  checkFrontendDesignEvolution,
} from '../../lib/frontend/frontend-design-evolution-core.mjs';

const { fail } = createCheckGuard('frontend-design-evolution', { errorPrefix: '' });

function main() {
  const output = checkFrontendDesignEvolution();
  if (output.stdout) {
    process.stdout.write(output.stdout);
  }
  if (output.stderr) {
    process.stderr.write(output.stderr);
  }
  if (output.status !== 0) {
    process.exit(output.status);
  }
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
