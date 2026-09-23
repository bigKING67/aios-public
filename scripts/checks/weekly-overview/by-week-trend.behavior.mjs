#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyOverviewByWeekTrendBehaviorFixtures,
} from '../../fixtures/weekly/overview-by-week-trend.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-overview-by-week-trend-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyOverviewByWeekTrendBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
