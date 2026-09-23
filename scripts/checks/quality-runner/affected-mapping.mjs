#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  buildQualityGateRegistry,
} from '../../lib/quality/quality-gate-registry.mjs';
import {
  assertDeployAffectedMapping,
} from './affected-mapping-deploy-fixtures.mjs';
import {
  assertCacheAffectedMapping,
} from './affected-mapping-cache-fixtures.mjs';
import {
  assertSchedulerAndPreflightAffectedMapping,
} from './affected-mapping-scheduler-fixtures.mjs';
import {
  assertFrontendDeliveryAffectedMapping,
} from './affected-mapping-frontend-delivery-fixtures.mjs';
import {
  assertPackageDiffAffectedMapping,
} from './affected-mapping-package-fixtures.mjs';
import {
  assertFallbackAffectedMapping,
} from './affected-mapping-fallback-fixtures.mjs';
import {
  assertWeeklyAffectedMapping,
} from './affected-mapping-weekly-fixtures.mjs';
import {
  assertFrontendStructureAndDesignAffectedMapping,
} from './affected-mapping-frontend-structure-fixtures.mjs';
import {
  assertCreatorFollowLogAffectedMapping,
} from './affected-mapping-creator-follow-log-fixtures.mjs';
import {
  assertQualityRunnerCoreAffectedMapping,
} from './affected-mapping-runner-core-fixtures.mjs';
import {
  assertSourceBoundaryAffectedMapping,
} from './affected-mapping-source-boundary-fixtures.mjs';
import {
  assertRepoConfigAffectedMapping,
} from './affected-mapping-repo-config-fixtures.mjs';

const {
  assertEqual,
  assertFalse,
  assertTrue,
  reportOk,
} = createCheckGuard('quality-runner-affected-mapping-behavior');

function assertIncludesAll(names, expected, message) {
  for (const name of expected) {
    assertTrue(names.includes(name), `${message}: ${name}`);
  }
}

function assertExcludesAll(names, expected, message) {
  for (const name of expected) {
    assertFalse(names.includes(name), `${message}: ${name}`);
  }
}

export function runQualityRunnerAffectedMappingBehaviorCheck() {
  const registry = buildQualityGateRegistry({ repoRoot: process.cwd() });
  assertSourceBoundaryAffectedMapping({
    assertEqual,
    assertFalse,
    assertTrue,
    registry,
  });

  assertCacheAffectedMapping({
    assertExcludesAll,
    assertFalse,
    assertIncludesAll,
    assertTrue,
    registry,
  });

  assertQualityRunnerCoreAffectedMapping({
    assertExcludesAll,
    assertFalse,
    assertIncludesAll,
    assertTrue,
    registry,
  });

  assertSchedulerAndPreflightAffectedMapping({
    assertFalse,
    assertIncludesAll,
    assertTrue,
    registry,
  });

  assertRepoConfigAffectedMapping({
    assertEqual,
    assertExcludesAll,
    assertFalse,
    assertIncludesAll,
    assertTrue,
    registry,
  });

  assertFrontendDeliveryAffectedMapping({
    assertFalse,
    assertTrue,
    registry,
  });

  assertCreatorFollowLogAffectedMapping({
    assertFalse,
    assertTrue,
    registry,
  });

  assertFrontendStructureAndDesignAffectedMapping({
    assertFalse,
    assertTrue,
    registry,
  });

  assertWeeklyAffectedMapping({
    assertFalse,
    assertTrue,
    registry,
  });

  assertPackageDiffAffectedMapping({
    assertEqual,
    assertFalse,
    assertTrue,
    registry,
  });

  assertFallbackAffectedMapping({
    assertEqual,
    assertFalse,
    assertTrue,
    registry,
  });

  assertDeployAffectedMapping({
    assertFalse,
    assertIncludesAll,
    assertTrue,
    registry,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerAffectedMappingBehaviorCheck();
  reportOk('affected mapping matrix, script-only package diff, and changed-files env checks passed.');
}
