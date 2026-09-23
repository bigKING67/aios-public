function resolveExplicitFunnelMetric(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

export function resolveFunnelRate(
  explicitValue: unknown,
  numerator: number,
  denominator: number,
): number | undefined {
  const explicitMetric = resolveExplicitFunnelMetric(explicitValue);
  if (explicitMetric !== undefined) {
    return explicitMetric;
  }

  return denominator > 0 ? numerator / denominator : undefined;
}

export function resolveFunnelCtr(
  explicitValue: unknown,
  clickCount: number,
  impressionCount: number,
): number | undefined {
  return resolveFunnelRate(explicitValue, clickCount, impressionCount);
}

export function resolveFunnelClickToCartRate(
  explicitValue: unknown,
  cartCount: number,
  clickBase: number,
): number | undefined {
  return resolveFunnelRate(explicitValue, cartCount, clickBase);
}

export function resolveFunnelCartToPayRate(
  explicitValue: unknown,
  payBuyerCount: number,
  cartCount: number,
): number | undefined {
  return resolveFunnelRate(explicitValue, payBuyerCount, cartCount);
}

export function resolveFunnelRoi(
  explicitValue: unknown,
  payAmount: number,
  cost: number,
): number | undefined {
  return resolveFunnelRate(explicitValue, payAmount, cost);
}
