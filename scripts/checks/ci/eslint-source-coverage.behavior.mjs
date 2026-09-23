#!/usr/bin/env node

import { ESLint } from 'eslint';

import { createCheckGuard } from '../../lib/shared/guard-utils.mjs';

const {
  assert,
  reportOk,
} = createCheckGuard('eslint-source-coverage-behavior');

const probeSource = `
import { useEffect } from 'react';

export function EslintSourceCoverageProbe({ enabled }: { enabled: boolean }) {
  if (enabled) {
    useEffect(() => {}, []);
  }
  return null;
}
`;

async function runEslintSourceCoverageProbe() {
  const eslint = new ESLint({
    cache: false,
    cwd: process.cwd(),
  });
  const [result] = await eslint.lintText(probeSource, {
    filePath: 'apps/web-vite/src/__eslint_source_coverage_probe__.tsx',
  });

  assert(result, 'frontend TypeScript probe should produce an ESLint result');
  assert(
    !result.messages.some((message) => message.message.includes('ignored')),
    'frontend TypeScript probe should not be ignored',
  );

  const ruleIds = new Set(result.messages.map((message) => message.ruleId));
  assert(
    ruleIds.has('react-hooks/rules-of-hooks'),
    'react-hooks/rules-of-hooks should reject the conditional hook probe',
  );
}

await runEslintSourceCoverageProbe();
reportOk('frontend TSX is parsed and React Hooks rules are executable.');
