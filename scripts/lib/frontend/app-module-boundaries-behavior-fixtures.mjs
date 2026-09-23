import {
  buildAppModuleBoundaryConfig,
  checkAppModuleBoundaries,
  formatAppModuleBoundarySummary,
} from '../../checks/app/module-boundaries.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('App module boundary behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

function assertNotIncludes(...args) {
  currentAssertions().assertNotIncludes(...args);
}

const CONFIG_PATH = 'scripts/config/allowlists/app-module-boundary-allowlist.json';
const MODULE_ROOTS = [
  'apps/web-vite/src/app/admin',
  'apps/web-vite/src/app/dashboard/creator',
  'apps/web-vite/src/app/dashboard',
  'apps/web-vite/src/app/docs',
  'apps/web-vite/src/app/reports/weekly',
];

function formatFailures(result) {
  const lines = [];
  if (result.missingAllowlistEntries.length > 0) {
    lines.push('[app-module-boundary] Found allowlist entries for missing files:');
    for (const file of result.missingAllowlistEntries) {
      lines.push(`- ${file}`);
    }
    lines.push('', `Remove stale entries from ${CONFIG_PATH}.`);
  }
  if (result.staleAllowlistEntries.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('[app-module-boundary] Found allowlisted files with no cross-module imports:');
    for (const file of result.staleAllowlistEntries) {
      lines.push(`- ${file}`);
    }
    lines.push('', `Remove these entries from ${CONFIG_PATH}.`);
  }
  if (result.reducedAllowlistCaps.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('[app-module-boundary] Found allowlist caps above current cross-module import counts:');
    for (const entry of result.reducedAllowlistCaps) {
      lines.push(`- ${entry.file}: current=${entry.count} cap=${entry.maxCount}`);
    }
    lines.push('', `Lower the corresponding caps in ${CONFIG_PATH} so the frozen budget can only move downward.`);
  }
  if (result.violations.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('[app-module-boundary] App module boundary violations found.');
    lines.push('[app-module-boundary] Extract shared code to apps/web-vite/src/components/apps/web-vite/src/lib/apps/web-vite/src/hooks, or keep route-specific code inside its owning module. Existing cross-module imports are frozen and must not grow.', '');
    for (const violation of result.violations) {
      lines.push(`- ${violation.file}: ${violation.count} > ${violation.maxCrossModuleImports}`);
      lines.push(`  ${violation.reason}`);
      for (const finding of violation.findings.slice(0, 8)) {
        lines.push(`  ${finding.file}:${finding.lineNumber}: ${finding.sourceRoot} -> ${finding.targetRoot} (${finding.specifier})`);
        lines.push(`    ${finding.line}`);
      }
    }
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function runAudit(options = {}) {
  if (!options.writeConfig) {
    return {
      status: 1,
      stdout: '',
      stderr: `missing ${CONFIG_PATH}\n`,
    };
  }

  let config;
  try {
    config = buildAppModuleBoundaryConfig({
      version: 1,
      description: 'Fixture app module boundary budget.',
      moduleRoots: options.moduleRoots,
      allowed: options.allowed,
    }, {
      fail(message) {
        throw new Error(message);
      },
    });
  } catch (error) {
    return {
      status: 1,
      stdout: '',
      stderr: `${error instanceof Error ? error.message : String(error)}\n`,
    };
  }

  const files = Object.keys(options.files)
    .filter((file) => /^apps\/web-vite\/src\/app\/.*\.(?:ts|tsx|js|jsx)$/.test(file))
    .sort();
  const result = checkAppModuleBoundaries({
    allowlist: config.allowlist,
    files,
    moduleRoots: config.moduleRoots,
    readFile: (file) => options.files[file],
    repoRoot: '',
  });
  const stderr = formatFailures(result);
  return {
    status: stderr ? 1 : 0,
    stderr,
    stdout: stderr
      ? ''
      : `[app-module-boundary] OK: scanned ${files.length} app files; ${formatAppModuleBoundarySummary(result.total)}\n`,
  };
}

function withFixture(options, assertion) {
  assertion(runAudit({
    allowed: options.allowed ?? [],
    files: options.files ?? {},
    moduleRoots: options.moduleRoots ?? MODULE_ROOTS,
    writeConfig: options.writeConfig ?? true,
  }));
}

export function runAppModuleBoundaryBehaviorFixtures(assertions) {
  useAssertions(assertions);

withFixture(
  {
    files: {
      'apps/web-vite/src/app/dashboard/components/SafeSameModule.tsx': `
import { dashboardCopy } from '../copy';
import { MetricCard } from '@/components/MetricCard';
import { formatMetric } from '@/lib/formatMetric';

export function SafeSameModule() {
  return [dashboardCopy, MetricCard, formatMetric].join('');
}
`,
      'apps/web-vite/src/app/admin/page.tsx': `
import { adminCopy } from './copy';

export function AdminPage() {
  return adminCopy;
}
`,
      'apps/web-vite/src/components/OutOfScope.tsx': `
import { dashboardCopy } from '@/app/dashboard/copy';

export function OutOfScope() {
  return dashboardCopy;
}
`,
      'apps/web-vite/src/app/dashboard/StringLiteral.tsx': `
const adminSpecifier = '@/app/admin/copy';

export function StringLiteral() {
  return adminSpecifier;
}
`,
    },
  },
  (result) => {
    assertEqual(result.status, 0, 'same-module imports, out-of-scope files, and string literals should pass');
    assertIncludes(
      result.stdout,
      'clean baseline; no frozen cross-module imports.',
      'passing output should identify zero cross-module imports as a clean baseline',
    );
    assertNotIncludes(
      result.stderr,
      'App module boundary violations found',
      'string literal false positive should not report violations',
    );
  },
);

withFixture(
  {
    files: {
      'apps/web-vite/src/app/dashboard/BadAlias.tsx': `
import { adminCopy } from '@/app/admin/copy';

export function BadAlias() {
  return adminCopy;
}
`,
      'apps/web-vite/src/app/dashboard/BadAbsolute.tsx': `
import { docsCopy } from 'apps/web-vite/src/app/docs/copy';

export function BadAbsolute() {
  return docsCopy;
}
`,
      'apps/web-vite/src/app/dashboard/components/BadRelative.tsx': `
import { adminCopy } from '../../admin/copy';

export function BadRelative() {
  return adminCopy;
}
`,
      'apps/web-vite/src/app/dashboard/BadTypeReExportDynamic.tsx': `
import type { AdminCopy } from '@/app/admin/types';
export { docsCopy } from '@/app/docs/copy';

export async function loadWeeklyCopy(): Promise<AdminCopy> {
  return import('@/app/reports/weekly/copy');
}
`,
    },
  },
  (result) => {
    assertEqual(result.status, 1, 'cross-module app imports should fail in one batched fixture');
    assertIncludes(
      result.stderr,
      '[app-module-boundary] App module boundary violations found.',
      'cross-module violation header should be reported',
    );
    assertIncludes(
      result.stderr,
      '- apps/web-vite/src/app/dashboard/BadAlias.tsx: 1 > 0',
      'non-allowlisted file should exceed zero budget',
    );
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/dashboard/BadAlias.tsx:2: apps/web-vite/src/app/dashboard -> apps/web-vite/src/app/admin (@/app/admin/copy)',
      'alias import should report source and target module roots',
    );
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/dashboard/BadAbsolute.tsx:2: apps/web-vite/src/app/dashboard -> apps/web-vite/src/app/docs (apps/web-vite/src/app/docs/copy)',
      'absolute import should report source and target module roots',
    );
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/dashboard/components/BadRelative.tsx:2: apps/web-vite/src/app/dashboard -> apps/web-vite/src/app/admin (../../admin/copy)',
      'relative import should report source and target module roots',
    );
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/dashboard/BadTypeReExportDynamic.tsx:2: apps/web-vite/src/app/dashboard -> apps/web-vite/src/app/admin (@/app/admin/types)',
      'type-only import should be reported',
    );
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/dashboard/BadTypeReExportDynamic.tsx:3: apps/web-vite/src/app/dashboard -> apps/web-vite/src/app/docs (@/app/docs/copy)',
      're-export should be reported',
    );
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/dashboard/BadTypeReExportDynamic.tsx:6: apps/web-vite/src/app/dashboard -> apps/web-vite/src/app/reports/weekly (@/app/reports/weekly/copy)',
      'dynamic import should be reported',
    );
  },
);

