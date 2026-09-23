#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runQualityRunnerCacheKeyDigestBehaviorCheck,
} from './cache-key-digest.mjs';
import {
  runQualityRunnerCacheKeyEnvBehaviorCheck,
} from './cache-key-env.mjs';
import {
  runQualityRunnerCacheKeyToolVersionBehaviorCheck,
} from './cache-key-tool-version.mjs';

const { reportOk } = createCheckGuard('quality-runner-cache-key-compatibility');

export function runQualityRunnerCacheKeyCompatibilityCheck() {
  runQualityRunnerCacheKeyDigestBehaviorCheck();
  runQualityRunnerCacheKeyEnvBehaviorCheck();
  runQualityRunnerCacheKeyToolVersionBehaviorCheck();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerCacheKeyCompatibilityCheck();
  reportOk('digest, env, and process tool-version compatibility checks passed.');
}
