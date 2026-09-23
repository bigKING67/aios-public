#!/usr/bin/env node

/**
 * Design-token static mirror generator.
 *
 * Runtime tokens are authored in apps/web-vite/src/styles/design-tokens.css and mirrored
 * from DESIGN_TOKENS.json to apps/web-vite/src/lib/design-tokens.ts for TypeScript consumers.
 *
 * It must not generate CSS shims, Tailwind config, or Ant Design theme adapters.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '../..');
const tokensPath = path.join(repoRoot, 'DESIGN_TOKENS.json');
const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));

const RUNTIME_COLOR_TOKEN_PATHS = Object.freeze({
  primary: 'color.primary.value',
  success: 'color.success.value',
  warning: 'color.warning.value',
  danger: 'color.error.value',
  info: 'color.info.value',
  statusSuccess: 'color.status.success.value',
  statusSuccessBg: 'color.status.successBg.value',
  statusSuccessBorder: 'color.status.successBorder.value',
  statusWarning: 'color.status.warning.value',
  statusWarningBg: 'color.status.warningBg.value',
  statusWarningBorder: 'color.status.warningBorder.value',
  statusDanger: 'color.status.danger.value',
  statusDangerBg: 'color.status.dangerBg.value',
  statusDangerBorder: 'color.status.dangerBorder.value',
  statusInfo: 'color.status.info.value',
  statusInfoStrong: 'color.status.infoStrong.value',
  statusInfoBg: 'color.status.infoBg.value',
  statusInfoBorder: 'color.status.infoBorder.value',
  statusNeutral: 'color.status.neutral.value',
  trendUp: 'color.trend.up.value',
  trendDown: 'color.trend.down.value',
  trendNeutral: 'color.trend.neutral.value',
  textPrimary: 'color.text.primary.value',
  textSecondary: 'color.text.secondary.value',
  textTertiary: 'color.text.tertiary.value',
  textInverse: 'color.text.inverse.value',
  backgroundPrimary: 'color.background.primary.value',
  backgroundSecondary: 'color.background.secondary.value',
  backgroundTertiary: 'color.background.tertiary.value',
  border: 'color.border.value',
  divider: 'color.divider.value',
});

function resolveTokenPath(tokenPath) {
  return tokenPath.split('.').reduce((value, segment) => value?.[segment], tokens);
}

function runtimeColorValues() {
  return Object.fromEntries(
    Object.entries(RUNTIME_COLOR_TOKEN_PATHS).map(([key, tokenPath]) => {
      const value = resolveTokenPath(tokenPath);
      if (typeof value !== 'string') {
        throw new Error(`[compile-tokens] Missing string token ${tokenPath}.`);
      }
      return [key, value];
    }),
  );
}

function generateTypeScriptMirror() {
  return `
export const designTokens = ${JSON.stringify(tokens, null, 2)} as const;

export const DESIGN_TOKEN_RUNTIME_COLOR_VALUES = ${JSON.stringify(runtimeColorValues(), null, 2)} as const;
export const DESIGN_TOKEN_RUNTIME_FONT_FAMILY = ${JSON.stringify(tokens.typography.fontFamily.base)};
export const DESIGN_TOKEN_RUNTIME_SHADOW_VALUES = ${JSON.stringify(tokens.shadow, null, 2)} as const;

export type DesignTokens = typeof designTokens;
export type ColorToken = keyof typeof designTokens.color;
export type TypographyToken = keyof typeof designTokens.typography;
export type SpacingToken = keyof typeof designTokens.spacing;
export type BorderRadiusToken = keyof typeof designTokens.borderRadius;
export type ShadowToken = keyof typeof designTokens.shadow;

export const useDesignTokens = () => designTokens;
`;
}

const OUTPUTS = Object.freeze([
  {
    filePath: 'apps/web-vite/src/lib/design-tokens.ts',
    generate: generateTypeScriptMirror,
  },
]);

function printUsage() {
  console.log([
    'Usage: node scripts/build/compile-tokens.js [--check|--write]',
    '',
    'Default: --check',
    '',
    'Allowed outputs:',
    ...OUTPUTS.map((output) => `  - ${output.filePath}`),
  ].join('\n'));
}

function parseMode(args) {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const allowedArgs = new Set(['--check', '--write']);
  for (const arg of args) {
    if (!allowedArgs.has(arg)) {
      console.error(`[compile-tokens] Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  if (args.includes('--check') && args.includes('--write')) {
    console.error('[compile-tokens] Use either --check or --write, not both.');
    process.exit(1);
  }

  return args.includes('--write') ? 'write' : 'check';
}

function checkOutputs() {
  const drifted = [];

  for (const output of OUTPUTS) {
    const fullPath = path.join(repoRoot, output.filePath);
    const expected = output.generate();
    const actual = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '<missing>';
    if (actual !== expected) {
      drifted.push(output.filePath);
    }
  }

  if (drifted.length > 0) {
    console.error('[compile-tokens] Generated outputs are out of sync:');
    for (const filePath of drifted) {
      console.error(`- ${filePath}`);
    }
    console.error('\nRun: node scripts/build/compile-tokens.js --write');
    process.exit(1);
  }

  console.log(`[compile-tokens] OK: ${OUTPUTS.length} token mirror output(s) are in sync.`);
}

function writeOutputs() {
  for (const output of OUTPUTS) {
    const fullPath = path.join(repoRoot, output.filePath);
    fs.writeFileSync(fullPath, output.generate());
    console.log(`[compile-tokens] wrote ${output.filePath}`);
  }
}

const mode = parseMode(process.argv.slice(2));
if (mode === 'write') {
  writeOutputs();
} else {
  checkOutputs();
}
