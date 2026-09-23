#!/usr/bin/env node

/**
 * Weekly funnel behavior guard.
 *
 * These helpers sit close to business formulas. Keep this script focused on
 * observable behavior so future refactors can move code without changing the
 * funnel semantics by accident.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyFunnelBehaviorFixtures,
} from '../../fixtures/weekly/funnel.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-funnel-behavior';
const {
  assertApprox,
  assertEqual,
  reportError,
  reportOk,
} = createWeeklyBehaviorGuard(GUARD_NAME);

runWeeklyFunnelBehaviorFixtures({ assertApprox, assertEqual })
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
