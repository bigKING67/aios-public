export function buildExecutionGraph(gates) {
  const selectedByName = new Map(gates.map((gate) => [gate.name, gate]));
  const pendingDeps = new Map();
  const dependents = new Map();

  for (const gate of gates) {
    const deps = (gate.deps ?? []).filter((depName) => selectedByName.has(depName));
    pendingDeps.set(gate.name, new Set(deps));
    for (const depName of deps) {
      const list = dependents.get(depName) ?? [];
      list.push(gate.name);
      dependents.set(depName, list);
    }
  }

  return { pendingDeps, dependents, selectedByName };
}

export function blockedByFailedDependency(gateName, context) {
  const { dependents, failed, pendingDeps, selectedByName } = context;
  const queue = [...(dependents.get(gateName) ?? [])];
  const blocked = [];
  const seen = new Set();

  while (queue.length > 0) {
    const currentName = queue.shift();
    if (seen.has(currentName)) {
      continue;
    }
    seen.add(currentName);

    if (failed.has(currentName)) {
      continue;
    }

    const deps = pendingDeps.get(currentName);
    if (!deps || deps.size === 0) {
      continue;
    }
    failed.add(currentName);
    blocked.push({
      cacheHit: false,
      command: selectedByName.get(currentName)?.command ?? '',
      durationMs: 0,
      exitCode: 1,
      gate: selectedByName.get(currentName),
      skipped: true,
      status: 'fail',
      stdout: '',
      stderr: `Skipped because dependency failed: ${[...deps].join(', ')}`,
    });

    for (const dependentName of dependents.get(currentName) ?? []) {
      queue.push(dependentName);
    }
  }

  return blocked.filter((item) => item.gate);
}

export function sortReadyGates(ready, selectedByName) {
  const costRank = { cheap: 0, medium: 1, expensive: 2 };
  return [...ready].sort((left, right) => {
    const leftGate = selectedByName.get(left);
    const rightGate = selectedByName.get(right);
    return (costRank[leftGate?.cost] ?? 1) - (costRank[rightGate?.cost] ?? 1)
      || left.localeCompare(right);
  });
}

export function hasExclusiveRunning(running, selectedByName) {
  return [...running].some((gateName) => selectedByName.get(gateName)?.parallel === false);
}
