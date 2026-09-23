#!/usr/bin/env node

/**
 * Weekly platform tab Douyin channel leaf-adapter behavior guard.
 *
 * The channel section should stay render-only. The adapter owns data field
 * extraction, chart prop construction, summary text, and empty chart contracts.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinChannelLeafAdapterBehaviorFixtures,
} from '../../fixtures/weekly/douyin-channel-leaf-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-channel-leaf-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyDouyinChannelLeafAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
