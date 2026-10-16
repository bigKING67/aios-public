// SQLx 0.9 audit: Fixed SQL only; every request value is bound.
//! Persistence for `ads.recruiting_test_submissions` (migration 036).
use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::Value;
use sqlx::{postgres::PgRow, PgPool, Row};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::domain::{total_score, verdict, ValidSubmission};
use super::types::{
    CandidateInput, ReviewScores, ReviewSummary, SubmissionAnswers, SubmissionDetail,
    SubmissionListItem,
};

// Shared column lists, expanded with concat! so every query stays a literal.
macro_rules! review_columns {
    () => {
        "score_project, score_async, score_robustness, score_design, review_note, reviewed_by, reviewed_at"
    };
}
macro_rules! duration_column {
    () => {
        "EXTRACT(EPOCH FROM (submitted_at - started_at))::BIGINT AS duration_seconds"
    };
}

fn db_error(error: sqlx::Error) -> AppError {
    tracing::error!(?error, "recruiting database operation failed");
    AppError::Internal
}

pub(super) struct NewSubmission<'a> {
    pub(super) submission_id: Uuid,
    pub(super) test_key: &'a str,
    pub(super) question_set_version: i32,
    pub(super) submission: &'a ValidSubmission,
    pub(super) client_ip_hash: &'a str,
}

pub(super) async fn insert_submission(
    pool: &PgPool,
    new: NewSubmission<'_>,
) -> AppResult<DateTime<Utc>> {
    let candidate = &new.submission.candidate;
    let answers = serde_json::to_value(&new.submission.answers).map_err(|_| AppError::Internal)?;
    let row = sqlx::query(
        "INSERT INTO ads.recruiting_test_submissions (submission_id, test_key, question_set_version, candidate_name, contact, school_and_grade, weekly_availability, earliest_start, portfolio_url, answers, started_at, client_ip_hash, major) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (submission_id) DO NOTHING RETURNING submitted_at",
    )
    .bind(new.submission_id)
    .bind(new.test_key)
    .bind(new.question_set_version)
    .bind(&candidate.name)
    .bind(&candidate.contact)
    .bind(&candidate.school_and_grade)
    .bind(&candidate.weekly_availability)
    .bind(&candidate.earliest_start)
    .bind(candidate.portfolio_url.as_deref())
    .bind(answers)
    .bind(new.submission.started_at)
    .bind(new.client_ip_hash)
    .bind(&candidate.major)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;
    if let Some(row) = row {
        return Ok(row.get("submitted_at"));
    }
    // A retried POST after a lost response: report the stored submission.
    sqlx::query_scalar(
        "SELECT submitted_at FROM ads.recruiting_test_submissions WHERE submission_id = $1 AND test_key = $2",
    )
    .bind(new.submission_id)
    .bind(new.test_key)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or_else(|| AppError::Conflict("答卷编号冲突，请刷新页面后重新提交".into()))
}

pub(super) async fn count_submissions(pool: &PgPool, test_key: &str) -> AppResult<i64> {
    sqlx::query_scalar(
        "SELECT COUNT(*)::BIGINT FROM ads.recruiting_test_submissions WHERE test_key = $1",
    )
    .bind(test_key)
    .fetch_one(pool)
    .await
    .map_err(db_error)
}

pub(super) async fn list_submissions(
    pool: &PgPool,
    test_key: &str,
    limit: i64,
    offset: i64,
) -> AppResult<Vec<SubmissionListItem>> {
    let rows = sqlx::query(concat!(
        "SELECT submission_id, question_set_version, candidate_name, school_and_grade, submitted_at, ",
        duration_column!(),
        ", ",
        review_columns!(),
        " FROM ads.recruiting_test_submissions WHERE test_key = $1 ORDER BY submitted_at DESC, submission_id LIMIT $2 OFFSET $3"
    ))
        .bind(test_key)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(db_error)?;
    Ok(rows
        .iter()
        .map(|row| SubmissionListItem {
            submission_id: row.get("submission_id"),
            candidate_name: row.get("candidate_name"),
            school_and_grade: row.get("school_and_grade"),
            submitted_at: rfc3339(row.get("submitted_at")),
            duration_seconds: row.get("duration_seconds"),
            review: review_from_row(row),
        })
        .collect())
}

pub(super) async fn fetch_submission(
    pool: &PgPool,
    submission_id: Uuid,
) -> AppResult<SubmissionDetail> {
    let row = sqlx::query(concat!(
        "SELECT submission_id, test_key, question_set_version, candidate_name, contact, school_and_grade, major, weekly_availability, earliest_start, portfolio_url, answers, started_at, submitted_at, ",
        duration_column!(),
        ", ",
        review_columns!(),
        " FROM ads.recruiting_test_submissions WHERE submission_id = $1"
    ))
        .bind(submission_id)
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .ok_or(AppError::NotFound)?;
    let answers: Value = row.get("answers");
    let answers: SubmissionAnswers = serde_json::from_value(answers).map_err(|error| {
        tracing::error!(?error, %submission_id, "recruiting answers do not match the contract");
        AppError::Internal
    })?;
    Ok(SubmissionDetail {
        submission_id: row.get("submission_id"),
        test_key: row.get("test_key"),
        question_set_version: row.get("question_set_version"),
        candidate: CandidateInput {
            name: row.get("candidate_name"),
            contact: row.get("contact"),
            school_and_grade: row.get("school_and_grade"),
            major: row.get("major"),
            weekly_availability: row.get("weekly_availability"),
            earliest_start: row.get("earliest_start"),
            portfolio_url: row.get("portfolio_url"),
        },
        answers,
        started_at: row
            .get::<Option<DateTime<Utc>>, _>("started_at")
            .map(rfc3339),
        submitted_at: rfc3339(row.get("submitted_at")),
        duration_seconds: row.get("duration_seconds"),
        review: review_from_row(&row),
    })
}

pub(super) async fn save_review(
    pool: &PgPool,
    submission_id: Uuid,
    scores: ReviewScores,
    note: Option<&str>,
    reviewer: &str,
) -> AppResult<()> {
    let result = sqlx::query(
        "UPDATE ads.recruiting_test_submissions SET score_project = $2, score_async = $3, score_robustness = $4, score_design = $5, review_note = $6, reviewed_by = $7, reviewed_at = NOW() WHERE submission_id = $1",
    )
    .bind(submission_id)
    .bind(scores.project)
    .bind(scores.async_logic)
    .bind(scores.robustness)
    .bind(scores.design)
    .bind(note)
    .bind(reviewer)
    .execute(pool)
    .await
    .map_err(db_error)?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

fn rfc3339(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn review_from_row(row: &PgRow) -> Option<ReviewSummary> {
    let scores = ReviewScores {
        project: row.get::<Option<i16>, _>("score_project")?,
        async_logic: row.get::<Option<i16>, _>("score_async")?,
        robustness: row.get::<Option<i16>, _>("score_robustness")?,
        design: row.get::<Option<i16>, _>("score_design")?,
    };
    Some(ReviewSummary {
        scores,
        total: total_score(scores),
        verdict: verdict(scores, row.get("question_set_version"))
            .as_str()
            .to_string(),
        note: row.get("review_note"),
        reviewed_by: row.get("reviewed_by"),
        reviewed_at: rfc3339(row.get::<Option<DateTime<Utc>>, _>("reviewed_at")?),
    })
}
