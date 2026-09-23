#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runGateFixtureUtilsBehaviorFixtures,
} from '../../lib/shared/gate-fixture-utils-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('gate-fixture-utils-behavior');

const message = runGateFixtureUtilsBehaviorFixtures(assertions);
reportOk(message);
