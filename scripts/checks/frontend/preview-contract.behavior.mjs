#!/usr/bin/env node

import {
  createCheckGuard,
} from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendPreviewContractBehaviorFixtures,
} from '../../lib/frontend/frontend-preview-contract-behavior-fixtures.mjs';

const guard = createCheckGuard('frontend-preview-contract-behavior');
const summary = runFrontendPreviewContractBehaviorFixtures(guard);
guard.reportOk(summary);
