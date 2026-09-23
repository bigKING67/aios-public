import {
  auditEchartsCssTokenSync,
  formatEchartsCssTokenSyncFailure,
  summarizeEchartsCssTokenSync,
} from './echarts-css-token-sync-core.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('echarts css token sync behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const DESIGN_TOKENS_FIXTURE = {
  color: {
    text: {
      primary: { value: '#1A1A1A' },
      inverse: { value: '#FFFFFF' },
    },
    divider: { value: '#F0F0F0' },
    chart: {
      series1: { value: '#445DF6' },
      series2: { value: '#75B1F8' },
      series3: { value: '#3264F6' },
      series4: { value: '#4F8CB5' },
      series5: { value: '#536F86' },
      series6: { value: '#A4772A' },
      muted: { value: '#8A8F8A' },
      highlight: { value: '#3264F6' },
    },
    platform: {
      tmall: { value: '#EC5E2A' },
      douyin: { value: '#000000' },
      xiaohongshu: { value: '#FF2442' },
      jd: { value: '#DA291C' },
      wechat: { value: '#07C160' },
      unknown: { value: '#8A8F8A' },
    },
  },
};

const SYNC_CONFIG_FIXTURE = {
  chartKeys: ['series1', 'series2', 'series3', 'series4', 'series5', 'series6', 'muted', 'highlight'],
  chartCssVarByKey: {
    series1: '--chart-series-1',
    series2: '--chart-series-2',
    series3: '--chart-series-3',
    series4: '--chart-series-4',
    series5: '--chart-series-5',
    series6: '--chart-series-6',
    muted: '--chart-series-muted',
    highlight: '--chart-series-highlight',
  },
  platformKeys: ['tmall', 'douyin', 'xiaohongshu', 'jd', 'wechat', 'unknown'],
};

const DOMAIN_SOURCE_FIXTURE = `
export const CHART_SERIES_COLORS = {
  series1: '#445DF6',
  series2: '#75B1F8',
  series3: '#3264F6',
  series4: '#4F8CB5',
  series5: '#536F86',
  series6: '#A4772A',
  muted: '#8A8F8A',
  highlight: '#3264F6',
} as const;
`;

const PLATFORM_SOURCE_FIXTURE = `
export const PLATFORM_LEGEND_COLORS = {
  tmall: '#EC5E2A',
  douyin: '#000000',
  xiaohongshu: '#FF2442',
  jd: '#DA291C',
  wechat: '#07C160',
  unknown: '#8A8F8A',
} as const;
`;

const ECHARTS_CSS_FIXTURE = `
:root {
  --echarts-bg-color: transparent;

  --echarts-fallback-text-inverse: #FFFFFF;
  --echarts-fallback-chart-series-1: #445DF6;
  --echarts-fallback-chart-series-2: #75B1F8;
  --echarts-fallback-chart-series-3: #3264F6;
  --echarts-fallback-chart-series-4: #4F8CB5;
  --echarts-fallback-chart-series-5: #536F86;
  --echarts-fallback-chart-series-6: #A4772A;
  --echarts-fallback-chart-series-muted: #8A8F8A;
  --echarts-fallback-chart-series-highlight: #3264F6;
  --echarts-fallback-divider: #F0F0F0;
  --echarts-fallback-tooltip-bg: rgba(26, 26, 26, 0.88);
  --echarts-fallback-tooltip-shadow: rgba(26, 26, 26, 0.08);
  --echarts-fallback-platform-tmall: #EC5E2A;
  --echarts-fallback-platform-douyin: #000000;
  --echarts-fallback-platform-xiaohongshu: #FF2442;
  --echarts-fallback-platform-jd: #DA291C;
  --echarts-fallback-platform-wechat: #07C160;
  --echarts-fallback-platform-unknown: #8A8F8A;

  --echarts-text-color-inverse: var(--text-inverse, var(--echarts-fallback-text-inverse));
  --echarts-divider-color: var(--divider-color, var(--echarts-fallback-divider));

  --echarts-color-primary: var(--chart-series-1, var(--echarts-fallback-chart-series-1));
  --echarts-color-secondary: var(--chart-series-2, var(--echarts-fallback-chart-series-2));
  --echarts-color-tertiary: var(--chart-series-3, var(--echarts-fallback-chart-series-3));
  --echarts-color-quaternary: var(--chart-series-4, var(--echarts-fallback-chart-series-4));
  --echarts-color-muted: var(--chart-series-muted, var(--echarts-fallback-chart-series-muted));
  --echarts-color-highlight: var(--chart-series-highlight, var(--echarts-fallback-chart-series-highlight));

  --echarts-color-1: var(--chart-series-1, var(--echarts-fallback-chart-series-1));
  --echarts-color-2: var(--chart-series-2, var(--echarts-fallback-chart-series-2));
  --echarts-color-3: var(--chart-series-3, var(--echarts-fallback-chart-series-3));
  --echarts-color-4: var(--chart-series-4, var(--echarts-fallback-chart-series-4));
  --echarts-color-5: var(--chart-series-5, var(--echarts-fallback-chart-series-5));
  --echarts-color-6: var(--chart-series-6, var(--echarts-fallback-chart-series-6));
  --echarts-color-7: var(--chart-series-muted, var(--echarts-fallback-chart-series-muted));
  --echarts-color-8: var(--divider-color, var(--echarts-fallback-divider));

  --echarts-tooltip-bg: var(--echarts-fallback-tooltip-bg);
  --echarts-tooltip-shadow: 0 2px 8px var(--echarts-fallback-tooltip-shadow);

  --echarts-platform-tmall: var(--platform-tmall, var(--echarts-fallback-platform-tmall));
  --echarts-platform-douyin: var(--platform-douyin, var(--echarts-fallback-platform-douyin));
  --echarts-platform-xiaohongshu: var(--platform-xiaohongshu, var(--echarts-fallback-platform-xiaohongshu));
  --echarts-platform-jd: var(--platform-jd, var(--echarts-fallback-platform-jd));
  --echarts-platform-wechat: var(--platform-wechat, var(--echarts-fallback-platform-wechat));
  --echarts-platform-unknown: var(--platform-unknown, var(--echarts-fallback-platform-unknown));
}
`;

