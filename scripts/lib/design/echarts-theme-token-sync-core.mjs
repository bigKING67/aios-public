const ECHARTS_STYLE_PATH = 'apps/web-vite/src/styles/echarts-theme.ts';
const ECHARTS_THEME_PATH = 'apps/web-vite/src/theme/echarts-theme.ts';
const RAW_COLOR_PATTERN = /#[0-9A-Fa-f]{3,8}|\brgba?\s*\(|\bhsla?\s*\(/g;

function stripCommentsPreserveLines(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

function assertContains(source, needle, filePath, findings) {
  if (!source.includes(needle)) {
    findings.push(`${filePath} missing ${needle}`);
  }
}

function findRawColorLiterals(source) {
  const cleanedSource = stripCommentsPreserveLines(source);
  RAW_COLOR_PATTERN.lastIndex = 0;
  return Array.from(new Set(Array.from(cleanedSource.matchAll(RAW_COLOR_PATTERN), (match) => match[0])));
}

function assertNoRawColorLiterals(source, filePath, findings) {
  const rawColors = findRawColorLiterals(source);
  if (rawColors.length > 0) {
    findings.push(`${filePath} contains raw color literal(s) outside token-derived helpers: ${rawColors.join(', ')}`);
  }
}

function verifyEchartsStyleAdapter(source, findings) {
  assertContains(source, "import { CHART_SERIES_COLORS } from '@/lib/domain-taxonomy-colors';", ECHARTS_STYLE_PATH, findings);
  assertContains(
    source,
    "import { DESIGN_COLOR_VALUES, DESIGN_FONT_FAMILY } from '@/lib/design-token-values';",
    ECHARTS_STYLE_PATH,
    findings,
  );
  assertContains(source, 'export const ECHARTS_FONT_FAMILY = DESIGN_FONT_FAMILY;', ECHARTS_STYLE_PATH, findings);

  const seriesMappings = [
    'primary: CHART_SERIES_COLORS.series1',
    'secondary: CHART_SERIES_COLORS.series2',
    'tertiary: CHART_SERIES_COLORS.series3',
    'quaternary: CHART_SERIES_COLORS.series4',
    'fifth: CHART_SERIES_COLORS.series5',
    'sixth: CHART_SERIES_COLORS.series6',
    'muted: CHART_SERIES_COLORS.muted',
    'highlight: CHART_SERIES_COLORS.highlight',
  ];
  for (const mapping of seriesMappings) {
    assertContains(source, mapping, ECHARTS_STYLE_PATH, findings);
  }

  const semanticMappings = [
    'primary: DESIGN_COLOR_VALUES.textPrimary',
    'secondary: DESIGN_COLOR_VALUES.textSecondary',
    'tertiary: DESIGN_COLOR_VALUES.textTertiary',
    'inverse: DESIGN_COLOR_VALUES.textInverse',
    'canvas: DESIGN_COLOR_VALUES.backgroundSecondary',
    'surface: DESIGN_COLOR_VALUES.backgroundPrimary',
    'hoverWash: DESIGN_COLOR_VALUES.backgroundTertiary',
    'axisLine: DESIGN_COLOR_VALUES.border',
    'gridLine: DESIGN_COLOR_VALUES.divider',
    'negative: DESIGN_COLOR_VALUES.trendUp',
    'positive: DESIGN_COLOR_VALUES.trendDown',
  ];
  for (const mapping of semanticMappings) {
    assertContains(source, mapping, ECHARTS_STYLE_PATH, findings);
  }

  const materialMappings = [
    'tooltipBackground: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.88)',
    'tooltipShadow: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.08)',
    'softShadow: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.08)',
    'mediumShadow: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.16)',
    'primaryAreaStart: withOpacity(CHART_SERIES_COLORS.series1, 0.26)',
    'primaryAreaEnd: withOpacity(CHART_SERIES_COLORS.series1, 0.03)',
    'primaryRadarArea: withOpacity(CHART_SERIES_COLORS.series1, 0.22)',
    'radarSplitAreaA: withOpacity(DESIGN_COLOR_VALUES.backgroundSecondary, 0.7)',
    'radarSplitAreaB: withOpacity(DESIGN_COLOR_VALUES.backgroundTertiary, 0.92)',
  ];
  for (const mapping of materialMappings) {
    assertContains(source, mapping, ECHARTS_STYLE_PATH, findings);
  }

  assertContains(source, 'const cssColorFunction = \'rgba\';', ECHARTS_STYLE_PATH, findings);
  assertNoRawColorLiterals(source, ECHARTS_STYLE_PATH, findings);
}

function verifyEchartsThemeRegistration(source, findings) {
  assertContains(
    source,
    "import { ECHARTS_CHART_TOKENS, ECHARTS_COLORS, ECHARTS_FONT_FAMILY } from '@/styles/echarts-theme';",
    ECHARTS_THEME_PATH,
    findings,
  );
  assertContains(source, 'const chartTokens = ECHARTS_CHART_TOKENS;', ECHARTS_THEME_PATH, findings);
  assertContains(source, 'color: [...ECHARTS_COLORS]', ECHARTS_THEME_PATH, findings);
  assertContains(source, "echarts.registerTheme('aios-modern', theme);", ECHARTS_THEME_PATH, findings);
  assertNoRawColorLiterals(source, ECHARTS_THEME_PATH, findings);

  const forbiddenDirectSources = [
    'CHART_SERIES_COLORS',
    'DESIGN_COLOR_VALUES',
    'PLATFORM_LEGEND_COLORS',
    'DOMAIN_TAXONOMY_COLORS',
  ];
  for (const sourceName of forbiddenDirectSources) {
    if (source.includes(sourceName)) {
      findings.push(`${ECHARTS_THEME_PATH} must consume apps/web-vite/src/styles/echarts-theme.ts, not ${sourceName} directly.`);
    }
  }
}

export {
  ECHARTS_STYLE_PATH,
  ECHARTS_THEME_PATH,
};

export function auditEchartsThemeTokenSync({ echartsStyleSource, echartsThemeSource }) {
  const findings = [];

  verifyEchartsStyleAdapter(echartsStyleSource, findings);
  verifyEchartsThemeRegistration(echartsThemeSource, findings);

  return findings;
}

export function formatEchartsThemeTokenSyncFailure(findings) {
  return [
    '[echarts-theme-token-sync] ECharts theme token drift was detected:',
    ...findings.map((finding) => `- ${finding}`),
  ].join('\n');
}

export function summarizeEchartsThemeTokenSync() {
  return 'ECharts theme adapters map to AIOS chart series, semantic token, and derived material helpers.';
}
