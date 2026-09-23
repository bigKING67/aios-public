#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runTailwindUtilityColorsBehaviorFixtures,
} from '../../lib/design/tailwind-utility-colors-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('tailwind-utility-colors-behavior');

const message = runTailwindUtilityColorsBehaviorFixtures(assertions);
reportOk(message);
