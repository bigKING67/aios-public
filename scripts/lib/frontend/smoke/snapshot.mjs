import { BLOCKED_MINIMAL_TEXTS } from './constants.mjs';

export function capturePageSnapshot(expectedCssVariables = []) {
  function finiteNumber(value) {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  function sizeKb(value) {
    return Number.isFinite(value) ? Number((value / 1024).toFixed(2)) : null;
  }

  function summarizePerformance() {
    const navigation = performance.getEntriesByType('navigation')?.[0] ?? null;
    const resources = performance.getEntriesByType('resource') ?? [];
    const webVitals = window.__frontendSmokeWebVitals ?? null;
    const resourceSummary = resources.reduce((summary, entry) => {
      const transferSize = Number.isFinite(entry.transferSize) ? entry.transferSize : 0;
      summary.resourceTransferBytes += transferSize;
      summary.resourceCount += 1;
      if (entry.initiatorType === 'script') {
        summary.scriptTransferBytes += transferSize;
      }
      if (entry.initiatorType === 'css' || entry.initiatorType === 'link') {
        summary.cssTransferBytes += transferSize;
      }
      if (entry.initiatorType === 'img') {
        summary.imageTransferBytes += transferSize;
      }
      return summary;
    }, {
      cssTransferBytes: 0,
      imageTransferBytes: 0,
      resourceCount: 0,
      resourceTransferBytes: 0,
      scriptTransferBytes: 0,
    });

    return {
      cls: webVitals?.supported?.cls ? finiteNumber(webVitals.cls) : null,
      cssTransferKb: sizeKb(resourceSummary.cssTransferBytes),
      domContentLoadedMs: navigation
        ? finiteNumber(navigation.domContentLoadedEventEnd - navigation.startTime)
        : null,
      domNodeCount: document.querySelectorAll('*').length,
      imageTransferKb: sizeKb(resourceSummary.imageTransferBytes),
      inpEventCount: webVitals?.supported?.inp ? webVitals.inpEventCount : null,
      inpMs: webVitals?.supported?.inp && webVitals.interactionProbeCompleted
        ? finiteNumber(webVitals.inpMs)
        : null,
      inpObserverFloorMs: webVitals?.supported?.inp
        ? finiteNumber(webVitals.inpObserverFloorMs)
        : null,
      interactionProbeCompleted: Boolean(webVitals?.interactionProbeCompleted),
      loadMs: navigation
        ? finiteNumber(navigation.loadEventEnd - navigation.startTime)
        : null,
      lcpMs: webVitals?.supported?.lcp ? finiteNumber(webVitals.lcpMs) : null,
      resourceCount: resourceSummary.resourceCount,
      resourceTransferKb: sizeKb(resourceSummary.resourceTransferBytes),
      responseEndMs: navigation
        ? finiteNumber(navigation.responseEnd - navigation.startTime)
        : null,
      scriptTransferKb: sizeKb(resourceSummary.scriptTransferBytes),
    };
  }

  const root = document.getElementById('root');
  const bodyText = document.body?.innerText?.trim() ?? '';
  const overlay = document.querySelector('vite-error-overlay');
  const documentElement = document.documentElement;
  const rootStyles = window.getComputedStyle(documentElement);
  const cssVariables = {};

  for (const name of expectedCssVariables || []) {
    cssVariables[name] = rootStyles.getPropertyValue(name).trim();
  }

  return {
    bodyText,
    bodyTextLength: bodyText.length,
    bodyTextSample: bodyText.slice(0, 500),
    cssVariables,
    hasRoot: Boolean(root),
    horizontalOverflow:
      documentElement.scrollWidth > documentElement.clientWidth + 2,
    locationHref: window.location.href,
    performance: summarizePerformance(),
    rootChildCount: root?.childElementCount ?? 0,
    title: document.title,
    viteErrorOverlay: Boolean(overlay),
  };
}

function formatMessage(message) {
  const text = typeof message === 'string' ? message : String(message);
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function hasSettleSensitiveFailure(failures) {
  return failures.some((failure) => (
    failure.includes('#root element is missing') ||
    failure.includes('#root rendered no child elements') ||
    failure.includes('body text is too short') ||
    failure.includes('minimal loading/placeholder state') ||
    failure.includes('expected visible text') ||
    failure.includes('expected final path') ||
    failure.includes('final URL search does not include')
  ));
}

function parseFinalUrl(snapshot) {
  try {
    return new URL(snapshot.locationHref);
  } catch {
    return null;
  }
}

const PERFORMANCE_BUDGET_CHECKS = Object.freeze([
  ['maxLcpMs', 'lcpMs', 'largest contentful paint', 'ms'],
  ['maxInpMs', 'inpMs', 'interaction to next paint', 'ms'],
  ['maxCls', 'cls', 'cumulative layout shift', ''],
  ['maxDomContentLoadedMs', 'domContentLoadedMs', 'DOM content loaded', 'ms'],
  ['maxLoadMs', 'loadMs', 'load event', 'ms'],
  ['maxResponseEndMs', 'responseEndMs', 'document response end', 'ms'],
  ['maxResourceTransferKb', 'resourceTransferKb', 'resource transfer', 'kB'],
  ['maxScriptTransferKb', 'scriptTransferKb', 'script transfer', 'kB'],
  ['maxResourceCount', 'resourceCount', 'resource count', ''],
  ['maxDomNodeCount', 'domNodeCount', 'DOM node count', ''],
]);

function evaluatePerformanceBudget({ budget, prefix, snapshot }) {
  const failures = [];
  if (!budget || Object.keys(budget).length === 0) {
    return failures;
  }

  const performanceMetrics = snapshot.performance ?? {};
  for (const [budgetKey, metricKey, label, unit] of PERFORMANCE_BUDGET_CHECKS) {
    const budgetValue = budget[budgetKey];
    if (!Number.isFinite(budgetValue)) {
      continue;
    }
    const actualValue = performanceMetrics[metricKey];
    if (!Number.isFinite(actualValue)) {
      failures.push(`${prefix}: performance budget metric ${metricKey} is unavailable.`);
      continue;
    }
    if (actualValue > budgetValue) {
      const suffix = unit ? unit : '';
      failures.push(`${prefix}: ${label} performance budget exceeded (${actualValue}${suffix} > ${budgetValue}${suffix}).`);
    }
  }

  return failures;
}

export function evaluateSnapshot({ routeExpectation, viewport, status, consoleErrors, pageErrors, snapshot }) {
  const prefix = `${viewport.name} ${routeExpectation.path}`;
  const failures = [];

  if (status < 200 || status >= 400) {
    failures.push(`${prefix}: document request returned HTTP ${status}.`);
  }

  if (!snapshot.hasRoot) {
    failures.push(`${prefix}: #root element is missing.`);
  }

  if (routeExpectation.authState !== 'custom' && snapshot.rootChildCount < 1) {
    failures.push(`${prefix}: #root rendered no child elements.`);
  }

  if (snapshot.bodyTextLength < routeExpectation.minBodyTextLength) {
    failures.push(
      `${prefix}: body text is too short (${snapshot.bodyTextLength} < ${routeExpectation.minBodyTextLength}); sample=${JSON.stringify(snapshot.bodyTextSample)}`,
    );
  }

  if (BLOCKED_MINIMAL_TEXTS.has(snapshot.bodyText.trim())) {
    failures.push(`${prefix}: page appears stuck in a minimal loading/placeholder state: ${JSON.stringify(snapshot.bodyTextSample)}`);
  }

  for (const expectedText of routeExpectation.expectedText) {
    if (!snapshot.bodyText.includes(expectedText)) {
      failures.push(`${prefix}: expected visible text ${JSON.stringify(expectedText)} was not found in page text.`);
    }
  }

  for (const expectedCssVariable of routeExpectation.expectedCssVariables) {
    const value = snapshot.cssVariables?.[expectedCssVariable] ?? '';
    if (!value) {
      failures.push(`${prefix}: expected CSS variable ${expectedCssVariable} is missing or empty on :root.`);
    }
  }

  const finalUrl = parseFinalUrl(snapshot);
  if (!finalUrl) {
    failures.push(`${prefix}: final URL is invalid: ${snapshot.locationHref}`);
  } else {
    if (routeExpectation.expectedFinalPath && finalUrl.pathname !== routeExpectation.expectedFinalPath) {
      failures.push(
        `${prefix}: expected final path ${routeExpectation.expectedFinalPath}, got ${finalUrl.pathname}.`,
      );
    }

    for (const expectedSearch of routeExpectation.expectedFinalSearchIncludes) {
      if (!finalUrl.search.includes(expectedSearch)) {
        failures.push(`${prefix}: final URL search does not include ${JSON.stringify(expectedSearch)}; got ${finalUrl.search || '<empty>'}.`);
      }
    }
  }

  if (snapshot.viteErrorOverlay) {
    failures.push(`${prefix}: Vite error overlay is visible.`);
  }

  failures.push(...evaluatePerformanceBudget({
    budget: routeExpectation.performanceBudget,
    prefix,
    snapshot,
  }));

  for (const pageError of pageErrors) {
    failures.push(`${prefix}: page runtime exception: ${pageError}`);
  }

  if (process.env.FRONTEND_SMOKE_ALLOW_CONSOLE_ERRORS !== '1') {
    for (const consoleError of consoleErrors) {
      failures.push(`${prefix}: console error: ${formatMessage(consoleError)}`);
    }
  }

  return failures;
}

export function formatFailureList(failures) {
  return failures.map((failure) => `- ${failure}`).join('\n');
}
