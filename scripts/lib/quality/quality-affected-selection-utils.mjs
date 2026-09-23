export function addNames(target, names, reason) {
  for (const name of names) {
    target.set(name, [...new Set([...(target.get(name) ?? []), reason])]);
  }
}

export function sortAffectedReasons(reasons = []) {
  return [...reasons].sort((left, right) => left.localeCompare(right));
}

export function gatesByPredicate(registry, predicate) {
  return registry.gates.filter(predicate).map((gate) => gate.name);
}

export function addRuleEntries(selected, rule) {
  const entries = rule.entries ?? [rule];
  for (const entry of entries) {
    addNames(selected, entry.gates, entry.reason);
  }
}

export function applyRule(selected, rule) {
  addRuleEntries(selected, rule);
  return rule.continueSelection;
}
