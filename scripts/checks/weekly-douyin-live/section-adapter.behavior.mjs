#!/usr/bin/env node

/**
 * Weekly platform tab Douyin live-section adapter behavior guard.
 *
 * DouyinLiveAttributionSections should stay render-only. The adapter owns the
 * mapping from the live attribution input contract into the two narrow child
 * section contracts: session attribution and live funnel analysis.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinLiveSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/douyin-live-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-live-section-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyDouyinLiveSectionAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
