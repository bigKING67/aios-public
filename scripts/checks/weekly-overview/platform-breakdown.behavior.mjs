#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyOverviewPlatformBreakdownBehaviorFixtures,
} from '../../fixtures/weekly/overview-platform-breakdown.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-overview-platform-breakdown-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyOverviewPlatformBreakdownBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
