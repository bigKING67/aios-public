#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendQualityDocsDriftBehaviorFixtures,
} from '../../lib/frontend/frontend-quality-docs-drift-behavior-fixtures.mjs';

const guard = createCheckGuard('frontend-quality-docs-drift-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runFrontendQualityDocsDriftBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
