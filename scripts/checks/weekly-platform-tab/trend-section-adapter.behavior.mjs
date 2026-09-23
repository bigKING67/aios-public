#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyPlatformTabTrendSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/platform-tab-trend-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-trend-section-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyPlatformTabTrendSectionAdapterBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
  reportError(error, 'unexpected runtime error');
  });
