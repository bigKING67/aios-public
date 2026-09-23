export const TOKEN_JSON_PATH = 'DESIGN_TOKENS.json';
export const ANT_THEME_PATH = 'apps/web-vite/src/theme/ant-theme.ts';
export const VITE_PROVIDER_PATH = 'apps/web-vite/src/ViteProviders.tsx';

const RAW_COLOR_PATTERN = /#[0-9A-Fa-f]{3,8}|\brgba?\s*\(|\bhsla?\s*\(/g;

const ROOT_COLOR_TOKEN_MAPPINGS = Object.freeze({
  colorPrimary: 'colors.primary',
  colorSuccess: 'colors.success',
  colorWarning: 'colors.warning',
  colorError: 'colors.danger',
  colorInfo: 'colors.info',
  colorSuccessBg: 'colors.statusSuccessBg',
  colorSuccessBorder: 'colors.statusSuccessBorder',
  colorSuccessText: 'colors.statusSuccess',
  colorWarningBg: 'colors.statusWarningBg',
  colorWarningBorder: 'colors.statusWarningBorder',
  colorWarningText: 'colors.statusWarning',
  colorErrorBg: 'colors.statusDangerBg',
  colorErrorBorder: 'colors.statusDangerBorder',
  colorErrorText: 'colors.statusDanger',
  colorInfoBg: 'colors.statusInfoBg',
  colorInfoBorder: 'colors.statusInfoBorder',
  colorInfoText: 'colors.statusInfo',
  colorTextBase: 'colors.textPrimary',
  colorTextLightSolid: 'colors.textInverse',
  colorLink: 'colors.statusInfo',
  colorLinkHover: 'colors.statusInfoStrong',
  colorLinkActive: 'colors.statusInfoStrong',
});

const COMPONENT_TOKEN_MAPPINGS = Object.freeze({
  Button: Object.freeze({
    colorPrimary: 'colors.primary',
    colorTextLightSolid: 'colors.textInverse',
    controlHeight: '36',
    borderRadius: '6',
    controlOutline: "'var(--brand-focus-ring)'",
  }),
  Card: Object.freeze({
    boxShadow: 'DESIGN_SHADOW_VALUES.sm',
    borderRadiusLG: '12',
    colorBorder: 'colors.border',
  }),
  Input: Object.freeze({
    colorBorder: 'colors.border',
    borderRadius: '6',
    controlHeight: '36',
    colorTextPlaceholder: 'colors.textTertiary',
  }),
  Select: Object.freeze({
    colorBorder: 'colors.border',
    borderRadius: '6',
    controlHeight: '36',
  }),
  Table: Object.freeze({
    colorBorder: 'colors.border',
    headerBg: 'colors.backgroundTertiary',
    headerSortActiveBg: 'colors.backgroundSecondary',
    rowHoverBg: 'colors.backgroundTertiary',
    borderRadius: '6',
  }),
  Collapse: Object.freeze({
    colorBorder: 'colors.border',
    borderRadiusLG: '6',
  }),
  Modal: Object.freeze({
    borderRadiusLG: '12',
    boxShadow: 'DESIGN_SHADOW_VALUES.lg',
  }),
  Drawer: Object.freeze({
    borderRadiusLG: '12',
    boxShadow: 'DESIGN_SHADOW_VALUES.lg',
  }),
  Notification: Object.freeze({
    borderRadiusLG: '8',
  }),
  Message: Object.freeze({
    borderRadiusLG: '8',
  }),
  Tooltip: Object.freeze({
    borderRadius: '4',
  }),
  DatePicker: Object.freeze({
    borderRadius: '6',
    controlHeight: '36',
  }),
  Form: Object.freeze({
    labelFontSize: '14',
    labelColor: 'colors.textPrimary',
  }),
  Pagination: Object.freeze({
    itemActiveBg: 'colors.primary',
    itemActiveColor: 'colors.textInverse',
  }),
  Tag: Object.freeze({
    borderRadiusSM: '4',
    borderRadius: '6',
  }),
  Badge: Object.freeze({
    colorError: 'colors.danger',
    colorWarning: 'colors.warning',
    colorSuccess: 'colors.success',
  }),
  Segmented: Object.freeze({
    itemSelectedBg: 'colors.primary',
    itemSelectedColor: 'colors.textInverse',
  }),
});

const DARK_ADAPTER_COLORS = Object.freeze({
  backgroundBase: "'#141414'",
  textBase: "'#FFFFFFCC'",
  border: "'#434343'",
});

function throwFailure(message) {
  throw new Error(message);
}

