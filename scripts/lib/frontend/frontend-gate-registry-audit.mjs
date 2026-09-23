import {
  assertGateRunOrder,
  requireVerifyCiRunWithAdjacentLabel,
} from '../shared/guard-utils.mjs';

export function auditFrontendGateRegistry({
  expectedGates,
  fileExists,
  packageScripts,
  verifyCiSource,
}) {
  const verifyCiLines = verifyCiSource.split('\n');
  const findings = [];
  const runLineByGate = new Map();

  for (const gate of expectedGates) {
    if (packageScripts[gate.name] !== gate.command) {
      findings.push(
        `${gate.name} package script drifted; expected ${JSON.stringify(gate.command)}, got ${JSON.stringify(packageScripts[gate.name])}`,
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
    if (runLineNumber === null) {
      continue;
    }

    runLineByGate.set(gate.name, runLineNumber);
  }

  assertGateRunOrder(expectedGates, runLineByGate, findings);
  return findings;
}
