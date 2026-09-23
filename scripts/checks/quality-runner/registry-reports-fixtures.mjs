import {
  SPECIAL_REPORT_BROWSER_SMOKE_COMMAND,
  SPECIAL_REPORT_BROWSER_SMOKE_GATE_NAME,
  SPECIAL_REPORT_SMOKE_COMMAND,
  SPECIAL_REPORT_SMOKE_GATE_NAME,
} from '../../lib/reports/special-report-smoke-gate.mjs';

export function assertRegistryReportInputs({
  assertEqual,
  assertFalse,
  assertIncludes,
  assertTrue,
  registry,
}) {
  const specialSmokeGate = registry.byName.get(SPECIAL_REPORT_SMOKE_GATE_NAME);
  assertTrue(Boolean(specialSmokeGate), 'special report smoke should be registered as a quality gate');
  assertEqual(
    specialSmokeGate?.command,
    SPECIAL_REPORT_SMOKE_COMMAND,
    'special report smoke should resolve to the package script command',
  );
  assertEqual(specialSmokeGate?.group, 'reports', 'special report smoke should use the reports quality group');
  assertTrue(
    specialSmokeGate?.modes.includes('ci'),
    'special report smoke should participate in full ci mode',
  );
  assertTrue(
    specialSmokeGate?.modes.includes('frontend'),
    'special report smoke should participate in frontend verification mode',
  );
  assertFalse(
    specialSmokeGate?.modes.includes('quick'),
    'special report smoke should stay affected/ci-driven instead of becoming an always-on quick baseline',
  );

  const specialBrowserSmokeGate = registry.byName.get(SPECIAL_REPORT_BROWSER_SMOKE_GATE_NAME);
  assertTrue(
    Boolean(specialBrowserSmokeGate),
    'special report browser smoke should be registered as a manual/runtime quality gate',
  );
  assertEqual(
    specialBrowserSmokeGate?.command,
    SPECIAL_REPORT_BROWSER_SMOKE_COMMAND,
    'special report browser smoke should resolve to the package script command',
  );
  assertEqual(
    specialBrowserSmokeGate?.group,
    'reports',
    'special report browser smoke should use the reports quality group',
  );
  assertTrue(
    specialBrowserSmokeGate?.modes.includes('runtime'),
    'special report browser smoke should participate in the manual runtime profile',
  );
  assertTrue(
    specialBrowserSmokeGate?.modes.includes('frontend'),
    'special report browser smoke should remain discoverable from frontend/report gate metadata',
  );
  for (const forbiddenMode of ['ci', 'prepush', 'quick']) {
    assertFalse(
      specialBrowserSmokeGate?.modes.includes(forbiddenMode),
      `special report browser smoke should stay out of ${forbiddenMode} because it requires a live service and authenticated cookies`,
    );
  }
  assertFalse(
    specialBrowserSmokeGate?.cacheable,
    'special report browser smoke should not be cached because it depends on live browser/auth runtime state',
  );
  assertFalse(
    specialBrowserSmokeGate?.parallel,
    'special report browser smoke should run serially to avoid competing Chrome/CDP runtime sessions',
  );
  for (const envKey of [
    'FRONTEND_SMOKE_BASE_URL',
    'FRONTEND_SMOKE_CHROME_PATH',
    'FRONTEND_SMOKE_COOKIE_HEADER',
    'FRONTEND_SMOKE_REPORT_MD',
    'SPECIAL_REPORT_BROWSER_SMOKE_REQUIRE_AUTH',
    'SPECIAL_REPORT_BROWSER_SMOKE_REPORT_MD',
    'SPECIAL_REPORT_BROWSER_SMOKE_SETTLE_TIMEOUT_MS',
    'SPECIAL_REPORT_BROWSER_SMOKE_TIMEOUT_MS',
  ]) {
    assertIncludes(
      specialBrowserSmokeGate?.envKeys ?? [],
      envKey,
      `special report browser smoke env metadata should include ${envKey}`,
    );
  }

  for (const input of [
    'DESIGN.md',
    'docs/SPECIAL_REPORT_CHART_GALLERY.md',
    'docs/SPECIAL_REPORT_PAGE_COMPOSITION.md',
    'package.json',
    'apps/web-vite/src/app/reports/special/**',
    'scripts/checks/reports/special-smoke.mjs',
    'scripts/config/reports/special-smoke-inputs.mjs',
    'scripts/lib/reports/special-report-chart-gallery-smoke.mjs',
    'scripts/lib/reports/special-report-reader-fatigue-smoke.mjs',
    'scripts/lib/reports/special-report-section-source.mjs',
    'scripts/lib/reports/special-report-smoke-gate.mjs',
  ]) {
    assertIncludes(
      specialSmokeGate?.inputs ?? [],
      input,
      `special report smoke input metadata should include ${input}`,
    );
    assertIncludes(
      specialBrowserSmokeGate?.inputs ?? [],
      input,
      `special report browser smoke input metadata should include ${input}`,
    );
  }
}
