import {
  checkReleaseVersionBump,
  classifyReleaseImpactingFiles,
  createEndpointFileReader,
  releaseImpactingClassificationNeedsFileSource,
} from './quality-release-version-bump-core.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Release version bump behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

function packageJson(version, extra = {}) {
  return JSON.stringify({
    name: 'aios',
    version,
    private: true,
    scripts: {},
    ...extra,
  });
}

function packageLock(version, extra = {}) {
  return JSON.stringify({
    name: 'aios',
    version,
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'aios',
        version,
      },
    },
    ...extra,
  });
}

function readme(version) {
  return `# AIOS\n\n当前版本：\`${version}\`\n`;
}

function changelog(version) {
  return `# Changelog\n\n## Unreleased\n\n- 尚无未发布变更记录。\n\n## ${version} - 2026-05-11\n\n- changed\n`;
}

function files(version) {
  return {
    'package.json': packageJson(version),
    'package-lock.json': packageLock(version),
    'README.md': readme(version),
    'CHANGELOG.md': changelog(version),
  };
}

function packageJsonWithScript(version, scriptName, command) {
  return packageJson(version, {
    scripts: {
      [scriptName]: command,
    },
  });
}

function runCase({
  changedFiles,
  currentVersion = '2.2.1',
  previousVersion = '2.2.0',
  currentOverrides = {},
  previousOverrides = {},
}) {
  return checkReleaseVersionBump({
    changedFiles,
    currentFiles: {
      ...files(currentVersion),
      ...currentOverrides,
    },
    previousFiles: {
      ...files(previousVersion),
      ...previousOverrides,
    },
  });
}

