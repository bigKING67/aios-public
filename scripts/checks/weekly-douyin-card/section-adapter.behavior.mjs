#!/usr/bin/env node

/**
 * Weekly platform tab Douyin card-section adapter behavior guard.
 *
 * DouyinCardAttributionSections should stay routing/render-only. The adapter
 * owns the mapping from the card attribution container props into the three
 * narrow child section contracts: product, source, and source funnel.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinCardSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/douyin-card-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-card-section-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyDouyinCardSectionAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
