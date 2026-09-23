use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone, Utc};
use once_cell::sync::Lazy;
use regex::Regex;

const MONTH_PERIOD_PATTERN: &str = r"^\d{4}-(0[1-9]|1[0-2])$";

static DATE_TIME_LITERAL_PATTERN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$").expect("datetime regex"));

pub(super) static MONTH_PERIOD_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(MONTH_PERIOD_PATTERN).expect("month period regex"));

pub(super) fn normalize_token(value: &str) -> String {
    value.trim().to_lowercase()
}

pub(super) fn to_dataops_timestamp(value: &str) -> i64 {
    parse_dataops_time(value)
        .map(|time| time.timestamp_millis())
        .unwrap_or(0)
}

pub(super) fn parse_dataops_time(value: &str) -> Option<DateTime<Utc>> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return None;
    }

    if DATE_TIME_LITERAL_PATTERN.is_match(normalized) {
        let parsed = NaiveDateTime::parse_from_str(normalized, "%Y-%m-%d %H:%M").ok()?;
        let offset = FixedOffset::east_opt(8 * 3600)?;
        let local_time = offset.from_local_datetime(&parsed).single()?;
        return Some(local_time.with_timezone(&Utc));
    }

    if let Ok(parsed) = DateTime::parse_from_rfc3339(normalized) {
        return Some(parsed.with_timezone(&Utc));
    }

    None
}

pub(super) fn format_shanghai_datetime(value: &str) -> String {
    parse_dataops_time(value)
        .map(format_shanghai_datetime_from_utc)
        .unwrap_or_else(|| "-".to_string())
}

pub(super) fn format_shanghai_datetime_from_utc(value: DateTime<Utc>) -> String {
    let offset = FixedOffset::east_opt(8 * 3600).expect("+08 offset");
    value
        .with_timezone(&offset)
        .format("%Y-%m-%d %H:%M")
        .to_string()
}

pub(super) fn format_shanghai_datetime_from_ts(timestamp_ms: i64) -> String {
    DateTime::<Utc>::from_timestamp_millis(timestamp_ms)
        .map(format_shanghai_datetime_from_utc)
        .unwrap_or_else(|| "-".to_string())
}
