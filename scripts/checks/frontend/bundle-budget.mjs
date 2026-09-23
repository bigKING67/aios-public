#!/usr/bin/env node

import {
  checkFrontendBundleBudget,
} from '../../lib/frontend/frontend-bundle-budget-core.mjs';
import { getRepoRoot } from '../../lib/shared/guard-utils.mjs';

const result = checkFrontendBundleBudget(getRepoRoot());
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.status !== 0) {
  process.exit(result.status);
}
