function permutations(input: number[]): number[][] {
  if (input.length <= 1) {
    return [input];
  }

  const result: number[][] = [];
  for (let index = 0; index < input.length; index += 1) {
    const head = input[index];
    const rest = [...input.slice(0, index), ...input.slice(index + 1)];
    for (const tail of permutations(rest)) {
      result.push([head, ...tail]);
    }
  }
  return result;
}

export function computeShapleyContributionByPath(
  currFactors: number[],
  prevFactors: number[]
): number[] {
  const dimension = currFactors.length;
  if (dimension === 0 || prevFactors.length !== dimension) {
    return [];
  }

  const indexList = Array.from({ length: dimension }, (_, index) => index);
  const allPermutations = permutations(indexList);
  const contributionAccumulator = Array.from({ length: dimension }, () => 0);
  const clampFactor = (value: number) => (Number.isFinite(value) ? Math.max(value, 0) : 0);
  const calcProduct = (values: number[]) =>
    values.reduce((product, value) => product * clampFactor(value), 1);

  for (const path of allPermutations) {
    const state = prevFactors.map(clampFactor);
    let previousValue = calcProduct(state);

    for (const factorIndex of path) {
      state[factorIndex] = clampFactor(currFactors[factorIndex]);
      const currentValue = calcProduct(state);
      contributionAccumulator[factorIndex] += currentValue - previousValue;
      previousValue = currentValue;
    }
  }

  const denominator = allPermutations.length || 1;
  return contributionAccumulator.map((value) => value / denominator);
}
