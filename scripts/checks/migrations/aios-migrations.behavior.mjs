#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { runAiosMigrationBehaviorFixtures } from '../../lib/migrations/aios-migration-behavior-fixtures.mjs';

const { reportOk, ...assertions } = createCheckGuard('aios-migrations-behavior');
reportOk(await runAiosMigrationBehaviorFixtures(assertions));
