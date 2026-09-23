#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendDesignEvolutionBehaviorFixtures,
} from '../../lib/frontend/frontend-design-evolution-behavior-fixtures.mjs';

const assertions = createCheckGuard('frontend-design-evolution-behavior');
const { reportOk } = assertions;

const message = runFrontendDesignEvolutionBehaviorFixtures(assertions);
reportOk(message);
