import { DEFAULT_ROUTE_SETTLE_POLL_MS, VIEWPORTS } from './constants.mjs';
import { buildRouteUrl } from './config.mjs';
import {
  capturePageSnapshot,
  evaluateSnapshot,
  hasSettleSensitiveFailure,
} from './snapshot.mjs';
import { installFrontendSmokeWebVitals } from './web-vitals.mjs';

export async function tryLoadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return null;
  }
}

async function waitForPlaywrightSnapshot({
  consoleErrors,
  page,
  pageErrors,
  responseStatus,
  routeExpectation,
  settleTimeoutMs,
  viewport,
}) {
  const deadline = Date.now() + settleTimeoutMs;
  let snapshot = await page.evaluate(capturePageSnapshot, routeExpectation.expectedCssVariables);
  let failures = evaluateSnapshot({
    routeExpectation,
    viewport,
    status: responseStatus,
    consoleErrors,
    pageErrors,
    snapshot,
  });

  while (hasSettleSensitiveFailure(failures) && Date.now() < deadline) {
    await page.waitForTimeout(DEFAULT_ROUTE_SETTLE_POLL_MS);
    snapshot = await page.evaluate(capturePageSnapshot, routeExpectation.expectedCssVariables);
    failures = evaluateSnapshot({
      routeExpectation,
      viewport,
      status: responseStatus,
      consoleErrors,
      pageErrors,
      snapshot,
    });
  }

  return { failures, snapshot };
}

async function runPlaywrightInteractionProbe(page, routeExpectation, timeoutMs) {
  const selector = routeExpectation.performanceInteractionSelector;
  if (!selector) {
    return null;
  }

  await page.evaluate((probeSelector) => {
    if (window.__frontendSmokeWebVitals) {
      window.__frontendSmokeWebVitals.interactionProbeAttempted = true;
      window.__frontendSmokeWebVitals.interactionProbeSelector = probeSelector;
    }
  }, selector);

  try {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible', timeout: timeoutMs });
    await target.click({ timeout: timeoutMs });
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      if (window.__frontendSmokeWebVitals) {
        window.__frontendSmokeWebVitals.interactionProbeCompleted = true;
      }
    });
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `interaction probe ${JSON.stringify(selector)} failed: ${detail}`;
  }
}

export async function runWithPlaywright(playwright, options) {
  const browser = await playwright.chromium.launch({ headless: true });
  const results = [];
  const failures = [];

  try {
    for (const viewport of VIEWPORTS) {
      for (const routeExpectation of options.routeExpectations) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.mobile,
        });
        if (options.cookies.length > 0) {
          await context.addCookies(options.cookies.map((cookie) => ({
            ...cookie,
            url: options.baseUrl,
          })));
        }

        try {
          const page = await context.newPage();
          const pageErrors = [];
          const consoleErrors = [];
          page.on('pageerror', (error) => {
            pageErrors.push(error.message);
          });
          page.on('console', (message) => {
            if (message.type() === 'error') {
              consoleErrors.push(message.text());
            }
          });
          await page.addInitScript(installFrontendSmokeWebVitals);
          await page.addInitScript((expectedCssVariables) => {
            window.__frontendSmokeExpectedCssVariables = expectedCssVariables;
          }, routeExpectation.expectedCssVariables);

          const targetUrl = buildRouteUrl(options.baseUrl, routeExpectation.path);
          const response = await page.goto(targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: options.timeoutMs,
          });
          await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
          const interactionFailure = await runPlaywrightInteractionProbe(
            page,
            routeExpectation,
            routeExpectation.settleTimeoutMs ?? options.settleTimeoutMs,
          );
          const { snapshot, failures: routeFailures } = await waitForPlaywrightSnapshot({
            consoleErrors,
            page,
            pageErrors,
            responseStatus: response?.status() ?? 0,
            routeExpectation,
            settleTimeoutMs: routeExpectation.settleTimeoutMs ?? options.settleTimeoutMs,
            viewport,
          });
          await page.close();

          if (interactionFailure) {
            routeFailures.push(`${viewport.name} ${routeExpectation.path}: ${interactionFailure}`);
          }
          failures.push(...routeFailures);
          results.push({
            route: routeExpectation.path,
            viewport: viewport.name,
            status: response?.status() ?? 0,
            finalUrl: snapshot.locationHref,
            title: snapshot.title,
            bodyTextLength: snapshot.bodyTextLength,
            horizontalOverflow: snapshot.horizontalOverflow,
            performance: snapshot.performance,
            consoleErrorCount: consoleErrors.length,
            pageErrorCount: pageErrors.length,
          });
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  return { engine: 'playwright', failures, results };
}
