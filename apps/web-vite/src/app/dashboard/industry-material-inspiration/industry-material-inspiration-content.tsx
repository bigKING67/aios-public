import { DownloadOutlined } from '@ant-design/icons';
import { Button, Empty, Skeleton, Table } from 'antd';
import {
  buildSummaryMetrics,
  formatMonthLabel,
  TABLE_SCROLL_X,
  type IndustryMaterialTableRow,
} from './industry-material-inspiration-client-helpers';
import { TABLE_COLUMNS } from './industry-material-inspiration-table-columns';
import styles from './industry-material-inspiration.module.css';

interface IndustryMaterialSummaryGridProps {
  displayMonth: string;
  activeTabLabel: string;
  isLoading: boolean;
  metrics: ReturnType<typeof buildSummaryMetrics>;
}

export function IndustryMaterialSummaryGrid({
  displayMonth,
  activeTabLabel,
  isLoading,
  metrics,
}: IndustryMaterialSummaryGridProps) {
  return (
    <section className={styles.summaryGrid} aria-label={`${formatMonthLabel(displayMonth)}${activeTabLabel}素材摘要`}>
      {isLoading
        ? Array.from({ length: 8 }).map((_, index) => (
            <div className={styles.summaryItem} key={index}>
              <Skeleton active paragraph={{ rows: 1 }} title={{ width: '44%' }} />
            </div>
          ))
        : metrics.map((metric) => (
            <div className={styles.summaryItem} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <p>{metric.helper}</p>
            </div>
          ))}
    </section>
  );
}

interface IndustryMaterialTablePanelProps {
  activeTabLabel: string;
  rows: IndustryMaterialTableRow[];
  isFetching: boolean;
  emptyDescription: string;
  onExportDetails: () => void;
}

export function IndustryMaterialTablePanel({
  activeTabLabel,
  rows,
  isFetching,
  emptyDescription,
  onExportDetails,
}: IndustryMaterialTablePanelProps) {
  return (
    <section className={styles.tablePanel}>
      <div className={styles.tableHeader}>
        <div>
          <p className={styles.eyebrow}>全量素材明细</p>
          <h2>{activeTabLabel}素材明细</h2>
          <p>以上 AI 洞察展示 Top 5 代表证据；以下为当前筛选条件下的全量素材明细。</p>
        </div>
        <div className={styles.tableActions} aria-label="行业素材明细工具栏">
          <Button
            type="primary"
            className={styles.exportButton}
            icon={<DownloadOutlined />}
            disabled={!rows.length || isFetching}
            onClick={onExportDetails}
          >
            导出明细
          </Button>
        </div>
      </div>

      <div className={styles.tableViewport}>
        <Table<IndustryMaterialTableRow>
          className={styles.materialTable}
          columns={TABLE_COLUMNS}
          dataSource={rows}
          loading={isFetching}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (total) => `共 ${total} 条素材`,
          }}
          rowKey="rowKey"
          scroll={{ x: TABLE_SCROLL_X, y: 620 }}
          size="middle"
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />,
          }}
        />
      </div>
    </section>
  );
}
