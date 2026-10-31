//! 爆款分析的品类与时间范围：与首页同一套日 / 月 / 年 / 自定义（`overview_window`），按视频首次
//! 入库的北京日期归属；不带日期的粒度落在该品类最近一条已拆解视频的入库日。窗口键与 worker 写的
//! 快照和总结一致（`all` 或 `YYYY-MM-DD..YYYY-MM-DD`，见 competitor_analysis/snapshots.py）。

use chrono::{Duration, NaiveDate, Utc};
use sqlx::PgPool;

use super::{
    competitor_overview::SCOPED_CTE,
    competitor_types::CompetitorPatternsQuery,
    error::StudioResult,
    overview_types::StudioOverviewPeriod,
    overview_window::{resolve_calendar, shanghai_date, CalendarQuery, OverviewWindow},
    repository::db_error,
};
use crate::error::AppError;

const DEFAULT_CATEGORY: &str = "loose_powder";
const ALL_TIME: &str = "all";

const LATEST_SELECT: &str = "SELECT MAX(s.seen_date) FROM scoped s";

pub(super) struct CompetitorScope {
    pub(super) category: String,
    /// Snapshot and report key: `all` or the calendar window.
    pub(super) key: String,
    /// None for all time (the legacy `period=all`).
    pub(super) window: Option<OverviewWindow>,
    pub(super) today: NaiveDate,
    /// Newest first-seen date of an analysed film in the category.
    pub(super) latest: Option<NaiveDate>,
}

impl CompetitorScope {
    /// First and last counted dates; None for all time.
    pub(super) fn bounds(&self) -> Option<(NaiveDate, NaiveDate)> {
        self.window
            .as_ref()
            .map(|window| (window.from, window.last))
    }

    pub(super) fn previous(&self) -> Option<(NaiveDate, NaiveDate)> {
        self.window.as_ref().and_then(OverviewWindow::previous)
    }

    pub(super) fn period(&self) -> StudioOverviewPeriod {
        let date = |value: NaiveDate| value.format("%Y-%m-%d").to_string();
        let (key, from, to) = match &self.window {
            Some(window) => (window.key.clone(), window.from, window.to),
            None => (ALL_TIME.to_string(), self.today, self.today),
        };
        StudioOverviewPeriod {
            key,
            from: date(from),
            to: date(to),
            today: date(self.today),
            latest_activity_date: self.latest.map(date),
        }
    }
}

fn valid_category(value: &str) -> bool {
    (1..=40).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'_')
}

pub(super) fn category_of(query: &CompetitorPatternsQuery) -> StudioResult<String> {
    let category = query
        .category
        .clone()
        .unwrap_or_else(|| DEFAULT_CATEGORY.to_string());
    if !valid_category(&category) {
        return Err(
            AppError::BadRequest("category 只能是品类代码（小写字母与下划线）".into()).into(),
        );
    }
    Ok(category)
}

/// The window from the query alone: the calendar parameters (default `unit=month`), or a legacy
/// `period` (`last7` / `last30` become the same days ending today, `all` is all time).
pub(super) fn window_of(
    query: &CompetitorPatternsQuery,
    today: NaiveDate,
    latest: Option<NaiveDate>,
) -> StudioResult<Option<OverviewWindow>> {
    let calendar = CalendarQuery {
        unit: query.unit.as_deref(),
        date: query.date.as_deref(),
        from: query.from.as_deref(),
        to: query.to.as_deref(),
    };
    let named = calendar.unit.is_some() || calendar.from.is_some() || calendar.to.is_some();
    if !named {
        let legacy_days = match query.period.as_deref() {
            None => None,
            Some(ALL_TIME) => return Ok(None),
            Some("last7") => Some(7),
            Some("last30") => Some(30),
            Some(_) => {
                return Err(AppError::bad_request("period 只能是 last7、last30 或 all").into())
            }
        };
        if let Some(days) = legacy_days {
            let from = (today - Duration::days(days - 1))
                .format("%Y-%m-%d")
                .to_string();
            let to = today.format("%Y-%m-%d").to_string();
            let range = CalendarQuery {
                from: Some(&from),
                to: Some(&to),
                ..CalendarQuery::default()
            };
            return Ok(resolve_calendar(range, today, latest)?);
        }
    }
    let calendar = if named {
        calendar
    } else {
        CalendarQuery {
            unit: Some("month"),
            ..CalendarQuery::default()
        }
    };
    Ok(resolve_calendar(calendar, today, latest)?)
}

