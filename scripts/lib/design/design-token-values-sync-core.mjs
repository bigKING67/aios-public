export const VALUE_HELPER_PATH = 'apps/web-vite/src/lib/design-token-values.ts';
export const CANONICAL_TOKEN_PATH = 'DESIGN_TOKENS.json';
export const TOKEN_MIRROR_PATH = 'apps/web-vite/src/lib/design-tokens.ts';
export const TOKEN_RUNTIME_COLOR_VALUES_CONST = 'DESIGN_TOKEN_RUNTIME_COLOR_VALUES';
export const TOKEN_RUNTIME_FONT_FAMILY_CONST = 'DESIGN_TOKEN_RUNTIME_FONT_FAMILY';
export const TOKEN_RUNTIME_SHADOW_VALUES_CONST = 'DESIGN_TOKEN_RUNTIME_SHADOW_VALUES';

export const TOKEN_COLOR_VALUE_PATHS = Object.freeze({
  primary: 'color.primary.value',
  success: 'color.success.value',
  warning: 'color.warning.value',
  danger: 'color.error.value',
  info: 'color.info.value',
  statusSuccess: 'color.status.success.value',
  statusSuccessBg: 'color.status.successBg.value',
  statusSuccessBorder: 'color.status.successBorder.value',
  statusWarning: 'color.status.warning.value',
  statusWarningBg: 'color.status.warningBg.value',
  statusWarningBorder: 'color.status.warningBorder.value',
  statusDanger: 'color.status.danger.value',
  statusDangerBg: 'color.status.dangerBg.value',
  statusDangerBorder: 'color.status.dangerBorder.value',
  statusInfo: 'color.status.info.value',
  statusInfoStrong: 'color.status.infoStrong.value',
  statusInfoBg: 'color.status.infoBg.value',
  statusInfoBorder: 'color.status.infoBorder.value',
  statusNeutral: 'color.status.neutral.value',
  trendUp: 'color.trend.up.value',
  trendDown: 'color.trend.down.value',
  trendNeutral: 'color.trend.neutral.value',
  textPrimary: 'color.text.primary.value',
  textSecondary: 'color.text.secondary.value',
  textTertiary: 'color.text.tertiary.value',
  textInverse: 'color.text.inverse.value',
  backgroundPrimary: 'color.background.primary.value',
  backgroundSecondary: 'color.background.secondary.value',
  backgroundTertiary: 'color.background.tertiary.value',
  border: 'color.border.value',
  divider: 'color.divider.value',
});

export const EXTERNAL_COLOR_VALUE_MAPPINGS = Object.freeze({
  platformTmall: 'PLATFORM_LEGEND_COLORS.tmall',
  platformDouyin: 'PLATFORM_LEGEND_COLORS.douyin',
  platformXiaohongshu: 'PLATFORM_LEGEND_COLORS.xiaohongshu',
  platformKuaishou: 'PLATFORM_LEGEND_COLORS.kuaishou',
  platformJd: 'PLATFORM_LEGEND_COLORS.jd',
  platformWechat: 'PLATFORM_LEGEND_COLORS.wechat',
  platformUnknown: 'PLATFORM_LEGEND_COLORS.unknown',
});

export const COLOR_VALUE_MAPPINGS = Object.freeze({
  ...TOKEN_COLOR_VALUE_PATHS,
  ...EXTERNAL_COLOR_VALUE_MAPPINGS,
});

export const CHART_SERIES_MAPPINGS = Object.freeze([
  'CHART_SERIES_COLORS.series1',
  'CHART_SERIES_COLORS.series2',
  'CHART_SERIES_COLORS.series3',
  'CHART_SERIES_COLORS.series4',
  'CHART_SERIES_COLORS.series5',
  'CHART_SERIES_COLORS.series6',
]);

const FONT_FAMILY_PATH = 'typography.fontFamily.base';
const SHADOW_PATH = 'shadow';

function throwFailure(message) {
  throw new Error(message);
}

function assertContains(source, needle, findings) {
  if (!source.includes(needle)) {
    findings.push(`${VALUE_HELPER_PATH} missing ${needle}`);
  }
}

