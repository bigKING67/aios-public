#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runTailwindTokenAliasesBehaviorFixtures,
} from '../../lib/design/tailwind-token-aliases-behavior-fixtures.mjs';

const guard = createCheckGuard('tailwind-token-aliases-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runTailwindTokenAliasesBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
