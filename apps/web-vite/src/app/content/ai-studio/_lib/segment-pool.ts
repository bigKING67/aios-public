import type { StudioSegmentPoolCell, StudioSegmentPresetLabel } from './ai-studio-api';

export interface SegmentPoolRow {
  /** null groups confirmed segments without a product; remix never selects them. */
  productName: string | null;
  counts: Record<string, number>;
  total: number;
  missingLabels: string[];
}

/**
 * One row per product (most material first) with a count per preset label.
 * Labels without material are listed in `missingLabels`; the product-less row
 * is always last and never reports missing labels.
 */
export function buildSegmentPoolRows(
  cells: readonly StudioSegmentPoolCell[],
  labels: readonly Pick<StudioSegmentPresetLabel, 'key'>[]
): SegmentPoolRow[] {
  const byProduct = new Map<string | null, Record<string, number>>();
  for (const cell of cells) {
    const key = cell.productName?.trim() || null;
    const counts = byProduct.get(key) ?? {};
    counts[cell.labelKey] = (counts[cell.labelKey] ?? 0) + cell.confirmedCount;
    byProduct.set(key, counts);
  }
  const rows = [...byProduct.entries()].map(([productName, counts]) => ({
    productName,
    counts,
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    missingLabels: productName === null ? [] : labels.map((label) => label.key).filter((key) => !counts[key]),
  }));
  return rows.sort((a, b) => {
    if (a.productName === null) return 1;
    if (b.productName === null) return -1;
    return b.total - a.total || a.productName.localeCompare(b.productName, 'zh-CN');
  });
}

/** Which pool rows a label strip counts: every product, one product, or segments without one. */
export type PoolScope = { kind: 'all' } | { kind: 'product'; productName: string } | { kind: 'withoutProduct' };

/** Confirmed counts per label (and in total) for the scope the label strip is showing. */
export function poolScopeCounts(
  rows: readonly SegmentPoolRow[],
  scope: PoolScope,
): { total: number; counts: Record<string, number> } {
  const included = rows.filter((row) =>
    scope.kind === 'all' ? true : scope.kind === 'withoutProduct' ? row.productName === null : row.productName === scope.productName,
  );
  const counts: Record<string, number> = {};
  for (const row of included) {
    for (const [key, value] of Object.entries(row.counts)) counts[key] = (counts[key] ?? 0) + value;
  }
  return { total: Object.values(counts).reduce((sum, value) => sum + value, 0), counts };
}
