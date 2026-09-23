const TAILWIND_CONFIG_PATH = 'tailwind.config.ts';
export const TOKEN_JSON_PATH = 'DESIGN_TOKENS.json';
export const DESIGN_CSS_PATH = 'apps/web-vite/src/styles/design-tokens.css';

const MAX_FINDINGS_TO_PRINT = 120;
const CSS_VAR_VALUE_PATTERN = /^var\(\s*(--[A-Za-z0-9-_]+)\s*\)$/;

const EXPECTED_VAR_ALIASES = Object.freeze({
  spacing: Object.freeze({
    0: 'var(--spacing-0)',
    1: 'var(--spacing-1)',
    2: 'var(--spacing-2)',
    3: 'var(--spacing-3)',
    4: 'var(--spacing-4)',
    5: 'var(--spacing-5)',
    6: 'var(--spacing-6)',
    8: 'var(--spacing-8)',
    12: 'var(--spacing-12)',
    16: 'var(--spacing-16)',
    20: 'var(--spacing-20)',
    24: 'var(--spacing-24)',
  }),
  borderRadius: Object.freeze({
    none: 'var(--border-radius-none)',
    xs: 'var(--border-radius-sm)',
    sm: 'var(--border-radius-base)',
    base: 'var(--border-radius-base)',
    md: 'var(--border-radius-md)',
    lg: 'var(--border-radius-lg)',
    xl: 'var(--border-radius-xl)',
    '2xl': 'var(--border-radius-2xl)',
    full: 'var(--border-radius-full)',
  }),
  boxShadow: Object.freeze({
    none: 'var(--shadow-none)',
    xs: 'var(--shadow-sm)',
    sm: 'var(--shadow-sm)',
    base: 'var(--shadow-base)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)',
    '2xl': 'var(--shadow-xl)',
  }),
  fontFamily: Object.freeze({
    sans: ['var(--font-family-base)'],
    base: ['var(--font-family-base)'],
    display: ['var(--font-family-display)'],
    mono: ['var(--font-family-mono)'],
  }),
  transitionDuration: Object.freeze({
    fast: 'var(--transition-duration-fast)',
    base: 'var(--transition-duration-base)',
    slow: 'var(--transition-duration-slow)',
  }),
  transitionTimingFunction: Object.freeze({
    'ease-in-out': 'var(--transition-easing-standard)',
    'ease-out': 'var(--transition-easing-out)',
    'ease-in': 'var(--transition-easing-in)',
  }),
});

const EXPECTED_FONT_SIZE_ALIASES = Object.freeze({
  xs: Object.freeze(['var(--font-size-xs)', { lineHeight: '1.25' }]),
  sm: Object.freeze(['var(--font-size-sm)', { lineHeight: '1.35' }]),
  base: Object.freeze(['var(--font-size-base)', { lineHeight: 'var(--line-height-normal)' }]),
  lg: Object.freeze(['var(--font-size-lg)', { lineHeight: 'var(--line-height-normal)' }]),
  xl: Object.freeze(['var(--font-size-xl)', { lineHeight: '1.15' }]),
  '2xl': Object.freeze(['var(--font-size-2xl)', { lineHeight: 'var(--line-height-tight)' }]),
  '3xl': Object.freeze(['var(--font-size-3xl)', { lineHeight: 'var(--line-height-snug)' }]),
  '4xl': Object.freeze(['var(--font-size-data-lg)', { lineHeight: 'var(--line-height-tight)' }]),
  '5xl': Object.freeze(['var(--font-size-marketing-lg)', { lineHeight: 'var(--line-height-tight)' }]),
  '6xl': Object.freeze(['var(--font-size-marketing-xl)', { lineHeight: 'var(--line-height-tight)' }]),
  display: Object.freeze([
    'var(--font-size-display)',
    { lineHeight: '1.18', letterSpacing: 'var(--letter-spacing-tight)' },
  ]),
  'section-title': Object.freeze([
    'var(--font-size-section-title)',
    { lineHeight: '1.25', letterSpacing: 'var(--letter-spacing-title)' },
  ]),
  'data-lg': Object.freeze(['var(--font-size-data-lg)', { lineHeight: 'var(--line-height-tight)' }]),
  'data-md': Object.freeze(['var(--font-size-data-md)', { lineHeight: 'var(--line-height-tight)' }]),
  'data-sm': Object.freeze(['var(--font-size-data-sm)', { lineHeight: 'var(--line-height-normal)' }]),
});

