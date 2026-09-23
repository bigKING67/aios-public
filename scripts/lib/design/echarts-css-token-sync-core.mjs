const ECHARTS_CSS_PATH = 'apps/web-vite/src/styles/echarts.css';
const TOKEN_JSON_PATH = 'DESIGN_TOKENS.json';
const SYNC_CONFIG_PATH = 'scripts/config/design/token-color-sync.config.json';
const PLATFORM_SOURCE_PATH = 'apps/web-vite/src/lib/platform-colors.ts';
const DOMAIN_SOURCE_PATH = 'apps/web-vite/src/lib/domain-taxonomy-colors.ts';

function throwFailure(message) {
  throw new Error(message);
}

function normalizeColor(value) {
  return value.trim().toUpperCase();
}

function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function extractCssDeclarations(source) {
  const declarations = new Map();
  const cleanedSource = stripCssComments(source);
  const declarationPattern = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+)\s*;/g;
  let match;

  while ((match = declarationPattern.exec(cleanedSource)) !== null) {
    declarations.set(match[1], match[2].trim());
  }

  return declarations;
}

function extractObjectLiteralValue(content, objectName, key, filePath, options = {}) {
  const { fail = throwFailure } = options;
  const objectPattern = new RegExp(`export\\s+const\\s+${objectName}\\s*=\\s*{([\\s\\S]*?)}\\s+as\\s+const`, 'm');
  const objectMatch = content.match(objectPattern);
  if (!objectMatch) {
    fail(`${filePath} missing ${objectName}.`);
  }

  const valuePattern = new RegExp(`\\b${key}\\s*:\\s*['"](#[0-9A-Fa-f]{3,8})['"]`);
  const valueMatch = objectMatch[1].match(valuePattern);
  if (!valueMatch) {
    fail(`${filePath} missing ${objectName}.${key}.`);
  }

  return valueMatch[1];
}

