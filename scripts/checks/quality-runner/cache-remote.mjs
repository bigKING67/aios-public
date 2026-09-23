#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runQualityRunnerCacheRemoteArtifactBehaviorCheck,
} from './cache-remote-artifact.mjs';
import {
  runQualityRunnerCacheRemoteConfigBehaviorCheck,
} from './cache-remote-config.mjs';
import {
  runQualityRunnerCacheRemoteRepairBehaviorCheck,
} from './cache-remote-repair.mjs';
import {
  runQualityRunnerCacheRemoteResultBehaviorCheck,
} from './cache-remote-result.mjs';
import {
  runQualityRunnerCacheRemoteStatsBehaviorCheck,
} from './cache-remote-stats.mjs';

const { reportOk } = createCheckGuard('quality-runner-cache-remote-compatibility');

export async function runQualityRunnerCacheRemoteCompatibilityCheck() {
  runQualityRunnerCacheRemoteConfigBehaviorCheck();
  await runQualityRunnerCacheRemoteResultBehaviorCheck();
  runQualityRunnerCacheRemoteStatsBehaviorCheck();
  await runQualityRunnerCacheRemoteRepairBehaviorCheck();
  await runQualityRunnerCacheRemoteArtifactBehaviorCheck();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerCacheRemoteCompatibilityCheck();
  reportOk('remote config, result, stats, repair, and artifact compatibility checks passed.');
}
