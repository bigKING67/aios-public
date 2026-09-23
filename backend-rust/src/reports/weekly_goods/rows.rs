use chrono::NaiveDate;
use sqlx::{postgres::PgRow, Row};

use super::super::ProductAttributionItem;

pub(super) fn first_as_of_date(rows: &[PgRow]) -> Option<String> {
    rows.first()
        .and_then(|row| {
            row.try_get::<Option<NaiveDate>, _>("as_of_date")
                .ok()
                .flatten()
        })
        .map(|date| date.to_string())
}

pub(super) fn first_totals(rows: &[PgRow]) -> (f64, f64) {
    let first_row = rows.first();
    let total_gmv = first_row
        .and_then(|row| {
            row.try_get::<Option<f64>, _>("total_curr_gmv")
                .ok()
                .flatten()
        })
        .unwrap_or(0.0);
    let total_prev_gmv = first_row
        .and_then(|row| {
            row.try_get::<Option<f64>, _>("total_prev_gmv")
                .ok()
                .flatten()
        })
        .unwrap_or(0.0);
    (total_gmv, total_prev_gmv)
}

pub(super) fn map_product_rows(rows: Vec<PgRow>) -> Vec<ProductAttributionItem> {
    let mut items: Vec<ProductAttributionItem> = Vec::with_capacity(rows.len());
    for row in rows {
        let gmv = row.try_get::<f64, _>("curr_gmv").unwrap_or(0.0);
        let prev_gmv = row.try_get::<f64, _>("prev_gmv").unwrap_or(0.0);
        let gmv_delta = row.try_get::<f64, _>("gmv_delta").unwrap_or(gmv - prev_gmv);
        let buyer_count = row.try_get::<i64, _>("curr_pay_buyer_count").unwrap_or(0);
        let visitor_count = row.try_get::<i64, _>("curr_visitor_count").unwrap_or(0);
        let pay_conversion_rate = positive_ratio(buyer_count as f64, visitor_count as f64);
        let avg_order_value = positive_ratio(gmv, buyer_count as f64);

        items.push(ProductAttributionItem {
            product_id: row.try_get::<String, _>("product_id").unwrap_or_default(),
            product_name: row
                .try_get::<String, _>("product_name")
                .unwrap_or_else(|_| "(未命名商品)".to_string()),
            gmv,
            prev_gmv,
            gmv_delta,
            gmv_delta_contribution: row
                .try_get::<Option<f64>, _>("gmv_delta_contribution")
                .unwrap_or(None),
            buyer_count,
            visitor_count,
            pay_conversion_rate,
            avg_order_value,
        });
    }
    items
}

fn positive_ratio(numerator: f64, denominator: f64) -> Option<f64> {
    if numerator.is_finite() && denominator > 0.0 {
        Some(numerator / denominator)
    } else {
        None
    }
}
