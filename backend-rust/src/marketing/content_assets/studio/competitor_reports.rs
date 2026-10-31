//! 竞品爆款 · 爆款拆解 生成拆解 (semantic openings v1 / reading v13): queue a report for the latest
//! statistics snapshot of a category and window, and read the latest one back.
//! The competitor worker generates and validates it (`competitor_analysis/report_breakdown.py`);
//! the page renders every number from the counted rows the worker stores in `inputs`.
//! The reading has no data of ours: our originals are counted from 视频云管家 spend once connected.

use sqlx::{postgres::PgRow, PgPool, Row};

use super::{
    competitor_types::{
        CompetitorPatternsQuery, CompetitorReport, CompetitorReportLatestResponse,
        CreateCompetitorReportRequest,
    },
    competitor_window::resolve_scope,
    error::StudioResult,
    repository::db_error,
};
use crate::{auth::CurrentUser, error::AppError};

/// Must match `report_breakdown.PROMPT_VERSION`; a new version means a new report for the same input.
pub(super) const PROMPT_VERSION: &str = "competitor-report-b-v13-semantic";
/// Same threshold as the worker (`report_breakdown.MIN_FILMS`) and the page's small-sample rule.
pub(super) const MIN_FILMS: i32 = 10;
pub(super) const OPENING_VERSION: &str = "competitor-opening-semantic-v1";

fn mode(body: &CreateCompetitorReportRequest) -> StudioResult<(&'static str, i32)> {
    match body.kind.as_deref() {
        None | Some("breakdown") => Ok((PROMPT_VERSION, MIN_FILMS)),
        Some("openings") => Ok((OPENING_VERSION, 1)),
        _ => Err(AppError::bad_request("未知的拆解类型").into()),
    }
}

fn filters(body: CreateCompetitorReportRequest) -> CompetitorPatternsQuery {
    CompetitorPatternsQuery {
        category: body.category,
        period: body.period,
        unit: body.unit,
        date: body.date,
        from: body.from,
        to: body.to,
    }
}

const SNAPSHOT_SELECT: &str = "SELECT input_snapshot, films FROM competitor.stat_snapshots \
    WHERE cohort = $1 AND period = $2 ORDER BY computed_at DESC LIMIT 1";

// A macro so every statement stays a static string (sqlx rejects runtime-built SQL).
macro_rules! report_columns {
    () => {
        "report_id, cohort, period, input_snapshot, prompt_version, status, model_id, inputs, report, \
         issues, cost_yuan::FLOAT8 AS cost_yuan, error_code, error_message, \
         created_at::TEXT AS created_at, finished_at::TEXT AS finished_at"
    };
}

const FOR_INPUT_SELECT: &str = concat!(
    "SELECT ",
    report_columns!(),
    " FROM competitor.reports WHERE cohort = $1 AND period = $2 AND input_snapshot = $3 \
      AND prompt_version = $4 AND (status IN ('queued', 'running', 'succeeded') OR $5) \
      ORDER BY created_at DESC LIMIT 1"
);

const LATEST_SELECT: &str = concat!(
    "SELECT ",
    report_columns!(),
    " FROM competitor.reports WHERE cohort = $1 AND period = $2 AND prompt_version = $3 \
      ORDER BY created_at DESC LIMIT 1"
);

const REPORT_INSERT: &str = concat!(
    "INSERT INTO competitor.reports (cohort, period, input_snapshot, prompt_version, requested_by) \
     VALUES ($1, $2, $3, $4, $5) \
     ON CONFLICT (cohort, period, input_snapshot, prompt_version) \
       WHERE status IN ('queued', 'running', 'succeeded') DO NOTHING RETURNING ",
    report_columns!()
);

fn report_from_row(row: &PgRow) -> CompetitorReport {
    CompetitorReport {
        report_id: row.get("report_id"),
        category: row.get("cohort"),
        period: row.get("period"),
        input_snapshot: row.get("input_snapshot"),
        prompt_version: row.get("prompt_version"),
        status: row.get("status"),
        model_id: row.get("model_id"),
        inputs: row.get("inputs"),
        report: row.get("report"),
        issues: row.get("issues"),
        cost_yuan: row.get("cost_yuan"),
        error_code: row.get("error_code"),
        error_message: row.get("error_message"),
        created_at: row.get("created_at"),
        finished_at: row.get("finished_at"),
    }
}

