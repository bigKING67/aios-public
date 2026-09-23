#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runQualityRunnerAffectedMappingBehaviorCheck,
} from './affected-mapping.mjs';
import {
  runQualityRunnerAffectedModeBehaviorCheck,
} from './affected-mode.mjs';
import {
  runQualityRunnerAffectedExplainBehaviorCheck,
} from './affected-explain.mjs';
import {
  runQualityRunnerAffectedRuntimeCompatibilityCheck,
} from './affected-runtime.mjs';
import {
  runQualityRunnerAffectedFilesBehaviorCheck,
} from './affected-files.mjs';
import {
  runQualityRunnerPrepushBehaviorCheck,
} from './prepush.mjs';

const { reportOk } = createCheckGuard('quality-runner-affected-compatibility');

export async function runQualityRunnerAffectedCompatibilityCheck() {
  runQualityRunnerAffectedMappingBehaviorCheck();
  await runQualityRunnerAffectedModeBehaviorCheck();
  runQualityRunnerAffectedExplainBehaviorCheck();
  await runQualityRunnerAffectedRuntimeCompatibilityCheck();
  await runQualityRunnerAffectedFilesBehaviorCheck();
  runQualityRunnerPrepushBehaviorCheck();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runQualityRunnerAffectedCompatibilityCheck();
  reportOk('affected mapping, mode, explain, runtime, affected files, and prepush compatibility checks passed.');
}
