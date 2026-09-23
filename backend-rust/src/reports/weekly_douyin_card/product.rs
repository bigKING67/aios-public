use std::collections::HashMap;

use serde_json::{json, Value};
use sqlx::{postgres::PgRow, Row};

pub(super) struct ProductAttribution {
    pub(super) product_items: Vec<Value>,
    pub(super) diagnosis_product_id: String,
    pub(super) diagnosis_product_name: String,
}

pub(super) fn build_product_attribution(
    prev_product_rows: Vec<PgRow>,
    product_rows: Vec<PgRow>,
) -> ProductAttribution {
    let mut prev_product_map: HashMap<String, Value> =
        HashMap::with_capacity(prev_product_rows.len());
    for row in prev_product_rows {
        let product_id = row.try_get::<String, _>("product_id").unwrap_or_default();
        prev_product_map.insert(
            product_id,
            json!({
                "prev_card_user_pay_amount": row.try_get::<Option<f64>, _>("prev_card_user_pay_amount").unwrap_or(None).unwrap_or(0.0),
                "prev_card_order_count": row.try_get::<Option<i64>, _>("prev_card_order_count").unwrap_or(None).unwrap_or(0),
                "prev_card_buyer_count": row.try_get::<Option<i64>, _>("prev_card_buyer_count").unwrap_or(None).unwrap_or(0),
                "prev_card_exposure_user_count": row.try_get::<Option<i64>, _>("prev_card_exposure_user_count").unwrap_or(None).unwrap_or(0),
                "prev_card_click_user_count": row.try_get::<Option<i64>, _>("prev_card_click_user_count").unwrap_or(None).unwrap_or(0),
                "prev_card_cart_user_count": row.try_get::<Option<i64>, _>("prev_card_cart_user_count").unwrap_or(None).unwrap_or(0),
                "prev_card_favorite_user_count": row.try_get::<Option<i64>, _>("prev_card_favorite_user_count").unwrap_or(None).unwrap_or(0)
            }),
        );
    }

    let mut product_items_with_score: Vec<(f64, Value)> = Vec::with_capacity(product_rows.len());
    let mut diagnosis_product_id = String::new();
    let mut diagnosis_product_name = String::new();
    let mut diagnosis_score = 0.0_f64;
    for row in product_rows {
        let product_id = row.try_get::<String, _>("product_id").unwrap_or_default();
        let baseline = prev_product_map.get(&product_id);
        let curr_card_user_pay_amount = row
            .try_get::<f64, _>("curr_card_user_pay_amount")
            .unwrap_or(0.0);
        let prev_card_user_pay_amount = baseline
            .and_then(|value| value.get("prev_card_user_pay_amount"))
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0);
        let card_gmv_delta = curr_card_user_pay_amount - prev_card_user_pay_amount;
        let score = card_gmv_delta.abs();

        if score >= diagnosis_score {
            diagnosis_score = score;
            diagnosis_product_id = product_id.clone();
            diagnosis_product_name = row
                .try_get::<String, _>("product_title")
                .unwrap_or_else(|_| "(未命名商品)".to_string());
        }

        product_items_with_score.push((
            score,
            json!({
                "product_id": product_id,
                "product_title": row.try_get::<String, _>("product_title").unwrap_or_else(|_| "(未命名商品)".to_string()),
                "product_url": row.try_get::<Option<String>, _>("product_url").unwrap_or(None),
                "curr_card_user_pay_amount": curr_card_user_pay_amount,
                "prev_card_user_pay_amount": prev_card_user_pay_amount,
                "card_gmv_delta": card_gmv_delta,
                "curr_card_order_count": row.try_get::<i64, _>("curr_card_order_count").unwrap_or(0),
                "prev_card_order_count": baseline.and_then(|value| value.get("prev_card_order_count")).and_then(|value| value.as_i64()).unwrap_or(0),
                "curr_card_buyer_count": row.try_get::<i64, _>("curr_card_buyer_count").unwrap_or(0),
                "prev_card_buyer_count": baseline.and_then(|value| value.get("prev_card_buyer_count")).and_then(|value| value.as_i64()).unwrap_or(0),
                "curr_card_exposure_user_count": row.try_get::<i64, _>("curr_card_exposure_user_count").unwrap_or(0),
                "prev_card_exposure_user_count": baseline.and_then(|value| value.get("prev_card_exposure_user_count")).and_then(|value| value.as_i64()).unwrap_or(0),
                "curr_card_click_user_count": row.try_get::<i64, _>("curr_card_click_user_count").unwrap_or(0),
                "prev_card_click_user_count": baseline.and_then(|value| value.get("prev_card_click_user_count")).and_then(|value| value.as_i64()).unwrap_or(0),
                "curr_card_cart_user_count": row.try_get::<i64, _>("curr_card_cart_user_count").unwrap_or(0),
                "prev_card_cart_user_count": baseline.and_then(|value| value.get("prev_card_cart_user_count")).and_then(|value| value.as_i64()).unwrap_or(0),
                "curr_card_favorite_user_count": row.try_get::<i64, _>("curr_card_favorite_user_count").unwrap_or(0),
                "prev_card_favorite_user_count": baseline.and_then(|value| value.get("prev_card_favorite_user_count")).and_then(|value| value.as_i64()).unwrap_or(0)
            }),
        ));
    }

    product_items_with_score.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    ProductAttribution {
        product_items: product_items_with_score
            .into_iter()
            .map(|(_, item)| item)
            .collect(),
        diagnosis_product_id,
        diagnosis_product_name,
    }
}
