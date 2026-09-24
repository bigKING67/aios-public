import {
  VERIFY_CI_META_GATES,
} from './verify-ci-meta-gates.mjs';
import {
  QUALITY_ENTRYPOINT_SCRIPTS,
  QUALITY_RUNNER_BEHAVIOR_COMMAND,
  QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS,
  VIRTUAL_QUALITY_PACKAGE_SCRIPTS,
  buildQualityGateRegistry,
} from '../quality/quality-gate-registry.mjs';
import {
  checkPackageWiring,
  formatPackageWiringFailure,
  listTrackedLintableSourceFiles,
} from './package-wiring-core.mjs';

const PASS_OUTPUT = '[verify-ci-package-wiring] OK: quality gates checked.\n';
const ESLINT_CONFIG_FIXTURE = `
const config = [{
  ignores: [
    '**/node_modules/**',
    '.cache/**',
    'apps/web-vite/dist/**',
  ],
}];

export default config;
`;
const QUALITY_WORKFLOW_FIXTURE = `
name: Quality Gate

jobs:
  quality-gate:
    steps:
      - name: Restore AIOS quality cache
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
        with:
          path: |
            .cache/aios-quality
            .cache/aios-quality-remote
            .cache/eslint
            .cache/tsc
          key: aios-quality-\${{ runner.os }}-\${{ hashFiles('package-lock.json', 'tsconfig*.json', 'apps/**/tsconfig*.json', 'eslint.config.*', 'scripts/lib/quality/**/*.mjs', 'scripts/checks/quality-runner/**') }}
          restore-keys: |
            aios-quality-\${{ runner.os }}-

      - name: Restore Cargo cache
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
        with:
          path: backend-rust/target
          key: aios-cargo-\${{ runner.os }}

      - name: Verify (lint + build + type-check + shell + frontend preflight)
        env:
          AIOS_QUALITY_REMOTE_CACHE_MODE: readwrite
          AIOS_QUALITY_REMOTE_CACHE_URL: file://\${{ github.workspace }}/.cache/aios-quality-remote
        run: npm run verify:ci

      - name: Verify bounded warm-cache reuse
        env:
          AIOS_QUALITY_REMOTE_CACHE_MODE: readwrite
          AIOS_QUALITY_REMOTE_CACHE_URL: file://\${{ github.workspace }}/.cache/aios-quality-remote
        run: |
          node scripts/quality-runner.mjs remote-cache smoke --json
          npm run verify:ci

      - name: Verify quality stats policy
        env:
          QUALITY_STATS_BUDGET_LIMIT: 1
          AIOS_QUALITY_REMOTE_CACHE_MODE: readwrite
          AIOS_QUALITY_REMOTE_CACHE_URL: file://\${{ github.workspace }}/.cache/aios-quality-remote
        run: |
          status=0
          npm run verify:quality:stats-policy || status=$?
          QUALITY_STATS_POLICY_EXIT_CODE="$status" node scripts/ci/write-quality-stats-step-summary.mjs
          exit "$status"
`;
const TRACKED_SOURCE_FILES_FIXTURE = Object.freeze([
  'apps/web-vite/src/main.tsx',
  'apps/web-vite/vite.config.ts',
  'backend-rust/scripts/probe.js',
  'eslint.config.mjs',
  'postcss.config.js',
  'scripts/checks/probe.mjs',
  'apps/web-vite/src/app/page.tsx',
]);
const GIT_LS_FILES_FIXTURE = [
  'AGENTS.md',
  'README.md',
  'backend-rust/scripts/probe.js',
  'docs/QUALITY_GATE_RUNNER.md',
  'eslint.config.mjs',
  'package.json',
  'postcss.config.js',
  'scripts/checks/probe.mjs',
  'apps/web-vite/src/app/page.tsx',
].join('\n');

