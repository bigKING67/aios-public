import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link as RouterLink } from 'react-router-dom';
import { Badge } from '@/components/atoms/badge';
import type { StudioContentSegment, StudioSegmentPreset } from '../_lib/ai-studio-api';
import { findPreset, isSegmentReadOnly, segmentLabelName, segmentOriginLabel, segmentStatusView } from '../_lib/segment-display';
import { buildSegmentAnnotationPath } from '../_lib/segment-routes';
import { formatSegmentDuration, formatSegmentTime } from '../_lib/segment-time';
import styles from './segment-annotation.module.css';
import libraryStyles from './segment-library.module.css';

interface SegmentLibraryTableProps {
  segments: StudioContentSegment[];
  presets: readonly StudioSegmentPreset[];
  loading: boolean;
  canWrite: boolean;
  selectedIds: ReadonlySet<string>;
  onSelectedIdsChange: (ids: ReadonlySet<string>) => void;
  cardNotes: (segment: StudioContentSegment) => string[];
}

export function SegmentLibraryTable({
  segments,
  presets,
  loading,
  canWrite,
  selectedIds,
  onSelectedIdsChange,
  cardNotes,
}: SegmentLibraryTableProps) {
  const columns: ColumnsType<StudioContentSegment> = [
    { title: '原片', dataIndex: 'assetTitle', key: 'asset', ellipsis: true },
    {
      title: '起止',
      key: 'range',
      render: (_, segment) => (
        <span className={libraryStyles.tabular}>
          {formatSegmentTime(segment.startMs)}–{formatSegmentTime(segment.endMs)}
          <small>{formatSegmentDuration(segment.startMs, segment.endMs)}</small>
        </span>
      ),
    },
    {
      title: '标签',
      key: 'label',
      render: (_, segment) => {
        const name = segmentLabelName(findPreset(presets, segment.presetKey, segment.presetVersion), segment);
        const notes = cardNotes(segment);
        return notes.length > 0 ? (
          <span className={styles.labelCell}>
            {name}
            <small>{notes.join(' · ')}</small>
          </span>
        ) : (
          name
        );
      },
    },
    { title: '产品', dataIndex: 'productName', key: 'product', render: (value: string | null) => value || '缺产品' },
    { title: '来源', dataIndex: 'origin', key: 'origin', render: (value: string) => segmentOriginLabel(value) },
    {
      title: '状态',
      key: 'status',
      render: (_, segment) => {
        const statusView = segmentStatusView(isSegmentReadOnly(segment) ? 'stale' : segment.status);
        return <Badge status={statusView.tone}>{statusView.label}</Badge>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, segment) => (
        <RouterLink className={styles.tableLink} to={buildSegmentAnnotationPath(segment.assetId, segment.segmentId, segment.presetKey)}>去标注</RouterLink>
      ),
    },
  ];

  return (
    <div className={styles.tableScroll}>
      <Table<StudioContentSegment>
        rowKey="segmentId"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={segments}
        pagination={false}
        rowSelection={canWrite ? {
          selectedRowKeys: [...selectedIds],
          onChange: (keys) => onSelectedIdsChange(new Set(keys.map(String))),
          getCheckboxProps: (segment) => ({ disabled: isSegmentReadOnly(segment) }),
        } : undefined}
        locale={{ emptyText: '没有符合条件的片段。可从原片页选一条原片开始标注。' }}
        scroll={{ x: 820 }}
      />
    </div>
  );
}
