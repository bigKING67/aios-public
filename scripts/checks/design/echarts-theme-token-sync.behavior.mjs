#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runEchartsThemeTokenSyncBehaviorFixtures,
} from '../../lib/design/echarts-theme-token-sync-behavior-fixtures.mjs';

const assertions = createCheckGuard('echarts-theme-token-sync-behavior');
const {
  reportOk,
} = assertions;

runEchartsThemeTokenSyncBehaviorFixtures(assertions);

reportOk(
  'pass, series drift, semantic drift, material drift, registered theme raw color, and theme layering checks passed.',
);
