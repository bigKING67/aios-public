use sqlx::PgPool;
use tracing::error;

use crate::{
    error::{AppError, AppResult},
    reports::summary_storage::is_undefined_table,
};

use super::{items::build_source_items, row_mapping::build_source_map};

pub(in crate::reports::weekly_douyin_card_ads) async fn query_source_items(
    pool: &PgPool,
    normalized_week_period: &str,
    diagnosis_product_id: &str,
) -> AppResult<Option<Vec<serde_json::Value>>> {
    let source_rows = match sqlx::query(
        r#"
        SELECT
            COALESCE(source_level1, '未知来源') AS source_level1,
            curr_card_exposure_user_count,
            prev_card_exposure_user_count,
            curr_card_click_user_count,
            prev_card_click_user_count,
            curr_card_buyer_count,
            prev_card_buyer_count,
            curr_card_cart_user_count,
            prev_card_cart_user_count,
            curr_card_favorite_user_count,
            prev_card_favorite_user_count,
            curr_card_bounce_user_count,
            prev_card_bounce_user_count,
            curr_card_order_count,
            prev_card_order_count,
            curr_card_user_pay_amount,
            prev_card_user_pay_amount,
            card_user_pay_amount_delta
        FROM ads.report_douyin_trade_sale_card_metrics_week
        WHERE week_period = $1
          AND metric_scope = 'source'
          AND product_id = $2
        "#,
    )
    .bind(normalized_week_period)
    .bind(diagnosis_product_id)
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(
                ?error,
                "query ads douyin card source attribution rows failed"
            );
            return Err(AppError::Internal);
        }
    };

    let source_map = build_source_map(source_rows);
    Ok(Some(build_source_items(&source_map)))
}
