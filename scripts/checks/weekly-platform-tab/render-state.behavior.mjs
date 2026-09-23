#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyPlatformTabRenderStateBehaviorFixtures,
} from '../../fixtures/weekly/platform-tab-render-state.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-render-state-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyPlatformTabRenderStateBehaviorFixtures(assertions)
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
