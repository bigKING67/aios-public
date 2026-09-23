#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runRawColorsBehaviorFixtures,
} from '../../lib/design/raw-colors-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('raw-color-audits-behavior');

const message = runRawColorsBehaviorFixtures(assertions);
reportOk(message);
