import {
  compareTailwindUtilityCounts,
  countTailwindColorUtilitiesInFiles,
  countTailwindUtilityOccurrences,
} from './tailwind-utility-color-core.mjs';
import {
  formatTailwindUtilityColorDebtSummary,
  formatTailwindUtilityColorViolation,
} from './tailwind-utility-color-check.mjs';

function isSourceFile(file) {
  return (
    (file.startsWith('apps/web-vite/src/') || file.startsWith('apps/web-vite/src/')) &&
    /\.(?:js|jsx|ts|tsx|css)$/.test(file)
  );
}

function allowlistMap(allowed = []) {
  return new Map(
    allowed.map((entry) => [
      entry.path,
      new Map(Object.entries(entry.utilities)),
    ]),
  );
}

function runCheck(files, allowed = []) {
  const sourceFiles = Object.entries(files).filter(([file]) => isSourceFile(file));
  const actual = countTailwindColorUtilitiesInFiles(sourceFiles);
  const violations = compareTailwindUtilityCounts(actual, allowlistMap(allowed));

  if (violations.length === 0) {
    const occurrenceCount = countTailwindUtilityOccurrences(actual);
    return {
      status: 0,
      stdout: `[tailwind-utility-colors] OK: scanned ${sourceFiles.length} source files; ${formatTailwindUtilityColorDebtSummary(actual, occurrenceCount)}\n`,
      stderr: '',
    };
  }

  const lines = [
    '[tailwind-utility-colors] Tailwind color utility drift found.',
    '[tailwind-utility-colors] Replace usages with AIOS aliases. Default palette utilities may only stay as frozen legacy debt; arbitrary raw-color utilities, legacy compatibility aliases, and legacy global utility definitions are not allowlisted.',
    '',
  ];
  for (const violation of violations) {
    lines.push(formatTailwindUtilityColorViolation(violation));
  }
  return {
    status: 1,
    stdout: '',
    stderr: `${lines.join('\n')}\n`,
  };
}

function withFixture(files, assertion) {
  assertion(runCheck(files), files);
}

export function runTailwindUtilityColorsBehaviorFixtures(assertions) {
  const {
    assertEqual,
    assertIncludes,
    assertNotIncludes,
  } = assertions;

  withFixture(
    {
      'apps/web-vite/src/app/page.tsx': `
export function Page() {
  return <div className="text-text-primary bg-bg-card border-border-color">Token-backed</div>;
}
`,
    },
    (result) => {
      assertEqual(result.status, 0, 'token-backed Tailwind color aliases should pass');
      assertIncludes(result.stdout, 'clean baseline', 'passing output should identify clean baseline');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/app/default-palette.tsx': `
export function Page() {
  return <div className="text-gray-500 bg-white hover:border-blue-500">Default palette</div>;
}
`,
      'apps/web-vite/src/app/multiline-template.tsx': `
export function Page() {
  return (
    <div
      className={\`
        text-gray-500
        bg-white
      \`}
    />
  );
}
`,
      'apps/web-vite/src/app/arbitrary-raw.tsx': `
export function Page() {
  return <div className="bg-[#fff] shadow-[0_2px_8px_rgba(0,0,0,0.12)]">Raw</div>;
}
`,
      'apps/web-vite/src/app/legacy-semantic.tsx': `
export function Page() {
  return <div className="text-primary bg-warning-50 sm:text-success">Legacy</div>;
}
`,
      'apps/web-vite/src/styles/global.css': `
.text-primary {
  color: var(--text-primary);
}
`,
    },
    (result) => {
      assertEqual(result.status, 1, 'blocked Tailwind color utility families should fail in one batched fixture');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/default-palette.tsx: text-gray-500', 'failure should report text utility');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/default-palette.tsx: bg-white', 'failure should report white utility');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/default-palette.tsx: border-blue-500', 'failure should report variant utility token');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/multiline-template.tsx: text-gray-500', 'multiline template failure should report text utility');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/multiline-template.tsx: bg-white', 'multiline template failure should report background utility');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/arbitrary-raw.tsx: bg-[#fff]', 'failure should report arbitrary hex utility');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/app/arbitrary-raw.tsx: shadow-[0_2px_8px_rgba(0,0,0,0.12)]',
        'failure should report arbitrary rgba shadow utility',
      );
      assertIncludes(result.stderr, 'apps/web-vite/src/app/legacy-semantic.tsx: text-primary', 'failure should report legacy semantic text utility');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/legacy-semantic.tsx: bg-warning-50', 'failure should report legacy compatibility utility');
      assertIncludes(result.stderr, 'apps/web-vite/src/app/legacy-semantic.tsx: sm:text-success', 'failure should report prefixed legacy semantic utility token');
      assertIncludes(result.stderr, 'apps/web-vite/src/styles/global.css: .text-primary', 'failure should report global legacy utility definition');
    },
  );

  withFixture(
    {
      'apps/web-vite/src/app/page.tsx': `
// className="text-gray-500 bg-white"
/*
  className="border-blue-500"
*/
const docs = "Usage docs mention text-gray-500 but do not render it.";

export function Page() {
  return <div className="text-text-primary">Clean</div>;
}
`,
      'apps/web-vite/src/styles/global.css': `
/* .text-primary { color: red; } */
.tokenUtility {
  content: "bg-white";
}
`,
    },
    (result) => {
      assertEqual(result.status, 0, 'comments and non-class prose should not be over-blocked');
      assertNotIncludes(result.stderr, 'text-gray-500', 'line comment/default prose utility should not be reported');
      assertNotIncludes(result.stderr, 'border-blue-500', 'block comment utility should not be reported');
      assertNotIncludes(result.stderr, 'bg-white', 'CSS content string utility should not be reported');
    },
  );

  const allowedFile = 'apps/web-vite/src/app/legacy.tsx';
  withFixture(
    {
      'apps/web-vite/src/app/legacy.tsx': 'export const legacy = "text-gray-500";\n',
    },
    (result, files) => {
      assertEqual(result.status, 1, 'unallowlisted legacy utility should fail before allowlist rewrite');

      const allowedResult = runCheck(files, [
        {
          path: allowedFile,
          utilities: {
            'text-gray-500': 1,
          },
        },
      ]);
      assertEqual(allowedResult.status, 0, 'allowlisted legacy utility should pass at frozen cap');
      assertIncludes(allowedResult.stdout, '1 allowlisted files; 1 legacy/default', 'allowlisted pass output should report frozen debt');

      files[allowedFile] = 'export const legacy = "text-gray-500 bg-white";\n';
      const increasedResult = runCheck(files, [
        {
          path: allowedFile,
          utilities: {
            'text-gray-500': 1,
          },
        },
      ]);
      assertEqual(increasedResult.status, 1, 'allowlisted file growing utility debt should fail');
      assertIncludes(increasedResult.stderr, 'apps/web-vite/src/app/legacy.tsx: bg-white', 'growth failure should report new utility');

      files[allowedFile] = 'export const clean = "text-text-primary";\n';
      const staleResult = runCheck(files, [
        {
          path: allowedFile,
          utilities: {
            'text-gray-500': 1,
          },
        },
      ]);
      assertEqual(staleResult.status, 1, 'stale allowlist utility should fail');
      assertIncludes(staleResult.stderr, 'allowlist stale', 'stale failure should identify allowlist cleanup');
    },
  );

  return 'token aliases, blocked utility families, false positives, global definitions, and allowlist cap behavior checks passed.';
}
