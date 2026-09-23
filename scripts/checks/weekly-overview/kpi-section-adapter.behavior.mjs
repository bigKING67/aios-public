#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyOverviewKpiSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/overview-kpi-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-overview-kpi-section-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyOverviewKpiSectionAdapterBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
