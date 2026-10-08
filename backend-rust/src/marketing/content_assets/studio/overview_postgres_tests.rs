//! Disposable PostgreSQL contract for the 首页总览 (`GET /studio/overview`).
//! Run through `backend-rust/scripts/test-content-production-postgres.sh`.
use super::overview;
use super::overview_types::StudioOverviewQuery;
use super::postgres_tests::{asset, pool};
use sqlx::PgPool;
use uuid::Uuid;

async fn job(
    pool: &PgPool,
    owner: &str,
    asset: Uuid,
    sha: &str,
    status: &str,
    usage: Option<&str>,
    model: &str,
) -> Uuid {
    let id = Uuid::new_v4();
    let finished = matches!(status, "succeeded" | "failed" | "cancelled");
    sqlx::query(
        "INSERT INTO ads.content_segment_suggestion_jobs \
           (job_id, owner_user_id, asset_id, source_content_hash, preset_key, preset_version, status, \
            error_code, model, usage, result_summary, finished_at) \
         VALUES ($1, $2, $3, $4, 'framework', 1, $5, \
                 CASE WHEN $5 = 'failed' THEN 'provider_error' END, $6, $7::JSONB, \
                 CASE WHEN $5 = 'succeeded' THEN '{}'::JSONB END, CASE WHEN $8 THEN NOW() END)",
    )
    .bind(id)
    .bind(owner)
    .bind(asset)
    .bind(sha)
    .bind(status)
    .bind(model)
    .bind(usage)
    .bind(finished)
    .execute(pool)
    .await
    .unwrap();
    id
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 029-031"]
async fn overview_estimates_owner_scoped_model_spend_and_lists_recent_work() {
    let pool = pool().await;
    let owner = format!("overview-{}", Uuid::new_v4().simple());
    let (first, first_sha) = asset(&pool, Some(&owner), Some(60.0), None).await;
    let (second, second_sha) = asset(&pool, Some(&owner), Some(60.0), None).await;
    let usage = r#"{"input_tokens": 42173, "output_tokens": 410, "input_tokens_details": {"audio_tokens": 862, "cached_tokens": 0}}"#;
    let succeeded = job(
        &pool,
        &owner,
        first,
        &first_sha,
        "succeeded",
        Some(usage),
        "doubao-seed-2-1-lite-260915",
    )
    .await;
    // A failed provider call that still recorded usage is billed; a mock model is counted but unpriced.
    job(
        &pool,
        &owner,
        second,
        &second_sha,
        "failed",
        Some(usage),
        "mock-segment-provider",
    )
    .await;

    let response = overview::overview(
        &pool,
        StudioOverviewQuery { period: None },
        Some(&owner),
        None,
    )
    .await
    .unwrap();
    assert_eq!(response.period.key, "last30");
    assert_eq!(response.scope, "own");
    assert_eq!(response.period.from.len(), 10, "{}", response.period.from);
    assert!(response.period.from <= response.period.to);
    let model = &response.costs.model_analysis;
    assert_eq!((model.calls, model.unpriced_calls), (2, 1));
    assert_eq!(
        (
            model.input_tokens,
            model.audio_input_tokens,
            model.output_tokens
        ),
        (84_346, 1_724, 820)
    );
    let expected = overview::model_cost_cny(42_173, 862, 0, 410);
    assert!((model.estimated_cny - (expected * 10_000.0).round() / 10_000.0).abs() < 1e-9);
    assert_eq!(response.costs.cloud_composition.tasks, 0);
    assert!((response.costs.total_cny - model.estimated_cny).abs() < 1e-9);
    assert_eq!(
        (
            response.pipeline.analysis_succeeded,
            response.pipeline.analysis_failed
        ),
        (1, 1)
    );
    assert_eq!(response.recent.len(), 2);
    assert_eq!(
        response
            .recent
            .iter()
            .filter(|a| a.id == succeeded && a.kind == "analysis")
            .count(),
        1
    );
    assert!(response
        .recent
        .iter()
        .any(|a| a.detail.as_deref() == Some("provider_error")));

    for period in ["last7", "month"] {
        let scoped = overview::overview(
            &pool,
            StudioOverviewQuery {
                period: Some(period.into()),
            },
            Some(&owner),
            None,
        )
        .await
        .unwrap();
        assert_eq!(scoped.costs.model_analysis.calls, 2, "{period}");
    }
    let team = overview::overview(&pool, StudioOverviewQuery { period: None }, None, None)
        .await
        .unwrap();
    assert_eq!(team.scope, "team");
    assert!(team.costs.model_analysis.calls >= 2);
    assert!(overview::overview(
        &pool,
        StudioOverviewQuery {
            period: Some("year".into())
        },
        None,
        None
    )
    .await
    .is_err());
}
