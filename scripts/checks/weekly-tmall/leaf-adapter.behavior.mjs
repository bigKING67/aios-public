#!/usr/bin/env node

/**
 * Weekly platform tab Tmall leaf-adapter behavior guard.
 *
 * Tmall goods/channel leaf containers should not manually fan out fields into
 * overview children or build summary text in JSX. The adapter owns field
 * extraction, overview child props, summary text, and narrow prop contracts.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyTmallLeafAdapterBehaviorFixtures,
} from '../../fixtures/weekly/tmall-leaf-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-tmall-leaf-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyTmallLeafAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
