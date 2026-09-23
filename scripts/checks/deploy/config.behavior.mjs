#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runDeployConfigBehaviorFixtures,
} from '../../lib/deploy/deploy-config-behavior-fixtures.mjs';

const { reportOk, ...assertions } = createCheckGuard(
  'deploy-config-behavior',
);

const message = runDeployConfigBehaviorFixtures(assertions);
reportOk(message);
