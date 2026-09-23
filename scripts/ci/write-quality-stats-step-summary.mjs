#!/usr/bin/env node

import {
  writeQualityStatsStepSummary,
} from '../lib/ci/quality-stats-step-summary.mjs';

try {
  writeQualityStatsStepSummary();
} catch (error) {
  console.error(`[quality-stats-step-summary] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
