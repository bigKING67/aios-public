import { FileImageOutlined, SearchOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Button, Input, Select, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { fetchContentAssets } from '@/app/marketing/content-assets/_lib/content-assets-api';
import { resolveContentAssetDisplayTitle, resolveContentAssetProductText } from '@/app/marketing/content-assets/_lib/content-assets-display';
import { formatDuration } from '@/app/marketing/content-assets/_lib/content-assets-formatters';
import { contentAssetsQueryKeys } from '@/app/marketing/content-assets/_lib/content-assets-query-keys';
import { useMediaQuery } from '@/hooks/use-media-query';
import type {
  ContentAssetItem,
  ContentAssetQueryParams,
  ContentAssetSegmentStatusFilter,
} from '@/app/marketing/content-assets/_lib/content-assets-types';
import { ASSET_ANNOTATION_OPTIONS, resolveAnnotationPills } from '../_lib/asset-annotation';
import { isSuggestableAsset } from '../_lib/segment-suggestion-api';
import { buildSegmentAnnotationPath } from '../_lib/segment-routes';
import { AnnotationPillText } from './annotation-pill-text';
import styles from './segment-annotation.module.css';
import suggestStyles from './segment-suggest.module.css';
import { useAssetAnnotationSummaries } from './use-asset-annotation-summaries';

const PAGE_SIZE = 10;
/** Phones: one column, with annotation state, duration and the segment link under the title. */
const COMPACT_QUERY = '(max-width: 680px)';

export interface SelectedSuggestionAsset {
  assetId: string;
  title: string;
  /** Already has suggested or confirmed segments in this preset. */
  annotated?: boolean;
  coverUrl?: string | null;
}

interface SuggestionAssetPickerProps {
  maxAssets: number;
  /** Open studio access: any signed-in user may analyze any ready asset. */
  openAccess: boolean;
  selected: readonly SelectedSuggestionAsset[];
  onChange: (next: SelectedSuggestionAsset[]) => void;
  /** Annotation state and the 未标注 filter are counted for this preset only. */
  presetKey?: string;
  /** `企业:<name>`: only this enterprise's originals are listed (the API rejects others). */
  enterpriseTag?: string | null;
}

/**
 * Ready library assets (remix outputs excluded) with their annotation state, so
 * a re-analysis is a visible choice rather than hidden by a filter. Selection
 * stays local to the page.
 */
export function SuggestionAssetPicker({
  maxAssets,
  openAccess,
  selected,
  onChange,
  presetKey,
  enterpriseTag = null,
}: SuggestionAssetPickerProps) {
  const [keyword, setKeyword] = useState('');
  const [segmentStatus, setSegmentStatus] = useState<ContentAssetSegmentStatusFilter | ''>('');
  const [page, setPage] = useState(1);
  const query: ContentAssetQueryParams = {
    page,
    pageSize: PAGE_SIZE,
    sort: 'updated_desc',
    keyword: keyword || undefined,
    assetStatus: 'ready',
    externalOnly: false,
    segmentStatus: segmentStatus || undefined,
    segmentPreset: presetKey,
    studioOutputs: 'exclude',
    tags: enterpriseTag ? [enterpriseTag] : undefined,
  };
  const assetsQuery = useQuery({
    queryKey: contentAssetsQueryKeys.list(query),
    queryFn: ({ signal }) => fetchContentAssets(query, { signal }),
    placeholderData: keepPreviousData,
  });
  const items = useMemo(() => assetsQuery.data?.items ?? [], [assetsQuery.data]);
  const assetIds = useMemo(() => items.map((asset) => asset.assetId), [items]);
  const { summaries } = useAssetAnnotationSummaries(assetIds, presetKey);
  const selectedIds = selected.map((asset) => asset.assetId);
  const full = selected.length >= maxAssets;
  const compact = useMediaQuery(COMPACT_QUERY);

  const annotation = (asset: ContentAssetItem) => {
    const product = resolveContentAssetProductText(asset);
    return <AnnotationPillText pills={resolveAnnotationPills(summaries.get(asset.assetId), Boolean(product && product !== '--'))} />;
  };
  const duration = (asset: ContentAssetItem) => <span className={suggestStyles.tabular}>{formatDuration(asset.durationSeconds)}</span>;
  const segmentsLink = (asset: ContentAssetItem) => {
    const summary = summaries.get(asset.assetId);
    return summary && summary.suggestedCount + summary.confirmedCount > 0 ? (
      <RouterLink className={styles.tableLink} to={buildSegmentAnnotationPath(asset.assetId)}>
        查看片段
      </RouterLink>
    ) : null;
  };

  const titleColumn: ColumnsType<ContentAssetItem>[number] = {
    title: '原片',
    key: 'title',
    render: (_, asset) => (
      <div className={styles.assetCell}>
        {asset.coverUrl ? (
          <img className={styles.assetCover} src={asset.coverUrl} alt="" loading="lazy" />
        ) : (
          <span className={styles.assetCoverEmpty} aria-hidden><FileImageOutlined /></span>
        )}
        <span className={suggestStyles.assetText}>
          <span className={compact ? suggestStyles.assetTitleWrap : styles.assetTitle}>{resolveContentAssetDisplayTitle(asset)}</span>
          {compact ? (
            <span className={suggestStyles.assetMeta}>
              {annotation(asset)}
              {duration(asset)}
              {segmentsLink(asset)}
            </span>
          ) : null}
          {isSuggestableAsset(asset, openAccess) ? null : (
            <small className={styles.readOnlyHint}>{openAccess ? '原片摘要缺失，暂不能分析' : '无编辑权限或原片摘要缺失'}</small>
          )}
        </span>
      </div>
    ),
  };
  const columns: ColumnsType<ContentAssetItem> = compact
    ? [titleColumn]
    : [
        titleColumn,
        { title: '标注状态', key: 'annotation', render: (_, asset) => annotation(asset) },
        { title: '时长', key: 'duration', render: (_, asset) => duration(asset) },
        { title: '片段', key: 'segments', render: (_, asset) => segmentsLink(asset) ?? <span className={styles.readOnlyHint}>--</span> },
      ];

  const toggle = (asset: ContentAssetItem, checked: boolean) => {
    if (!checked) {
      onChange(selected.filter((item) => item.assetId !== asset.assetId));
      return;
    }
    if (full || selectedIds.includes(asset.assetId)) return;
    const summary = summaries.get(asset.assetId);
    const annotated = Boolean(summary && summary.suggestedCount + summary.confirmedCount > 0);
    onChange([...selected, { assetId: asset.assetId, title: resolveContentAssetDisplayTitle(asset), annotated, coverUrl: asset.coverUrl ?? null }]);
  };

  return (
    <div className={suggestStyles.stack}>
      <div className={styles.filterBar} role="search" aria-label="原片筛选">
        <Input.Search
          aria-label="搜索原片"
          enterButton={<Button aria-label="搜索" icon={<SearchOutlined aria-hidden />} />}
          placeholder="搜索标题、达人或备注"
          allowClear
          onSearch={(value) => {
            setKeyword(value.trim());
            setPage(1);
          }}
        />
        <Select
          aria-label="标注状态"
          value={segmentStatus}
          options={ASSET_ANNOTATION_OPTIONS}
          onChange={(value: ContentAssetSegmentStatusFilter | '') => {
            setSegmentStatus(value);
            setPage(1);
          }}
        />
      </div>
      {assetsQuery.isError ? (
        <Alert
          type="error"
          showIcon
          title="原片列表读取失败"
          description={assetsQuery.error instanceof Error ? assetsQuery.error.message : '请求失败'}
          action={<Button onClick={() => void assetsQuery.refetch()}>重试</Button>}
        />
      ) : (
        <div className={styles.tableScroll}>
          <Table<ContentAssetItem>
            rowKey="assetId"
            size="small"
            loading={assetsQuery.isFetching}
            columns={columns}
            dataSource={items}
            locale={{
              emptyText: segmentStatus
                ? '没有符合条件的已就绪原片，可切换标注状态筛选。'
                : '还没有可分析的原片，请先在素材库上传原片。',
            }}
            rowSelection={{
              selectedRowKeys: selectedIds,
              preserveSelectedRowKeys: true,
              hideSelectAll: true,
              onSelect: (asset, checked) => toggle(asset, checked),
              getCheckboxProps: (asset) => ({
                disabled: !isSuggestableAsset(asset, openAccess) || (full && !selectedIds.includes(asset.assetId)),
                'aria-label': `选择原片 ${resolveContentAssetDisplayTitle(asset)}`,
              }),
            }}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: assetsQuery.data?.total ?? 0,
              showSizeChanger: false,
              onChange: setPage,
            }}
            scroll={compact ? undefined : { x: 640 }}
          />
        </div>
      )}
    </div>
  );
}