withFixture(
  {
    allowed: [
      {
        path: 'apps/web-vite/src/app/dashboard/LegacyAllowed.tsx',
        maxCrossModuleImports: 1,
        reason: 'legacy fixture keeps one cross-module import frozen',
      },
    ],
    files: {
      'apps/web-vite/src/app/dashboard/LegacyAllowed.tsx': `
import { adminCopy } from '@/app/admin/copy';

export function LegacyAllowed() {
  return adminCopy;
}
`,
    },
  },
  (result) => {
    assertEqual(result.status, 0, 'allowlisted frozen cross-module import should pass at cap');
    assertIncludes(
      result.stdout,
      'scanned 1 app files; 1 frozen cross-module imports.',
      'allowlisted frozen count should be reported',
    );
  },
);

withFixture(
  {
    allowed: [
      {
        path: 'apps/web-vite/src/app/dashboard/LegacyExceeded.tsx',
        maxCrossModuleImports: 1,
        reason: 'legacy fixture keeps one cross-module import frozen',
      },
    ],
    files: {
      'apps/web-vite/src/app/dashboard/LegacyExceeded.tsx': `
import { adminCopy } from '@/app/admin/copy';
import { docsCopy } from '@/app/docs/copy';

export function LegacyExceeded() {
  return adminCopy + docsCopy;
}
`,
    },
  },
  (result) => {
    assertEqual(result.status, 1, 'allowlisted file exceeding cap should fail');
    assertIncludes(result.stderr, '- apps/web-vite/src/app/dashboard/LegacyExceeded.tsx: 2 > 1', 'cap growth should be reported');
    assertIncludes(result.stderr, 'cross-module imports exceeded frozen cap', 'cap growth reason should be reported');
  },
);