function runCheck(options = {}) {
  const {
    cssSource = ECHARTS_CSS_FIXTURE,
    domainSource = DOMAIN_SOURCE_FIXTURE,
    platformSource = PLATFORM_SOURCE_FIXTURE,
  } = options;
  const result = auditEchartsCssTokenSync({
    cssSource,
    sources: {
      domain: domainSource,
      platform: platformSource,
    },
    syncConfig: SYNC_CONFIG_FIXTURE,
    tokens: DESIGN_TOKENS_FIXTURE,
  });

  if (result.findings.length === 0) {
    return {
      status: 0,
      stdout: `[echarts-css-token-sync] OK: ${summarizeEchartsCssTokenSync(result)}\n`,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatEchartsCssTokenSyncFailure(result.findings)}\n`,
  };
}

function withFixture(options, assertion) {
  assertion(runCheck(options));
}

export function runEchartsCssTokenSyncBehaviorFixtures(assertions) {
  useAssertions(assertions);

  withFixture(
    {},
    (result) => {
      assertEqual(result.status, 0, `matching ECharts CSS token sync fixture should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
      assertIncludes(result.stdout, 'fallback values', 'passing output should describe protected fallback values');
      assertIncludes(result.stdout, 'public aliases', 'passing output should describe protected aliases');
    },
  );

  withFixture(
    {
      cssSource: ECHARTS_CSS_FIXTURE.replace('--echarts-fallback-chart-series-1: #445DF6;', '--echarts-fallback-chart-series-1: #2F6EEA;'),
    },
    (result) => {
      assertEqual(result.status, 1, 'chart fallback drift should fail');
      assertIncludes(result.stderr, '--echarts-fallback-chart-series-1', 'chart fallback failure should identify variable');
      assertIncludes(result.stderr, 'expected #445DF6', 'chart fallback failure should identify canonical value');
    },
  );

  withFixture(
    {
      cssSource: ECHARTS_CSS_FIXTURE.replace(
        '--echarts-color-highlight: var(--chart-series-highlight, var(--echarts-fallback-chart-series-highlight));',
        '--echarts-color-highlight: var(--chart-series-3, var(--echarts-fallback-chart-series-3));',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'highlight alias drift should fail');
      assertIncludes(result.stderr, '--echarts-color-highlight', 'highlight alias failure should identify alias');
      assertIncludes(result.stderr, '--chart-series-highlight', 'highlight alias failure should identify canonical token');
    },
  );

  withFixture(
    {
      cssSource: ECHARTS_CSS_FIXTURE
        .replace('  --echarts-fallback-platform-unknown: #8A8F8A;\n', '')
        .replace('  --echarts-platform-unknown: var(--platform-unknown, var(--echarts-fallback-platform-unknown));\n', ''),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing unknown platform fallback should fail');
      assertIncludes(result.stderr, '--echarts-fallback-platform-unknown', 'missing platform fallback should be explicit');
      assertIncludes(result.stderr, '--echarts-platform-unknown', 'missing platform alias should be explicit');
    },
  );

  withFixture(
    {
      cssSource: ECHARTS_CSS_FIXTURE.replace('--echarts-fallback-tooltip-bg: rgba(26, 26, 26, 0.88);', '--echarts-fallback-tooltip-bg: rgba(68, 93, 246, 0.88);'),
    },
    (result) => {
      assertEqual(result.status, 1, 'tooltip material source drift should fail');
      assertIncludes(result.stderr, '--echarts-fallback-tooltip-bg', 'tooltip drift should identify fallback variable');
      assertIncludes(result.stderr, 'rgba(26, 26, 26, 0.88)', 'tooltip drift should identify token-derived material value');
    },
  );

  withFixture(
    {
      cssSource: ECHARTS_CSS_FIXTURE.replace(
        '  --echarts-fallback-platform-unknown: #8A8F8A;',
        '  --echarts-fallback-platform-unknown: #8A8F8A;\n  --echarts-fallback-local-test: #123456;',
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'unexpected fallback variable should fail');
      assertIncludes(result.stderr, '--echarts-fallback-local-test', 'unexpected fallback variable should be explicit');
      assertIncludes(result.stderr, 'Add it to DESIGN_TOKENS.json', 'unexpected fallback failure should explain promotion path');
    },
  );

  withFixture(
    {
      domainSource: DOMAIN_SOURCE_FIXTURE.replace("series1: '#445DF6'", "series1: '#2F6EEA'"),
    },
    (result) => {
      assertEqual(result.status, 1, 'canonical chart source drift should fail');
      assertIncludes(result.stderr, 'CHART_SERIES_COLORS.series1 canonical source drift', 'source drift should identify source key');
    },
  );
}
