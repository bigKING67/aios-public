import {
  auditAntdThemeTokenSync,
  formatAntdThemeTokenSyncFailure,
  summarizeAntdThemeTokenSync,
} from '../../checks/design/antd-theme-token-sync.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('AntD theme token sync behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const BASE_TOKENS = Object.freeze({
  color: {
    primary: { value: '#2F6EEA' },
    success: { value: '#168A3A' },
    warning: { value: '#B87503' },
    error: { value: '#C93A32' },
    info: { value: '#2457C5' },
    status: {
      success: { value: '#168A3A' },
      successBg: { value: '#EAF8EE' },
      successBorder: { value: '#BFE8CA' },
      warning: { value: '#B87503' },
      warningBg: { value: '#FFF7E6' },
      warningBorder: { value: '#F3D38D' },
      danger: { value: '#C93A32' },
      dangerBg: { value: '#FFF1F0' },
      dangerBorder: { value: '#F2C4C0' },
      info: { value: '#2457C5' },
      infoStrong: { value: '#1F4FBF' },
      infoBg: { value: '#F2F6FF' },
      infoBorder: { value: '#C9D8FF' },
      neutral: { value: '#8A8F8A' },
    },
    trend: {
      up: { value: '#BF3D2F' },
      down: { value: '#2F8C5B' },
      neutral: { value: '#8A8F8A' },
    },
    text: {
      primary: { value: '#1A1A1A' },
      secondary: { value: '#5F6368' },
      tertiary: { value: '#8A8F8A' },
      inverse: { value: '#FFFFFF' },
    },
    background: {
      primary: { value: '#FFFFFF' },
      secondary: { value: '#F5F5F5' },
      tertiary: { value: '#F8F8F8' },
    },
    border: { value: '#E6E6E6' },
    divider: { value: '#F0F0F0' },
  },
  borderRadius: {
    sm: '2px',
    base: '4px',
    md: '6px',
    lg: '12px',
  },
  spacing: {
    2: '8px',
    3: '12px',
    4: '16px',
    6: '24px',
    8: '32px',
  },
  typography: {
    fontFamily: {
      base: 'system-ui, sans-serif',
    },
    fontSize: {
      base: { value: '14px' },
      lg: { value: '16px' },
      '2xl': { value: '24px' },
      display: { value: '30px' },
      sectionTitle: { value: '20px' },
    },
    lineHeight: {
      tight: '1.2',
    },
  },
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.03)',
    lg: '0 10px 24px rgba(0, 0, 0, 0.10)',
  },
  transitionEasing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
  },
});

