'use client';

import { CreatorStatusTableMetricHeads } from './creator-status-table-cells';
import {
  CreatorStatusTableRow,
  type CreatorStatusTableRowMetrics,
  type CreatorStatusTableRowProps,
  type CreatorStatusTableRowRecord,
} from './creator-status-table-row';
import styles from './creator-status.module.css';

export interface CreatorStatusTableRecord extends CreatorStatusTableRowRecord {
  id: number | string;
}

interface CreatorStatusTableHeadProps {
  showMetrics: boolean;
}

interface CreatorStatusTableBodyProps<TRecord extends CreatorStatusTableRecord> {
  rows: TRecord[];
  selectedStageKey?: string | null;
  showMetrics: boolean;
  getMetrics: (record: TRecord) => CreatorStatusTableRowMetrics;
  normalizePlatform: CreatorStatusTableRowProps['normalizePlatform'];
  resolveStageKey: CreatorStatusTableRowProps['resolveStageKey'];
  formatDisplay: CreatorStatusTableRowProps['formatDisplay'];
}

export interface CreatorStatusTableProps<TRecord extends CreatorStatusTableRecord> {
  rows: TRecord[];
  selectedStageKey?: string | null;
  showMetrics: boolean;
  getMetrics: (record: TRecord) => CreatorStatusTableRowMetrics;
  normalizePlatform: CreatorStatusTableRowProps['normalizePlatform'];
  resolveStageKey: CreatorStatusTableRowProps['resolveStageKey'];
  formatDisplay: CreatorStatusTableRowProps['formatDisplay'];
  emptyText?: string;
}

function CreatorStatusTableHead({ showMetrics }: CreatorStatusTableHeadProps) {
  return (
    <thead>
      <tr>
        <th>达人名称</th>
        <th>达人ID</th>
        <th>平台</th>
        <th>负责人</th>
        <th>合作状态</th>
        <th>合作描述</th>
        {showMetrics ? <CreatorStatusTableMetricHeads /> : null}
      </tr>
    </thead>
  );
}

function CreatorStatusTableBody<TRecord extends CreatorStatusTableRecord>({
  rows,
  selectedStageKey,
  showMetrics,
  getMetrics,
  normalizePlatform,
  resolveStageKey,
  formatDisplay,
}: CreatorStatusTableBodyProps<TRecord>) {
  return (
    <tbody>
      {rows.map((row) => (
        <CreatorStatusTableRow
          key={`${row.id}-${selectedStageKey || 'all'}`}
          record={row}
          normalizePlatform={normalizePlatform}
          resolveStageKey={resolveStageKey}
          formatDisplay={formatDisplay}
          metrics={showMetrics ? getMetrics(row) : null}
        />
      ))}
    </tbody>
  );
}

export function CreatorStatusTable<TRecord extends CreatorStatusTableRecord>({
  rows,
  selectedStageKey,
  showMetrics,
  getMetrics,
  normalizePlatform,
  resolveStageKey,
  formatDisplay,
  emptyText = '当前状态暂无达人',
}: CreatorStatusTableProps<TRecord>) {
  if (!rows.length) {
    return <div className={styles.statusInfoEmpty}>{emptyText}</div>;
  }

  return (
    <div className={styles.statusTableWrap}>
      <table className={styles.statusTable}>
        <CreatorStatusTableHead showMetrics={showMetrics} />
        <CreatorStatusTableBody
          rows={rows}
          selectedStageKey={selectedStageKey}
          showMetrics={showMetrics}
          getMetrics={getMetrics}
          normalizePlatform={normalizePlatform}
          resolveStageKey={resolveStageKey}
          formatDisplay={formatDisplay}
        />
      </table>
    </div>
  );
}
