#!/usr/bin/env node

/**
 * Weekly platform tab Douyin section-adapter behavior guard.
 *
 * PlatformTabDouyinContent should stay render-only. The adapter owns the
 * mapping from Douyin content props into the narrow Douyin attribution sections
 * contract, including chart visual tokens.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/douyin-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-section-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyDouyinSectionAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
