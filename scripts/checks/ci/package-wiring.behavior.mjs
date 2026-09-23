#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  PACKAGE_WIRING_BEHAVIOR_GUARD_NAME,
} from '../../lib/ci/package-wiring-core.mjs';
import {
  runPackageWiringBehaviorFixtures,
} from '../../lib/ci/package-wiring-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard(PACKAGE_WIRING_BEHAVIOR_GUARD_NAME);

const message = runPackageWiringBehaviorFixtures(assertions);
reportOk(message);
