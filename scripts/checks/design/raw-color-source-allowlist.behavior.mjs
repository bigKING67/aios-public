#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runRawColorSourceAllowlistBehaviorFixtures,
} from '../../lib/design/raw-color-source-allowlist-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('raw-color-source-allowlist-behavior');

const message = runRawColorSourceAllowlistBehaviorFixtures(assertions);
reportOk(message);
