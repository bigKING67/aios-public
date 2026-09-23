#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runCssModuleSizeBehaviorFixtures,
} from '../../lib/frontend/css-module-size-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('css-module-size-behavior');

const message = runCssModuleSizeBehaviorFixtures(assertions);
reportOk(message);
