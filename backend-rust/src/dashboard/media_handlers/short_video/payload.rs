use serde_json::{json, Value};

use super::request::ShortVideoQueryDates;

pub(super) struct ShortVideoDataBundle {
    pub(super) min_date: Option<String>,
    pub(super) max_date: Option<String>,
    pub(super) as_of_date: Option<String>,
    pub(super) overview_current_totals: Value,
    pub(super) overview_previous_totals: Value,
    pub(super) self_current_totals: Value,
    pub(super) self_previous_totals: Value,
    pub(super) cooperation_current_totals: Value,
    pub(super) cooperation_previous_totals: Value,
    pub(super) overview_trend: Vec<Value>,
    pub(super) self_trend: Vec<Value>,
    pub(super) cooperation_trend: Vec<Value>,
    pub(super) self_detail_rows: Vec<Value>,
    pub(super) cooperation_detail_rows: Vec<Value>,
}

pub(super) fn build_short_video_payload(
    dates: &ShortVideoQueryDates,
    data: ShortVideoDataBundle,
) -> Value {
    json!({
      "startDate": dates.start_date,
      "endDate": dates.end_date,
      "prevStartDate": dates.prev_start_date,
      "prevEndDate": dates.prev_end_date,
      "platform": "douyin",
      "asOfDate": data.as_of_date,
      "dataDateBounds": {
        "minDate": data.min_date,
        "maxDate": data.max_date
      },
      "overview": {
        "currentTotals": data.overview_current_totals,
        "previousTotals": data.overview_previous_totals,
        "trend": data.overview_trend
      },
      "selfOperated": {
        "currentTotals": data.self_current_totals,
        "previousTotals": data.self_previous_totals,
        "trend": data.self_trend,
        "rows": data.self_detail_rows
      },
      "cooperation": {
        "currentTotals": data.cooperation_current_totals,
        "previousTotals": data.cooperation_previous_totals,
        "trend": data.cooperation_trend,
        "rows": data.cooperation_detail_rows
      }
    })
}
