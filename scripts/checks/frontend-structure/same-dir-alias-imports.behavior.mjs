#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendSameDirAliasImportsBehaviorFixtures,
} from '../../lib/frontend/frontend-same-dir-alias-imports-behavior-fixtures.mjs';

const guard = createCheckGuard('frontend-same-dir-alias-imports-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runFrontendSameDirAliasImportsBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
