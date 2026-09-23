#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyPlatformTabContentAdaptersBehaviorFixtures,
} from '../../fixtures/weekly/platform-tab-content-adapters.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-content-adapters-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyPlatformTabContentAdaptersBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