function fixtureScripts(overrides = {}) {
  const scripts = {
    ...QUALITY_ENTRYPOINT_SCRIPTS,
    ...QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS,
    'verify:quality-runner': QUALITY_RUNNER_BEHAVIOR_COMMAND,
    lint: 'eslint apps/web-vite/src apps/web-vite/vite.config.ts apps/web-vite/vitest.config.ts apps/web-vite/vitest.coverage.config.ts .pi/extensions/trellis/index.ts tailwind.config.ts eslint.config.mjs postcss.config.js scripts backend-rust/scripts docker/content-production/renderer --cache --cache-location .cache/eslint/full/ --cache-strategy content',
    'lint:scripts': 'eslint scripts eslint.config.mjs backend-rust/scripts --cache --cache-location .cache/eslint/scripts/ --cache-strategy content',
    build: 'npm run build:vite',
    'build:vite': 'vite build --config apps/web-vite/vite.config.ts && node scripts/build/write-frontend-build-manifest.mjs',
    'type-check': 'tsc -p tsconfig.frontend.json --noEmit',
    'test:frontend:smoke:public': 'npm run test:frontend:smoke',
    'test:frontend:smoke:preview': 'node scripts/frontend/run-frontend-smoke-preview.mjs --profile public',
    'test:frontend:smoke:preview:performance': 'FRONTEND_SMOKE_PERFORMANCE_BUDGET=1 node scripts/frontend/run-frontend-smoke-preview.mjs --profile public',
    'test:frontend:smoke:preview:authenticated:performance': 'FRONTEND_SMOKE_PERFORMANCE_BUDGET=1 node scripts/frontend/run-frontend-smoke-preview.mjs --profile authenticated',
  };
  for (const gate of VERIFY_CI_META_GATES) {
    scripts[gate.name] = gate.command;
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const registry = buildQualityGateRegistry({ packageJson: { scripts } });
    for (const gate of registry.gates) {
      if (Object.hasOwn(VIRTUAL_QUALITY_PACKAGE_SCRIPTS, gate.name)) {
        continue;
      }
      scripts[gate.name] ??= gate.command || `fixture command for ${gate.name}`;
    }
  }
  for (const [scriptName, command] of Object.entries(overrides)) {
    if (command === undefined) {
      if (scriptName !== 'verify:frontend:preflight') {
        delete scripts[scriptName];
      }
    } else if (command === null) {
      delete scripts[scriptName];
    } else {
      scripts[scriptName] = command;
    }
  }
  return scripts;
}

