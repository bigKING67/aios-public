#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runEchartsCssTokenSyncBehaviorFixtures,
} from '../../lib/design/echarts-css-token-sync-behavior-fixtures.mjs';

const assertions = createCheckGuard('echarts-css-token-sync-behavior');
const {
  reportOk,
} = assertions;

runEchartsCssTokenSyncBehaviorFixtures(assertions);

reportOk(
  'pass, chart fallback drift, highlight alias drift, missing platform fallback, tooltip drift, unexpected fallback, and source drift checks passed.',
);
