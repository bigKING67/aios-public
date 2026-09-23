#!/usr/bin/env node

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';
import {
  auditTokenGeneratorBoundary,
  formatTokenGeneratorBoundaryFailure,
} from './token-generator.mjs';

const { assertEqual, assertIncludes, reportOk } = createCheckGuard(
  'compile-tokens-boundary-behavior',
);

const PASS_OUTPUT = '[compile-tokens-boundary] OK: scripts/build/compile-tokens.js is scoped to apps/web-vite/src/lib/design-tokens.ts and CSS/adapter outputs are blocked.\n';

const SAFE_COMPILE_SCRIPT = `#!/usr/bin/env node
const OUTPUTS = Object.freeze([
  { filePath: 'apps/web-vite/src/lib/design-tokens.ts', generate: () => '' },
]);
if (process.argv.includes('--check')) {
  console.log('[compile-tokens] OK: 1 token mirror output(s) are in sync.');
  process.exit(0);
}
if (process.argv.includes('--write')) {
  console.log('[compile-tokens] wrote apps/web-vite/src/lib/design-tokens.ts');
  process.exit(0);
}
console.log('[compile-tokens] OK: 1 token mirror output(s) are in sync.');
`;

const UNSAFE_COMPILE_SCRIPT = `${SAFE_COMPILE_SCRIPT}
function generateTailwindConfig() {}
const unsafe = { filePath: 'tailwind-tokens.config.js' };
`;

const UNSAFE_ANTD_COMPILE_SCRIPT = `${SAFE_COMPILE_SCRIPT}
function generateAntDesignTheme() {}
const unsafe = { filePath: 'apps/web-vite/src/lib/antd-theme.ts' };
`;

const UNSAFE_TOKEN_SHIM_COMPILE_SCRIPT = `${SAFE_COMPILE_SCRIPT}
const unsafe = { filePath: 'apps/web-vite/src/styles/tokens.css' };
`;

const FAILING_CHECK_COMPILE_SCRIPT = `#!/usr/bin/env node
const OUTPUTS = Object.freeze([
  { filePath: 'apps/web-vite/src/lib/design-tokens.ts', generate: () => '' },
]);
if (process.argv.includes('--check')) {
  console.error('[compile-tokens] Generated outputs are out of sync:');
  process.exit(1);
}
`;

function runCheck(options = {}) {
  const {
    compileScript = SAFE_COMPILE_SCRIPT,
    checkResult = compileScript === FAILING_CHECK_COMPILE_SCRIPT
      ? {
          status: 1,
          stdout: '',
          stderr: '[compile-tokens] Generated outputs are out of sync:\n',
        }
      : {
          status: 0,
          stdout: '[compile-tokens] OK: 1 token mirror output(s) are in sync.\n',
          stderr: '',
        },
  } = options;
  const findings = auditTokenGeneratorBoundary({
    checkResult,
    source: compileScript,
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
    stderr: `${formatTokenGeneratorBoundaryFailure(findings)}\n`,
  };
}

function withFixture(options, assertion) {
  assertion(runCheck(options));
}

withFixture({}, (result) => {
  assertEqual(result.status, 0, 'safe compile-tokens boundary should pass');
  assertIncludes(result.stdout, 'CSS/adapter outputs are blocked', 'pass output should describe CSS/adapter output boundary');
});

withFixture(
  { compileScript: UNSAFE_COMPILE_SCRIPT },
  (result) => {
    assertEqual(result.status, 1, 'compile-tokens with Tailwind output should fail');
    assertIncludes(result.stderr, 'generateTailwindConfig', 'forbidden Tailwind generator should be reported');
    assertIncludes(result.stderr, 'tailwind-tokens.config.js', 'disallowed Tailwind output should be reported');
  },
);

withFixture(
  { compileScript: UNSAFE_ANTD_COMPILE_SCRIPT },
  (result) => {
    assertEqual(result.status, 1, 'compile-tokens with AntD output should fail');
    assertIncludes(result.stderr, 'generateAntDesignTheme', 'forbidden AntD generator should be reported');
    assertIncludes(result.stderr, 'apps/web-vite/src/lib/antd-theme.ts', 'disallowed AntD output should be reported');
  },
);

withFixture(
  { compileScript: UNSAFE_TOKEN_SHIM_COMPILE_SCRIPT },
  (result) => {
    assertEqual(result.status, 1, 'compile-tokens with removed token shim output should fail');
    assertIncludes(result.stderr, 'apps/web-vite/src/styles/tokens.css', 'removed token shim output should be reported');
  },
);

withFixture(
  { compileScript: FAILING_CHECK_COMPILE_SCRIPT },
  (result) => {
    assertEqual(result.status, 1, 'compile-tokens --check failure should fail boundary guard');
    assertIncludes(result.stderr, '--check failed', 'check failure should be reported');
  },
);

reportOk('pass, forbidden outputs, and check failure checks passed.');
