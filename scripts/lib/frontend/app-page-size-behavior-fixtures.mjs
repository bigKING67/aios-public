import { isAppPageFile } from './app-route-paths.mjs';
import {
  buildAppPageSizeAllowlist,
  checkAppPageSize,
  formatAppPageSizeExceptionSummary,
} from '../../checks/app/page-size.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('app page size behavior fixtures require guard assertions.');
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

const CONFIG_PATH = 'scripts/config/allowlists/app-page-size-allowlist.json';

function pageSource(lineCount) {
  const bodyLines = Array.from({ length: Math.max(0, lineCount - 4) }, (_, index) => `  const value${index} = ${index};`);
  return [
    'export default function FixturePage() {',
    ...bodyLines,
    '  return null;',
    '}',
    '',
  ].join('\n');
}

function formatFailures(result) {
  const lines = [];
  if (result.missingAllowlistEntries.length > 0) {
    lines.push('[app-page-size] Found allowlist entries for missing app pages:');
    for (const entry of result.missingAllowlistEntries) {
      lines.push(`- ${entry.path}`);
    }
    lines.push('', `Remove stale entries from ${CONFIG_PATH}.`);
  }
  if (result.staleAllowlistEntries.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('[app-page-size] Found allowlisted app pages now under the global threshold:');
    for (const entry of result.staleAllowlistEntries) {
      lines.push(`- ${entry.file}: ${entry.lines} lines`);
    }
    lines.push('', `Remove these entries from ${CONFIG_PATH}.`);
  }
  if (result.violations.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('[app-page-size] Found oversized app page files:');
    for (const violation of result.violations) {
      lines.push(`- ${violation.file}: ${violation.lines} lines > ${violation.maxLines}`);
      lines.push(`  ${violation.reason}`);
    }
    lines.push('', 'Keep route entries thin: split page responsibilities into colocated _components, hooks, and helpers, or add a temporary allowlist entry with a frozen cap and reason.');
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
  const config = {
    version: 1,
    maxLines: options.maxLines,
    allowed: options.allowed,
  };
  let allowlist;
  try {
    allowlist = buildAppPageSizeAllowlist(config, {
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
  const files = Object.keys(options.files).filter(isAppPageFile).sort();
  const result = checkAppPageSize({
    allowlist,
    config,
    files,
    repoRoot: '',
    countLines: (file) => options.files[file].split(/\r?\n/).length,
  });
  const stderr = formatFailures(result);
  return {
    status: stderr ? 1 : 0,
    stderr,
    stdout: stderr
      ? ''
      : `[app-page-size] OK: scanned ${files.length} app page files; max ${config.maxLines} lines; ${formatAppPageSizeExceptionSummary(allowlist)}\n`,
  };
}

function withFixture(options, assertion) {
  assertion(runAudit({
    allowed: options.allowed ?? [],
    files: options.files ?? {},
    maxLines: options.maxLines ?? 12,
    writeConfig: options.writeConfig ?? true,
  }));
}

export function runAppPageSizeBehaviorFixtures(assertions) {
  useAssertions(assertions);

  withFixture(
    {
      files: {
        'apps/web-vite/src/app/dashboard/page.tsx': pageSource(6),
        'apps/web-vite/src/app/reports/weekly/page.ts': pageSource(7),
        'apps/web-vite/src/app/dashboard/_components/DashboardClient.tsx': pageSource(30),
        'apps/web-vite/src/components/page.tsx': pageSource(30),
        'apps/web-vite/src/app/string-literal/page.tsx': `
export default function StringLiteralPage() {
  return 'Found oversized app page files:';
}
`,
      },
    },
    (result) => {
      assertEqual(result.status, 0, 'small app pages, out-of-scope files, and string literals should pass');
      assertIncludes(
        result.stdout,
        'clean baseline; no frozen legacy exceptions.',
        'passing output should identify an empty allowlist as a clean baseline',
      );
      assertNotIncludes(
        result.stderr,
        'Found oversized app page files',
        'string literal false positive should not report violations',
      );
    },
  );

withFixture(
  {
    files: {
      'apps/web-vite/src/app/dashboard/page.tsx': pageSource(14),
      'apps/web-vite/src/app/reports/weekly/page.jsx': pageSource(15),
    },
  },
  (result) => {
    assertEqual(result.status, 1, 'non-allowlisted app pages above global max should fail');
    assertIncludes(
      result.stderr,
      '[app-page-size] Found oversized app page files:',
      'oversized app page header should be reported',
    );
    assertIncludes(
      result.stderr,
      '- apps/web-vite/src/app/dashboard/page.tsx: 14 lines > 12',
      'oversized app page should report line count and global cap',
    );
    assertIncludes(
      result.stderr,
      '- apps/web-vite/src/app/reports/weekly/page.jsx: 15 lines > 12',
      'oversized JSX app page should be in scope',
    );
    assertIncludes(
      result.stderr,
      'App page exceeds the global route-entry size threshold.',
      'global violation reason should be reported',
    );
  },
);

withFixture(
  {
    allowed: [
      {
        path: 'apps/web-vite/src/app/dashboard/page.tsx',
        maxLines: 16,
        reason: 'legacy fixture keeps one larger page frozen',
      },
    ],
    files: {
      'apps/web-vite/src/app/dashboard/page.tsx': pageSource(16),
    },
  },
  (result) => {
    assertEqual(result.status, 0, 'allowlisted oversized app page should pass at frozen cap');
    assertIncludes(
      result.stdout,
      'scanned 1 app page files; max 12 lines; 1 frozen legacy exceptions.',
      'allowlisted exception count should be reported',
    );
  },
);

withFixture(
  {
    allowed: [
      {
        path: 'apps/web-vite/src/app/dashboard/page.tsx',
        maxLines: 16,
        reason: 'legacy fixture keeps one larger page frozen',
      },
      {
        path: 'apps/web-vite/src/app/reports/weekly/page.tsx',
        maxLines: 16,
        reason: 'legacy fixture should be removed once small',
      },
      {
        path: 'apps/web-vite/src/app/missing/page.tsx',
        maxLines: 16,
        reason: 'legacy fixture points at a missing app page',
      },
    ],
    files: {
      'apps/web-vite/src/app/dashboard/page.tsx': pageSource(17),
      'apps/web-vite/src/app/reports/weekly/page.tsx': pageSource(12),
    },
  },
  (result) => {
    assertEqual(result.status, 1, 'app page allowlist growth, stale entries, and missing entries should fail in one batched fixture');
    assertIncludes(
      result.stderr,
      'Found allowlist entries for missing app pages:',
      'missing allowlist header should be reported',
    );
    assertIncludes(result.stderr, '- apps/web-vite/src/app/missing/page.tsx', 'missing allowlist path should be reported');
    assertIncludes(
      result.stderr,
      'Found allowlisted app pages now under the global threshold:',
      'stale allowlist header should be reported',
    );
    assertIncludes(result.stderr, '- apps/web-vite/src/app/reports/weekly/page.tsx: 12 lines', 'stale path and line count should be reported');
    assertIncludes(
      result.stderr,
      '- apps/web-vite/src/app/dashboard/page.tsx: 17 lines > 16',
      'allowlisted cap growth should be reported',
    );
    assertIncludes(
      result.stderr,
      'Allowlisted app page grew beyond its frozen cap.',
      'allowlisted growth reason should be reported',
    );
  },
);

withFixture(
  {
    allowed: [
      {
        path: 'apps/web-vite/src/app/dashboard/page.tsx',
        maxLines: 12,
        reason: 'cap is not above global max',
      },
    ],
    files: {
      'apps/web-vite/src/app/dashboard/page.tsx': pageSource(12),
    },
  },
  (result) => {
    assertEqual(result.status, 1, 'allowlist caps must be above global max');
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/dashboard/page.tsx maxLines must be an integer greater than global maxLines (12)',
      'invalid allowlist cap should be reported',
    );
  },
);

withFixture(
  {
    files: {
      'apps/web-vite/src/app/dashboard/page.tsx': pageSource(6),
    },
    writeConfig: false,
  },
  (result) => {
    assertEqual(result.status, 1, 'missing app page size config should fail');
    assertIncludes(
      result.stderr,
      'missing scripts/config/allowlists/app-page-size-allowlist.json',
      'missing config should be reported',
    );
  },
);

  return 'pass, global cap, jsx scope, allowlist cap, stale, missing, config, and false-positive checks passed.';
}
