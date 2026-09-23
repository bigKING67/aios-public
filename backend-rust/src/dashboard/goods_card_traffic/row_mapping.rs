use sqlx::Row;

use super::types::DashboardGoodsCardTrafficMetricRow;

pub(crate) fn goods_card_traffic_metric_row_from_pg_row(
    row: &sqlx::postgres::PgRow,
) -> Result<DashboardGoodsCardTrafficMetricRow, String> {
    let source_level = row
        .try_get::<i32, _>("source_level")
        .map_err(|error| error.to_string())?
        .clamp(1, 4);
    let source_name = row
        .try_get::<String, _>("source_name")
        .map_err(|error| error.to_string())?;
    let parent_source_name = row
        .try_get::<String, _>("parent_source_name")
        .map_err(|error| error.to_string())?;
    let source_key = row
        .try_get::<String, _>("source_key")
        .map_err(|error| error.to_string())?;
    let parent_source_key = row
        .try_get::<String, _>("parent_source_key")
        .map_err(|error| error.to_string())?;

    Ok(DashboardGoodsCardTrafficMetricRow {
        source_key,
        parent_source_key,
        source_level,
        source_name,
        parent_source_name,
        curr_card_exposure_user_count: row
            .try_get::<f64, _>("curr_card_exposure_user_count")
            .map_err(|error| error.to_string())?,
        prev_card_exposure_user_count: row
            .try_get::<f64, _>("prev_card_exposure_user_count")
            .map_err(|error| error.to_string())?,
        curr_card_click_user_count: row
            .try_get::<f64, _>("curr_card_click_user_count")
            .map_err(|error| error.to_string())?,
        prev_card_click_user_count: row
            .try_get::<f64, _>("prev_card_click_user_count")
            .map_err(|error| error.to_string())?,
        curr_card_buyer_count: row
            .try_get::<f64, _>("curr_card_buyer_count")
            .map_err(|error| error.to_string())?,
        prev_card_buyer_count: row
            .try_get::<f64, _>("prev_card_buyer_count")
            .map_err(|error| error.to_string())?,
        curr_card_cart_user_count: row
            .try_get::<f64, _>("curr_card_cart_user_count")
            .map_err(|error| error.to_string())?,
        prev_card_cart_user_count: row
            .try_get::<f64, _>("prev_card_cart_user_count")
            .map_err(|error| error.to_string())?,
        curr_card_favorite_user_count: row
            .try_get::<f64, _>("curr_card_favorite_user_count")
            .map_err(|error| error.to_string())?,
        prev_card_favorite_user_count: row
            .try_get::<f64, _>("prev_card_favorite_user_count")
            .map_err(|error| error.to_string())?,
        curr_card_bounce_user_count: row
            .try_get::<f64, _>("curr_card_bounce_user_count")
            .map_err(|error| error.to_string())?,
        prev_card_bounce_user_count: row
            .try_get::<f64, _>("prev_card_bounce_user_count")
            .map_err(|error| error.to_string())?,
        curr_card_user_pay_amount: row
            .try_get::<f64, _>("curr_card_user_pay_amount")
            .map_err(|error| error.to_string())?,
        prev_card_user_pay_amount: row
            .try_get::<f64, _>("prev_card_user_pay_amount")
            .map_err(|error| error.to_string())?,
        curr_card_order_count: row
            .try_get::<f64, _>("curr_card_order_count")
            .map_err(|error| error.to_string())?,
        prev_card_order_count: row
            .try_get::<f64, _>("prev_card_order_count")
            .map_err(|error| error.to_string())?,
        curr_card_click_rate_user: row
            .try_get::<f64, _>("curr_card_click_rate_user")
            .map_err(|error| error.to_string())?,
        prev_card_click_rate_user: row
            .try_get::<f64, _>("prev_card_click_rate_user")
            .map_err(|error| error.to_string())?,
        curr_card_click_to_pay_rate_user: row
            .try_get::<f64, _>("curr_card_click_to_pay_rate_user")
            .map_err(|error| error.to_string())?,
        prev_card_click_to_pay_rate_user: row
            .try_get::<f64, _>("prev_card_click_to_pay_rate_user")
            .map_err(|error| error.to_string())?,
        curr_card_exposure_to_pay_rate_user: row
            .try_get::<f64, _>("curr_card_exposure_to_pay_rate_user")
            .map_err(|error| error.to_string())?,
        prev_card_exposure_to_pay_rate_user: row
            .try_get::<f64, _>("prev_card_exposure_to_pay_rate_user")
            .map_err(|error| error.to_string())?,
    })
}
