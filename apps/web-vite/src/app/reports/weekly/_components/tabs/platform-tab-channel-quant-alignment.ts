import { calcShapleyContributions } from './platform-tab-channel-quant-shapley';
import type { ChannelQuantFactorValue } from './platform-tab-channel-quant-types';

function normalizeFactors(factorValues: ChannelQuantFactorValue[]): {
  prevFactors: number[];
  currFactors: number[];
} {
  return {
    prevFactors: factorValues.map((factor) =>
      Number.isFinite(factor.prevValue) ? Math.max(factor.prevValue, 0) : 0
    ),
    currFactors: factorValues.map((factor) =>
      Number.isFinite(factor.currValue) ? Math.max(factor.currValue, 0) : 0
    ),
  };
}

export function alignChannelQuantShapleyContributions(
  factorValues: ChannelQuantFactorValue[],
  payAmountDelta: number
): number[] {
  const { prevFactors, currFactors } = normalizeFactors(factorValues);
  const shapleyRawContributions = calcShapleyContributions(prevFactors, currFactors);
  const factorModelPrev = prevFactors.reduce((product, factor) => product * factor, 1);
  const factorModelCurr = currFactors.reduce((product, factor) => product * factor, 1);
  const factorModelDelta = factorModelCurr - factorModelPrev;
  const alignScale =
    Math.abs(factorModelDelta) > Number.EPSILON ? payAmountDelta / factorModelDelta : 1;
  const alignedContributions = shapleyRawContributions.map((value) => value * alignScale);

  const contributionSum = alignedContributions.reduce((sum, value) => sum + value, 0);
  const residual = payAmountDelta - contributionSum;
  if (Math.abs(residual) > 1e-6 && alignedContributions.length > 0) {
    const absorbIndex = alignedContributions.length - 1;
    alignedContributions[absorbIndex] += residual;
  }

  return alignedContributions;
}
