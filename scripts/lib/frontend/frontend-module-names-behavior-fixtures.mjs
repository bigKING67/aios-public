import {
  auditFrontendModuleNameFiles,
  formatFrontendModuleNamesResult,
  isFrontendModuleNameSourceFile,
} from './frontend-module-names-core.mjs';

function runAudit(files) {
  const sourceFiles = Object.keys(files).filter(isFrontendModuleNameSourceFile);
  return formatFrontendModuleNamesResult({
    files: sourceFiles,
    findings: auditFrontendModuleNameFiles(sourceFiles),
  });
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

export function runFrontendModuleNamesBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  withFixture(
    {
      'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-channel-quant-template-resolver.ts': 'export const ok = true;\n',
      'apps/web-vite/src/app/reports/weekly/_components/tabs/platform-tab-channel-diagnostics.ts': 'export const ok = true;\n',
      'apps/web-vite/src/app/dashboard/_components/dashboard-note-draft-state.ts': 'export const ok = true;\n',
      'apps/web-vite/src/app/admin/roles/_components/default-role-templates.ts': 'export const ok = true;\n',
      'apps/web-vite/src/app/dashboard/_components/dashboard-dimension-placeholder.module.css': '.root { display: block; }\n',
      'docs/frontend-old.ts': 'export const outOfScope = true;\n',
      'scripts/frontend-demo.ts': 'export const outOfScope = true;\n',
    },
    (result) => {
      assertEqual(result.status, 0, 'precise production names and out-of-scope files should pass');
      assertIncludes(result.stdout, 'no misleading production module names found', 'passing output should confirm no findings');
      assertNotIncludes(result.stderr, 'Misleading production frontend module names', 'passing audit should not report findings');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/app/dashboard/_components/dashboard-shell-copy.tsx': 'export function DashboardShellCopy() { return null; }\n',
    },
    (result) => {
      assertEqual(result.status, 1, '"*-copy" frontend files should fail');
      assertIncludes(result.stderr, 'dashboard-shell-copy.tsx', 'copy filename should be reported');
      assertIncludes(result.stderr, 'accidental duplicate artifact', 'copy reason should explain duplicate ambiguity');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/app/dashboard/_components/dashboard-shell-template.ts': 'export const bad = true;\n',
    },
    (result) => {
      assertEqual(result.status, 1, 'generic "*-template" frontend files should fail');
      assertIncludes(result.stderr, 'dashboard-shell-template.ts', 'template filename should be reported');
      assertIncludes(result.stderr, 'too vague', 'template reason should explain responsibility ambiguity');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/preview-widget-demo.tsx': 'export function Demo() { return null; }\n',
    },
    (result) => {
      assertEqual(result.status, 1, '"*-demo" files under apps/web-vite should fail');
      assertIncludes(result.stderr, 'preview-widget-demo.tsx', 'demo filename should be reported');
      assertIncludes(result.stderr, 'non-production showcase code', 'demo reason should explain production mismatch');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/components/panel-temp.module.css': '.root { display: block; }\n',
    },
    (result) => {
      assertEqual(result.status, 1, '"*-temp.module.css" files should fail');
      assertIncludes(result.stderr, 'panel-temp.module.css', 'temp CSS module filename should be reported');
      assertIncludes(result.stderr, 'temporary implementation debt', 'temp reason should explain temporary debt');
    },
  );

  return 'precise names pass; misleading copy/template/demo/temp production frontend names fail.';
}
