#!/usr/bin/env node

/**
 * Weekly waterfall behavior guard.
 *
 * The attribution waterfall helpers contain subtle formula differences:
 * goods/channel use the full row set as denominator, while Douyin visible-row
 * waterfalls use only the displayed rows. Keep these checks close to CI so
 * helper refactors do not flatten those semantics.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyWaterfallBehaviorFixtures,
} from '../../fixtures/weekly/waterfall.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-waterfall-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyWaterfallBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
