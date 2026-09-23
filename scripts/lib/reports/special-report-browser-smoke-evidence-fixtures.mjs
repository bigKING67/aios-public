import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildAnonymousRedirectFailures,
  isAnonymousRedirectReady,
} from './special-report-browser-auth-redirect-smoke.mjs';
import {
  buildSpecialReportBrowserSmokeEvidenceRecord,
  renderSpecialReportBrowserSmokeMarkdownReport,
  resolveSpecialReportBrowserSmokeReportPath,
  writeSpecialReportBrowserSmokeEvidence,
} from './special-report-browser-smoke-evidence.mjs';

const SAMPLE_BROWSER_SMOKE_RESULT = Object.freeze({
  authState: 'authenticated cookie header provided',
  baseUrl: 'http://localhost:3000',
  engine: 'chrome-cdp (/Applications/Google Chrome.app/Contents/MacOS/Google Chrome)',
  failures: [],
  results: [
    {
      kind: 'report',
      route: '/reports/special/gsv-monthly-channel',
      viewport: '1512',
      status: 200,
      finalPath: '/reports/special/gsv-monthly-channel',
      finalSearch: '?reportMode=export&access_token=secret-value',
      chartMissingSemanticMetadataCount: 0,
      chartNodeCount: 11,
      chartRenderedCount: 11,
      desktopTocEntryCount: 20,
      desktopTocVisibleEntryCount: 20,
      evidenceDetailCount: 9,
      horizontalOverflow: false,
      mobileCompactFallbackFailedCount: 0,
      mobileEvidenceCellLabelCount: 0,
      mobileTocEntryCount: 20,
      mobileTocVisibleEntryCount: 6,
      sectionEvidenceShownMax: 8,
      staticVisualCount: 2,
      staticVisualMissingSemanticMetadataCount: 0,
      staticVisualNonZeroBoxCount: 2,
    },
    {
      kind: 'gallery',
      route: '/reports/special',
      viewport: '390',
      status: 200,
      finalPath: '/reports/special',
      finalSearch: '',
      cardCount: 9,
      cardMaxWidth: 364,
      claimHandleCount: 9,
      frameCount: 9,
      horizontalOverflow: false,
      mobilePolicyHandleCount: 9,
      previewCount: 9,
      questionHandleCount: 9,
    },
  ],
});

