#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runVpsGitStateRuntimeFixtures,
} from '../../lib/deploy/vps-git-state-behavior-fixtures.mjs';

const { reportOk, ...assertions } = createCheckGuard(
  'vps-git-state-smoke',
);

runVpsGitStateRuntimeFixtures(assertions);
reportOk('VPS Git convergence, dirty/hotfix rejection, and hotfix lifecycle passed.');
