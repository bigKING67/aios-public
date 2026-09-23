use sqlx::{postgres::PgRow, PgPool};

use crate::error::AppResult;

use super::fallback::query_rows_with_fallback;

const SELECTION_BASIS_QUERY: &str = r#"
    SELECT
        c.traffic_channel,
        c.curr_pay_amount::DOUBLE PRECISION AS curr_pay_amount,
        c.prev_pay_amount::DOUBLE PRECISION AS prev_pay_amount,
        c.pay_amount_delta::DOUBLE PRECISION AS pay_amount_delta,
        c.pay_amount_delta_contribution_rate::DOUBLE PRECISION AS pay_amount_delta_contribution_rate
    FROM ads.report_taobao_goods_traffic_channel_metrics_week c
    WHERE c.week_period = $1
      AND c.platform = 'taobao'
      AND c.product_id = $2
      AND (c.curr_pay_amount <> 0 OR c.prev_pay_amount <> 0)
    ORDER BY c.curr_pay_amount DESC, c.pay_amount_delta DESC, c.traffic_channel
"#;

pub(super) async fn load_selection_basis_rows(
    pool: &PgPool,
    week_period: &str,
    product_id: &str,
) -> AppResult<Vec<PgRow>> {
    query_rows_with_fallback(
        pool,
        SELECTION_BASIS_QUERY,
        week_period,
        product_id,
        "weekly goods channel funnel diagnosis selection basis table missing, fallback to funnel rows",
        "query weekly goods channel funnel diagnosis selection basis failed",
    )
    .await
}
