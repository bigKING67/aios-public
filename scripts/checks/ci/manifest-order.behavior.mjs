#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runVerifyCiManifestOrderBehaviorFixtures,
} from '../../lib/ci/verify-ci-manifest-order-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('verify-ci-manifest-order-behavior');

const message = runVerifyCiManifestOrderBehaviorFixtures(assertions);
reportOk(message);
