import { useMemo, useState } from 'react';
import { Button, Empty, Popconfirm, Segmented, Select, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { FileSearchOutlined, LinkOutlined } from '@ant-design/icons';
import { fetchContentAssetLookup } from '../_lib/content-assets-api';
import { formatCompactNumber, formatRatio } from '../_lib/content-assets-formatters';
import { contentAssetsQueryKeys } from '../_lib/content-assets-query-keys';
import { contentAssetPlatformLabel } from '../_lib/content-assets-platforms';
import type {
  ContentAssetUnmatchedStatsItem,
  ContentAssetUnmatchedStatsMatchTypeFilter,
  ContentAssetUnmatchedStatsResponse,
} from '../_lib/content-assets-types';
import { UNMATCHED_STATS_TYPE_OPTIONS } from './content-assets-workspace-options';
import type { ModuleMetric } from './content-assets-workspace-types';
import matchingStyles from './content-assets-matching-panel.module.css';
import styles from './content-assets-workspace-panels.module.css';

export function UnmatchedStatsPanel({
  actionLoading,
  assetOptions,
  bindTargetAssetId,
  canWrite,
  data,
  loading,
  matchType,
  onBind,
  onBindTargetAssetChange,
  onMatchTypeChange,
  onOpenAssets,
  onRefresh,
}: {
  actionLoading: boolean;
  assetOptions: Array<{ label: string; value: string; helper: string }>;
  bindTargetAssetId: string | null;
  canWrite: boolean;
  data: ContentAssetUnmatchedStatsResponse | null;
  loading: boolean;
  matchType: ContentAssetUnmatchedStatsMatchTypeFilter;
  onBind: (item: ContentAssetUnmatchedStatsItem) => void;
  onBindTargetAssetChange: (assetId: string | null) => void;
  onMatchTypeChange: (value: ContentAssetUnmatchedStatsMatchTypeFilter) => void;
  onOpenAssets: () => void;
  onRefresh: () => void;
}) {
  const [lookupKeyword, setLookupKeyword] = useState('');
  const normalizedLookupKeyword = lookupKeyword.trim();
  const { data: lookupData, isFetching: lookupFetching } = useQuery({
    queryKey: contentAssetsQueryKeys.lookup(normalizedLookupKeyword),
    queryFn: ({ signal }) => fetchContentAssetLookup({ keyword: normalizedLookupKeyword, limit: 30 }, { signal }),
    staleTime: 60 * 1000,
  });
  const summary = data?.summary;
  const items = data?.items || [];
  const remoteAssetOptions = useMemo(
    () =>
      (lookupData?.items || []).map((item) => ({
        label: item.title,
        value: item.assetId,
        helper: [contentAssetPlatformLabel(item.platform), item.productName, item.creatorName]
          .filter((value) => value && value !== '--')
          .join(' · '),
      })),
    [lookupData]
  );
  const mergedAssetOptions = useMemo(() => {
    const seen = new Set<string>();
    return [...remoteAssetOptions, ...assetOptions].filter((item) => {
      if (seen.has(item.value)) return false;
      seen.add(item.value);
      return true;
    });
  }, [assetOptions, remoteAssetOptions]);
  const selectedAsset = mergedAssetOptions.find((item) => item.value === bindTargetAssetId);
  const metrics: ModuleMetric[] = [
    { label: '未匹配组', value: formatCompactNumber(summary?.totalGroups ?? 0), helper: '按素材 ID / 视频 ID 聚合' },
    { label: '广告素材', value: formatCompactNumber(summary?.adMaterialGroups ?? 0), helper: 'material_id 未绑定' },
    { label: '平台内容', value: formatCompactNumber(summary?.platformVideoGroups ?? 0), helper: 'video / note / item 未绑定' },
    { label: '原始日报行', value: formatCompactNumber(summary?.totalRows ?? 0), helper: summary?.latestStatDate ? `最新 ${summary.latestStatDate}` : '等待回流数据' },
  ];

  return (
    <section className={styles.workspacePanel}>
      <div className={styles.moduleHero}>
        <div className={styles.moduleIcon}><LinkOutlined /></div>
        <div>
          <span>表现数据回流</span>
          <h1>回流匹配</h1>
          <p>处理平台日报里暂时无法匹配到 asset_id 的 material_id / video_id。人工确认一次后，同一 ID 的日粒度数据会回流到素材库。</p>
        </div>
      </div>

      <section className={styles.metricGrid} aria-label="回流匹配指标">
        {metrics.map((metric) => (
          <article className={styles.metricCard} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <p>{metric.helper}</p>
          </article>
        ))}
      </section>

      <section className={styles.matchingWorkbench}>
        <article className={styles.flowCard}>
          <div className={styles.sectionTitle}>
            <LinkOutlined />
            <div>
              <strong>未匹配日报队列</strong>
              <p>{loading ? '正在刷新未匹配队列' : '按外部 ID 聚合展示，避免一条素材多天日报重复处理。'}</p>
            </div>
            <Button size="small" onClick={onRefresh}>
              刷新
            </Button>
          </div>
          <div className={styles.queueToolbar}>
            <Segmented<ContentAssetUnmatchedStatsMatchTypeFilter>
              value={matchType}
              options={UNMATCHED_STATS_TYPE_OPTIONS}
              onChange={onMatchTypeChange}
            />
            <Select
              className={styles.matchingTargetSelect}
              allowClear
              showSearch
              filterOption={false}
              loading={lookupFetching}
              value={bindTargetAssetId || undefined}
              placeholder="选择要绑定的素材"
              optionFilterProp="label"
              options={mergedAssetOptions.map((item) => ({
                value: item.value,
                label: item.helper ? `${item.label} · ${item.helper}` : item.label,
              }))}
              onChange={(value) => onBindTargetAssetChange(value || null)}
              onSearch={setLookupKeyword}
            />
          </div>
          {items.length === 0 ? (
            <div className={styles.jobEmpty}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? '正在加载未匹配日报' : '当前没有未匹配日报'} />
            </div>
          ) : (
            <div className={matchingStyles.matchingList}>
              {items.map((item) => (
                <UnmatchedStatsRow
                  actionLoading={actionLoading}
                  bindTargetAssetId={bindTargetAssetId}
                  canWrite={canWrite}
                  item={item}
                  key={item.identityKey}
                  onBind={onBind}
                />
              ))}
            </div>
          )}
        </article>

        <article className={styles.actionCard}>
          <div className={styles.sectionTitle}>
            <FileSearchOutlined />
            <div>
              <strong>绑定目标素材</strong>
              <p>右侧选择的是当前要承接回流数据的内部 asset_id。</p>
            </div>
          </div>
          <div className={matchingStyles.matchingTargetCard}>
            <span>当前目标</span>
            <strong>{selectedAsset?.label || '未选择素材'}</strong>
            <p>{selectedAsset?.helper || '可以先在顶部搜索框搜索素材，再回到这里选择目标。'}</p>
          </div>
          <div className={styles.actionList}>
            {[
              ['先搜素材标题', '用顶部搜索把候选素材缩小到当前列表'],
              ['确认外部 ID', '核对 material_id / video_id 是否确实属于该视频'],
              ['绑定日报记录', '写入 ads 身份映射并更新 dwd match_status'],
            ].map(([label, helper]) => (
              <button className={styles.actionRow} key={label} type="button" onClick={label === '先搜素材标题' ? onOpenAssets : undefined}>
                <strong>{label}</strong>
                <span>{helper}</span>
              </button>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

function UnmatchedStatsRow({
  actionLoading,
  bindTargetAssetId,
  canWrite,
  item,
  onBind,
}: {
  actionLoading: boolean;
  bindTargetAssetId: string | null;
  canWrite: boolean;
  item: ContentAssetUnmatchedStatsItem;
  onBind: (item: ContentAssetUnmatchedStatsItem) => void;
}) {
  const isAdMaterial = item.matchType === 'ad_material';
  const primaryId = isAdMaterial
    ? item.externalMaterialId
    : item.externalVideoId || item.externalItemId || item.externalNoteId;
  const secondaryId = isAdMaterial
    ? item.externalVideoId
    : [item.externalItemId, item.externalNoteId].filter(Boolean).join(' / ');

  return (
    <article className={matchingStyles.matchingRow}>
      <div className={matchingStyles.matchingRowHeader}>
        <div>
          <strong>{isAdMaterial ? '广告素材' : '平台内容'} · {contentAssetPlatformLabel(item.platform)}</strong>
          <span>{item.accountName || item.accountId || item.advertiserId || '未填账户'}</span>
        </div>
        <Tag color={isAdMaterial ? 'processing' : 'default'}>{isAdMaterial ? 'material_id' : 'video_id'}</Tag>
      </div>
      <div className={matchingStyles.matchingIdGrid}>
        <div>
          <span>{isAdMaterial ? 'Material ID' : '主 ID'}</span>
          <code>{primaryId || '--'}</code>
        </div>
        <div>
          <span>{isAdMaterial ? 'Video ID' : '补充 ID'}</span>
          <code>{secondaryId || '--'}</code>
        </div>
      </div>
      <div className={matchingStyles.matchingMetricGrid}>
        <span>日期 {item.firstStatDate || '--'} 至 {item.lastStatDate || '--'}</span>
        <span>{formatCompactNumber(item.rowCount)} 行</span>
        <span>曝光 {formatCompactNumber(item.impressions || item.plays)}</span>
        <span>互动 {formatCompactNumber(item.interactions)}</span>
        {isAdMaterial ? <span>花费 {item.cost == null ? '--' : formatCompactNumber(item.cost)}</span> : null}
        {isAdMaterial ? <span>ROI {formatRatio(item.roi)}</span> : null}
      </div>
      <div className={matchingStyles.matchingActions}>
        <Popconfirm
          title="确认绑定到选中素材？"
          description="会写入 ads 身份映射，并把匹配到的 dwd 日报行标记为 matched。"
          okText="确认绑定"
          cancelText="取消"
          onConfirm={() => onBind(item)}
        >
          <Button size="small" type="primary" loading={actionLoading} disabled={!canWrite || !bindTargetAssetId}>
            绑定到目标素材
          </Button>
        </Popconfirm>
      </div>
    </article>
  );
}
