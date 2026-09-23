'use client';

import { Table } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import styles from './creator-live-dashboard.module.css';
import { creatorDetailTableComponents } from './creator-detail-table-components';

export interface CreatorDetailTableRecord {
  id: number | string;
}

export interface CreatorDetailTableProps<TRecord extends CreatorDetailTableRecord> {
  columns: ColumnsType<TRecord>;
  dataSource: TRecord[];
  loading: boolean;
  scrollX: number;
  scrollY?: number;
  emptyText?: string;
  paginationNote?: string;
  rowClassName?: TableProps<TRecord>['rowClassName'];
}

export function CreatorDetailTable<TRecord extends CreatorDetailTableRecord>({
  columns,
  dataSource,
  loading,
  scrollX,
  scrollY,
  emptyText = '当前筛选条件下暂无达人明细数据',
  paginationNote,
  rowClassName,
}: CreatorDetailTableProps<TRecord>) {
  return (
    <div className={paginationNote ? styles.detailTableWithPaginationNote : undefined}>
      <Table<TRecord>
        className={styles.detailTable}
        rowKey={(row) => String(row.id)}
        columns={columns}
        components={creatorDetailTableComponents}
        dataSource={dataSource}
        loading={loading}
        rowClassName={rowClassName}
        size="small"
        scroll={typeof scrollY === 'number' ? { x: scrollX, y: scrollY } : { x: scrollX }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (total) => `共 ${total} 条`,
        }}
        locale={{
          emptyText,
        }}
      />
      {paginationNote ? <p className={styles.detailPaginationNote}>{paginationNote}</p> : null}
    </div>
  );
}
