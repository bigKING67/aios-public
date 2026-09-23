import {
  reportLineBudgetFailures,
} from '../shared/guard-utils.mjs';
import {
  auditCssModuleSize,
  buildCssModuleSizeAllowlist,
  cssModuleSizeExceptionSummary,
} from '../../checks/css-modules/size.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('CSS Module size behavior fixtures require guard assertions.');
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

const CONFIG_PATH = 'scripts/config/allowlists/css-module-size-allowlist.json';

function configJson(options = {}) {
  const {
    allowed = [],
    maxLines = 12,
  } = options;
  return JSON.stringify(
    {
      version: 1,
      maxLines,
      allowed,
    },
    null,
    2,
  );
}

function cssModuleSource(lineCount) {
  return Array.from(
    { length: lineCount },
    (_, index) => `.class${index} { color: var(--dsr-text-primary); }`,
  ).join('\n');
}

function fixtureFiles(options = {}) {
  const {
    allowed = [],
    files = {},
    maxLines = 12,
    writeConfig = true,
  } = options;
  const fixture = {
    packageJson: '{"name":"css-module-size-fixture","private":true}\n',
    ...files,
  };
  if (writeConfig) {
    fixture[CONFIG_PATH] = `${configJson({ allowed, maxLines })}\n`;
  }

  return fixture;
}

