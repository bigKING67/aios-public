import {
  auditDesignRuntimeTokens,
  formatDesignRuntimeTokenFailure,
  summarizeDesignRuntimeTokens,
} from './design-runtime-token-sync-core.mjs';

const BASE_TOKENS = {
  typography: {
    fontFamily: {
      base: 'system-ui, sans-serif',
      mono: 'Monaco, monospace',
    },
    fontSize: {
      base: { value: '14px', lineHeight: '1.4' },
      dataLg: { value: '32px', lineHeight: '1.2' },
    },
    fontWeight: {
      normal: 400,
      data: 660,
    },
    lineHeight: {
      normal: '1.4',
      tight: '1.2',
    },
    letterSpacing: {
      normal: '0',
      title: '-0.02em',
    },
  },
  spacing: {
    0: '0',
    4: '16px',
    5: '20px',
    24: '96px',
  },
  borderRadius: {
    base: '4px',
    lg: '12px',
    '2xl': '16px',
  },
  shadow: {
    none: 'none',
    base: '0 2px 8px rgba(0, 0, 0, 0.05)',
  },
  transition: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  transitionDuration: {
    fast: '150ms',
  },
  transitionEasing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  breakpoint: {
    md: '768px',
  },
  component: {
    button: {
      height: { base: '32px' },
      paddingX: { base: '16px' },
      borderRadius: '{borderRadius.base}',
    },
    input: {
      height: '32px',
      paddingX: '12px',
      paddingY: '4px',
      borderRadius: '{borderRadius.base}',
    },
    control: {
      lineHeight: { md: '28px' },
    },
    card: {
      borderRadius: '{borderRadius.base}',
      padding: '{spacing.4}',
      shadow: '{shadow.base}',
    },
    modal: {
      borderRadius: '{borderRadius.lg}',
      shadow: '{shadow.base}',
    },
    table: {
      detail: {
        header: {
          fontSize: 'var(--font-size-base)',
          fontWeight: '620',
          lineHeight: 'var(--line-height-tight)',
          letterSpacing: 'var(--letter-spacing-title)',
        },
        body: {
          fontSize: 'var(--font-size-sm)',
          fontWeight: '410',
          lineHeight: 'var(--line-height-normal)',
          letterSpacing: 'var(--letter-spacing-normal)',
        },
        link: {
          fontWeight: 'var(--component-table-detail-body-font-weight)',
        },
        numeric: {
          letterSpacing: 'var(--letter-spacing-title)',
        },
      },
    },
  },
};

const MATCHING_CSS = `
:root {
  --font-family-base: system-ui, sans-serif;
  --font-family-mono: Monaco,
    monospace;
  --font-size-base: 14px;
  --font-size-data-lg: 32px;
  --font-weight-normal: 400;
  --font-weight-data: 660;
  --line-height-normal: 1.4;
  --line-height-tight: 1.2;
  --letter-spacing-normal: 0;
  --letter-spacing-title: -0.02em;
  --spacing-0: 0;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-24: 96px;
  --border-radius-base: 4px;
  --border-radius-lg: 12px;
  --border-radius-2xl: 16px;
  --shadow-none: none;
  --shadow-base: 0 2px 8px rgba(0, 0, 0, 0.05);
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-duration-fast: 150ms;
  --transition-easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --breakpoint-md: 768px;
  --component-button-height-base: 32px;
  --component-button-padding-x-base: 16px;
  --component-button-border-radius: var(--border-radius-base);
  --component-input-height: 32px;
  --component-input-padding-x: 12px;
  --component-input-padding-y: 4px;
  --component-input-border-radius: var(--border-radius-base);
  --component-control-line-height-md: 28px;
  --component-card-border-radius: var(--border-radius-base);
  --component-card-padding: var(--spacing-4);
  --component-card-shadow: var(--shadow-base);
  --component-modal-border-radius: var(--border-radius-lg);
  --component-modal-shadow: var(--shadow-base);
  --component-table-detail-header-font-size: var(--font-size-base);
  --component-table-detail-header-font-weight: 620;
  --component-table-detail-header-line-height: var(--line-height-tight);
  --component-table-detail-header-letter-spacing: var(--letter-spacing-title);
  --component-table-detail-body-font-size: var(--font-size-sm);
  --component-table-detail-body-font-weight: 410;
  --component-table-detail-body-line-height: var(--line-height-normal);
  --component-table-detail-body-letter-spacing: var(--letter-spacing-normal);
  --component-table-detail-link-font-weight: var(--component-table-detail-body-font-weight);
  --component-table-detail-numeric-letter-spacing: var(--letter-spacing-title);
}
`;

function runCheck({ tokens = BASE_TOKENS, css = MATCHING_CSS }) {
  const { diffs, expectedRuntimeTokens } = auditDesignRuntimeTokens({
    cssSource: css,
    tokens,
  });

  if (diffs.length === 0) {
    return {
      status: 0,
      stdout: `[design-runtime-token-sync] OK: ${summarizeDesignRuntimeTokens(expectedRuntimeTokens)}\n`,
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: `${formatDesignRuntimeTokenFailure(diffs)}\n`,
  };
}

function withFixture(fixture, assertion) {
  assertion(runCheck(fixture));
}

export function runDesignRuntimeTokenSyncBehaviorFixtures({
  assertEqual,
  assertIncludes,
}) {
  withFixture({}, (result) => {
    assertEqual(result.status, 0, 'matching runtime CSS tokens should pass');
    assertIncludes(result.stdout, 'non-color runtime token variables match', 'pass output should include checked count');
  });

  withFixture(
    {
      css: MATCHING_CSS.replace('--shadow-base: 0 2px 8px rgba(0, 0, 0, 0.05);', '--shadow-base: 0 1px 3px rgba(0, 0, 0, 0.10);'),
    },
    (result) => {
      assertEqual(result.status, 1, 'shadow drift should fail');
      assertIncludes(result.stderr, 'shadow.base -> --shadow-base', 'shadow drift should identify token path');
    },
  );

  withFixture(
    {
      css: MATCHING_CSS.replace('  --font-size-data-lg: 32px;\n', ''),
    },
    (result) => {
      assertEqual(result.status, 1, 'missing runtime token should fail');
      assertIncludes(result.stderr, 'typography.fontSize.dataLg.value -> --font-size-data-lg', 'missing token should identify token path');
      assertIncludes(result.stderr, 'CSS:  <missing>', 'missing token should show missing CSS value');
    },
  );

  withFixture(
    {
      css: MATCHING_CSS.replace('--component-card-padding: var(--spacing-4);', '--component-card-padding: 16px;'),
    },
    (result) => {
      assertEqual(result.status, 1, 'component reference drift should fail');
      assertIncludes(result.stderr, 'component.card.padding -> --component-card-padding', 'component drift should identify token path');
      assertIncludes(result.stderr, 'JSON: var(--spacing-4)', 'reference should be resolved to runtime CSS var');
    },
  );

  withFixture(
    {
      css: MATCHING_CSS.replace('--component-table-detail-body-font-weight: 410;', '--component-table-detail-body-font-weight: 400;'),
    },
    (result) => {
      assertEqual(result.status, 1, 'dense table detail token drift should fail');
      assertIncludes(result.stderr, 'component.table.detail.body.fontWeight -> --component-table-detail-body-font-weight', 'table detail drift should identify token path');
    },
  );

  return 'matching runtime CSS, value drift, missing token, reference drift, and table detail drift checks passed.';
}
