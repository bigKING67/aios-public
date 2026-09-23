import {
  formatCompactWanCurrency,
  formatTableInteger,
} from './dashboard-formatters';
import skuStyles from './dashboard-live-goods-sku.module.css';
import skuGridStyles from './dashboard-live-goods-sku-grid.module.css';
import type { DashboardLiveGoodsRow } from './dashboard-types';

type DashboardLiveGoodsSkuPanelProps = {
  skuRows: DashboardLiveGoodsRow[];
};

function renderLiveGoodsSkuName(rawName: string) {
  const name = rawName?.trim();
  if (!name) {
    return '--';
  }

  const prefix = '套餐名称：';
  if (!name.startsWith(prefix)) {
    return name;
  }

  const skuName = name.slice(prefix.length).trim();
  return (
    <>
      <span className={skuGridStyles.skuPrefix}>{prefix}</span>
      {skuName || '--'}
    </>
  );
}

export function DashboardLiveGoodsSkuPanel({ skuRows }: DashboardLiveGoodsSkuPanelProps) {
  return (
    <div className={skuStyles.skuPanel}>
      <div className={skuGridStyles.skuHeader}>
        <span className={skuGridStyles.skuCell}>SKU名称</span>
        <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuNumericCell}`}>支付金额</span>
        <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuNumericCell}`}>件数</span>
        <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuNumericCell}`}>买家</span>
        <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuNumericCell}`}>订单</span>
        <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuNumericCell}`}>退款</span>
      </div>
      {skuRows.map((sku) => (
        <div key={sku.key} className={skuGridStyles.skuRow}>
          <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuName}`} title={sku.sku_name}>
            {renderLiveGoodsSkuName(sku.sku_name)}
          </span>
          <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuNumericValue}`}>
            {formatCompactWanCurrency(sku.product_user_pay_amount)}
          </span>
          <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuNumericValue}`}>
            {formatTableInteger(sku.product_sales_volume)}
          </span>
          <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuNumericValue}`}>
            {formatTableInteger(sku.product_buyer_count)}
          </span>
          <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuNumericValue}`}>
            {formatTableInteger(sku.product_order_count)}
          </span>
          <span className={`${skuGridStyles.skuCell} ${skuGridStyles.skuNumericValue}`}>
            {formatCompactWanCurrency(sku.refund_amount)}
          </span>
        </div>
      ))}
    </div>
  );
}