export function runSpecialReportBrowserSmokeEvidenceBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
  assertTrue,
}) {
  const anonymousRoute = {
    name: 'export',
    path: '/reports/special/gsv-monthly-channel?reportMode=export',
  };
  const anonymousSnapshot = {
    finalPath: '/login',
    finalSearch: '?redirect=%2Freports%2Fspecial%2Fgsv-monthly-channel',
  };
  assertEqual(
    isAnonymousRedirectReady(anonymousSnapshot, anonymousRoute),
    true,
    'anonymous smoke should become ready only at the login redirect target',
  );
  assertEqual(
    buildAnonymousRedirectFailures({
      documentStatus: 200,
      route: anonymousRoute,
      snapshot: anonymousSnapshot,
      viewport: { name: '390' },
    }).length,
    0,
    'anonymous smoke should accept the protected pathname redirect without report content assertions',
  );
  const wrongRedirectFailures = buildAnonymousRedirectFailures({
    documentStatus: 200,
    route: anonymousRoute,
    snapshot: { finalPath: '/login', finalSearch: '?redirect=%2Fdashboard' },
    viewport: { name: '390' },
  });
  assertIncludes(
    wrongRedirectFailures.join('\n'),
    'expected login redirect target /reports/special/gsv-monthly-channel',
    'anonymous smoke should reject a login redirect targeting another route',
  );
  const missingLoginFailures = buildAnonymousRedirectFailures({
    documentStatus: 200,
    route: anonymousRoute,
    snapshot: { finalPath: '/reports/special/gsv-monthly-channel', finalSearch: '' },
    viewport: { name: '390' },
  });
  assertIncludes(
    missingLoginFailures.join('\n'),
    'expected anonymous final path /login',
    'anonymous smoke should reject a protected route that did not reach login',
  );

  assertEqual(
    resolveSpecialReportBrowserSmokeReportPath({
      FRONTEND_SMOKE_REPORT_MD: '.artifacts/frontend/latest.md',
      SPECIAL_REPORT_BROWSER_SMOKE_REPORT_MD: '.artifacts/reports/latest.md',
    }),
    '.artifacts/reports/latest.md',
    'special report browser smoke report env should win over generic frontend smoke report env',
  );

  const record = buildSpecialReportBrowserSmokeEvidenceRecord({
    ...SAMPLE_BROWSER_SMOKE_RESULT,
    timestamp: '2026-06-05T00:00:00.000Z',
  });
  assertEqual(record.status, 'pass', 'special report browser smoke evidence should mark passing runs');
  assertEqual(record.checked, 2, 'special report browser smoke evidence should keep route sample count');
  assertIncludes(
    record.finalPaths.join('\n'),
    'access_token=%5Bredacted%5D',
    'special report browser smoke evidence should redact sensitive query values',
  );
  assertNotIncludes(
    record.finalPaths.join('\n'),
    'secret-value',
    'special report browser smoke evidence should not retain sensitive query values',
  );

  const markdown = renderSpecialReportBrowserSmokeMarkdownReport(record);
  assertIncludes(markdown, '## Browser validation', 'markdown evidence should include runbook delivery section');
  assertIncludes(markdown, 'docs/FRONTEND_BROWSER_SMOKE_RUNBOOK.md', 'markdown evidence should point to the browser runbook');
  assertIncludes(markdown, 'charts=11/11', 'markdown evidence should include report chart counts');
  assertIncludes(markdown, 'gallery_cards=9', 'markdown evidence should include gallery counts');
  assertIncludes(markdown, 'This artifact intentionally stores no cookie headers', 'markdown evidence should state secret boundary');
  assertNotIncludes(markdown, 'secret-value', 'markdown evidence should not include sensitive query values');

  const anonymousRecord = buildSpecialReportBrowserSmokeEvidenceRecord({
    authState: 'anonymous redirect allowed',
    baseUrl: 'http://localhost:3000',
    engine: 'chrome-cdp',
    failures: [],
    results: [{
      kind: 'anonymous-redirect',
      route: anonymousRoute.path,
      viewport: '390',
      status: 200,
      finalPath: anonymousSnapshot.finalPath,
      finalSearch: anonymousSnapshot.finalSearch,
      redirectTarget: '/reports/special/gsv-monthly-channel',
    }],
    timestamp: '2026-07-22T00:00:00.000Z',
  });
  const anonymousMarkdown = renderSpecialReportBrowserSmokeMarkdownReport(anonymousRecord);
  assertIncludes(anonymousMarkdown, 'anonymous_redirect=/reports/special/gsv-monthly-channel', 'anonymous evidence should record the redirect target');
  assertIncludes(anonymousMarkdown, 'authenticated report content was not checked', 'anonymous evidence should not imply authenticated visual coverage');
  assertNotIncludes(anonymousMarkdown, 'charts=0/0', 'anonymous evidence should not render report chart counters');

  const failureRecord = buildSpecialReportBrowserSmokeEvidenceRecord({
    ...SAMPLE_BROWSER_SMOKE_RESULT,
    failures: [
      'Provide FRONTEND_SMOKE_COOKIE_HEADER="aios_access_token=abc; aios_refresh_token=def".',
    ],
    results: [],
    timestamp: '2026-06-05T00:00:00.000Z',
  });
  const failureMarkdown = renderSpecialReportBrowserSmokeMarkdownReport(failureRecord);
  assertIncludes(
    failureMarkdown,
    'FRONTEND_SMOKE_COOKIE_HEADER="[redacted]"',
    'markdown evidence should redact cookie header examples in failures',
  );
  assertNotIncludes(failureMarkdown, 'aios_access_token=abc', 'markdown evidence should not retain access cookie examples');
  assertNotIncludes(failureMarkdown, 'aios_refresh_token=def', 'markdown evidence should not retain refresh cookie examples');

  const tmpDir = mkdtempSync(path.join(tmpdir(), 'special-report-browser-smoke-evidence-'));
  try {
    const reportMd = path.join(tmpDir, 'latest.md');
    const written = writeSpecialReportBrowserSmokeEvidence({
      ...SAMPLE_BROWSER_SMOKE_RESULT,
      reportMd,
      timestamp: '2026-06-05T00:00:00.000Z',
    });
    assertTrue(Boolean(written), 'special report browser smoke evidence writer should return the written record');
    assertEqual(existsSync(reportMd), true, 'special report browser smoke evidence writer should create markdown file');
    assertIncludes(
      readFileSync(reportMd, 'utf8'),
      '# Special Report Browser Smoke Evidence',
      'special report browser smoke evidence writer should persist markdown title',
    );
  } finally {
    rmSync(tmpDir, { force: true, recursive: true });
  }

  return 'special report browser smoke evidence fixtures passed';
}
