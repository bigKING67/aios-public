import type { Key } from 'react';

import {
  formatCompactWanCurrency,
  formatTableInteger,
  formatTableRate,
} from './dashboard-formatters';
import { DashboardLiveGoodsSkuPanel } from './dashboard-live-goods-sku-panel';
import { toLiveGoodsNumber } from './dashboard-live-goods-formatters';
import productContributionStyles from './dashboard-live-goods-product-contribution.module.css';
import productIdentityStyles from './dashboard-live-goods-product-identity.module.css';
import productMetricItemStyles from './dashboard-live-goods-product-metric-item.module.css';
import productMetricStyles from './dashboard-live-goods-product-metrics.module.css';
import productMetaStyles from './dashboard-live-goods-product-meta.module.css';
import productMutedSummaryStyles from './dashboard-live-goods-product-muted-summary.module.css';
import productStyles from './dashboard-live-goods-product.module.css';
import productSignalPillStyles from './dashboard-live-goods-product-signal-pills.module.css';
import productSignalStyles from './dashboard-live-goods-product-signals.module.css';
import skuStyles from './dashboard-live-goods-sku.module.css';
import type { DashboardLiveGoodsRow } from './dashboard-types';

type DashboardLiveGoodsProductCardProps = {
  row: DashboardLiveGoodsRow;
  rank: number;
  isLast: boolean;
  isExpanded: boolean;
  sessionTotalPayAmount: number;
  sessionMaxProductPayAmount: number;
  onToggleProduct: (key: Key) => void;
};

