#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendPermissionPolicyBehaviorFixtures,
} from '../../lib/frontend/frontend-permission-policy-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('frontend-permission-policy-behavior');

const message = await runFrontendPermissionPolicyBehaviorFixtures(assertions);
reportOk(message);
