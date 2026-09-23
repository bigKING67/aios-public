use sqlx::Row;

use super::super::super::{metrics::calculate_wow, PlatformData};

pub(super) fn map_monthly_platform_rows(
    rows: Vec<sqlx::postgres::PgRow>,
    normalize_platform: bool,
) -> Vec<PlatformData> {
    let mut result = Vec::new();
    let mut total_gmv = 0.0;

    for row in rows {
        let platform_raw = row.try_get::<String, _>("platform").unwrap_or_default();
        let platform = if normalize_platform {
            normalize_overview_platform(platform_raw.as_str())
        } else {
            platform_raw
        };

        let curr_gmv = row.try_get::<f64, _>("curr_gmv").unwrap_or(0.0);
        let curr_orders = row.try_get::<i64, _>("curr_order_count").unwrap_or(0);
        let curr_buyers = row.try_get::<i64, _>("curr_buyer_count").unwrap_or(0);
        let curr_refund_refund_time = row
            .try_get::<f64, _>("curr_refund_amount_refund_time")
            .unwrap_or(0.0);
        let curr_refund_pay_time = row
            .try_get::<f64, _>("curr_refund_amount_pay_time")
            .unwrap_or(0.0);
        let prev_gmv = row.try_get::<f64, _>("prev_gmv").unwrap_or(0.0);
        let prev_refund_refund_time = row
            .try_get::<f64, _>("prev_refund_amount_refund_time")
            .unwrap_or(0.0);
        let prev_refund_pay_time = row
            .try_get::<f64, _>("prev_refund_amount_pay_time")
            .unwrap_or(0.0);

        let gsv = curr_gmv - curr_refund_pay_time;
        let arpu = if curr_buyers > 0 {
            curr_gmv / curr_buyers as f64
        } else {
            0.0
        };
        let cvr = if curr_buyers > 0 {
            curr_orders as f64 / curr_buyers as f64
        } else {
            0.0
        };

        total_gmv += curr_gmv;
        result.push(PlatformData {
            platform,
            gmv: curr_gmv,
            prev_gmv,
            gsv,
            orders: curr_orders,
            prev_orders: None,
            uv: curr_buyers,
            buyer_count: Some(curr_buyers),
            prev_buyer_count: None,
            cvr,
            pay_cvr: None,
            prev_pay_cvr: None,
            arpu,
            prev_arpu: None,
            uv_value: None,
            prev_uv_value: None,
            refund_amount_refund_time: curr_refund_refund_time,
            prev_refund_amount_refund_time: Some(prev_refund_refund_time),
            refund_amount_pay_time: curr_refund_pay_time,
            prev_refund_amount_pay_time: Some(prev_refund_pay_time),
            visitor_count: None,
            prev_visitor_count: None,
            cost: None,
            prev_cost: None,
            roi: None,
            prev_roi: None,
            live_gmv: None,
            prev_live_gmv: None,
            shortvideo_gmv: None,
            prev_shortvideo_gmv: None,
            card_gmv: None,
            prev_card_gmv: None,
            contribution: 0.0,
            wow: calculate_wow(curr_gmv, prev_gmv),
        });
    }

    if total_gmv > 0.0 {
        for item in &mut result {
            item.contribution = item.gmv / total_gmv;
        }
    }

    result
}

fn normalize_overview_platform(platform_raw: &str) -> String {
    match platform_raw {
        "wechat" => "wx",
        "xiaohongshu" => "xhs",
        _ => platform_raw,
    }
    .to_string()
}
