use super::super::types::DashboardLiveGoodsMetricRow;

pub(super) fn aggregate_live_goods_summary_rows(
    rows: &[DashboardLiveGoodsMetricRow],
) -> Option<DashboardLiveGoodsMetricRow> {
    let mut aggregated = rows.first()?.clone();
    aggregated.sku_name = "汇总".to_string();
    aggregated.sku_row_type = "product_summary".to_string();
    aggregated.product_user_pay_amount = 0.0;
    aggregated.product_sales_volume = 0.0;
    aggregated.product_buyer_count = 0.0;
    aggregated.product_order_count = 0.0;
    aggregated.presale_order_count = 0.0;
    aggregated.presale_full_amount = 0.0;
    aggregated.product_exposure_user_count = 0.0;
    aggregated.product_click_user_count = 0.0;
    aggregated.product_exposure_to_click_rate_user = 0.0;
    aggregated.product_click_to_pay_rate_user = 0.0;
    aggregated.refund_user_count = 0.0;
    aggregated.refund_amount = 0.0;
    aggregated.refund_order_count = 0.0;
    aggregated.product_image_url = rows
        .iter()
        .find_map(|row| {
            let value = row.product_image_url.trim();
            if value.is_empty() {
                None
            } else {
                Some(value.to_string())
            }
        })
        .unwrap_or_default();

    for row in rows {
        aggregated.product_user_pay_amount += row.product_user_pay_amount;
        aggregated.product_sales_volume += row.product_sales_volume;
        aggregated.product_buyer_count += row.product_buyer_count;
        aggregated.product_order_count += row.product_order_count;
        aggregated.presale_order_count += row.presale_order_count;
        aggregated.presale_full_amount += row.presale_full_amount;
        aggregated.product_exposure_user_count += row.product_exposure_user_count;
        aggregated.product_click_user_count += row.product_click_user_count;
        aggregated.refund_user_count += row.refund_user_count;
        aggregated.refund_amount += row.refund_amount;
        aggregated.refund_order_count += row.refund_order_count;
    }

    if aggregated.product_exposure_user_count > f64::EPSILON {
        aggregated.product_exposure_to_click_rate_user =
            aggregated.product_click_user_count / aggregated.product_exposure_user_count;
    }
    if aggregated.product_click_user_count > f64::EPSILON {
        aggregated.product_click_to_pay_rate_user =
            aggregated.product_buyer_count / aggregated.product_click_user_count;
    }

    Some(aggregated)
}
