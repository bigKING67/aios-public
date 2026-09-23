#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyOverviewTrendBehaviorFixtures,
} from '../../fixtures/weekly/overview-trend.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-overview-trend-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyOverviewTrendBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
