#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runDesignBehaviorGateRegistryBehaviorFixtures,
} from '../../lib/design/design-behavior-gate-registry-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('design-behavior-gate-registry-behavior');

const message = runDesignBehaviorGateRegistryBehaviorFixtures(assertions);
reportOk(message);
