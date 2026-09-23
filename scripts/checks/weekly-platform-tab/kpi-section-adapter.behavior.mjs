#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyPlatformKpiSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/platform-tab-kpi-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-kpi-section-adapter-behavior';

const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyPlatformKpiSectionAdapterBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
