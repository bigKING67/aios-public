import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  QUALITY_RUNNER_AGGREGATE_GATE_NAME,
  QUALITY_RUNNER_BEHAVIOR_COMMAND,
  QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS,
} from './quality-runner-slices.mjs';
import {
  QUALITY_ENTRYPOINT_SCRIPTS,
  VIRTUAL_QUALITY_PACKAGE_SCRIPTS,
} from './quality-gate-registry-metadata.mjs';
import {
  readPackageJson,
} from './quality-gate-registry-scripts.mjs';
import {
  validateGateArtifactOutputs,
} from './quality-cache.mjs';
import {
  commandTargetFiles,
} from './quality-gate-command-targets.mjs';

export function validateQualityGateRegistry(registry, options = {}) {
  const { repoRoot = process.cwd(), packageJson } = options;
  const packageScripts = packageJson?.scripts ?? readPackageJson(repoRoot).scripts ?? {};
  const scripts = {
    ...packageScripts,
    ...VIRTUAL_QUALITY_PACKAGE_SCRIPTS,
  };
  const findings = [];
  const seen = new Set();

  for (const gate of registry.gates) {
    if (seen.has(gate.name)) {
      findings.push(`duplicate quality gate: ${gate.name}`);
    }
    seen.add(gate.name);
    if (!gate.command) {
      findings.push(`${gate.name} is missing an executable command`);
    }
    for (const envKey of gate.envKeys ?? []) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(envKey)) {
        findings.push(`${gate.name} has invalid env key for cache identity: ${envKey}`);
      }
    }
    for (const depName of gate.deps) {
      if (!registry.byName.has(depName)) {
        findings.push(`${gate.name} depends on missing gate ${depName}`);
      }
    }
    if ((gate.outputs ?? []).length > 0 && !gate.cacheable) {
      findings.push(`${gate.name} declares outputs but is not cacheable`);
    }
    const outputValidation = validateGateArtifactOutputs(gate);
    for (const error of outputValidation.errors) {
      findings.push(error);
    }
    for (const targetFile of commandTargetFiles(gate.command)) {
      if (!existsSync(path.join(repoRoot, targetFile))) {
        findings.push(`${gate.name} command references missing file: ${targetFile}`);
      }
    }
  }

  for (const [scriptName, expectedCommand] of Object.entries(QUALITY_ENTRYPOINT_SCRIPTS)) {
    if (scripts[scriptName] !== expectedCommand) {
      findings.push(`${scriptName} package script drifted; expected ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(scripts[scriptName])}`);
    }
  }

  if (scripts[QUALITY_RUNNER_AGGREGATE_GATE_NAME] !== QUALITY_RUNNER_BEHAVIOR_COMMAND) {
    findings.push(`${QUALITY_RUNNER_AGGREGATE_GATE_NAME} package script drifted; expected ${JSON.stringify(QUALITY_RUNNER_BEHAVIOR_COMMAND)}`);
  }
  for (const [scriptName, expectedCommand] of Object.entries(QUALITY_RUNNER_SLICE_PACKAGE_SCRIPTS)) {
    const packageCommand = packageScripts[scriptName];
    if (Object.hasOwn(VIRTUAL_QUALITY_PACKAGE_SCRIPTS, scriptName)) {
      if (packageCommand !== undefined && packageCommand !== expectedCommand) {
        findings.push(`${scriptName} package script drifted; expected ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(packageCommand)}`);
      }
      continue;
    }
    if (packageCommand !== expectedCommand) {
      findings.push(`${scriptName} package script drifted; expected ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(packageCommand)}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(gateName) {
    if (visited.has(gateName)) {
      return;
    }
    if (visiting.has(gateName)) {
      const cycleStart = stack.indexOf(gateName);
      const cycle = [...stack.slice(Math.max(0, cycleStart)), gateName];
      findings.push(`quality gate dependency cycle: ${cycle.join(' -> ')}`);
      return;
    }

    visiting.add(gateName);
    stack.push(gateName);
    const gate = registry.byName.get(gateName);
    for (const depName of gate?.deps ?? []) {
      if (registry.byName.has(depName)) {
        visit(depName);
      }
    }
    stack.pop();
    visiting.delete(gateName);
    visited.add(gateName);
  }

  for (const gate of registry.gates) {
    visit(gate.name);
  }

  return findings;
}