function captureStderr(callback) {
  const originalError = console.error;
  const originalExit = process.exit;
  const lines = [];
  console.error = (...args) => {
    lines.push(args.join(' '));
  };
  process.exit = (code) => {
    const error = new Error(`process.exit(${code})`);
    error.name = 'ProcessExitIntercept';
    throw error;
  };
  try {
    callback();
  } catch (error) {
    if (!(error instanceof Error && error.name === 'ProcessExitIntercept')) {
      lines.push(error instanceof Error ? error.message : String(error));
    }
  } finally {
    console.error = originalError;
    process.exit = originalExit;
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function runAudit(options = {}) {
  const files = fixtureFiles(options);
  const configSource = files[CONFIG_PATH];
  if (!configSource) {
    return {
      status: 1,
      stdout: '',
      stderr: `[css-module-size] ERROR: missing ${CONFIG_PATH}\n`,
    };
  }

  let config;
  let allowlist;
  try {
    config = JSON.parse(configSource);
    allowlist = buildCssModuleSizeAllowlist(config, {
      fail: (message) => {
        throw new Error(`[css-module-size] ERROR: ${message}`);
      },
    });
  } catch (error) {
    return {
      status: 1,
      stdout: '',
      stderr: error instanceof Error ? `${error.message}\n` : `${error}\n`,
    };
  }

  const cssModuleFiles = Object.keys(files)
    .filter((file) => file.startsWith('apps/web-vite/src/') && file.endsWith('.module.css'))
    .sort();
  const auditResult = auditCssModuleSize({
    allowlist,
    config,
    countLines: (file) => String(files[file] ?? '').split(/\r?\n/).length,
    files: cssModuleFiles,
  });

  const stderr = captureStderr(() => reportLineBudgetFailures(auditResult, {
    configPath: CONFIG_PATH,
    guardName: 'css-module-size',
    missingHeader: 'Found allowlist entries for missing files:',
    staleHeader: 'Found allowlisted CSS Modules now under the global threshold:',
    violationHeader: 'Found oversized CSS Modules:',
    violationFooter:
      'Split oversized stylesheets by page section/component, or add a temporary allowlist entry with a frozen cap and reason.',
  }));
  if (stderr) {
    return {
      status: 1,
      stdout: '',
      stderr,
    };
  }

  return {
    status: 0,
    stdout: `[css-module-size] OK: scanned ${cssModuleFiles.length} CSS Modules; max ${config.maxLines} lines; ${cssModuleSizeExceptionSummary(allowlist)}\n`,
    stderr: '',
  };
}

function withFixture(options, assertion) {
  assertion(runAudit(options));
}

export function runCssModuleSizeBehaviorFixtures(assertions) {
  useAssertions(assertions);

  withFixture(
    {
      files: {
        'apps/web-vite/src/app/dashboard/SmallPage.module.css': cssModuleSource(6),
        'apps/web-vite/src/components/SmallCard.module.css': cssModuleSource(7),
        'apps/web-vite/src/app/dashboard/Plain.css': cssModuleSource(30),
        'apps/web-vite/src/app/dashboard/Styles.module.scss': cssModuleSource(30),
        'apps/web-vite/test/App.module.css': cssModuleSource(30),
        'apps/web-vite/src/app/dashboard/StringLiteral.module.css': `
.fixture::before {
  content: 'Found oversized CSS Modules:';
}
`,
      },
    },
    (result) => {
      assertEqual(result.status, 0, 'small src CSS Modules, ignored files, and CSS content literals should pass');
      assertIncludes(
        result.stdout,
        'clean baseline; no frozen legacy exceptions.',
        'passing output should identify an empty allowlist as a clean baseline',
      );
      assertNotIncludes(
        result.stderr,
        'Found oversized CSS Modules',
        'string literal false positive should not report violations',
      );
    },
  );

withFixture(
  {
    files: {
      'apps/web-vite/src/app/dashboard/Oversized.module.css': cssModuleSource(14),
    },
  },
  (result) => {
    assertEqual(result.status, 1, 'non-allowlisted CSS Module above global max should fail');
    assertIncludes(
      result.stderr,
      '[css-module-size] Found oversized CSS Modules:',
      'oversized file header should be reported',
    );
    assertIncludes(
      result.stderr,
      '- apps/web-vite/src/app/dashboard/Oversized.module.css: 14 lines > 12',
      'oversized CSS Module should report line count and global cap',
    );
    assertIncludes(
      result.stderr,
      'CSS Module exceeds the global stylesheet-size threshold.',
      'global violation reason should be reported',
    );
  },
);

withFixture(
  {
    allowed: [
      {
        path: 'apps/web-vite/src/app/dashboard/LegacyAllowed.module.css',
        maxLines: 16,
        reason: 'legacy fixture keeps one larger stylesheet frozen',
      },
    ],
    files: {
      'apps/web-vite/src/app/dashboard/LegacyAllowed.module.css': cssModuleSource(16),
    },
  },
  (result) => {
    assertEqual(result.status, 0, 'allowlisted oversized CSS Module should pass at frozen cap');
    assertIncludes(
      result.stdout,
      'scanned 1 CSS Modules; max 12 lines; 1 frozen legacy exceptions.',
      'allowlisted exception count should be reported',
    );
  },
);

withFixture(
  {
    allowed: [
      {
        path: 'apps/web-vite/src/app/dashboard/LegacyExceeded.module.css',
        maxLines: 16,
        reason: 'legacy fixture keeps one larger stylesheet frozen',
      },
      {
        path: 'apps/web-vite/src/app/dashboard/LegacyStale.module.css',
        maxLines: 16,
        reason: 'legacy fixture should be removed once small',
      },
      {
        path: 'apps/web-vite/src/app/dashboard/MissingLegacy.module.css',
        maxLines: 16,
        reason: 'legacy fixture points at a missing stylesheet',
      },
    ],
    files: {
      'apps/web-vite/src/app/dashboard/LegacyExceeded.module.css': cssModuleSource(17),
      'apps/web-vite/src/app/dashboard/LegacyStale.module.css': cssModuleSource(12),
    },
  },
  (result) => {
    assertEqual(result.status, 1, 'allowlist growth, stale entries, and missing entries should fail in one batched fixture');
    assertIncludes(
      result.stderr,
      'Found allowlist entries for missing files:',
      'missing allowlist header should be reported',
    );
    assertIncludes(result.stderr, '- apps/web-vite/src/app/dashboard/MissingLegacy.module.css', 'missing allowlist path should be reported');
    assertIncludes(
      result.stderr,
      'Found allowlisted CSS Modules now under the global threshold:',
      'stale allowlist header should be reported',
    );
    assertIncludes(
      result.stderr,
      '- apps/web-vite/src/app/dashboard/LegacyStale.module.css: 12 lines',
      'stale path and line count should be reported',
    );
    assertIncludes(
      result.stderr,
      '- apps/web-vite/src/app/dashboard/LegacyExceeded.module.css: 17 lines > 16',
      'allowlisted cap growth should be reported',
    );
    assertIncludes(
      result.stderr,
      'Allowlisted CSS Module grew beyond its frozen cap.',
      'allowlisted growth reason should be reported',
    );
  },
);

withFixture(
  {
    allowed: [
      {
        path: 'apps/web-vite/src/app/dashboard/BadAllowedCap.module.css',
        maxLines: 12,
        reason: 'cap is not above global max',
      },
    ],
    files: {
      'apps/web-vite/src/app/dashboard/BadAllowedCap.module.css': cssModuleSource(12),
    },
  },
  (result) => {
    assertEqual(result.status, 1, 'allowlist caps must be above global max');
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/dashboard/BadAllowedCap.module.css maxLines must be an integer greater than global maxLines (12)',
      'invalid allowlist cap should be reported',
    );
  },
);

withFixture(
  {
    allowed: [
      {
        path: 'apps/web-vite/src/app/dashboard/Plain.css',
        maxLines: 16,
        reason: 'plain CSS is not valid for this CSS Module guard',
      },
    ],
    files: {
      'apps/web-vite/src/app/dashboard/Plain.css': cssModuleSource(16),
    },
  },
  (result) => {
    assertEqual(result.status, 1, 'allowlist entries must point at CSS Module files');
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/app/dashboard/Plain.css must be a CSS Module path',
      'invalid allowlist path should be reported',
    );
  },
);

withFixture(
  {
    files: {
      'apps/web-vite/src/app/dashboard/MissingConfig.module.css': cssModuleSource(6),
    },
    writeConfig: false,
  },
  (result) => {
    assertEqual(result.status, 1, 'missing CSS Module size config should fail');
    assertIncludes(
      result.stderr,
      'missing scripts/config/allowlists/css-module-size-allowlist.json',
      'missing config should be reported',
    );
  },
);

  return 'pass, global cap, allowlist cap, stale, missing, invalid config/path, and false-positive checks passed.';
}