export function DashboardLiveGoodsProductCard({
  row,
  rank,
  isLast,
  isExpanded,
  sessionTotalPayAmount,
  sessionMaxProductPayAmount,
  onToggleProduct,
}: DashboardLiveGoodsProductCardProps) {
  const skuRows = row.children || [];
  const productPayAmount = toLiveGoodsNumber(row.product_user_pay_amount);
  const productSalesVolume = toLiveGoodsNumber(row.product_sales_volume);
  const productBuyerCount = toLiveGoodsNumber(row.product_buyer_count);
  const productOrderCount = toLiveGoodsNumber(row.product_order_count);
  const productRefundAmount = toLiveGoodsNumber(row.refund_amount);
  const productRefundOrderCount = toLiveGoodsNumber(row.refund_order_count);
  const hasProductSales =
    productPayAmount > 0 || productSalesVolume > 0 || productBuyerCount > 0 || productOrderCount > 0;
  const isProductMuted = !hasProductSales;
  const contribution = sessionTotalPayAmount > 0 ? productPayAmount / sessionTotalPayAmount : null;
  const contributionWidth =
    sessionMaxProductPayAmount > 0
      ? Math.max(4, Math.min(100, (productPayAmount / sessionMaxProductPayAmount) * 100))
      : 0;

  return (
    <article
      className={`${productStyles.productCard}${
        isProductMuted ? ` ${productStyles.productCardMuted}` : ''
      }${isLast ? ` ${productStyles.productCardLast}` : ''}`}
    >
      <div className={productIdentityStyles.productMain}>
        <span
          className={`${productIdentityStyles.productRank} ${
            isProductMuted ? productIdentityStyles.productRankMuted : ''
          }`}
        >
          {rank}
        </span>
        <div
          className={`${productIdentityStyles.productText} ${
            isProductMuted ? productIdentityStyles.productTextMuted : ''
          }`}
        >
          <strong
            className={`${productIdentityStyles.productName}${
              isProductMuted ? ` ${productIdentityStyles.productNameMuted}` : ''
            }`}
            title={row.product_name}
          >
            {row.product_name?.trim() || '(未命名商品)'}
          </strong>
          <div
            className={`${productMetaStyles.productMeta} ${
              isProductMuted ? productMetaStyles.productMetaMuted : ''
            }`}
          >
            <span className={`${productMetaStyles.productMetaItem} ${productMetaStyles.productMetaId}`} title={row.product_id}>
              {`ID ${row.product_id || '--'}`}
            </span>
            <span className={productMetaStyles.productMetaItem}>{`${skuRows.length} 个 SKU`}</span>
            {row.shop_name ? (
              <span className={productMetaStyles.productMetaItem} title={row.shop_name}>
                {row.shop_name}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {hasProductSales ? (
        <div className={productMetricStyles.productMetrics}>
          <span className={`${productMetricItemStyles.metricItem} ${productMetricItemStyles.metricItemPrimary}`}>
            <b className={`${productMetricItemStyles.metricValue} ${productMetricItemStyles.metricValuePrimary}`}>
              {formatCompactWanCurrency(productPayAmount)}
            </b>
            支付金额
          </span>
          <span className={productMetricItemStyles.metricItem}>
            <b className={productMetricItemStyles.metricValue}>{formatTableInteger(productSalesVolume)}</b>
            件数
          </span>
          <span className={productMetricItemStyles.metricItem}>
            <b className={productMetricItemStyles.metricValue}>{formatTableInteger(productBuyerCount)}</b>
            买家
          </span>
          <span className={productMetricItemStyles.metricItem}>
            <b className={productMetricItemStyles.metricValue}>{formatTableInteger(productOrderCount)}</b>
            订单
          </span>
        </div>
      ) : (
        <div className={productMutedSummaryStyles.productMutedSummary}>
          <span className={productMutedSummaryStyles.mutedSummaryBadge}>暂无成交</span>
          <span className={productMutedSummaryStyles.mutedSummaryText}>0 件 / 0 买家 / 0 订单</span>
        </div>
      )}

      <div className={productSignalStyles.productSignals}>
        <div className={productSignalPillStyles.ratePills}>
          <span className={productSignalPillStyles.signalPill}>
            {`曝光点击 ${formatTableRate(row.product_exposure_to_click_rate_user)}`}
          </span>
          <span
            className={`${productSignalPillStyles.signalPill}${
              hasProductSales ? '' : ` ${productSignalPillStyles.mutedPill}`
            }`}
          >
            {hasProductSales ? `点击成交 ${formatTableRate(row.product_click_to_pay_rate_user)}` : '未成交'}
          </span>
        </div>
        <div className={productContributionStyles.contribution}>
          {hasProductSales ? (
            <>
              <span className={productContributionStyles.contributionLabel}>
                {`GMV贡献 ${formatTableRate(contribution)}`}
              </span>
              <i className={productContributionStyles.contributionTrack}>
                <em className={productContributionStyles.contributionFill} style={{ width: `${contributionWidth}%` }} />
              </i>
            </>
          ) : (
            <span className={productContributionStyles.mutedText}>未产生 GMV 贡献</span>
          )}
        </div>
        {hasProductSales || productRefundAmount > 0 || productRefundOrderCount > 0 ? (
          <div className={productSignalPillStyles.refundLine}>
            <span
              className={`${productSignalPillStyles.signalPill}${
                productRefundAmount === 0 ? ` ${productSignalPillStyles.mutedPill}` : ''
              }`}
            >
              {`退款 ${formatCompactWanCurrency(productRefundAmount)}`}
            </span>
            <span
              className={`${productSignalPillStyles.signalPill}${
                productRefundOrderCount === 0 ? ` ${productSignalPillStyles.mutedPill}` : ''
              }`}
            >
              {`退款单 ${formatTableInteger(productRefundOrderCount)}`}
            </span>
          </div>
        ) : null}
        {skuRows.length ? (
          <button
            type="button"
            className={skuStyles.skuToggle}
            aria-expanded={isExpanded}
            onClick={() => onToggleProduct(row.key)}
          >
            {isExpanded ? '收起 SKU 明细' : '展开 SKU 明细'}
          </button>
        ) : null}
      </div>

      {isExpanded && skuRows.length ? <DashboardLiveGoodsSkuPanel skuRows={skuRows} /> : null}
    </article>
  );
}
