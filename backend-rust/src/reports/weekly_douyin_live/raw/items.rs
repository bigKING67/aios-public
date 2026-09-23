use serde_json::json;
use sqlx::{postgres::PgRow, Row};

use super::super::super::metrics::safe_ratio;
use super::baseline::BaselineMap;

pub(super) fn build_live_items(
    current_rows: Vec<PgRow>,
    prev_baseline_map: &BaselineMap,
) -> Vec<serde_json::Value> {
    let mut items_with_score: Vec<(f64, serde_json::Value)> =
        Vec::with_capacity(current_rows.len());

    for row in current_rows {
        let shop_name = row
            .try_get::<String, _>("shop_name")
            .unwrap_or_else(|_| "(未知店铺)".to_string());
        let shop_id = row.try_get::<String, _>("shop_id").unwrap_or_default();
        let anchor_nickname = row
            .try_get::<String, _>("anchor_nickname")
            .unwrap_or_else(|_| "(未知主播)".to_string());
        let anchor_douyin_id = row
            .try_get::<String, _>("anchor_douyin_id")
            .unwrap_or_default();
        let live_start_time = row
            .try_get::<Option<chrono::NaiveDateTime>, _>("live_start_time")
            .unwrap_or(None);
        let live_end_time = row
            .try_get::<Option<chrono::NaiveDateTime>, _>("live_end_time")
            .unwrap_or(None);
        let curr_live_duration_minutes =
            row.try_get::<i64, _>("live_duration_minutes").unwrap_or(0);
        let curr_live_exposure_user_count = row
            .try_get::<i64, _>("live_exposure_user_count")
            .unwrap_or(0);
        let curr_live_watch_user_count =
            row.try_get::<i64, _>("live_watch_user_count").unwrap_or(0);
        let curr_live_product_exposure_user = row
            .try_get::<i64, _>("live_product_exposure_user")
            .unwrap_or(0);
        let curr_live_product_click_user = row
            .try_get::<i64, _>("live_product_click_user")
            .unwrap_or(0);
        let curr_live_buyer_count = row.try_get::<i64, _>("live_buyer_count").unwrap_or(0);
        let curr_live_order_count = row.try_get::<i64, _>("live_order_count").unwrap_or(0);
        let curr_live_gmv = row.try_get::<f64, _>("live_gmv").unwrap_or(0.0);
        let curr_live_user_pay_amount =
            row.try_get::<f64, _>("live_user_pay_amount").unwrap_or(0.0);
        let curr_live_ad_cost = row.try_get::<f64, _>("live_ad_cost").unwrap_or(0.0);
        let curr_comment_count = row.try_get::<i64, _>("comment_count").unwrap_or(0);
        let curr_new_follower_count = row.try_get::<i64, _>("new_follower_count").unwrap_or(0);
        let curr_product_count = row.try_get::<i64, _>("product_count").unwrap_or(0);

        let baseline_key = format!("{shop_id}|{anchor_douyin_id}");
        let baseline = prev_baseline_map.get(&baseline_key);

        let prev_live_gmv = baseline_value(baseline, "prev_live_gmv");
        let prev_live_order_count = baseline_value(baseline, "prev_live_order_count");
        let prev_live_exposure_user_count =
            baseline_value(baseline, "prev_live_exposure_user_count");
        let prev_live_watch_user_count = baseline_value(baseline, "prev_live_watch_user_count");
        let prev_live_product_exposure_user =
            baseline_value(baseline, "prev_live_product_exposure_user");
        let prev_live_product_click_user = baseline_value(baseline, "prev_live_product_click_user");
        let prev_live_buyer_count = baseline_value(baseline, "prev_live_buyer_count");
        let prev_live_duration_minutes = baseline_value(baseline, "prev_live_duration_minutes");
        let prev_live_user_pay_amount = baseline_value(baseline, "prev_live_user_pay_amount");
        let prev_live_ad_cost = baseline_value(baseline, "prev_live_ad_cost");
        let prev_comment_count = baseline_value(baseline, "prev_comment_count");
        let prev_new_follower_count = baseline_value(baseline, "prev_new_follower_count");
        let prev_product_count = baseline_value(baseline, "prev_product_count");

        let curr_avg_order_value = safe_ratio(curr_live_gmv, curr_live_buyer_count as f64);
        let prev_avg_order_value = safe_ratio(prev_live_gmv, prev_live_buyer_count);
        let live_gmv_delta = curr_live_gmv - prev_live_gmv;

        let start_time_label = live_start_time
            .map(|value| value.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_else(|| "--".to_string());
        let end_time_label = live_end_time
            .map(|value| value.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_else(|| "--".to_string());
        let session_id = format!("{shop_id}|{anchor_douyin_id}|{start_time_label}");

        items_with_score.push((
            live_gmv_delta.abs(),
            json!({
                "session_id": session_id,
                "shop_name": shop_name,
                "shop_id": shop_id,
                "anchor_nickname": anchor_nickname,
                "anchor_douyin_id": anchor_douyin_id,
                "live_start_time": start_time_label,
                "live_end_time": end_time_label,
                "curr_live_duration_minutes": curr_live_duration_minutes,
                "prev_live_duration_minutes": prev_live_duration_minutes,
                "curr_live_exposure_user_count": curr_live_exposure_user_count,
                "prev_live_exposure_user_count": prev_live_exposure_user_count,
                "curr_live_watch_user_count": curr_live_watch_user_count,
                "prev_live_watch_user_count": prev_live_watch_user_count,
                "curr_live_product_exposure_user": curr_live_product_exposure_user,
                "prev_live_product_exposure_user": prev_live_product_exposure_user,
                "curr_live_product_click_user": curr_live_product_click_user,
                "prev_live_product_click_user": prev_live_product_click_user,
                "curr_live_buyer_count": curr_live_buyer_count,
                "prev_live_buyer_count": prev_live_buyer_count,
                "curr_live_order_count": curr_live_order_count,
                "prev_live_order_count": prev_live_order_count,
                "curr_live_gmv": curr_live_gmv,
                "prev_live_gmv": prev_live_gmv,
                "live_gmv_delta": live_gmv_delta,
                "curr_live_user_pay_amount": curr_live_user_pay_amount,
                "prev_live_user_pay_amount": prev_live_user_pay_amount,
                "curr_live_ad_cost": curr_live_ad_cost,
                "prev_live_ad_cost": prev_live_ad_cost,
                "curr_comment_count": curr_comment_count,
                "prev_comment_count": prev_comment_count,
                "curr_new_follower_count": curr_new_follower_count,
                "prev_new_follower_count": prev_new_follower_count,
                "curr_product_count": curr_product_count,
                "prev_product_count": prev_product_count,
                "curr_avg_order_value": curr_avg_order_value,
                "prev_avg_order_value": prev_avg_order_value
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

fn baseline_value(baseline: Option<&serde_json::Value>, key: &str) -> f64 {
    baseline
        .and_then(|value| value.get(key))
        .and_then(|value| value.as_f64())
        .unwrap_or(0.0)
}
