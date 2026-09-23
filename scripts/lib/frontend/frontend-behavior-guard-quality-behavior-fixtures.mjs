import { auditBehaviorGuardQuality } from '../shared/behavior-guard-quality.mjs';
import {
  FRONTEND_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS,
} from './frontend-behavior-guard-quality-core.mjs';

const SOURCE_ONLY_FIXTURE_SNIPPETS = [
  'const bannedSnippets = [];',
  'const requiredSnippets = [];',
  'console.log(bannedSnippets, requiredSnippets);',
];

function runQualityGuard(files) {
  const behaviorFiles = Object.keys(files)
    .filter((file) => /^scripts\/checks\/(?!weekly(?:\/|-tabs\/)).+\.behavior\.mjs$/.test(file))
    .sort();
  const result = auditBehaviorGuardQuality({
    behaviorFiles,
    extraRuntimeDetectors: FRONTEND_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS,
    readSource: (behaviorFile) => files[behaviorFile],
    sourceOnlyExceptions: new Map(),
  });

  if (result.findings.length === 0) {
    return {
      status: 0,
      stdout: `[frontend-behavior-guard-quality] OK: scanned ${behaviorFiles.length} behavior guards; runtime+structural ${result.runtimeAndStructuralCount}, runtime-only ${result.runtimeOnlyCount}, structural-only ${result.structuralOnlyCount}, source-only ${result.sourceOnlyCount}, documented source-only exceptions 0.\n`,
      stderr: '',
    };
  }

  const lines = ['[frontend-behavior-guard-quality] Frontend behavior guard quality drift was detected:'];
  for (const finding of result.findings) {
    lines.push(`- ${finding}`);
  }
  lines.push('', 'Prefer temp-repo runtime behavior checks or structural parsers. Registry presence alone is not enough.');
  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runQualityGuard(files));
}

