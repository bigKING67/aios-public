#!/usr/bin/env node

/**
 * Weekly tabs boundary gate registry audit.
 *
 * Boundary gates only work if they stay wired into package scripts and
 * verify:ci. This registry protects the guardrail surface itself from drift.
 */

import {
  assertGateRunOrder,
  assertRequiredFile,
  createCheckGuard as createWeeklyGuard,
  getRepoRoot,
  readRequiredPackageJson,
  readRequiredFile,
  repoFileExists,
  requireVerifyCiRunWithAdjacentLabel,
} from '../../lib/shared/guard-utils.mjs';
import { WEEKLY_BOUNDARY_EXPECTED_GATES } from '../../lib/weekly/weekly-boundary-gates.mjs';

const GUARD_NAME = 'weekly-tabs-boundary-gate-registry';
const EXPECTED_GATES = WEEKLY_BOUNDARY_EXPECTED_GATES;

const { fail, reportOk } = createWeeklyGuard(GUARD_NAME);

export function auditWeeklyBoundaryGateRegistry({
  expectedGates = EXPECTED_GATES,
  fileExists = (file) => repoFileExists(process.cwd(), file),
  scripts,
  verifyCiSource,
}) {
  const verifyCiLines = verifyCiSource.split('\n');
  const findings = [];
  const verifyCiRunLineByGate = new Map();

  for (const gate of expectedGates) {
    if (scripts[gate.name] !== gate.command) {
      findings.push(
        `${gate.name} package script drifted; expected ${JSON.stringify(gate.command)}, got ${JSON.stringify(scripts[gate.name])}`,
      );
    }

    if (!fileExists(gate.file)) {
      findings.push(`${gate.name} target file is missing: ${gate.file}`);
    }

    const runLineNumber = requireVerifyCiRunWithAdjacentLabel(
      gate,
      verifyCiSource,
      verifyCiLines,
      findings,
    );
    if (runLineNumber !== null) {
      verifyCiRunLineByGate.set(gate.name, runLineNumber);
    }
  }

  assertGateRunOrder(expectedGates, verifyCiRunLineByGate, findings);

  return findings;
}

export function formatWeeklyBoundaryGateRegistryFailure(findings) {
  return [
    `[${GUARD_NAME}] Weekly boundary gate registry drift was detected:`,
    ...findings.map((finding) => `- ${finding}`),
    '',
    'Keep every weekly boundary gate registered in package.json and scripts/verify-ci.sh in the canonical order.',
  ].join('\n');
}

function main() {
  const repoRoot = getRepoRoot();
  assertRequiredFile(repoRoot, 'scripts/verify-ci.sh', fail, {
    missingMessage: 'scripts/verify-ci.sh not found.',
  });

  const packageJson = readRequiredPackageJson(repoRoot, fail);
  const scripts = packageJson.scripts ?? {};
  const verifyCiSource = readRequiredFile(repoRoot, 'scripts/verify-ci.sh', fail);
  const findings = auditWeeklyBoundaryGateRegistry({
    fileExists: (file) => repoFileExists(repoRoot, file),
    scripts,
    verifyCiSource,
  });

  if (findings.length > 0) {
    console.error(formatWeeklyBoundaryGateRegistryFailure(findings));
    process.exit(1);
  }

  reportOk(`${EXPECTED_GATES.length} weekly boundary gates are registered and wired into verify:ci.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
