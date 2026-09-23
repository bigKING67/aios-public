#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendLayerBoundariesBehaviorFixtures,
} from '../../lib/frontend/frontend-layer-boundaries-behavior-fixtures.mjs';

const guard = createCheckGuard('frontend-layer-boundaries-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runFrontendLayerBoundariesBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
