use serde_json::{json, Value};

fn build_material_scope_summary(
    key: &str,
    label: &str,
    material_type: Option<&str>,
    current_totals: &Value,
    previous_totals: &Value,
    trend: &Value,
    detail_row_count: usize,
) -> Value {
    json!({
      "key": key,
      "label": label,
      "materialType": material_type,
      "currentTotals": current_totals,
      "previousTotals": previous_totals,
      "trend": trend,
      "detailRowCount": detail_row_count
    })
}

#[allow(clippy::too_many_arguments)]
pub(super) fn build_material_scopes_payload(
    current_totals: &Value,
    previous_totals: &Value,
    trend: &Value,
    video_current_totals: &Value,
    video_previous_totals: &Value,
    video_trend: &Value,
    live_room_current_totals: &Value,
    live_room_previous_totals: &Value,
    live_room_trend: &Value,
    all_detail_row_count: usize,
    video_detail_row_count: usize,
    live_room_detail_row_count: usize,
) -> Value {
    json!({
      "all": build_material_scope_summary(
        "all",
        "全部",
        None,
        current_totals,
        previous_totals,
        trend,
        all_detail_row_count
      ),
      "video": build_material_scope_summary(
        "video",
        "视频",
        Some("live_video"),
        video_current_totals,
        video_previous_totals,
        video_trend,
        video_detail_row_count
      ),
      "liveRoomScreen": build_material_scope_summary(
        "liveRoomScreen",
        "直播间画面",
        Some("live_room_screen"),
        live_room_current_totals,
        live_room_previous_totals,
        live_room_trend,
        live_room_detail_row_count
      )
    })
}
