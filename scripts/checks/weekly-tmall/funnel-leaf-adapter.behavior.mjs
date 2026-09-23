#!/usr/bin/env node

/**
 * Weekly platform tab Tmall funnel leaf-adapter behavior guard.
 *
 * Tmall funnel channel containers should stay render-only. The adapter owns
 * click-stage routing, detail table columns/scroll, funnel chart data, summary
 * text, quant fallback rows, and narrow overview/quant child props.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyTmallFunnelLeafAdapterBehaviorFixtures,
} from '../../fixtures/weekly/tmall-funnel-leaf-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-tmall-funnel-leaf-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyTmallFunnelLeafAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