const ANT_THEME_SOURCE = `
import type { ThemeConfig } from 'antd';
import {
  DESIGN_COLOR_VALUES,
  DESIGN_FONT_FAMILY,
  DESIGN_SHADOW_VALUES,
} from '@/lib/design-token-values';

const colors = DESIGN_COLOR_VALUES;
const aiosFontFamily = DESIGN_FONT_FAMILY;

const ANT_DARK_THEME_ADAPTER_COLORS = {
  backgroundBase: '#141414',
  textBase: '#FFFFFFCC',
  border: '#434343',
} as const;

export const aiosBrandTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.danger,
    colorInfo: colors.info,
    colorSuccessBg: colors.statusSuccessBg,
    colorSuccessBorder: colors.statusSuccessBorder,
    colorSuccessText: colors.statusSuccess,
    colorWarningBg: colors.statusWarningBg,
    colorWarningBorder: colors.statusWarningBorder,
    colorWarningText: colors.statusWarning,
    colorErrorBg: colors.statusDangerBg,
    colorErrorBorder: colors.statusDangerBorder,
    colorErrorText: colors.statusDanger,
    colorInfoBg: colors.statusInfoBg,
    colorInfoBorder: colors.statusInfoBorder,
    colorInfoText: colors.statusInfo,
    colorTextBase: colors.textPrimary,
    colorTextLightSolid: colors.textInverse,
    borderRadius: 6,
    borderRadiusLG: 12,
    borderRadiusSM: 4,
    borderRadiusXS: 2,
    margin: 16,
    marginXS: 8,
    marginSM: 12,
    marginLG: 24,
    marginXL: 32,
    padding: 16,
    paddingXS: 8,
    paddingSM: 12,
    paddingLG: 24,
    paddingXL: 32,
    fontFamily: aiosFontFamily,
    fontSize: 14,
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,
    lineHeight: 1.5714285714,
    lineHeightHeading1: 1.2,
    lineHeightHeading2: 1.35,
    boxShadow: DESIGN_SHADOW_VALUES.lg,
    controlHeight: 36,
    controlHeightSM: 28,
    controlHeightLG: 44,
    motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    motionEaseOut: 'cubic-bezier(0, 0, 0.2, 1)',
    motionEaseOutCirc: 'cubic-bezier(0.04, 0.93, 0.82, 0.74)',
    motionUnit: 0.1,
    colorLink: colors.statusInfo,
    colorLinkHover: colors.statusInfoStrong,
    colorLinkActive: colors.statusInfoStrong,
  },
  components: {
    Button: {
      colorPrimary: colors.primary,
      colorTextLightSolid: colors.textInverse,
      controlHeight: 36,
      borderRadius: 6,
      controlOutline: 'var(--brand-focus-ring)',
    },
    Card: {
      boxShadow: DESIGN_SHADOW_VALUES.sm,
      borderRadiusLG: 12,
      colorBorder: colors.border,
    },
    Input: {
      colorBorder: colors.border,
      borderRadius: 6,
      controlHeight: 36,
      colorTextPlaceholder: colors.textTertiary,
    },
    Select: {
      colorBorder: colors.border,
      borderRadius: 6,
      controlHeight: 36,
    },
    Table: {
      colorBorder: colors.border,
      headerBg: colors.backgroundTertiary,
      headerSortActiveBg: colors.backgroundSecondary,
      rowHoverBg: colors.backgroundTertiary,
      borderRadius: 6,
    },
    Collapse: {
      colorBorder: colors.border,
      borderRadiusLG: 6,
    },
    Modal: {
      borderRadiusLG: 12,
      boxShadow: DESIGN_SHADOW_VALUES.lg,
    },
    Drawer: {
      borderRadiusLG: 12,
      boxShadow: DESIGN_SHADOW_VALUES.lg,
    },
    Notification: {
      borderRadiusLG: 8,
    },
    Message: {
      borderRadiusLG: 8,
    },
    Tooltip: {
      borderRadius: 4,
    },
    DatePicker: {
      borderRadius: 6,
      controlHeight: 36,
    },
    Form: {
      labelFontSize: 14,
      labelColor: colors.textPrimary,
    },
    Pagination: {
      itemActiveBg: colors.primary,
      itemActiveColor: colors.textInverse,
    },
    Tag: {
      borderRadiusSM: 4,
      borderRadius: 6,
    },
    Badge: {
      colorError: colors.danger,
      colorWarning: colors.warning,
      colorSuccess: colors.success,
    },
    Statistic: {
      titleFontSize: 14,
      contentFontSize: 28,
    },
    Segmented: {
      itemSelectedBg: colors.primary,
      itemSelectedColor: colors.textInverse,
    },
  },
};

export const darkTheme: ThemeConfig = {
  token: {
    colorPrimary: colors.primary,
    fontFamily: aiosFontFamily,
    colorBgBase: ANT_DARK_THEME_ADAPTER_COLORS.backgroundBase,
    colorTextBase: ANT_DARK_THEME_ADAPTER_COLORS.textBase,
    colorBorder: ANT_DARK_THEME_ADAPTER_COLORS.border,
  },
};
`;

const VITE_PROVIDER_SOURCE = `
import type { ReactNode } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/react-query';
import { FilterProvider } from '@/context/filter-context';
import { aiosBrandTheme } from '@/theme/ant-theme';
import { AuthSessionBootstrap } from '@/components/auth-session-bootstrap';

interface ViteProvidersProps {
  children: ReactNode;
}

export function ViteProviders({ children }: ViteProvidersProps) {
  return (
    <ConfigProvider locale={zhCN} theme={aiosBrandTheme}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <AuthSessionBootstrap />
          <FilterProvider>{children}</FilterProvider>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
`;