pub(super) async fn resolve_scope(
    pool: &PgPool,
    query: &CompetitorPatternsQuery,
) -> StudioResult<CompetitorScope> {
    let category = category_of(query)?;
    let today = shanghai_date(Utc::now());
    let latest: Option<NaiveDate> =
        sqlx::query_scalar(sqlx::AssertSqlSafe(format!("{SCOPED_CTE} {LATEST_SELECT}")))
            .bind(&category)
            .fetch_one(pool)
            .await
            .map_err(db_error)?;
    let window = window_of(query, today, latest)?;
    let key = window
        .as_ref()
        .map_or_else(|| ALL_TIME.to_string(), OverviewWindow::window_key);
    Ok(CompetitorScope {
        category,
        key,
        window,
        today,
        latest,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    fn query(pairs: &[(&str, &str)]) -> CompetitorPatternsQuery {
        let mut query = CompetitorPatternsQuery::default();
        for (name, value) in pairs {
            let value = Some((*value).to_string());
            match *name {
                "category" => query.category = value,
                "period" => query.period = value,
                "unit" => query.unit = value,
                "date" => query.date = value,
                "from" => query.from = value,
                "to" => query.to = value,
                _ => unreachable!(),
            }
        }
        query
    }

    fn key(pairs: &[(&str, &str)], latest: Option<NaiveDate>) -> String {
        window_of(&query(pairs), day("2026-10-26"), latest)
            .unwrap()
            .map_or_else(|| ALL_TIME.to_string(), |window| window.window_key())
    }

    #[test]
    fn defaults_to_the_month_of_the_newest_film() {
        assert_eq!(key(&[], Some(day("2026-09-14"))), "2026-09-01..2026-09-30");
        assert_eq!(key(&[], None), "2026-10-01..2026-10-31");
        assert_eq!(
            key(&[("unit", "day")], Some(day("2026-10-24"))),
            "2026-10-24..2026-10-24"
        );
        assert_eq!(
            key(&[("unit", "year"), ("date", "2025-03-03")], None),
            "2025-01-01..2025-12-31"
        );
        assert_eq!(
            key(&[("from", "2026-10-01"), ("to", "2026-10-15")], None),
            "2026-10-01..2026-10-15"
        );
    }

    #[test]
    fn legacy_periods_map_to_windows_ending_today() {
        assert_eq!(key(&[("period", "last7")], None), "2026-10-20..2026-10-26");
        assert_eq!(key(&[("period", "last30")], None), "2026-09-27..2026-10-26");
        assert_eq!(key(&[("period", "all")], None), "all");
        // Calendar parameters win over a stale period in the same URL.
        assert_eq!(
            key(
                &[("period", "all"), ("unit", "day"), ("date", "2026-10-02")],
                None
            ),
            "2026-10-02..2026-10-02"
        );
        assert!(window_of(&query(&[("period", "last90")]), day("2026-10-26"), None).is_err());
    }

    #[test]
    fn categories_are_keys_only() {
        assert_eq!(category_of(&query(&[])).unwrap(), "loose_powder");
        for good in ["cushion", "all"] {
            assert!(category_of(&query(&[("category", good)])).is_ok());
        }
        for bad in ["散粉", "loose_powder' OR 1=1", "", "Loose"] {
            assert!(category_of(&query(&[("category", bad)])).is_err(), "{bad}");
        }
    }
}
