#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runDesignDocsDriftBehaviorFixtures,
} from '../../lib/design/design-docs-drift-behavior-fixtures.mjs';

const { reportOk, ...assertions } = createCheckGuard(
  'design-docs-drift-behavior',
);

const message = runDesignDocsDriftBehaviorFixtures(assertions);
reportOk(message);
