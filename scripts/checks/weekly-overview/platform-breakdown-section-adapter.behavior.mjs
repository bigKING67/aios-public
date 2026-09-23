#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyOverviewPlatformBreakdownSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/overview-platform-breakdown-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-overview-platform-breakdown-section-adapter-behavior';

const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyOverviewPlatformBreakdownSectionAdapterBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
