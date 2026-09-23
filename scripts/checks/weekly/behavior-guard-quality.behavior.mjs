#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runWeeklyBehaviorGuardQualityBehaviorFixtures,
} from '../../fixtures/weekly/behavior-guard-quality.behavior-fixtures.mjs';

const assertions = createCheckGuard('weekly-behavior-guard-quality-behavior');
const {
  reportError,
  reportOk,
} = assertions;

try {
  const message = runWeeklyBehaviorGuardQualityBehaviorFixtures(assertions);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
