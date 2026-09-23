#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendSmokeBehaviorFixtures,
} from '../../lib/frontend/smoke/behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('frontend-smoke-behavior');

const message = await runFrontendSmokeBehaviorFixtures(assertions);
reportOk(message);
