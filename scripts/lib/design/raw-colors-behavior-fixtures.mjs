import {
  auditEchartsFallbackRawColorLines,
  formatEchartsFallbackRawColorFailure,
  summarizeEchartsFallbackRawColors,
} from '../../checks/design/echarts-css-fallback-colors.mjs';
import {
  auditRawColorAllowlistDocs,
  extractRawColorGovernanceTablePaths,
  formatRawColorAllowlistDocsFailure,
  summarizeRawColorAllowlistDocs,
} from '../../checks/design/raw-color-allowlist-docs.mjs';
import {
  auditCssModuleRawColorFiles,
  formatCssModuleRawColorFailure,
  summarizeCssModuleRawColorAudit,
} from './raw-colors-css-modules-core.mjs';
import {
  auditNonModuleRawColorFiles,
  formatNonModuleRawColorFailure,
  summarizeNonModuleRawColorAudit,
} from './raw-colors-non-modules-core.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('raw color behavior fixtures require guard assertions.');
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

function sourceLines(source) {
  return source.split('\n');
}

function okResult(guardName, summary) {
  return {
    status: 0,
    stdout: `[${guardName}] OK: ${summary}\n`,
    stderr: '',
  };
}

function failureResult(message) {
  return {
    status: 1,
    stdout: '',
    stderr: `${message}\n`,
  };
}

function parseAllowlistPaths(files) {
  const config = JSON.parse(files['scripts/config/allowlists/design-raw-color-allowlist.json']);
  return new Set(config.sources.map((source) => source.path));
}

function runCssModuleAudit(files) {
  const cssModuleFiles = Object.keys(files)
    .filter((file) => file.endsWith('.module.css'))
    .sort();
  const violations = auditCssModuleRawColorFiles(cssModuleFiles, {
    readLines: (file) => sourceLines(files[file]),
  });

  if (violations.length > 0) {
    return failureResult(formatCssModuleRawColorFailure(violations));
  }

  return okResult('raw-color-audit', summarizeCssModuleRawColorAudit(cssModuleFiles.length));
}

function runNonModuleAudit(files) {
  const rawColorSourceFiles = parseAllowlistPaths(files);
  const candidateFiles = Object.keys(files)
    .filter((file) => (
      /src\/.+\.(?:css|ts|tsx)$/.test(file) &&
      !file.endsWith('.module.css') &&
      !rawColorSourceFiles.has(file)
    ))
    .sort();
  const violations = auditNonModuleRawColorFiles(candidateFiles, {
    readLines: (file) => sourceLines(files[file]),
  });

  if (violations.length > 0) {
    return failureResult(formatNonModuleRawColorFailure(violations));
  }

  return okResult(
    'raw-color-audit:non-module',
    summarizeNonModuleRawColorAudit(candidateFiles.length, rawColorSourceFiles.size),
  );
}

function runAllowlistDocsAudit(files) {
  const allowlistPaths = parseAllowlistPaths(files);
  const documentedPaths = extractRawColorGovernanceTablePaths(sourceLines(files['DESIGN.md']));
  const result = auditRawColorAllowlistDocs({ allowlistPaths, documentedPaths });

  if (result.missingFromDocs.length > 0 || result.missingFromAllowlist.length > 0) {
    return failureResult(formatRawColorAllowlistDocsFailure(result));
  }

  return okResult('raw-color-allowlist-docs', summarizeRawColorAllowlistDocs(allowlistPaths));
}

function runEchartsFallbackAudit(files) {
  const result = auditEchartsFallbackRawColorLines(sourceLines(files['apps/web-vite/src/styles/echarts.css']));

  if (result.violations.length > 0) {
    return failureResult(formatEchartsFallbackRawColorFailure(result.violations));
  }

  return okResult('echarts-css-fallback-colors', summarizeEchartsFallbackRawColors(result.fallbackCount));
}

