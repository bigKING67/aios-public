//! Disposable PostgreSQL contract for the 爆款拆解 report (`/studio/competitor/reports`).
//! Run through `backend-rust/scripts/test-content-production-postgres.sh`.
use super::competitor_reports::{latest, request, MIN_FILMS, PROMPT_VERSION};
use super::competitor_types::CreateCompetitorReportRequest;
use super::postgres_tests::{pool, user};
use sqlx::PgPool;
use uuid::Uuid;

/// A category key of lowercase letters only, unique per test run.
fn cohort() -> String {
    Uuid::new_v4()
        .simple()
        .to_string()
        .bytes()
        .take(12)
        .map(|b| (b'a' + b % 26) as char)
        .collect()
}

/// The window the tests ask for: September 2026 as a custom range (key `2026-09-01..2026-09-30`).
const FROM: &str = "2026-09-01";
const TO: &str = "2026-09-30";

/// A snapshot of `films` films, re-posted materials included: one opening family per two films.
async fn snapshot(pool: &PgPool, cohort: &str, input: &str, films: i32) {
    sqlx::query(
        "INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, \
           normalization_version, input_snapshot, source_watermark, films, families, payload) \
         VALUES ($1, '2026-09-01..2026-09-30', 'competitor-stats-v2', 'competitor-taxonomy-v3', 'competitor-structure-v1', \
                 $2, 'w', $3, $3 / 2, '{}'::JSONB)",
    )
    .bind(cohort)
    .bind(input)
    .bind(films)
    .execute(pool)
    .await
    .unwrap();
}

fn body(cohort: &str) -> CreateCompetitorReportRequest {
    CreateCompetitorReportRequest {
        category: Some(cohort.into()),
        period: None,
        unit: None,
        date: None,
        from: Some(FROM.into()),
        to: Some(TO.into()),
        ..Default::default()
    }
}

fn window_query(cohort: &str) -> CreateCompetitorReportRequest {
    CreateCompetitorReportRequest {
        category: Some(cohort.into()),
        from: Some(FROM.into()),
        to: Some(TO.into()),
        ..Default::default()
    }
}

async fn cleanup(pool: &PgPool, cohort: &str) {
    sqlx::query("DELETE FROM competitor.reports WHERE cohort = $1")
        .bind(cohort)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM competitor.stat_snapshots WHERE cohort = $1")
        .bind(cohort)
        .execute(pool)
        .await
        .unwrap();
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with bql 002-004 and 006"]
async fn a_report_is_queued_once_per_snapshot_input_and_read_back_as_latest() {
    let pool = pool().await;
    let cohort = cohort();
    // Enough films even though half are re-posts: v12 counts films, not opening families.
    snapshot(&pool, &cohort, "input-a", MIN_FILMS).await;
    let first = request(&pool, &user("report-a"), body(&cohort))
        .await
        .unwrap();
    assert_eq!(
        (first.status.as_str(), first.prompt_version.as_str()),
        ("queued", PROMPT_VERSION)
    );
    // No data of ours goes with the request until 视频云管家 spend is connected.
    assert!(first.inputs.is_none());

    // A repeat click returns the live report instead of paying again.
    let again = request(&pool, &user("report-b"), body(&cohort))
        .await
        .unwrap();
    assert_eq!(again.report_id, first.report_id);

    // Once it failed, the same input may be requested anew.
    sqlx::query(
        "UPDATE competitor.reports SET status = 'failed', error_code = 'invalid_report' WHERE report_id = $1",
    )
    .bind(first.report_id)
    .execute(&pool)
    .await
    .unwrap();
    let retried = request(&pool, &user("report-a"), body(&cohort))
        .await
        .unwrap();
    assert_ne!(retried.report_id, first.report_id);

    // New analyses move the snapshot on; latest still shows the report with the new input beside it.
    snapshot(&pool, &cohort, "input-b", MIN_FILMS + 1).await;
    let view = latest(&pool, window_query(&cohort)).await.unwrap();
    let report = view.report.unwrap();
    assert_eq!(report.report_id, retried.report_id);
    assert_eq!(report.input_snapshot, "input-a");
    assert_eq!(view.current_input_snapshot.as_deref(), Some("input-b"));
    assert_eq!(
        (view.films, view.min_films),
        (Some(MIN_FILMS + 1), MIN_FILMS)
    );
    cleanup(&pool, &cohort).await;
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with bql 002-004 and 006"]
async fn a_small_sample_or_missing_snapshot_is_refused_without_a_row() {
    let pool = pool().await;
    let cohort = cohort();
    assert!(request(&pool, &user("report-a"), body(&cohort))
        .await
        .is_err());
    snapshot(&pool, &cohort, "input-small", MIN_FILMS - 1).await;
    assert!(request(&pool, &user("report-a"), body(&cohort))
        .await
        .is_err());
    let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM competitor.reports WHERE cohort = $1")
        .bind(&cohort)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows, 0);
    let view = latest(&pool, window_query(&cohort)).await.unwrap();
    assert!(view.report.is_none());
    assert_eq!(view.films, Some(MIN_FILMS - 1));
    cleanup(&pool, &cohort).await;
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with bql 002-004 and 006"]
async fn opening_jobs_deduplicate_concurrent_requests_and_require_explicit_failure_retry() {
    let pool = pool().await;
    let cohort = cohort();
    snapshot(&pool, &cohort, "opening-a", 2).await;
    let mut opening = body(&cohort);
    opening.kind = Some("openings".into());
    let first_user = user("opening-a");
    let second_user = user("opening-b");
    let (a, b) = tokio::join!(
        request(&pool, &first_user, opening.clone()),
        request(&pool, &second_user, opening.clone())
    );
    let first = a.unwrap();
    assert_eq!(first.report_id, b.unwrap().report_id);
    sqlx::query("UPDATE competitor.reports SET status='failed', error_code='fixture_failure' WHERE report_id=$1")
        .bind(first.report_id)
        .execute(&pool)
        .await
        .unwrap();
    let again = request(&pool, &first_user, opening.clone()).await.unwrap();
    assert_eq!(again.report_id, first.report_id);
    assert_eq!(again.status, "failed");
    let view = latest(&pool, opening.clone()).await.unwrap();
    assert_eq!(view.min_films, 1);
    assert_eq!(view.report.unwrap().report_id, first.report_id);
    opening.retry = true;
    let retried = request(&pool, &first_user, opening).await.unwrap();
    assert_ne!(retried.report_id, first.report_id);
    // Full readings remain a separate job and preserve their sample threshold.
    assert!(latest(&pool, window_query(&cohort))
        .await
        .unwrap()
        .report
        .is_none());
    cleanup(&pool, &cohort).await;
}
