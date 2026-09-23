#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { auditFrontendUnownedDebtCommentSource } from './unowned-debt-comments.mjs';

const { assertEqual, assertIncludes, assertNotIncludes, reportOk } = createCheckGuard(
  'frontend-unowned-debt-comments-behavior',
);

function isFrontendSourceFile(file) {
  return (file.startsWith('apps/web-vite/src/') || file.startsWith('apps/web-vite/src/')) && /\.(?:ts|tsx|js|jsx|css)$/.test(file);
}

function runAudit(files) {
  const sourceEntries = Object.entries(files).filter(([file]) => isFrontendSourceFile(file));
  const findings = sourceEntries.flatMap(([file, source]) => auditFrontendUnownedDebtCommentSource(file, source));

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[frontend-unowned-debt-comments] OK: scanned ${sourceEntries.length} frontend source files; no unowned TODO/FIXME/HACK/XXX comments found.\n`,
      stderr: '',
    };
  }

  const lines = ['[frontend-unowned-debt-comments] Unowned debt markers were found in frontend source comments:'];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} ${finding.marker}`);
    lines.push(`  ${finding.line}`);
  }
  lines.push(
    '',
    'Replace TODO/FIXME/HACK/XXX comments with behavior comments, tests, or issue-backed work outside production source.',
  );
  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runAudit(files));
}

withFixture(
  {
    'apps/web-vite/src/app/page.tsx': `/**
 * 首页
 *
 * 说明：当前前端运行时为 Vite + React Router，页面保持无本地交互状态。
 */
const copy = "TODO in a user-visible string is not a source debt marker";
export function Page() { return copy; }
`,
    'apps/web-vite/src/styles/page.module.css': `/* Current behavior comment. */
.root::before { content: "FIXME is text content here"; }
`,
    'docs/frontend.ts': `// TODO outside frontend source roots is ignored by this frontend gate.
export const outOfScope = true;
`,
  },
  (result) => {
    assertEqual(result.status, 0, 'clean comments, strings, and out-of-scope files should pass');
    assertIncludes(result.stdout, 'no unowned TODO/FIXME/HACK/XXX comments found', 'passing output should confirm no findings');
    assertNotIncludes(result.stderr, 'Unowned debt markers', 'passing audit should not report findings');
  },
);

withFixture(
  {
    'apps/web-vite/src/app/page.tsx': `// TODO: wire this later
export function Page() { return null; }
`,
  },
  (result) => {
    assertEqual(result.status, 1, 'TS line TODO comments should fail');
    assertIncludes(result.stderr, 'apps/web-vite/src/app/page.tsx:1 TODO', 'finding should include marker and source location');
  },
);

withFixture(
  {
    'apps/web-vite/src/components/Card.tsx': `/*
 * FIXME: remove fallback branch
 */
export function Card() { return null; }
`,
  },
  (result) => {
    assertEqual(result.status, 1, 'TS block FIXME comments should fail');
    assertIncludes(result.stderr, 'apps/web-vite/src/components/Card.tsx:2 FIXME', 'block comment marker should be reported');
  },
);

withFixture(
  {
    'apps/web-vite/src/App.tsx': `export function App() {
  return null; // HACK keep mounted
}
`,
  },
  (result) => {
    assertEqual(result.status, 1, 'trailing HACK comments under apps/web-vite should fail');
    assertIncludes(result.stderr, 'apps/web-vite/src/App.tsx:2 HACK', 'trailing comment marker should be reported');
  },
);

withFixture(
  {
    'apps/web-vite/src/styles/panel.module.css': `/*
 * XXX: remove after redesign
 */
.root { display: block; }
`,
  },
  (result) => {
    assertEqual(result.status, 1, 'CSS XXX comments should fail');
    assertIncludes(result.stderr, 'apps/web-vite/src/styles/panel.module.css:2 XXX', 'CSS block comment marker should be reported');
  },
);

reportOk('strings and clean comments pass; TS/CSS TODO, FIXME, HACK, and XXX comments fail.');
