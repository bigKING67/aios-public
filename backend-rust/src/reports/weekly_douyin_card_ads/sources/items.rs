use std::collections::{HashMap, HashSet};

use serde_json::{json, Value};

use super::super::super::metrics::safe_ratio;

use crate::reports::DOUYIN_CARD_SOURCE_CHANNELS;

use super::value::{integer_source_value, numeric_source_value};

pub(super) fn build_source_items(source_map: &HashMap<String, Value>) -> Vec<Value> {
    let source_channels = ordered_source_channels(source_map);
    let mut source_items_with_score: Vec<(f64, Value)> = Vec::with_capacity(source_channels.len());

    for source_level1 in source_channels {
        let source_data = source_map.get(source_level1.as_str());
        let curr_card_user_pay_amount =
            numeric_source_value(source_data, "curr_card_user_pay_amount");
        let prev_card_user_pay_amount =
            numeric_source_value(source_data, "prev_card_user_pay_amount");
        let curr_card_exposure_user_count =
            integer_source_value(source_data, "curr_card_exposure_user_count");
        let prev_card_exposure_user_count =
            integer_source_value(source_data, "prev_card_exposure_user_count");
        let curr_card_click_user_count =
            integer_source_value(source_data, "curr_card_click_user_count");
        let prev_card_click_user_count =
            integer_source_value(source_data, "prev_card_click_user_count");
        let curr_card_buyer_count = integer_source_value(source_data, "curr_card_buyer_count");
        let prev_card_buyer_count = integer_source_value(source_data, "prev_card_buyer_count");
        let card_user_pay_amount_delta = source_data
            .and_then(|value| value.get("card_user_pay_amount_delta"))
            .and_then(|value| value.as_f64())
            .unwrap_or(curr_card_user_pay_amount - prev_card_user_pay_amount);

        source_items_with_score.push((
            card_user_pay_amount_delta.abs(),
            json!({
                "source_level1": source_level1,
                "curr_card_exposure_user_count": curr_card_exposure_user_count,
                "prev_card_exposure_user_count": prev_card_exposure_user_count,
                "curr_card_click_user_count": curr_card_click_user_count,
                "prev_card_click_user_count": prev_card_click_user_count,
                "curr_card_buyer_count": curr_card_buyer_count,
                "prev_card_buyer_count": prev_card_buyer_count,
                "curr_card_cart_user_count": integer_source_value(source_data, "curr_card_cart_user_count"),
                "prev_card_cart_user_count": integer_source_value(source_data, "prev_card_cart_user_count"),
                "curr_card_favorite_user_count": integer_source_value(source_data, "curr_card_favorite_user_count"),
                "prev_card_favorite_user_count": integer_source_value(source_data, "prev_card_favorite_user_count"),
                "curr_card_bounce_user_count": integer_source_value(source_data, "curr_card_bounce_user_count"),
                "prev_card_bounce_user_count": integer_source_value(source_data, "prev_card_bounce_user_count"),
                "curr_card_order_count": integer_source_value(source_data, "curr_card_order_count"),
                "prev_card_order_count": integer_source_value(source_data, "prev_card_order_count"),
                "curr_card_user_pay_amount": curr_card_user_pay_amount,
                "prev_card_user_pay_amount": prev_card_user_pay_amount,
                "card_user_pay_amount_delta": card_user_pay_amount_delta,
                "curr_card_click_rate": safe_ratio(curr_card_click_user_count as f64, curr_card_exposure_user_count as f64),
                "prev_card_click_rate": safe_ratio(prev_card_click_user_count as f64, prev_card_exposure_user_count as f64),
                "curr_card_click_to_pay_rate": safe_ratio(curr_card_buyer_count as f64, curr_card_click_user_count as f64),
                "prev_card_click_to_pay_rate": safe_ratio(prev_card_buyer_count as f64, prev_card_click_user_count as f64)
            }),
        ));
    }

    source_items_with_score.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    source_items_with_score
        .into_iter()
        .map(|(_, item)| item)
        .collect()
}

fn ordered_source_channels(source_map: &HashMap<String, Value>) -> Vec<String> {
    let mut source_channels: Vec<String> = DOUYIN_CARD_SOURCE_CHANNELS
        .iter()
        .map(|value| value.to_string())
        .collect();
    let mut seen_channels: HashSet<String> = source_channels.iter().cloned().collect();

    for channel in source_map.keys() {
        if !seen_channels.contains(channel) {
            source_channels.push(channel.clone());
            seen_channels.insert(channel.clone());
        }
    }

    source_channels
}
