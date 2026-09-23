#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runAuthSessionRecoveryBehaviorFixtures,
} from '../../lib/frontend/auth-session-recovery-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('auth-session-recovery-behavior');

const message = await runAuthSessionRecoveryBehaviorFixtures(assertions);
reportOk(message);
