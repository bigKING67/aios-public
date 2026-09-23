use normalizer::normalize_error_message;
use specs::{
    CREATOR_LIVE_SPEC, CREATOR_SHORTVIDEO_SPEC, GOODS_CARD_SPEC, GOODS_CARD_TRAFFIC_SPEC,
    GOODS_SPEC, LIVE_GOODS_SPEC, LIVE_SPEC, OVERVIEW_DETAILS_SPEC, OVERVIEW_SPEC, QIANCHUAN_SPEC,
    SHORTVIDEO_SPEC, TRAFFIC_GOODS_SPEC, TRAFFIC_SPEC,
};

mod normalizer;
mod relations;
mod specs;

pub(super) fn normalize_goods_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &GOODS_SPEC)
}

pub(super) fn normalize_traffic_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &TRAFFIC_SPEC)
}

pub(super) fn normalize_traffic_goods_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &TRAFFIC_GOODS_SPEC)
}

pub(super) fn normalize_goods_card_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &GOODS_CARD_SPEC)
}

pub(super) fn normalize_goods_card_traffic_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &GOODS_CARD_TRAFFIC_SPEC)
}

pub(super) fn normalize_live_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &LIVE_SPEC)
}

pub(super) fn normalize_live_goods_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &LIVE_GOODS_SPEC)
}

pub(super) fn normalize_shortvideo_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &SHORTVIDEO_SPEC)
}

pub(super) fn normalize_qianchuan_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &QIANCHUAN_SPEC)
}

pub(super) fn normalize_creator_shortvideo_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &CREATOR_SHORTVIDEO_SPEC)
}

pub(super) fn normalize_creator_live_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &CREATOR_LIVE_SPEC)
}

pub(super) fn normalize_overview_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &OVERVIEW_SPEC)
}

pub(super) fn normalize_overview_details_error_message(raw_error: &str) -> String {
    normalize_error_message(raw_error, &OVERVIEW_DETAILS_SPEC)
}

#[cfg(test)]
mod tests;
