import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_TITLE = 'Special Report Browser Smoke Evidence';
const SENSITIVE_QUERY_KEY_PATTERN = /(?:auth|cookie|key|password|secret|session|token)/i;

function ensureParentDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
}

function formatCell(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function redactSearch(search) {
  if (!search) {
    return '';
  }
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const key of [...params.keys()]) {
    if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
      params.set(key, '[redacted]');
    }
  }
  const redacted = params.toString();
  return redacted ? `?${redacted}` : '';
}

function redactSensitiveText(value) {
  return String(value ?? '')
    .replace(/FRONTEND_SMOKE_COOKIE_HEADER=(["']).*?\1/g, 'FRONTEND_SMOKE_COOKIE_HEADER="[redacted]"')
    .replace(/\b([A-Za-z0-9_]*(?:auth|cookie|key|password|secret|session|token)[A-Za-z0-9_]*)=([^;\s"']+)/gi, '$1=[redacted]');
}

function compactFinalPath(result) {
  return `${result.finalPath ?? '<unknown>'}${redactSearch(result.finalSearch ?? '')}`;
}

function compactSpecialBrowserSmokeResult(result) {
  const common = {
    finalPath: compactFinalPath(result),
    horizontalOverflow: Boolean(result.horizontalOverflow),
    kind: result.kind,
    route: result.route,
    status: result.status,
    viewport: result.viewport,
  };

  if (result.kind === 'anonymous-redirect') {
    return {
      ...common,
      redirectTarget: result.redirectTarget ?? '',
    };
  }

  if (result.kind === 'gallery') {
    return {
      ...common,
      cardCount: result.cardCount ?? 0,
      cardMaxWidth: result.cardMaxWidth ?? 0,
      claimHandleCount: result.claimHandleCount ?? 0,
      frameCount: result.frameCount ?? 0,
      mobilePolicyHandleCount: result.mobilePolicyHandleCount ?? 0,
      previewCount: result.previewCount ?? 0,
      questionHandleCount: result.questionHandleCount ?? 0,
    };
  }

  return {
    ...common,
    chartMissingSemanticMetadataCount: result.chartMissingSemanticMetadataCount ?? 0,
    chartNodeCount: result.chartNodeCount ?? 0,
    chartRenderedCount: result.chartRenderedCount ?? 0,
    desktopTocEntryCount: result.desktopTocEntryCount ?? 0,
    desktopTocVisibleEntryCount: result.desktopTocVisibleEntryCount ?? 0,
    evidenceDetailCount: result.evidenceDetailCount ?? 0,
    mobileCompactFallbackFailedCount: result.mobileCompactFallbackFailedCount ?? 0,
    mobileEvidenceCellLabelCount: result.mobileEvidenceCellLabelCount ?? 0,
    mobileTocEntryCount: result.mobileTocEntryCount ?? 0,
    mobileTocVisibleEntryCount: result.mobileTocVisibleEntryCount ?? 0,
    sectionEvidenceShownMax: result.sectionEvidenceShownMax ?? 0,
    staticVisualCount: result.staticVisualCount ?? 0,
    staticVisualMissingSemanticMetadataCount: result.staticVisualMissingSemanticMetadataCount ?? 0,
    staticVisualNonZeroBoxCount: result.staticVisualNonZeroBoxCount ?? 0,
  };
}

function summarizeResultEvidence(result) {
  if (result.kind === 'anonymous-redirect') {
    return `anonymous_redirect=${result.redirectTarget || '<empty>'}`;
  }
  if (result.kind === 'gallery') {
    return [
      `gallery_cards=${result.cardCount}`,
      `frames=${result.frameCount}`,
      `previews=${result.previewCount}`,
      `claims=${result.claimHandleCount}`,
      `questions=${result.questionHandleCount}`,
    ].join('; ');
  }

  return [
    `charts=${result.chartRenderedCount}/${result.chartNodeCount}`,
    `chart_meta_missing=${result.chartMissingSemanticMetadataCount}`,
    `static_visuals=${result.staticVisualNonZeroBoxCount}/${result.staticVisualCount}`,
    `static_visual_meta_missing=${result.staticVisualMissingSemanticMetadataCount}`,
    `evidence=${result.evidenceDetailCount}`,
    `section_evidence_max=${result.sectionEvidenceShownMax}`,
    `mobile_cells=${result.mobileEvidenceCellLabelCount}`,
  ].join('; ');
}

function summarizeResultToc(result) {
  if (result.kind === 'anonymous-redirect' || result.kind === 'gallery') {
    return 'N/A';
  }

  return [
    `desktop=${result.desktopTocVisibleEntryCount}/${result.desktopTocEntryCount}`,
    `mobile=${result.mobileTocVisibleEntryCount}/${result.mobileTocEntryCount}`,
    `mobile_fallback_failures=${result.mobileCompactFallbackFailedCount}`,
  ].join('; ');
}

function renderResultRows(record) {
  if (record.results.length === 0) {
    return ['_No route samples found._'];
  }

  const lines = [
    '| Viewport | Route | Status | Final path | Evidence | TOC | Overflow |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
  ];

  for (const result of record.results) {
    lines.push([
      formatCell(`${result.viewport}px`),
      formatCell(result.route),
      result.status,
      formatCell(result.finalPath),
      formatCell(summarizeResultEvidence(result)),
      formatCell(summarizeResultToc(result)),
      result.horizontalOverflow ? 'yes' : 'no',
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  return lines;
}

export function resolveSpecialReportBrowserSmokeReportPath(env = process.env) {
  return env.SPECIAL_REPORT_BROWSER_SMOKE_REPORT_MD || env.FRONTEND_SMOKE_REPORT_MD || '';
}

export function buildSpecialReportBrowserSmokeEvidenceRecord({
  authState = 'not recorded',
  baseUrl,
  engine,
  failures = [],
  results = [],
  timestamp = new Date().toISOString(),
}) {
  const compactResults = results.map(compactSpecialBrowserSmokeResult);
  return {
    timestamp,
    status: failures.length === 0 ? 'pass' : 'fail',
    baseUrl,
    engine,
    authState,
    checked: compactResults.length,
    failureCount: failures.length,
    failures: failures.map(redactSensitiveText),
    routes: unique(compactResults.map((result) => result.route)),
    finalPaths: unique(compactResults.map((result) => result.finalPath)),
    viewports: unique(compactResults.map((result) => `${result.viewport}px`)),
    results: compactResults,
  };
}

export function renderSpecialReportBrowserSmokeMarkdownReport(record, {
  title = DEFAULT_TITLE,
} = {}) {
  const failures = record.failures.length === 0
    ? ['- None.']
    : record.failures.map((failure) => `- ${failure}`);
  const skipped = record.checked > 0 ? 'None.' : 'Route checks did not run; see failures.';
  const anonymousRedirectOnly = record.results.length > 0
    && record.results.every((result) => result.kind === 'anonymous-redirect');
  const evidence = anonymousRedirectOnly
    ? 'anonymous protected-route navigation sampled; login final URL and redirect target recorded; authenticated report content was not checked.'
    : record.checked > 0
      ? 'heading/chart/TOC/gallery/export state sampled by the special report browser smoke; overflow and chart/static visual counts recorded.'
    : 'No page evidence collected.';

  const lines = [
    `# ${title}`,
    '',
    `- Status: \`${record.status}\``,
    `- Timestamp: \`${record.timestamp}\``,
    `- Base URL: \`${record.baseUrl}\``,
    `- Engine: \`${record.engine}\``,
    `- Checked routes: \`${record.checked}\``,
    `- Failure count: \`${record.failureCount}\``,
    '',
    '## Browser validation',
    '',
    '- Tool: `chrome-cdp special report browser smoke`',
    `- Route/final URL: ${record.finalPaths.length ? record.finalPaths.map((value) => `\`${value}\``).join(', ') : '`N/A`'}`,
    `- Auth state: ${record.authState}`,
    `- Viewports: ${record.viewports.length ? record.viewports.map((value) => `\`${value}\``).join(', ') : '`N/A`'}`,
    `- Evidence: ${evidence}`,
    `- Skipped: ${skipped}`,
    '',
    'This artifact intentionally stores no cookie headers, tokens, passwords, or browser profile data.',
    'Use `docs/FRONTEND_BROWSER_SMOKE_RUNBOOK.md` for the full delivery template and TMWD/js-reverse boundaries.',
    '',
    '## Route evidence',
    '',
    ...renderResultRows(record),
    '',
    '## Failures',
    '',
    ...failures,
    '',
  ];

  return `${lines.join('\n')}\n`;
}

export function writeSpecialReportBrowserSmokeEvidence({
  authState,
  baseUrl,
  engine,
  failures,
  reportMd = resolveSpecialReportBrowserSmokeReportPath(),
  results,
  timestamp,
}) {
  if (!reportMd) {
    return null;
  }

  const record = buildSpecialReportBrowserSmokeEvidenceRecord({
    authState,
    baseUrl,
    engine,
    failures,
    results,
    timestamp,
  });
  ensureParentDir(reportMd);
  writeFileSync(reportMd, renderSpecialReportBrowserSmokeMarkdownReport(record));
  return record;
}
