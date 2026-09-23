#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runComponentBoundariesBehaviorFixtures,
} from '../../lib/frontend/component-boundaries-behavior-fixtures.mjs';

const guard = createCheckGuard('component-boundary-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runComponentBoundariesBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