/// `{assets, labels: {label: originals}, structures}`: what the worker compares the competitor
/// selling points and structures with (structures as the patterns API returns them).
async fn current_snapshot(
    pool: &PgPool,
    category: &str,
    period: &str,
) -> StudioResult<Option<(String, i32)>> {
    Ok(sqlx::query(SNAPSHOT_SELECT)
        .bind(category)
        .bind(period)
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .map(|row| (row.get("input_snapshot"), row.get("films"))))
}

async fn report_for_input(
    pool: &PgPool,
    category: &str,
    period: &str,
    input_snapshot: &str,
    version: &str,
    include_failed: bool,
) -> StudioResult<Option<CompetitorReport>> {
    Ok(sqlx::query(FOR_INPUT_SELECT)
        .bind(category)
        .bind(period)
        .bind(input_snapshot)
        .bind(version)
        .bind(include_failed)
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .as_ref()
        .map(report_from_row))
}

pub(super) async fn latest(
    pool: &PgPool,
    query: CreateCompetitorReportRequest,
) -> StudioResult<CompetitorReportLatestResponse> {
    let (version, minimum) = mode(&query)?;
    let scope = resolve_scope(pool, &filters(query)).await?;
    let (category, period) = (scope.category, scope.key);
    let report = sqlx::query(LATEST_SELECT)
        .bind(&category)
        .bind(&period)
        .bind(version)
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .as_ref()
        .map(report_from_row);
    let snapshot = current_snapshot(pool, &category, &period).await?;
    Ok(CompetitorReportLatestResponse {
        category,
        period,
        report,
        current_input_snapshot: snapshot.as_ref().map(|(input, _)| input.clone()),
        films: snapshot.map(|(_, films)| films),
        min_films: minimum,
    })
}

/// Queues a report for the current snapshot. Repeat requests for the same input return the
/// live or finished report instead of paying again; a failed one may be requested anew.
pub(super) async fn request(
    pool: &PgPool,
    user: &CurrentUser,
    body: CreateCompetitorReportRequest,
) -> StudioResult<CompetitorReport> {
    let (version, minimum) = mode(&body)?;
    let include_failed = version == OPENING_VERSION && !body.retry;
    let scope = resolve_scope(pool, &filters(body)).await?;
    let (category, period) = (scope.category, scope.key);
    let Some((input_snapshot, films)) = current_snapshot(pool, &category, &period).await? else {
        return Err(AppError::bad_request("这个品类和时间段还没有统计，稍后再试").into());
    };
    if films < minimum {
        return Err(AppError::bad_request(format!(
            "样本不足：{films} 条，至少需要 {minimum} 条才能生成拆解"
        ))
        .into());
    }
    if let Some(existing) = report_for_input(
        pool,
        &category,
        &period,
        &input_snapshot,
        version,
        include_failed,
    )
    .await?
    {
        return Ok(existing);
    }
    let inserted = sqlx::query(REPORT_INSERT)
        .bind(&category)
        .bind(&period)
        .bind(&input_snapshot)
        .bind(version)
        .bind(&user.user_id)
        .fetch_optional(pool)
        .await
        .map_err(db_error)?;
    match inserted {
        Some(row) => Ok(report_from_row(&row)),
        // A concurrent request queued it first.
        None => report_for_input(
            pool,
            &category,
            &period,
            &input_snapshot,
            version,
            include_failed,
        )
        .await?
        .ok_or_else(|| AppError::NotFound.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_version_matches_the_worker() {
        let worker = include_str!(
            "../../../../../etl/groland_postgres/scripts/content_production/competitor_analysis/report_breakdown.py"
        );
        assert!(worker.contains(&format!("PROMPT_VERSION = '{PROMPT_VERSION}'")));
        assert!(worker.contains(&format!("MIN_FILMS = {MIN_FILMS}")));
        let formulas = include_str!(
            "../../../../../etl/groland_postgres/scripts/content_production/competitor_analysis/opening_formulas.py"
        );
        assert!(formulas.contains(&format!("PROMPT_VERSION = '{OPENING_VERSION}'")));
    }

    #[test]
    fn opening_mode_is_explicit_and_does_not_require_ten_films() {
        let mut body = CreateCompetitorReportRequest::default();
        assert_eq!(mode(&body).unwrap(), (PROMPT_VERSION, 10));
        body.kind = Some("openings".into());
        assert_eq!(mode(&body).unwrap(), (OPENING_VERSION, 1));
        body.kind = Some("unknown".into());
        assert!(mode(&body).is_err());
    }
}