function runWiringGuard(overrides = {}, options = {}) {
  const packageJson = {
    private: true,
    scripts: fixtureScripts(overrides),
  };
  const registry = buildQualityGateRegistry({ packageJson });
  const { findings } = checkPackageWiring({
    eslintConfigText: options.eslintConfigText ?? ESLINT_CONFIG_FIXTURE,
    packageJson,
    qualityWorkflowText: options.qualityWorkflowText ?? QUALITY_WORKFLOW_FIXTURE,
    registry,
    trackedJavascriptFiles: options.trackedJavascriptFiles ?? TRACKED_SOURCE_FILES_FIXTURE,
  });

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: PASS_OUTPUT,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatPackageWiringFailure(findings)}\n`,
  };
}

export function runPackageWiringBehaviorFixtures(assertions) {
  const {
    assertEqual,
    assertIncludes,
  } = assertions;

  {
    const result = runWiringGuard();
    assertEqual(result.status, 0, `baseline fixture should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    assertIncludes(result.stdout, 'quality gates checked', 'passing output should summarize registry gates');
  }

  {
    const result = runWiringGuard({ 'verify:ci': 'bash scripts/verify-ci.sh' });
    assertEqual(result.status, 1, 'legacy verify:ci package script should fail');
    assertIncludes(result.stderr, 'verify:ci package script drifted', 'legacy verify:ci drift should be reported');
  }

  {
    const result = runWiringGuard({ lint: 'eslint . --cache --cache-location .cache/eslint/full/ --cache-strategy content' });
    assertEqual(result.status, 1, 'legacy full lint root scan should fail');
    assertIncludes(result.stderr, 'lint package script drifted', 'full lint root scan drift should be reported');
  }

  {
    const result = runWiringGuard({ 'verify:ci:wiring': 'node scripts/wrong.mjs' });
    assertEqual(result.status, 1, 'meta gate command drift should fail');
    assertIncludes(result.stderr, 'verify:ci:wiring command drifted', 'meta command drift should be reported');
  }

  {
    const result = runWiringGuard({ 'verify:ci:release-version-bump': 'node scripts/wrong-release.mjs' });
    assertEqual(result.status, 1, 'release version bump meta gate drift should fail');
    assertIncludes(result.stderr, 'verify:ci:release-version-bump command drifted', 'release bump meta command drift should be reported');
  }

  {
    const result = runWiringGuard({ 'verify:quality-runner:affected': 'node scripts/checks/quality-runner/affected.mjs --drift' });
    assertEqual(result.status, 1, 'drifted virtual compatibility affected slice package script should fail');
    assertIncludes(result.stderr, 'verify:quality-runner:affected is a virtual compatibility quality-runner slice', 'affected compatibility virtual slice package script should be reported');
  }

  {
    const result = runWiringGuard({ 'verify:quality-runner:cache': 'node scripts/checks/quality-runner/cache.mjs --drift' });
    assertEqual(result.status, 1, 'drifted virtual compatibility quality-runner slice package script should fail');
    assertIncludes(result.stderr, 'verify:quality-runner:cache is a virtual compatibility quality-runner slice', 'compatibility virtual slice package script should be reported');
  }

  {
    const result = runWiringGuard({ 'verify:quality-runner:hook': 'node scripts/checks/quality-runner/behavior.mjs --slice hook' });
    assertEqual(result.status, 1, 'drifted primary quality-runner slice package script should fail');
    assertIncludes(result.stderr, 'verify:quality-runner:hook package script drifted', 'primary slice package script drift should be reported');
  }

  {
    const result = runWiringGuard({ 'verify:frontend:preflight': null });
    assertEqual(result.status, 1, 'missing registered command should fail');
    assertIncludes(result.stderr, 'verify:frontend:preflight package script is missing', 'missing package script should be reported');
  }

  {
    const result = runWiringGuard({}, {
      eslintConfigText: ESLINT_CONFIG_FIXTURE.replace("    '.cache/**',\n", ''),
    });
    assertEqual(result.status, 1, 'missing eslint cache ignore should fail');
    assertIncludes(result.stderr, 'eslint.config.mjs must ignore .cache/**', 'missing generated cache ignore should be reported');
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace(
        'uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9',
        'uses: actions/cache@v4',
      ),
    });
    assertEqual(result.status, 1, 'floating Node 20 AIOS cache action should fail');
    assertIncludes(
      result.stderr,
      'Restore AIOS quality cache must use actions/cache v6.1.0 pinned to',
      'AIOS cache action runtime and immutable pin should be enforced',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace(
        `      - name: Restore Cargo cache
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9`,
        `      - name: Restore Cargo cache
        uses: actions/cache@v4`,
      ),
    });
    assertEqual(result.status, 1, 'floating Node 20 Cargo cache action should fail');
    assertIncludes(
      result.stderr,
      'Restore Cargo cache must use actions/cache v6.1.0 pinned to',
      'Cargo cache action runtime and immutable pin should be enforced',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: `
on:
  pull_request:
    paths-ignore:
      - '**/*.md'
${QUALITY_WORKFLOW_FIXTURE}`,
    });
    assertEqual(result.status, 1, 'blanket Markdown workflow exclusion should fail');
    assertIncludes(
      result.stderr,
      'must not skip all Markdown changes',
      'governed Markdown workflow coverage should be enforced',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace('            .cache/aios-quality-remote\n', ''),
    });
    assertEqual(result.status, 1, 'missing persisted remote cache path should fail');
    assertIncludes(
      result.stderr,
      '.github/workflows/quality-gate.yml cache step must persist .cache/aios-quality-remote',
      'missing remote cache path should be reported',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace(", 'scripts/lib/quality/**/*.mjs'", ''),
    });
    assertEqual(result.status, 1, 'missing quality runner library cache key input should fail');
    assertIncludes(
      result.stderr,
      ".github/workflows/quality-gate.yml cache key must include 'scripts/lib/quality/**/*.mjs'",
      'missing quality runner library cache key input should be reported',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace('          AIOS_QUALITY_REMOTE_CACHE_MODE: readwrite\n', ''),
    });
    assertEqual(result.status, 1, 'missing remote cache readwrite env should fail');
    assertIncludes(
      result.stderr,
      '.github/workflows/quality-gate.yml Verify step must set AIOS_QUALITY_REMOTE_CACHE_MODE: readwrite',
      'missing remote cache mode should be reported',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace('            aios-quality-${{ runner.os }}-\n', ''),
    });
    assertEqual(result.status, 1, 'missing broad restore key should fail');
    assertIncludes(
      result.stderr,
      '.github/workflows/quality-gate.yml cache step must keep broad restore key aios-quality-${{ runner.os }}-',
      'missing broad restore key should be reported',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace('Verify bounded warm-cache reuse', 'Removed warm validation'),
    });
    assertEqual(result.status, 1, 'missing bounded warm verification must fail');
    assertIncludes(result.stderr, 'bounded full warm-cache verification', 'warm measurement contract');
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace('QUALITY_STATS_BUDGET_LIMIT: 1', 'QUALITY_STATS_BUDGET_LIMIT: 200'),
    });
    assertEqual(result.status, 1, 'mixed cold/warm policy sample must fail');
    assertIncludes(result.stderr, 'latest bounded warm run', 'sample scope contract');
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace('        run: npm run verify:ci\n', '        run: npm run lint\n'),
    });
    assertEqual(result.status, 1, 'drifted canonical verify command should fail');
    assertIncludes(
      result.stderr,
      '.github/workflows/quality-gate.yml Verify step must run npm run verify:ci',
      'drifted verify command should be reported',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace(
        `
      - name: Verify quality stats policy
        env:
          QUALITY_STATS_BUDGET_LIMIT: 1
          AIOS_QUALITY_REMOTE_CACHE_MODE: readwrite
          AIOS_QUALITY_REMOTE_CACHE_URL: file://\${{ github.workspace }}/.cache/aios-quality-remote
        run: |
          status=0
          npm run verify:quality:stats-policy || status=$?
          QUALITY_STATS_POLICY_EXIT_CODE="$status" node scripts/ci/write-quality-stats-step-summary.mjs
          exit "$status"
`,
        '',
      ),
    });
    assertEqual(result.status, 1, 'missing stats policy step should fail');
    assertIncludes(
      result.stderr,
      '.github/workflows/quality-gate.yml must keep the stats policy step',
      'missing stats policy step should be reported',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace(
        '          npm run verify:quality:stats-policy || status=$?\n',
        '          npm run verify:quality:stats || status=$?\n',
      ),
    });
    assertEqual(result.status, 1, 'drifted stats policy command should fail');
    assertIncludes(
      result.stderr,
      '.github/workflows/quality-gate.yml stats policy step must run npm run verify:quality:stats-policy',
      'drifted stats policy command should be reported',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace(
        '          QUALITY_STATS_POLICY_EXIT_CODE="$status" node scripts/ci/write-quality-stats-step-summary.mjs\n',
        '',
      ),
    });
    assertEqual(result.status, 1, 'missing stats policy summary command should fail');
    assertIncludes(
      result.stderr,
      '.github/workflows/quality-gate.yml stats policy step must write the GitHub summary with QUALITY_STATS_POLICY_EXIT_CODE="$status" node scripts/ci/write-quality-stats-step-summary.mjs',
      'missing stats policy summary command should be reported',
    );
  }

  {
    const result = runWiringGuard({}, {
      qualityWorkflowText: QUALITY_WORKFLOW_FIXTURE.replace('          exit "$status"\n', ''),
    });
    assertEqual(result.status, 1, 'missing stats policy status exit should fail');
    assertIncludes(
      result.stderr,
      '.github/workflows/quality-gate.yml stats policy step must exit with the original policy status after writing the GitHub summary',
      'missing stats policy status exit should be reported',
    );
  }

  {
    const result = runWiringGuard({}, {
      trackedJavascriptFiles: [
        ...TRACKED_SOURCE_FILES_FIXTURE,
        'legacy-browser-helper.js',
      ],
    });
    assertEqual(result.status, 1, 'uncovered tracked JavaScript file should fail');
    assertIncludes(result.stderr, 'explicit surface misses tracked source files', 'uncovered tracked source file should be reported');
  }

  {
    const result = runWiringGuard({}, {
      trackedJavascriptFiles: [
        ...TRACKED_SOURCE_FILES_FIXTURE,
        'src/app/legacy-page.tsx',
      ],
    });
    assertEqual(result.status, 1, 'retired root frontend source should fail');
    assertIncludes(
      result.stderr,
      'src/app/legacy-page.tsx',
      'root source retirement should reject reintroduced frontend application files',
    );
  }

  {
    const calls = [];
    const trackedSourceFiles = listTrackedLintableSourceFiles('/repo-fixture', {
      fileExists: () => true,
      gitRunner(command, args, options) {
        calls.push({ args, command, options });
        return Buffer.from(GIT_LS_FILES_FIXTURE.replaceAll('\n', '\0'), 'utf8');
      },
    });
    assertEqual(calls.length, 1, 'tracked JavaScript listing should run one git command');
    assertEqual(
      calls[0].args.join(' '),
      'ls-files -z --cached --others --exclude-standard -- *.cjs *.js *.jsx *.mjs *.ts *.tsx',
      'tracked source listing should include existing tracked and untracked lintable files',
    );
    assertEqual(
      trackedSourceFiles.join(','),
      [
        'backend-rust/scripts/probe.js',
        'eslint.config.mjs',
        'postcss.config.js',
        'scripts/checks/probe.mjs',
        'apps/web-vite/src/app/page.tsx',
      ].join(','),
      'tracked source listing should preserve lint-covered JavaScript and TypeScript extensions',
    );
  }

  return 'pass, legacy entrypoint drift, lint surface drift, meta command drift, virtual slice drift, missing command, eslint cache ignore, workflow remote cache contract, workflow restore-key, verify-command and stats-policy drift, and explicit lint surface coverage checks passed.';
}