export function runReleaseVersionBumpBehaviorFixtures(assertions) {
  useAssertions(assertions);

{
  const result = runCase({
    changedFiles: [{ file: 'apps/web-vite/src/app/marketing/creator-library/page.tsx', status: 'M' }],
  });
  assertEqual(result.ok, true, 'release-impacting source with version bump should pass');
}

{
  const result = runCase({
    changedFiles: [{ file: 'apps/web-vite/src/app/marketing/creator-library/page.tsx', status: 'M' }],
    currentVersion: '2.2.0',
    previousVersion: '2.2.0',
  });
  assertEqual(result.ok, false, 'release-impacting source without version bump should fail');
  assertIncludes(
    result.findings.join('\n'),
    'release-impacting changes require package.json version to increase',
    'missing version bump finding should explain package version',
  );
}

{
  const result = runCase({
    changedFiles: [{ file: 'apps/web-vite/src/app/marketing/creator-library/page.tsx', status: 'M' }],
    currentOverrides: {
      'CHANGELOG.md': changelog('2.2.0'),
    },
  });
  assertEqual(result.ok, false, 'version bump without matching changelog release section should fail');
  assertIncludes(
    result.findings.join('\n'),
    'CHANGELOG.md must contain a release section for 2.2.1',
    'missing changelog section should be explicit',
  );
}

{
  const result = runCase({
    changedFiles: [{ file: 'package.json', status: 'M' }],
    currentVersion: '2.2.1',
    previousVersion: '2.2.0',
  });
  assertEqual(result.ok, true, 'version-only release metadata package change should pass without requiring another bump');
}

{
  const result = runCase({
    changedFiles: [{ file: 'README.md', status: 'M' }],
    currentVersion: '2.2.0',
    previousVersion: '2.2.0',
  });
  assertEqual(result.ok, true, 'docs-only change should not require a release bump');
}

{
  const result = runCase({
    changedFiles: [
      { file: '.trellis/tasks/06-28-fix-shortvideo-post-deploy-sql-gate/task.json', status: 'A' },
      { file: '.trellis/tasks/06-28-fix-shortvideo-post-deploy-sql-gate/implement.jsonl', status: 'A' },
    ],
    currentVersion: '2.2.0',
    previousVersion: '2.2.0',
  });
  assertEqual(result.ok, true, 'Trellis task history should not require a product release bump');
}

{
  const result = runCase({
    changedFiles: [{ file: 'start-services.sh', status: 'M' }],
    currentVersion: '2.2.0',
    previousVersion: '2.2.0',
  });
  assertEqual(result.ok, true, 'local development service script changes should not require a product release bump');
}

{
  const result = runCase({
    changedFiles: [
      { file: '.github/workflows/quality-gate.yml', status: 'M' },
      { file: '.github/workflows/sync-aios-public.yml', status: 'A' },
      { file: 'scripts/checks/quality-runner/cache-local.mjs', status: 'A' },
      { file: 'scripts/config/public-export/aios-public-policy.json', status: 'A' },
      { file: 'scripts/config/public-export/LICENSE.public.txt', status: 'A' },
      { file: 'scripts/checks/repo/naming.mjs', status: 'A' },
      { file: 'scripts/lib/repo/repo-governance-gates.mjs', status: 'A' },
      { file: 'scripts/lib/quality/quality-runner-slices.mjs', status: 'M' },
      { file: 'package.json', status: 'M' },
      { file: 'docs/QUALITY_GATE_RUNNER.md', status: 'M' },
    ],
    currentVersion: '2.2.1',
    previousVersion: '2.2.1',
    currentOverrides: {
      'package.json': packageJsonWithScript(
        '2.2.1',
        'verify:repo:naming',
        'node scripts/checks/repo/naming.mjs',
      ),
    },
    previousOverrides: {
      'package.json': packageJsonWithScript(
        '2.2.1',
        'verify:repo:naming',
        undefined,
      ),
    },
  });
  assertEqual(result.ok, true, 'quality gate infrastructure-only changes should not require a product release bump');
}

{
  const result = runCase({
    changedFiles: [
      { file: 'scripts/build/write-frontend-build-manifest.mjs', status: 'M' },
      { file: 'scripts/ci/run-quality-profile.mjs', status: 'M' },
      { file: 'scripts/frontend/smoke-frontend-routes.mjs', status: 'M' },
      'R097:scripts/lib/frontend/app-route-paths.mjs',
      { file: 'scripts/ops/check-frontend-deploy-manifest.sh', status: 'M' },
      { file: 'scripts/quality-runner.mjs', status: 'M' },
      { file: 'scripts/verify-frontend-preflight.sh', status: 'M' },
    ],
    currentVersion: '2.2.1',
    previousVersion: '2.2.1',
  });
  assertEqual(result.ok, true, 'script tooling layout changes should not require a product release bump');
}

{
  const result = runCase({
    changedFiles: [{ file: 'package.json', status: 'M' }],
    currentVersion: '2.2.1',
    previousVersion: '2.2.1',
    currentOverrides: {
      'package.json': packageJsonWithScript(
        '2.2.1',
        'verify:frontend:creator-library-follow-log-contract',
        'node scripts/checks/frontend-structure/creator-library-follow-log-contract.mjs',
      ),
    },
    previousOverrides: {
      'package.json': packageJson('2.2.1'),
    },
  });
  assertEqual(result.ok, true, 'frontend quality gate script wiring should not require a product release bump');
}

{
  const result = runCase({
    changedFiles: [
      { file: 'scripts/checks/frontend-structure/creator-library-follow-log-contract.mjs', status: 'A' },
      { file: 'scripts/lib/frontend/frontend-structure-gates.mjs', status: 'M' },
      { file: 'scripts/lib/ci/verify-ci-gates.mjs', status: 'M' },
      { file: 'docs/QUALITY_GATE_RUNNER.md', status: 'M' },
    ],
    currentVersion: '2.2.1',
    previousVersion: '2.2.1',
  });
  assertEqual(result.ok, true, 'quality gate checker and registry implementation changes should not require a product release bump');
}

{
  const result = runCase({
    changedFiles: [
      { file: 'package.json', status: 'M' },
      { file: '.gitignore', status: 'M' },
    ],
    currentVersion: '2.2.1',
    previousVersion: '2.2.1',
    currentOverrides: {
      'package.json': packageJsonWithScript(
        '2.2.1',
        'lint',
        'eslint . --cache --cache-location .cache/eslint/full/ --cache-strategy content',
      ),
      '.gitignore': '.cache/aios-quality/\n.cache/aios-quality-remote/\n.cache/eslint/\n.cache/tsc/\n',
    },
    previousOverrides: {
      'package.json': packageJsonWithScript('2.2.1', 'lint', 'eslint .'),
      '.gitignore': '.cache/aios-quality/\n',
    },
  });
  assertEqual(result.ok, true, 'quality gate lint cache wiring should not require a product release bump');
}

{
  const lintWithoutRetiredRootFallback = 'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts --cache --cache-location .cache/eslint/full/ --cache-strategy content';
  const lintWithRetiredRootFallback = 'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts --no-error-on-unmatched-pattern --cache --cache-location .cache/eslint/full/ --cache-strategy content';
  const result = runCase({
    changedFiles: [
      { file: 'package.json', status: 'M' },
    ],
    currentVersion: '2.2.1',
    previousVersion: '2.2.1',
    currentOverrides: {
      'package.json': packageJsonWithScript('2.2.1', 'lint', lintWithoutRetiredRootFallback),
    },
    previousOverrides: {
      'package.json': packageJsonWithScript('2.2.1', 'lint', lintWithRetiredRootFallback),
    },
  });
  assertEqual(result.ok, true, 'removing the retired-root lint fallback should not require a product release bump');
}

{
  const result = runCase({
    changedFiles: [
      { file: 'package.json', status: 'M' },
      { file: 'eslint.config.mjs', status: 'M' },
      { file: 'tsconfig.frontend.json', status: 'A' },
    ],
    currentVersion: '2.2.1',
    previousVersion: '2.2.1',
    currentOverrides: {
      'eslint.config.mjs': 'export default [];\n',
      'tsconfig.frontend.json': '{ "extends": "./tsconfig.json" }\n',
      'package.json': packageJson('2.2.1', {
        scripts: {
          'lint:scripts': 'eslint scripts eslint.config.mjs backend-rust/scripts --cache --cache-location .cache/eslint/scripts/ --cache-strategy content',
          'type-check': 'tsc -p tsconfig.frontend.json --noEmit',
        },
      }),
    },
    previousOverrides: {
      'eslint.config.mjs': 'export default [];\n',
      'package.json': packageJson('2.2.1', {
        scripts: {
          'type-check': 'tsc --noEmit',
        },
      }),
    },
  });
  assertEqual(result.ok, true, 'quality gate lint/type cache wiring should not require a product release bump');
}

{
  const result = runCase({
    changedFiles: [{ file: 'package.json', status: 'M' }],
    currentVersion: '2.2.0',
    previousVersion: '2.2.0',
    currentOverrides: {
      'package.json': packageJsonWithScript(
        '2.2.0',
        'verify:quality:stats-policy:required',
        'QUALITY_STATS_LIVE_BUDGET=1 QUALITY_STATS_BUDGET_PROFILE=ci-required node scripts/checks/quality-runner/cache-stats.mjs',
      ),
    },
    previousOverrides: {
      'package.json': packageJson('2.2.0'),
    },
  });
  assertEqual(result.ok, true, 'quality stats policy package script wiring should not require a product release bump');
}

{
  const result = runCase({
    changedFiles: [{ file: 'package.json', status: 'M' }],
    currentVersion: '2.2.0',
    previousVersion: '2.2.0',
    currentOverrides: {
      'package.json': packageJson('2.2.0', { scripts: { build: 'vite build --fixture-drift' } }),
    },
    previousOverrides: {
      'package.json': packageJson('2.2.0', { scripts: { build: 'vite build' } }),
    },
  });
  assertEqual(result.ok, false, 'non-gate package script changes should still require a release bump');
}

{
  const result = runCase({
    changedFiles: [{ file: 'package.json', status: 'M' }],
    currentVersion: '2.2.0',
    previousVersion: '2.2.0',
    currentOverrides: {
      'package.json': packageJsonWithScript('2.2.0', 'lint', 'eslint src'),
    },
    previousOverrides: {
      'package.json': packageJsonWithScript('2.2.0', 'lint', 'eslint .'),
    },
  });
  assertEqual(result.ok, false, 'lint coverage changes should still require a release bump');
}

{
  const result = runCase({
    changedFiles: [{ file: 'package-lock.json', status: 'M' }],
    currentVersion: '2.2.1',
    previousVersion: '2.2.0',
  });
  assertEqual(result.ok, true, 'lockfile root-version-only change should be treated as release metadata');
}

{
  const result = runCase({
    changedFiles: [{ file: 'package.json', status: 'M' }],
    currentVersion: '2.2.1',
    previousVersion: '2.2.0',
    currentOverrides: {
      'package.json': packageJson('2.2.1', { dependencies: { axios: '^1.0.0' } }),
    },
  });
  assertEqual(result.ok, true, 'package runtime change with version bump should pass');
}

{
  const result = runCase({
    changedFiles: [{ file: 'package.json', status: 'M' }],
    currentVersion: '2.2.0',
    previousVersion: '2.2.0',
    currentOverrides: {
      'package.json': packageJson('2.2.0', { dependencies: { axios: '^1.0.0' } }),
    },
  });
  assertEqual(result.ok, false, 'package runtime change without version bump should fail');
}

{
  let readCount = 0;
  const reader = createEndpointFileReader('/fixture/repo', { ref: 'HEAD' }, {
    readGitFile: (_repoRoot, _ref, file) => {
      readCount += 1;
      return `source:${file}`;
    },
    readRepoFile: () => {
      throw new Error('unexpected working-tree read');
    },
  });

  assertEqual(reader('package.json'), 'source:package.json', 'endpoint file reader should read requested git file');
  assertEqual(reader('package.json'), 'source:package.json', 'endpoint file reader should return cached git file source');
  assertEqual(readCount, 1, 'endpoint file reader should not invoke git repeatedly for the same file');
}

{
  const result = checkReleaseVersionBump({
    changedFiles: [{ file: 'docs/QUALITY_GATE_RUNNER.md', status: 'M' }],
  });
  assertEqual(result.ok, true, 'docs-only release bump check should not require package/changelog sources');
}

{
  const result = checkReleaseVersionBump({
    changedFiles: [{ file: 'scripts/checks/quality-runner/cache-local.mjs', status: 'M' }],
  });
  assertEqual(result.ok, true, 'quality infrastructure-only changes should not require package/changelog sources');
}

{
  const result = checkReleaseVersionBump({
    changedFiles: [
      { file: 'scripts/checks/repo/trellis-scaffold-behavior.py', status: 'R100' },
      { file: 'scripts/checks/repo/trellis-codex-smoke.sh', status: 'M' },
      { file: '.trellis/scripts/task.py', status: 'M' },
      { file: '.trellis/scripts/common/task_context.py', status: 'M' },
    ],
  });
  assertEqual(result.ok, true, 'Trellis tooling and Python/shell quality checks should not require a product release bump');
}

{
  const releaseImpactingFiles = classifyReleaseImpactingFiles([
    { file: 'scripts/checks/repo/trellis-scaffold-behavior.py', status: 'M' },
    { file: 'scripts/checks/repo/trellis-codex-smoke.sh', status: 'M' },
    { file: '.trellis/scripts/task.py', status: 'M' },
    { file: '.trellis/scripts/common/task_context.py', status: 'M' },
    { file: 'etl/groland_postgres/scripts/start_prefect_worker.sh', status: 'M' },
    { file: 'backend-rust/scripts/loadtest_reports_time_filter.py', status: 'M' },
  ]);
  assertEqual(
    releaseImpactingFiles.join(','),
    'etl/groland_postgres/scripts/start_prefect_worker.sh,backend-rust/scripts/loadtest_reports_time_filter.py',
    'quality-check extension support must not exempt ETL or backend runtime scripts',
  );
}

{
  let sourceReadCount = 0;
  const releaseImpactingFiles = classifyReleaseImpactingFiles(
    [
      { file: 'README.md', status: 'M' },
      { file: 'apps/web-vite/src/app/marketing/creator-library/page.tsx', status: 'M' },
      { file: 'apps/web-vite/src/app/marketing/creator-library/page.tsx', status: 'M' },
      { file: 'package.json', status: 'M' },
      { file: 'package.json', status: 'M' },
    ],
    () => {
      sourceReadCount += 1;
      return {
        previousSource: packageJson('2.2.1'),
        currentSource: packageJson('2.2.1'),
      };
    },
  );
  assertEqual(
    releaseImpactingFiles.join(','),
    'apps/web-vite/src/app/marketing/creator-library/page.tsx',
    'release classification should keep product source changes and ignore version-only package changes',
  );
  assertEqual(sourceReadCount, 1, 'release classification should only read source for files that need content-based classification');
}

{
  assertEqual(
    releaseImpactingClassificationNeedsFileSource('backend-rust/src/marketing/repository_follow_logs/query.rs'),
    false,
    'ordinary release-impacting source files should not require git-show content reads for classification',
  );
  assertEqual(
    releaseImpactingClassificationNeedsFileSource('apps/web-vite/src/app/marketing/creator-library/_components/creator-library-follow-modal.tsx'),
    false,
    'frontend source files should not require git-show content reads for classification',
  );
  assertEqual(
    releaseImpactingClassificationNeedsFileSource('package.json'),
    true,
    'package.json needs content reads to distinguish version-only and tooling-only changes',
  );
  assertEqual(
    releaseImpactingClassificationNeedsFileSource('.gitignore'),
    true,
    '.gitignore needs content reads to distinguish quality-cache-only changes',
  );
}

  return 'release-impacting source changes require package/lock/README/CHANGELOG version bump; docs and release-only changes pass.';
}
