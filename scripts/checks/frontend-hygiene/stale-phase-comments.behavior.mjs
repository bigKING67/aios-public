#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import { auditFrontendStalePhaseCommentSource } from './stale-phase-comments.mjs';

const { assertEqual, assertIncludes, assertNotIncludes, reportOk } = createCheckGuard(
  'frontend-stale-phase-comments-behavior',
);

function isFrontendSourceFile(file) {
  return (file.startsWith('apps/web-vite/src/') || file.startsWith('apps/web-vite/src/')) && /\.(?:ts|tsx|js|jsx|css)$/.test(file);
}

function runAudit(files) {
  const sourceEntries = Object.entries(files).filter(([file]) => isFrontendSourceFile(file));
  const findings = sourceEntries.flatMap(([file, source]) => auditFrontendStalePhaseCommentSource(file, source));

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[frontend-stale-phase-comments] OK: scanned ${sourceEntries.length} frontend source files; no stale project phase comments found.\n`,
      stderr: '',
    };
  }

  const lines = ['[frontend-stale-phase-comments] Stale project phase comments were found:'];
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.lineNumber} ${finding.reason}`);
    lines.push(`  ${finding.line}`);
  }
  lines.push('', 'Rewrite phase/changelog comments into current behavior, contract, or domain intent.');
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
export function Page() { return null; }
`,
    'apps/web-vite/src/styles/globals.css': `/* AIOS 设计 Token 系统 */
.root { display: block; }
`,
    'docs/history.ts': `// v2.0 P1 Task 3 is fine outside frontend source roots.
export const outOfScope = true;
`,
  },
  (result) => {
    assertEqual(result.status, 0, 'current behavior comments and out-of-scope files should pass');
    assertIncludes(result.stdout, 'no stale project phase comments found', 'passing output should confirm no findings');
    assertNotIncludes(result.stderr, 'Stale project phase comments', 'passing audit should not report findings');
  },
);

withFixture(
  {
    'apps/web-vite/src/lib/api.ts': `/**
 * v2.0 P1 Task 3: 缓存策略定义
 */
export const ok = true;
`,
  },
  (result) => {
    assertEqual(result.status, 1, 'versioned priority task comments should fail');
    assertIncludes(result.stderr, 'apps/web-vite/src/lib/api.ts:2', 'finding should include source location');
    assertIncludes(result.stderr, 'versioned priority label', 'finding should explain stale label');
  },
);

withFixture(
  {
    'apps/web-vite/src/hooks/index.ts': `/**
 * Day 5 新增：认证和权限相关 Hooks
 */
export const ok = true;
`,
  },
  (result) => {
    assertEqual(result.status, 1, 'day-by-day changelog comments should fail');
    assertIncludes(result.stderr, 'day-by-day changelog label', 'Day label reason should be reported');
  },
);

withFixture(
  {
    'apps/web-vite/src/App.tsx': `// P0 已完成
export function App() { return null; }
`,
  },
  (result) => {
    assertEqual(result.status, 1, 'priority completion comments under apps/web-vite should fail');
    assertIncludes(result.stderr, 'priority task label', 'priority reason should be reported');
  },
);

withFixture(
  {
    'apps/web-vite/src/types/report.ts': `/** 月报响应（P2） */
export interface MonthlyReportResponse {}
`,
  },
  (result) => {
    assertEqual(result.status, 1, 'parenthesized priority markers should fail');
    assertIncludes(result.stderr, 'parenthesized priority marker', 'parenthesized priority reason should be reported');
  },
);

reportOk('current comments pass; stale versioned priority, Day, and parenthesized priority comments fail.');
