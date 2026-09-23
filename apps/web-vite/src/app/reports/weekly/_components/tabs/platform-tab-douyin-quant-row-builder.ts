import {
  calcChangePercent,
  computeShapleyContributionByPath,
} from './platform-tab-formatters';
import type { ReasonAction } from './platform-tab-douyin-diagnostics';
import type { QuantAttributionRow } from './platform-tab-types';

type DouyinQuantReasonActionResolver = (
  factorKey: string,
  contribution: number
) => ReasonAction;

export interface DouyinQuantFactorDefinition {
  factorKey: string;
  factorLabel: string;
  currValue: number;
  prevValue: number;
}

function rankQuantRows(rows: QuantAttributionRow[]): QuantAttributionRow[] {
  return rows
    .sort((left, right) => Math.abs(right.lnContribution) - Math.abs(left.lnContribution))
    .map((row, index) => ({ ...row, priority: `P${index + 1}` }));
}

export function buildDouyinQuantRowsFromFactors(
  factors: DouyinQuantFactorDefinition[],
  resolveReasonAction: DouyinQuantReasonActionResolver
): QuantAttributionRow[] {
  const currFactors = factors.map((factor) => factor.currValue);
  const prevFactors = factors.map((factor) => factor.prevValue);
  const contributions = computeShapleyContributionByPath(currFactors, prevFactors);
  const totalContribution = contributions.reduce((sum, value) => sum + value, 0);
  const rows = factors.map((factor, index) => {
    const contributionValue = contributions[index] ?? 0;
    const reasonAction = resolveReasonAction(factor.factorKey, contributionValue);
    const contributionRate =
      Math.abs(totalContribution) > Number.EPSILON
        ? (contributionValue / totalContribution) * 100
        : 0;

    return {
      rowId: `${factor.factorKey}-${index}`,
      factorKey: factor.factorKey,
      factorLabel: factor.factorLabel,
      currValue: factor.currValue,
      prevValue: factor.prevValue,
      changeRate: calcChangePercent(factor.currValue, factor.prevValue),
      lnContribution: contributionValue,
      contributionRate,
      effect: contributionValue >= 0 ? '拉动' : '拖累',
      reason: reasonAction.reason,
      action: reasonAction.action,
      priority: `P${index + 1}`,
    } satisfies QuantAttributionRow;
  });

  return rankQuantRows(rows);
}
