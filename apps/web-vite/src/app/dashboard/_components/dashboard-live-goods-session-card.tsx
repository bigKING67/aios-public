import type { Key } from 'react';

import {
  formatCompactWanCurrency,
  formatTableInteger,
} from './dashboard-formatters';
import { DashboardLiveGoodsProductCard } from './dashboard-live-goods-product-card';
import {
  formatLiveGoodsAnchorType,
  formatLiveGoodsSessionTime,
} from './dashboard-live-goods-formatters';
import sessionActionStyles from './dashboard-live-goods-session-action.module.css';
import sessionHeaderStyles from './dashboard-live-goods-session-header.module.css';
import sessionIdentityStyles from './dashboard-live-goods-session-identity.module.css';
import sessionKpiStyles from './dashboard-live-goods-session-kpis.module.css';
import sessionStyles from './dashboard-live-goods-session.module.css';
import productStyles from './dashboard-live-goods-product.module.css';
import type { DashboardLiveGoodsSessionGroup } from './dashboard-types';

type DashboardLiveGoodsSessionCardProps = {
  session: DashboardLiveGoodsSessionGroup;
  isExpanded: boolean;
  expandedProductKeys: Key[];
  onToggleSession: (key: Key) => void;
  onToggleProduct: (key: Key) => void;
};

export function DashboardLiveGoodsSessionCard({
  session,
  isExpanded,
  expandedProductKeys,
  onToggleSession,
  onToggleProduct,
}: DashboardLiveGoodsSessionCardProps) {
  return (
    <article className={sessionStyles.sessionCard}>
      <button
        type="button"
        className={sessionHeaderStyles.sessionHeader}
        aria-expanded={isExpanded}
        onClick={() => onToggleSession(session.key)}
      >
        <div className={sessionIdentityStyles.sessionPrimary}>
          <div className={sessionIdentityStyles.sessionTitleLine}>
            <span className={sessionIdentityStyles.sessionTime}>
              {formatLiveGoodsSessionTime(session.liveStartTime)}
            </span>
            <span className={sessionIdentityStyles.sessionAnchor} title={session.anchorNickname}>
              {session.anchorNickname || '--'}
            </span>
            <span className={sessionIdentityStyles.sessionTag}>{formatLiveGoodsAnchorType(session.anchorType)}</span>
          </div>
          <span className={sessionIdentityStyles.sessionSub} title={session.anchorDouyinId}>
            抖音号 {session.anchorDouyinId || '--'}
          </span>
        </div>
        <div className={sessionKpiStyles.sessionKpis}>
          <span className={sessionKpiStyles.sessionKpiItem}>
            <b className={sessionKpiStyles.sessionKpiValue}>{session.productCount}</b>
            商品
          </span>
          <span className={`${sessionKpiStyles.sessionKpiItem} ${sessionKpiStyles.sessionKpiPrimary}`}>
            <b className={sessionKpiStyles.sessionKpiValue}>{formatCompactWanCurrency(session.totalPayAmount)}</b>
            支付金额
          </span>
          <span className={sessionKpiStyles.sessionKpiItem}>
            <b className={sessionKpiStyles.sessionKpiValue}>{formatTableInteger(session.totalSalesVolume)}</b>
            成交件数
          </span>
          <span className={sessionKpiStyles.sessionKpiItem}>
            <b className={sessionKpiStyles.sessionKpiValue}>{formatTableInteger(session.totalBuyerCount)}</b>
            成交人数
          </span>
          <span
            className={`${sessionKpiStyles.sessionKpiItem}${
              session.totalRefundAmount === 0 ? ` ${sessionKpiStyles.sessionKpiMuted}` : ''
            }`}
          >
            <b className={sessionKpiStyles.sessionKpiValue}>{formatCompactWanCurrency(session.totalRefundAmount)}</b>
            退款金额
          </span>
        </div>
        <span className={sessionActionStyles.sessionChevron}>{isExpanded ? '收起' : '展开'}</span>
      </button>

      {isExpanded ? (
        <div className={productStyles.productList}>
          {session.productRows.map((row, index) => (
            <DashboardLiveGoodsProductCard
              key={row.key}
              row={row}
              rank={index + 1}
              isLast={index === session.productRows.length - 1}
              isExpanded={expandedProductKeys.includes(row.key)}
              sessionTotalPayAmount={session.totalPayAmount}
              sessionMaxProductPayAmount={session.maxProductPayAmount}
              onToggleProduct={onToggleProduct}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
