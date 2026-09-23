import {
  buildFrontendComponentSizeAllowlist,
  checkFrontendComponentSize,
  formatFrontendComponentSizeExceptionSummary,
  FRONTEND_COMPONENT_SIZE_CONFIG_PATH,
} from './frontend-component-size-core.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('frontend component size behavior fixtures require guard assertions.');
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

function componentSource(lineCount) {
  const bodyLines = Array.from({ length: Math.max(0, lineCount - 4) }, (_, index) => `  const value${index} = ${index};`);
  return [
    'export function FixtureComponent() {',
    ...bodyLines,
    '  return null;',
    '}',
    '',
  ].join('\n');
}

function formatFailures(result) {
  const lines = [];
  if (result.missingAllowlistEntries.length > 0) {
    lines.push('[frontend-component-size] Found allowlist entries for missing files:');
    for (const entry of result.missingAllowlistEntries) {
      lines.push(`- ${entry.path}`);
    }
    lines.push('', `Remove stale entries from ${FRONTEND_COMPONENT_SIZE_CONFIG_PATH}.`);
  }
  if (result.staleAllowlistEntries.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('[frontend-component-size] Found allowlisted files now under the global threshold:');
    for (const entry of result.staleAllowlistEntries) {
      lines.push(`- ${entry.file}: ${entry.lines} lines`);
    }
    lines.push('', `Remove these entries from ${FRONTEND_COMPONENT_SIZE_CONFIG_PATH}.`);
  }
  if (result.violations.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('[frontend-component-size] Found oversized frontend component files:');
    for (const violation of result.violations) {
      lines.push(`- ${violation.file}: ${violation.lines} lines > ${violation.maxLines}`);
      lines.push(`  ${violation.reason}`);
    }
    lines.push('', 'Split large files into focused components/hooks/helpers, or add a temporary allowlist entry with a frozen cap and reason.');
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function runAudit(options) {
  if (!options.writeConfig) {
    return {
      status: 1,
      stdout: '',
      stderr: `missing ${FRONTEND_COMPONENT_SIZE_CONFIG_PATH}\n`,
    };
  }
  const config = {
    version: 1,
    maxLines: options.maxLines,
    allowed: options.allowed,
  };
  let allowlist;
  try {
    allowlist = buildFrontendComponentSizeAllowlist(config, {
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
    .filter((file) => /^(?:apps\/web-vite\/src\/app|apps\/web-vite\/src\/components)\/.*\.(?:tsx|jsx)$/.test(file))
    .sort();
  const result = checkFrontendComponentSize({
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
      : `[frontend-component-size] OK: scanned ${files.length} frontend TSX/JSX files; max ${config.maxLines} lines; ${formatFrontendComponentSizeExceptionSummary(allowlist)}\n`,
  };
}

function runFixture(options) {
  return runAudit({
    allowed: options.allowed ?? [],
    files: options.files ?? {},
    maxLines: options.maxLines ?? 12,
    writeConfig: options.writeConfig ?? true,
  });
}

export function runFrontendComponentSizeBehaviorFixtures(assertions) {
  useAssertions(assertions);

  let result = runFixture({
    files: {
      'apps/web-vite/src/app/dashboard/SmallPage.tsx': componentSource(6),
      'apps/web-vite/src/components/SmallCard.tsx': componentSource(7),
      'apps/web-vite/src/lib/OutOfScope.tsx': componentSource(30),
      'apps/web-vite/src/app/dashboard/Helper.ts': componentSource(30),
      'apps/web-vite/src/app/dashboard/StringLiteral.tsx': `
export function StringLiteral() {
  return 'Found oversized frontend component files:';
}
`,
    },
  });
  assertEqual(result.status, 0, 'small frontend TSX/JSX files, out-of-scope files, and string literals should pass');
  assertIncludes(
    result.stdout,
    'clean baseline; no frozen legacy exceptions.',
    'passing output should identify an empty allowlist as a clean baseline',
  );
  assertNotIncludes(
    result.stderr,
    'Found oversized frontend component files',
    'string literal false positive should not report violations',
  );

  result = runFixture({
    files: {
      'apps/web-vite/src/components/OversizedCard.tsx': componentSource(14),
      'apps/web-vite/src/app/dashboard/OversizedPage.jsx': componentSource(15),
    },
  });
  assertEqual(result.status, 1, 'non-allowlisted frontend TSX/JSX files above global max should fail');
  assertIncludes(
    result.stderr,
    '[frontend-component-size] Found oversized frontend component files:',
    'oversized file header should be reported',
  );
  assertIncludes(
    result.stderr,
    '- apps/web-vite/src/components/OversizedCard.tsx: 14 lines > 12',
    'oversized component should report line count and global cap',
  );
  assertIncludes(
    result.stderr,
    '- apps/web-vite/src/app/dashboard/OversizedPage.jsx: 15 lines > 12',
    'oversized JSX app file should be in scope',
  );
  assertIncludes(
    result.stderr,
    'File exceeds the global frontend component-size threshold.',
    'global violation reason should be reported',
  );

  result = runFixture({
    allowed: [
      {
        path: 'apps/web-vite/src/components/LegacyAllowed.tsx',
        maxLines: 16,
        reason: 'legacy fixture keeps one larger component frozen',
      },
    ],
    files: {
      'apps/web-vite/src/components/LegacyAllowed.tsx': componentSource(16),
    },
  });
  assertEqual(result.status, 0, 'allowlisted oversized component should pass at frozen cap');
  assertIncludes(
    result.stdout,
    'scanned 1 frontend TSX/JSX files; max 12 lines; 1 frozen legacy exceptions.',
    'allowlisted exception count should be reported',
  );

  result = runFixture({
    allowed: [
      {
        path: 'apps/web-vite/src/components/LegacyExceeded.tsx',
        maxLines: 16,
        reason: 'legacy fixture keeps one larger component frozen',
      },
      {
        path: 'apps/web-vite/src/components/LegacyStale.tsx',
        maxLines: 16,
        reason: 'legacy fixture should be removed once small',
      },
      {
        path: 'apps/web-vite/src/components/MissingLegacy.tsx',
        maxLines: 16,
        reason: 'legacy fixture points at a missing file',
      },
    ],
    files: {
      'apps/web-vite/src/components/LegacyExceeded.tsx': componentSource(17),
      'apps/web-vite/src/components/LegacyStale.tsx': componentSource(12),
    },
  });
  assertEqual(result.status, 1, 'component allowlist growth, stale entries, and missing entries should fail in one batched fixture');
  assertIncludes(
    result.stderr,
    'Found allowlist entries for missing files:',
    'missing allowlist header should be reported',
  );
  assertIncludes(result.stderr, '- apps/web-vite/src/components/MissingLegacy.tsx', 'missing allowlist path should be reported');
  assertIncludes(
    result.stderr,
    'Found allowlisted files now under the global threshold:',
    'stale allowlist header should be reported',
  );
  assertIncludes(result.stderr, '- apps/web-vite/src/components/LegacyStale.tsx: 12 lines', 'stale path and line count should be reported');
  assertIncludes(
    result.stderr,
    '- apps/web-vite/src/components/LegacyExceeded.tsx: 17 lines > 16',
    'allowlisted cap growth should be reported',
  );
  assertIncludes(
    result.stderr,
    'Allowlisted file grew beyond its frozen cap.',
    'allowlisted growth reason should be reported',
  );

  result = runFixture({
    allowed: [
      {
        path: 'apps/web-vite/src/components/BadAllowedCap.tsx',
        maxLines: 12,
        reason: 'cap is not above global max',
      },
    ],
    files: {
      'apps/web-vite/src/components/BadAllowedCap.tsx': componentSource(12),
    },
  });
  assertEqual(result.status, 1, 'allowlist caps must be above global max');
  assertIncludes(
    result.stderr,
    'apps/web-vite/src/components/BadAllowedCap.tsx maxLines must be an integer greater than global maxLines (12)',
    'invalid allowlist cap should be reported',
  );

  result = runFixture({
    files: {
      'apps/web-vite/src/components/MissingConfig.tsx': componentSource(6),
    },
    writeConfig: false,
  });
  assertEqual(result.status, 1, 'missing component size config should fail');
  assertIncludes(
    result.stderr,
    'missing scripts/config/allowlists/frontend-component-size-allowlist.json',
    'missing config should be reported',
  );

  return 'pass, global cap, jsx scope, allowlist cap, stale, missing, config, and false-positive checks passed.';
}
