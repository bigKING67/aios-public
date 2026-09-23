import { useEffect, useMemo, useState } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ContentAssetItem, ContentAssetProcessingJob } from '../_lib/content-assets-types';
import {
  resolveContentAssetDisplayTitle,
  resolveContentAssetProductText,
} from '../_lib/content-assets-display';
import { contentAssetPlatformNamesLabel } from '../_lib/content-assets-platforms';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRatio,
} from '../_lib/content-assets-formatters';
import { ContentAssetGridCard } from './content-assets-asset-grid-card';
import {
  type IntelligencePillState,
  resolveIntelligencePills,
} from './content-assets-asset-intelligence';
import cardStyles from './content-assets-asset-list.module.css';
import { AssetStatusTag, LifecycleStatusTag } from './content-assets-status-tags';

function readinessPillClassName(state: IntelligencePillState): string {
  if (state === 'ready') return cardStyles.readinessPillReady;
  if (state === 'active') return cardStyles.readinessPillActive;
  if (state === 'failed') return cardStyles.readinessPillFailed;
  return '';
}

export function ContentAssetsGrid({
  items,
  processingJobs,
  onOpen,
  onSourceUploadOpen,
}: {
  items: ContentAssetItem[];
  processingJobs: ContentAssetProcessingJob[];
  onOpen: (asset: ContentAssetItem) => void;
  onSourceUploadOpen: (asset: ContentAssetItem) => void;
}) {
  const [activePreviewAssetId, setActivePreviewAssetId] = useState<string | null>(null);
  const visibleAssetIds = useMemo(() => new Set(items.map((item) => item.assetId)), [items]);

  useEffect(() => {
    if (activePreviewAssetId && !visibleAssetIds.has(activePreviewAssetId)) {
      setActivePreviewAssetId(null);
    }
  }, [activePreviewAssetId, visibleAssetIds]);

  return (
    <div className={cardStyles.assetGrid}>
      {items.map((asset, index) => {
        const isPreviewActive = activePreviewAssetId === asset.assetId;

        return (
          <ContentAssetGridCard
            key={asset.assetId}
            asset={asset}
            index={index}
            isPreviewActive={isPreviewActive}
            processingJobs={processingJobs}
            onOpen={onOpen}
            onPreviewActivate={setActivePreviewAssetId}
            onPreviewDeactivate={(assetId) => {
              setActivePreviewAssetId((current) => (current === assetId ? null : current));
            }}
            onSourceUploadOpen={onSourceUploadOpen}
          />
        );
      })}
    </div>
  );
}

export function ContentAssetsTable({
  items,
  processingJobs,
  onOpen,
  onSourceUploadOpen,
}: {
  items: ContentAssetItem[];
  processingJobs: ContentAssetProcessingJob[];
  onOpen: (asset: ContentAssetItem) => void;
  onSourceUploadOpen: (asset: ContentAssetItem) => void;
}) {
  const columns: ColumnsType<ContentAssetItem> = [
    {
      title: '素材',
      dataIndex: 'title',
      key: 'title',
      width: 280,
      render: (_value, record) => {
        const displayTitle = resolveContentAssetDisplayTitle(record);
        return (
          <button
            className={cardStyles.tableTitleButton}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(record);
            }}
          >
            <strong>{displayTitle}</strong>
            <span>
              {record.sourceSheetName || '来源未记录'} {record.sourceRowIndex ? `#${record.sourceRowIndex}` : ''}
            </span>
          </button>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'assetStatus',
      key: 'assetStatus',
      width: 110,
      render: (value) => <AssetStatusTag value={value} />,
    },
    {
      title: '流转',
      dataIndex: 'lifecycleStatus',
      key: 'lifecycleStatus',
      width: 110,
      render: (value) => <LifecycleStatusTag value={value} />,
    },
    {
      title: '智能',
      key: 'intelligence',
      width: 132,
      render: (_value, record) => (
        <div className={cardStyles.tableReadinessPills}>
          {resolveIntelligencePills(record, processingJobs).map((pill) => (
            <span className={readinessPillClassName(pill.state)} key={pill.label}>
              {pill.label}
            </span>
          ))}
        </div>
      ),
    },
    {
      title: '平台',
      key: 'platform',
      width: 120,
      render: (_value, record) => contentAssetPlatformNamesLabel(record.platformNames, record.platform),
    },
    { title: '产品', key: 'productName', width: 160, render: (_value, record) => resolveContentAssetProductText(record) || '--' },
    { title: '达人', dataIndex: 'creatorName', key: 'creatorName', width: 140, render: (value) => value || '--' },
    { title: '时长', dataIndex: 'durationSeconds', key: 'durationSeconds', width: 90, render: formatDuration },
    { title: '大小', dataIndex: 'fileSizeBytes', key: 'fileSizeBytes', width: 110, render: formatBytes },
    { title: 'CTR', dataIndex: 'ctr', key: 'ctr', width: 90, render: (value) => formatPercent(value) },
    { title: 'ROI', dataIndex: 'roi', key: 'roi', width: 90, render: formatRatio },
    { title: '更新', dataIndex: 'updatedAt', key: 'updatedAt', width: 130, render: formatDateTime },
    {
      title: '源文件',
      key: 'sourceUpload',
      width: 128,
      render: (_value, record) => {
        if (record.externalOnly && record.canEdit) {
          return (
            <button
              className={cardStyles.tableSourceUploadButton}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSourceUploadOpen(record);
              }}
            >
              补传源文件
            </button>
          );
        }
        return record.externalOnly ? '待补源' : 'TOS 已入库';
      },
    },
  ];

  return (
    <Table
      rowKey="assetId"
      columns={columns}
      dataSource={items}
      pagination={false}
      scroll={{ x: 1668 }}
      className={cardStyles.assetTable}
      rowClassName={cardStyles.assetTableRow}
      onRow={(record) => ({
        onClick: () => onOpen(record),
      })}
    />
  );
}

export function ContentAssetsSkeleton() {
  return (
    <div className={cardStyles.assetGrid}>
      {Array.from({ length: 8 }).map((_, index) => (
        <div className={cardStyles.assetCardSkeleton} key={index} aria-hidden="true">
          <span className={cardStyles.skeletonDuration} />
          <span className={cardStyles.skeletonPlay} />
          <div className={cardStyles.skeletonBody}>
            <i />
            <i />
            <i />
          </div>
        </div>
      ))}
    </div>
  );
}
