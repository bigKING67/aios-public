#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendComponentSizeBehaviorFixtures,
} from '../../lib/frontend/frontend-component-size-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('frontend-component-size-behavior');

const message = runFrontendComponentSizeBehaviorFixtures(assertions);
reportOk(message);
