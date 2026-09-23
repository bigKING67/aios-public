#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runDesignAntdThemeTokenSyncBehaviorFixtures,
} from '../../fixtures/design/antd-theme-token-sync.behavior-fixtures.mjs';

const assertions = createCheckGuard('antd-theme-token-sync-behavior');
const {
  reportOk,
} = assertions;

runDesignAntdThemeTokenSyncBehaviorFixtures(assertions);
reportOk(
  'pass, helper consumption drift, raw color boundary, root token drift, derived numeric drift, component drift, dark adapter drift, and provider alias drift checks passed.',
);
