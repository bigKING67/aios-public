#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runRetiredFrontendLeftoversCheck,
} from '../../lib/frontend/retired-frontend-leftovers-core.mjs';

const { fail } = createCheckGuard('retired-frontend-leftovers', { errorPrefix: '' });

try {
  const result = runRetiredFrontendLeftoversCheck();
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
