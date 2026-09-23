#!/usr/bin/env node

/**
 * Weekly platform tab Tmall section-adapter behavior guard.
 *
 * PlatformTabTmallAttributionSections should stay render-only. The adapter owns
 * the mapping from the wide Tmall view-model plus table columns into the three
 * narrow section contracts: goods, channel, and funnel diagnosis.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyTmallAttributionSectionAdapterBehaviorFixtures,
} from '../../fixtures/weekly/tmall-attribution-section-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-tmall-attribution-section-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyTmallAttributionSectionAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
