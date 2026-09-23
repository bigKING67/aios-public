#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runAppModuleBoundaryBehaviorFixtures,
} from '../../lib/frontend/app-module-boundaries-behavior-fixtures.mjs';

const guard = createCheckGuard('app-module-boundary-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runAppModuleBoundaryBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
