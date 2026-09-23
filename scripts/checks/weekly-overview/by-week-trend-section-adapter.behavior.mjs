#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyOverviewByWeekTrendSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/overview-by-week-trend-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-overview-by-week-trend-section-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyOverviewByWeekTrendSectionAdapterBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
