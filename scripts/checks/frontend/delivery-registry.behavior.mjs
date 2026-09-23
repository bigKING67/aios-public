#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runFrontendDeliveryRegistryBehaviorFixtures,
} from '../../lib/frontend/frontend-delivery-registry-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('frontend-delivery-gate-registry-behavior');

const message = runFrontendDeliveryRegistryBehaviorFixtures(assertions);
reportOk(message);