function findMatchingBrace(content, openBraceIndex, options = {}) {
  const { fail = throwFailure } = options;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openBraceIndex; index < content.length; index += 1) {
    const char = content[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  fail(`${VALUE_HELPER_PATH} has an unclosed object block.`);
}

function extractConstObjectBlock(source, constName, options = {}) {
  const { fail = throwFailure } = options;
  const constMatch = source.match(new RegExp(`export\\s+const\\s+${constName}\\s*=`));
  if (!constMatch) {
    fail(`${VALUE_HELPER_PATH} missing ${constName}.`);
  }
  const openBraceIndex = source.indexOf('{', constMatch.index + constMatch[0].length);
  if (openBraceIndex < 0) {
    fail(`${VALUE_HELPER_PATH} missing object block for ${constName}.`);
  }
  const closeBraceIndex = findMatchingBrace(source, openBraceIndex, { fail });
  return source.slice(openBraceIndex + 1, closeBraceIndex);
}

function extractTopLevelPropertyKeys(objectBlock) {
  return objectBlock
    .split('\n')
    .map((line) => line.match(/^\s{2}([A-Za-z][A-Za-z0-9]*)\s*:/)?.[1])
    .filter(Boolean);
}

function resolveCanonicalValue(tokens, path) {
  let value = tokens;
  for (const segment of path.split('.')) {
    value = value?.[segment];
  }
  return value;
}

function extractScalarPropertyExpression(objectBlock, key) {
  const line = objectBlock
    .split('\n')
    .find((candidate) => new RegExp(`^\\s{2}${key}:`).test(candidate));

  return line
    ?.replace(new RegExp(`^\\s{2}${key}:\\s*`), '')
    .replace(/,\s*$/, '')
    .trim();
}

function assertExpressionProperty(objectBlock, key, expectedExpression, findings) {
  const actualExpression = extractScalarPropertyExpression(objectBlock, key);
  if (actualExpression !== expectedExpression) {
    findings.push(`${VALUE_HELPER_PATH} ${key} must use ${expectedExpression}.`);
  }
}

function assertExactColorValueKeys(objectBlock, findings) {
  const actualKeys = extractTopLevelPropertyKeys(objectBlock);
  const expectedKeys = [...Object.keys(EXTERNAL_COLOR_VALUE_MAPPINGS), 'chartSeries'];
  const missingKeys = expectedKeys.filter((key) => !actualKeys.includes(key));
  const unexpectedKeys = actualKeys.filter((key) => !expectedKeys.includes(key));

  for (const key of missingKeys) {
    findings.push(`${VALUE_HELPER_PATH} DESIGN_COLOR_VALUES missing ${key}.`);
  }
  for (const key of unexpectedKeys) {
    findings.push(`${VALUE_HELPER_PATH} DESIGN_COLOR_VALUES has unexpected key ${key}; add a documented mapping to this guard first.`);
  }
}

function assertColorValueMappings(objectBlock, findings) {
  assertExactColorValueKeys(objectBlock, findings);
  assertContains(objectBlock, `...${TOKEN_RUNTIME_COLOR_VALUES_CONST},`, findings);

  for (const [key, expression] of Object.entries(EXTERNAL_COLOR_VALUE_MAPPINGS)) {
    assertExpressionProperty(objectBlock, key, expression, findings);
  }

  for (const expression of CHART_SERIES_MAPPINGS) {
    assertContains(objectBlock, expression, findings);
  }
}

function assertConstExpression(source, constName, expectedExpression, findings) {
  const match = source.match(new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*([^;]+);`));
  const actualExpression = match?.[1]?.trim();
  if (!actualExpression || actualExpression !== expectedExpression) {
    findings.push(`${VALUE_HELPER_PATH} ${constName} must use ${expectedExpression}.`);
  }
}

function assertHelperRuntimeTokenImport(source, findings) {
  const importMatch = source.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/design-tokens['"]\s*;/);
  if (!importMatch) {
    findings.push(`${VALUE_HELPER_PATH} must import compact runtime values from ${TOKEN_MIRROR_PATH}.`);
    return;
  }

  const importedNames = new Set(
    importMatch[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
  for (const constName of [
    TOKEN_RUNTIME_COLOR_VALUES_CONST,
    TOKEN_RUNTIME_FONT_FAMILY_CONST,
    TOKEN_RUNTIME_SHADOW_VALUES_CONST,
  ]) {
    if (!importedNames.has(constName)) {
      findings.push(`${VALUE_HELPER_PATH} missing compact runtime import ${constName}.`);
    }
  }
  if (importedNames.has('designTokens')) {
    findings.push(`${VALUE_HELPER_PATH} must not import the metadata-rich designTokens object at runtime.`);
  }
}

function parseJsonConst(source, constName, filePath, findings) {
  const match = source.match(
    new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*([\\s\\S]*?)\\s+as\\s+const\\s*;`),
  );
  if (!match) {
    findings.push(`${filePath} missing ${constName}.`);
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    findings.push(`${filePath} ${constName} must be a JSON-compatible generated literal: ${error.message}`);
    return null;
  }
}

function assertExactObjectValues({
  actual,
  expected,
  findings,
  label,
}) {
  if (!actual || Array.isArray(actual) || typeof actual !== 'object') {
    findings.push(`${label} must be an object.`);
    return;
  }

  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);

  for (const key of expectedKeys.filter((key) => !actualKeys.includes(key))) {
    findings.push(`${label} missing ${key}.`);
  }
  for (const key of actualKeys.filter((key) => !expectedKeys.includes(key))) {
    findings.push(`${label} has unexpected key ${key}.`);
  }
  for (const key of expectedKeys.filter((key) => actualKeys.includes(key))) {
    if (actual[key] !== expected[key]) {
      findings.push(
        `${label}.${key} must mirror ${JSON.stringify(expected[key])} from ${CANONICAL_TOKEN_PATH}.`,
      );
    }
  }
}

