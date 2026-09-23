use chrono::NaiveDate;

use crate::error::{AppError, AppResult};

pub(super) struct OverviewRange {
    pub(super) curr_start: NaiveDate,
    pub(super) curr_end_exclusive: NaiveDate,
    pub(super) prev_start: NaiveDate,
}

pub(super) fn previous_month(year: i32, month: u32) -> (i32, u32) {
    if month == 1 {
        (year - 1, 12)
    } else {
        (year, month - 1)
    }
}

pub(super) fn overview_range(year: i32, month: u32) -> AppResult<OverviewRange> {
    let curr_start = month_start(year, month)?;
    let curr_end_exclusive = if month == 12 {
        month_start(year + 1, 1)?
    } else {
        month_start(year, month + 1)?
    };
    let (prev_year, prev_month) = previous_month(year, month);
    let prev_start = month_start(prev_year, prev_month)?;

    Ok(OverviewRange {
        curr_start,
        curr_end_exclusive,
        prev_start,
    })
}

fn month_start(year: i32, month: u32) -> AppResult<NaiveDate> {
    NaiveDate::from_ymd_opt(year, month, 1).ok_or_else(|| AppError::bad_request("Invalid month"))
}
