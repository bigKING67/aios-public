#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runRetiredFrontendLeftoversBehaviorFixtures,
} from '../../lib/frontend/retired-frontend-leftovers-behavior-fixtures.mjs';

const { reportOk, ...assertions } = createCheckGuard(
  'retired-frontend-leftovers-behavior',
);

const message = runRetiredFrontendLeftoversBehaviorFixtures(assertions);
reportOk(message);
