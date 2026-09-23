mod merge;
mod overview;
mod platform;
mod tmall;

use sqlx::PgPool;

use crate::error::AppResult;

use self::overview::build_overview_weekly_summary_facts;
use self::tmall::build_tmall_weekly_summary_facts;
use super::{
    build_weekly_report, summary_generation::normalize_weekly_summary_scope,
    WEEKLY_SUMMARY_SCOPE_TMALL,
};

pub(super) use self::merge::merge_summary_facts;

pub(super) async fn build_weekly_summary_facts(
    pool: &PgPool,
    week_period: &str,
    summary_scope: &str,
) -> AppResult<serde_json::Value> {
    let report = build_weekly_report(pool, week_period).await?;
    let normalized_scope = normalize_weekly_summary_scope(Some(summary_scope));

    let facts = if normalized_scope == WEEKLY_SUMMARY_SCOPE_TMALL {
        build_tmall_weekly_summary_facts(&report, week_period)
    } else {
        build_overview_weekly_summary_facts(&report, week_period, normalized_scope.as_str())
    };

    Ok(facts)
}
