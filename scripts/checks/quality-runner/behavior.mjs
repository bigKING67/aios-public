#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  parseRequestedSlices,
  runQualityRunnerBehaviorSlices,
  validateQualityRunnerBehaviorDispatch,
} from './behavior-dispatch.mjs';

const { fail, reportOk } = createCheckGuard('quality-runner-behavior');

const dispatchFindings = validateQualityRunnerBehaviorDispatch();
if (dispatchFindings.length > 0) {
  fail([
    'quality-runner behavior dispatch drift was detected:',
    ...dispatchFindings.map((finding) => `- ${finding}`),
  ].join('\n'));
}

const requestedSlices = parseRequestedSlices(process.argv.slice(2));
await runQualityRunnerBehaviorSlices(requestedSlices);

const scopeLabel = requestedSlices.size > 0
  ? [...requestedSlices].sort().join(',')
  : 'all';
reportOk(`slices=${scopeLabel}: requested quality-runner self-check slices passed.`);