export function stripCommentsPreserveLines(content) {
  let output = '';
  let index = 0;
  let quote = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      } else {
        output += ' ';
      }
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 2;
        inBlockComment = false;
      } else {
        output += char === '\n' ? '\n' : ' ';
        index += 1;
      }
      continue;
    }

    if (quote) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 2;
      inLineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      output += '  ';
      index += 2;
      inBlockComment = true;
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
    }

    output += char;
    index += 1;
  }

  return output;
}

export function findMatchingBrace(content, openBraceIndex, filePath, options = {}) {
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

  fail(`${filePath} has an unclosed object block.`);
}

export function extractConstObjectBlock(content, constName, filePath, options = {}) {
  const { fail = throwFailure } = options;
  const match = content.match(new RegExp(`(?:export\\s+)?const\\s+${constName}\\b[^=]*=`));
  if (!match) {
    fail(`${filePath} missing ${constName}.`);
  }

  const openBraceIndex = content.indexOf('{', match.index + match[0].length);
  if (openBraceIndex < 0) {
    fail(`${filePath} missing object block for ${constName}.`);
  }

  const closeBraceIndex = findMatchingBrace(content, openBraceIndex, filePath, { fail });
  return content.slice(openBraceIndex + 1, closeBraceIndex);
}

export function extractNamedObjectBlock(content, objectName, filePath, options = {}) {
  const { fail = throwFailure } = options;
  const match = content.match(new RegExp(`\\b${objectName}\\s*:`));
  if (!match) {
    fail(`${filePath} missing object key ${objectName}.`);
  }

  const openBraceIndex = content.indexOf('{', match.index + match[0].length);
  if (openBraceIndex < 0) {
    fail(`${filePath} missing object block for ${objectName}.`);
  }

  const closeBraceIndex = findMatchingBrace(content, openBraceIndex, filePath, { fail });
  return content.slice(openBraceIndex + 1, closeBraceIndex);
}

export function extractPropertyValue(block, propertyName, filePath, options = {}) {
  const { fail = throwFailure } = options;
  const match = block.match(new RegExp(`\\b${propertyName}\\s*:`));
  if (!match) {
    fail(`${filePath} missing property ${propertyName}.`);
  }

  let quote = null;
  let escaped = false;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  const start = match.index + match[0].length;

  for (let index = start; index < block.length; index += 1) {
    const char = block[index];

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

    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth -= 1;
    if (char === '{') braceDepth += 1;
    if (char === '}') braceDepth -= 1;
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth -= 1;

    if (char === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      return block.slice(start, index).trim();
    }
  }

  return block.slice(start).trim();
}

function assertPropertyValue(block, propertyName, expectedValue, filePath, findings, options = {}) {
  const actualValue = extractPropertyValue(block, propertyName, filePath, options);
  if (actualValue !== expectedValue) {
    findings.push(`${filePath} ${propertyName} drifted; expected ${expectedValue}, got ${actualValue}`);
  }
}

export function getTokenValue(tokens, tokenPath, options = {}) {
  const { fail = throwFailure } = options;
  const segments = tokenPath.split('.');
  let cursor = tokens;
  for (const segment of segments) {
    cursor = cursor?.[segment];
  }
  if (cursor === undefined) {
    fail(`${TOKEN_JSON_PATH} missing ${tokenPath}.`);
  }
  return cursor;
}

export function pxNumber(value, tokenPath, options = {}) {
  const { fail = throwFailure } = options;
  if (typeof value !== 'string') {
    fail(`${TOKEN_JSON_PATH} ${tokenPath} must be a px string.`);
  }
  const match = value.match(/^(\d+(?:\.\d+)?)px$/);
  if (!match) {
    fail(`${TOKEN_JSON_PATH} ${tokenPath} must be a px string, got ${value}.`);
  }
  return Number(match[1]);
}

function numberString(value) {
  return String(Number(value));
}

function assertContains(source, snippet, filePath, findings) {
  if (!source.includes(snippet)) {
    findings.push(`${filePath} missing ${snippet}`);
  }
}

