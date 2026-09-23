import { auditBehaviorGuardQuality } from '../../lib/shared/behavior-guard-quality.mjs';
import { WEEKLY_BEHAVIOR_FILE_PATTERN } from '../../lib/weekly/weekly-behavior-gates.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('weekly behavior guard quality fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const SOURCE_ONLY_FIXTURE_SNIPPETS = [
  'const bannedSnippets = [];',
  'const requiredSnippets = [];',
  'console.log(bannedSnippets, requiredSnippets);',
];
const NON_BEHAVIOR_FIXTURE_SNIPPETS = [
  'const bannedSnippets = [];',
  'console.log(bannedSnippets);',
];

function runQualityGuard(files) {
  const behaviorFiles = Object.keys(files)
    .filter((file) => WEEKLY_BEHAVIOR_FILE_PATTERN.test(file))
    .sort();
  const result = auditBehaviorGuardQuality({
    behaviorFiles,
    readSource: (behaviorFile) => files[behaviorFile],
    sourceOnlyExceptions: new Map(),
  });

  if (result.findings.length === 0) {
    return {
      status: 0,
      stdout: `[weekly-behavior-guard-quality] OK: scanned ${behaviorFiles.length} behavior guards; runtime+structural ${result.runtimeAndStructuralCount}, runtime-only ${result.runtimeOnlyCount}, structural-only ${result.structuralOnlyCount}, source-only ${result.sourceOnlyCount}, documented source-only exceptions 0.\n`,
      stderr: '',
    };
  }

  const lines = ['[weekly-behavior-guard-quality] Weekly behavior guard quality drift was detected:'];
  for (const finding of result.findings) {
    lines.push(`- ${finding}`);
  }
  lines.push('', 'Prefer runtime-backed behavior checks. Keep source-only guards rare, explicit, and limited to render-only TSX shape audits.');
  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runQualityGuard(files));
}

