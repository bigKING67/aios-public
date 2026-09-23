use chrono::NaiveDateTime;
use serde_json::Value;
use sqlx::{postgres::PgRow, Row};

pub(super) fn video_key(video_id: &str, author_douyin_id: &str) -> String {
    format!("{video_id}|{author_douyin_id}")
}

pub(super) fn format_publish_time(row: &PgRow) -> String {
    row.try_get::<Option<NaiveDateTime>, _>("publish_time")
        .unwrap_or(None)
        .map(|value| value.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "--".to_string())
}

pub(super) fn read_i64(item: Option<&Value>, field: &str) -> i64 {
    item.and_then(|value| value.get(field))
        .and_then(|value| value.as_i64())
        .unwrap_or(0)
}

pub(super) fn read_f64(item: Option<&Value>, field: &str) -> f64 {
    item.and_then(|value| value.get(field))
        .and_then(|value| value.as_f64())
        .unwrap_or(0.0)
}
