use chrono::{Datelike, Duration, NaiveDate};
use once_cell::sync::Lazy;
use regex::Regex;

use crate::error::{AppError, AppResult};

static ISO_WEEK_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^(\d{4})W(\d{2})$").expect("valid iso week regex"));

pub(in crate::reports) fn convert_iso_week_to_period(iso_week: &str) -> AppResult<String> {
    let captures = ISO_WEEK_RE
        .captures(iso_week)
        .ok_or_else(|| AppError::bad_request("Invalid ISO week format"))?;

    let year = captures
        .get(1)
        .and_then(|value| value.as_str().parse::<i32>().ok())
        .ok_or_else(|| AppError::bad_request("Invalid ISO week format"))?;

    let week = captures
        .get(2)
        .and_then(|value| value.as_str().parse::<u32>().ok())
        .ok_or_else(|| AppError::bad_request("Invalid ISO week format"))?;

    let jan4 = NaiveDate::from_ymd_opt(year, 1, 4)
        .ok_or_else(|| AppError::bad_request("Invalid ISO week year"))?;

    let week_one_monday = jan4 - Duration::days(jan4.weekday().num_days_from_monday() as i64);
    let target_monday = week_one_monday + Duration::weeks((week.saturating_sub(1)) as i64);
    let target_sunday = target_monday + Duration::days(6);

    Ok(format!(
        "{}/{}/{}~{}/{}/{}",
        target_monday.year(),
        target_monday.month(),
        target_monday.day(),
        target_sunday.year(),
        target_sunday.month(),
        target_sunday.day()
    ))
}
