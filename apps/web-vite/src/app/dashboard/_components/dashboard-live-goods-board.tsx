import type { Key, ReactNode } from 'react';
import { DownloadOutlined, LoginOutlined } from '@ant-design/icons';
import { Button, Pagination } from 'antd';

import { DashboardLiveGoodsSessionCard } from './dashboard-live-goods-session-card';
import detailActionsStyles from './dashboard-detail-section-actions.module.css';
import exportHintStyles from './dashboard-detail-section-export-hint.module.css';
import liveGoodsStyles from './dashboard-live-goods-board.module.css';
import paginationCoreStyles from './dashboard-live-goods-pagination-core.module.css';
import paginationSelectStyles from './dashboard-live-goods-pagination-select.module.css';
import paginationStyles from './dashboard-live-goods-pagination.module.css';
import trafficSectionHeaderStyles from './dashboard-traffic-section-header.module.css';
import trafficSectionStyles from './dashboard-traffic-section.module.css';
import type { DashboardLiveGoodsSessionGroup } from './dashboard-types';

export type DashboardLiveGoodsBoardProps = {
  loading: boolean;
  loadError: string | null;
  emptyContent: ReactNode;
  sessionGroups: DashboardLiveGoodsSessionGroup[];
  sessionCount: number;
  expandedSessionKeys: Key[];
  expandedProductKeys: Key[];
  page: number;
  pageSize: number;
  isMobile: boolean;
  isAuthenticated: boolean;
  isExporting: boolean;
  disableExport: boolean;
  onExport: () => void;
  onNavigateLogin: () => void;
  onToggleSession: (key: Key) => void;
  onToggleProduct: (key: Key) => void;
  onPageChange: (page: number, pageSize: number) => void;
};

export function DashboardLiveGoodsBoard({
  loading,
  loadError,
  emptyContent,
  sessionGroups,
  sessionCount,
  expandedSessionKeys,
  expandedProductKeys,
  page,
  pageSize,
  isMobile,
  isAuthenticated,
  isExporting,
  disableExport,
  onExport,
  onNavigateLogin,
  onToggleSession,
  onToggleProduct,
  onPageChange,
}: DashboardLiveGoodsBoardProps) {
  const hasSessions = sessionCount > 0;

  return (
    <section className={`${trafficSectionStyles.panel} ${liveGoodsStyles.panel}`}>
      <div className={trafficSectionHeaderStyles.head}>
        <div className={trafficSectionHeaderStyles.meta}>
          <h3 className={liveGoodsStyles.title}>直播商品表现</h3>
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

      {loading && hasSessions ? <div className={liveGoodsStyles.inlineStatus}>正在刷新直播商品表现...</div> : null}
      {loadError || !hasSessions ? (
        <div className={liveGoodsStyles.boardState}>{emptyContent}</div>
      ) : (
        <div className={liveGoodsStyles.board}>
          {sessionGroups.map((session) => (
            <DashboardLiveGoodsSessionCard
              key={session.key}
              session={session}
              isExpanded={expandedSessionKeys.includes(session.key)}
              expandedProductKeys={expandedProductKeys}
              onToggleSession={onToggleSession}
              onToggleProduct={onToggleProduct}
            />
          ))}
          <div
            className={[
              paginationStyles.pagination,
              paginationCoreStyles.paginationCore,
              paginationSelectStyles.paginationSelect,
            ].join(' ')}
          >
            <Pagination
              current={page}
              pageSize={pageSize}
              size="small"
              total={sessionCount}
              showSizeChanger={!isMobile}
              pageSizeOptions={['10', '20', '50']}
              showTotal={(total) => `共 ${total} 条`}
              onChange={onPageChange}
            />
          </div>
        </div>
      )}
    </section>
  );
}
