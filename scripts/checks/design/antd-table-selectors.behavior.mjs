#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runDesignAntdTableSelectorBehaviorFixtures,
} from '../../fixtures/design/antd-table-selectors.behavior-fixtures.mjs';

const { reportOk, ...assertions } = createCheckGuard(
  'antd-table-selector-audit-behavior',
);

const message = runDesignAntdTableSelectorBehaviorFixtures(assertions);
reportOk(message);
