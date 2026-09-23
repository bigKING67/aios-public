#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  runQualityRunnerPreflightCacheKeyBehaviorCheck,
} from './preflight-cache-key.mjs';
import {
  runQualityRunnerPreflightCacheWrapperBehaviorCheck,
} from './preflight-cache-wrapper.mjs';

const { reportOk } = createCheckGuard('quality-runner-preflight-cache-compatibility');

export function runQualityRunnerPreflightCacheCompatibilityCheck(options = {}) {
  runQualityRunnerPreflightCacheKeyBehaviorCheck();
  runQualityRunnerPreflightCacheWrapperBehaviorCheck(options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQualityRunnerPreflightCacheCompatibilityCheck();
  reportOk('snapshot keying and wrapper-level cache compatibility checks passed.');
}
