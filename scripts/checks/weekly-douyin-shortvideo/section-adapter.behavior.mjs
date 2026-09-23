#!/usr/bin/env node

/**
 * Weekly platform tab Douyin shortvideo-section adapter behavior guard.
 *
 * DouyinShortvideoAttributionSections should stay render-only. The adapter
 * owns the mapping from the shortvideo attribution input contract into the two
 * narrow child section contracts: overview and analysis.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinShortvideoSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/douyin-shortvideo-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-shortvideo-section-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyDouyinShortvideoSectionAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
