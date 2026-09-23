#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runRoutePolicyRegistryStructureBehaviorFixtures,
} from '../../lib/frontend/route-policy-registry-structure-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('route-policy-registry-structure-behavior');

const message = runRoutePolicyRegistryStructureBehaviorFixtures(assertions);
reportOk(message);
