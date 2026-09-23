import { readFileSync } from 'node:fs';

import {
  CHART_SERIES_MAPPINGS,
  EXTERNAL_COLOR_VALUE_MAPPINGS,
  TOKEN_COLOR_VALUE_PATHS,
  TOKEN_RUNTIME_COLOR_VALUES_CONST,
  TOKEN_RUNTIME_FONT_FAMILY_CONST,
  TOKEN_RUNTIME_SHADOW_VALUES_CONST,
  auditDesignTokenValuesSource,
  formatDesignTokenValuesFailure,
} from './design-token-values-sync-core.mjs';

const CANONICAL_TOKENS = JSON.parse(
  readFileSync(new URL('../../../DESIGN_TOKENS.json', import.meta.url), 'utf8'),
);
const PASS_OUTPUT = '[design-token-values-sync] OK: 38 color helper fields, 6 chart series entries, font family, and shadows mirror canonical token data without shipping metadata.\n';

function resolveCanonicalValue(path) {
  return path.split('.').reduce((value, segment) => value[segment], CANONICAL_TOKENS);
}

const RUNTIME_COLOR_VALUES = Object.fromEntries(
  Object.entries(TOKEN_COLOR_VALUE_PATHS).map(([key, path]) => [key, resolveCanonicalValue(path)]),
);

const TOKEN_MIRROR_SOURCE = `
export const designTokens = {} as const;
export const ${TOKEN_RUNTIME_COLOR_VALUES_CONST} = ${JSON.stringify(RUNTIME_COLOR_VALUES, null, 2)} as const;
export const ${TOKEN_RUNTIME_FONT_FAMILY_CONST} = ${JSON.stringify(CANONICAL_TOKENS.typography.fontFamily.base)};
export const ${TOKEN_RUNTIME_SHADOW_VALUES_CONST} = ${JSON.stringify(CANONICAL_TOKENS.shadow, null, 2)} as const;
`;

const VALUE_HELPER_SOURCE = `
import { CHART_SERIES_COLORS } from './domain-taxonomy-colors';
import {
  ${TOKEN_RUNTIME_COLOR_VALUES_CONST},
  ${TOKEN_RUNTIME_FONT_FAMILY_CONST},
  ${TOKEN_RUNTIME_SHADOW_VALUES_CONST},
} from './design-tokens';
import { PLATFORM_LEGEND_COLORS } from './platform-colors';

export const DESIGN_COLOR_VALUES = {
  ...${TOKEN_RUNTIME_COLOR_VALUES_CONST},
${Object.entries(EXTERNAL_COLOR_VALUE_MAPPINGS)
    .map(([key, expression]) => `  ${key}: ${expression},`)
    .join('\n')}
  chartSeries: [
${CHART_SERIES_MAPPINGS.map((expression) => `    ${expression},`).join('\n')}
  ],
} as const;

export const DESIGN_FONT_FAMILY = ${TOKEN_RUNTIME_FONT_FAMILY_CONST};
export const DESIGN_SHADOW_VALUES = ${TOKEN_RUNTIME_SHADOW_VALUES_CONST};
`;

