#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runViteRoutePathsBehaviorFixtures,
} from '../../lib/frontend/vite-route-paths-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('vite-route-paths-behavior');

const message = runViteRoutePathsBehaviorFixtures(assertions);
reportOk(message);