export function runWeeklyBehaviorGuardQualityBehaviorFixtures(assertions) {
  useAssertions(assertions);

  withFixture(
    {
      'scripts/checks/weekly/runtime.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { build } from 'esbuild';",
        "console.log(typeof build === 'function');",
        '',
      ].join('\n'),
      'scripts/checks/weekly/runtime-require.behavior.mjs': [
        '#!/usr/bin/env node',
        "const { build } = require('esbuild');",
        "console.log(typeof build === 'function');",
        '',
      ].join('\n'),
      'scripts/checks/weekly/runtime-side-effect-import.behavior.mjs': [
        '#!/usr/bin/env node',
        "import 'esbuild';",
        "console.log('side-effect import');",
        '',
      ].join('\n'),
      'scripts/checks/weekly-overview/runtime-behavior.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { build } from 'esbuild';",
        "console.log(typeof build === 'function');",
        '',
      ].join('\n'),
      'scripts/checks/weekly/runtime-bundled-helper.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { importBundledWeeklyBehaviorEntry } from './weekly-runtime-test-utils.mjs';",
        "importBundledWeeklyBehaviorEntry({ entryPoint: 'apps/web-vite/src/fake.ts' });",
        '',
      ].join('\n'),
      'scripts/checks/weekly/structural.behavior.mjs': [
        '#!/usr/bin/env node',
        "import ts from 'typescript';",
        'console.log(Boolean(ts));',
        '',
      ].join('\n'),
      'scripts/checks/weekly/structural-require.behavior.mjs': [
        '#!/usr/bin/env node',
        "const ts = require('typescript');",
        'console.log(Boolean(ts));',
        '',
      ].join('\n'),
      'scripts/checks/weekly/structural-side-effect-import.behavior.mjs': [
        '#!/usr/bin/env node',
        "import './weekly-tsx-guard-utils.mjs';",
        "console.log('tsx parser helper');",
        '',
      ].join('\n'),
      'scripts/checks/weekly/structural-babel-parser.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { parse } from '@babel/parser';",
        "console.log(typeof parse === 'function');",
        '',
      ].join('\n'),
      'scripts/checks/weekly/registry-runner.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { spawnSync } from 'node:child_process';",
        "const REGISTRY_SCRIPT = 'scripts/checks/weekly/any-registry.mjs';",
        'spawnSync(process.execPath, [REGISTRY_SCRIPT]);',
        '',
      ].join('\n'),
      'scripts/checks/weekly/quality-runner.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { spawnSync } from 'node:child_process';",
        "const QUALITY_SCRIPT = 'scripts/checks/weekly/behavior-guard-quality.mjs';",
        'spawnSync(process.execPath, [QUALITY_SCRIPT], { encoding: "utf8" });',
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 0, 'runtime-backed and structural weekly behavior guards should pass');
      assertIncludes(
        result.stdout,
        'scanned 11 behavior guards; runtime+structural 0, runtime-only 7, structural-only 4, source-only 0, documented source-only exceptions 0',
        'passing output should include non-overlapping runtime and structural buckets',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/weekly/structural-source-scan.behavior.mjs': [
        '#!/usr/bin/env node',
        "import ts from 'typescript';",
        'const source = String(ts.version);',
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
        'scripts/checks/weekly/structural-source-scan.behavior.mjs uses source-scan primitives',
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
      'scripts/checks/weekly/fake-runtime.behavior.mjs': [
        '#!/usr/bin/env node',
        'const fakeRuntimeMarkers = [',
        '  "import { build } from \'esbuild\';",',
        '  "importBundledWeeklyBehaviorEntry({ entryPoint: \'apps/web-vite/src/fake.ts\' })",',
        '  "spawnSync(process.execPath, [REGISTRY_SCRIPT])",',
        '];',
        '// from "typescript"; require("esbuild"); REGISTRY_SCRIPT',
        '/*',
        "import { build } from 'esbuild';",
        'spawnSync(process.execPath, [REGISTRY_SCRIPT]);',
        '*/',
        'console.log(fakeRuntimeMarkers.join("\\n"));',
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 1, 'quoted or commented runtime markers should not satisfy runtime backing');
      assertIncludes(
        result.stderr,
        'scripts/checks/weekly/fake-runtime.behavior.mjs is source-only; add a runtime fixture execution, a structural parser check, or a documented source-only exception',
        'fake runtime markers should still be reported as source-only',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/weekly/fake-structural.behavior.mjs': [
        '#!/usr/bin/env node',
        'const fakeStructuralMarkers = [',
        '  "import ts from \'typescript\';",',
        '  "from \'@babel/parser\'",',
        '  "weekly-tsx-guard-utils",',
        '];',
        '// from "acorn"; require("typescript");',
        '/*',
        "import ts from 'typescript';",
        "import { parse } from '@babel/parser';",
        '*/',
        'console.log(fakeStructuralMarkers.join("\\n"));',
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 1, 'quoted or commented structural markers should not satisfy structural backing');
      assertIncludes(
        result.stderr,
        'scripts/checks/weekly/fake-structural.behavior.mjs is source-only; add a runtime fixture execution, a structural parser check, or a documented source-only exception',
        'fake structural markers should still be reported as source-only',
      );
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
      assertEqual(result.status, 1, 'source-only weekly behavior guard should fail without exception');
      assertIncludes(
        result.stderr,
        'scripts/checks/weekly/source-only.behavior.mjs is source-only; add a runtime fixture execution, a structural parser check, or a documented source-only exception',
        'source-only guard should be reported',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/weekly/non-guard.mjs': [
        '#!/usr/bin/env node',
        ...NON_BEHAVIOR_FIXTURE_SNIPPETS,
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 0, 'non-behavior weekly files should stay out of the quality audit');
      assertIncludes(
        result.stdout,
        'scanned 0 behavior guards',
        'non-behavior fixture should not be counted',
      );
    },
  );

  return 'runtime-backed, structural, fake-marker, source-only, and scope behavior checks passed.';
}