export function assertNoRawColorsOutsideDarkAdapter(source, filePath, findings, options = {}) {
  const darkMatch = source.match(/const\s+ANT_DARK_THEME_ADAPTER_COLORS\b[^=]*=/);
  if (!darkMatch) {
    findings.push(`${filePath} missing ANT_DARK_THEME_ADAPTER_COLORS.`);
    return;
  }

  const openBraceIndex = source.indexOf('{', darkMatch.index + darkMatch[0].length);
  const closeBraceIndex = findMatchingBrace(source, openBraceIndex, filePath, options);
  const searchable = `${source.slice(0, darkMatch.index)}${' '.repeat(closeBraceIndex - darkMatch.index + 1)}${source.slice(closeBraceIndex + 1)}`;
  const stripped = stripCommentsPreserveLines(searchable);
  const rawMatches = stripped.match(RAW_COLOR_PATTERN) ?? [];
  if (rawMatches.length > 0) {
    findings.push(`${filePath} contains raw color literal(s) outside ANT_DARK_THEME_ADAPTER_COLORS: ${rawMatches.join(', ')}`);
  }
}

export function verifyViteProvider(source, findings) {
  assertContains(source, "import { aiosBrandTheme } from '@/theme/ant-theme';", VITE_PROVIDER_PATH, findings);
  assertContains(source, 'theme={aiosBrandTheme}', VITE_PROVIDER_PATH, findings);
  if (/\bmodernBlueTheme\b/.test(stripCommentsPreserveLines(source))) {
    findings.push(`${VITE_PROVIDER_PATH} must consume aiosBrandTheme directly instead of deprecated modernBlueTheme.`);
  }
}

