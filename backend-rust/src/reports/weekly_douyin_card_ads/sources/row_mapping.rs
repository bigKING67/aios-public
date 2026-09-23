use std::collections::HashMap;

use serde_json::json;
use sqlx::Row;

pub(super) fn build_source_map(
    rows: Vec<sqlx::postgres::PgRow>,
) -> HashMap<String, serde_json::Value> {
    let mut source_map: HashMap<String, serde_json::Value> = HashMap::with_capacity(rows.len());

    for row in rows {
        let source_level1 = row
            .try_get::<String, _>("source_level1")
            .unwrap_or_else(|_| "未知来源".to_string());
        source_map.insert(
            source_level1,
            json!({
                "curr_card_exposure_user_count": row.try_get::<Option<i64>, _>("curr_card_exposure_user_count").unwrap_or(None).unwrap_or(0),
                "prev_card_exposure_user_count": row.try_get::<Option<i64>, _>("prev_card_exposure_user_count").unwrap_or(None).unwrap_or(0),
                "curr_card_click_user_count": row.try_get::<Option<i64>, _>("curr_card_click_user_count").unwrap_or(None).unwrap_or(0),
                "prev_card_click_user_count": row.try_get::<Option<i64>, _>("prev_card_click_user_count").unwrap_or(None).unwrap_or(0),
                "curr_card_buyer_count": row.try_get::<Option<i64>, _>("curr_card_buyer_count").unwrap_or(None).unwrap_or(0),
                "prev_card_buyer_count": row.try_get::<Option<i64>, _>("prev_card_buyer_count").unwrap_or(None).unwrap_or(0),
                "curr_card_cart_user_count": row.try_get::<Option<i64>, _>("curr_card_cart_user_count").unwrap_or(None).unwrap_or(0),
                "prev_card_cart_user_count": row.try_get::<Option<i64>, _>("prev_card_cart_user_count").unwrap_or(None).unwrap_or(0),
                "curr_card_favorite_user_count": row.try_get::<Option<i64>, _>("curr_card_favorite_user_count").unwrap_or(None).unwrap_or(0),
                "prev_card_favorite_user_count": row.try_get::<Option<i64>, _>("prev_card_favorite_user_count").unwrap_or(None).unwrap_or(0),
                "curr_card_bounce_user_count": row.try_get::<Option<i64>, _>("curr_card_bounce_user_count").unwrap_or(None).unwrap_or(0),
                "prev_card_bounce_user_count": row.try_get::<Option<i64>, _>("prev_card_bounce_user_count").unwrap_or(None).unwrap_or(0),
                "curr_card_order_count": row.try_get::<Option<i64>, _>("curr_card_order_count").unwrap_or(None).unwrap_or(0),
                "prev_card_order_count": row.try_get::<Option<i64>, _>("prev_card_order_count").unwrap_or(None).unwrap_or(0),
                "curr_card_user_pay_amount": row.try_get::<Option<f64>, _>("curr_card_user_pay_amount").unwrap_or(None).unwrap_or(0.0),
                "prev_card_user_pay_amount": row.try_get::<Option<f64>, _>("prev_card_user_pay_amount").unwrap_or(None).unwrap_or(0.0),
                "card_user_pay_amount_delta": row.try_get::<Option<f64>, _>("card_user_pay_amount_delta").unwrap_or(None).unwrap_or(0.0)
            }),
        );
    }

    source_map
}
