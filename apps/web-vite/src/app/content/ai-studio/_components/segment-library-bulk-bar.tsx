import { Button, Popconfirm, Select } from 'antd';
import type { StudioContentSegment } from '../_lib/ai-studio-api';
import libraryStyles from './segment-library.module.css';
import type { BulkAction } from './use-segment-bulk-actions';

interface SegmentLibraryBulkBarProps {
  view: 'grid' | 'table';
  busy: boolean;
  selected: StudioContentSegment[];
  /** Loaded segments that are not read-only; the grid's select-all target. */
  selectable: StudioContentSegment[];
  productOptions: { value: string; label: string }[];
  bulkProduct: string | undefined;
  onBulkProductChange: (product: string) => void;
  onSelectedIdsChange: (ids: ReadonlySet<string>) => void;
  onRun: (action: BulkAction) => void;
}

export function SegmentLibraryBulkBar({
  view,
  busy,
  selected,
  selectable,
  productOptions,
  bulkProduct,
  onBulkProductChange,
  onSelectedIdsChange,
  onRun,
}: SegmentLibraryBulkBarProps) {
  const confirmable = selected.filter((segment) => segment.status === 'suggested');
  const allSelected = selected.length === selectable.length && selected.length > 0;

  return (
    <div className={libraryStyles.bulkBar} role="toolbar" aria-label="批量操作">
      <span>{selected.length > 0 ? `已选 ${selected.length} 条` : '点击卡片选择片段'}</span>
      {view === 'grid' ? (
        <Button
          type="link"
          disabled={selectable.length === 0}
          onClick={() =>
            onSelectedIdsChange(
              selected.length === selectable.length ? new Set() : new Set(selectable.map((segment) => segment.segmentId)),
            )
          }
        >
          {allSelected ? '取消全选' : `全选已加载（${selectable.length}）`}
        </Button>
      ) : null}
      <Button type="primary" disabled={busy || confirmable.length === 0} onClick={() => onRun({ kind: 'confirm', items: confirmable })}>
        确认{confirmable.length > 0 ? ` ${confirmable.length} 条待确认` : ''}
      </Button>
      <Popconfirm
        title={`驳回 ${selected.length} 个片段？`}
        description="驳回后不会进入混剪，可在「全部状态」里找回并恢复。"
        okText="驳回"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        disabled={busy || selected.length === 0}
        onConfirm={() => onRun({ kind: 'reject', items: selected })}
      >
        <Button danger disabled={busy || selected.length === 0}>驳回</Button>
      </Popconfirm>
      <Select
        className={libraryStyles.productSelect}
        showSearch
        placeholder="选择产品"
        aria-label="批量设置产品"
        value={bulkProduct}
        options={productOptions}
        onChange={(value: string) => onBulkProductChange(value)}
      />
      <Button
        disabled={busy || !bulkProduct || selected.length === 0}
        onClick={() => bulkProduct && onRun({ kind: 'product', items: selected, productName: bulkProduct })}
      >
        设置产品
      </Button>
      {view === 'table' ? <Button type="link" onClick={() => onSelectedIdsChange(new Set())}>清空选择</Button> : null}
    </div>
  );
}
