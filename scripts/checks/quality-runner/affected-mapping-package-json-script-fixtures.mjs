import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  packageJsonChangeRequiresFullCiWithReader,
} from '../../lib/quality/quality-affected.mjs';

export function assertPackageJsonScriptFastPathBehavior({
  assertFalse,
}) {
  const repoRoot = process.cwd();
  const baselinePackageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const scriptOnlyPackageJson = structuredClone(baselinePackageJson);
  scriptOnlyPackageJson.scripts['verify:quality-runner:cache'] = 'node scripts/checks/quality-runner/cache.mjs --fixture-drift';
  scriptOnlyPackageJson.scripts['verify:ci:wiring'] = 'node scripts/checks/ci/package-wiring.mjs --fixture-drift';
  assertFalse(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => scriptOnlyPackageJson,
      previousPackageJson: () => baselinePackageJson,
      repoRoot,
    }),
    'package quality-runner/CI meta script-only changes should avoid full static CI',
  );

  const oldLintPackageJson = structuredClone(baselinePackageJson);
  oldLintPackageJson.scripts.lint = 'eslint .';
  const lintCachePackageJson = structuredClone(baselinePackageJson);
  // Keep this fixture about cache flags, independent of newly added lint surfaces.
  lintCachePackageJson.scripts.lint = 'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts apps/web-vite/vitest.coverage.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts --cache --cache-location .cache/eslint/full/ --cache-strategy content';
  assertFalse(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => lintCachePackageJson,
      previousPackageJson: () => oldLintPackageJson,
      repoRoot,
    }),
    'lint cache-only script migration should avoid full static CI',
  );

  const lintSurfacePackageJson = structuredClone(baselinePackageJson);
  const previousWithoutScriptLintPackageJson = structuredClone(baselinePackageJson);
  delete previousWithoutScriptLintPackageJson.scripts['lint:scripts'];
  lintSurfacePackageJson.scripts['lint:scripts'] = 'eslint scripts eslint.config.mjs backend-rust/scripts --cache --cache-location .cache/eslint/scripts/ --cache-strategy content';
  assertFalse(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => lintSurfacePackageJson,
      previousPackageJson: () => previousWithoutScriptLintPackageJson,
      repoRoot,
    }),
    'adding the scripts lint surface should avoid full static CI',
  );

  const typeCheckCachePackageJson = structuredClone(baselinePackageJson);
  const oldTypeCheckPackageJson = structuredClone(baselinePackageJson);
  oldTypeCheckPackageJson.scripts['type-check'] = 'tsc --noEmit';
  assertFalse(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => typeCheckCachePackageJson,
      previousPackageJson: () => oldTypeCheckPackageJson,
      repoRoot,
    }),
    'type-check tsbuildinfo cache-only script migration should avoid full static CI',
  );

  const frontendGateScriptPackageJson = structuredClone(baselinePackageJson);
  frontendGateScriptPackageJson.scripts['verify:frontend:creator-library-follow-log-contract'] = 'node scripts/checks/frontend-structure/creator-library-follow-log-contract.mjs';
  const frontendGateScriptBaselinePackageJson = structuredClone(baselinePackageJson);
  delete frontendGateScriptBaselinePackageJson.scripts['verify:frontend:creator-library-follow-log-contract'];
  assertFalse(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => frontendGateScriptPackageJson,
      previousPackageJson: () => frontendGateScriptBaselinePackageJson,
      repoRoot,
    }),
    'frontend quality gate script wiring should avoid full static CI and rely on registry/meta checks',
  );

  const frontendCoverageScriptPackageJson = structuredClone(baselinePackageJson);
  const frontendCoverageScriptBaselinePackageJson = structuredClone(baselinePackageJson);
  delete frontendCoverageScriptBaselinePackageJson.scripts['test:frontend:coverage'];
  assertFalse(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => frontendCoverageScriptPackageJson,
      previousPackageJson: () => frontendCoverageScriptBaselinePackageJson,
      repoRoot,
    }),
    'frontend coverage alias wiring should avoid full static CI and rely on the coverage registry gate',
  );

  const dashboardBehaviorScriptPackageJson = structuredClone(baselinePackageJson);
  dashboardBehaviorScriptPackageJson.scripts['verify:dashboard:creator-short-video-behavior'] =
    'node scripts/checks/dashboard/creator-short-video.behavior.mjs';
  const dashboardBehaviorScriptBaselinePackageJson = structuredClone(baselinePackageJson);
  delete dashboardBehaviorScriptBaselinePackageJson.scripts['verify:dashboard:creator-short-video-behavior'];
  assertFalse(
    packageJsonChangeRequiresFullCiWithReader({
      base: 'HEAD',
      currentPackageJson: () => dashboardBehaviorScriptPackageJson,
      previousPackageJson: () => dashboardBehaviorScriptBaselinePackageJson,
      repoRoot,
    }),
    'dashboard behavior gate script wiring should avoid full static CI and rely on registry/meta checks',
  );
}
