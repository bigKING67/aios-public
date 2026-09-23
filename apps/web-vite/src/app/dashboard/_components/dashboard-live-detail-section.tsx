import { DownloadOutlined, LoginOutlined } from '@ant-design/icons';
import { Button, Table } from 'antd';
import type { TableProps } from 'antd';
import type { ReactNode } from 'react';

import detailActionsStyles from './dashboard-detail-section-actions.module.css';
import exportHintStyles from './dashboard-detail-section-export-hint.module.css';
import detailMetaStyles from './dashboard-detail-section-meta.module.css';
import detailStyles from './dashboard-detail-section.module.css';
import tableStyles from './dashboard-live-detail-table.module.css';
import type { DashboardLiveDetailRow } from './dashboard-types';

export type DashboardLiveDetailSectionProps = {
  isAuthenticated: boolean;
  isMobile: boolean;
  isExporting: boolean;
  disableExport: boolean;
  rows: DashboardLiveDetailRow[];
  loading: boolean;
  columns: TableProps<DashboardLiveDetailRow>['columns'];
  pagination: TableProps<DashboardLiveDetailRow>['pagination'];
  emptyText: ReactNode;
  onExport: () => void;
  onNavigateLogin: () => void;
};

export function DashboardLiveDetailSection({
  isAuthenticated,
  isMobile,
  isExporting,
  disableExport,
  rows,
  loading,
  columns,
  pagination,
  emptyText,
  onExport,
  onNavigateLogin,
}: DashboardLiveDetailSectionProps) {
  return (
    <section className={`${detailStyles.detailPanel} ${detailStyles.liveDetailPanel}`}>
      <div className={detailActionsStyles.detailHead}>
        <div className={detailMetaStyles.detailMeta}>
          <h3 className={detailMetaStyles.detailMetaTitle}>直播明细</h3>
        </div>
        <div className={detailActionsStyles.detailActions}>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={isExporting}
            disabled={disableExport}
            block={isMobile}
            onClick={onExport}
          >
            导出明细
          </Button>
          {!isAuthenticated ? (
            <div className={exportHintStyles.exportHintWrap}>
              <p className={exportHintStyles.exportHint}>未登录不可下载明细</p>
              <Button
                type="link"
                size="small"
                icon={<LoginOutlined />}
                className={exportHintStyles.loginEntryButton}
                onClick={onNavigateLogin}
              >
                去登录后导出
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <Table<DashboardLiveDetailRow>
        rowKey={(row) => `${row.shop_id || ''}-${row.anchor_douyin_id || ''}-${row.live_start_time || ''}`}
        className={tableStyles.liveDetailTable}
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="small"
        sortDirections={['ascend', 'descend']}
        scroll={{ x: isMobile ? 1240 : 1440, y: isMobile ? undefined : 520 }}
        pagination={pagination}
        rowClassName={() => tableStyles.liveDetailRow}
        locale={{
          emptyText,
        }}
      />
    </section>
  );
}
