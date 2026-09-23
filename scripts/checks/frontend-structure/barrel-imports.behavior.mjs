#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendBarrelImportsBehaviorFixtures,
} from '../../lib/frontend/frontend-barrel-imports-behavior-fixtures.mjs';

const guard = createCheckGuard('frontend-barrel-imports-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runFrontendBarrelImportsBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
