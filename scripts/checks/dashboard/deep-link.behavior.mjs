#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

async function importDashboardDeepLinkHelpers() {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'dashboard-deep-link-'));
  const entryPath = path.join(tempDir, 'entry.ts');
  const outputPath = path.join(tempDir, 'bundle.mjs');

  writeFileSync(
    entryPath,
    [
      `export {`,
      `  normalizeDimensionByTab,`,
      `  resolveDefaultTabForDimension,`,
      `} from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/_components/dashboard-date-range-filters'))};`,
      `export { resolveInitialDashboardState } from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/_components/dashboard-date-range-initial-state'))};`,
      `export { shouldPreserveInitialPlatformDeepLink } from ${JSON.stringify(path.join(REPO_ROOT, 'apps/web-vite/src/app/dashboard/_components/dashboard-filter-state'))};`,
      '',
    ].join('\n'),
    'utf8'
  );

  await build({
    entryPoints: [entryPath],
    outfile: outputPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    logLevel: 'silent',
  });

  try {
    return await import(pathToFileURL(outputPath).href);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const {
  normalizeDimensionByTab,
  resolveDefaultTabForDimension,
  resolveInitialDashboardState,
  shouldPreserveInitialPlatformDeepLink,
} = await importDashboardDeepLinkHelpers();

assert.equal(resolveDefaultTabForDimension('qianchuan'), 'douyin', 'qianchuan deep link should infer Douyin tab');
assert.equal(resolveDefaultTabForDimension('live'), 'douyin', 'live deep link should infer Douyin tab');
assert.equal(resolveDefaultTabForDimension('shortVideo'), 'douyin', 'short-video deep link should infer Douyin tab');
assert.equal(resolveDefaultTabForDimension('goodsCard'), 'douyin', 'goods-card deep link should infer Douyin tab');
assert.equal(resolveDefaultTabForDimension('business'), 'overview', 'business should keep Overview as default tab');

const qianchuanState = resolveInitialDashboardState({ dimension: 'qianchuan' });
assert.equal(qianchuanState.activeTab, 'douyin', 'dimension=qianchuan without tab should start on Douyin');
assert.equal(
  qianchuanState.activeDimension,
  'qianchuan',
  'dimension=qianchuan without tab should preserve qianchuan dimension'
);

const liveState = resolveInitialDashboardState({ dimension: 'live' });
assert.equal(liveState.activeTab, 'douyin', 'dimension=live without tab should start on Douyin');
assert.equal(liveState.activeDimension, 'live', 'dimension=live without tab should preserve live dimension');

const explicitOverviewState = resolveInitialDashboardState({
  tab: 'overview',
  dimension: 'qianchuan',
});
assert.equal(explicitOverviewState.activeTab, 'overview', 'explicit tab=overview should remain authoritative');
assert.equal(
  explicitOverviewState.activeDimension,
  'business',
  'explicit tab=overview should normalize qianchuan to overview business'
);

assert.equal(
  normalizeDimensionByTab('overview', 'qianchuan'),
  'business',
  'overview still only supports business dimension'
);

assert.equal(
  shouldPreserveInitialPlatformDeepLink({
    activeTab: 'douyin',
    allowedTabs: ['overview'],
    initialActiveTab: 'douyin',
    preserveDisallowedInitialTab: true,
  }),
  true,
  'initial platform deep links should not be silently collapsed to Overview'
);

assert.equal(
  shouldPreserveInitialPlatformDeepLink({
    activeTab: 'tmall',
    allowedTabs: ['overview'],
    initialActiveTab: 'douyin',
    preserveDisallowedInitialTab: true,
  }),
  false,
  'non-initial platform tabs should still respect allowed-tab enforcement'
);

assert.equal(
  shouldPreserveInitialPlatformDeepLink({
    activeTab: 'douyin',
    allowedTabs: ['overview', 'douyin'],
    initialActiveTab: 'douyin',
    preserveDisallowedInitialTab: true,
  }),
  false,
  'allowed platform tabs do not need the preservation bypass'
);

console.log('[dashboard-deep-link-behavior] OK');
