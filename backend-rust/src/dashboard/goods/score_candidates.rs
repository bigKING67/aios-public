use super::super::goods_score::GoodsScoreCandidate;
use super::metrics::DashboardGoodsMetricRow;

pub(in crate::dashboard) fn build_goods_score_candidates(
    rows: &[DashboardGoodsMetricRow],
) -> Vec<GoodsScoreCandidate> {
    rows.iter()
        .map(|row| GoodsScoreCandidate {
            product_id: row.product_id.clone(),
            product_name: row.product_name.clone(),
            curr_gmv: row.curr_gmv,
            curr_gsv: row.curr_gsv,
            refund_amount: row.curr_refund_amount,
            sales_share: row.sales_share.unwrap_or(0.0),
            pay_conversion_rate: row.pay_conversion_rate.unwrap_or(0.0),
            avg_order_value: row.avg_order_value.unwrap_or(0.0),
            gmv_wow: row.gmv_wow.unwrap_or(0.0),
            pay_buyer_wow: row.pay_buyer_wow.unwrap_or(0.0),
            visitor_wow: row.visitor_wow.unwrap_or(0.0),
            visitor_count: row.curr_visitor_count,
            pay_buyer_count: row.curr_pay_buyer_count,
        })
        .filter(|candidate| candidate.curr_gmv > f64::EPSILON)
        .collect()
}
