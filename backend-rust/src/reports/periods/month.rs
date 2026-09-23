use chrono::{Duration, NaiveDate};

use crate::error::{AppError, AppResult};

pub(in crate::reports) fn normalize_month_period_for_api(period: &str) -> AppResult<String> {
    let (year, month) = parse_month_period(period)?;
    Ok(format!("{year}-{month:02}"))
}

pub(in crate::reports) fn parse_month_period(month_period: &str) -> AppResult<(i32, u32)> {
    let segments: Vec<&str> = month_period.trim().split('-').collect();
    if segments.len() != 2 {
        return Err(AppError::bad_request("Invalid month_period format"));
    }

    let year = segments[0]
        .parse::<i32>()
        .map_err(|_| AppError::bad_request("Invalid month_period format"))?;
    let month = segments[1]
        .parse::<u32>()
        .map_err(|_| AppError::bad_request("Invalid month_period format"))?;

    if !(1..=12).contains(&month) {
        return Err(AppError::bad_request("month must be in 1..12"));
    }

    Ok((year, month))
}

fn month_end_date(year: i32, month: u32) -> AppResult<NaiveDate> {
    let next_month = if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
            .ok_or_else(|| AppError::bad_request("Invalid month"))?
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
            .ok_or_else(|| AppError::bad_request("Invalid month"))?
    };

    Ok(next_month - Duration::days(1))
}

pub(in crate::reports) fn extract_month_period_sort_date(month_period: &str) -> Option<NaiveDate> {
    let (year, month) = parse_month_period(month_period).ok()?;
    month_end_date(year, month).ok()
}

pub(in crate::reports) fn month_start_end(year: i32, month: u32) -> AppResult<(String, String)> {
    let start = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| AppError::bad_request("Invalid month"))?;
    let end = month_end_date(year, month)?;
    Ok((start.to_string(), end.to_string()))
}
