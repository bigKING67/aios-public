import { withFixtureWorkspace } from '../shared/gate-fixture-utils.mjs';
import {
  checkDesignDocsDrift,
  formatDesignDocsDriftResult,
  listDesignDocs,
} from './design-docs-drift-core.mjs';

const REQUIRED_DESIGN_COMMANDS = [
  'npm run verify:design:docs-behavior',
  'npm run verify:design:runtime-tokens-behavior',
  'npm run verify:design:runtime-tokens',
  'npm run verify:frontend:build-fingerprint-behavior',
  'npm run verify:frontend:quality-docs-drift-behavior',
  'npm run verify:frontend:quality-docs-drift',
  'npm run verify:frontend:design-evolution-behavior',
  'npm run verify:frontend:design-evolution',
  'npm run verify:frontend:delivery-gate-registry-behavior',
  'npm run verify:frontend:delivery-gate-registry',
  'npm run verify:frontend:preflight',
];

function defaultDesignSource(commands = REQUIRED_DESIGN_COMMANDS) {
  return [
    '# AIOS Design Authority',
    '',
    '## Validation Commands',
    '',
    '```bash',
    ...commands,
    '```',
    '',
    '## Acceptance Checklist',
    '',
    '- Use documented tokens.',
    '',
  ].join('\n');
}

function defaultReadmeSource(summary = 'lint + design/frontend/weekly gates + build + type-check + backend + shell syntax + frontend preflight') {
  return [
    '# AIOS',
    '',
    '| Command | Purpose |',
    '|---|---|',
    `| \`npm run verify:ci\` | ${summary} |`,
    '',
  ].join('\n');
}

function runDocsDriftGuard(repoRoot, docs) {
  return formatDesignDocsDriftResult(checkDesignDocsDrift({ docs, repoRoot }));
}

function withTempRepo(files, assertion) {
  const fixtureFiles = {
    'DESIGN.md': defaultDesignSource(),
    'README.md': defaultReadmeSource(),
    ...files,
  };
  const docs = Object.keys(fixtureFiles)
    .filter((file) => file.endsWith('.md'))
    .sort();

  withFixtureWorkspace(
    {
      files: fixtureFiles,
      git: false,
      packageJson: null,
      prefix: 'aios-design-docs-drift-',
    },
    ({ repoRoot }) => assertion(runDocsDriftGuard(repoRoot, docs)),
  );
}

export function runDesignDocsDriftBehaviorFixtures({
  assertEqual,
  assertIncludes,
}) {
  withTempRepo(
    {
      'docs/design-notes.md': [
        '# Design notes',
        '',
        'Use design tokens from DESIGN.md.',
        'Use direction="up|down|neutral" for trend states.',
        '',
      ].join('\n'),
      'docs/history.md': 'Historical note: KPIGrid was retired. docs-design-drift-allow\n',
    },
    (result) => {
      assertEqual(result.status, 0, 'clean design docs and allow marker should pass');
      assertIncludes(
        result.stdout,
        'no stale design-system patterns or validation drift found',
        'passing output should confirm stale-pattern and validation drift checks',
      );
    },
  );

  withFixtureWorkspace(
    {
      files: {
        'DESIGN.md': defaultDesignSource(),
        'README.md': defaultReadmeSource(),
        'AGENTS.md': '# Agent instructions\n',
        'apps/web-vite/AGENTS.md': '# Frontend instructions\n',
        'docs/a.md': '# A\n',
        'docs/nested/b.md': '# B\n',
        'docs/nested/skip.txt': 'skip\n',
        'apps/web-vite/src/docs/c.md': '# C\n',
        'CHANGELOG.md': '# Changelog outside docs surface\n',
      },
      git: false,
      packageJson: null,
      prefix: 'aios-design-docs-list-',
    },
    ({ repoRoot }) => {
      assertEqual(
        listDesignDocs(repoRoot).join(','),
        [
          'AGENTS.md',
          'DESIGN.md',
          'README.md',
          'apps/web-vite/AGENTS.md',
          'apps/web-vite/src/docs/c.md',
          'docs/a.md',
          'docs/nested/b.md',
        ].join(','),
        'listDesignDocs should cover the design docs surface without expanding to unrelated markdown files',
      );
    },
  );

  withTempRepo(
    {
      'DESIGN.md': defaultDesignSource(
        REQUIRED_DESIGN_COMMANDS.filter((command) => command !== 'npm run verify:frontend:preflight'),
      ),
      'README.md': defaultReadmeSource('本地执行 CI 同等门禁（lint + build + type-check + shell + cargo）'),
      'docs/component-contracts.md': 'Use KPIGrid for dashboard metrics.\n',
      'docs/styles.md': 'Import design-system.css globally.\n',
      'docs/less-tokens.md': 'Use @primary-color for buttons.\n',
      'docs/status.md': 'Use --color-success for success state.\n',
      'docs/neutral.md': 'Old background used #F4F5F9.\n',
      'docs/shadow.md': 'Old shadow used rgba(50, 100, 246, 0.16).\n',
    },
    (result) => {
      assertEqual(result.status, 1, 'legacy design documentation references should fail in one batched fixture');
      assertIncludes(
        result.stderr,
        'legacy KPIGrid component/path',
        'legacy component failure should identify KPIGrid',
      );
      assertIncludes(
        result.stderr,
        'legacy design-system.css entrypoint',
        'legacy stylesheet failure should identify design-system.css',
      );
      assertIncludes(
        result.stderr,
        'legacy Less color token',
        'Less token failure should identify legacy token guidance',
      );
      assertIncludes(
        result.stderr,
        'legacy --color status token in docs',
        'status token failure should identify legacy status variable',
      );
      assertIncludes(
        result.stderr,
        'legacy Arco/old neutral raw color',
        'old neutral failure should identify raw color drift',
      );
      assertIncludes(
        result.stderr,
        'legacy raw rgba color',
        'raw rgba failure should identify legacy rgba drift',
      );
      assertIncludes(
        result.stderr,
        'missing DESIGN.md validation command',
        'missing command failure should identify validation command drift',
      );
      assertIncludes(
        result.stderr,
        'npm run verify:frontend:preflight',
        'missing command failure should name frontend preflight',
      );
      assertIncludes(
        result.stderr,
        'stale README verify:ci summary',
        'README summary failure should identify stale verify:ci description',
      );
    },
  );

  return 'pass, legacy docs failures, allow marker, DESIGN.md validation drift, and README verify:ci summary drift checks passed.';
}
