import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function ensureParentDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function finiteMetric(value) {
  return Number.isFinite(value) ? value : null;
}

function compactUrl(value) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value ?? null;
  }
}

function compactSmokeResult(result) {
  return {
    bodyTextLength: result.bodyTextLength,
    consoleErrorCount: result.consoleErrorCount,
    finalPath: compactUrl(result.finalUrl),
    horizontalOverflow: Boolean(result.horizontalOverflow),
    performance: result.performance
      ? {
        cls: finiteMetric(result.performance.cls),
        cssTransferKb: finiteMetric(result.performance.cssTransferKb),
        domContentLoadedMs: finiteMetric(result.performance.domContentLoadedMs),
        domNodeCount: finiteMetric(result.performance.domNodeCount),
        imageTransferKb: finiteMetric(result.performance.imageTransferKb),
        inpEventCount: finiteMetric(result.performance.inpEventCount),
        inpMs: finiteMetric(result.performance.inpMs),
        inpObserverFloorMs: finiteMetric(result.performance.inpObserverFloorMs),
        interactionProbeCompleted: Boolean(result.performance.interactionProbeCompleted),
        loadMs: finiteMetric(result.performance.loadMs),
        lcpMs: finiteMetric(result.performance.lcpMs),
        resourceCount: finiteMetric(result.performance.resourceCount),
        resourceTransferKb: finiteMetric(result.performance.resourceTransferKb),
        responseEndMs: finiteMetric(result.performance.responseEndMs),
        scriptTransferKb: finiteMetric(result.performance.scriptTransferKb),
      }
      : null,
    route: result.route,
    status: result.status,
    viewport: result.viewport,
  };
}

function formatCell(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatMetric(value, unit = '') {
  return Number.isFinite(value) ? `${value}${unit}` : 'N/A';
}

export function buildFrontendSmokeHistoryRecord({
  baseUrl,
  engine,
  env = process.env,
  failures,
  results,
  timestamp = new Date().toISOString(),
}) {
  return {
    timestamp,
    status: failures.length === 0 ? 'pass' : 'fail',
    baseUrl,
    engine,
    checked: results.length,
    failureCount: failures.length,
    profile: {
      authenticated: env.FRONTEND_SMOKE_AUTH_PROFILE === '1',
      includeOptional: env.FRONTEND_SMOKE_INCLUDE_OPTIONAL === '1',
      performanceBudget: env.FRONTEND_SMOKE_PERFORMANCE_BUDGET === '1',
    },
    failures,
    results: results.map(compactSmokeResult),
  };
}

function renderPerformanceRows(record) {
  if (record.results.length === 0) {
    return ['_No route samples found._'];
  }

  const lines = [
    '| Viewport | Route | Status | LCP | INP | CLS | DCL | Load | Response end | Transfer | Script transfer | Resources | DOM nodes | Console errors | Overflow | Final path |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];

  for (const result of record.results) {
    const performance = result.performance ?? {};
    lines.push([
      formatCell(result.viewport),
      formatCell(result.route),
      result.status,
      formatMetric(performance.lcpMs, 'ms'),
      formatMetric(performance.inpMs, 'ms'),
      formatMetric(performance.cls),
      formatMetric(performance.domContentLoadedMs, 'ms'),
      formatMetric(performance.loadMs, 'ms'),
      formatMetric(performance.responseEndMs, 'ms'),
      formatMetric(performance.resourceTransferKb, 'kB'),
      formatMetric(performance.scriptTransferKb, 'kB'),
      formatMetric(performance.resourceCount),
      formatMetric(performance.domNodeCount),
      result.consoleErrorCount ?? 0,
      result.horizontalOverflow ? 'yes' : 'no',
      formatCell(result.finalPath),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  return lines;
}

export function renderFrontendSmokeMarkdownReport(record, {
  title = 'Frontend Runtime Smoke Report',
} = {}) {
  const failures = record.failures.length === 0
    ? ['- None.']
    : record.failures.map((failure) => `- ${failure}`);

  const lines = [
    `# ${title}`,
    '',
    `- Status: \`${record.status}\``,
    `- Timestamp: \`${record.timestamp}\``,
    `- Base URL: \`${record.baseUrl}\``,
    `- Engine: \`${record.engine}\``,
    `- Checked routes: \`${record.checked}\``,
    `- Failure count: \`${record.failureCount}\``,
    `- Profile: authenticated=\`${record.profile.authenticated}\`, includeOptional=\`${record.profile.includeOptional}\`, performanceBudget=\`${record.profile.performanceBudget}\``,
    '',
    '## Failures',
    '',
    ...failures,
    '',
    '## Route Performance',
    '',
    ...renderPerformanceRows(record),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

export function writeFrontendSmokeHistoryRecord(historyJsonl, record) {
  if (!historyJsonl) {
    return;
  }
  ensureParentDir(historyJsonl);
  appendFileSync(historyJsonl, `${JSON.stringify(record)}\n`);
}

export function writeFrontendSmokeMarkdownReport(outputMd, record) {
  if (!outputMd) {
    return;
  }
  ensureParentDir(outputMd);
  writeFileSync(outputMd, renderFrontendSmokeMarkdownReport(record));
}

export function writeFrontendSmokeEvidence({
  baseUrl,
  engine,
  env = process.env,
  failures,
  historyJsonl,
  reportMd,
  results,
  timestamp = new Date().toISOString(),
}) {
  if (!historyJsonl && !reportMd) {
    return null;
  }

  const record = buildFrontendSmokeHistoryRecord({
    baseUrl,
    engine,
    env,
    failures,
    results,
    timestamp,
  });

  writeFrontendSmokeHistoryRecord(historyJsonl, record);
  writeFrontendSmokeMarkdownReport(reportMd, record);

  return record;
}
