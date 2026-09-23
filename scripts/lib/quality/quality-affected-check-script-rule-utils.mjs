import {
  commandTargetFiles,
} from './quality-gate-command-targets.mjs';

export function rule(gates, reason) {
  return Object.freeze({
    gates: Object.freeze(gates),
    reason,
  });
}

export function compoundRule(entries) {
  return Object.freeze({
    entries: Object.freeze(entries.filter(Boolean)),
  });
}

export function gateNamesByCommandTarget(registry, file) {
  return registry.gates
    .filter((gate) => commandTargetFiles(gate.command).includes(file))
    .map((gate) => gate.name);
}

export function directGateTargetRule(registry, file) {
  const gates = gateNamesByCommandTarget(registry, file);
  return gates.length > 0
    ? rule(gates, `${file}: direct gate command target`)
    : null;
}

export function withDirectGateTargets(primaryRule, registry, file) {
  return compoundRule([
    primaryRule,
    directGateTargetRule(registry, file),
  ]);
}
