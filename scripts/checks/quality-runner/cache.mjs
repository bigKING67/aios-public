#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runQualityRunnerCacheArtifactBehaviorCheck,
} from './cache-artifact.mjs';
import {
  runQualityRunnerCacheLocalBehaviorCheck,
} from './cache-local.mjs';
import {
  runQualityRunnerCacheKeyCompatibilityCheck,
} from './cache-key.mjs';
import {
  runQualityRunnerCacheRemoteCompatibilityCheck,
} from './cache-remote.mjs';
import {
  runQualityRunnerCacheStatsBehaviorCheck,
} from './cache-stats.mjs';

const { reportOk } = createCheckGuard('quality-runner-cache-compatibility');

export async function runQualityRunnerCacheCompatibilityCheck() {
  await runQualityRunnerCacheStatsBehaviorCheck();
  runQualityRunnerCacheKeyCompatibilityCheck();
  await runQualityRunnerCacheLocalBehaviorCheck();
  await runQualityRunnerCacheArtifactBehaviorCheck();
  await runQualityRunnerCacheRemoteCompatibilityCheck();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerCacheCompatibilityCheck();
  reportOk('cache stats, key identity, local cache, artifact cache, and remote cache compatibility checks passed.');
}
