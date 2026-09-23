use chrono::NaiveDate;
use sqlx::{postgres::PgRow, Row};

use super::super::GoodsChannelAttributionItem;

pub(super) struct MappedChannelRows {
    pub(super) total_pay_amount: f64,
    pub(super) total_prev_pay_amount: f64,
    pub(super) items: Vec<GoodsChannelAttributionItem>,
}

pub(super) fn first_as_of_date(rows: &[PgRow]) -> Option<String> {
    rows.first()
        .and_then(|row| {
            row.try_get::<Option<NaiveDate>, _>("as_of_date")
                .ok()
                .flatten()
        })
        .map(|date| date.to_string())
}

pub(super) fn map_channel_rows(rows: Vec<PgRow>) -> MappedChannelRows {
    let first_row = rows.first();
    let total_pay_amount = first_row
        .and_then(|row| {
            row.try_get::<Option<f64>, _>("total_curr_pay_amount")
                .ok()
                .flatten()
        })
        .unwrap_or(0.0);
    let total_prev_pay_amount = first_row
        .and_then(|row| {
            row.try_get::<Option<f64>, _>("total_prev_pay_amount")
                .ok()
                .flatten()
        })
        .unwrap_or(0.0);

    let mut items: Vec<GoodsChannelAttributionItem> = Vec::with_capacity(rows.len());
    for row in rows {
        let pay_amount = row.try_get::<f64, _>("curr_pay_amount").unwrap_or(0.0);
        let prev_pay_amount = row.try_get::<f64, _>("prev_pay_amount").unwrap_or(0.0);
        let pay_amount_delta = row
            .try_get::<f64, _>("pay_amount_delta")
            .unwrap_or(pay_amount - prev_pay_amount);

        items.push(GoodsChannelAttributionItem {
            product_id: row.try_get::<String, _>("product_id").unwrap_or_default(),
            product_name: row
                .try_get::<String, _>("product_name")
                .unwrap_or_else(|_| "(未命名商品)".to_string()),
            traffic_channel: row
                .try_get::<String, _>("traffic_channel")
                .unwrap_or_else(|_| "unknown".to_string()),
            pay_amount,
            prev_pay_amount,
            pay_amount_delta,
            pay_amount_delta_contribution: row
                .try_get::<Option<f64>, _>("pay_amount_delta_contribution")
                .unwrap_or(None),
            pay_buyer_count: row.try_get::<i64, _>("curr_pay_buyer_count").unwrap_or(0),
            visitor_count: row.try_get::<i64, _>("curr_visitor_count").unwrap_or(0),
            cart_buyer_count: row.try_get::<i64, _>("curr_cart_buyer_count").unwrap_or(0),
        });
    }

    MappedChannelRows {
        total_pay_amount,
        total_prev_pay_amount,
        items,
    }
}
