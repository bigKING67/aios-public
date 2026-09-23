export function assertRegistryDesignInputs({
  assertFalse,
  assertTrue,
  registry,
}) {
  assertTrue(
    registry.byName.get('verify:design:docs-behavior')?.inputs.includes('docs/**'),
    'design docs behavior gate should include docs quality inputs',
  );
  assertFalse(
    registry.byName.get('verify:design:behavior-gate-registry-behavior')?.inputs.includes('scripts/lib/**'),
    'design behavior registry fixture should hash exact split helpers instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:design:behavior-gate-registry-behavior')?.inputs.includes('scripts/lib/design/design-behavior-gate-registry-behavior-fixtures.mjs'),
    'design behavior registry fixture cache key should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:design:behavior-guard-quality-behavior')?.inputs.includes('scripts/lib/**'),
    'design behavior guard quality fixture should hash exact split helpers instead of every script helper',
  );
  for (const gateName of [
    'verify:design:behavior-guard-quality',
    'verify:design:behavior-guard-quality-behavior',
  ]) {
    for (const input of [
      'scripts/lib/design/design-behavior-guard-quality-core.mjs',
      'scripts/lib/design/design-behavior-gates.mjs',
      'scripts/lib/shared/behavior-guard-quality.mjs',
    ]) {
      assertTrue(
        registry.byName.get(gateName)?.inputs.includes(input),
        `${gateName} cache key should include ${input}`,
      );
    }
  }
  assertTrue(
    registry.byName.get('verify:design:behavior-guard-quality-behavior')?.inputs.includes('scripts/checks/design/behavior-guard-quality.behavior.mjs'),
    'design behavior guard quality fixture should include thin behavior checker',
  );
  assertTrue(
    registry.byName.get('verify:design:behavior-guard-quality-behavior')?.inputs.includes('scripts/lib/design/design-behavior-guard-quality-behavior-fixtures.mjs'),
    'design behavior guard quality fixture should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:design:docs-behavior')?.inputs.includes('apps/web-vite/src/**'),
    'design docs behavior gate should avoid broad frontend source inputs',
  );
  for (const gateName of [
    'verify:design:docs',
    'verify:design:docs-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/design-docs-drift-core.mjs'),
      `${gateName} cache key should include split docs drift helper`,
    );
  }
  assertTrue(
    registry.byName.get('verify:design:docs-behavior')?.inputs.includes('scripts/lib/design/design-docs-drift-behavior-fixtures.mjs'),
    'design docs behavior gate should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:design:tailwind-utilities-behavior')?.inputs.includes('apps/web-vite/src/**'),
    'design behavior fixtures should avoid broad source inputs and hash fixture/checker code instead',
  );
  assertFalse(
    registry.byName.get('verify:design:tailwind-utilities-behavior')?.inputs.includes('apps/**'),
    'design behavior fixtures should avoid broad app inputs and hash fixture/checker code instead',
  );
  assertFalse(
    registry.byName.get('verify:design:tailwind-non-color-aliases-behavior')?.inputs.includes('apps/web-vite/src/**'),
    'Tailwind non-color behavior fixture should avoid broad source inputs and hash fixture/checker code instead',
  );
  assertFalse(
    registry.byName.get('verify:design:tailwind-non-color-aliases-behavior')?.inputs.includes('apps/**'),
    'Tailwind non-color behavior fixture should avoid broad app inputs and hash fixture/checker code instead',
  );
  assertFalse(
    registry.byName.get('verify:design:tailwind-behavior')?.inputs.includes('scripts/lib/**'),
    'Tailwind token alias behavior fixture should hash its split core helper instead of every script helper',
  );
  assertFalse(
    registry.byName.get('verify:design:antd-theme-token-sync')?.inputs.includes('apps/web-vite/src/**'),
    'AntD theme token sync gate should hash exact source files instead of broad source inputs',
  );
  assertFalse(
    registry.byName.get('verify:design:antd-theme-token-sync')?.inputs.includes('apps/**'),
    'AntD theme token sync gate should hash exact app files instead of broad app inputs',
  );
  assertFalse(
    registry.byName.get('verify:design:echarts-css-token-sync')?.inputs.includes('apps/web-vite/src/**'),
    'ECharts CSS token sync gate should hash exact source files instead of broad source inputs',
  );
  assertFalse(
    registry.byName.get('verify:design:echarts-css-token-sync')?.inputs.includes('apps/**'),
    'ECharts CSS token sync gate should avoid broad app inputs',
  );
  assertFalse(
    registry.byName.get('verify:design:echarts-css-token-sync-behavior')?.inputs.includes('scripts/lib/**'),
    'ECharts CSS token sync behavior fixture should hash exact split helpers instead of every script helper',
  );
  assertFalse(
    registry.byName.get('verify:design:echarts-theme-token-sync-behavior')?.inputs.includes('scripts/lib/**'),
    'ECharts theme token sync behavior fixture should hash exact split helpers instead of every script helper',
  );
  assertFalse(
    registry.byName.get('verify:design:antd-table-selectors-behavior')?.inputs.includes('scripts/lib/**'),
    'AntD table selector behavior fixture should hash its split core helper instead of every script helper',
  );
  assertFalse(
    registry.byName.get('verify:design:tokens')?.inputs.includes('apps/web-vite/src/**'),
    'design token color sync gate should hash exact token files instead of broad frontend source',
  );
  assertFalse(
    registry.byName.get('verify:design:tokens')?.inputs.includes('apps/**'),
    'design token color sync gate should avoid broad app inputs',
  );
  assertTrue(
    registry.byName.get('verify:design:typography')?.inputs.includes('apps/web-vite/src/**/*.module.css'),
    'design typography gate should hash CSS Module source files',
  );
  assertTrue(
    registry.byName.get('verify:design:typography')?.inputs.includes('scripts/config/allowlists/css-module-typography-allowlist.json'),
    'design typography gate should hash typography allowlist config',
  );
  assertTrue(
    registry.byName.get('verify:design:typography')?.inputs.includes('scripts/lib/design/css-module-typography-values-core.mjs'),
    'design typography gate should include split typography value helper',
  );
  for (const gateName of [
    'verify:design:raw-colors',
    'verify:design:raw-colors-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/raw-colors-css-modules-core.mjs'),
      `${gateName} cache key should include split CSS Module raw color helper`,
    );
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/raw-colors-non-modules-core.mjs'),
      `${gateName} cache key should include split non-module raw color helper`,
    );
  }
  assertFalse(
    registry.byName.get('verify:design:raw-colors-behavior')?.inputs.includes('scripts/lib/**'),
    'raw color behavior fixture should hash split helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:design:raw-colors-behavior')?.inputs.includes('scripts/lib/design/raw-colors-behavior-fixtures.mjs'),
    'raw color behavior fixture should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:design:raw-color-source-allowlist-behavior')?.inputs.includes('scripts/lib/**'),
    'raw color source allowlist behavior fixture should hash split helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:design:raw-color-source-allowlist-behavior')?.inputs.includes('scripts/lib/design/raw-color-source-allowlist.mjs'),
    'raw color source allowlist behavior fixture should include source allowlist parser helper',
  );
  assertTrue(
    registry.byName.get('verify:design:raw-color-source-allowlist-behavior')?.inputs.includes('scripts/lib/design/raw-color-source-allowlist-behavior-fixtures.mjs'),
    'raw color source allowlist behavior fixture should include split behavior fixtures',
  );
  for (const input of [
    'DESIGN_TOKENS.json',
    'apps/web-vite/src/lib/design-tokens.ts',
    'apps/web-vite/src/styles/design-tokens.css',
    'apps/web-vite/src/lib/platform-colors.ts',
    'apps/web-vite/src/lib/domain-taxonomy-colors.ts',
    'scripts/config/design/token-color-sync.config.json',
    'scripts/lib/frontend/frontend-design-token-color-sync-core.mjs',
  ]) {
    assertTrue(
      registry.byName.get('verify:design:tokens')?.inputs.includes(input),
      `design token color sync cache key should include ${input}`,
    );
  }
  assertTrue(
    registry.byName.get('verify:design:token-values-sync')?.inputs.includes('apps/web-vite/src/lib/design-token-values.ts'),
    'design token values sync cache key should include runtime value helper source',
  );
  assertTrue(
    registry.byName.get('verify:design:token-values-sync')?.inputs.includes('scripts/lib/design/design-token-values-sync-core.mjs'),
    'design token values sync cache key should include split core helper',
  );
  assertFalse(
    registry.byName.get('verify:design:token-values-sync-behavior')?.inputs.includes('scripts/lib/**'),
    'design token values behavior fixture should hash exact split helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:design:token-values-sync-behavior')?.inputs.includes('scripts/checks/design/token-values-sync.mjs'),
    'design token values behavior fixture should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:design:token-values-sync-behavior')?.inputs.includes('scripts/lib/design/design-token-values-sync-core.mjs'),
    'design token values behavior fixture should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:design:token-values-sync-behavior')?.inputs.includes('scripts/lib/design/design-token-values-sync-behavior-fixtures.mjs'),
    'design token values behavior fixture should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:design:mirror')?.inputs.includes('DESIGN_TOKENS.json'),
    'design token mirror cache key should include token JSON source',
  );
  assertTrue(
    registry.byName.get('verify:design:mirror')?.inputs.includes('apps/web-vite/src/lib/design-tokens.ts'),
    'design token mirror cache key should include TS mirror source',
  );
  assertTrue(
    registry.byName.get('verify:design:mirror')?.inputs.includes('scripts/lib/design/design-token-mirror-sync-core.mjs'),
    'design token mirror cache key should include split core helper',
  );
  assertFalse(
    registry.byName.get('verify:design:mirror')?.inputs.includes('scripts/lib/**'),
    'design token mirror should hash exact split helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:design:runtime-tokens')?.inputs.includes('DESIGN_TOKENS.json'),
    'design runtime token sync cache key should include token JSON source',
  );
  assertTrue(
    registry.byName.get('verify:design:runtime-tokens')?.inputs.includes('apps/web-vite/src/styles/design-tokens.css'),
    'design runtime token sync cache key should include runtime CSS source',
  );
  assertTrue(
    registry.byName.get('verify:design:runtime-tokens')?.inputs.includes('scripts/lib/design/design-runtime-token-sync-core.mjs'),
    'design runtime token sync cache key should include split core helper',
  );
  assertFalse(
    registry.byName.get('verify:design:runtime-tokens-behavior')?.inputs.includes('scripts/lib/**'),
    'design runtime token behavior fixture should hash exact split helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:design:runtime-tokens-behavior')?.inputs.includes('scripts/checks/frontend/design-runtime-token-sync.mjs'),
    'design runtime token behavior fixture should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:design:runtime-tokens-behavior')?.inputs.includes('scripts/lib/design/design-runtime-token-sync-core.mjs'),
    'design runtime token behavior fixture should include split core helper',
  );
  assertTrue(
    registry.byName.get('verify:design:runtime-tokens-behavior')?.inputs.includes('scripts/lib/design/design-runtime-token-sync-behavior-fixtures.mjs'),
    'design runtime token behavior fixture should include split behavior fixtures',
  );
  assertFalse(
    registry.byName.get('verify:design:antd-theme-token-sync-behavior')?.inputs.includes('scripts/lib/**'),
    'AntD theme behavior fixture should hash its split core helper instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:design:tailwind-utilities-behavior')?.inputs.includes('scripts/checks/design/tailwind-utility-colors.behavior.mjs'),
    'behavior fixture cache key should include the fixture script itself',
  );
  assertTrue(
    registry.byName.get('verify:design:tailwind-utilities-behavior')?.inputs.includes('scripts/checks/design/tailwind-utility-colors.mjs'),
    'behavior fixture cache key should include its paired production checker',
  );
  assertFalse(
    registry.byName.get('verify:design:tailwind-utilities-behavior')?.inputs.includes('scripts/lib/**'),
    'Tailwind utility color behavior fixture should hash split helper inputs instead of every script helper',
  );
  assertTrue(
    registry.byName.get('verify:design:tailwind-utilities-behavior')?.inputs.includes('scripts/lib/design/tailwind-utility-color-check.mjs'),
    'Tailwind utility color behavior fixture should include split production check helper',
  );
  assertTrue(
    registry.byName.get('verify:design:tailwind-utilities-behavior')?.inputs.includes('scripts/lib/design/tailwind-utility-colors-behavior-fixtures.mjs'),
    'Tailwind utility color behavior fixture should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:design:tailwind-behavior')?.inputs.includes('scripts/checks/design/tailwind-token-aliases.behavior.mjs'),
    'Tailwind token alias behavior fixture cache key should include the fixture script itself',
  );
  assertTrue(
    registry.byName.get('verify:design:tailwind-behavior')?.inputs.includes('scripts/checks/design/tailwind-token-aliases.mjs'),
    'Tailwind token alias behavior fixture cache key should include its paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:design:tailwind-behavior')?.inputs.includes('scripts/lib/design/tailwind-token-aliases-behavior-fixtures.mjs'),
    'Tailwind token alias behavior fixture cache key should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:design:tailwind-non-color-aliases-behavior')?.inputs.includes('scripts/checks/design/tailwind-non-color-token-aliases.behavior.mjs'),
    'Tailwind non-color behavior fixture cache key should include the fixture script itself',
  );
  assertTrue(
    registry.byName.get('verify:design:tailwind-non-color-aliases-behavior')?.inputs.includes('scripts/checks/design/tailwind-non-color-token-aliases.mjs'),
    'Tailwind non-color behavior fixture cache key should include its paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:design:tailwind-non-color-aliases-behavior')?.inputs.includes('scripts/lib/design/tailwind-non-color-token-aliases-behavior-fixtures.mjs'),
    'Tailwind non-color behavior fixture cache key should include split behavior fixtures',
  );
  for (const gateName of [
    'verify:design:tailwind',
    'verify:design:tailwind-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/tailwind-token-aliases-core.mjs'),
      `${gateName} cache key should include split Tailwind token alias helper`,
    );
  }
  for (const gateName of [
    'verify:design:tailwind-utilities',
    'verify:design:tailwind-utilities-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/tailwind-utility-color-check.mjs'),
      `${gateName} cache key should include split Tailwind utility color check helper`,
    );
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/tailwind-utility-color-core.mjs'),
      `${gateName} cache key should include split Tailwind utility color helper`,
    );
  }
  for (const gateName of [
    'verify:design:tailwind-non-color-aliases',
    'verify:design:tailwind-non-color-aliases-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/tailwind-non-color-token-aliases-core.mjs'),
      `${gateName} cache key should include split Tailwind non-color alias helper`,
    );
  }
  assertTrue(
    registry.byName.get('verify:design:antd-theme-token-sync')?.inputs.includes('apps/web-vite/src/theme/ant-theme.ts'),
    'AntD theme token sync cache key should include its theme adapter source',
  );
  assertTrue(
    registry.byName.get('verify:design:antd-theme-token-sync')?.inputs.includes('apps/web-vite/src/ViteProviders.tsx'),
    'AntD theme token sync cache key should include its provider entrypoint',
  );
  assertTrue(
    registry.byName.get('verify:design:antd-theme-token-sync-behavior')?.inputs.includes('scripts/checks/design/antd-theme-token-sync.mjs'),
    'AntD theme behavior fixture cache key should include its paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:design:antd-theme-token-sync-behavior')?.inputs.includes('scripts/fixtures/design/antd-theme-token-sync.behavior-fixtures.mjs'),
    'AntD theme behavior fixture cache key should include its split behavior helper',
  );
  for (const input of [
    'DESIGN_TOKENS.json',
    'scripts/config/design/token-color-sync.config.json',
    'apps/web-vite/src/lib/platform-colors.ts',
    'apps/web-vite/src/lib/domain-taxonomy-colors.ts',
    'apps/web-vite/src/styles/echarts.css',
  ]) {
    assertTrue(
      registry.byName.get('verify:design:echarts-css-token-sync')?.inputs.includes(input),
      `ECharts CSS token sync cache key should include ${input}`,
    );
  }
  assertTrue(
    registry.byName.get('verify:design:echarts-css-token-sync-behavior')?.inputs.includes('scripts/checks/design/echarts-css-token-sync.mjs'),
    'ECharts CSS token sync behavior fixture cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:design:echarts-css-token-sync-behavior')?.inputs.includes('scripts/lib/design/echarts-css-token-sync-behavior-fixtures.mjs'),
    'ECharts CSS token sync behavior fixture cache key should include split behavior fixtures',
  );
  for (const input of [
    'apps/web-vite/src/styles/echarts-theme.ts',
    'apps/web-vite/src/theme/echarts-theme.ts',
  ]) {
    assertTrue(
      registry.byName.get('verify:design:echarts-theme-token-sync')?.inputs.includes(input),
      `ECharts theme token sync cache key should include ${input}`,
    );
  }
  assertTrue(
    registry.byName.get('verify:design:echarts-theme-token-sync-behavior')?.inputs.includes('scripts/checks/design/echarts-theme-token-sync.mjs'),
    'ECharts theme token sync behavior fixture cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:design:echarts-theme-token-sync-behavior')?.inputs.includes('scripts/lib/design/echarts-theme-token-sync-behavior-fixtures.mjs'),
    'ECharts theme token sync behavior fixture cache key should include split behavior fixtures',
  );
  assertTrue(
    registry.byName.get('verify:design:antd-table-selectors')?.inputs.includes('scripts/config/allowlists/antd-table-selector-allowlist.json'),
    'AntD table selector cache key should include selector allowlist config',
  );
  assertTrue(
    registry.byName.get('verify:design:antd-table-selectors-behavior')?.inputs.includes('scripts/checks/design/antd-table-selectors.mjs'),
    'AntD table selector behavior fixture cache key should include paired production checker',
  );
  assertTrue(
    registry.byName.get('verify:design:antd-table-selectors-behavior')?.inputs.includes('scripts/fixtures/design/antd-table-selectors.behavior-fixtures.mjs'),
    'AntD table selector behavior fixture cache key should include split behavior fixtures',
  );
  for (const gateName of [
    'verify:design:antd-theme-token-sync',
    'verify:design:antd-theme-token-sync-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/antd-theme-token-sync-core.mjs'),
      `${gateName} cache key should include split AntD theme token sync helper`,
    );
  }
  for (const gateName of [
    'verify:design:echarts-css-token-sync',
    'verify:design:echarts-css-token-sync-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/echarts-css-token-sync-core.mjs'),
      `${gateName} cache key should include split ECharts CSS token sync helper`,
    );
  }
  for (const gateName of [
    'verify:design:echarts-theme-token-sync',
    'verify:design:echarts-theme-token-sync-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/echarts-theme-token-sync-core.mjs'),
      `${gateName} cache key should include split ECharts theme token sync helper`,
    );
  }
  for (const gateName of [
    'verify:design:antd-table-selectors',
    'verify:design:antd-table-selectors-behavior',
  ]) {
    assertTrue(
      registry.byName.get(gateName)?.inputs.includes('scripts/lib/design/antd-table-selectors-core.mjs'),
      `${gateName} cache key should include split AntD table selector helper`,
    );
  }
}
