#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runQualityRunnerAffectedRuntimeEnvBehaviorCheck,
} from './affected-runtime-env.mjs';
import {
  runQualityRunnerAffectedRuntimeStatusBehaviorCheck,
} from './affected-runtime-status.mjs';

const { reportOk } = createCheckGuard('quality-runner-affected-runtime-compatibility');

export async function runQualityRunnerAffectedRuntimeCompatibilityCheck() {
  runQualityRunnerAffectedRuntimeStatusBehaviorCheck();
  await runQualityRunnerAffectedRuntimeEnvBehaviorCheck();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerAffectedRuntimeCompatibilityCheck();
  reportOk('git changed-file status and runtime changed-file env compatibility checks passed.');
}