export function verifyAntTheme(source, tokens, findings, options = {}) {
  assertContains(source, "import type { ThemeConfig } from 'antd';", ANT_THEME_PATH, findings);
  assertContains(source, 'DESIGN_COLOR_VALUES', ANT_THEME_PATH, findings);
  assertContains(source, 'DESIGN_FONT_FAMILY', ANT_THEME_PATH, findings);
  assertContains(source, 'DESIGN_SHADOW_VALUES', ANT_THEME_PATH, findings);
  assertContains(source, "from '@/lib/design-token-values';", ANT_THEME_PATH, findings);
  assertContains(source, 'const colors = DESIGN_COLOR_VALUES;', ANT_THEME_PATH, findings);
  assertContains(source, 'const aiosFontFamily = DESIGN_FONT_FAMILY;', ANT_THEME_PATH, findings);

  assertNoRawColorsOutsideDarkAdapter(source, ANT_THEME_PATH, findings, options);

  const darkAdapterBlock = extractConstObjectBlock(source, 'ANT_DARK_THEME_ADAPTER_COLORS', ANT_THEME_PATH, options);
  for (const [propertyName, expectedValue] of Object.entries(DARK_ADAPTER_COLORS)) {
    assertPropertyValue(darkAdapterBlock, propertyName, expectedValue, ANT_THEME_PATH, findings, options);
  }

  const themeBlock = extractConstObjectBlock(source, 'aiosBrandTheme', ANT_THEME_PATH, options);
  const rootTokenBlock = extractNamedObjectBlock(themeBlock, 'token', ANT_THEME_PATH, options);
  const componentsBlock = extractNamedObjectBlock(themeBlock, 'components', ANT_THEME_PATH, options);

  for (const [propertyName, expectedValue] of Object.entries(ROOT_COLOR_TOKEN_MAPPINGS)) {
    assertPropertyValue(rootTokenBlock, propertyName, expectedValue, ANT_THEME_PATH, findings, options);
  }

  const expectedRootTokens = {
    borderRadius: numberString(pxNumber(getTokenValue(tokens, 'borderRadius.md', options), 'borderRadius.md', options)),
    borderRadiusLG: numberString(pxNumber(getTokenValue(tokens, 'borderRadius.lg', options), 'borderRadius.lg', options)),
    borderRadiusSM: numberString(pxNumber(getTokenValue(tokens, 'borderRadius.base', options), 'borderRadius.base', options)),
    borderRadiusXS: numberString(pxNumber(getTokenValue(tokens, 'borderRadius.sm', options), 'borderRadius.sm', options)),
    margin: numberString(pxNumber(getTokenValue(tokens, 'spacing.4', options), 'spacing.4', options)),
    marginXS: numberString(pxNumber(getTokenValue(tokens, 'spacing.2', options), 'spacing.2', options)),
    marginSM: numberString(pxNumber(getTokenValue(tokens, 'spacing.3', options), 'spacing.3', options)),
    marginLG: numberString(pxNumber(getTokenValue(tokens, 'spacing.6', options), 'spacing.6', options)),
    marginXL: numberString(pxNumber(getTokenValue(tokens, 'spacing.8', options), 'spacing.8', options)),
    padding: numberString(pxNumber(getTokenValue(tokens, 'spacing.4', options), 'spacing.4', options)),
    paddingXS: numberString(pxNumber(getTokenValue(tokens, 'spacing.2', options), 'spacing.2', options)),
    paddingSM: numberString(pxNumber(getTokenValue(tokens, 'spacing.3', options), 'spacing.3', options)),
    paddingLG: numberString(pxNumber(getTokenValue(tokens, 'spacing.6', options), 'spacing.6', options)),
    paddingXL: numberString(pxNumber(getTokenValue(tokens, 'spacing.8', options), 'spacing.8', options)),
    fontFamily: 'aiosFontFamily',
    fontSize: numberString(pxNumber(getTokenValue(tokens, 'typography.fontSize.base.value', options), 'typography.fontSize.base.value', options)),
    fontSizeHeading1: '38',
    fontSizeHeading2: numberString(pxNumber(getTokenValue(tokens, 'typography.fontSize.display.value', options), 'typography.fontSize.display.value', options)),
    fontSizeHeading3: numberString(pxNumber(getTokenValue(tokens, 'typography.fontSize.2xl.value', options), 'typography.fontSize.2xl.value', options)),
    fontSizeHeading4: numberString(pxNumber(getTokenValue(tokens, 'typography.fontSize.sectionTitle.value', options), 'typography.fontSize.sectionTitle.value', options)),
    fontSizeHeading5: numberString(pxNumber(getTokenValue(tokens, 'typography.fontSize.lg.value', options), 'typography.fontSize.lg.value', options)),
    lineHeight: '1.5714285714',
    lineHeightHeading1: getTokenValue(tokens, 'typography.lineHeight.tight', options),
    lineHeightHeading2: '1.35',
    boxShadow: 'DESIGN_SHADOW_VALUES.lg',
    controlHeight: '36',
    controlHeightSM: '28',
    controlHeightLG: '44',
    motionEaseInOut: `'${getTokenValue(tokens, 'transitionEasing.standard', options)}'`,
    motionEaseOut: `'${getTokenValue(tokens, 'transitionEasing.out', options)}'`,
    motionEaseOutCirc: "'cubic-bezier(0.04, 0.93, 0.82, 0.74)'",
    motionUnit: '0.1',
  };

  for (const [propertyName, expectedValue] of Object.entries(expectedRootTokens)) {
    assertPropertyValue(rootTokenBlock, propertyName, expectedValue, ANT_THEME_PATH, findings, options);
  }

  for (const [componentName, expectedTokens] of Object.entries(COMPONENT_TOKEN_MAPPINGS)) {
    const componentBlock = extractNamedObjectBlock(componentsBlock, componentName, ANT_THEME_PATH, options);
    for (const [propertyName, expectedValue] of Object.entries(expectedTokens)) {
      assertPropertyValue(componentBlock, propertyName, expectedValue, `${ANT_THEME_PATH} ${componentName}`, findings, options);
    }
  }

  const darkThemeBlock = extractConstObjectBlock(source, 'darkTheme', ANT_THEME_PATH, options);
  const darkTokenBlock = extractNamedObjectBlock(darkThemeBlock, 'token', ANT_THEME_PATH, options);
  assertPropertyValue(darkTokenBlock, 'colorPrimary', 'colors.primary', ANT_THEME_PATH, findings, options);
  assertPropertyValue(darkTokenBlock, 'fontFamily', 'aiosFontFamily', ANT_THEME_PATH, findings, options);
  assertPropertyValue(darkTokenBlock, 'colorBgBase', 'ANT_DARK_THEME_ADAPTER_COLORS.backgroundBase', ANT_THEME_PATH, findings, options);
  assertPropertyValue(darkTokenBlock, 'colorTextBase', 'ANT_DARK_THEME_ADAPTER_COLORS.textBase', ANT_THEME_PATH, findings, options);
  assertPropertyValue(darkTokenBlock, 'colorBorder', 'ANT_DARK_THEME_ADAPTER_COLORS.border', ANT_THEME_PATH, findings, options);
}

export function auditAntdThemeTokenSync({ antThemeSource, tokens, viteProviderSource }, options = {}) {
  const findings = [];

  verifyAntTheme(antThemeSource, tokens, findings, options);
  verifyViteProvider(viteProviderSource, findings);

  return findings;
}

export function formatAntdThemeTokenSyncFailure(findings) {
  return [
    '[antd-theme-token-sync] Ant Design theme token drift was detected:',
    ...findings.map((finding) => `- ${finding}`),
  ].join('\n');
}

export function summarizeAntdThemeTokenSync() {
  return 'Ant Design theme adapter maps to AIOS token helpers, provider entrypoint, and protected dark adapter exceptions.';
}
