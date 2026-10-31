//! Which dates the 首页总览 and 爆款分析 count, as Asia/Shanghai calendar dates: the day,
//! month or year around an anchor (default: the newest activity in scope), a custom range,
//! or (首页 only) the legacy rolling `period` windows.
use super::overview_types::StudioOverviewQuery;
use crate::error::AppError;
use chrono::{DateTime, Datelike, Duration, FixedOffset, Months, NaiveDate, TimeZone, Utc};

/// Longest custom range, in days (both ends included).
pub(super) const MAX_CUSTOM_DAYS: i64 = 366;

#[derive(Debug, PartialEq)]
pub(super) struct OverviewWindow {
    /// `day` | `month` | `year` | `custom`, or a legacy rolling period.
    pub(super) key: String,
    pub(super) from: NaiveDate,
    /// Last counted date; a period still running stops at today.
    pub(super) to: NaiveDate,
    /// Last date of the calendar period (the month end of a running month).
    pub(super) last: NaiveDate,
    /// Counted instants: `start <= t < end`.
    pub(super) start: DateTime<Utc>,
    pub(super) end: DateTime<Utc>,
}

fn shanghai() -> FixedOffset {
    FixedOffset::east_opt(8 * 3600).expect("+08 offset")
}

pub(super) fn shanghai_date(instant: DateTime<Utc>) -> NaiveDate {
    instant.with_timezone(&shanghai()).date_naive()
}

fn midnight(date: NaiveDate) -> DateTime<Utc> {
    shanghai()
        .from_local_datetime(&date.and_hms_opt(0, 0, 0).expect("midnight"))
        .single()
        .expect("fixed offset has one midnight")
        .with_timezone(&Utc)
}

fn next_day(date: NaiveDate) -> Result<NaiveDate, AppError> {
    date.succ_opt()
        .ok_or_else(|| AppError::bad_request("日期超出范围"))
}

fn parse_date(name: &str, value: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::bad_request(format!("{name} 需要 YYYY-MM-DD 日期")))
}

fn calendar(
    key: &str,
    from: NaiveDate,
    last: NaiveDate,
    today: NaiveDate,
) -> Result<OverviewWindow, AppError> {
    Ok(OverviewWindow {
        key: key.to_string(),
        from,
        to: last.min(today).max(from),
        last,
        start: midnight(from),
        end: midnight(next_day(last)?),
    })
}

/// The calendar part of a query: `from` + `to`, or `unit` with an optional `date`.
#[derive(Debug, Default, Clone, Copy)]
pub(super) struct CalendarQuery<'a> {
    pub(super) unit: Option<&'a str>,
    pub(super) date: Option<&'a str>,
    pub(super) from: Option<&'a str>,
    pub(super) to: Option<&'a str>,
}

impl OverviewWindow {
    /// The calendar window as stored by the competitor worker: `YYYY-MM-DD..YYYY-MM-DD`.
    pub(super) fn window_key(&self) -> String {
        format!(
            "{}..{}",
            self.from.format("%Y-%m-%d"),
            self.last.format("%Y-%m-%d")
        )
    }

    /// The period before, for 较上一周期: the previous day, month or year, or the same number of
    /// days just before a custom range. None for the legacy rolling windows.
    pub(super) fn previous(&self) -> Option<(NaiveDate, NaiveDate)> {
        let before = self.from.pred_opt()?;
        match self.key.as_str() {
            "day" => Some((before, before)),
            "month" => Some((before.with_day(1)?, before)),
            "year" => Some((NaiveDate::from_ymd_opt(before.year(), 1, 1)?, before)),
            "custom" => Some((
                self.from - (self.last - self.from) - Duration::days(1),
                before,
            )),
            _ => None,
        }
    }
}

