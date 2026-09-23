import {
  listGitFiles,
} from '../shared/guard-utils.mjs';
import {
  FRONTEND_BEHAVIOR_QUALITY_FILE_PATTERN,
} from './frontend-behavior-quality-gates.mjs';

export const FRONTEND_BEHAVIOR_GUARD_QUALITY_GUARD_NAME = 'frontend-behavior-guard-quality';
export const FRONTEND_BEHAVIOR_GUARD_QUALITY_BEHAVIOR_GUARD_NAME = 'frontend-behavior-guard-quality-behavior';
export const FRONTEND_BEHAVIOR_GUARD_QUALITY_SOURCE_ONLY_EXCEPTIONS = new Map();

export function listTrackedFrontendBehaviorQualityFiles(repoRoot) {
  return listGitFiles(['scripts/checks'], {
    cwd: repoRoot,
    filter: (file) => FRONTEND_BEHAVIOR_QUALITY_FILE_PATTERN.test(file),
  });
}

export function hasSharedBehaviorRunner(source) {
  return (
    /from\s+['"][./]*lib\/(?:frontend\/)?inline-visual-style-audit-behavior\.mjs['"]/.test(source) &&
    source.includes('runInlineVisualStyleAuditBehavior(')
  );
}

export function hasFrontendDirectHelperBehavior(source) {
  const directHelperModules = [
    'lib/app-route-paths.mjs',
    'lib/frontend/app-route-paths.mjs',
    'lib/frontend/vite-route-paths.mjs',
    'lib/shared/gate-fixture-utils.mjs',
    'lib/design/raw-color-source-allowlist.mjs',
    'lib/gate-fixture-utils.mjs',
    'lib/raw-color-source-allowlist.mjs',
    'lib/vite-route-paths.mjs',
    'frontend/smoke-frontend-routes.mjs',
    'smoke-frontend-routes.mjs',
  ];

  return (
    directHelperModules.some((moduleName) => (
      source.includes(`from '${moduleName}'`) ||
      source.includes(`from "${moduleName}"`) ||
      source.includes(`/${moduleName}'`) ||
      source.includes(`/${moduleName}"`)
    )) &&
    source.includes('createCheckGuard(')
  );
}

export function hasShellRuntimeBehavior(source) {
  return (
    source.includes('spawnSync(') &&
    source.includes("spawnSync('bash'") &&
    source.includes('mkdtempSync(') &&
    source.includes('assert.')
  );
}

export const FRONTEND_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS = Object.freeze([
  hasSharedBehaviorRunner,
  hasFrontendDirectHelperBehavior,
  hasShellRuntimeBehavior,
]);
