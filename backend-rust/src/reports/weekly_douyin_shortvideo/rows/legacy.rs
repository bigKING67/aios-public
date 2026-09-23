use std::collections::HashMap;

use serde_json::{json, Value};
use sqlx::{postgres::PgRow, Row};

use super::helpers::{format_publish_time, read_f64, read_i64, video_key};

pub(in crate::reports::weekly_douyin_shortvideo) fn build_legacy_items(
    prev_rows: Vec<PgRow>,
    current_rows: Vec<PgRow>,
) -> Vec<Value> {
    let mut prev_map: HashMap<String, Value> = HashMap::with_capacity(prev_rows.len());
    for row in prev_rows {
        let video_id = row.try_get::<String, _>("video_id").unwrap_or_default();
        let author_douyin_id = row
            .try_get::<String, _>("author_douyin_id")
            .unwrap_or_default();
        prev_map.insert(
            video_key(video_id.as_str(), author_douyin_id.as_str()),
            json!({
                "prev_video_view_count": row.try_get::<Option<i64>, _>("prev_video_view_count").unwrap_or(None).unwrap_or(0),
                "prev_user_pay_amount": row.try_get::<Option<f64>, _>("prev_user_pay_amount").unwrap_or(None).unwrap_or(0.0),
                "prev_refund_amount": row.try_get::<Option<f64>, _>("prev_refund_amount").unwrap_or(None).unwrap_or(0.0),
                "prev_live_room_pay_amount": row.try_get::<Option<f64>, _>("prev_live_room_pay_amount").unwrap_or(None).unwrap_or(0.0),
                "prev_search_after_view_pay_amount": row.try_get::<Option<f64>, _>("prev_search_after_view_pay_amount").unwrap_or(None).unwrap_or(0.0),
                "prev_shop_page_pay_amount": row.try_get::<Option<f64>, _>("prev_shop_page_pay_amount").unwrap_or(None).unwrap_or(0.0),
            }),
        );
    }

    let mut items_with_score: Vec<(f64, Value)> = Vec::with_capacity(current_rows.len());
    for row in current_rows {
        let video_id = row.try_get::<String, _>("video_id").unwrap_or_default();
        let author_douyin_id = row
            .try_get::<String, _>("author_douyin_id")
            .unwrap_or_default();
        let key = video_key(video_id.as_str(), author_douyin_id.as_str());
        let baseline = prev_map.get(&key);

        let curr_video_view_count = row.try_get::<i64, _>("curr_video_view_count").unwrap_or(0);
        let curr_user_pay_amount = row.try_get::<f64, _>("curr_user_pay_amount").unwrap_or(0.0);
        let curr_refund_amount = row.try_get::<f64, _>("curr_refund_amount").unwrap_or(0.0);
        let curr_live_room_pay_amount = row
            .try_get::<f64, _>("curr_live_room_pay_amount")
            .unwrap_or(0.0);
        let curr_search_after_view_pay_amount = row
            .try_get::<f64, _>("curr_search_after_view_pay_amount")
            .unwrap_or(0.0);
        let curr_shop_page_pay_amount = row
            .try_get::<f64, _>("curr_shop_page_pay_amount")
            .unwrap_or(0.0);

        let prev_video_view_count = read_i64(baseline, "prev_video_view_count");
        let prev_user_pay_amount = read_f64(baseline, "prev_user_pay_amount");
        let prev_refund_amount = read_f64(baseline, "prev_refund_amount");
        let prev_live_room_pay_amount = read_f64(baseline, "prev_live_room_pay_amount");
        let prev_search_after_view_pay_amount =
            read_f64(baseline, "prev_search_after_view_pay_amount");
        let prev_shop_page_pay_amount = read_f64(baseline, "prev_shop_page_pay_amount");
        let pay_amount_delta = curr_user_pay_amount - prev_user_pay_amount;

        items_with_score.push((
            pay_amount_delta.abs(),
            json!({
                "video_id": video_id,
                "author_douyin_id": author_douyin_id,
                "video_title": row.try_get::<String, _>("video_title").unwrap_or_else(|_| "(未命名短视频)".to_string()),
                "author_nickname": row.try_get::<String, _>("author_nickname").unwrap_or_else(|_| "(未知达人)".to_string()),
                "product_id": row.try_get::<String, _>("product_id").unwrap_or_else(|_| "--".to_string()),
                "publish_time": format_publish_time(&row),
                "is_promoted": row.try_get::<String, _>("is_promoted").unwrap_or_default(),
                "play_url": row.try_get::<Option<String>, _>("play_url").unwrap_or(None),
                "curr_video_view_count": curr_video_view_count,
                "prev_video_view_count": prev_video_view_count,
                "curr_user_pay_amount": curr_user_pay_amount,
                "prev_user_pay_amount": prev_user_pay_amount,
                "user_pay_amount_delta": pay_amount_delta,
                "curr_refund_amount": curr_refund_amount,
                "prev_refund_amount": prev_refund_amount,
                "curr_live_room_pay_amount": curr_live_room_pay_amount,
                "prev_live_room_pay_amount": prev_live_room_pay_amount,
                "curr_search_after_view_pay_amount": curr_search_after_view_pay_amount,
                "prev_search_after_view_pay_amount": prev_search_after_view_pay_amount,
                "curr_shop_page_pay_amount": curr_shop_page_pay_amount,
                "prev_shop_page_pay_amount": prev_shop_page_pay_amount
            }),
        ));
    }

    items_with_score.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    items_with_score.into_iter().map(|(_, item)| item).collect()
}
