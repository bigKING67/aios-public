#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runViteRouteRegistryBehaviorFixtures,
} from '../../lib/frontend/vite-route-registry-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('vite-route-registry-behavior');

const message = runViteRouteRegistryBehaviorFixtures(assertions);
reportOk(message);
