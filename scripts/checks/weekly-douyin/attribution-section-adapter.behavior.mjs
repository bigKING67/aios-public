#!/usr/bin/env node

/**
 * Weekly platform tab Douyin attribution top-level adapter behavior guard.
 *
 * DouyinAttributionSections should stay render-only. The adapter owns mapping
 * the wide attribution input contract into the channel section, section list,
 * and empty-state visibility contract.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinAttributionSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/douyin-attribution-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-attribution-section-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyDouyinAttributionSectionAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