const EXPECTED_SCREEN_VALUES = Object.freeze({
  xs: '0px',
  sm: '576px',
  md: '768px',
  lg: '992px',
  xl: '1200px',
  '2xl': '1600px',
});

const JSON_TOKEN_PATHS = Object.freeze({
  spacing: Object.freeze({
    0: 'spacing.0',
    1: 'spacing.1',
    2: 'spacing.2',
    3: 'spacing.3',
    4: 'spacing.4',
    5: 'spacing.5',
    6: 'spacing.6',
    8: 'spacing.8',
    12: 'spacing.12',
    16: 'spacing.16',
    20: 'spacing.20',
    24: 'spacing.24',
  }),
  borderRadius: Object.freeze({
    none: 'borderRadius.none',
    xs: 'borderRadius.sm',
    sm: 'borderRadius.base',
    base: 'borderRadius.base',
    md: 'borderRadius.md',
    lg: 'borderRadius.lg',
    xl: 'borderRadius.xl',
    '2xl': 'borderRadius.2xl',
    full: 'borderRadius.full',
  }),
  boxShadow: Object.freeze({
    none: 'shadow.none',
    xs: 'shadow.sm',
    sm: 'shadow.sm',
    base: 'shadow.base',
    md: 'shadow.md',
    lg: 'shadow.lg',
    xl: 'shadow.xl',
    '2xl': 'shadow.xl',
  }),
  fontFamily: Object.freeze({
    sans: 'typography.fontFamily.base',
    base: 'typography.fontFamily.base',
    display: 'typography.fontFamily.display',
    mono: 'typography.fontFamily.code',
  }),
  fontSize: Object.freeze({
    xs: 'typography.fontSize.xs.value',
    sm: 'typography.fontSize.sm.value',
    base: 'typography.fontSize.base.value',
    lg: 'typography.fontSize.lg.value',
    xl: 'typography.fontSize.xl.value',
    '2xl': 'typography.fontSize.2xl.value',
    '3xl': 'typography.fontSize.3xl.value',
    '4xl': 'typography.fontSize.dataLg.value',
    '5xl': 'typography.fontSize.marketingLg.value',
    '6xl': 'typography.fontSize.marketingXl.value',
    display: 'typography.fontSize.display.value',
    'section-title': 'typography.fontSize.sectionTitle.value',
    'data-lg': 'typography.fontSize.dataLg.value',
    'data-md': 'typography.fontSize.dataMd.value',
    'data-sm': 'typography.fontSize.dataSm.value',
  }),
  screens: Object.freeze({
    xs: 'breakpoint.xs',
    sm: 'breakpoint.sm',
    md: 'breakpoint.md',
    lg: 'breakpoint.lg',
    xl: 'breakpoint.xl',
    '2xl': 'breakpoint.2xl',
  }),
  transitionDuration: Object.freeze({
    fast: 'transitionDuration.fast',
    base: 'transitionDuration.base',
    slow: 'transitionDuration.slow',
  }),
  transitionTimingFunction: Object.freeze({
    'ease-in-out': 'transitionEasing.standard',
    'ease-out': 'transitionEasing.out',
    'ease-in': 'transitionEasing.in',
  }),
});

function throwFailure(message) {
  throw new Error(message);
}

export function normalizeValue(value) {
  if (value === undefined) {
    return '<missing>';
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, itemValue]) => [key, normalizeValue(itemValue)]),
    );
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

