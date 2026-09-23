#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendBundleBudgetBehaviorFixtures,
} from '../../lib/frontend/frontend-bundle-budget-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('frontend-bundle-budget-behavior');

const message = runFrontendBundleBudgetBehaviorFixtures(assertions);
reportOk(message);
