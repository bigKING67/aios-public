import {
  auditEchartsThemeTokenSync,
  formatEchartsThemeTokenSyncFailure,
  summarizeEchartsThemeTokenSync,
} from './echarts-theme-token-sync-core.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('echarts theme token sync behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const ECHARTS_STYLE_SOURCE = `
import { CHART_SERIES_COLORS } from '@/lib/domain-taxonomy-colors';
import { DESIGN_COLOR_VALUES, DESIGN_FONT_FAMILY } from '@/lib/design-token-values';

export const ECHARTS_FONT_FAMILY = DESIGN_FONT_FAMILY;

export const ECHARTS_SERIES_COLORS = {
  primary: CHART_SERIES_COLORS.series1,
  secondary: CHART_SERIES_COLORS.series2,
  tertiary: CHART_SERIES_COLORS.series3,
  quaternary: CHART_SERIES_COLORS.series4,
  fifth: CHART_SERIES_COLORS.series5,
  sixth: CHART_SERIES_COLORS.series6,
  muted: CHART_SERIES_COLORS.muted,
  highlight: CHART_SERIES_COLORS.highlight,
} as const;

export const ECHARTS_COLORS = [
  ECHARTS_SERIES_COLORS.primary,
  ECHARTS_SERIES_COLORS.secondary,
  ECHARTS_SERIES_COLORS.tertiary,
  ECHARTS_SERIES_COLORS.quaternary,
  ECHARTS_SERIES_COLORS.fifth,
  ECHARTS_SERIES_COLORS.sixth,
] as const;

export const ECHARTS_TEXT_COLORS = {
  primary: DESIGN_COLOR_VALUES.textPrimary,
  secondary: DESIGN_COLOR_VALUES.textSecondary,
  tertiary: DESIGN_COLOR_VALUES.textTertiary,
  inverse: DESIGN_COLOR_VALUES.textInverse,
} as const;

export const ECHARTS_SURFACE_COLORS = {
  canvas: DESIGN_COLOR_VALUES.backgroundSecondary,
  surface: DESIGN_COLOR_VALUES.backgroundPrimary,
  hoverWash: DESIGN_COLOR_VALUES.backgroundTertiary,
} as const;

export const ECHARTS_STRUCTURAL_COLORS = {
  axisLine: DESIGN_COLOR_VALUES.border,
  gridLine: DESIGN_COLOR_VALUES.divider,
  tooltipBorder: 'transparent',
} as const;

function withOpacity(hexColor: string, alpha: number): string {
  const normalizedHex = hexColor.replace('#', '');
  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  const cssColorFunction = 'rgba';

  return \`\${cssColorFunction}(\${red}, \${green}, \${blue}, \${alpha})\`;
}

export const ECHARTS_MATERIAL_COLORS = {
  tooltipBackground: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.88),
  tooltipShadow: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.08),
  softShadow: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.08),
  mediumShadow: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.16),
  primaryAreaStart: withOpacity(CHART_SERIES_COLORS.series1, 0.26),
  primaryAreaEnd: withOpacity(CHART_SERIES_COLORS.series1, 0.03),
  primaryRadarArea: withOpacity(CHART_SERIES_COLORS.series1, 0.22),
  radarSplitAreaA: withOpacity(DESIGN_COLOR_VALUES.backgroundSecondary, 0.7),
  radarSplitAreaB: withOpacity(DESIGN_COLOR_VALUES.backgroundTertiary, 0.92),
} as const;

export const ECHARTS_SEMANTIC_SERIES_COLORS = {
  negative: DESIGN_COLOR_VALUES.trendUp,
  positive: DESIGN_COLOR_VALUES.trendDown,
  ink: ECHARTS_TEXT_COLORS.primary,
} as const;

export const ECHARTS_CHART_TOKENS = {
  textPrimary: ECHARTS_TEXT_COLORS.primary,
  textSecondary: ECHARTS_TEXT_COLORS.secondary,
  textTertiary: ECHARTS_TEXT_COLORS.tertiary,
  textInverse: ECHARTS_TEXT_COLORS.inverse,
  surface: ECHARTS_SURFACE_COLORS.surface,
  axisLine: ECHARTS_STRUCTURAL_COLORS.axisLine,
  gridLine: ECHARTS_STRUCTURAL_COLORS.gridLine,
  tooltipBackground: ECHARTS_MATERIAL_COLORS.tooltipBackground,
  tooltipBorder: ECHARTS_STRUCTURAL_COLORS.tooltipBorder,
  softShadow: ECHARTS_MATERIAL_COLORS.softShadow,
  mediumShadow: ECHARTS_MATERIAL_COLORS.mediumShadow,
  primarySeries: ECHARTS_COLORS[0],
  negativeSeries: ECHARTS_SEMANTIC_SERIES_COLORS.negative,
  positiveSeries: ECHARTS_SEMANTIC_SERIES_COLORS.positive,
} as const;
`;

