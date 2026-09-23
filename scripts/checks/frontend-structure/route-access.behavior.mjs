#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runRouteAccessCoverageBehaviorFixtures,
} from '../../lib/frontend/route-access-coverage-behavior-fixtures.mjs';

const { assertEqual, assertIncludes, reportOk } = createCheckGuard('route-access-coverage-behavior');

runRouteAccessCoverageBehaviorFixtures({ assertEqual, assertIncludes });

reportOk('pass, missing protected coverage, missing public coverage, imported protected client, public-policy drift, and explicit public route checks passed.');
