#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runWeeklyBoundaryGateRegistryBehaviorFixtures,
} from '../../fixtures/weekly/boundary-gate-registry.behavior-fixtures.mjs';

const assertions = createCheckGuard('weekly-tabs-boundary-gate-registry-behavior');

const message = runWeeklyBoundaryGateRegistryBehaviorFixtures(assertions);
assertions.reportOk(message);
