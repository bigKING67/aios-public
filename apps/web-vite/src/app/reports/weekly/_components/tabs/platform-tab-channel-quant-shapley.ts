export function calcShapleyContributions(
  prevFactors: number[],
  currFactors: number[]
): number[] {
  const factorCount = prevFactors.length;
  if (factorCount === 0) {
    return [];
  }

  const indexes = Array.from({ length: factorCount }, (_, index) => index);
  const permutations: number[][] = [];

  const buildPermutation = (path: number[], remaining: number[]): void => {
    if (remaining.length === 0) {
      permutations.push(path);
      return;
    }
    for (let i = 0; i < remaining.length; i += 1) {
      const next = remaining[i];
      const nextRemaining = [...remaining.slice(0, i), ...remaining.slice(i + 1)];
      buildPermutation([...path, next], nextRemaining);
    }
  };

  buildPermutation([], indexes);

  const calcProductValue = (factors: number[]): number =>
    factors.reduce((product, factor) => product * Math.max(factor, 0), 1);

  const contributions = new Array<number>(factorCount).fill(0);
  for (const permutation of permutations) {
    const state = [...prevFactors];
    let previousValue = calcProductValue(state);

    for (const factorIndex of permutation) {
      state[factorIndex] = currFactors[factorIndex];
      const nextValue = calcProductValue(state);
      contributions[factorIndex] += nextValue - previousValue;
      previousValue = nextValue;
    }
  }

  const permutationCount = permutations.length || 1;
  return contributions.map((value) => value / permutationCount);
}
