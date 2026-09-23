#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { runAiosApiContractBehaviorFixtures } from '../../lib/contracts/aios-api-contract-behavior-fixtures.mjs';

const { reportOk, ...assertions } = createCheckGuard('aios-api-contract-behavior');
reportOk(runAiosApiContractBehaviorFixtures(assertions));