const ECHARTS_THEME_SOURCE = `
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { ECHARTS_CHART_TOKENS, ECHARTS_COLORS, ECHARTS_FONT_FAMILY } from '@/styles/echarts-theme';

export const createEchartsTheme = () => {
  const chartTokens = ECHARTS_CHART_TOKENS;
  const theme: EChartsCoreOption = {
    color: [...ECHARTS_COLORS],
    textStyle: {
      fontFamily: ECHARTS_FONT_FAMILY,
      color: chartTokens.textPrimary,
    },
    tooltip: {
      backgroundColor: chartTokens.tooltipBackground,
      borderColor: chartTokens.tooltipBorder,
    },
  };

  echarts.registerTheme('aios-modern', theme);

  return theme;
};
`;

function runCheck(options = {}) {
  const {
    echartsStyle = ECHARTS_STYLE_SOURCE,
    echartsTheme = ECHARTS_THEME_SOURCE,
  } = options;
  const findings = auditEchartsThemeTokenSync({
    echartsStyleSource: echartsStyle,
    echartsThemeSource: echartsTheme,
  });

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[echarts-theme-token-sync] OK: ${summarizeEchartsThemeTokenSync()}\n`,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatEchartsThemeTokenSyncFailure(findings)}\n`,
  };
}

function withFixture(options, assertion) {
  assertion(runCheck(options));
}

export function runEchartsThemeTokenSyncBehaviorFixtures(assertions) {
  useAssertions(assertions);

  withFixture(
    {},
    (result) => {
      assertEqual(result.status, 0, 'matching ECharts theme token sync fixture should pass');
      assertIncludes(
        result.stdout,
        'ECharts theme adapters map to AIOS chart series, semantic token, and derived material helpers',
        'passing output should describe protected mapping',
      );
    },
  );

  withFixture(
    {
      echartsStyle: ECHARTS_STYLE_SOURCE.replace('primary: CHART_SERIES_COLORS.series1', "primary: '#445DF6'"),
    },
    (result) => {
      assertEqual(result.status, 1, 'raw chart series literal should fail');
      assertIncludes(result.stderr, 'primary: CHART_SERIES_COLORS.series1', 'series mapping drift should be explicit');
      assertIncludes(result.stderr, '#445DF6', 'raw color drift should report literal');
    },
  );

  withFixture(
    {
      echartsStyle: ECHARTS_STYLE_SOURCE.replace(
        'primary: DESIGN_COLOR_VALUES.textPrimary',
        'primary: DESIGN_COLOR_VALUES.primary',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'text semantic mapping drift should fail');
      assertIncludes(result.stderr, 'primary: DESIGN_COLOR_VALUES.textPrimary', 'text token drift should be explicit');
    },
  );

  withFixture(
    {
      echartsStyle: ECHARTS_STYLE_SOURCE.replace(
        'tooltipBackground: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.88)',
        'tooltipBackground: withOpacity(CHART_SERIES_COLORS.series1, 0.88)',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'material source token drift should fail');
      assertIncludes(
        result.stderr,
        'tooltipBackground: withOpacity(DESIGN_COLOR_VALUES.textPrimary, 0.88)',
        'material mapping drift should be explicit',
      );
    },
  );

  withFixture(
    {
      echartsTheme: ECHARTS_THEME_SOURCE.replace(
        'color: [...ECHARTS_COLORS]',
        "color: ['#445DF6']",
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'registered ECharts theme raw color should fail');
      assertIncludes(result.stderr, 'color: [...ECHARTS_COLORS]', 'theme color source drift should be explicit');
      assertIncludes(result.stderr, '#445DF6', 'registered theme raw color should report literal');
    },
  );

  withFixture(
    {
      echartsTheme: ECHARTS_THEME_SOURCE.replace(
        "import { ECHARTS_CHART_TOKENS, ECHARTS_COLORS, ECHARTS_FONT_FAMILY } from '@/styles/echarts-theme';",
        "import { CHART_SERIES_COLORS } from '@/lib/domain-taxonomy-colors';\\nimport { ECHARTS_CHART_TOKENS, ECHARTS_FONT_FAMILY } from '@/styles/echarts-theme';",
      ).replace('color: [...ECHARTS_COLORS]', 'color: [CHART_SERIES_COLORS.series1]'),
    },
    (result) => {
      assertEqual(result.status, 1, 'registered ECharts theme direct source import should fail');
      assertIncludes(
        result.stderr,
        'apps/web-vite/src/theme/echarts-theme.ts must consume apps/web-vite/src/styles/echarts-theme.ts, not CHART_SERIES_COLORS directly',
        'theme adapter layering drift should be explicit',
      );
    },
  );
}
