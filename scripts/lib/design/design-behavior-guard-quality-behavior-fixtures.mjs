import { auditBehaviorGuardQuality } from '../shared/behavior-guard-quality.mjs';
import {
  DESIGN_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS,
} from './design-behavior-guard-quality-core.mjs';

const SOURCE_ONLY_FIXTURE_SNIPPETS = [
  'const bannedSnippets = [];',
  'const requiredSnippets = [];',
  'console.log(bannedSnippets, requiredSnippets);',
];

function runQualityGuard(files) {
  const behaviorFiles = Object.keys(files)
    .filter((file) => /^scripts\/checks\/design\/.+\.behavior\.mjs$/.test(file))
    .sort();
  const result = auditBehaviorGuardQuality({
    behaviorFiles,
    extraRuntimeDetectors: DESIGN_BEHAVIOR_GUARD_QUALITY_EXTRA_RUNTIME_DETECTORS,
    readSource: (behaviorFile) => files[behaviorFile],
    sourceOnlyExceptions: new Map(),
  });

  if (result.findings.length === 0) {
    return {
      status: 0,
      stdout: `[design-behavior-guard-quality] OK: scanned ${behaviorFiles.length} behavior guards; runtime+structural ${result.runtimeAndStructuralCount}, runtime-only ${result.runtimeOnlyCount}, structural-only ${result.structuralOnlyCount}, source-only ${result.sourceOnlyCount}, documented source-only exceptions 0.\n`,
      stderr: '',
    };
  }

  const lines = ['[design-behavior-guard-quality] Design behavior guard quality drift was detected:'];
  for (const finding of result.findings) {
    lines.push(`- ${finding}`);
  }
  lines.push('', 'Prefer in-memory fixture execution, injected runtime behavior checks, or structural parsers. Design behavior gate registration alone is not enough.');
  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runQualityGuard(files));
}

export function runDesignBehaviorGuardQualityBehaviorFixtures(assertions) {
  const {
    assertEqual,
    assertIncludes,
    assertNotIncludes,
  } = assertions;

  withFixture(
    {
      'scripts/checks/design/raw-color-runtime.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { spawnSync } from 'node:child_process';",
        "const TARGET_SCRIPT = 'scripts/checks/design/raw-color-audit-target.mjs';",
        'spawnSync(process.execPath, [TARGET_SCRIPT], { encoding: "utf8" });',
        '',
      ].join('\n'),
      'scripts/checks/design/structural.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { parse } from '@babel/parser';",
        "console.log(typeof parse === 'function');",
        '',
      ].join('\n'),
      'scripts/checks/design/raw-color-helper-root.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { readRawColorSourceAllowlist } from './lib/raw-color-source-allowlist.mjs';",
        'readRawColorSourceAllowlist("/fixture", () => {});',
        '',
      ].join('\n'),
      'scripts/checks/design/raw-color-helper.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { readRawColorSourceAllowlist } from '../../lib/design/raw-color-source-allowlist.mjs';",
        'readRawColorSourceAllowlist("/fixture", () => {});',
        '',
      ].join('\n'),
      'scripts/checks/design/raw-color-parser.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { parseRawColorSourceAllowlist } from '../../lib/design/raw-color-source-allowlist.mjs';",
        'parseRawColorSourceAllowlist({ version: 1, sources: [] }, () => {});',
        '',
      ].join('\n'),
      'scripts/checks/design/docs-drift-fixture.behavior.mjs': [
        '#!/usr/bin/env node',
        "import { checkDesignDocsDrift } from './docs-drift.mjs';",
        "const fixtureFiles = { 'DESIGN.md': '# Fixture', 'README.md': '# Fixture' };",
        'const docs = Object.keys(fixtureFiles);',
        "checkDesignDocsDrift({ docs, repoRoot: '/fixture' });",
        '',
      ].join('\n'),
      'scripts/checks/weekly/out-of-scope.behavior.mjs': [
        '#!/usr/bin/env node',
        ...SOURCE_ONLY_FIXTURE_SNIPPETS,
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 0, 'runtime-backed and structural design behavior guards should pass');
      assertIncludes(
        result.stdout,
        'scanned 6 behavior guards; runtime+structural 0, runtime-only 5, structural-only 1, source-only 0, documented source-only exceptions 0',
        'passing output should include design behavior guard buckets',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/design/source-only-root.behavior.mjs': [
        '#!/usr/bin/env node',
        ...SOURCE_ONLY_FIXTURE_SNIPPETS,
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 1, 'source-only design behavior guard should fail');
      assertIncludes(
        result.stderr,
        'scripts/checks/design/source-only-root.behavior.mjs is source-only; add a runtime fixture execution, a structural parser check, or a documented source-only exception',
        'source-only design guard should be reported',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/design/source-only.behavior.mjs': [
        '#!/usr/bin/env node',
        ...SOURCE_ONLY_FIXTURE_SNIPPETS,
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 1, 'source-only nested design behavior guard should fail');
      assertIncludes(
        result.stderr,
        'scripts/checks/design/source-only.behavior.mjs is source-only; add a runtime fixture execution, a structural parser check, or a documented source-only exception',
        'nested source-only design guard should be reported',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/design/raw-color-fake-runtime.behavior.mjs': [
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
      assertEqual(result.status, 1, 'quoted or commented markers should not satisfy design quality backing');
      assertIncludes(
        result.stderr,
        'scripts/checks/design/raw-color-fake-runtime.behavior.mjs is source-only',
        'fake markers should still be reported as source-only',
      );
    },
  );

  withFixture(
    {
      'scripts/checks/design/structural-source-scan.behavior.mjs': [
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
      assertEqual(result.status, 1, 'structural design guard with source.includes should fail');
      assertIncludes(
        result.stderr,
        'scripts/checks/design/structural-source-scan.behavior.mjs uses source-scan primitives',
        'source-scan primitive failure should identify the design behavior file',
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
      'scripts/checks/frontend/source-only.behavior.mjs': [
        '#!/usr/bin/env node',
        ...SOURCE_ONLY_FIXTURE_SNIPPETS,
        '',
      ].join('\n'),
    },
    (result) => {
      assertEqual(result.status, 0, 'non-design frontend behavior files should stay out of this quality audit');
      assertIncludes(result.stdout, 'scanned 0 behavior guards', 'frontend fixture should not be counted by design quality audit');
      assertNotIncludes(result.stderr, 'scripts/checks/frontend/source-only.behavior.mjs', 'frontend fixture should not be reported');
    },
  );

  return 'runtime-backed, structural, fake-marker, source-only, source-scan, and scope checks passed.';
}
