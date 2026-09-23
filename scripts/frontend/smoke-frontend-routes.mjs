#!/usr/bin/env node

/**
 * Browser-level frontend route smoke test.
 *
 * The CLI stays intentionally thin. Reusable parsing, snapshot, browser, and
 * runner logic lives under scripts/lib/frontend/smoke/ so quality gates can
 * test behavior without coupling to one large executable file.
 */

import { pathToFileURL } from 'node:url';

export {
  buildRouteUrl,
  normalizeBaseUrl,
  normalizeRoutePath,
  parseIntegerEnv,
  parseRouteExpectations,
  parseSmokeCookieHeader,
  readSmokeCookiesFromEnv,
  validateSmokeAuthProfileConfig,
} from '../lib/frontend/smoke/config.mjs';
export { fetchWithTimeout, sleep } from '../lib/frontend/smoke/http.mjs';
export {
  capturePageSnapshot,
  evaluateSnapshot,
  formatFailureList,
  hasSettleSensitiveFailure,
} from '../lib/frontend/smoke/snapshot.mjs';
export {
  buildFrontendSmokeHistoryRecord,
  renderFrontendSmokeMarkdownReport,
  writeFrontendSmokeEvidence,
  writeFrontendSmokeHistoryRecord,
  writeFrontendSmokeMarkdownReport,
} from '../lib/frontend/smoke/history.mjs';
export { runWithPlaywright, tryLoadPlaywright } from '../lib/frontend/smoke/playwright-engine.mjs';
export { runWithChromeCdp } from '../lib/frontend/smoke/chrome-cdp-engine.mjs';
export {
  assertAuthenticatedSession,
  assertFrontendServiceReachable,
  printSummary,
  runFrontendSmoke,
  validateAuthenticatedSessionPayload,
} from '../lib/frontend/smoke/runner.mjs';

import { runFrontendSmoke } from '../lib/frontend/smoke/runner.mjs';

const isCliEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCliEntrypoint) {
  runFrontendSmoke().catch((error) => {
    console.error('[frontend-smoke] failed before route checks:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
