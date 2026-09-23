import { normalizeToken } from './platform-tab-formatters';
import type { QuantFactorBucket } from './platform-tab-types';
import type { QuantFactorIdentity } from './platform-tab-diagnostic-types';

export function resolveQuantFactorBucket(
  row: QuantFactorIdentity
): QuantFactorBucket {
  const factorText = `${normalizeToken(row.factorKey)}${normalizeToken(row.factorLabel)}`;

  if (
    factorText.includes('avgordervalue') ||
    factorText.includes('客单价') ||
    factorText.includes('aov')
  ) {
    return 'avgOrderValue';
  }

  if (
    factorText.includes('clicktocart') ||
    factorText.includes('点击加购') ||
    factorText.includes('addcart') ||
    factorText.includes('cartbuyer')
  ) {
    return 'clickToCart';
  }

  if (
    factorText.includes('carttopay') ||
    factorText.includes('加购转化') ||
    factorText.includes('payconversion') ||
    factorText.includes('paycvr')
  ) {
    return 'cartToPay';
  }

  if (
    factorText.includes('ctr') ||
    factorText.includes('clickrate') ||
    factorText.includes('商品点击率') ||
    factorText.includes('点击率')
  ) {
    return 'clickRate';
  }

  if (
    factorText.includes('visitor') ||
    factorText.includes('访客') ||
    factorText.includes('uv')
  ) {
    return 'visitor';
  }

  if (factorText.includes('impression') || factorText.includes('曝光')) {
    return 'impression';
  }

  return 'other';
}
