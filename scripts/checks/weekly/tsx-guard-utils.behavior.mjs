#!/usr/bin/env node

import {
  createWeeklyBehaviorGuard,
} from '../../lib/weekly/behavior-assert-utils.mjs';
import {
  runWeeklyTsxGuardUtilsBehaviorFixtures,
} from '../../fixtures/weekly/tsx-guard-utils.behavior-fixtures.mjs';

const GUARD_NAME = 'weekly-tsx-guard-utils-behavior';
const assertions = createWeeklyBehaviorGuard(GUARD_NAME);
const {
  reportError,
  reportOk,
} = assertions;

try {
  runWeeklyTsxGuardUtilsBehaviorFixtures(assertions);
  reportOk();
} catch (error) {
  reportError(error, 'weekly TSX guard utility behavior drift was detected');
}
