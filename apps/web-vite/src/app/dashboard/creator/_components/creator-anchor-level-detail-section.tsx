'use client';

import { Button, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { formatInteger } from './creator-formatters';
import shellStyles from './creator-dashboard.module.css';
import styles from './creator-live-dashboard.module.css';
import { creatorDetailTableComponents } from './creator-detail-table-components';
import { CREATOR_LEVEL_DETAIL_PAGE_SIZE } from './creator-ui-utils';

export interface CreatorAnchorLevelDetailRecord {
  id: number | string;
}

export interface CreatorAnchorLevelDetailSectionProps<TRecord extends CreatorAnchorLevelDetailRecord> {
  selectedAnchorLevel: string | null;
  rows: TRecord[];
  columns: ColumnsType<TRecord>;
  loading: boolean;
  scrollX: number;
  onClear: () => void;
}

export function CreatorAnchorLevelDetailSection<TRecord extends CreatorAnchorLevelDetailRecord>({
  selectedAnchorLevel,
  rows,
  columns,
  loading,
  scrollX,
  onClear,
}: CreatorAnchorLevelDetailSectionProps<TRecord>) {
  if (!selectedAnchorLevel) {
    return null;
  }

  return (
    <section className={`${shellStyles.chartPanel} ${styles.levelDetailPanel}`}>
      <header className={shellStyles.chartHead}>
        <div className={shellStyles.chartHeadMain}>
          <h3>达人等级信息列表</h3>
          <p>{`当前等级：${selectedAnchorLevel}级，共 ${formatInteger(rows.length)} 人`}</p>
        </div>
        <div className={shellStyles.chartHeadActions}>
          <Button type="link" size="small" className={styles.levelSelectionClear} onClick={onClear}>
            清除选择
          </Button>
        </div>
      </header>

      <Table<TRecord>
        className={`${styles.detailTable} ${styles.levelDetailTable}`}
        rowKey={(row) => String(row.id)}
        columns={columns}
        components={creatorDetailTableComponents}
        dataSource={rows}
        loading={loading}
        size="small"
        scroll={{ x: scrollX }}
        pagination={{
          pageSize: CREATOR_LEVEL_DETAIL_PAGE_SIZE,
          showSizeChanger: rows.length > CREATOR_LEVEL_DETAIL_PAGE_SIZE,
          hideOnSinglePage: true,
          pageSizeOptions: ['8', '20', '50'],
          showTotal: (total) => `共 ${total} 条`,
        }}
        locale={{
          emptyText: `当前筛选条件下暂无 ${selectedAnchorLevel}级达人信息`,
        }}
      />
    </section>
  );
}
