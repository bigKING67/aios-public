#!/usr/bin/env node

/**
 * Guards the compile-tokens generator boundary.
 *
 * compile-tokens.js must stay scoped to the static TypeScript token mirror.
 * It must not reintroduce CSS shims, Tailwind outputs, or Ant Design outputs.
 */

import { spawnSync } from 'node:child_process';

import {
  createCheckGuard,
  getRepoRoot,
  readRequiredFile,
} from '../../lib/shared/guard-utils.mjs';

const SCRIPT_PATH = 'scripts/build/compile-tokens.js';
const ALLOWED_OUTPUTS = Object.freeze([
  'apps/web-vite/src/lib/design-tokens.ts',
]);
const FORBIDDEN_OUTPUTS = Object.freeze([
  'apps/web-vite/src/styles/tokens.css',
  'tailwind-tokens.config.js',
  'tailwind.config.ts',
  'apps/web-vite/src/lib/antd-theme.ts',
  'apps/web-vite/src/theme/ant-theme.ts',
  'apps/web-vite/src/styles/design-tokens.css',
]);
const FORBIDDEN_SOURCE_SNIPPETS = Object.freeze([
  'generateTailwindConfig',
  'generateAntDesignTheme',
  'Update tailwind.config',
  'require("./tailwind-tokens.config.js")',
]);
const { fail, reportOk } = createCheckGuard('compile-tokens-boundary', { errorPrefix: '' });

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function extractAllowedOutputDeclarations(source) {
  const targets = [];
  const outputPattern = /\bfilePath\s*:\s*(['"])([^'"]+)\1/g;
  for (const match of source.matchAll(outputPattern)) {
    targets.push(normalizePath(match[2]));
  }
  return targets;
}

export function auditTokenGeneratorBoundary({
  checkResult,
  source,
}) {
  const findings = [];

  for (const snippet of FORBIDDEN_SOURCE_SNIPPETS) {
    if (source.includes(snippet)) {
      findings.push(`${SCRIPT_PATH} still contains forbidden legacy generator snippet: ${snippet}`);
    }
  }

  const writeTargets = extractAllowedOutputDeclarations(source);
  for (const target of writeTargets) {
    if (!ALLOWED_OUTPUTS.includes(target)) {
      findings.push(`${SCRIPT_PATH} writes disallowed output: ${target}`);
    }
  }
  for (const expectedOutput of ALLOWED_OUTPUTS) {
    if (!writeTargets.includes(expectedOutput)) {
      findings.push(`${SCRIPT_PATH} no longer writes allowed output: ${expectedOutput}`);
    }
  }
  for (const forbiddenOutput of FORBIDDEN_OUTPUTS) {
    if (writeTargets.includes(forbiddenOutput)) {
      findings.push(`${SCRIPT_PATH} must not write ${forbiddenOutput}`);
    }
  }

  if (checkResult.status !== 0) {
    findings.push(`${SCRIPT_PATH} --check failed:\n${checkResult.stdout}${checkResult.stderr}`);
  }

  return findings;
}

export function formatTokenGeneratorBoundaryFailure(findings) {
  return [
    '[compile-tokens-boundary] Token generator boundary drift was detected:',
    ...findings.map((finding) => `- ${finding}`),
  ].join('\n');
}

function main() {
  const repoRoot = getRepoRoot();
  const source = readRequiredFile(repoRoot, SCRIPT_PATH, fail);
  const checkResult = spawnSync(process.execPath, [SCRIPT_PATH, '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const findings = auditTokenGeneratorBoundary({
    checkResult,
    source,
  });

  if (findings.length > 0) {
    console.error(formatTokenGeneratorBoundaryFailure(findings));
    process.exit(1);
  }

  reportOk(`${SCRIPT_PATH} is scoped to ${ALLOWED_OUTPUTS.join(', ')} and CSS/adapter outputs are blocked.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
