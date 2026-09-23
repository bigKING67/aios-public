#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runQualityRunnerCacheArtifactBehaviorFixtures,
} from '../../lib/quality/quality-runner-cache-artifact-fixtures.mjs';

const {
  reportOk,
  ...assertions
} = createCheckGuard('quality-runner-cache-artifact-behavior');

export async function runQualityRunnerCacheArtifactBehaviorCheck() {
  await runQualityRunnerCacheArtifactBehaviorFixtures(assertions);
}

export async function main() {
  await runQualityRunnerCacheArtifactBehaviorCheck();
  reportOk('local artifact manifest/materialization/digest restore passed.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
