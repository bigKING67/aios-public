export function assertRegistryFrontendDashboardInputs({
  assertEqual,
  assertFalse,
  assertTrue,
  registry,
}) {
    assertTrue(
      registry.byName.get('verify:dashboard:date-range-bounds-behavior')?.inputs.includes('apps/web-vite/src/app/dashboard/_components/dashboard-date-range-resolvers.ts'),
      'dashboard date range behavior gate cache key should include shared date range resolver source',
    );
    assertEqual(
      registry.byName.get('verify:dashboard:date-range-bounds-behavior')?.group,
      'frontend',
      'dashboard date range behavior gate should use the frontend quality group',
    );
    assertTrue(
      registry.byName.get('verify:dashboard:date-range-bounds-behavior')?.modes.includes('frontend'),
      'dashboard date range behavior gate should run in the frontend profile',
    );
    assertFalse(
      registry.byName.get('verify:dashboard:date-range-bounds-behavior')?.modes.includes('backend'),
      'dashboard date range behavior gate should not run in the backend profile',
    );

    assertTrue(
      registry.byName.get('verify:dashboard:creator-short-video-behavior')?.inputs.includes('apps/web-vite/src/app/dashboard/creator/_components/creator-short-video-*'),
      'creator short video dashboard behavior gate cache key should include route-local short-video modules',
    );
    assertTrue(
      registry.byName.get('verify:dashboard:creator-short-video-behavior')?.inputs.includes('apps/web-vite/src/app/dashboard/creator/_components/creator-live-dashboard-metrics.module.css'),
      'creator short video dashboard behavior gate cache key should include split metric grid styles',
    );
    for (const fixturePath of [
      'scripts/lib/frontend/creator-short-video-data-source-behavior-fixtures.mjs',
      'scripts/lib/frontend/creator-short-video-rendering-behavior-fixtures.mjs',
      'scripts/lib/frontend/creator-short-video-upload-link-behavior-fixtures.mjs',
    ]) {
      assertTrue(
        registry.byName.get('verify:dashboard:creator-short-video-behavior')?.inputs.includes(fixturePath),
        `creator short video dashboard behavior cache key should include ${fixturePath}`,
      );
    }
    assertEqual(
      registry.byName.get('verify:dashboard:creator-short-video-behavior')?.group,
      'frontend',
      'creator short video dashboard behavior gate should use the frontend quality group',
    );
    assertTrue(
      registry.byName.get('verify:dashboard:creator-short-video-behavior')?.modes.includes('frontend'),
      'creator short video dashboard behavior gate should run in the frontend profile',
    );
    assertFalse(
      registry.byName.get('verify:dashboard:creator-short-video-behavior')?.modes.includes('backend'),
      'creator short video dashboard behavior gate should not run in the backend profile',
    );
    assertEqual(
      registry.byName.get('verify:dashboard:performance-completion-audit-behavior')?.group,
      'backend',
      'dashboard performance completion audit should stay in the backend/runtime quality group',
    );
    assertFalse(
      registry.byName.get('verify:dashboard:performance-completion-audit-behavior')?.modes.includes('frontend'),
      'dashboard performance completion audit should not be pulled into the frontend profile by dashboard gate naming',
    );
}
