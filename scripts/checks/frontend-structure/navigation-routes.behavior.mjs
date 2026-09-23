#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendNavigationRoutesBehaviorFixtures,
} from '../../lib/frontend/frontend-navigation-routes-behavior-fixtures.mjs';

const assertions = createCheckGuard('navigation-route-registry-behavior');

runFrontendNavigationRoutesBehaviorFixtures(assertions);

assertions.reportOk('pass, JSX/object/static navigate, and login redirect drift checks passed.');
