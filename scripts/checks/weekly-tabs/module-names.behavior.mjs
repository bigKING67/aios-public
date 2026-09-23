#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  auditWeeklyModuleNameFile,
  formatWeeklyModuleNameFailure,
} from './module-names.mjs';

const { assertEqual, assertIncludes, assertNotIncludes, reportOk } = createCheckGuard(
  'weekly-tabs-misleading-module-names-behavior',
);

function runAudit(files) {
  const sourceFiles = Object.keys(files)
    .filter((file) => file.startsWith('apps/web-vite/src/app/reports/weekly/_components/tabs/') && /\.(?:ts|tsx)$/.test(file));
  const findings = sourceFiles.map(auditWeeklyModuleNameFile).filter(Boolean);

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[weekly-tabs-misleading-module-names] OK: scanned ${sourceFiles.length} weekly TS/TSX files; no misleading copy/template module names found.\n`,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatWeeklyModuleNameFailure(findings)}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

withFixture(
  {
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-channel-quant-diagnostics.ts': 'export const ok = true;\n',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-channel-quant-template-resolver.ts': 'export const ok = true;\n',
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-channel-copywriting.ts': 'export const ok = true;\n',
    'apps/web-vite/src/app/reports/monthly/_components/tabs/monthly-tab-copy.ts': 'export const outsideWeekly = true;\n',
  },
  (result) => {
    assertEqual(result.status, 0, 'precise weekly names and out-of-scope files should pass');
    assertIncludes(result.stdout, 'no misleading copy/template module names found', 'passing output should confirm no findings');
    assertNotIncludes(result.stderr, 'module names are misleading', 'passing audit should not report findings');
  },
);

withFixture(
  {
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-channel-quant-copy.ts': 'export const bad = true;\n',
  },
  (result) => {
    assertEqual(result.status, 1, '"*-copy" weekly tabs files should fail');
    assertIncludes(result.stderr, 'platform-tab-channel-quant-copy.ts', 'copy filename should be reported');
    assertIncludes(result.stderr, 'duplicate artifact', 'copy reason should explain duplicate ambiguity');
  },
);

withFixture(
  {
    'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-channel-quant-template.ts': 'export const bad = true;\n',
  },
  (result) => {
    assertEqual(result.status, 1, '"*-template" weekly tabs files should fail');
    assertIncludes(result.stderr, 'platform-tab-channel-quant-template.ts', 'template filename should be reported');
    assertIncludes(result.stderr, 'too vague', 'template reason should explain responsibility ambiguity');
  },
);

reportOk('precise names pass; misleading copy/template weekly module names fail.');
