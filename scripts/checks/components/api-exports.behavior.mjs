#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runComponentApiExportsBehaviorFixtures,
} from '../../lib/frontend/component-api-exports-behavior-fixtures.mjs';

const guard = createCheckGuard('component-api-exports-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runComponentApiExportsBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
