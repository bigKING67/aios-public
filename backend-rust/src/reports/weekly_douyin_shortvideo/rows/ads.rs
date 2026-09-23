use serde_json::{json, Value};
use sqlx::{postgres::PgRow, Row};

use super::helpers::format_publish_time;

pub(in crate::reports::weekly_douyin_shortvideo) fn map_ads_rows(rows: Vec<PgRow>) -> Vec<Value> {
    let mut items: Vec<Value> = Vec::with_capacity(rows.len());
    for row in rows {
        let curr_user_pay_amount = row
            .try_get::<Option<f64>, _>("curr_user_pay_amount")
            .unwrap_or(None)
            .unwrap_or(0.0);
        let prev_user_pay_amount = row
            .try_get::<Option<f64>, _>("prev_user_pay_amount")
            .unwrap_or(None)
            .unwrap_or(0.0);
        let user_pay_amount_delta = row
            .try_get::<Option<f64>, _>("user_pay_amount_delta")
            .unwrap_or(None)
            .unwrap_or(curr_user_pay_amount - prev_user_pay_amount);

        items.push(json!({
            "video_id": row.try_get::<String, _>("video_id").unwrap_or_default(),
            "author_douyin_id": row.try_get::<String, _>("author_douyin_id").unwrap_or_default(),
            "video_title": row.try_get::<String, _>("video_title").unwrap_or_else(|_| "(未命名短视频)".to_string()),
            "author_nickname": row.try_get::<String, _>("author_nickname").unwrap_or_else(|_| "(未知达人)".to_string()),
            "product_id": row.try_get::<String, _>("product_id").unwrap_or_else(|_| "--".to_string()),
            "publish_time": format_publish_time(&row),
            "is_promoted": row.try_get::<String, _>("is_promoted").unwrap_or_default(),
            "play_url": row.try_get::<Option<String>, _>("play_url").unwrap_or(None),
            "curr_video_view_count": row.try_get::<Option<i64>, _>("curr_video_view_count").unwrap_or(None).unwrap_or(0),
            "prev_video_view_count": row.try_get::<Option<i64>, _>("prev_video_view_count").unwrap_or(None).unwrap_or(0),
            "curr_user_pay_amount": curr_user_pay_amount,
            "prev_user_pay_amount": prev_user_pay_amount,
            "user_pay_amount_delta": user_pay_amount_delta,
            "curr_refund_amount": row.try_get::<Option<f64>, _>("curr_refund_amount").unwrap_or(None).unwrap_or(0.0),
            "prev_refund_amount": row.try_get::<Option<f64>, _>("prev_refund_amount").unwrap_or(None).unwrap_or(0.0),
            "curr_live_room_pay_amount": row.try_get::<Option<f64>, _>("curr_live_room_pay_amount").unwrap_or(None).unwrap_or(0.0),
            "prev_live_room_pay_amount": row.try_get::<Option<f64>, _>("prev_live_room_pay_amount").unwrap_or(None).unwrap_or(0.0),
            "curr_search_after_view_pay_amount": row.try_get::<Option<f64>, _>("curr_search_after_view_pay_amount").unwrap_or(None).unwrap_or(0.0),
            "prev_search_after_view_pay_amount": row.try_get::<Option<f64>, _>("prev_search_after_view_pay_amount").unwrap_or(None).unwrap_or(0.0),
            "curr_shop_page_pay_amount": row.try_get::<Option<f64>, _>("curr_shop_page_pay_amount").unwrap_or(None).unwrap_or(0.0),
            "prev_shop_page_pay_amount": row.try_get::<Option<f64>, _>("prev_shop_page_pay_amount").unwrap_or(None).unwrap_or(0.0)
        }));
    }
    items
}
