#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runDesignTokenValuesSyncBehaviorFixtures,
} from '../../lib/design/design-token-values-sync-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('design-token-values-sync-behavior');

const message = runDesignTokenValuesSyncBehaviorFixtures(assertions);
reportOk(message);
