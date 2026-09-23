use sqlx::postgres::PgRow;

use super::readers::{read_f64, read_i64, read_opt_f64, read_opt_i64, read_string};
use crate::reports::{metrics::calculate_wow, PlatformData};

pub(super) fn map_platform_row(row: PgRow) -> PlatformData {
    let platform = normalize_platform(read_string(&row, "platform").as_str());
    let curr_gmv = read_f64(&row, "curr_gmv");
    let prev_gmv = read_f64(&row, "prev_gmv");
    let curr_orders = read_i64(&row, "curr_order_count");
    let curr_uv = read_i64(&row, "curr_buyer_count");
    let prev_orders = read_i64(&row, "prev_order_count");
    let prev_buyer_count = read_i64(&row, "prev_buyer_count");
    let curr_refund_refund_time = read_f64(&row, "curr_refund_amount_refund_time");
    let curr_refund_pay_time = read_f64(&row, "curr_refund_amount_pay_time");
    let prev_refund_refund_time = read_f64(&row, "prev_refund_amount_refund_time");
    let prev_refund_pay_time = read_f64(&row, "prev_refund_amount_pay_time");
    let visitor_count = read_opt_i64(&row, "curr_visitor_count");
    let prev_visitor_count = read_opt_i64(&row, "prev_visitor_count");
    let cost = read_opt_f64(&row, "curr_cost");
    let prev_cost = read_opt_f64(&row, "prev_cost");
    let gsv = curr_gmv - curr_refund_pay_time;

    PlatformData {
        platform,
        gmv: curr_gmv,
        prev_gmv,
        gsv,
        orders: curr_orders,
        prev_orders: Some(prev_orders),
        uv: curr_uv,
        buyer_count: Some(curr_uv),
        prev_buyer_count: Some(prev_buyer_count),
        cvr: ratio_or_zero(curr_orders as f64, curr_uv as f64),
        pay_cvr: ratio_from_optional_count(curr_uv, visitor_count),
        prev_pay_cvr: ratio_from_optional_count(prev_buyer_count, prev_visitor_count),
        arpu: ratio_or_zero(curr_gmv, curr_uv as f64),
        prev_arpu: positive_ratio(prev_gmv, prev_buyer_count as f64),
        uv_value: ratio_from_optional_denominator(curr_gmv, visitor_count),
        prev_uv_value: ratio_from_optional_denominator(prev_gmv, prev_visitor_count),
        refund_amount_refund_time: curr_refund_refund_time,
        prev_refund_amount_refund_time: Some(prev_refund_refund_time),
        refund_amount_pay_time: curr_refund_pay_time,
        prev_refund_amount_pay_time: Some(prev_refund_pay_time),
        visitor_count,
        prev_visitor_count,
        cost,
        prev_cost,
        roi: ratio_from_optional_f64(curr_gmv, cost),
        prev_roi: ratio_from_optional_f64(prev_gmv, prev_cost),
        live_gmv: read_opt_f64(&row, "curr_live_gmv"),
        prev_live_gmv: read_opt_f64(&row, "prev_live_gmv"),
        shortvideo_gmv: read_opt_f64(&row, "curr_shortvideo_gmv"),
        prev_shortvideo_gmv: read_opt_f64(&row, "prev_shortvideo_gmv"),
        card_gmv: read_opt_f64(&row, "curr_card_gmv"),
        prev_card_gmv: read_opt_f64(&row, "prev_card_gmv"),
        contribution: 0.0,
        wow: calculate_wow(curr_gmv, prev_gmv),
    }
}

fn normalize_platform(platform_raw: &str) -> String {
    match platform_raw {
        "taobao" => "taobao",
        "douyin" => "douyin",
        "xhs" => "xhs",
        "wx" => "wx",
        "jd" => "jd",
        _ => platform_raw,
    }
    .to_string()
}

fn ratio_or_zero(numerator: f64, denominator: f64) -> f64 {
    positive_ratio(numerator, denominator).unwrap_or(0.0)
}

fn positive_ratio(numerator: f64, denominator: f64) -> Option<f64> {
    if denominator > 0.0 {
        Some(numerator / denominator)
    } else {
        None
    }
}

fn ratio_from_optional_count(numerator: i64, denominator: Option<i64>) -> Option<f64> {
    denominator.and_then(|value| positive_ratio(numerator as f64, value as f64))
}

fn ratio_from_optional_denominator(numerator: f64, denominator: Option<i64>) -> Option<f64> {
    denominator.and_then(|value| positive_ratio(numerator, value as f64))
}

fn ratio_from_optional_f64(numerator: f64, denominator: Option<f64>) -> Option<f64> {
    denominator.and_then(|value| positive_ratio(numerator, value))
}