function rawColorAllowlistSource(pathValue = 'apps/web-vite/src/lib/design-token-values.ts') {
  return {
    version: 1,
    sources: [
      {
        path: pathValue,
        owner: 'fixture-token-source',
        reason: 'Fixture raw color token source.',
        allowed: 'Fixture token values.',
        notAllowed: 'Component-local raw colors.',
      },
    ],
  };
}

function rawColorGovernanceDoc(paths) {
  const rows = paths
    .map((sourcePath) => `| \`${sourcePath}\` | Fixture source |`)
    .join('\n');

  return `
# Fixture Design

## Raw Color Governance

| Source | Purpose |
| --- | --- |
${rows}

## Next Section
`;
}

function assertCssModuleRawColorBehavior() {
  {
    const result = runCssModuleAudit({
      'apps/web-vite/src/good.module.css': `
.card {
  --card-material-glow: rgba(47, 110, 234, 0.18);
  --card-material-solid: #ffffff;
  color: var(--text-primary);
}

/* #fff in comments must not count. */
`,
      'apps/web-vite/src/string-url.module.css': `
.icon::before {
  content: "#fff";
  background-image: url("#icon-fff");
  mask-image: url("data:image/svg+xml,%3Csvg fill='%23fff'%3E%3C/svg%3E");
}
`,
    });
    assertEqual(result.status, 0, 'CSS Module material raw colors plus string/url color-like literals should pass');
    assertIncludes(result.stdout, 'no non-material raw colors found', 'string/url pass output should stay clean');
  }

  {
    const result = runCssModuleAudit({
      'apps/web-vite/src/var-fallback.module.css': `
.card {
  color: var(--text-primary, #ffffff);
}
`,
      'apps/web-vite/src/bad.module.css': `
.card {
  color: #ffffff;
}
`,
      'apps/web-vite/src/bad-prop.module.css': `
.card {
  --card-accent: #ffffff;
}
`,
    });
    assertEqual(result.status, 1, 'CSS Module raw color violations should fail in one batched fixture');
    assertIncludes(result.stderr, 'apps/web-vite/src/var-fallback.module.css:3', 'raw fallback failure should include source location');
    assertIncludes(result.stderr, 'raw color outside material alias', 'raw fallback failure should keep declaration reason');
    assertIncludes(result.stderr, 'apps/web-vite/src/bad.module.css:3', 'CSS Module failure should include source location');
    assertIncludes(
      result.stderr,
      'raw color in non-material custom property --card-accent',
      'CSS Module failure should identify non-material custom property',
    );
  }
}

function assertNonModuleRawColorBehavior() {
  const allowlist = rawColorAllowlistSource();

  {
    const result = runNonModuleAudit({
      'scripts/config/allowlists/design-raw-color-allowlist.json': JSON.stringify(allowlist, null, 2),
      'apps/web-vite/src/lib/design-token-values.ts': 'export const token = "#ffffff";\n',
      'apps/web-vite/src/app/page.tsx': `
export const docsUrl = "https://example.invalid/#fff";
export const dataUri = 'data:image/svg+xml,%3Csvg fill="%23fff"%3E%3C/svg%3E';
export const cssUrl = \`url("#icon-fff")\`;

export function Page() {
  return <div className="ok">No inline raw style</div>;
}
`,
      'apps/web-vite/src/styles/global.css': `
.icon::before {
  content: "#fff";
  background-image: url("#icon-fff");
}
`,
    });
    assertEqual(result.status, 0, 'approved sources and URL-like color literals should pass');
    assertIncludes(result.stdout, 'approved sources', 'non-module pass output should include source count');
    assertIncludes(result.stdout, 'no raw colors outside approved sources found', 'non-module string/url pass output should stay clean');
  }

  {
    const result = runNonModuleAudit({
      'scripts/config/allowlists/design-raw-color-allowlist.json': JSON.stringify(allowlist, null, 2),
      'apps/web-vite/src/lib/design-token-values.ts': 'export const token = "#ffffff";\n',
      'apps/web-vite/src/app/page-style.tsx': `
export function Page() {
  return <div style={{ color: "#ffffff" }}>Blocked</div>;
}
`,
      'apps/web-vite/src/app/page-raw.tsx': `
export const localColor = "#ffffff";
export const commented = true; // "#000000" should not add a second finding
/*
const oldColor = "#111111";
*/
`,
    });
    assertEqual(result.status, 1, 'non-module raw color violations should fail in one batched fixture');
    assertIncludes(result.stderr, 'Raw color violations found outside approved color sources', 'non-module failure should explain boundary');
    assertIncludes(result.stderr, 'apps/web-vite/src/app/page-style.tsx:3: #ffffff', 'non-module JSX style failure should include source location');
    assertIncludes(result.stderr, 'apps/web-vite/src/app/page-raw.tsx:2: #ffffff', 'non-module failure should report real raw color');
    assertNotIncludes(result.stderr, '#000000', 'line comment raw color should not be reported');
    assertNotIncludes(result.stderr, '#111111', 'block comment raw color should not be reported');
  }
}