withFixture(
  {
    allowed: [
      {
        path: 'apps/web-vite/src/app/dashboard/LegacyStale.tsx',
        maxCrossModuleImports: 1,
        reason: 'legacy fixture should be removed once clean',
      },
      {
        path: 'apps/web-vite/src/app/dashboard/MissingLegacy.tsx',
        maxCrossModuleImports: 1,
        reason: 'legacy fixture points at a missing file',
      },
      {
        path: 'apps/web-vite/src/app/dashboard/LegacyReduced.tsx',
        maxCrossModuleImports: 2,
        reason: 'legacy fixture cap should be lowered when debt shrinks',
      },
    ],
    files: {
      'apps/web-vite/src/app/dashboard/LegacyStale.tsx': `
import { dashboardCopy } from './copy';

export function LegacyStale() {
  return dashboardCopy;
}
`,
      'apps/web-vite/src/app/dashboard/LegacyReduced.tsx': `
import { adminCopy } from '@/app/admin/copy';

export function LegacyReduced() {
  return adminCopy;
}
`,
    },
  },
  (result) => {
    assertEqual(result.status, 1, 'allowlist stale, missing, and reduced-cap maintenance should fail in one batched fixture');
    assertIncludes(
      result.stderr,
      'Found allowlist entries for missing files:',
      'missing allowlist header should be reported',
    );
    assertIncludes(result.stderr, 'apps/web-vite/src/app/dashboard/MissingLegacy.tsx', 'missing allowlist path should be reported');
    assertIncludes(
      result.stderr,
      'Found allowlisted files with no cross-module imports:',
      'stale allowlist header should be reported',
    );
    assertIncludes(result.stderr, 'apps/web-vite/src/app/dashboard/LegacyStale.tsx', 'stale allowlist path should be reported');
    assertIncludes(
      result.stderr,
      'Found allowlist caps above current cross-module import counts:',
      'reduced cap header should be reported',
    );
    assertIncludes(result.stderr, 'current=1 cap=2', 'reduced cap detail should be reported');
  },
);

withFixture(
  {
    moduleRoots: ['apps/web-vite/src/admin'],
  },
  (result) => {
    assertEqual(result.status, 1, 'invalid module roots outside apps/web-vite/src/app should fail');
    assertIncludes(
      result.stderr,
      'scripts/config/allowlists/app-module-boundary-allowlist.json moduleRoots must contain only apps/web-vite/src/app/* paths',
      'invalid module root should be reported',
    );
  },
);

withFixture(
  {
    writeConfig: false,
  },
  (result) => {
    assertEqual(result.status, 1, 'missing app module boundary config should fail');
    assertIncludes(
      result.stderr,
      'missing scripts/config/allowlists/app-module-boundary-allowlist.json',
      'missing config should be reported',
    );
  },
);

  return 'pass, alias, absolute, relative, type-only, re-export, dynamic, allowlist cap, config, scope, and false-positive checks passed.';
}