function runCheck(options = {}) {
  const {
    antTheme = ANT_THEME_SOURCE,
    tokens = BASE_TOKENS,
    viteProvider = VITE_PROVIDER_SOURCE,
  } = options;
  const findings = auditAntdThemeTokenSync({
    antThemeSource: antTheme,
    tokens,
    viteProviderSource: viteProvider,
  });

  if (findings.length === 0) {
    return {
      status: 0,
      stdout: `[antd-theme-token-sync] OK: ${summarizeAntdThemeTokenSync()}\n`,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatAntdThemeTokenSyncFailure(findings)}\n`,
  };
}

function withFixture(options, assertion) {
  assertion(runCheck(options));
}

function withTokenOverride(overrides) {
  return {
    ...BASE_TOKENS,
    ...overrides,
  };
}

export function runDesignAntdThemeTokenSyncBehaviorFixtures(assertions) {
  useAssertions(assertions);

withFixture(
  {},
  (result) => {
    assertEqual(result.status, 0, 'matching AntD theme token adapter should pass');
    assertIncludes(
      result.stdout,
      'Ant Design theme adapter maps to AIOS token helpers',
      'pass output should confirm token helper mapping',
    );
  },
);

withFixture(
  {
    antTheme: ANT_THEME_SOURCE.replace(
      'const colors = DESIGN_COLOR_VALUES;',
      'const colors = aiosBrandTheme.token;',
    ),
  },
  (result) => {
    assertEqual(result.status, 1, 'AntD helper consumption drift should fail');
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/theme/ant-theme.ts missing const colors = DESIGN_COLOR_VALUES;',
      'AntD guard should enforce helper consumption alias',
    );
  },
);

withFixture(
  {
    antTheme: ANT_THEME_SOURCE.replace(
      '    colorPrimary: colors.primary,\n    colorSuccess: colors.success,',
      "    colorPrimary: '#2F6EEA',\n    colorSuccess: colors.success,",
    ),
  },
  (result) => {
    assertEqual(result.status, 1, 'root token raw color should fail');
    assertIncludes(
      result.stderr,
      'contains raw color literal(s) outside ANT_DARK_THEME_ADAPTER_COLORS',
      'raw color failure should explain dark adapter boundary',
    );
    assertIncludes(result.stderr, '#2F6EEA', 'raw color failure should print literal');
  },
);

withFixture(
  {
    antTheme: ANT_THEME_SOURCE.replace(
      '    colorError: colors.danger,',
      '    colorError: colors.warning,',
    ),
  },
  (result) => {
    assertEqual(result.status, 1, 'AntD root colorError drift should fail');
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/theme/ant-theme.ts colorError drifted; expected colors.danger, got colors.warning',
      'root token drift should identify AntD token property',
    );
  },
);

withFixture(
  {
    tokens: withTokenOverride({
      spacing: {
        ...BASE_TOKENS.spacing,
        4: '20px',
      },
    }),
  },
  (result) => {
    assertEqual(result.status, 1, 'spacing token drift should fail AntD numeric tokens');
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/theme/ant-theme.ts margin drifted; expected 20, got 16',
      'spacing drift should identify margin',
    );
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/theme/ant-theme.ts padding drifted; expected 20, got 16',
      'spacing drift should identify padding',
    );
  },
);

withFixture(
  {
    antTheme: ANT_THEME_SOURCE.replace(
      "      controlOutline: 'var(--brand-focus-ring)',",
      '      controlOutline: colors.primary,',
    ),
  },
  (result) => {
    assertEqual(result.status, 1, 'Button component token drift should fail');
    assertIncludes(
      result.stderr,
      "apps/web-vite/src/theme/ant-theme.ts Button controlOutline drifted; expected 'var(--brand-focus-ring)', got colors.primary",
      'component token drift should identify component and token property',
    );
  },
);

withFixture(
  {
    antTheme: ANT_THEME_SOURCE.replace(
      "  backgroundBase: '#141414',",
      "  backgroundBase: '#000000',",
    ),
  },
  (result) => {
    assertEqual(result.status, 1, 'dark adapter value drift should fail');
    assertIncludes(
      result.stderr,
      "backgroundBase drifted; expected '#141414', got '#000000'",
      'dark adapter exception value should be fixed',
    );
  },
);

withFixture(
  {
    viteProvider: VITE_PROVIDER_SOURCE
      .replace("import { aiosBrandTheme } from '@/theme/ant-theme';", "import { modernBlueTheme } from '@/theme/ant-theme';")
      .replace('theme={aiosBrandTheme}', 'theme={modernBlueTheme}'),
  },
  (result) => {
    assertEqual(result.status, 1, 'provider deprecated theme alias should fail');
    assertIncludes(
      result.stderr,
      'apps/web-vite/src/ViteProviders.tsx must consume aiosBrandTheme directly instead of deprecated modernBlueTheme',
      'provider alias drift should be explicit',
    );
  },
);
}
