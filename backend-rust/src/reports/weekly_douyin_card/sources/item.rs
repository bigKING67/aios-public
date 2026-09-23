use serde_json::{json, Value};

use super::super::super::metrics::safe_ratio;

pub(super) fn build_source_item(
    source_level1: String,
    current_item: Option<&Value>,
    prev_item: Option<&Value>,
) -> (f64, Value) {
    let curr_card_exposure_user_count = read_i64(current_item, "curr_card_exposure_user_count");
    let curr_card_click_user_count = read_i64(current_item, "curr_card_click_user_count");
    let curr_card_buyer_count = read_i64(current_item, "curr_card_buyer_count");
    let curr_card_cart_user_count = read_i64(current_item, "curr_card_cart_user_count");
    let curr_card_favorite_user_count = read_i64(current_item, "curr_card_favorite_user_count");
    let curr_card_bounce_user_count = read_i64(current_item, "curr_card_bounce_user_count");
    let curr_card_user_pay_amount = read_f64(current_item, "curr_card_user_pay_amount");
    let curr_card_order_count = read_i64(current_item, "curr_card_order_count");

    let prev_card_exposure_user_count = read_i64(prev_item, "prev_card_exposure_user_count");
    let prev_card_click_user_count = read_i64(prev_item, "prev_card_click_user_count");
    let prev_card_buyer_count = read_i64(prev_item, "prev_card_buyer_count");
    let prev_card_cart_user_count = read_i64(prev_item, "prev_card_cart_user_count");
    let prev_card_favorite_user_count = read_i64(prev_item, "prev_card_favorite_user_count");
    let prev_card_bounce_user_count = read_i64(prev_item, "prev_card_bounce_user_count");
    let prev_card_user_pay_amount = read_f64(prev_item, "prev_card_user_pay_amount");
    let prev_card_order_count = read_i64(prev_item, "prev_card_order_count");

    let gmv_delta = curr_card_user_pay_amount - prev_card_user_pay_amount;
    let curr_click_rate = safe_ratio(
        curr_card_click_user_count as f64,
        curr_card_exposure_user_count as f64,
    );
    let prev_click_rate = safe_ratio(
        prev_card_click_user_count as f64,
        prev_card_exposure_user_count as f64,
    );
    let curr_click_to_pay_rate = safe_ratio(
        curr_card_buyer_count as f64,
        curr_card_click_user_count as f64,
    );
    let prev_click_to_pay_rate = safe_ratio(
        prev_card_buyer_count as f64,
        prev_card_click_user_count as f64,
    );

    (
        gmv_delta.abs(),
        json!({
            "source_level1": source_level1,
            "curr_card_exposure_user_count": curr_card_exposure_user_count,
            "prev_card_exposure_user_count": prev_card_exposure_user_count,
            "curr_card_click_user_count": curr_card_click_user_count,
            "prev_card_click_user_count": prev_card_click_user_count,
            "curr_card_buyer_count": curr_card_buyer_count,
            "prev_card_buyer_count": prev_card_buyer_count,
            "curr_card_cart_user_count": curr_card_cart_user_count,
            "prev_card_cart_user_count": prev_card_cart_user_count,
            "curr_card_favorite_user_count": curr_card_favorite_user_count,
            "prev_card_favorite_user_count": prev_card_favorite_user_count,
            "curr_card_bounce_user_count": curr_card_bounce_user_count,
            "prev_card_bounce_user_count": prev_card_bounce_user_count,
            "curr_card_order_count": curr_card_order_count,
            "prev_card_order_count": prev_card_order_count,
            "curr_card_user_pay_amount": curr_card_user_pay_amount,
            "prev_card_user_pay_amount": prev_card_user_pay_amount,
            "card_user_pay_amount_delta": gmv_delta,
            "curr_card_click_rate": curr_click_rate,
            "prev_card_click_rate": prev_click_rate,
            "curr_card_click_to_pay_rate": curr_click_to_pay_rate,
            "prev_card_click_to_pay_rate": prev_click_to_pay_rate
        }),
    )
}

fn read_i64(item: Option<&Value>, field: &str) -> i64 {
    item.and_then(|value| value.get(field))
        .and_then(|value| value.as_i64())
        .unwrap_or(0)
}

fn read_f64(item: Option<&Value>, field: &str) -> f64 {
    item.and_then(|value| value.get(field))
        .and_then(|value| value.as_f64())
        .unwrap_or(0.0)
}
