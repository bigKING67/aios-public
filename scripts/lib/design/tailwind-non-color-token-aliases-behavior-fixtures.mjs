import {
  auditTailwindNonColorTokenAliases,
  formatTailwindNonColorTokenAliasFailure,
} from './tailwind-non-color-token-aliases-core.mjs';

let activeAssertions;

function useAssertions(assertions) {
  activeAssertions = assertions;
}

function currentAssertions() {
  if (!activeAssertions) {
    throw new Error('Tailwind non-color token alias behavior fixtures require guard assertions.');
  }
  return activeAssertions;
}

function assertEqual(...args) {
  currentAssertions().assertEqual(...args);
}

function assertIncludes(...args) {
  currentAssertions().assertIncludes(...args);
}

const PASS_OUTPUT = '[tailwind-non-color-token-aliases] OK: Tailwind spacing, radius, shadow, typography, breakpoint, and transition aliases match runtime design tokens.\n';

const TOKENS = {
  typography: {
    fontFamily: {
      base: 'system-ui, sans-serif',
      display: 'Geist, sans-serif',
      code: 'Maple Mono, monospace',
    },
    fontSize: {
      xs: { value: '11px', lineHeight: '1.25' },
      sm: { value: '12px', lineHeight: '1.35' },
      base: { value: '14px', lineHeight: '1.5714' },
      lg: { value: '16px', lineHeight: '1.5' },
      xl: { value: '18px', lineHeight: '1.15' },
      '2xl': { value: '24px', lineHeight: '1.3333' },
      '3xl': { value: '32px', lineHeight: '1.25' },
      display: { value: '30px', lineHeight: '1.18' },
      sectionTitle: { value: '20px', lineHeight: '1.25' },
      dataLg: { value: '32px', lineHeight: '1.2' },
      dataMd: { value: '24px', lineHeight: '1.2' },
      dataSm: { value: '18px', lineHeight: '1.4' },
      marketingLg: { value: '40px', lineHeight: '1.12' },
      marketingXl: { value: '48px', lineHeight: '1.08' },
    },
    lineHeight: {
      normal: '1.4',
      tight: '1.2',
      snug: '1.25',
    },
    letterSpacing: {
      tight: '-0.03em',
      title: '-0.02em',
    },
  },
  spacing: {
    0: '0',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    12: '48px',
    16: '64px',
    20: '80px',
    24: '96px',
  },
  borderRadius: {
    none: '0',
    sm: '2px',
    base: '4px',
    md: '6px',
    lg: '12px',
    xl: '12px',
    '2xl': '16px',
    full: '9999px',
  },
  shadow: {
    none: 'none',
    sm: '0 1px 2px rgba(0, 0, 0, 0.03)',
    base: '0 2px 8px rgba(0, 0, 0, 0.05)',
    md: '0 4px 12px rgba(0, 0, 0, 0.08)',
    lg: '0 10px 24px rgba(0, 0, 0, 0.10)',
    xl: '0 20px 40px rgba(0, 0, 0, 0.12)',
  },
  transition: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    base: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  transitionDuration: {
    fast: '150ms',
    base: '250ms',
    slow: '350ms',
  },
  transitionEasing: {
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
  },
  breakpoint: {
    xs: '0px',
    sm: '576px',
    md: '768px',
    lg: '992px',
    xl: '1200px',
    '2xl': '1600px',
  },
};

const CSS = `
:root {
  --spacing-0: 0;
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  --spacing-12: 48px;
  --spacing-16: 64px;
  --spacing-20: 80px;
  --spacing-24: 96px;
  --border-radius-none: 0;
  --border-radius-sm: 2px;
  --border-radius-base: 4px;
  --border-radius-md: 6px;
  --border-radius-lg: 12px;
  --border-radius-xl: 12px;
  --border-radius-2xl: 16px;
  --border-radius-full: 9999px;
  --shadow-none: none;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.03);
  --shadow-base: 0 2px 8px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 10px 24px rgba(0, 0, 0, 0.10);
  --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.12);
  --font-family-base: system-ui, sans-serif;
  --font-family-display: Geist, sans-serif;
  --font-family-code: Maple Mono, monospace;
  --font-family-mono: var(--font-family-code);
  --font-size-xs: 11px;
  --font-size-sm: 12px;
  --font-size-base: 14px;
  --font-size-lg: 16px;
  --font-size-xl: 18px;
  --font-size-2xl: 24px;
  --font-size-3xl: 32px;
  --font-size-display: 30px;
  --font-size-section-title: 20px;
  --font-size-data-lg: 32px;
  --font-size-data-md: 24px;
  --font-size-data-sm: 18px;
  --font-size-marketing-lg: 40px;
  --font-size-marketing-xl: 48px;
  --line-height-normal: 1.4;
  --line-height-tight: 1.2;
  --line-height-snug: 1.25;
  --letter-spacing-tight: -0.03em;
  --letter-spacing-title: -0.02em;
  --breakpoint-xs: 0px;
  --breakpoint-sm: 576px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 992px;
  --breakpoint-xl: 1200px;
  --breakpoint-2xl: 1600px;
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 350ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-duration-fast: 150ms;
  --transition-duration-base: 250ms;
  --transition-duration-slow: 350ms;
  --transition-easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --transition-easing-out: cubic-bezier(0, 0, 0.2, 1);
  --transition-easing-in: cubic-bezier(0.4, 0, 1, 1);
}
`;

