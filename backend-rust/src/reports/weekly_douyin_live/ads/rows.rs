use chrono::NaiveDateTime;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use tracing::error;

use crate::error::{AppError, AppResult};

use super::super::super::{metrics::safe_ratio, summary_storage::is_undefined_table};

const ADS_LIVE_ROWS_SQL: &str = include_str!("../ads_live_rows.sql");

pub(super) async fn fetch_ads_live_items(
    pool: &PgPool,
    normalized_week_period: &str,
) -> AppResult<Option<Vec<Value>>> {
    let rows = match sqlx::query(ADS_LIVE_ROWS_SQL)
        .bind(normalized_week_period)
        .fetch_all(pool)
        .await
    {
        Ok(rows) => rows,
        Err(error) if is_undefined_table(&error) => return Ok(None),
        Err(error) => {
            error!(?error, "query ads douyin live attribution rows failed");
            return Err(AppError::Internal);
        }
    };

    Ok(Some(rows.into_iter().map(map_ads_live_row).collect()))
}

fn map_ads_live_row(row: sqlx::postgres::PgRow) -> Value {
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
        .try_get::<Option<NaiveDateTime>, _>("live_start_time")
        .unwrap_or(None);
    let live_end_time = row
        .try_get::<Option<NaiveDateTime>, _>("live_end_time")
        .unwrap_or(None);

    let curr_live_duration_minutes = row
        .try_get::<Option<i32>, _>("curr_live_duration_minutes")
        .unwrap_or(None)
        .unwrap_or(0) as i64;
    let prev_live_duration_minutes = optional_f64(&row, "prev_live_duration_minutes");
    let curr_live_exposure_user_count = optional_i64(&row, "curr_live_exposure_user_count");
    let prev_live_exposure_user_count = optional_f64(&row, "prev_live_exposure_user_count");
    let curr_live_watch_user_count = optional_i64(&row, "curr_live_watch_user_count");
    let prev_live_watch_user_count = optional_f64(&row, "prev_live_watch_user_count");
    let curr_live_product_exposure_user = optional_i64(&row, "curr_live_product_exposure_user");
    let prev_live_product_exposure_user = optional_f64(&row, "prev_live_product_exposure_user");
    let curr_live_product_click_user = optional_i64(&row, "curr_live_product_click_user");
    let prev_live_product_click_user = optional_f64(&row, "prev_live_product_click_user");
    let curr_live_buyer_count = optional_i64(&row, "curr_live_buyer_count");
    let prev_live_buyer_count = optional_f64(&row, "prev_live_buyer_count");
    let curr_live_order_count = optional_i64(&row, "curr_live_order_count");
    let prev_live_order_count = optional_f64(&row, "prev_live_order_count");
    let curr_live_gmv = optional_f64(&row, "curr_live_gmv");
    let prev_live_gmv = optional_f64(&row, "prev_live_gmv");
    let live_gmv_delta = row
        .try_get::<Option<f64>, _>("live_gmv_delta")
        .unwrap_or(None)
        .unwrap_or(curr_live_gmv - prev_live_gmv);
    let curr_live_user_pay_amount = optional_f64(&row, "curr_live_user_pay_amount");
    let prev_live_user_pay_amount = optional_f64(&row, "prev_live_user_pay_amount");
    let curr_live_ad_cost = optional_f64(&row, "curr_live_ad_cost");
    let prev_live_ad_cost = optional_f64(&row, "prev_live_ad_cost");
    let curr_comment_count = optional_i64(&row, "curr_comment_count");
    let prev_comment_count = optional_f64(&row, "prev_comment_count");
    let curr_new_follower_count = optional_i64(&row, "curr_new_follower_count");
    let prev_new_follower_count = optional_f64(&row, "prev_new_follower_count");
    let curr_product_count = optional_i64(&row, "curr_product_count");
    let prev_product_count = optional_f64(&row, "prev_product_count");

    let curr_avg_order_value = safe_ratio(curr_live_gmv, curr_live_buyer_count as f64);
    let prev_avg_order_value = safe_ratio(prev_live_gmv, prev_live_buyer_count);
    let start_time_label = live_start_time
        .map(|value| value.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "--".to_string());
    let end_time_label = live_end_time
        .map(|value| value.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "--".to_string());
    let session_id = format!("{shop_id}|{anchor_douyin_id}|{start_time_label}");

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
    })
}

fn optional_f64(row: &sqlx::postgres::PgRow, column: &str) -> f64 {
    row.try_get::<Option<f64>, _>(column)
        .unwrap_or(None)
        .unwrap_or(0.0)
}

fn optional_i64(row: &sqlx::postgres::PgRow, column: &str) -> i64 {
    row.try_get::<Option<i64>, _>(column)
        .unwrap_or(None)
        .unwrap_or(0)
}