function assertRawColorDocsBehavior() {
  const allowlist = rawColorAllowlistSource();

  {
    const result = runAllowlistDocsAudit({
      'scripts/config/allowlists/design-raw-color-allowlist.json': JSON.stringify(allowlist, null, 2),
      'DESIGN.md': rawColorGovernanceDoc(['apps/web-vite/src/lib/design-token-values.ts']),
    });
    assertEqual(result.status, 0, 'matching raw color allowlist docs should pass');
    assertIncludes(result.stdout, 'raw color source paths documented', 'docs pass output should confirm source count');
  }

  {
    const result = runAllowlistDocsAudit({
      'scripts/config/allowlists/design-raw-color-allowlist.json': JSON.stringify(allowlist, null, 2),
      'DESIGN.md': rawColorGovernanceDoc(['apps/web-vite/src/lib/other-token-values.ts']),
    });
    assertEqual(result.status, 1, 'raw color allowlist/docs drift should fail');
    assertIncludes(result.stderr, 'Raw color source docs mismatch', 'docs drift failure should explain mismatch');
    assertIncludes(result.stderr, 'apps/web-vite/src/lib/design-token-values.ts', 'docs drift failure should print missing allowlist path');
    assertIncludes(result.stderr, 'apps/web-vite/src/lib/other-token-values.ts', 'docs drift failure should print extra docs path');
  }
}

function assertEchartsFallbackBehavior() {
  {
    const result = runEchartsFallbackAudit({
      'apps/web-vite/src/styles/echarts.css': `
:root {
  --echarts-fallback-axis: #ffffff;
  --echarts-fallback-shadow: rgba(0, 0, 0, 0.14);
  --echarts-axis-color: var(--text-secondary);
}
`,
    });
    assertEqual(result.status, 0, 'ECharts fallback raw colors should pass only in fallback variables');
    assertIncludes(result.stdout, 'fallback raw colors centralized', 'ECharts fallback pass output should report count');
  }

  {
    const result = runEchartsFallbackAudit({
      'apps/web-vite/src/styles/echarts.css': `
:root {
  --echarts-axis-color: #ffffff;
}
`,
    });
    assertEqual(result.status, 1, 'ECharts raw colors outside fallback variables should fail');
    assertIncludes(
      result.stderr,
      'must live in --echarts-fallback-* declarations',
      'ECharts fallback failure should explain boundary',
    );
    assertIncludes(result.stderr, 'apps/web-vite/src/styles/echarts.css:3: #ffffff', 'ECharts failure should include source location');
  }
}

export function runRawColorsBehaviorFixtures(assertions) {
  useAssertions(assertions);

  assertCssModuleRawColorBehavior();
  assertNonModuleRawColorBehavior();
  assertRawColorDocsBehavior();
  assertEchartsFallbackBehavior();

  return 'CSS Module, non-module, docs drift, and ECharts fallback raw-color behavior checks passed.';
}
