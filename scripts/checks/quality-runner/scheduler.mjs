#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runQualityRunnerSchedulerCacheBypassBehaviorCheck,
} from './scheduler-cache-bypass.mjs';
import {
  runQualityRunnerSchedulerConcurrencyBehaviorCheck,
} from './scheduler-concurrency.mjs';
import {
  runQualityRunnerSchedulerEnvBehaviorCheck,
} from './scheduler-env.mjs';
import {
  runQualityRunnerSchedulerLocalBinBehaviorCheck,
} from './scheduler-local-bin.mjs';
import {
  runQualityRunnerSchedulerShellBehaviorCheck,
} from './scheduler-shell.mjs';

const { reportOk } = createCheckGuard('quality-runner-scheduler-compatibility');

export async function runQualityRunnerSchedulerCompatibilityCheck(options = {}) {
  await runQualityRunnerSchedulerEnvBehaviorCheck();
  runQualityRunnerSchedulerShellBehaviorCheck(options);
  await runQualityRunnerSchedulerLocalBinBehaviorCheck();
  await runQualityRunnerSchedulerConcurrencyBehaviorCheck();
  await runQualityRunnerSchedulerCacheBypassBehaviorCheck();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerSchedulerCompatibilityCheck();
  reportOk('env, shell fast path, local bin, concurrency, and cached-slot compatibility checks passed.');
}
