#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendCoverageRatchetBehaviorFixtures,
} from '../../lib/frontend/frontend-coverage-ratchet-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('frontend-coverage-ratchet-behavior');

reportOk(runFrontendCoverageRatchetBehaviorFixtures(assertions));
