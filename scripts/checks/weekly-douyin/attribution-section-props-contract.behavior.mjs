#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyDouyinAttributionSectionPropsContractBehaviorFixtures,
} from '../../fixtures/weekly/douyin-attribution-section-props-contract.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-platform-tab-douyin-attribution-section-props-contract-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

Promise.resolve()
  .then(() => runWeeklyDouyinAttributionSectionPropsContractBehaviorFixtures(assertions))
  .then(() => {
    reportOk();
  })
  .catch((error) => {
    reportError(error, 'unexpected runtime error');
  });
