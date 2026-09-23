use serde_json::json;
use sqlx::{PgPool, Row};
use tracing::error;

use super::types::ProductAttributionItems;
use crate::{
    error::{AppError, AppResult},
    reports::summary_storage::is_undefined_table,
};

pub(super) async fn query_product_attribution_items(
    pool: &PgPool,
    normalized_week_period: &str,
) -> AppResult<Option<ProductAttributionItems>> {
    let product_rows = match sqlx::query(
        r#"
        SELECT
            COALESCE(product_id, '') AS product_id,
            COALESCE(product_title, '(未命名商品)') AS product_title,
            product_url,
            curr_card_user_pay_amount,
            prev_card_user_pay_amount,
            card_user_pay_amount_delta,
            curr_card_order_count,
            prev_card_order_count,
            curr_card_buyer_count,
            prev_card_buyer_count,
            curr_card_exposure_user_count,
            prev_card_exposure_user_count,
            curr_card_click_user_count,
            prev_card_click_user_count,
            curr_card_cart_user_count,
            prev_card_cart_user_count,
            curr_card_favorite_user_count,
            prev_card_favorite_user_count
        FROM ads.report_douyin_trade_sale_card_metrics_week
        WHERE week_period = $1
          AND metric_scope = 'product'
        ORDER BY ABS(COALESCE(card_user_pay_amount_delta, 0)) DESC, COALESCE(curr_card_user_pay_amount, 0) DESC
        LIMIT 120
        "#,
    )
    .bind(normalized_week_period)
    .fetch_all(pool)
    .await
    {
        Ok(rows) => rows,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(?error, "query ads douyin card product attribution rows failed");
            return Err(AppError::Internal);
        }
    };

    let mut diagnosis_product_id = String::new();
    let mut diagnosis_product_name = String::new();
    let mut diagnosis_score = 0.0_f64;
    let mut product_items: Vec<serde_json::Value> = Vec::with_capacity(product_rows.len());

    for row in product_rows {
        let product_id = row.try_get::<String, _>("product_id").unwrap_or_default();
        let product_title = row
            .try_get::<String, _>("product_title")
            .unwrap_or_else(|_| "(未命名商品)".to_string());
        let curr_card_user_pay_amount = row
            .try_get::<Option<f64>, _>("curr_card_user_pay_amount")
            .unwrap_or(None)
            .unwrap_or(0.0);
        let prev_card_user_pay_amount = row
            .try_get::<Option<f64>, _>("prev_card_user_pay_amount")
            .unwrap_or(None)
            .unwrap_or(0.0);
        let card_gmv_delta = row
            .try_get::<Option<f64>, _>("card_user_pay_amount_delta")
            .unwrap_or(None)
            .unwrap_or(curr_card_user_pay_amount - prev_card_user_pay_amount);
        let score = card_gmv_delta.abs();
        if score >= diagnosis_score {
            diagnosis_score = score;
            diagnosis_product_id = product_id.clone();
            diagnosis_product_name = product_title.clone();
        }

        product_items.push(json!({
            "product_id": product_id,
            "product_title": product_title,
            "product_url": row.try_get::<Option<String>, _>("product_url").unwrap_or(None),
            "curr_card_user_pay_amount": curr_card_user_pay_amount,
            "prev_card_user_pay_amount": prev_card_user_pay_amount,
            "card_gmv_delta": card_gmv_delta,
            "curr_card_order_count": row.try_get::<Option<i64>, _>("curr_card_order_count").unwrap_or(None).unwrap_or(0),
            "prev_card_order_count": row.try_get::<Option<i64>, _>("prev_card_order_count").unwrap_or(None).unwrap_or(0),
            "curr_card_buyer_count": row.try_get::<Option<i64>, _>("curr_card_buyer_count").unwrap_or(None).unwrap_or(0),
            "prev_card_buyer_count": row.try_get::<Option<i64>, _>("prev_card_buyer_count").unwrap_or(None).unwrap_or(0),
            "curr_card_exposure_user_count": row.try_get::<Option<i64>, _>("curr_card_exposure_user_count").unwrap_or(None).unwrap_or(0),
            "prev_card_exposure_user_count": row.try_get::<Option<i64>, _>("prev_card_exposure_user_count").unwrap_or(None).unwrap_or(0),
            "curr_card_click_user_count": row.try_get::<Option<i64>, _>("curr_card_click_user_count").unwrap_or(None).unwrap_or(0),
            "prev_card_click_user_count": row.try_get::<Option<i64>, _>("prev_card_click_user_count").unwrap_or(None).unwrap_or(0),
            "curr_card_cart_user_count": row.try_get::<Option<i64>, _>("curr_card_cart_user_count").unwrap_or(None).unwrap_or(0),
            "prev_card_cart_user_count": row.try_get::<Option<i64>, _>("prev_card_cart_user_count").unwrap_or(None).unwrap_or(0),
            "curr_card_favorite_user_count": row.try_get::<Option<i64>, _>("curr_card_favorite_user_count").unwrap_or(None).unwrap_or(0),
            "prev_card_favorite_user_count": row.try_get::<Option<i64>, _>("prev_card_favorite_user_count").unwrap_or(None).unwrap_or(0)
        }));
    }

    Ok(Some(ProductAttributionItems {
        diagnosis_product_id,
        diagnosis_product_name,
        product_items,
    }))
}
