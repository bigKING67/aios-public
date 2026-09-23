#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runRepoNamingBehaviorFixtures,
} from '../../lib/repo/repo-naming-behavior-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('repo-naming-behavior');

const message = runRepoNamingBehaviorFixtures(assertions);
reportOk(message);
