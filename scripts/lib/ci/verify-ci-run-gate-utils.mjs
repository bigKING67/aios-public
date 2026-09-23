export function gate(name, label) {
  return { name, label };
}

export function makeGateFinder(gates, sourceName) {
  const gatesByName = new Map();

  for (const gateConfig of gates) {
    if (gatesByName.has(gateConfig.name)) {
      throw new Error(`${sourceName} contains duplicate gate: ${gateConfig.name}`);
    }
    gatesByName.set(gateConfig.name, gateConfig);
  }

  return function findGate(name) {
    const gateConfig = gatesByName.get(name);
    if (!gateConfig) {
      throw new Error(`${sourceName} is missing gate: ${name}`);
    }
    return gateConfig;
  };
}
