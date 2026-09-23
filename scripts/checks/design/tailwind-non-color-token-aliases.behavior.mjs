#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runTailwindNonColorTokenAliasBehaviorFixtures,
} from '../../lib/design/tailwind-non-color-token-aliases-behavior-fixtures.mjs';

const guard = createCheckGuard('tailwind-non-color-token-aliases-behavior');
const {
  reportError,
  reportOk,
} = guard;

try {
  const message = runTailwindNonColorTokenAliasBehaviorFixtures(guard);
  reportOk(message);
} catch (error) {
  reportError(error, 'unexpected runtime error');
}