const TAILWIND_CONFIG = `
import type { Config } from 'tailwindcss';

const config: Config = {
  theme: {
    extend: {
      colors: {},
      borderRadius: {
        none: 'var(--border-radius-none)',
        xs: 'var(--border-radius-sm)',
        sm: 'var(--border-radius-base)',
        base: 'var(--border-radius-base)',
        md: 'var(--border-radius-md)',
        lg: 'var(--border-radius-lg)',
        xl: 'var(--border-radius-xl)',
        '2xl': 'var(--border-radius-2xl)',
        full: 'var(--border-radius-full)',
      },
      spacing: {
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
      },
      boxShadow: {
        none: 'var(--shadow-none)',
        xs: 'var(--shadow-sm)',
        sm: 'var(--shadow-sm)',
        base: 'var(--shadow-base)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        '2xl': 'var(--shadow-xl)',
      },
      fontFamily: {
        sans: ['var(--font-family-base)'],
        base: ['var(--font-family-base)'],
        display: ['var(--font-family-display)'],
        mono: ['var(--font-family-mono)'],
      },
      fontSize: {
        xs: ['var(--font-size-xs)', { lineHeight: '1.25' }],
        sm: ['var(--font-size-sm)', { lineHeight: '1.35' }],
        base: ['var(--font-size-base)', { lineHeight: 'var(--line-height-normal)' }],
        lg: ['var(--font-size-lg)', { lineHeight: 'var(--line-height-normal)' }],
        xl: ['var(--font-size-xl)', { lineHeight: '1.15' }],
        '2xl': ['var(--font-size-2xl)', { lineHeight: 'var(--line-height-tight)' }],
        '3xl': ['var(--font-size-3xl)', { lineHeight: 'var(--line-height-snug)' }],
        '4xl': ['var(--font-size-data-lg)', { lineHeight: 'var(--line-height-tight)' }],
        '5xl': ['var(--font-size-marketing-lg)', { lineHeight: 'var(--line-height-tight)' }],
        '6xl': ['var(--font-size-marketing-xl)', { lineHeight: 'var(--line-height-tight)' }],
        display: ['var(--font-size-display)', { lineHeight: '1.18', letterSpacing: 'var(--letter-spacing-tight)' }],
        'section-title': ['var(--font-size-section-title)', { lineHeight: '1.25', letterSpacing: 'var(--letter-spacing-title)' }],
        'data-lg': ['var(--font-size-data-lg)', { lineHeight: 'var(--line-height-tight)' }],
        'data-md': ['var(--font-size-data-md)', { lineHeight: 'var(--line-height-tight)' }],
        'data-sm': ['var(--font-size-data-sm)', { lineHeight: 'var(--line-height-normal)' }],
      },
      screens: {
        xs: '0px',
        sm: '576px',
        md: '768px',
        lg: '992px',
        xl: '1200px',
        '2xl': '1600px',
      },
      transitionDuration: {
        fast: 'var(--transition-duration-fast)',
        base: 'var(--transition-duration-base)',
        slow: 'var(--transition-duration-slow)',
      },
      transitionTimingFunction: {
        'ease-in-out': 'var(--transition-easing-standard)',
        'ease-out': 'var(--transition-easing-out)',
        'ease-in': 'var(--transition-easing-in)',
      },
    },
  },
};

export default config;
`;

