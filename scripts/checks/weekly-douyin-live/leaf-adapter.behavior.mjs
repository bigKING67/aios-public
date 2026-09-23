#!/usr/bin/env node

/**
 * Weekly platform tab Douyin live leaf-adapter behavior guard.
 *
 * Live leaf containers should not manually fan out data fields into their
 * overview/quant children. The adapter owns field extraction and summary text.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinLiveLeafAdapterBehaviorFixtures,
} from '../../fixtures/weekly/douyin-live-leaf-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-live-leaf-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyDouyinLiveLeafAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
