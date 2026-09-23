#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runTrellisSpecCompactBehaviorFixtures,
} from '../../lib/repo/trellis-spec-compact-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('trellis-spec-compact-behavior');

const message = runTrellisSpecCompactBehaviorFixtures(assertions);
reportOk(message);
