#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runAuthNavigationPolicyBehaviorFixtures,
} from '../../lib/frontend/auth-navigation-policy-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('auth-navigation-policy-behavior');

const message = await runAuthNavigationPolicyBehaviorFixtures(assertions);
reportOk(message);
