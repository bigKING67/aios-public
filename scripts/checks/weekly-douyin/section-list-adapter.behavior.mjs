#!/usr/bin/env node

/**
 * Weekly platform tab Douyin section-list adapter behavior guard.
 *
 * DouyinAttributionSectionList should stay routing/render-only. The adapter
 * owns mapping the wide list props into live, shortvideo, and card section
 * contracts so JSX containers do not regress into broad prop plumbing.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinSectionListAdapterBehaviorFixtures,
} from '../../fixtures/weekly/douyin-section-list-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-section-list-adapter-behavior';

const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyDouyinSectionListAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
