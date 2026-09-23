import {
  VIEWPORTS,
} from './constants.mjs';
import { buildRouteUrl } from './config.mjs';
import { fetchWithTimeout, sleep } from './http.mjs';
import {
  CdpClient,
  ensureCdpWebSocketRuntime,
} from './chrome-cdp-client.mjs';
import {
  launchChrome,
} from './chrome-cdp-launcher.mjs';
import {
  waitForCdpSnapshot,
} from './chrome-cdp-snapshot.mjs';
import { installFrontendSmokeWebVitals } from './web-vitals.mjs';

async function installRouteCookies({ baseUrl, client, cookies, sessionId }) {
  if (!cookies || cookies.length === 0) {
    return;
  }

  for (const cookie of cookies) {
    const cookieResult = await client.send('Network.setCookie', {
      name: cookie.name,
      url: baseUrl,
      value: cookie.value,
    }, sessionId);
    if (cookieResult.success !== true) {
      throw new Error(`Failed to install frontend smoke cookie ${cookie.name}.`);
    }
  }
}

async function runCdpInteractionProbe({ client, routeExpectation, sessionId, timeoutMs }) {
  const selector = routeExpectation.performanceInteractionSelector;
  if (!selector) {
    return null;
  }

  const deadline = Date.now() + timeoutMs;
  let targetPoint = null;
  while (!targetPoint && Date.now() < deadline) {
    const evaluated = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
      returnByValue: true,
    }, sessionId);
    targetPoint = evaluated.result?.value ?? null;
    if (!targetPoint) {
      await sleep(100);
    }
  }

  await client.send('Runtime.evaluate', {
    expression: `(() => {
      if (window.__frontendSmokeWebVitals) {
        window.__frontendSmokeWebVitals.interactionProbeAttempted = true;
        window.__frontendSmokeWebVitals.interactionProbeSelector = ${JSON.stringify(selector)};
      }
    })()`,
  }, sessionId);

  if (!targetPoint) {
    return `interaction probe ${JSON.stringify(selector)} did not resolve a visible target`;
  }

  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: targetPoint.x,
    y: targetPoint.y,
  }, sessionId);
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 1,
    clickCount: 1,
    type: 'mousePressed',
    x: targetPoint.x,
    y: targetPoint.y,
  }, sessionId);
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 0,
    clickCount: 1,
    type: 'mouseReleased',
    x: targetPoint.x,
    y: targetPoint.y,
  }, sessionId);
  await sleep(100);
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      if (window.__frontendSmokeWebVitals) {
        window.__frontendSmokeWebVitals.interactionProbeCompleted = true;
      }
    })()`,
  }, sessionId);
  return null;
}

export async function runWithChromeCdp(options) {
  ensureCdpWebSocketRuntime();

  const chrome = await launchChrome();
  const client = new CdpClient(chrome.wsUrl);
  const results = [];
  const failures = [];

  try {
    await client.connect();

    for (const viewport of VIEWPORTS) {
      for (const routeExpectation of options.routeExpectations) {
        const { browserContextId } = await client.send('Target.createBrowserContext');
        const { targetId } = await client.send('Target.createTarget', {
          browserContextId,
          url: 'about:blank',
        });
        const { sessionId } = await client.send('Target.attachToTarget', {
          targetId,
          flatten: true,
        });

        try {
          await client.send('Network.enable', {}, sessionId);
          await installRouteCookies({
            baseUrl: options.baseUrl,
            client,
            cookies: options.cookies,
            sessionId,
          });
          await client.send('Page.enable', {}, sessionId);
          await client.send('Runtime.enable', {}, sessionId);
          await client.send('Page.addScriptToEvaluateOnNewDocument', {
            source: `
              window.__frontendSmokeErrors = [];
              window.addEventListener('error', (event) => {
                window.__frontendSmokeErrors.push(event.message || 'window error');
              });
              window.addEventListener('unhandledrejection', (event) => {
                window.__frontendSmokeErrors.push(String(event.reason || 'unhandled rejection'));
              });
              const originalConsoleError = console.error;
              console.error = (...args) => {
                window.__frontendSmokeConsoleErrors = window.__frontendSmokeConsoleErrors || [];
                window.__frontendSmokeConsoleErrors.push(args.map((arg) => {
                  if (typeof arg === 'string') return arg;
                  try {
                    return JSON.stringify(arg);
                  } catch {
                    return String(arg);
                  }
                }).join(' '));
                originalConsoleError.apply(console, args);
              };
              (${installFrontendSmokeWebVitals.toString()})();
            `,
          }, sessionId);
          await client.send('Emulation.setDeviceMetricsOverride', {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: viewport.mobile ? 3 : 1,
            mobile: viewport.mobile,
          }, sessionId);

          const targetUrl = buildRouteUrl(options.baseUrl, routeExpectation.path);
          const documentResponse = await fetchWithTimeout(targetUrl, options.timeoutMs);
          const loadWaiter = client.waitForEvent('Page.loadEventFired', sessionId, options.timeoutMs);
          const navigation = await client.send('Page.navigate', { url: targetUrl }, sessionId);
          if (navigation.errorText) {
            failures.push(`${viewport.name} ${routeExpectation.path}: navigation failed: ${navigation.errorText}`);
            continue;
          }
          await loadWaiter;
          const interactionFailure = await runCdpInteractionProbe({
            client,
            routeExpectation,
            sessionId,
            timeoutMs: routeExpectation.settleTimeoutMs ?? options.settleTimeoutMs,
          });
          const settledSnapshot = await waitForCdpSnapshot({
            client,
            documentStatus: documentResponse.status,
            routeExpectation,
            sessionId,
            settleTimeoutMs: routeExpectation.settleTimeoutMs ?? options.settleTimeoutMs,
            viewport,
          });
          if (!settledSnapshot.snapshot) {
            failures.push(`${viewport.name} ${routeExpectation.path}: failed to capture browser snapshot.`);
            continue;
          }
          if (interactionFailure) {
            settledSnapshot.failures.push(`${viewport.name} ${routeExpectation.path}: ${interactionFailure}`);
          }
          failures.push(...settledSnapshot.failures);
          results.push({
            route: routeExpectation.path,
            viewport: viewport.name,
            status: documentResponse.status,
            finalUrl: settledSnapshot.snapshot.locationHref,
            title: settledSnapshot.snapshot.title,
            bodyTextLength: settledSnapshot.snapshot.bodyTextLength,
            horizontalOverflow: settledSnapshot.snapshot.horizontalOverflow,
            performance: settledSnapshot.snapshot.performance,
            consoleErrorCount: settledSnapshot.consoleErrors.length,
            pageErrorCount: settledSnapshot.pageErrors.length,
          });
        } finally {
          await client.send('Target.closeTarget', { targetId });
          await client.send('Target.disposeBrowserContext', { browserContextId });
        }
      }
    }
  } finally {
    client.close();
    await chrome.cleanup();
  }

  return {
    engine: `chrome-cdp (${chrome.executable})`,
    failures,
    results,
  };
}
