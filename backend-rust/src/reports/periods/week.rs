use chrono::NaiveDate;

use crate::error::{AppError, AppResult};

pub(in crate::reports) fn normalize_week_period_for_db(period: &str) -> String {
    normalize_week_period_for_api(period).replace('~', "～")
}

pub(in crate::reports) fn normalize_week_period_for_api(period: &str) -> String {
    period
        .trim()
        .replace('～', "~")
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect()
}

pub(in crate::reports) fn is_week_period_like(value: &str) -> bool {
    let normalized = normalize_week_period_for_api(value);
    normalized.contains('~') && normalized.contains('/')
}

pub(in crate::reports) fn parse_week_period(period: &str) -> AppResult<(NaiveDate, NaiveDate)> {
    let normalized = normalize_week_period_for_api(period);
    let segments: Vec<&str> = normalized.split('~').collect();

    if segments.len() != 2 {
        return Err(AppError::bad_request("Invalid week_period format"));
    }

    let start = parse_week_period_date_segment(segments[0])?;
    let end = parse_week_period_date_segment(segments[1])?;

    if start > end {
        return Err(AppError::bad_request("Invalid week_period range"));
    }

    Ok((start, end))
}

pub(in crate::reports) fn extract_week_period_sort_date(period: &str) -> Option<NaiveDate> {
    parse_week_period(period).ok().map(|(_, end)| end)
}

fn parse_week_period_date_segment(value: &str) -> AppResult<NaiveDate> {
    let parts: Vec<&str> = value.trim().split('/').collect();
    if parts.len() != 3 {
        return Err(AppError::bad_request("Invalid week_period format"));
    }

    let year = parts[0]
        .parse::<i32>()
        .map_err(|_| AppError::bad_request("Invalid week_period format"))?;
    let month = parts[1]
        .parse::<u32>()
        .map_err(|_| AppError::bad_request("Invalid week_period format"))?;
    let day = parts[2]
        .parse::<u32>()
        .map_err(|_| AppError::bad_request("Invalid week_period format"))?;

    NaiveDate::from_ymd_opt(year, month, day)
        .ok_or_else(|| AppError::bad_request("Invalid week_period format"))
}