function runCheck(source = VALUE_HELPER_SOURCE, tokenMirrorSource = TOKEN_MIRROR_SOURCE) {
  const findings = auditDesignTokenValuesSource(source, {
    canonicalTokens: CANONICAL_TOKENS,
    tokenMirrorSource,
  });

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: PASS_OUTPUT,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatDesignTokenValuesFailure(findings)}\n`,
  };
}

function withFixture({ source = VALUE_HELPER_SOURCE, tokenMirrorSource = TOKEN_MIRROR_SOURCE }, assertion) {
  assertion(runCheck(source, tokenMirrorSource));
}

export function runDesignTokenValuesSyncBehaviorFixtures({
  assertEqual,
  assertIncludes,
}) {
  withFixture({}, (result) => {
    assertEqual(result.status, 0, 'matching generated runtime tokens and helper fixture should pass');
    assertIncludes(result.stdout, 'color helper fields', 'passing output should describe color helper mappings');
    assertIncludes(result.stdout, 'without shipping metadata', 'passing output should describe the compact runtime boundary');
  });

  withFixture(
    {
      tokenMirrorSource: TOKEN_MIRROR_SOURCE.replace(
        '"primary": "#2F6EEA"',
        '"primary": "#FFFFFF"',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'canonical generated color drift should fail');
      assertIncludes(result.stderr, 'primary must mirror "#2F6EEA"', 'color drift should report the canonical value');
    },
  );

  withFixture(
    {
      source: VALUE_HELPER_SOURCE.replace("import { PLATFORM_LEGEND_COLORS } from './platform-colors';\n", ''),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing platform import should fail');
      assertIncludes(result.stderr, "import { PLATFORM_LEGEND_COLORS } from './platform-colors';", 'import drift should be explicit');
    },
  );

  withFixture(
    {
      tokenMirrorSource: TOKEN_MIRROR_SOURCE.replace(
        '"danger": "#C93A32"',
        '"danger": "#168A3A"',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'root error alias value drift should fail');
      assertIncludes(result.stderr, 'danger must mirror "#C93A32"', 'root alias drift should report the canonical value');
    },
  );

  withFixture(
    {
      source: VALUE_HELPER_SOURCE.replace('platformJd: PLATFORM_LEGEND_COLORS.jd', "platformJd: '#DA291C'"),
    },
    (result) => {
      assertEqual(result.status, 1, 'platform helper source drift should fail');
      assertIncludes(result.stderr, 'platformJd must use PLATFORM_LEGEND_COLORS.jd', 'platform drift should report the shared source');
    },
  );

  withFixture(
    {
      source: VALUE_HELPER_SOURCE.replace('    CHART_SERIES_COLORS.series6,\n', ''),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing chart series helper entry should fail');
      assertIncludes(result.stderr, 'CHART_SERIES_COLORS.series6', 'chart series drift should report the missing entry');
    },
  );

  withFixture(
    {
      tokenMirrorSource: TOKEN_MIRROR_SOURCE.replace(
        `export const ${TOKEN_RUNTIME_FONT_FAMILY_CONST} = ${JSON.stringify(CANONICAL_TOKENS.typography.fontFamily.base)};`,
        `export const ${TOKEN_RUNTIME_FONT_FAMILY_CONST} = "system-ui";`,
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'generated font drift should fail');
      assertIncludes(result.stderr, `${TOKEN_RUNTIME_FONT_FAMILY_CONST} must mirror typography.fontFamily.base`, 'font drift should report the canonical path');
    },
  );

  withFixture(
    {
      source: VALUE_HELPER_SOURCE.replace(
        `export const DESIGN_FONT_FAMILY = ${TOKEN_RUNTIME_FONT_FAMILY_CONST};`,
        "export const DESIGN_FONT_FAMILY = 'system-ui';",
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'font helper alias drift should fail');
      assertIncludes(result.stderr, `DESIGN_FONT_FAMILY must use ${TOKEN_RUNTIME_FONT_FAMILY_CONST}`, 'font helper drift should report the compact source');
    },
  );

  withFixture(
    {
      tokenMirrorSource: TOKEN_MIRROR_SOURCE.replace(
        `"sm": ${JSON.stringify(CANONICAL_TOKENS.shadow.sm)}`,
        '"sm": "none"',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'generated shadow drift should fail');
      assertIncludes(result.stderr, TOKEN_RUNTIME_SHADOW_VALUES_CONST, 'shadow drift should report the affected generated source');
      assertIncludes(result.stderr, '.sm must mirror', 'shadow drift should report the affected key');
    },
  );

  withFixture(
    {
      source: VALUE_HELPER_SOURCE.replace(
        `export const DESIGN_SHADOW_VALUES = ${TOKEN_RUNTIME_SHADOW_VALUES_CONST};`,
        "export const DESIGN_SHADOW_VALUES = { sm: 'none' } as const;",
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'shadow helper alias drift should fail');
      assertIncludes(result.stderr, `DESIGN_SHADOW_VALUES must use ${TOKEN_RUNTIME_SHADOW_VALUES_CONST}`, 'shadow helper drift should report the compact source');
    },
  );

  withFixture(
    {
      tokenMirrorSource: TOKEN_MIRROR_SOURCE.replace(
        `,\n  "divider": ${JSON.stringify(CANONICAL_TOKENS.color.divider.value)}\n`,
        '',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing generated runtime color key should fail');
      assertIncludes(result.stderr, `${TOKEN_RUNTIME_COLOR_VALUES_CONST} missing divider`, 'missing key should be explicit');
    },
  );

  withFixture(
    {
      tokenMirrorSource: TOKEN_MIRROR_SOURCE.replace(
        `  "divider": ${JSON.stringify(CANONICAL_TOKENS.color.divider.value)}\n`,
        `  "divider": ${JSON.stringify(CANONICAL_TOKENS.color.divider.value)},\n  "localAccent": "#2F6EEA"\n`,
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'unexpected generated runtime color key should fail');
      assertIncludes(result.stderr, `has unexpected key localAccent`, 'unexpected key should be explicit');
    },
  );

  withFixture(
    {
      source: VALUE_HELPER_SOURCE.replace(
        `  ${TOKEN_RUNTIME_COLOR_VALUES_CONST},`,
        `  designTokens,\n  ${TOKEN_RUNTIME_COLOR_VALUES_CONST},`,
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'metadata-rich runtime import should fail');
      assertIncludes(result.stderr, 'must not import the metadata-rich designTokens object', 'metadata boundary drift should be explicit');
    },
  );

  withFixture(
    {
      source: VALUE_HELPER_SOURCE.replace(`  ${TOKEN_RUNTIME_SHADOW_VALUES_CONST},\n`, ''),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing compact shadow import should fail');
      assertIncludes(result.stderr, `missing compact runtime import ${TOKEN_RUNTIME_SHADOW_VALUES_CONST}`, 'compact import drift should be explicit');
    },
  );

  withFixture(
    {
      source: VALUE_HELPER_SOURCE.replace(
        `  ...${TOKEN_RUNTIME_COLOR_VALUES_CONST},`,
        "  primary: '#2F6EEA',",
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'local raw token reconstruction should fail');
      assertIncludes(result.stderr, `...${TOKEN_RUNTIME_COLOR_VALUES_CONST},`, 'helper should require the generated compact spread');
      assertIncludes(result.stderr, 'unexpected key primary', 'local token reconstruction should be rejected');
    },
  );

  return 'pass, generated color/font/shadow drift, import/source drift, chart/platform drift, missing/extra key, metadata import, and local reconstruction checks passed.';
}
