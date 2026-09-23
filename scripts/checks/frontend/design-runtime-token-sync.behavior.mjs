#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runDesignRuntimeTokenSyncBehaviorFixtures,
} from '../../lib/design/design-runtime-token-sync-behavior-fixtures.mjs';

const { reportOk, ...assertions } = createCheckGuard(
  'runtime-token-sync-behavior',
);

const message = runDesignRuntimeTokenSyncBehaviorFixtures(assertions);
reportOk(message);
