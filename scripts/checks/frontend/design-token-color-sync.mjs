#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  checkDesignTokenColorSync,
} from '../../lib/frontend/frontend-design-token-color-sync-core.mjs';

const { fail, reportOk } = createCheckGuard('design-token-color-sync', { errorPrefix: '' });

try {
  const result = checkDesignTokenColorSync();
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
  reportOk(result.message);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
