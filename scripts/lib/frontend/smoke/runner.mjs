import {
  DEFAULT_ROUTE_SETTLE_TIMEOUT_MS,
  DEFAULT_SESSION_CHECK_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
} from './constants.mjs';
import {
  normalizeBaseUrl,
  parseIntegerEnv,
  parseRouteExpectations,
  readSmokeCookiesFromEnv,
  validateSmokeAuthProfileConfig,
} from './config.mjs';
import { fetchWithTimeout } from './http.mjs';
import { runWithChromeCdp } from './chrome-cdp-engine.mjs';
import { formatFailureList } from './snapshot.mjs';
import { writeFrontendSmokeEvidence } from './history.mjs';
import { runWithPlaywright, tryLoadPlaywright } from './playwright-engine.mjs';

export function validateAuthenticatedSessionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Authenticated smoke session check failed: /v1/auth/session/me did not return a JSON object.');
  }
  if (!payload.user || typeof payload.user !== 'object' || Array.isArray(payload.user)) {
    throw new Error('Authenticated smoke session check failed: /v1/auth/session/me did not return a user.');
  }
}

export async function assertAuthenticatedSession(baseUrl, rawCookieHeader) {
  const sessionUrl = new URL('/v1/auth/session/me', baseUrl).toString();
  let response;
  try {
    response = await fetchWithTimeout(sessionUrl, DEFAULT_SESSION_CHECK_TIMEOUT_MS, {
      headers: {
        Cookie: rawCookieHeader,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Authenticated smoke session check failed: /v1/auth/session/me was not reachable (${detail}).`);
  }

  if (response.status !== 200) {
    throw new Error(`Authenticated smoke session check failed: /v1/auth/session/me returned HTTP ${response.status}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Authenticated smoke session check failed: /v1/auth/session/me did not return valid JSON.');
  }

  validateAuthenticatedSessionPayload(payload);
}

export async function assertFrontendServiceReachable(baseUrl) {
  try {
    const response = await fetchWithTimeout(baseUrl, 3_000);
    if (response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Frontend service is not reachable at ${baseUrl}.`,
        `Observed failure: ${detail}`,
        '',
        'Start an existing local frontend service first, then rerun:',
        '  npm run dev',
        'or for a production-preview path:',
        '  npm run build && npm run start',
        '',
        'Override the target when needed:',
        '  FRONTEND_SMOKE_BASE_URL=http://localhost:<port> npm run test:frontend:smoke',
      ].join('\n'),
    );
  }
}

export function printSummary({ baseUrl, engine, results, failures }) {
  console.log(`[frontend-smoke] base_url=${baseUrl}`);
  console.log(`[frontend-smoke] engine=${engine}`);
  console.log(`[frontend-smoke] checked=${results.length}`);

  for (const result of results) {
    const overflow = result.horizontalOverflow ? ' overflow=warn' : '';
    const consoleErrors = result.consoleErrorCount ? ` console_errors=${result.consoleErrorCount}` : '';
    const lcp = Number.isFinite(result.performance?.lcpMs) ? `${result.performance.lcpMs}ms` : 'n/a';
    const inp = Number.isFinite(result.performance?.inpMs) ? `${result.performance.inpMs}ms` : 'n/a';
    const performance = result.performance
      ? ` lcp=${lcp} inp=${inp} cls=${result.performance.cls ?? 'n/a'} dcl=${result.performance.domContentLoadedMs ?? 'n/a'}ms load=${result.performance.loadMs ?? 'n/a'}ms transfer=${result.performance.resourceTransferKb ?? 'n/a'}kB resources=${result.performance.resourceCount ?? 'n/a'} dom_nodes=${result.performance.domNodeCount ?? 'n/a'}`
      : '';
    console.log(
      `[frontend-smoke] ok ${result.viewport} ${result.route} status=${result.status} chars=${result.bodyTextLength}${overflow}${consoleErrors}${performance} final=${result.finalUrl}`,
    );
  }

  const overflowWarnings = results.filter((result) => result.horizontalOverflow);
  if (overflowWarnings.length > 0) {
    console.warn('[frontend-smoke] horizontal overflow warnings:');
    for (const warning of overflowWarnings) {
      console.warn(`- ${warning.viewport} ${warning.route}: document scrollWidth exceeds viewport width.`);
    }
  }

  if (failures.length > 0) {
    console.error('[frontend-smoke] failed:');
    console.error(formatFailureList(failures));
    process.exit(1);
  }

  console.log('[frontend-smoke] passed');
}

export async function runFrontendSmoke({
  assertAuthenticatedSessionImpl = assertAuthenticatedSession,
  assertFrontendServiceReachableImpl = assertFrontendServiceReachable,
  runWithChromeCdpImpl = runWithChromeCdp,
  runWithPlaywrightImpl = runWithPlaywright,
  printSummaryImpl = printSummary,
  tryLoadPlaywrightImpl = tryLoadPlaywright,
  writeFrontendSmokeEvidenceImpl = writeFrontendSmokeEvidence,
} = {}) {
  const baseUrl = normalizeBaseUrl(process.env.FRONTEND_SMOKE_BASE_URL);
  const routeExpectations = parseRouteExpectations();
  const cookies = readSmokeCookiesFromEnv();
  const authProfileConfig = validateSmokeAuthProfileConfig();
  const timeoutMs = parseIntegerEnv('FRONTEND_SMOKE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const settleTimeoutMs = parseIntegerEnv(
    'FRONTEND_SMOKE_SETTLE_TIMEOUT_MS',
    DEFAULT_ROUTE_SETTLE_TIMEOUT_MS,
  );

  await assertFrontendServiceReachableImpl(baseUrl);
  if (authProfileConfig.enabled) {
    await assertAuthenticatedSessionImpl(baseUrl, authProfileConfig.rawCookieHeader);
  }

  const playwright = await tryLoadPlaywrightImpl();
  const result = playwright
    ? await runWithPlaywrightImpl(playwright, { baseUrl, cookies, routeExpectations, settleTimeoutMs, timeoutMs })
    : await runWithChromeCdpImpl({ baseUrl, cookies, routeExpectations, settleTimeoutMs, timeoutMs });

  writeFrontendSmokeEvidenceImpl({
    baseUrl,
    engine: result.engine,
    failures: result.failures,
    historyJsonl: process.env.FRONTEND_SMOKE_HISTORY_JSONL,
    reportMd: process.env.FRONTEND_SMOKE_REPORT_MD,
    results: result.results,
  });

  printSummaryImpl({ baseUrl, ...result });
}
