export function assertRegistryWeeklyInputs({
  assertFalse,
  assertTrue,
  registry,
}) {
  assertFalse(
    registry.byName.get('verify:weekly:behavior-gate-registry-behavior')?.inputs.includes('scripts/lib/**'),
    'weekly behavior registry behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:behavior-gate-registry-behavior')?.inputs.includes('scripts/fixtures/weekly/behavior-gate-registry.behavior-fixtures.mjs'),
    'weekly behavior registry behavior fixture should include its scoped fixture helper',
  );
  assertFalse(
    registry.byName.get('verify:weekly:behavior-guard-quality-behavior')?.inputs.includes('scripts/lib/**'),
    'weekly behavior guard quality behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:behavior-guard-quality-behavior')?.inputs.includes('scripts/fixtures/weekly/behavior-guard-quality.behavior-fixtures.mjs'),
    'weekly behavior guard quality behavior fixture should include its scoped fixture helper',
  );
  assertFalse(
    registry.byName.get('verify:weekly:boundary-gate-registry-behavior')?.inputs.includes('scripts/lib/**'),
    'weekly boundary registry behavior fixture should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:boundary-gate-registry-behavior')?.inputs.includes('scripts/fixtures/weekly/boundary-gate-registry.behavior-fixtures.mjs'),
    'weekly boundary registry behavior fixture should include its scoped fixture helper',
  );
  assertFalse(
    registry.byName.get('verify:weekly:overview-trend-section-adapter')?.inputs.includes('scripts/lib/**'),
    'weekly overview trend section adapter should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:overview-trend-section-adapter')?.inputs.includes('scripts/fixtures/weekly/overview-trend-section-adapter.behavior-fixtures.mjs'),
    'weekly overview trend section adapter should include its scoped fixture helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:overview-trend-section-adapter')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/overview-trend-section-adapter.ts'),
    'weekly overview trend section adapter should include its adapter source',
  );
  assertFalse(
    registry.byName.get('verify:weekly:overview-kpi-section-adapter')?.inputs.includes('scripts/lib/**'),
    'weekly overview KPI section adapter should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:overview-kpi-section-adapter')?.inputs.includes('scripts/fixtures/weekly/overview-kpi-section-adapter.behavior-fixtures.mjs'),
    'weekly overview KPI section adapter should include its scoped fixture helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:overview-kpi-section-adapter')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/overview-kpi-section-adapter.ts'),
    'weekly overview KPI section adapter should include its adapter source',
  );
  assertFalse(
    registry.byName.get('verify:weekly:overview-platform-breakdown')?.inputs.includes('scripts/lib/**'),
    'weekly overview platform breakdown should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:overview-platform-breakdown')?.inputs.includes('scripts/fixtures/weekly/overview-platform-breakdown.behavior-fixtures.mjs'),
    'weekly overview platform breakdown should include its scoped fixture helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:overview-platform-breakdown')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/overview-platform-breakdown-data.ts'),
    'weekly overview platform breakdown should include its data source',
  );
  assertFalse(
    registry.byName.get('verify:weekly:overview-trend')?.inputs.includes('scripts/lib/**'),
    'weekly overview trend should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:overview-trend')?.inputs.includes('scripts/fixtures/weekly/overview-trend.behavior-fixtures.mjs'),
    'weekly overview trend should include its scoped fixture helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:overview-trend')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/overview-trend-data.ts'),
    'weekly overview trend should include its data source',
  );
  assertFalse(
    registry.byName.get('verify:weekly:overview-by-week-trend')?.inputs.includes('scripts/lib/**'),
    'weekly overview by-week trend should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:overview-by-week-trend')?.inputs.includes('scripts/fixtures/weekly/overview-by-week-trend.behavior-fixtures.mjs'),
    'weekly overview by-week trend should include its scoped fixture helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:overview-by-week-trend')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/overview-by-week-trend-data.ts'),
    'weekly overview by-week trend should include its chart data source',
  );
  assertFalse(
    registry.byName.get('verify:weekly:platform-tab-content-routing')?.inputs.includes('scripts/lib/**'),
    'weekly platform content routing should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:platform-tab-content-routing')?.inputs.includes('scripts/fixtures/weekly/platform-tab-content-routing.behavior-fixtures.mjs'),
    'weekly platform content routing should include its scoped fixture helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:platform-tab-content-routing')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-content-routing.ts'),
    'weekly platform content routing should include its routing source',
  );
  assertFalse(
    registry.byName.get('verify:weekly:platform-tab-kpi-section-adapter')?.inputs.includes('scripts/lib/**'),
    'weekly platform KPI section adapter should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:platform-tab-kpi-section-adapter')?.inputs.includes('scripts/fixtures/weekly/platform-tab-kpi-section-adapter.behavior-fixtures.mjs'),
    'weekly platform KPI section adapter should include its scoped fixture helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:platform-tab-kpi-section-adapter')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-kpi-section-adapter.ts'),
    'weekly platform KPI section adapter should include its adapter source',
  );
  assertFalse(
    registry.byName.get('verify:weekly:primary-metrics')?.inputs.includes('scripts/lib/**'),
    'weekly primary metrics should hash exact helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:primary-metrics')?.inputs.includes('scripts/fixtures/weekly/primary-metrics.behavior-fixtures.mjs'),
    'weekly primary metrics should include its scoped fixture helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:primary-metrics')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-view-model-primary-metrics.ts'),
    'weekly primary metrics should include its view-model source',
  );
  assertTrue(
    registry.byName.get('verify:weekly:style-boundaries')?.inputs.includes('scripts/lib/weekly/weekly-tabs-style-boundaries-core.mjs'),
    'weekly style boundary cache key should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:contract-layers')?.inputs.includes('scripts/lib/weekly/weekly-tabs-contract-layers-core.mjs'),
    'weekly contract layer cache key should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:contract-layers')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/**/*-contracts.ts'),
    'weekly contract layer cache key should include weekly contract source files',
  );
  assertFalse(
    registry.byName.get('verify:weekly:contract-layers')?.inputs.includes('scripts/lib/**'),
    'weekly contract layer cache key should not hash every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:contract-import-hygiene')?.inputs.includes('scripts/lib/weekly/weekly-tabs-contract-import-hygiene-core.mjs'),
    'weekly contract import hygiene cache key should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:contract-import-hygiene')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/**/*-contracts.ts'),
    'weekly contract import hygiene cache key should include weekly contract source files',
  );
  assertFalse(
    registry.byName.get('verify:weekly:contract-import-hygiene')?.inputs.includes('scripts/lib/**'),
    'weekly contract import hygiene cache key should not hash every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:contract-boundaries')?.inputs.includes('scripts/lib/weekly/weekly-tabs-contract-boundaries-core.mjs'),
    'weekly contract boundary cache key should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:contract-boundaries')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/**/*-adapter.ts'),
    'weekly contract boundary cache key should include weekly adapter source files',
  );
  assertTrue(
    registry.byName.get('verify:weekly:contract-boundaries')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/**/*-contracts.ts'),
    'weekly contract boundary cache key should include weekly contract source files',
  );
  assertFalse(
    registry.byName.get('verify:weekly:contract-boundaries')?.inputs.includes('scripts/lib/**'),
    'weekly contract boundary cache key should not hash every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:exported-props-boundaries')?.inputs.includes('scripts/lib/weekly/weekly-tabs-exported-props-boundaries-core.mjs'),
    'weekly exported props boundary cache key should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:exported-props-boundaries')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/**/*.tsx'),
    'weekly exported props boundary cache key should include weekly TSX source files',
  );
  assertFalse(
    registry.byName.get('verify:weekly:exported-props-boundaries')?.inputs.includes('scripts/lib/**'),
    'weekly exported props boundary cache key should not hash every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:adapter-layers')?.inputs.includes('scripts/lib/weekly/weekly-tabs-adapter-layers-core.mjs'),
    'weekly adapter layer cache key should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:adapter-layers')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/**/*.ts'),
    'weekly adapter layer cache key should include weekly TS source files',
  );
  assertTrue(
    registry.byName.get('verify:weekly:adapter-layers')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/**/*.tsx'),
    'weekly adapter layer cache key should include weekly TSX source files',
  );
  assertFalse(
    registry.byName.get('verify:weekly:adapter-layers')?.inputs.includes('scripts/lib/**'),
    'weekly adapter layer cache key should not hash every script helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:render-boundaries')?.inputs.includes('scripts/lib/weekly/weekly-tabs-render-boundaries-core.mjs'),
    'weekly render boundary cache key should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:weekly:render-boundaries')?.inputs.includes('apps/web-vite/src/app/reports/weekly/_components/tabs/**/*.tsx'),
    'weekly render boundary cache key should include weekly TSX source files',
  );
  assertFalse(
    registry.byName.get('verify:weekly:render-boundaries')?.inputs.includes('scripts/lib/**'),
    'weekly render boundary cache key should not hash every script helper',
  );

  for (const [gateName, label] of [
    ['verify:weekly:funnel', 'weekly funnel behavior gate'],
    ['verify:weekly:waterfall', 'weekly waterfall behavior gate'],
    ['verify:weekly:platform-tab-douyin-attribution-section-adapter', 'weekly Douyin attribution section adapter gate'],
    ['verify:weekly:platform-tab-douyin-channel-leaf-adapter', 'weekly Douyin channel leaf adapter gate'],
    ['verify:weekly:platform-tab-douyin-card-leaf-adapter', 'weekly Douyin card leaf adapter gate'],
    ['verify:weekly:platform-tab-douyin-card-section-adapter', 'weekly Douyin card section adapter gate'],
    ['verify:weekly:platform-tab-douyin-live-leaf-adapter', 'weekly Douyin live leaf adapter gate'],
    ['verify:weekly:platform-tab-douyin-live-section-adapter', 'weekly Douyin live section adapter gate'],
    ['verify:weekly:platform-tab-douyin-section-adapter', 'weekly Douyin section adapter gate'],
    ['verify:weekly:platform-tab-douyin-section-list-adapter', 'weekly Douyin section-list adapter gate'],
    ['verify:weekly:platform-tab-douyin-shortvideo-leaf-adapter', 'weekly Douyin shortvideo leaf adapter gate'],
    ['verify:weekly:platform-tab-douyin-shortvideo-section-adapter', 'weekly Douyin shortvideo section adapter gate'],
    ['verify:weekly:platform-tab-render-state', 'weekly platform tab render-state gate'],
    ['verify:weekly:platform-tab-tmall-funnel-leaf-adapter', 'weekly Tmall funnel leaf adapter gate'],
    ['verify:weekly:platform-tab-tmall-attribution-section-adapter', 'weekly Tmall attribution section adapter gate'],
    ['verify:weekly:platform-tab-tmall-leaf-adapter', 'weekly Tmall leaf adapter gate'],
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/weekly/*.mjs'),
      `${label} cache key should include shared weekly helper files`,
    );
  }
}
