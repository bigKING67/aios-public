#!/usr/bin/env node

import {
  runSpecialReportBrowserVisualSmoke,
} from '../../lib/reports/special-report-browser-visual-smoke.mjs';
import {
  printSpecialReportBrowserVisualSmokeSummary,
} from '../../lib/reports/special-report-browser-visual-smoke-summary.mjs';
import {
  writeSpecialReportBrowserSmokeEvidence,
} from '../../lib/reports/special-report-browser-smoke-evidence.mjs';

try {
  const result = await runSpecialReportBrowserVisualSmoke();
  writeSpecialReportBrowserSmokeEvidence(result);
  printSpecialReportBrowserVisualSmokeSummary(result);
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[special-report-browser-smoke] failed to run: ${detail}`);
  process.exitCode = 1;
}