export function runFrontendBehaviorGuardQualityBehaviorFixtures(assertions) {
  const {
    assertEqual,
    assertIncludes,
    assertNotIncludes,
  } = assertions;

  withFixture(
    {
      'scripts/checks/frontend/runtime.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { spawnSync } from 'node:child_process';",
        "const TARGET_SCRIPT = 'scripts/checks/frontend/target.mjs';",
        'spawnSync(process.execPath, [TARGET_SCRIPT], { encoding: "utf8" });',
        '',
      ].join('\n'),
      'scripts/checks/frontend/structural.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { parse } from '@babel/parser';",
        "console.log(typeof parse === 'function');",
        '',
      ].join('\n'),
      'scripts/checks/frontend/shared-runner.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { runInlineVisualStyleAuditBehavior } from './lib/inline-visual-style-audit-behavior.mjs';",
        'runInlineVisualStyleAuditBehavior({});',
        '',
      ].join('\n'),
      'scripts/checks/app/route-paths.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { createCheckGuard } from './lib/guard-utils.mjs';",
        "import { routePathForPageFile } from './lib/app-route-paths.mjs';",
        "createCheckGuard('fixture').assertEqual(routePathForPageFile('apps/web-vite/src/app/page.tsx'), '/', 'root route');",
        '',
      ].join('\n'),
      'scripts/checks/shared/gate-fixture-utils.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';",
        "import { gateNames } from '../../lib/shared/gate-fixture-utils.mjs';",
        "createCheckGuard('fixture').assertDeepEqual(gateNames([{ name: 'verify:x' }]), ['verify:x'], 'names');",
        '',
      ].join('\n'),
      'scripts/checks/frontend/smoke.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';",
        "import { evaluateSnapshot } from '../../frontend/smoke-frontend-routes.mjs';",
        "createCheckGuard('fixture').assertEqual(typeof evaluateSnapshot, 'function', 'smoke evaluator');",
        '',
      ].join('\n'),
      'scripts/checks/deploy/shell.behavior.mjs': [
        '#!/usr/bin/env node',
        "import assert from 'node:assert/strict';",
        "import { spawnSync } from 'node:child_process';",
        "import { mkdtempSync } from 'node:fs';",
        "const tmp = mkdtempSync('/tmp/fixture-');",
        "const result = spawnSync('bash', ['-lc', 'test -d \"$1\"', 'bash', tmp], { encoding: 'utf8' });",
        'assert.equal(result.status, 0);',
        '',
      ].join('\n'),
      'scripts/checks/frontend/design-evolution.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';",
        "import { createFixtureWorkspace } from '../../lib/shared/gate-fixture-utils.mjs';",
        "import { checkFrontendDesignEvolution } from './design-evolution.mjs';",
        "createFixtureWorkspace({ git: false, packageJson: null }).cleanup();",
        "createCheckGuard('fixture').assertEqual(checkFrontendDesignEvolution({ entries: [], repoRoot: '/fixture' }).status, 0, 'design evolution');",
        '',
      ].join('\n'),
      'scripts/checks/weekly/out-of-scope.behavior.mjs': [
        '#!/usr/bin/env node',
        ...SOURCE_ONLY_FIXTURE_SNIPPETS,
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 0, 'runtime, structural, and shared-runner behavior guards should pass');
      assertIncludes(
        result.stdout,
        'scanned 8 behavior guards; runtime+structural 0, runtime-only 7, structural-only 1, source-only 0, documented source-only exceptions 0',
        'passing output should include non-weekly behavior guard buckets',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/frontend/source-only.behavior.mjs': [
        '#!/usr/bin/env node',
        ...SOURCE_ONLY_FIXTURE_SNIPPETS,
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 1, 'source-only non-weekly behavior guard should fail');
      assertIncludes(
        result.stderr,
        'scripts/checks/frontend/source-only.behavior.mjs is source-only; add a runtime fixture execution, a structural parser check, or a documented source-only exception',
        'source-only guard should be reported',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/frontend/fake-runtime.behavior.mjs': [
        '#!/usr/bin/env node',
        'const fakeRuntimeMarkers = [',
        '  "spawnSync(process.execPath, [TARGET_SCRIPT])",',
        '  "import { parse } from \'@babel/parser\';",',
        '];',
        '// spawnSync(process.execPath, [TARGET_SCRIPT]);',
        'console.log(fakeRuntimeMarkers.join("\\n"));',
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 1, 'quoted or commented markers should not satisfy quality backing');
      assertIncludes(
        result.stderr,
        'scripts/checks/frontend/fake-runtime.behavior.mjs is source-only',
        'fake markers should still be reported as source-only',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/frontend/structural-source-scan.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { parse } from '@babel/parser';",
        'const source = String(parse);',
        "if (source.includes('placeholder')) {",
        "  throw new Error('source scan regression');",
        '}',
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 1, 'structural guard with source.includes should fail');
      assertIncludes(
        result.stderr,
        'scripts/checks/frontend/structural-source-scan.behavior.mjs uses source-scan primitives',
        'source-scan primitive failure should identify the file',
      );
      assertIncludes(
        result.stderr,
        'source.includes: Use structural parser helpers for source shape checks instead of source.includes(...).',
        'source.includes failure should explain the migration path',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/frontend/non-guard.mjs': [
        '#!/usr/bin/env node',
        ...SOURCE_ONLY_FIXTURE_SNIPPETS,
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 0, 'non-behavior files should stay out of the quality audit');
      assertIncludes(result.stdout, 'scanned 0 behavior guards', 'non-behavior fixture should not be counted');
    },
  );

  withFixture(
    {
      'scripts/checks/weekly/source-only.behavior.mjs': [
        '#!/usr/bin/env node',
        ...SOURCE_ONLY_FIXTURE_SNIPPETS,
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 0, 'weekly behavior files should stay in the weekly-specific quality audit');
      assertNotIncludes(
        result.stderr,
        'scripts/checks/weekly/source-only.behavior.mjs',
        'non-weekly quality gate should not report weekly behavior guards',
      );
    },
  );

  return 'runtime-backed, structural, shared-runner, fake-marker, source-only, and scope checks passed.';
}
