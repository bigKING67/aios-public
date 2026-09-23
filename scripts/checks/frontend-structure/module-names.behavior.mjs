#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendModuleNamesBehaviorFixtures,
} from '../../lib/frontend/frontend-module-names-behavior-fixtures.mjs';

const guard = createCheckGuard('frontend-misleading-module-names-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runFrontendModuleNamesBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
