#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendStructureRegistryBehaviorFixtures,
} from '../../lib/frontend/frontend-structure-gate-registry-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('frontend-structure-gate-registry-behavior');

const message = runFrontendStructureRegistryBehaviorFixtures(assertions);
reportOk(message);
