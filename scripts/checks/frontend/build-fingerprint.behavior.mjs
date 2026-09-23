#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendBuildFingerprintBehaviorFixtures,
} from '../../lib/frontend/frontend-build-fingerprint-behavior-fixtures.mjs';

const { reportOk, ...assertions } = createCheckGuard(
  'frontend-build-fingerprint-behavior',
);

const message = runFrontendBuildFingerprintBehaviorFixtures(assertions);
reportOk(message);
