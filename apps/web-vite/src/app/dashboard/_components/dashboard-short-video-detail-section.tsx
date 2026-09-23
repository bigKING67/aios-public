import { DownloadOutlined, LoginOutlined } from '@ant-design/icons';
import { Button, Table } from 'antd';
import type { TableProps } from 'antd';
import type { ReactNode } from 'react';

import detailActionsStyles from './dashboard-detail-section-actions.module.css';
import exportHintStyles from './dashboard-detail-section-export-hint.module.css';
import detailMetaStyles from './dashboard-detail-section-meta.module.css';
import detailStyles from './dashboard-detail-section.module.css';
import tableStyles from './dashboard-short-video-detail-table.module.css';
import type { DashboardShortVideoDetailRow } from './dashboard-types';

export type DashboardShortVideoDetailSectionProps = {
  isAuthenticated: boolean;
  isMobile: boolean;
  isExporting: boolean;
  disableExport: boolean;
  rows: DashboardShortVideoDetailRow[];
  loading: boolean;
  columns: TableProps<DashboardShortVideoDetailRow>['columns'];
  pagination: TableProps<DashboardShortVideoDetailRow>['pagination'];
  emptyText: ReactNode;
  onExport: () => void;
  onNavigateLogin: () => void;
};

export function DashboardShortVideoDetailSection({
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
}: DashboardShortVideoDetailSectionProps) {
  return (
    <section className={detailStyles.detailPanel}>
      <div className={detailActionsStyles.detailHead}>
        <div className={detailMetaStyles.detailMeta}>
          <h3 className={detailMetaStyles.detailMetaTitle}>短视频明细</h3>
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
      <Table<DashboardShortVideoDetailRow>
        rowKey={(row) =>
          `${row.stat_date || ''}-${row.video_id || ''}-${row.author_douyin_id || ''}-${row.product_id || ''}`
        }
        className={tableStyles.shortVideoDetailTable}
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="small"
        sortDirections={['ascend', 'descend']}
        scroll={{ x: 'max-content', y: isMobile ? undefined : 520 }}
        pagination={pagination}
        locale={{
          emptyText,
        }}
      />
    </section>
  );
}
