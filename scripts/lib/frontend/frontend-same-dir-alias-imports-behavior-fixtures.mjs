import {
  auditFrontendSameDirAliasSource,
  formatFrontendSameDirAliasImportsResult,
  isFrontendSameDirAliasSourceFile,
} from './frontend-same-dir-alias-imports-core.mjs';

function runAudit(files) {
  const fileSet = new Set(Object.keys(files));
  const fileExists = (candidate) =>
    fileSet.has(candidate) || Object.keys(files).some((file) => file.startsWith(`${candidate}/`));
  const sourceFiles = Object.keys(files).filter(isFrontendSameDirAliasSourceFile);
  const findings = Object.entries(files)
    .filter(([file]) => isFrontendSameDirAliasSourceFile(file))
    .flatMap(([file, source]) => auditFrontendSameDirAliasSource(file, source, fileExists));

  return formatFrontendSameDirAliasImportsResult({
    files: sourceFiles,
    findings,
  });
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

export function runFrontendSameDirAliasImportsBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  withFixture(
    {
      'apps/web-vite/src/lib/request.ts': `
import { asRecord } from './unknown-data';
import { useAuthStore } from '@/stores/auth.store';

const example = "import { asRecord } from '@/lib/unknown-data'";
export const ok = Boolean(asRecord) || Boolean(useAuthStore) || Boolean(example);
`,
      'apps/web-vite/src/lib/unknown-data.ts': 'export function asRecord(value) { return value; }\n',
      'apps/web-vite/src/stores/auth.store.ts': 'export const useAuthStore = {};\n',
    },
    (result) => {
      assertEqual(result.status, 0, 'relative same-dir imports, cross-dir aliases, and comment/string mentions should pass');
      assertIncludes(result.stdout, 'no same-directory alias imports found', 'passing output should confirm no findings');
      assertNotIncludes(result.stderr, 'Same-directory frontend imports', 'passing audit should not report findings');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/lib/request.ts': `
import { asRecord } from '@/lib/unknown-data';

export const ok = asRecord;
`,
      'apps/web-vite/src/lib/unknown-data.ts': 'export function asRecord(value) { return value; }\n',
    },
    (result) => {
      assertEqual(result.status, 1, 'same-directory alias import should fail');
      assertIncludes(result.stderr, 'apps/web-vite/src/lib/request.ts:2 imports @/lib/unknown-data', 'same-dir alias location should be reported');
      assertIncludes(result.stderr, 'use: ./unknown-data', 'relative replacement should be suggested');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/components/index.ts': `
export { Badge } from '@/components/atoms';
`,
      'apps/web-vite/src/components/atoms/index.ts': 'export const Badge = {};\n',
    },
    (result) => {
      assertEqual(result.status, 1, 'same-directory alias export should fail');
      assertIncludes(result.stderr, 'apps/web-vite/src/components/index.ts:2 imports @/components/atoms', 'same-dir export location should be reported');
      assertIncludes(result.stderr, 'use: ./atoms', 'index replacement should be suggested');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/app/dashboard/page.tsx': `
const DashboardClient = import('@/app/dashboard/DashboardClient');
`,
      'apps/web-vite/src/app/dashboard/DashboardClient.tsx': 'export function DashboardClient() { return null; }\n',
    },
    (result) => {
      assertEqual(result.status, 1, 'same-directory dynamic alias import should fail');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/dashboard/page.tsx:2 imports @/app/dashboard/DashboardClient', 'dynamic same-dir alias should be reported');
      assertIncludes(result.stderr, 'use: ./DashboardClient', 'dynamic replacement should be suggested');
    },
  );

  return 'relative pass, comment/string ignored, import/export/dynamic same-dir aliases fail.';
}
