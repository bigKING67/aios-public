#!/usr/bin/env node

import { build } from 'esbuild';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';

const { assertEqual, assertTrue, reportOk } = createCheckGuard('route-policy-registry-behavior');

async function bundleRegistry() {
  const result = await build({
    absWorkingDir: process.cwd(),
    bundle: true,
    entryPoints: ['apps/web-vite/src/lib/route-policy-registry.ts'],
    external: [],
    format: 'esm',
    logLevel: 'silent',
    platform: 'node',
    target: 'node20',
    write: false,
  });
  const bundledSource = result.outputFiles[0]?.text;
  if (!bundledSource) {
    throw new Error('route policy registry bundle output is empty');
  }

  return {
    moduleUrl: `data:text/javascript;base64,${Buffer.from(bundledSource).toString('base64')}`,
  };
}

function expectPolicy(entry, expected) {
  assertTrue(Boolean(entry), `${expected.path} should resolve to a route policy entry`);
  assertEqual(entry.path, expected.path, `${expected.path} should resolve to the most specific policy path`);
  assertEqual(entry.kind, expected.kind, `${expected.path} should resolve to ${expected.kind}`);
}

const { moduleUrl } = await bundleRegistry();
const {
  ROUTE_PATHS,
  findRoutePolicyEntry,
  normalizeRoutePolicyPath,
} = await import(moduleUrl);

assertEqual(normalizeRoutePolicyPath(), '/', 'empty path should normalize to root');
assertEqual(normalizeRoutePolicyPath(''), '/', 'blank path should normalize to root');
assertEqual(
  normalizeRoutePolicyPath(ROUTE_PATHS.reportsWeekly.slice(1)),
  ROUTE_PATHS.reportsWeekly,
  'relative path should gain leading slash',
);
assertEqual(
  normalizeRoutePolicyPath(`${ROUTE_PATHS.reportsWeekly}/?x=1#detail`),
  ROUTE_PATHS.reportsWeekly,
  'query, hash, and trailing slash should be stripped',
);

expectPolicy(findRoutePolicyEntry(ROUTE_PATHS.dashboard), {
  kind: 'public',
  path: ROUTE_PATHS.dashboard,
});
expectPolicy(findRoutePolicyEntry(ROUTE_PATHS.dashboardCreator), {
  kind: 'creator_dashboard',
  path: ROUTE_PATHS.dashboardCreator,
});
expectPolicy(findRoutePolicyEntry(`${ROUTE_PATHS.dashboardCreatorLive}?from=nav`), {
  kind: 'creator_dashboard',
  path: ROUTE_PATHS.dashboardCreatorLive,
});
expectPolicy(findRoutePolicyEntry(ROUTE_PATHS.dashboardIndustryMaterialInspiration), {
  kind: 'content_assets_write',
  path: ROUTE_PATHS.dashboardIndustryMaterialInspiration,
});
expectPolicy(findRoutePolicyEntry(ROUTE_PATHS.admin), {
  kind: 'admin',
  path: ROUTE_PATHS.admin,
});
expectPolicy(findRoutePolicyEntry(`${ROUTE_PATHS.adminUsers}/detail`), {
  kind: 'admin',
  path: ROUTE_PATHS.adminUsers,
});
expectPolicy(findRoutePolicyEntry(`${ROUTE_PATHS.marketingCreatorLibrary}/detail`), {
  kind: 'creator_library',
  path: ROUTE_PATHS.marketingCreatorLibrary,
});
expectPolicy(findRoutePolicyEntry(`${ROUTE_PATHS.marketingIndustryNews}/detail`), {
  kind: 'authenticated',
  path: ROUTE_PATHS.marketingIndustryNews,
});
expectPolicy(findRoutePolicyEntry(`${ROUTE_PATHS.marketingContentAssets}/asset-fixture-001`), {
  kind: 'content_assets',
  path: `${ROUTE_PATHS.marketingContentAssets}/:assetId`,
});
expectPolicy(findRoutePolicyEntry(`${ROUTE_PATHS.marketingContentAssets}/:assetId`), {
  kind: 'content_assets',
  path: `${ROUTE_PATHS.marketingContentAssets}/:assetId`,
});
expectPolicy(findRoutePolicyEntry(`${ROUTE_PATHS.marketingContentAssets}/asset-fixture-001/events`), {
  kind: 'content_assets',
  path: `${ROUTE_PATHS.marketingContentAssets}/:assetId`,
});

assertEqual(
  findRoutePolicyEntry('/not-registered'),
  undefined,
  'unknown route should remain undefined so auth-navigation can deny it explicitly',
);

reportOk('normalization, longest-prefix, alias precedence, and unknown-route cases passed.');
