import { Alert, Button, SkeletonText } from '@lobehub/ui';
import { useQuery } from '@tanstack/react-query';
import {
  fetchStructurePool,
  STRUCTURE_POOL_PRODUCT,
  structurePoolQueryKey,
  structurePoolToday,
  type StudioStructurePoolResponse,
  type StudioStructurePoolRow,
} from '../_lib/structure-pool-api';
import { RefreshButton } from './refresh-button';
import pageStyles from '../ai-studio.module.css';
import styles from './structure-pool-preview.module.css';

const SOURCE_LABELS: Record<string, string> = {
  competitor: '竞品',
  ours: '我方',
  both: '竞品 + 我方',
};

function formatCount(value: number): string {
  return value >= Number.MAX_SAFE_INTEGER ? '极多' : value.toLocaleString('zh-CN');
}

function formatShare(value: number): string {
  const percentage = Math.max(0, value) * 100;
  return `${Number(percentage.toFixed(percentage >= 10 ? 0 : 1))}%`;
}

function rangeText(pool: StudioStructurePoolResponse): string | null {
  if (!pool.windowFrom || !pool.windowTo) return null;
  return `${pool.windowFrom.replace(/-/g, '/')} - ${pool.windowTo.replace(/-/g, '/')}`;
}

function shortfallReasons(rows: readonly StudioStructurePoolRow[]): string {
  return [...new Set(rows.map((row) => row.reason?.trim()).filter((reason): reason is string => Boolean(reason)))].join('；');
}

function PoolTable({ rows }: { rows: readonly StudioStructurePoolRow[] }) {
  if (rows.length === 0) return <p className={styles.empty}>当前统计窗口还没有可展示的结构。</p>;
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table} aria-label="今日结构池结构分配">
        <thead>
          <tr>
            <th scope="col">结构</th>
            <th scope="col">来源</th>
            <th scope="col">份额</th>
            <th scope="col">计划</th>
            <th scope="col">可用组合</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.labels.join('-')}-${index}`}>
              <td>
                <span className={styles.structure}>{(row.labelNames.length > 0 ? row.labelNames : row.labels).join(' → ')}</span>
                {row.reason ? <span className={styles.reason}>{row.reason}</span> : null}
              </td>
              <td>{SOURCE_LABELS[row.source] ?? row.source}</td>
              <td className={styles.number}>{formatShare(row.share)}</td>
              <td className={styles.number}>{row.plannedCount} 条</td>
              <td className={styles.number}>
                {row.availableIsLowerBound ? '≥ ' : ''}{formatCount(row.availableCombinations)}
                {row.availableIsLowerBound ? <span className={styles.lowerBound}>抽样下限</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Daily structure allocation preview; it never creates a remix batch. */
export function StructurePoolPreview({ productName }: { productName: string | null }) {
  const date = structurePoolToday();
  const applies = productName === STRUCTURE_POOL_PRODUCT;
  const pool = useQuery({
    queryKey: structurePoolQueryKey(date),
    queryFn: ({ signal }) => fetchStructurePool(date, { signal }),
    enabled: applies,
    staleTime: 60_000,
    retry: false,
  });
  const data = pool.data;
  const pending = data?.pending || data?.status === 'pending';
  const reasons = data ? shortfallReasons(data.rows) : '';
  const window = data ? rangeText(data) : null;

  return (
    <article className={pageStyles.card} aria-labelledby="structure-pool-title">
      <div className={styles.heading}>
        <div className={styles.headingCopy}>
          <h2 id="structure-pool-title">今日结构池</h2>
          <p>{STRUCTURE_POOL_PRODUCT}的结构分配预览，不会自动创建批次。</p>
        </div>
        {applies ? <RefreshButton onRefresh={() => void pool.refetch()} loading={pool.isFetching} /> : null}
      </div>

      {!productName ? (
        <Alert type="info" showIcon title={`选择${STRUCTURE_POOL_PRODUCT}后查看今日结构池。`} />
      ) : !applies ? (
        <Alert
          type="info"
          showIcon
          title={`今日结构池仅用于${STRUCTURE_POOL_PRODUCT}`}
          description={`当前选择的是${productName}，不会套用这份结构计划。`}
        />
      ) : pool.isPending ? (
        <div aria-busy="true"><SkeletonText rows={4} /></div>
      ) : pool.isError ? (
        <Alert
          type="error"
          showIcon
          title="今日结构池读取失败"
          description={pool.error instanceof Error ? pool.error.message : '请求失败，请稍后重试。'}
          action={<Button onClick={() => void pool.refetch()}>重试</Button>}
        />
      ) : data ? (
        <>
          <div className={styles.meta}>
            <span>{data.productName}</span>
            <span>计划日期 {data.date}</span>
            {data.asOf ? <span>统计截至 {data.asOf}</span> : null}
            {window ? <span>统计窗口 {window}</span> : null}
          </div>
          {data.status === 'previous_window' ? (
            <Alert type="info" showIcon title="沿用前一天统计窗口，素材可用量实时核验" />
          ) : null}
          {pending ? <Alert type="info" showIcon title="结构统计正在计算" description="新窗口统计完成后请刷新查看。" /> : null}
          {data.status === 'pending' ? null : data.status === 'no_spend_data' ? (
            <Alert type="warning" showIcon title="暂无我方消耗数据" description="当前无法计算结构池计划，待消耗数据同步后再查看。" />
          ) : (
            <>
              <div className={styles.summary}>
                <strong>{data.plannedCount} / {data.requestedCount} 条</strong>
                <span>今日计划</span>
              </div>
              {data.shortfall > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  title={`计划少出 ${data.shortfall} 条`}
                  description={reasons || '可用组合不足，实际计划少于目标数量。'}
                />
              ) : null}
              <PoolTable rows={data.rows} />
            </>
          )}
        </>
      ) : null}
    </article>
  );
}
