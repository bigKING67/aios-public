#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runReleaseVersionBumpBehaviorFixtures,
} from '../../lib/quality/quality-release-version-bump-behavior-fixtures.mjs';

const guard = createCheckGuard('release-version-bump-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runReleaseVersionBumpBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
