#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runAppPageSizeBehaviorFixtures,
} from '../../lib/frontend/app-page-size-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('app-page-size-behavior');

const message = runAppPageSizeBehaviorFixtures(assertions);
reportOk(message);
