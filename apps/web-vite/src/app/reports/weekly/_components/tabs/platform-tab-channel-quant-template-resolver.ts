import { resolveQuantFactorBucket } from './platform-tab-diagnostics';
import type { QuantAttributionRow, QuantFactorBucket } from './platform-tab-types';

export function buildChannelQuantTemplateResolver(rows: QuantAttributionRow[]) {
  const templateByBucket = new Map<QuantFactorBucket, QuantAttributionRow>();
  for (const row of rows) {
    const bucket = resolveQuantFactorBucket(row);
    if (bucket === 'other') {
      continue;
    }
    if (!templateByBucket.has(bucket)) {
      templateByBucket.set(bucket, row);
    }
  }

  return (bucket: QuantFactorBucket): QuantAttributionRow | undefined =>
    templateByBucket.get(bucket) ??
    (bucket === 'visitor' ? templateByBucket.get('impression') : undefined);
}
