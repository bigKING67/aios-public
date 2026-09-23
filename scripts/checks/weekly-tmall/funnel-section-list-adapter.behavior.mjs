#!/usr/bin/env node

/**
 * Weekly platform tab Tmall funnel section-list adapter behavior guard.
 *
 * TmallFunnelDiagnosisSections should stay render-only. The adapter owns
 * mapping the wide list props into per-channel section contracts and the empty
 * section predicate.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyTmallFunnelSectionListAdapterBehaviorFixtures,
} from '../../fixtures/weekly/tmall-funnel-section-list-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-tmall-funnel-section-list-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyTmallFunnelSectionListAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
