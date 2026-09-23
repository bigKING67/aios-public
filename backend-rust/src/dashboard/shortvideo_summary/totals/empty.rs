use serde_json::{json, Value};

pub(super) fn empty_douyin_shortvideo_totals_value() -> Value {
    json!({
      "shortvideo_count": 0,
      "video_view_count": 0,
      "shortvideo_gmv": 0.0,
      "shortvideo_user_pay_amount": 0.0,
      "shortvideo_refund_amount": 0.0,
      "shortvideo_live_room_pay_amount": 0.0,
      "shortvideo_search_after_view_pay_amount": 0.0,
      "shortvideo_shop_page_pay_amount": 0.0,
      "shortvideo_play_to_pay_rate": Value::Null,
      "shortvideo_refund_rate": Value::Null,
      "author_count": 0
    })
}
