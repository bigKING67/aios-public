use super::super::types::DashboardLiveGoodsMetricRow;

pub(super) fn live_goods_group_key(row: &DashboardLiveGoodsMetricRow) -> String {
    format!(
        "{}|{}|{}|{}",
        row.shop_id, row.anchor_douyin_id, row.live_start_time, row.product_id
    )
}

pub(super) fn is_live_goods_summary_row(row: &DashboardLiveGoodsMetricRow) -> bool {
    row.sku_row_type == "product_summary" || row.sku_name.trim() == "汇总"
}

pub(super) fn live_goods_row_key(row: &DashboardLiveGoodsMetricRow) -> String {
    if is_live_goods_summary_row(row) {
        format!("LG|{}|summary", live_goods_group_key(row))
    } else {
        format!("LG|{}|sku|{}", live_goods_group_key(row), row.sku_name)
    }
}
