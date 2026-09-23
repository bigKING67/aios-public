import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(new URL('../../lib/design/antd-table-selectors-core.mjs', import.meta.url));

function writeText(filePath, text) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, text, 'utf8');
}

function createTempRepo() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), 'aios-antd-selector-audit-'));
  spawnSync('git', ['init', '--quiet'], { cwd: repoRoot });
  return repoRoot;
}

function writeFixture(repoRoot, { allowlist, cssByPath }) {
  rmSync(path.join(repoRoot, 'apps/web-vite/src'), { force: true, recursive: true });
  rmSync(path.join(repoRoot, 'scripts/config/allowlists/antd-table-selector-allowlist.json'), { force: true });

  for (const [filePath, source] of Object.entries(cssByPath)) {
    writeText(path.join(repoRoot, filePath), source);
  }

  writeText(
    path.join(repoRoot, 'scripts/config/allowlists/antd-table-selector-allowlist.json'),
    JSON.stringify(allowlist, null, 2),
  );
}

function runAudit(repoRoot, fixture) {
  writeFixture(repoRoot, fixture);
  return spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    [
      `import { formatAntdTableSelectorAuditFailures, runAntdTableSelectorAudit } from ${JSON.stringify(SCRIPT_PATH)};`,
      'const { auditResult, summary } = runAntdTableSelectorAudit(process.cwd());',
      'const failure = formatAntdTableSelectorAuditFailures(auditResult);',
      'if (failure) { console.error(failure.trimEnd()); process.exit(1); }',
      "console.log(`[antd-table-selector-audit] OK: ${summary}`);",
    ].join('\n'),
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

const allowedConfig = {
  version: 2,
  allowed: [
    {
      path: 'apps/web-vite/src/allowed.module.css',
      allowedSelectors: [
        {
          selector: '.table :global(.ant-table-tbody > tr.ant-table-measure-row) {',
          exceptionKind: 'framework-internal',
          reason: 'fixture measure row',
        },
        {
          selector: '.table :global(.ant-table-tbody > tr.ant-table-measure-row > td) {',
          exceptionKind: 'framework-internal',
          reason: 'fixture measure cell',
        },
      ],
    },
  ],
};

export function runDesignAntdTableSelectorBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  const repoRoot = createTempRepo();
  try {
    {
      const result = runAudit(repoRoot, {
        allowlist: allowedConfig,
        cssByPath: {
          'apps/web-vite/src/allowed.module.css': `
.table :global(.ant-table-tbody > tr.ant-table-measure-row) {
  height: 0;
}

.table :global(.ant-table-tbody > tr.ant-table-measure-row > td) {
  padding: 0;
}
`,
        },
      });
      assertEqual(result.status, 0, 'selector-level framework-internal allowlist should pass');
      assertIncludes(
        result.stdout,
        'no migration-debt selectors; 2 framework-internal AntD table deep selectors accepted',
        'pass output should distinguish accepted framework internals from migration debt',
      );
    }

    {
      const result = runAudit(repoRoot, {
        allowlist: allowedConfig,
        cssByPath: {
          'apps/web-vite/src/allowed.module.css': `
.table :global(.ant-table-tbody > tr.ant-table-measure-row) {
  height: 0;
}

.table :global(.ant-table-tbody > tr.ant-table-measure-row > td) {
  padding: 0;
}

.table :global(.ant-table-thead > tr > th) {
  padding: 0;
}
`,
        },
      });
      assertEqual(result.status, 1, 'new selector in an allowlisted file should fail');
      assertIncludes(
        result.stderr,
        'AntD table deep selector violations found',
        'failure should explain the deep selector violation',
      );
      assertIncludes(
        result.stderr,
        '.table :global(.ant-table-thead > tr > th) {',
        'failure should print the unallowlisted selector',
      );
    }

    {
      const result = runAudit(repoRoot, {
        allowlist: allowedConfig,
        cssByPath: {
          'apps/web-vite/src/allowed.module.css': `
.table :global(.ant-table-tbody > tr.ant-table-measure-row) {
  height: 0;
}
`,
        },
      });
      assertEqual(result.status, 1, 'removed allowed selector should fail as stale');
      assertIncludes(
        result.stderr,
        'Found stale allowed AntD table selectors',
        'stale selector failure should be explicit',
      );
      assertIncludes(
        result.stderr,
        '.table :global(.ant-table-tbody > tr.ant-table-measure-row > td) {',
        'stale selector failure should print the missing selector',
      );
    }

    {
      const result = runAudit(repoRoot, {
        allowlist: {
          version: 2,
          allowed: [],
        },
        cssByPath: {
          'apps/web-vite/src/new.module.css': `
.table :global(.ant-table-tbody > tr > td) {
  padding: 0;
}
`,
        },
      });
      assertEqual(result.status, 1, 'deep selector in a non-allowlisted file should fail');
      assertIncludes(
        result.stderr,
        'AntD table deep selector violations found',
        'non-allowlisted file failure should mention violation guidance',
      );
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/new.module.css',
        'non-allowlisted file failure should print the file path',
      );
    }

    {
      const result = runAudit(repoRoot, {
        allowlist: {
          version: 1,
          allowed: [],
        },
        cssByPath: {
          'apps/web-vite/src/clean.module.css': '.clean { color: var(--text-primary); }',
        },
      });
      assertEqual(result.status, 1, 'legacy v1 allowlist schema should fail');
      assertIncludes(result.stderr, 'must use version 2', 'schema failure should require v2');
      assertNotIncludes(result.stdout, '[antd-table-selector-audit] OK', 'schema failure should not report OK');
    }
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }

  return 'selector-level allowlist pass, violation, stale, and schema checks passed.';
}