function runCheck({ css = CSS, tailwindConfig = TAILWIND_CONFIG, tokens = TOKENS } = {}) {
  try {
    const { findings } = auditTailwindNonColorTokenAliases({
      designCss: css,
      tailwindConfig,
      tokens,
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
      stderr: `${formatTailwindNonColorTokenAliasFailure(findings)}\n`,
    };
  } catch (error) {
    return {
      status: 1,
      stdout: '',
      stderr: error instanceof Error ? `${error.message}\n` : `${error}\n`,
    };
  }
}

function withFixture(fixture, assertion) {
  assertion(runCheck(fixture));
}

export function runTailwindNonColorTokenAliasBehaviorFixtures(assertions) {
  useAssertions(assertions);

withFixture({}, (result) => {
  assertEqual(result.status, 0, 'matching Tailwind non-color aliases should pass');
  assertIncludes(result.stdout, 'spacing, radius, shadow, typography, breakpoint, and transition aliases match', 'pass output should explain coverage');
});

withFixture(
  {
    tailwindConfig: TAILWIND_CONFIG.replace("4: 'var(--spacing-4)'", "4: '16px'"),
  },
  (result) => {
    assertEqual(result.status, 1, 'raw spacing literal should fail');
    assertIncludes(result.stderr, 'spacing.4', 'spacing drift should identify key');
    assertIncludes(result.stderr, 'var(--spacing-4)', 'spacing drift should show expected token');
  },
);

withFixture(
  {
    tailwindConfig: TAILWIND_CONFIG.replace("4: 'var(--spacing-4)'", "4: 'var(--spacing-5)'"),
  },
  (result) => {
    assertEqual(result.status, 1, 'wrong spacing token should fail even when CSS var exists');
    assertIncludes(result.stderr, 'spacing.4', 'wrong spacing token should identify key');
    assertIncludes(result.stderr, 'Actual:   var(--spacing-5)', 'wrong spacing token should show actual alias');
  },
);

withFixture(
  {
    css: CSS.replace('  --border-radius-md: 6px;\n', ''),
  },
  (result) => {
    assertEqual(result.status, 1, 'missing runtime CSS var should fail');
    assertIncludes(result.stderr, 'borderRadius.md', 'missing radius token should identify key');
    assertIncludes(result.stderr, '--border-radius-md defined', 'missing radius token should mention CSS var');
  },
);

withFixture(
  {
    tailwindConfig: TAILWIND_CONFIG.replace("base: 'var(--shadow-base)'", "base: 'var(--box-shadow-base)'"),
  },
  (result) => {
    assertEqual(result.status, 1, 'wrong boxShadow CSS prefix should fail');
    assertIncludes(result.stderr, 'boxShadow.base', 'boxShadow drift should identify key');
    assertIncludes(result.stderr, 'var(--shadow-base)', 'boxShadow drift should show expected shadow token');
  },
);

withFixture(
  {
    tailwindConfig: TAILWIND_CONFIG.replace("base: ['var(--font-family-base)']", "base: ['system-ui', 'sans-serif']"),
  },
  (result) => {
    assertEqual(result.status, 1, 'fontFamily fallback array in Tailwind config should fail');
    assertIncludes(result.stderr, 'fontFamily.base', 'fontFamily drift should identify key');
  },
);

withFixture(
  {
    tailwindConfig: TAILWIND_CONFIG.replace("'5xl': ['var(--font-size-marketing-lg)'", "'5xl': ['var(--font-size-display)'"),
  },
  (result) => {
    assertEqual(result.status, 1, 'wrong fontSize scale alias should fail');
    assertIncludes(result.stderr, 'fontSize.5xl', 'fontSize drift should identify key');
    assertIncludes(result.stderr, 'var(--font-size-marketing-lg)', 'fontSize drift should show expected alias');
  },
);

withFixture(
  {
    tailwindConfig: TAILWIND_CONFIG.replace("md: '768px'", "md: '800px'"),
  },
  (result) => {
    assertEqual(result.status, 1, 'screen literal drift should fail');
    assertIncludes(result.stderr, 'screens.md', 'screen drift should identify key');
    assertIncludes(result.stderr, 'Expected: 768px', 'screen drift should show expected breakpoint');
  },
);

withFixture(
  {
    tailwindConfig: TAILWIND_CONFIG.replace("md: '768px'", "md: 'var(--breakpoint-md)'"),
  },
  (result) => {
    assertEqual(result.status, 1, 'screens should not use runtime CSS variables');
    assertIncludes(result.stderr, 'media query generation', 'screen CSS var failure should explain media query reason');
  },
);

withFixture(
  {
    tailwindConfig: TAILWIND_CONFIG.replace("fast: 'var(--transition-duration-fast)'", "fast: 'var(--transition-fast)'"),
  },
  (result) => {
    assertEqual(result.status, 1, 'transitionDuration should not use composite transition token');
    assertIncludes(result.stderr, 'transitionDuration.fast', 'transition duration drift should identify key');
    assertIncludes(result.stderr, 'var(--transition-duration-fast)', 'transition duration drift should show duration-only token');
  },
);

withFixture(
  {
    tailwindConfig: TAILWIND_CONFIG.replace("'ease-in-out': 'var(--transition-easing-standard)'", "'ease-in-out': 'linear'"),
  },
  (result) => {
    assertEqual(result.status, 1, 'transition timing function drift should fail');
    assertIncludes(result.stderr, 'transitionTimingFunction.ease-in-out', 'timing drift should identify key');
    assertIncludes(result.stderr, 'var(--transition-easing-standard)', 'timing drift should show expected easing token');
  },
);

  return 'pass, raw literal, wrong token, missing CSS var, shadow prefix, font family, font size, screens, and transition drift checks passed.';
}
