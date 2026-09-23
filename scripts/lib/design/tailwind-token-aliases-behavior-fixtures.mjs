import {
  auditTailwindTokenAliases,
  formatTailwindTokenAliasFailure,
  hasTailwindTokenAliasViolations,
} from './tailwind-token-aliases-core.mjs';

const DESIGN_CSS = `
:root {
  --brand-primary: #445df6;
  --brand-secondary: #75b1f8;
  --text-primary: #1a1a1a;
  --bg-card: #ffffff;
}
`;

const TAILWIND_CONFIG = `
import type { Config } from 'tailwindcss';

const config: Config = {
  theme: {
    extend: {
      colors: {
        'brand-primary': 'var(--brand-primary)',
        'brand-secondary': 'var(--brand-secondary)',
        'text-primary': 'var(--text-primary)',
        'bg-card': 'var(--bg-card)',
        transparent: 'transparent',
        current: 'currentColor',
        inherit: 'inherit',
      },
    },
  },
};

export default config;
`;

function runCheck({ css = DESIGN_CSS, tailwindConfig = TAILWIND_CONFIG } = {}) {
  const findings = auditTailwindTokenAliases(tailwindConfig, css);

  if (!hasTailwindTokenAliasViolations(findings)) {
    return {
      status: 0,
      stdout: '[tailwind-token-aliases] OK: tailwind.config.ts color aliases are token-backed and raw-color free.\n',
      stderr: '',
    };
  }

  return {
    status: 1,
    stdout: '',
    stderr: formatTailwindTokenAliasFailure(findings),
  };
}

function withFixture(fixture, assertion) {
  assertion(runCheck(fixture));
}

export function runTailwindTokenAliasesBehaviorFixtures({
  assertEqual,
  assertIncludes,
  assertNotIncludes,
}) {
  withFixture({}, (result) => {
    assertEqual(result.status, 0, 'token-backed Tailwind color aliases should pass');
    assertIncludes(result.stdout, 'color aliases are token-backed and raw-color free', 'pass output should explain policy');
  });

  withFixture(
    {
      tailwindConfig: TAILWIND_CONFIG.replace(
        "'brand-primary': 'var(--brand-primary)'",
        "'brand-primary': '#445df6'",
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'raw hex color alias should fail');
      assertIncludes(result.stderr, 'Raw color literals are forbidden', 'raw color failure should identify raw-color policy');
      assertIncludes(result.stderr, 'tailwind.config.ts:', 'raw color failure should report source location');
      assertIncludes(result.stderr, '#445df6', 'raw color failure should report offending hex');
      assertIncludes(result.stderr, 'brand-primary = "#445df6"', 'raw alias failure should report alias key');
    },
  );

  withFixture(
    {
      tailwindConfig: TAILWIND_CONFIG.replace(
        "'brand-secondary': 'var(--brand-secondary)'",
        "'brand-secondary': 'rgb(68, 93, 246)'",
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'raw rgb color alias should fail');
      assertIncludes(result.stderr, 'rgb(68, 93, 246)', 'raw rgb failure should report offending rgb value');
    },
  );

  withFixture(
    {
      tailwindConfig: TAILWIND_CONFIG.replace(
        "'brand-primary': 'var(--brand-primary)'",
        "'brand-primary': 'var(--brand-primary, #445df6)'",
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'raw fallback color inside var() should fail');
      assertIncludes(result.stderr, '#445df6', 'raw fallback failure should report fallback hex');
    },
  );

  withFixture(
    {
      tailwindConfig: TAILWIND_CONFIG.replace(
        "'brand-primary': 'var(--brand-primary)'",
        "'brand-primary': 'var(--brand-missing)'",
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'undefined CSS variable alias should fail');
      assertIncludes(result.stderr, 'brand-primary = "var(--brand-missing)"', 'missing var failure should report alias key');
      assertIncludes(
        result.stderr,
        '--brand-missing is not defined in apps/web-vite/src/styles/design-tokens.css',
        'missing var failure should identify undefined runtime token',
      );
    },
  );

  withFixture(
    {
      tailwindConfig: TAILWIND_CONFIG.replace(
        "'brand-primary': 'var(--brand-primary)'",
        "'brand-primary': 'theme(colors.blue.500)'",
      ),
    },
    (result) => {
      assertEqual(result.status, 1, 'non-var color alias value should fail');
      assertIncludes(result.stderr, 'brand-primary = "theme(colors.blue.500)"', 'non-var failure should report alias key');
      assertIncludes(
        result.stderr,
        'color alias value must be a runtime CSS variable',
        'non-var failure should explain token-backed requirement',
      );
    },
  );

  withFixture(
    {
      tailwindConfig: `
import type { Config } from 'tailwindcss';

// Historical note: old demos used #445df6 and rgb(68, 93, 246).
/*
  class docs mention #ffffff, rgba(0, 0, 0, 0.12), and hsl(0, 0%, 100%).
*/
const config: Config = {
  theme: {
    extend: {
      colors: {
        'brand-primary': 'var(--brand-primary)',
      },
    },
  },
};

export default config;
`,
    },
    (result) => {
      assertEqual(result.status, 0, 'raw color examples inside comments should not be over-blocked');
      assertNotIncludes(result.stderr, '#445df6', 'line comment raw color should not be reported');
      assertNotIncludes(result.stderr, 'rgba(0, 0, 0, 0.12)', 'block comment raw color should not be reported');
    },
  );

  return 'pass, raw literals, raw fallback, missing CSS var, non-var alias, and comment false-positive checks passed.';
}
