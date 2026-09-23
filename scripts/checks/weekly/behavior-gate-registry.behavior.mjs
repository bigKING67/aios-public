#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runWeeklyBehaviorGateRegistryBehaviorFixtures,
} from '../../fixtures/weekly/behavior-gate-registry.behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('weekly-behavior-gate-registry-behavior');

const message = runWeeklyBehaviorGateRegistryBehaviorFixtures(assertions);
reportOk(message);
