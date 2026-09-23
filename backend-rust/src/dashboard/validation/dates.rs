use chrono::NaiveDate;
use once_cell::sync::Lazy;
use regex::Regex;

static DATE_LITERAL_PATTERN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\d{4}-\d{2}-\d{2}$").expect("dashboard date regex should compile"));

pub(in crate::dashboard) fn get_validated_date_param(raw: Option<&str>) -> Option<String> {
    let value = raw?.trim();
    if value.is_empty() || !is_valid_date_literal(value) {
        return None;
    }
    Some(value.to_string())
}

pub(in crate::dashboard) fn is_valid_date_literal(value: &str) -> bool {
    DATE_LITERAL_PATTERN.is_match(value)
}

pub(in crate::dashboard) fn is_start_not_after_end(start_date: &str, end_date: &str) -> bool {
    start_date <= end_date
}

pub(in crate::dashboard) fn parse_date_literal(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

pub(in crate::dashboard) fn is_date_range_within_limit(
    start_date: &str,
    end_date: &str,
    max_days: i64,
) -> bool {
    let Some(start) = parse_date_literal(start_date) else {
        return false;
    };
    let Some(end) = parse_date_literal(end_date) else {
        return false;
    };

    if end < start {
        return false;
    }

    let span_days = end.signed_duration_since(start).num_days() + 1;
    span_days <= max_days
}
