'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Empty, Skeleton } from 'antd';
import shellStyles from './creator-dashboard.module.css';
import type { CreatorCooperationStageRows } from './creator-cooperation-stages';
import { CreatorStatusFlow } from './creator-status-flow';
import {
  CreatorStatusTable,
  type CreatorStatusTableProps,
  type CreatorStatusTableRecord,
} from './creator-status-table';
import type { CreatorStatusTableRowMetrics } from './creator-status-table-row';
import styles from './creator-status.module.css';

export interface CreatorStatusSectionProps<TKey extends string, TRecord extends CreatorStatusTableRecord> {
  loading: boolean;
  hasDetails: boolean;
  stages: readonly CreatorCooperationStageRows<TKey, TRecord>[];
  totalCount: number;
  selectedStageKey: TKey | null;
  onSelectedStageChange: Dispatch<SetStateAction<TKey | null>>;
  tableRows: TRecord[];
  showTableMetrics: boolean;
  getTableMetrics: (record: TRecord) => CreatorStatusTableRowMetrics;
  normalizePlatform: CreatorStatusTableProps<TRecord>['normalizePlatform'];
  resolveStageKey: CreatorStatusTableProps<TRecord>['resolveStageKey'];
  formatDisplay: CreatorStatusTableProps<TRecord>['formatDisplay'];
}

export function CreatorStatusSection<TKey extends string, TRecord extends CreatorStatusTableRecord>({
  loading,
  hasDetails,
  stages,
  totalCount,
  selectedStageKey,
  onSelectedStageChange,
  tableRows,
  showTableMetrics,
  getTableMetrics,
  normalizePlatform,
  resolveStageKey,
  formatDisplay,
}: CreatorStatusSectionProps<TKey, TRecord>) {
  return (
    <section className={shellStyles.chartPanel}>
      <header className={shellStyles.chartHead}>
        <div className={shellStyles.chartHeadMain}>
          <h3>合作状态情况</h3>
          <p>点击状态卡查看对应达人，未选择时展示全部状态。</p>
        </div>
      </header>
      {loading ? (
        <div className={styles.statusLoadingSkeleton}>
          <Skeleton active title={{ width: '32%' }} paragraph={{ rows: 2 }} />
          <Skeleton active title={false} paragraph={{ rows: 7 }} />
        </div>
      ) : hasDetails ? (
        <>
          <CreatorStatusFlow
            stages={stages}
            totalCount={totalCount}
            selectedStageKey={selectedStageKey}
            onSelectedStageChange={onSelectedStageChange}
          />

          <CreatorStatusTable
            rows={tableRows}
            selectedStageKey={selectedStageKey}
            showMetrics={showTableMetrics}
            getMetrics={getTableMetrics}
            normalizePlatform={normalizePlatform}
            resolveStageKey={resolveStageKey}
            formatDisplay={formatDisplay}
          />
        </>
      ) : (
        <div className={styles.statusEmpty}>
          <Empty description="当前筛选条件下暂无合作状态数据" />
        </div>
      )}
    </section>
  );
}