function hexToRgb(hexColor, label, options = {}) {
  const { fail = throwFailure } = options;
  const normalized = hexColor.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
    fail(`${label} must be a 6-digit hex color to derive rgba fallback, got ${hexColor}.`);
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function expectedRgba(hexColor, alpha, label, options = {}) {
  const [red, green, blue] = hexToRgb(hexColor, label, options);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function chartFallbackVarName(cssVarName) {
  return cssVarName.replace(/^--chart-/, '--echarts-fallback-chart-');
}

function assertDeclaration(declarations, name, expectedValue, findings) {
  const actualValue = declarations.get(name);
  if (actualValue === undefined) {
    findings.push(`${ECHARTS_CSS_PATH} missing ${name}.`);
    return;
  }

  if (normalizeColor(actualValue) !== normalizeColor(expectedValue)) {
    findings.push(`${ECHARTS_CSS_PATH} ${name} expected ${expectedValue}, got ${actualValue}.`);
  }
}

function assertCanonicalSource(sourceLabel, key, tokenColor, sourceColor, findings) {
  if (normalizeColor(tokenColor) !== normalizeColor(sourceColor)) {
    findings.push(`${sourceLabel}.${key} canonical source drift: token ${tokenColor}, source ${sourceColor}.`);
  }
}

function buildExpectedFallbacks(tokens, syncConfig, sources, findings, options = {}) {
  const { fail = throwFailure } = options;
  const expectedFallbacks = new Map([
    ['--echarts-fallback-text-inverse', tokens.color.text.inverse.value],
    ['--echarts-fallback-divider', tokens.color.divider.value],
    [
      '--echarts-fallback-tooltip-bg',
      expectedRgba(tokens.color.text.primary.value, '0.88', `${TOKEN_JSON_PATH}:color.text.primary`, options),
    ],
    [
      '--echarts-fallback-tooltip-shadow',
      expectedRgba(tokens.color.text.primary.value, '0.08', `${TOKEN_JSON_PATH}:color.text.primary`, options),
    ],
  ]);

  for (const key of syncConfig.chartKeys) {
    const cssVarName = syncConfig.chartCssVarByKey[key];
    if (!cssVarName) {
      fail(`${SYNC_CONFIG_PATH} missing chartCssVarByKey.${key}.`);
    }
    const tokenColor = tokens.color.chart[key]?.value;
    const sourceColor = extractObjectLiteralValue(sources.domain, 'CHART_SERIES_COLORS', key, DOMAIN_SOURCE_PATH, options);
    assertCanonicalSource('CHART_SERIES_COLORS', key, tokenColor, sourceColor, findings);
    expectedFallbacks.set(chartFallbackVarName(cssVarName), tokenColor);
  }

  for (const key of syncConfig.platformKeys) {
    const tokenColor = tokens.color.platform[key]?.value;
    const sourceColor = extractObjectLiteralValue(sources.platform, 'PLATFORM_LEGEND_COLORS', key, PLATFORM_SOURCE_PATH, options);
    assertCanonicalSource('PLATFORM_LEGEND_COLORS', key, tokenColor, sourceColor, findings);
    expectedFallbacks.set(`--echarts-fallback-platform-${key}`, tokenColor);
  }

  return expectedFallbacks;
}

function buildExpectedAliases(syncConfig) {
  const aliases = new Map([
    ['--echarts-text-color-inverse', 'var(--text-inverse, var(--echarts-fallback-text-inverse))'],
    ['--echarts-divider-color', 'var(--divider-color, var(--echarts-fallback-divider))'],
    ['--echarts-tooltip-bg', 'var(--echarts-fallback-tooltip-bg)'],
    ['--echarts-tooltip-shadow', '0 2px 8px var(--echarts-fallback-tooltip-shadow)'],
  ]);

  const namedSeriesAliases = new Map([
    ['--echarts-color-primary', 'series1'],
    ['--echarts-color-secondary', 'series2'],
    ['--echarts-color-tertiary', 'series3'],
    ['--echarts-color-quaternary', 'series4'],
    ['--echarts-color-muted', 'muted'],
    ['--echarts-color-highlight', 'highlight'],
  ]);

  for (const [aliasName, key] of namedSeriesAliases) {
    const cssVarName = syncConfig.chartCssVarByKey[key];
    aliases.set(aliasName, `var(${cssVarName}, var(${chartFallbackVarName(cssVarName)}))`);
  }

  for (const key of syncConfig.chartKeys) {
    const cssVarName = syncConfig.chartCssVarByKey[key];
    const fallbackVarName = chartFallbackVarName(cssVarName);
    const numericAlias = key.match(/^series([1-6])$/)?.[1];
    if (numericAlias) {
      aliases.set(`--echarts-color-${numericAlias}`, `var(${cssVarName}, var(${fallbackVarName}))`);
    }
  }
  aliases.set('--echarts-color-7', 'var(--chart-series-muted, var(--echarts-fallback-chart-series-muted))');
  aliases.set('--echarts-color-8', 'var(--divider-color, var(--echarts-fallback-divider))');

  for (const key of syncConfig.platformKeys) {
    aliases.set(`--echarts-platform-${key}`, `var(--platform-${key}, var(--echarts-fallback-platform-${key}))`);
  }

  return aliases;
}

export {
  DOMAIN_SOURCE_PATH,
  ECHARTS_CSS_PATH,
  PLATFORM_SOURCE_PATH,
  SYNC_CONFIG_PATH,
  TOKEN_JSON_PATH,
};

export function auditEchartsCssTokenSync({ cssSource, sources, syncConfig, tokens }, options = {}) {
  const declarations = extractCssDeclarations(cssSource);
  const findings = [];

  const expectedFallbacks = buildExpectedFallbacks(tokens, syncConfig, sources, findings, options);
  const expectedAliases = buildExpectedAliases(syncConfig);
  const fallbackDeclarations = Array.from(declarations.keys()).filter((name) => name.startsWith('--echarts-fallback-'));

  for (const name of fallbackDeclarations) {
    if (!expectedFallbacks.has(name)) {
      findings.push(`${ECHARTS_CSS_PATH} has unexpected fallback declaration ${name}. Add it to ${TOKEN_JSON_PATH} and this guard first.`);
    }
  }

  for (const [name, expectedValue] of expectedFallbacks) {
    assertDeclaration(declarations, name, expectedValue, findings);
  }

  for (const [name, expectedValue] of expectedAliases) {
    assertDeclaration(declarations, name, expectedValue, findings);
  }

  return {
    expectedAliases,
    expectedFallbacks,
    findings,
  };
}

export function formatEchartsCssTokenSyncFailure(findings) {
  return [
    '[echarts-css-token-sync] ECharts CSS token fallback drift was detected:',
    ...findings.map((finding) => `- ${finding}`),
  ].join('\n');
}

export function summarizeEchartsCssTokenSync({ expectedAliases, expectedFallbacks }) {
  return `${expectedFallbacks.size} fallback values and ${expectedAliases.size} public aliases map to canonical tokens.`;
}
