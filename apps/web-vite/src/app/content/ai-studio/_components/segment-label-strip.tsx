import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Select, Skeleton } from 'antd';
import { useMemo } from 'react';
import { aiStudioQueryKeys, fetchStudioSegmentPool, type StudioSegmentPreset } from '../_lib/ai-studio-api';
import { buildSegmentPoolRows, poolScopeCounts, type PoolScope } from '../_lib/segment-pool';
import styles from './segment-library.module.css';

/** Product select value for segments without a product. */
const WITHOUT_PRODUCT = '__without_product__';

interface SegmentLabelStripProps {
  preset: StudioSegmentPreset;
  scope: PoolScope;
  labelKey: string;
  onScopeChange: (scope: PoolScope) => void;
  onLabelChange: (labelKey: string) => void;
}

/**
 * Product picker plus one chip per framework label. Each chip is both the label
 * filter and the usable (confirmed) count for the chosen product, so a gap for
 * 框架混剪 shows as a 待补 chip instead of a separate overview table.
 */
export function SegmentLabelStrip({ preset, scope, labelKey, onScopeChange, onLabelChange }: SegmentLabelStripProps) {
  const poolQuery = useQuery({
    queryKey: aiStudioQueryKeys.segmentPool(preset.presetKey, preset.version),
    queryFn: ({ signal }) => fetchStudioSegmentPool(preset.presetKey, preset.version, { signal }),
  });
  const rows = useMemo(() => buildSegmentPoolRows(poolQuery.data?.items ?? [], preset.labels), [poolQuery.data, preset.labels]);
  const { total, counts } = poolScopeCounts(rows, scope);
  const products = rows.filter((row) => row.productName !== null).map((row) => row.productName as string);
  if (scope.kind === 'product' && !products.includes(scope.productName)) products.push(scope.productName);
  const productValue = scope.kind === 'all' ? '' : scope.kind === 'withoutProduct' ? WITHOUT_PRODUCT : scope.productName;
  const chips = [{ key: '', name: '全部', count: total }, ...preset.labels.map((label) => ({ key: label.key, name: label.name, count: counts[label.key] ?? 0 }))];

  return (
    <div className={styles.labelStrip}>
      <div className={styles.stripHead}>
        <Select
          aria-label="产品"
          className={styles.stripProduct}
          showSearch
          value={productValue}
          options={[
            { value: '', label: '全部产品' },
            ...products.map((name) => ({ value: name, label: name })),
            { value: WITHOUT_PRODUCT, label: '缺产品的片段' },
          ]}
          onChange={(value: string) =>
            onScopeChange(value === '' ? { kind: 'all' } : value === WITHOUT_PRODUCT ? { kind: 'withoutProduct' } : { kind: 'product', productName: value })
          }
        />
        <span className={styles.stripNote}>数字为可用于混剪的已确认片段</span>
      </div>
      {poolQuery.isPending ? <Skeleton.Button active block className={styles.stripSkeleton} /> : null}
      {poolQuery.isError ? (
        <Alert type="error" showIcon title="片段数量读取失败" action={<Button size="small" onClick={() => void poolQuery.refetch()}>重试</Button>} />
      ) : null}
      {poolQuery.isSuccess ? (
        <div className={styles.chips} role="group" aria-label="框架标签">
          {chips.map((chip) => {
            const active = chip.key === labelKey;
            const gap = chip.key !== '' && chip.count === 0 && scope.kind !== 'withoutProduct';
            return (
              <button
                key={chip.key || 'all'}
                type="button"
                className={`${styles.chip} ${active ? styles.chipActive : ''} ${gap && !active ? styles.chipGap : ''}`}
                aria-pressed={active}
                aria-label={`${chip.name}：${chip.count} 条${gap ? '，待补片段' : ''}`}
                onClick={() => onLabelChange(chip.key)}
              >
                <span className={styles.chipName}>{chip.name}</span>
                <span className={styles.chipCount}>{gap ? '待补' : chip.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
