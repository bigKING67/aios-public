#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendReportApiContractBehaviorFixtures,
} from '../../lib/frontend/frontend-report-api-contract-behavior-fixtures.mjs';

const guard = createCheckGuard('frontend-report-api-contract-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runFrontendReportApiContractBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
