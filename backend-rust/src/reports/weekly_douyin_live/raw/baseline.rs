use std::collections::HashMap;

use serde_json::json;
use sqlx::{postgres::PgRow, Row};

pub(super) type BaselineMap = HashMap<String, serde_json::Value>;

pub(super) fn build_prev_baseline_map(rows: Vec<PgRow>) -> BaselineMap {
    let mut prev_baseline_map: BaselineMap = HashMap::with_capacity(rows.len());

    for row in rows {
        let shop_id = row.try_get::<String, _>("shop_id").unwrap_or_default();
        let anchor_douyin_id = row
            .try_get::<String, _>("anchor_douyin_id")
            .unwrap_or_default();
        let key = format!("{shop_id}|{anchor_douyin_id}");
        prev_baseline_map.insert(
            key,
            json!({
                "prev_live_gmv": row.try_get::<Option<f64>, _>("prev_live_gmv").unwrap_or(None).unwrap_or(0.0),
                "prev_live_order_count": row.try_get::<Option<f64>, _>("prev_live_order_count").unwrap_or(None).unwrap_or(0.0),
                "prev_live_exposure_user_count": row.try_get::<Option<f64>, _>("prev_live_exposure_user_count").unwrap_or(None).unwrap_or(0.0),
                "prev_live_watch_user_count": row.try_get::<Option<f64>, _>("prev_live_watch_user_count").unwrap_or(None).unwrap_or(0.0),
                "prev_live_product_exposure_user": row.try_get::<Option<f64>, _>("prev_live_product_exposure_user").unwrap_or(None).unwrap_or(0.0),
                "prev_live_product_click_user": row.try_get::<Option<f64>, _>("prev_live_product_click_user").unwrap_or(None).unwrap_or(0.0),
                "prev_live_buyer_count": row.try_get::<Option<f64>, _>("prev_live_buyer_count").unwrap_or(None).unwrap_or(0.0),
                "prev_live_duration_minutes": row.try_get::<Option<f64>, _>("prev_live_duration_minutes").unwrap_or(None).unwrap_or(0.0),
                "prev_live_user_pay_amount": row.try_get::<Option<f64>, _>("prev_live_user_pay_amount").unwrap_or(None).unwrap_or(0.0),
                "prev_live_ad_cost": row.try_get::<Option<f64>, _>("prev_live_ad_cost").unwrap_or(None).unwrap_or(0.0),
                "prev_comment_count": row.try_get::<Option<f64>, _>("prev_comment_count").unwrap_or(None).unwrap_or(0.0),
                "prev_new_follower_count": row.try_get::<Option<f64>, _>("prev_new_follower_count").unwrap_or(None).unwrap_or(0.0),
                "prev_product_count": row.try_get::<Option<f64>, _>("prev_product_count").unwrap_or(None).unwrap_or(0.0),
            }),
        );
    }

    prev_baseline_map
}
