#!/usr/bin/env node

/**
 * Generic check guard utility behavior guard.
 *
 * Keep shared line-location helpers directly covered so registry guards do not
 * rely only on indirect fixture failures for exact-line semantics.
 */

import {
  createCheckGuard,
} from '../../lib/shared/guard-utils.mjs';
import {
  runGuardUtilsBehaviorFixtures,
} from '../../lib/shared/guard-utils-behavior-fixtures.mjs';

const assertions = createCheckGuard('check-guard-utils-behavior');
const {
  reportOk,
} = assertions;

runGuardUtilsBehaviorFixtures(assertions);

reportOk('exact-line, verify:ci run-label, quality-runner wrapper, and gate run order helper cases passed.');
