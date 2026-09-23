import dayjs from 'dayjs';

import { escapeCsvCell } from './dashboard-formatters';
import type { DashboardLiveGoodsDetailExportRow, LiveScope } from './dashboard-types';

const LIVE_GOODS_DETAIL_EXPORT_COLUMNS = [
  { field: 'stat_date', header: '统计日期' },
  { field: 'live_start_time', header: '直播开始时间' },
  { field: 'live_end_time', header: '直播结束时间' },
  { field: 'anchor_douyin_id', header: '主播抖音号' },
  { field: 'anchor_nickname', header: '主播昵称' },
  { field: 'anchor_type', header: '主播类型' },
  { field: 'shop_id', header: '店铺ID' },
  { field: 'shop_name', header: '店铺名称' },
  { field: 'live_identity_type', header: '直播身份类型' },
  { field: 'live_duration_minutes', header: '直播时长(分钟)' },
  { field: 'product_name', header: '商品名称' },
  { field: 'product_id', header: '商品ID' },
  { field: 'sku_name', header: 'SKU名称' },
  { field: 'sku_row_type', header: '明细层级' },
  { field: 'product_image_url', header: '商品图片URL' },
  { field: 'product_user_pay_amount', header: '商品用户支付金额' },
  { field: 'product_sales_volume', header: '商品销量' },
  { field: 'product_buyer_count', header: '商品成交人数' },
  { field: 'product_order_count', header: '商品成交订单数' },
  { field: 'presale_order_count', header: '预售订单数' },
  { field: 'presale_full_amount', header: '预售全款金额' },
  { field: 'product_exposure_user_count', header: '商品曝光人数' },
  { field: 'product_click_user_count', header: '商品点击人数' },
  { field: 'product_exposure_to_click_rate_user', header: '商品曝光点击率' },
  { field: 'product_click_to_pay_rate_user', header: '商品点击成交率' },
  { field: 'refund_user_count', header: '退款人数' },
  { field: 'refund_amount', header: '退款金额' },
  { field: 'refund_order_count', header: '退款订单数' },
  { field: 'source_updated_at', header: '源数据更新时间' },
  { field: 'created_at', header: 'ADS创建时间' },
  { field: 'updated_at', header: 'ADS更新时间' },
  { field: 'influencer_avatar_url', header: '达人头像URL' },
  { field: 'influencer_nickname', header: '达人昵称' },
  { field: 'influencer_level', header: '达人等级' },
  { field: 'influencer_douyin_id', header: '达人抖音号' },
  { field: 'influencer_type', header: '达人类型' },
  { field: 'influencer_org', header: '达人机构' },
  { field: 'follower_count_before_live', header: '开播前粉丝数' },
  { field: 'live_time_range_text', header: '直播时间文本' },
  { field: 'live_duration_text', header: '直播时长文本' },
  { field: 'live_platform', header: '直播平台' },
  { field: 'live_user_pay_amount', header: '直播用户支付金额' },
  { field: 'pay_per_thousand_views', header: '千次观看成交金额' },
  { field: 'estimated_commission_cost', header: '预估佣金成本' },
  { field: 'penalty_count', header: '违规次数' },
  { field: 'source_file_name', header: '来源文件名' },
  { field: 'source_file_mtime', header: '来源文件修改时间' },
  { field: 'ingest_time', header: '入库时间' },
] as const satisfies readonly { field: keyof DashboardLiveGoodsDetailExportRow; header: string }[];

function buildLiveGoodsDetailExportRow(row: DashboardLiveGoodsDetailExportRow): string {
  return LIVE_GOODS_DETAIL_EXPORT_COLUMNS.map((column) => escapeCsvCell(row[column.field])).join(',');
}

export function buildDashboardLiveGoodsDetailCsvExport({
  rows,
  liveScope,
  startDate,
  endDate,
}: {
  rows: DashboardLiveGoodsDetailExportRow[];
  liveScope: LiveScope;
  startDate: string;
  endDate: string;
}): { csvText: string; fileName: string } {
  const csvRows = rows.map((row) => buildLiveGoodsDetailExportRow(row));
  const headers = LIVE_GOODS_DETAIL_EXPORT_COLUMNS.map((column) => column.header);
  const csvText = ['\uFEFF' + headers.join(','), ...csvRows].join('\n');
  const fileName = `dashboard-live-goods-details-${liveScope}-${startDate}_to_${endDate}-${dayjs().format(
    'YYYYMMDD-HHmmss'
  )}.csv`;

  return { csvText, fileName };
}
