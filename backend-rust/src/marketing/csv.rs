use axum::{
    http::{
        header::{CONTENT_DISPOSITION, CONTENT_TYPE},
        HeaderMap, HeaderValue,
    },
    response::{IntoResponse, Response},
};

use super::types::{CreatorLibraryItem, CSV_EXPORT_HEADER, NOT_COOPERABLE_STATUS_VALUE};

pub(super) fn build_creators_csv(items: &[CreatorLibraryItem]) -> String {
    let mut csv = String::from(CSV_EXPORT_HEADER);
    for item in items {
        let cooperation_status = if item.is_cooperable {
            item.cooperation_status.clone().unwrap_or_default()
        } else {
            NOT_COOPERABLE_STATUS_VALUE.to_string()
        };
        let row = [
            item.influencer_id.clone().unwrap_or_default(),
            item.influencer_name.clone(),
            item.platform.clone(),
            item.main_platform_fans.clone().unwrap_or_default(),
            item.tags.join("、"),
            item.anchor_level.clone().unwrap_or_default(),
            item.sales_90d.clone().unwrap_or_default(),
            cooperation_status,
            item.owner_name.clone().unwrap_or_default(),
            item.last_followed_at.clone().unwrap_or_default(),
            format_follow_log_count(item.follow_log_count),
            item.cooperation_desc.clone().unwrap_or_default(),
        ];
        csv.push_str(
            row.iter()
                .map(|value| escape_csv_cell(value))
                .collect::<Vec<_>>()
                .join(",")
                .as_str(),
        );
        csv.push('\n');
    }
    csv
}

pub(super) fn csv_response(filename: &str, body: String) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    let disposition = format!("attachment; filename=\"{}\"", filename);
    if let Ok(value) = HeaderValue::from_str(disposition.as_str()) {
        headers.insert(CONTENT_DISPOSITION, value);
    }

    (headers, body).into_response()
}

fn escape_csv_cell(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn format_follow_log_count(value: i64) -> String {
    if value > 0 {
        format!("{value}条记录")
    } else {
        "无记录".to_string()
    }
}
