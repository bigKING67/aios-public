#!/usr/bin/env node

/**
 * Weekly platform tab Douyin card leaf-adapter behavior guard.
 *
 * Card leaf containers should not manually fan out data fields into their
 * overview/quant children. The adapter owns field extraction, descriptions,
 * summary text, and empty selected-source contracts.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinCardLeafAdapterBehaviorFixtures,
} from '../../fixtures/weekly/douyin-card-leaf-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-card-leaf-adapter-behavior';

const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyDouyinCardLeafAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
