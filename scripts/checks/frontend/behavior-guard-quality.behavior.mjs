#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  FRONTEND_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_GUARD_NAME,
} from '../../lib/frontend/frontend-behavior-guard-quality-core.mjs';
import {
  runFrontendBehaviorGuardQualityBehaviorFixtures,
} from '../../lib/frontend/frontend-behavior-guard-quality-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard(FRONTEND_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_GUARD_NAME);

const message = runFrontendBehaviorGuardQualityBehaviorFixtures(assertions);
reportOk(message);
