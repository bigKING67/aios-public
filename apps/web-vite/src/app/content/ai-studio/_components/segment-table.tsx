import { Button, Popconfirm, Table } from 'antd';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { ColumnsType } from 'antd/es/table';
import { Badge } from '@/components/atoms/badge';
import type { StudioContentSegment, StudioSegmentPreset, StudioSegmentStatus } from '../_lib/ai-studio-api';
import {
  findPreset,
  isSegmentReadOnly,
  labelName,
  readAiSegmentEvidence,
  segmentOriginLabel,
  segmentStatusView,
} from '../_lib/segment-display';
import { formatSegmentDuration, formatSegmentTime } from '../_lib/segment-time';
import styles from './segment-annotation.module.css';

export type SegmentRowAction =
  | { type: 'play'; segment: StudioContentSegment }
  | { type: 'edit'; segment: StudioContentSegment }
  | { type: 'status'; segment: StudioContentSegment; status: StudioSegmentStatus };

interface SegmentTableProps {
  segments: readonly StudioContentSegment[];
  presets: readonly StudioSegmentPreset[];
  canWrite: boolean;
  canPlay: boolean;
  busy: boolean;
  activeSegmentId: string | null;
  highlightedIds: ReadonlySet<string>;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onAction: (action: SegmentRowAction) => void;
}

function statusActions(segment: StudioContentSegment): Array<{ label: string; status: StudioSegmentStatus; danger?: boolean }> {
  if (segment.status === 'suggested') return [{ label: '确认', status: 'confirmed' }, { label: '拒绝', status: 'rejected', danger: true }];
  if (segment.status === 'confirmed') return [{ label: '撤回确认', status: 'suggested' }];
  if (segment.status === 'rejected') return [{ label: '恢复待确认', status: 'suggested' }];
  return [];
}

const COMPACT_TABLE_QUERY = '(max-width: 680px)';

export function SegmentTable({
  segments,
  presets,
  canWrite,
  canPlay,
  busy,
  activeSegmentId,
  highlightedIds,
  selectedIds,
  onSelectionChange,
  onAction,
}: SegmentTableProps) {
  const compact = useMediaQuery(COMPACT_TABLE_QUERY);
  const columns: ColumnsType<StudioContentSegment> = [
    {
      title: '起止',
      key: 'range',
      width: 150,
      render: (_, segment) => (
        <span className={styles.mono}>
          {formatSegmentTime(segment.startMs)}–{formatSegmentTime(segment.endMs)}
          <small>{formatSegmentDuration(segment.startMs, segment.endMs)}</small>
        </span>
      ),
    },
    {
      title: '标签',
      key: 'label',
      width: 104,
      render: (_, segment) => labelName(findPreset(presets, segment.presetKey, segment.presetVersion), segment.labelKey),
    },
    { title: '产品', dataIndex: 'productName', key: 'product', width: 150, render: (value: string | null) => value || '--' },
    {
      title: '来源',
      key: 'origin',
      width: 260,
      render: (_, segment) => {
        const evidence = readAiSegmentEvidence(segment);
        if (!evidence) return segmentOriginLabel(segment.origin);
        return (
          <span className={styles.originEvidence}>
            <span>
              {segmentOriginLabel(segment.origin)}
              {evidence.confidence !== null ? (
                <span> · 模型自评 {evidence.confidence.toFixed(2)}</span>
              ) : null}
            </span>
            {evidence.reason ? <small title={evidence.reason}>{evidence.reason}</small> : null}
          </span>
        );
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 96,
      render: (_, segment) => {
        const view = segmentStatusView(isSegmentReadOnly(segment) ? 'stale' : segment.status);
        return <Badge status={view.tone}>{view.label}</Badge>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      // Phones: a narrow pinned column (buttons wrap) keeps the actions reachable while the
      // times stay readable; desktop has room for one row of buttons.
      fixed: compact ? 'right' : undefined,
      className: compact ? styles.pinnedActionsCell : undefined,
      width: compact ? 132 : 236,
      render: (_, segment) => {
        const readOnly = isSegmentReadOnly(segment);
        return (
          <div className={styles.rowActions}>
            <Button size="small" className={styles.touchButton} disabled={!canPlay} onClick={() => onAction({ type: 'play', segment })}>
              播放
            </Button>
            {canWrite && !readOnly ? (
              <>
                <Button size="small" className={styles.touchButton} disabled={busy} onClick={() => onAction({ type: 'edit', segment })}>
                  编辑
                </Button>
                {statusActions(segment).map((action) =>
                  segment.status === 'confirmed' ? (
                    // Withdrawing takes the segment out of the remix pool; ask first.
                    <Popconfirm
                      key={action.status}
                      title="撤回这段的确认？"
                      description="撤回后它回到待确认，框架混剪和单条剪辑都不再使用它。"
                      okText="撤回确认"
                      cancelText="取消"
                      disabled={busy}
                      onConfirm={() => onAction({ type: 'status', segment, status: action.status })}
                    >
                      <Button size="small" className={styles.touchButton} disabled={busy}>
                        {action.label}
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Button
                      key={action.status}
                      size="small"
                      danger={action.danger}
                      className={styles.touchButton}
                      disabled={busy}
                      onClick={() => onAction({ type: 'status', segment, status: action.status })}
                    >
                      {action.label}
                    </Button>
                  ),
                )}
              </>
            ) : null}
            {readOnly ? <span className={styles.readOnlyHint}>原片已变化，只读</span> : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className={styles.tableScroll}>
      <Table<StudioContentSegment>
        rowKey="segmentId"
        size="small"
        columns={columns}
        dataSource={[...segments]}
        pagination={segments.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
        locale={{ emptyText: '这条原片在当前预设下还没有片段。可在上方新建。' }}
        rowClassName={(segment) => [
          highlightedIds.has(segment.segmentId) ? styles.rowConflict : '',
          segment.segmentId === activeSegmentId ? styles.rowActive : '',
        ].filter(Boolean).join(' ')}
        rowSelection={canWrite ? {
          selectedRowKeys: selectedIds,
          onChange: (keys) => onSelectionChange(keys.map(String)),
          getCheckboxProps: (segment) => ({
            disabled: segment.status !== 'suggested' || isSegmentReadOnly(segment),
            'aria-label': `选择片段 ${formatSegmentTime(segment.startMs)}`,
          }),
        } : undefined}
        // Fixed column widths keep labels on one line; narrow screens scroll the table, not the page.
        scroll={{ x: 1000 }}
      />
    </div>
  );
}