export function extractCssVariables(content) {
  return new Map(
    Array.from(content.matchAll(/^\s*(--[A-Za-z0-9-_]+)\s*:\s*([^;]+)\s*;/gm))
      .map((match) => [match[1], normalizeValue(match[2])]),
  );
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

export function findMatchingBrace(content, openBraceIndex, options = {}) {
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

  fail(`${TAILWIND_CONFIG_PATH} has an unclosed object block.`);
}

export function extractObjectLiteralBlock(content, objectName, options = {}) {
  const { fail = throwFailure } = options;
  const match = content.match(new RegExp(`\\b${objectName}\\s*:`));
  if (!match) {
    fail(`${TAILWIND_CONFIG_PATH} missing theme.extend.${objectName}.`);
  }

  const openBraceIndex = content.indexOf('{', match.index + match[0].length);
  if (openBraceIndex < 0) {
    fail(`${TAILWIND_CONFIG_PATH} missing object block for theme.extend.${objectName}.`);
  }

  const closeBraceIndex = findMatchingBrace(content, openBraceIndex, { fail });
  return content.slice(openBraceIndex, closeBraceIndex + 1);
}

export function parseObjectLiteral(block, objectName, options = {}) {
  const { fail = throwFailure } = options;
  try {
    // The block is a local Tailwind config object literal after comments are
    // stripped. Keep this scoped to extracted theme.extend sub-objects.
    return Function(`"use strict"; return (${block});`)();
  } catch (error) {
    fail(`${TAILWIND_CONFIG_PATH} theme.extend.${objectName} parse failed: ${error.message}`);
  }
}

export function valuesEqual(actual, expected) {
  return JSON.stringify(normalizeValue(actual)) === JSON.stringify(normalizeValue(expected));
}

export function getTokenValue(tokens, tokenPath) {
  const segments = tokenPath.split('.');
  let cursor = tokens;
  for (const segment of segments) {
    if (!cursor || !Object.prototype.hasOwnProperty.call(cursor, segment)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return normalizeValue(cursor);
}

export function extractCssVarName(value) {
  if (typeof value !== 'string') {
    return null;
  }
  return value.trim().match(CSS_VAR_VALUE_PATTERN)?.[1] ?? null;
}

function formatValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function createFinding(path, expected, actual, reason) {
  return {
    path,
    expected: formatValue(expected),
    actual: formatValue(actual),
    reason,
  };
}

export function compareExactMap({ actual, cssVariables, expected, family, findings, tokenPaths, tokens }) {
  const actualKeys = new Set(Object.keys(actual ?? {}));
  const expectedKeys = new Set(Object.keys(expected));

  for (const [key, expectedValue] of Object.entries(expected)) {
    const path = `${family}.${key}`;
    const actualValue = actual?.[key];
    if (!valuesEqual(actualValue, expectedValue)) {
      findings.push(createFinding(path, expectedValue, actualValue ?? '<missing>', 'Tailwind alias drifted from expected runtime token mapping'));
      continue;
    }

    const cssVarName = extractCssVarName(actualValue);
    if (cssVarName && !cssVariables.has(cssVarName)) {
      findings.push(createFinding(path, `${cssVarName} defined in ${DESIGN_CSS_PATH}`, '<missing>', 'Tailwind alias references an undefined runtime CSS variable'));
    }

    const tokenPath = tokenPaths?.[key];
    if (tokenPath && getTokenValue(tokens, tokenPath) === undefined) {
      findings.push(createFinding(path, `${tokenPath} in ${TOKEN_JSON_PATH}`, '<missing>', 'Tailwind alias has no matching JSON token path'));
    }
  }

  for (const key of actualKeys) {
    if (!expectedKeys.has(key)) {
      findings.push(createFinding(`${family}.${key}`, '<not configured>', actual[key], 'Unexpected Tailwind non-color alias; add it to the design-token guard before use'));
    }
  }
}

export function compareFontSizes({ actual, cssVariables, findings, tokens }) {
  compareExactMap({
    actual,
    cssVariables,
    expected: EXPECTED_FONT_SIZE_ALIASES,
    family: 'fontSize',
    findings,
    tokenPaths: JSON_TOKEN_PATHS.fontSize,
    tokens,
  });

  for (const [key, value] of Object.entries(actual ?? {})) {
    const [sizeValue, options = {}] = Array.isArray(value) ? value : [value, {}];
    const sizeCssVar = extractCssVarName(sizeValue);
    if (sizeCssVar && !cssVariables.has(sizeCssVar)) {
      findings.push(createFinding(`fontSize.${key}`, `${sizeCssVar} defined in ${DESIGN_CSS_PATH}`, '<missing>', 'fontSize size references an undefined runtime CSS variable'));
    }

    for (const [optionKey, optionValue] of Object.entries(options ?? {})) {
      const optionCssVar = extractCssVarName(optionValue);
      if (optionCssVar && !cssVariables.has(optionCssVar)) {
        findings.push(createFinding(`fontSize.${key}.${optionKey}`, `${optionCssVar} defined in ${DESIGN_CSS_PATH}`, '<missing>', 'fontSize option references an undefined runtime CSS variable'));
      }
    }
  }
}

export function compareScreens({ actual, cssVariables, findings, tokens }) {
  compareExactMap({
    actual,
    cssVariables,
    expected: EXPECTED_SCREEN_VALUES,
    family: 'screens',
    findings,
    tokenPaths: JSON_TOKEN_PATHS.screens,
    tokens,
  });

  for (const [key, expectedValue] of Object.entries(EXPECTED_SCREEN_VALUES)) {
    const tokenValue = getTokenValue(tokens, JSON_TOKEN_PATHS.screens[key]);
    const cssValue = cssVariables.get(`--breakpoint-${key}`);
    if (tokenValue !== expectedValue) {
      findings.push(createFinding(`screens.${key}`, expectedValue, tokenValue ?? '<missing>', 'Breakpoint JSON token drifted from Tailwind static screen contract'));
    }
    if (cssValue !== expectedValue) {
      findings.push(createFinding(`screens.${key}`, expectedValue, cssValue ?? '<missing>', 'Breakpoint runtime CSS token drifted from Tailwind static screen contract'));
    }
    if (typeof actual?.[key] === 'string' && actual[key].startsWith('var(')) {
      findings.push(createFinding(`screens.${key}`, expectedValue, actual[key], 'Tailwind screens must stay static literals for media query generation'));
    }
  }
}

export function parseTailwindExtendContent(tailwindConfig, options = {}) {
  const { fail = throwFailure } = options;
  const cleanedConfig = stripCommentsPreserveLines(tailwindConfig);
  const extendBlock = extractObjectLiteralBlock(cleanedConfig, 'extend', { fail });
  return Object.fromEntries(
    ['spacing', 'borderRadius', 'boxShadow', 'fontFamily', 'fontSize', 'screens', 'transitionDuration', 'transitionTimingFunction']
      .map((objectName) => [
        objectName,
        parseObjectLiteral(extractObjectLiteralBlock(extendBlock, objectName, { fail }), objectName, { fail }),
      ]),
  );
}

export function checkTransitionDurationSemantics({ cssVariables, findings }) {
  for (const [key, expectedAlias] of Object.entries(EXPECTED_VAR_ALIASES.transitionDuration)) {
    const cssVarName = extractCssVarName(expectedAlias);
    const cssValue = cssVariables.get(cssVarName);
    if (cssValue && /\s+cubic-bezier\(/.test(cssValue)) {
      findings.push(createFinding(`transitionDuration.${key}`, 'duration-only token', cssValue, 'transitionDuration must not reference composite transition tokens'));
    }
  }
}

export function auditTailwindNonColorTokenAliases({ tailwindConfig, tokens, designCss }, options = {}) {
  const { fail = throwFailure } = options;
  const cssVariables = extractCssVariables(designCss);
  const extend = parseTailwindExtendContent(tailwindConfig, { fail });
  const findings = [];

  for (const family of ['spacing', 'borderRadius', 'boxShadow', 'fontFamily', 'transitionDuration', 'transitionTimingFunction']) {
    compareExactMap({
      actual: extend[family],
      cssVariables,
      expected: EXPECTED_VAR_ALIASES[family],
      family,
      findings,
      tokenPaths: JSON_TOKEN_PATHS[family],
      tokens,
    });
  }

  compareFontSizes({ actual: extend.fontSize, cssVariables, findings, tokens });
  compareScreens({ actual: extend.screens, cssVariables, findings, tokens });
  checkTransitionDurationSemantics({ cssVariables, findings });

  return {
    cssVariables,
    extend,
    findings,
  };
}

export function formatTailwindNonColorTokenAliasFailure(findings, options = {}) {
  const { maxFindingsToPrint = MAX_FINDINGS_TO_PRINT } = options;
  const lines = [
    `[tailwind-non-color-token-aliases] ${TAILWIND_CONFIG_PATH} contains non-color token alias drift.`,
    '',
  ];

  for (const finding of findings.slice(0, maxFindingsToPrint)) {
    lines.push(finding.path);
    lines.push(`  ${finding.reason}`);
    lines.push(`  Expected: ${finding.expected}`);
    lines.push(`  Actual:   ${finding.actual}`);
    lines.push('');
  }

  if (findings.length > maxFindingsToPrint) {
    lines.push(`... ${findings.length - maxFindingsToPrint} more finding(s) omitted`);
  }

  return lines.join('\n');
}