function assertRuntimeTokenMirror(tokenMirrorSource, canonicalTokens, findings) {
  if (!tokenMirrorSource) {
    findings.push(`${TOKEN_MIRROR_PATH} is required for compact runtime token parity.`);
    return;
  }

  const expectedColors = {};
  for (const [key, tokenPath] of Object.entries(TOKEN_COLOR_VALUE_PATHS)) {
    const value = resolveCanonicalValue(canonicalTokens, tokenPath);
    if (typeof value !== 'string') {
      findings.push(`${CANONICAL_TOKEN_PATH} missing string token ${tokenPath}.`);
    } else {
      expectedColors[key] = value;
    }
  }
  assertExactObjectValues({
    actual: parseJsonConst(tokenMirrorSource, TOKEN_RUNTIME_COLOR_VALUES_CONST, TOKEN_MIRROR_PATH, findings),
    expected: expectedColors,
    findings,
    label: `${TOKEN_MIRROR_PATH} ${TOKEN_RUNTIME_COLOR_VALUES_CONST}`,
  });

  const expectedFontFamily = resolveCanonicalValue(canonicalTokens, FONT_FAMILY_PATH);
  const fontMatch = tokenMirrorSource.match(
    new RegExp(`export\\s+const\\s+${TOKEN_RUNTIME_FONT_FAMILY_CONST}\\s*=\\s*([^;]+);`),
  );
  let actualFontFamily = null;
  try {
    actualFontFamily = fontMatch ? JSON.parse(fontMatch[1]) : null;
  } catch {
    actualFontFamily = null;
  }
  if (actualFontFamily !== expectedFontFamily) {
    findings.push(
      `${TOKEN_MIRROR_PATH} ${TOKEN_RUNTIME_FONT_FAMILY_CONST} must mirror ${FONT_FAMILY_PATH}.`,
    );
  }

  const expectedShadows = resolveCanonicalValue(canonicalTokens, SHADOW_PATH);
  if (!expectedShadows || Array.isArray(expectedShadows) || typeof expectedShadows !== 'object') {
    findings.push(`${CANONICAL_TOKEN_PATH} missing object token ${SHADOW_PATH}.`);
  } else {
    assertExactObjectValues({
      actual: parseJsonConst(tokenMirrorSource, TOKEN_RUNTIME_SHADOW_VALUES_CONST, TOKEN_MIRROR_PATH, findings),
      expected: expectedShadows,
      findings,
      label: `${TOKEN_MIRROR_PATH} ${TOKEN_RUNTIME_SHADOW_VALUES_CONST}`,
    });
  }
}

export function auditDesignTokenValuesSource(source, options = {}) {
  const { canonicalTokens, tokenMirrorSource, fail = throwFailure } = options;
  const findings = [];

  if (!canonicalTokens) {
    fail(`${CANONICAL_TOKEN_PATH} is required for runtime token parity.`);
  }

  assertHelperRuntimeTokenImport(source, findings);
  assertContains(source, "import { CHART_SERIES_COLORS } from './domain-taxonomy-colors';", findings);
  assertContains(source, "import { PLATFORM_LEGEND_COLORS } from './platform-colors';", findings);

  const colorValuesBlock = extractConstObjectBlock(source, 'DESIGN_COLOR_VALUES', { fail });
  assertColorValueMappings(colorValuesBlock, findings);
  assertConstExpression(source, 'DESIGN_FONT_FAMILY', TOKEN_RUNTIME_FONT_FAMILY_CONST, findings);
  const shadowMatch = source.match(/export\s+const\s+DESIGN_SHADOW_VALUES\s*=\s*([^;]+);/);
  if (shadowMatch?.[1]?.trim() !== TOKEN_RUNTIME_SHADOW_VALUES_CONST) {
    findings.push(`${VALUE_HELPER_PATH} DESIGN_SHADOW_VALUES must use ${TOKEN_RUNTIME_SHADOW_VALUES_CONST}.`);
  }
  assertRuntimeTokenMirror(tokenMirrorSource, canonicalTokens, findings);

  return findings;
}

export function formatDesignTokenValuesFailure(findings) {
  return [
    '[design-token-values-sync] Design token value helper drift was detected:',
    ...findings.map((finding) => `- ${finding}`),
  ].join('\n');
}

export function summarizeDesignTokenValues() {
  return `${Object.keys(COLOR_VALUE_MAPPINGS).length} color helper fields, `
    + `${CHART_SERIES_MAPPINGS.length} chart series entries, font family, and shadows mirror canonical token data without shipping metadata.`;
}
