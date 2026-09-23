#!/usr/bin/env node

/**
 * Weekly platform tab Douyin shortvideo leaf-adapter behavior guard.
 *
 * Shortvideo leaf containers should not manually fan out data fields into
 * overview/diagnosis/table children. The adapter owns field extraction,
 * summary text, diagnosis item mapping, and responsive table props.
 */

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinShortvideoLeafAdapterBehaviorFixtures,
} from '../../fixtures/weekly/douyin-shortvideo-leaf-adapter.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-shortvideo-leaf-adapter-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

runWeeklyDouyinShortvideoLeafAdapterBehaviorFixtures(assertions)
  .then(() => reportOk())
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