/// None when the query names neither a range nor a unit (the caller picks its default).
pub(super) fn resolve_calendar(
    query: CalendarQuery<'_>,
    today: NaiveDate,
    latest: Option<NaiveDate>,
) -> Result<Option<OverviewWindow>, AppError> {
    if query.from.is_some() || query.to.is_some() {
        let (Some(from), Some(to)) = (query.from, query.to) else {
            return Err(AppError::bad_request("from 和 to 需要同时提供"));
        };
        let (from, to) = (parse_date("from", from)?, parse_date("to", to)?);
        if from > to {
            return Err(AppError::bad_request("from 不能晚于 to"));
        }
        if (to - from).num_days() + 1 > MAX_CUSTOM_DAYS {
            return Err(AppError::bad_request(format!(
                "自定义范围最多 {MAX_CUSTOM_DAYS} 天"
            )));
        }
        return calendar("custom", from, to, today).map(Some);
    }
    if let Some(unit) = query.unit {
        let anchor = match query.date {
            Some(date) => parse_date("date", date)?,
            None => latest.unwrap_or(today),
        };
        let invalid = || AppError::bad_request("日期超出范围");
        let (from, last) = match unit {
            "day" => (anchor, anchor),
            "month" => {
                let first = anchor.with_day(1).ok_or_else(invalid)?;
                let last = first
                    .checked_add_months(Months::new(1))
                    .and_then(|next| next.pred_opt())
                    .ok_or_else(invalid)?;
                (first, last)
            }
            "year" => (
                NaiveDate::from_ymd_opt(anchor.year(), 1, 1).ok_or_else(invalid)?,
                NaiveDate::from_ymd_opt(anchor.year(), 12, 31).ok_or_else(invalid)?,
            ),
            _ => return Err(AppError::bad_request("unit 只支持 day、month、year")),
        };
        return calendar(unit, from, last, today).map(Some);
    }
    Ok(None)
}

