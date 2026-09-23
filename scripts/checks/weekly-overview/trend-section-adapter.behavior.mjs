#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyOverviewTrendSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/overview-trend-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-overview-trend-section-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyOverviewTrendSectionAdapterBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
