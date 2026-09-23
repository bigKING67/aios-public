#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  DESIGN_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_GUARD_NAME,
} from '../../lib/design/design-behavior-guard-quality-core.mjs';
import {
  runDesignBehaviorGuardQualityBehaviorFixtures,
} from '../../lib/design/design-behavior-guard-quality-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard(DESIGN_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_GUARD_NAME);

const message = runDesignBehaviorGuardQualityBehaviorFixtures(assertions);
reportOk(message);