/// 首页: `latest` is the newest activity date in scope; it anchors `unit` when `date` is absent.
pub(super) fn resolve(
    query: &StudioOverviewQuery,
    now: DateTime<Utc>,
    latest: Option<NaiveDate>,
) -> Result<OverviewWindow, AppError> {
    let today = shanghai_date(now);
    let calendar_query = CalendarQuery {
        unit: query.unit.as_deref(),
        date: query.date.as_deref(),
        from: query.from.as_deref(),
        to: query.to.as_deref(),
    };
    if let Some(window) = resolve_calendar(calendar_query, today, latest)? {
        return Ok(window);
    }
    let key = query.period.clone().unwrap_or_else(|| "last30".to_string());
    let start = match key.as_str() {
        "last7" => now - Duration::days(7),
        "last30" => now - Duration::days(30),
        "month" => midnight(today.with_day(1).expect("first of month")),
        _ => return Err(AppError::bad_request("period 只支持 last7、last30、month")),
    };
    Ok(OverviewWindow {
        key,
        from: shanghai_date(start),
        to: today,
        last: today,
        start,
        end: midnight(next_day(today)?),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(
        unit: Option<&str>,
        date: Option<&str>,
        from: Option<&str>,
        to: Option<&str>,
    ) -> StudioOverviewQuery {
        StudioOverviewQuery {
            period: None,
            unit: unit.map(Into::into),
            date: date.map(Into::into),
            from: from.map(Into::into),
            to: to.map(Into::into),
        }
    }

    fn day(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    // 2026-10-26 10:00 in Shanghai.
    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-10-26T02:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn units_default_to_the_newest_activity() {
        let latest = Some(day("2026-10-23"));
        let window = resolve(&query(Some("day"), None, None, None), now(), latest).unwrap();
        assert_eq!(
            (window.key.as_str(), window.from, window.to),
            ("day", day("2026-10-23"), day("2026-10-23"))
        );
        assert_eq!(window.start.to_rfc3339(), "2026-10-22T16:00:00+00:00");
        assert_eq!(window.end.to_rfc3339(), "2026-10-23T16:00:00+00:00");

        let month = resolve(&query(Some("month"), None, None, None), now(), latest).unwrap();
        assert_eq!(
            (month.from, month.to),
            (day("2026-10-01"), day("2026-10-26"))
        );
        assert_eq!(month.end, midnight(day("2026-11-01")));

        let year = resolve(&query(Some("year"), None, None, None), now(), None).unwrap();
        assert_eq!((year.from, year.to), (day("2026-01-01"), day("2026-10-26")));
    }

    #[test]
    fn an_explicit_date_picks_a_whole_past_period() {
        let feb = resolve(
            &query(Some("month"), Some("2024-02-10"), None, None),
            now(),
            None,
        )
        .unwrap();
        assert_eq!((feb.from, feb.to), (day("2024-02-01"), day("2024-02-29")));
        assert_eq!(feb.end, midnight(day("2024-03-01")));
    }

    #[test]
    fn custom_ranges_are_inclusive_and_bounded() {
        let range = resolve(
            &query(None, None, Some("2026-09-01"), Some("2026-09-15")),
            now(),
            None,
        )
        .unwrap();
        assert_eq!(
            (range.key.as_str(), range.from, range.to),
            ("custom", day("2026-09-01"), day("2026-09-15"))
        );
        assert_eq!(range.end, midnight(day("2026-09-16")));

        for bad in [
            query(None, None, Some("2026-09-15"), Some("2026-09-01")),
            query(None, None, Some("2025-01-01"), Some("2026-09-01")),
            query(None, None, Some("2026-09-01"), None),
            query(None, None, Some("2026/09/01"), Some("2026-09-02")),
            query(Some("week"), None, None, None),
        ] {
            assert!(resolve(&bad, now(), None).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn legacy_periods_still_resolve() {
        let mut legacy = query(None, None, None, None);
        let window = resolve(&legacy, now(), None).unwrap();
        assert_eq!(
            (window.key.as_str(), window.from, window.to),
            ("last30", day("2026-09-26"), day("2026-10-26"))
        );
        legacy.period = Some("month".into());
        assert_eq!(
            resolve(&legacy, now(), None).unwrap().from,
            day("2026-10-01")
        );
        legacy.period = Some("year".into());
        assert!(resolve(&legacy, now(), None).is_err());
    }

    #[test]
    fn windows_name_their_calendar_key_and_the_period_before() {
        let month = resolve(
            &query(Some("month"), Some("2026-03-09"), None, None),
            now(),
            None,
        )
        .unwrap();
        assert_eq!(month.window_key(), "2026-03-01..2026-03-31");
        assert_eq!(
            month.previous(),
            Some((day("2026-02-01"), day("2026-02-28")))
        );
        let running = resolve(&query(Some("month"), None, None, None), now(), None).unwrap();
        assert_eq!(
            (running.to, running.window_key().as_str()),
            (day("2026-10-26"), "2026-10-01..2026-10-31")
        );
        let day_window = resolve(
            &query(Some("day"), Some("2026-01-01"), None, None),
            now(),
            None,
        )
        .unwrap();
        assert_eq!(
            day_window.previous(),
            Some((day("2025-12-31"), day("2025-12-31")))
        );
        let year = resolve(
            &query(Some("year"), Some("2026-05-05"), None, None),
            now(),
            None,
        )
        .unwrap();
        assert_eq!(
            year.previous(),
            Some((day("2025-01-01"), day("2025-12-31")))
        );
        let custom = resolve(
            &query(None, None, Some("2026-09-11"), Some("2026-09-20")),
            now(),
            None,
        )
        .unwrap();
        assert_eq!(custom.window_key(), "2026-09-11..2026-09-20");
        assert_eq!(
            custom.previous(),
            Some((day("2026-09-01"), day("2026-09-10")))
        );
        let legacy = resolve(&StudioOverviewQuery::default(), now(), None).unwrap();
        assert_eq!(legacy.previous(), None);
        assert!(
            resolve_calendar(CalendarQuery::default(), day("2026-10-26"), None)
                .unwrap()
                .is_none()
        );
    }
}
