//! Disposable PostgreSQL contract for 单条剪辑 (`remix_edit`), run with the
//! 框架混剪 suite through `backend-rust/scripts/test-content-production-postgres.sh`.
//! Each test uses its own owner and product.
use super::error::{ConflictCode, StudioError};
use super::postgres_tests::{pool, user, SCOPED};
use super::remix;
use super::remix_cancel;
use super::remix_edit;
use super::remix_postgres_tests::{asset, conflict_code, create_request, segment, settings};
use super::remix_types::{CreateRemixEditRequest, RemixEditCheckRequest, RemixEditClip};
use crate::error::AppError;
use serde_json::Value;
use sqlx::{PgPool, Row};
use uuid::Uuid;

struct Edit {
    owner: String,
    product: String,
    /// mixed_voiceover A[0,5s), live_demo A[10,14s), live_demo B[10,15s).
    mv: Uuid,
    demo_a: Uuid,
    demo_b: Uuid,
    stale: Uuid,
    other_product: Uuid,
    restricted: Uuid,
}

async fn edit_fixture(pool: &PgPool) -> Edit {
    let owner = format!("edit-{}", Uuid::new_v4());
    let product = format!("精华-{}", Uuid::new_v4().simple());
    let (a, sha_a) = asset(pool, &owner, &product, "authorized").await;
    let (b, sha_b) = asset(pool, &owner, &product, "authorized").await;
    let (r, sha_r) = asset(pool, &owner, &product, "restricted").await;
    Edit {
        mv: segment(pool, (a, &sha_a), "mixed_voiceover", (0, 5000), &product).await,
        demo_a: segment(pool, (a, &sha_a), "live_demo", (10_000, 14_000), &product).await,
        demo_b: segment(pool, (b, &sha_b), "live_demo", (10_000, 15_000), &product).await,
        stale: segment(
            pool,
            (a, &"f".repeat(64)),
            "live_demo",
            (20_000, 25_000),
            &product,
        )
        .await,
        other_product: segment(pool, (b, &sha_b), "live_demo", (30_000, 35_000), "其他产品").await,
        restricted: segment(pool, (r, &sha_r), "mixed_voiceover", (0, 5000), &product).await,
        owner,
        product,
    }
}

fn clip(segment_id: Uuid, start_ms: i32, end_ms: i32) -> RemixEditClip {
    RemixEditClip {
        segment_id,
        start_ms,
        end_ms,
    }
}

fn create(key: &str, clips: Vec<RemixEditClip>, allow_duplicate: bool) -> CreateRemixEditRequest {
    CreateRemixEditRequest {
        idempotency_key: key.into(),
        preset_key: "framework".into(),
        preset_version: 1,
        clips,
        allow_duplicate,
    }
}

fn check(clips: Vec<RemixEditClip>) -> RemixEditCheckRequest {
    RemixEditCheckRequest {
        preset_key: "framework".into(),
        preset_version: 1,
        clips,
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn edit_trims_inside_bounds_into_one_output_and_is_idempotent() {
    let pool = pool().await;
    let f = edit_fixture(&pool).await;
    let owner = user(&f.owner);
    let settings = settings();
    let clips = vec![clip(f.mv, 1000, 4000), clip(f.demo_b, 10_000, 15_000)];
    let detail = remix_edit::create(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &create("e-1", clips.clone(), false),
    )
    .await
    .unwrap();
    assert_eq!(detail.batch.mode, "edit");
    assert_eq!(detail.batch.product_name, f.product);
    assert_eq!(
        (detail.batch.requested_count, detail.batch.planned_count),
        (1, 1)
    );
    assert_eq!(detail.batch.labels, vec!["mixed_voiceover", "live_demo"]);
    assert_eq!(detail.items.len(), 1);
    let item = &detail.items[0];
    assert_eq!(item.outcome, "running");
    assert_eq!(item.duration_ms, 8000);
    assert_eq!(
        (item.segments[0].start_ms, item.segments[0].end_ms),
        (1000, 4000)
    );
    let row = sqlx::query("SELECT r.request, v.snapshot FROM ads.content_production_runs r JOIN ads.content_production_revisions v ON v.project_id = r.project_id AND v.revision = r.project_revision WHERE r.run_id = $1")
        .bind(item.run_id).fetch_one(&pool).await.unwrap();
    let request: Value = row.get("request");
    let snapshot: Value = row.get("snapshot");
    assert_eq!(request["taskType"], "framework_remix");
    assert!(request["title"]
        .as_str()
        .unwrap()
        .starts_with("单条剪辑 · "));
    let frozen = snapshot["clips"].as_array().unwrap();
    assert_eq!(
        (frozen[0]["startMs"].as_i64(), frozen[0]["endMs"].as_i64()),
        (Some(1000), Some(4000))
    );
    // Replay returns the same batch; the same key with other cuts conflicts.
    let replay = remix_edit::create(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &create("e-1", clips, true),
    )
    .await
    .unwrap();
    assert_eq!(replay.batch.batch_id, detail.batch.batch_id);
    assert_eq!(
        conflict_code(
            remix_edit::create(
                &pool,
                &settings,
                &owner,
                SCOPED,
                &create("e-1", vec![clip(f.mv, 0, 4000)], false)
            )
            .await
        ),
        ConflictCode::IdempotencyConflict
    );
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn edit_rejects_out_of_bounds_changed_mixed_product_and_restricted_sources() {
    let pool = pool().await;
    let f = edit_fixture(&pool).await;
    let owner = user(&f.owner);
    let settings = settings();
    let run = |clips: Vec<RemixEditClip>| {
        let pool = pool.clone();
        let settings = settings.clone();
        let owner = owner.clone();
        async move { remix_edit::check(&pool, &settings, &owner, SCOPED, &check(clips)).await }
    };
    // Trimming may only shrink a segment.
    assert!(matches!(
        run(vec![clip(f.mv, 0, 5001)]).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    assert!(matches!(
        run(vec![clip(f.demo_a, 9_000, 13_000)]).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    // A segment whose original changed is unavailable and named.
    match run(vec![clip(f.mv, 0, 5000), clip(f.stale, 20_000, 25_000)]).await {
        Err(StudioError::Conflict(conflict)) => {
            assert_eq!(conflict.code, ConflictCode::SourceChanged);
            assert_eq!(conflict.segment_ids, vec![f.stale]);
        }
        other => panic!("expected source_changed, got {other:?}"),
    }
    // Unconfirming a segment makes it unavailable too.
    sqlx::query("UPDATE ads.content_segments SET status = 'rejected' WHERE segment_id = $1")
        .bind(f.demo_a)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        conflict_code(run(vec![clip(f.demo_a, 10_000, 14_000)]).await),
        ConflictCode::SourceChanged
    );
    // One product per output.
    assert!(matches!(
        run(vec![
            clip(f.mv, 0, 5000),
            clip(f.other_product, 30_000, 35_000)
        ])
        .await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    // Restricted rights fail the production source binding.
    assert!(matches!(
        run(vec![clip(f.restricted, 0, 5000)]).await,
        Err(StudioError::App(
            AppError::BadRequest(_) | AppError::Forbidden
        ))
    ));
    // A stranger without edit permission cannot bind the owner's originals.
    assert!(remix_edit::check(
        &pool,
        &settings,
        &user("edit-stranger"),
        SCOPED,
        &check(vec![clip(f.mv, 0, 5000)])
    )
    .await
    .is_err());
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn exact_repeats_are_refused_unless_allowed_and_similar_outputs_are_reported() {
    let pool = pool().await;
    let f = edit_fixture(&pool).await;
    let owner = user(&f.owner);
    let settings = settings();
    let clips = vec![clip(f.mv, 0, 5000), clip(f.demo_b, 10_000, 15_000)];
    let fresh = remix_edit::check(&pool, &settings, &owner, SCOPED, &check(clips.clone()))
        .await
        .unwrap();
    assert!(fresh.exact.is_empty() && fresh.similar.is_empty());
    assert_eq!(
        (fresh.product_name.as_str(), fresh.duration_ms),
        (f.product.as_str(), 10_000)
    );
    let first = remix_edit::create(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &create("d-1", clips.clone(), false),
    )
    .await
    .unwrap();
    let report = remix_edit::check(&pool, &settings, &owner, SCOPED, &check(clips.clone()))
        .await
        .unwrap();
    assert_eq!(report.exact.len(), 1);
    assert_eq!(report.exact[0].batch_id, first.batch.batch_id);
    assert_eq!(
        (report.exact[0].mode.as_str(), report.exact[0].overlap),
        ("edit", 1.0)
    );
    assert_eq!(
        conflict_code(
            remix_edit::create(
                &pool,
                &settings,
                &owner,
                SCOPED,
                &create("d-2", clips.clone(), false)
            )
            .await
        ),
        ConflictCode::RemixEditDuplicate
    );
    let forced = remix_edit::create(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &create("d-3", clips, true),
    )
    .await
    .unwrap();
    assert_ne!(forced.batch.batch_id, first.batch.batch_id);
    // Trimming 1 s off the 10 s edit keeps 90 % of its source time: similar, not exact.
    let trimmed = remix_edit::check(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &check(vec![clip(f.mv, 0, 5000), clip(f.demo_b, 10_000, 14_000)]),
    )
    .await
    .unwrap();
    assert!(trimmed.exact.is_empty());
    assert_eq!(trimmed.similar.len(), 2);
    assert!((trimmed.similar[0].overlap - 0.9).abs() < 1e-9);
    // A short cut of a long output is a new version, not a similar one.
    let short = remix_edit::check(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &check(vec![clip(f.mv, 0, 4000)]),
    )
    .await
    .unwrap();
    assert!(short.exact.is_empty());
    assert!(
        short.similar.is_empty(),
        "a 4 s cut of a 10 s output is not similar"
    );
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn framework_outputs_count_as_exact_repeats() {
    let pool = pool().await;
    let f = super::remix_postgres_tests::fixture(&pool).await;
    let owner = user(&f.owner);
    let settings = settings();
    let batch = remix::create(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &create_request(&f, 1, "fw-1"),
    )
    .await
    .unwrap();
    let clips: Vec<RemixEditClip> = batch.items[0]
        .segments
        .iter()
        .map(|s| clip(s.segment_id, s.start_ms, s.end_ms))
        .collect();
    let report = remix_edit::check(&pool, &settings, &owner, SCOPED, &check(clips.clone()))
        .await
        .unwrap();
    assert_eq!(report.exact.len(), 1);
    assert_eq!(report.exact[0].mode, "framework");
    assert_eq!(
        conflict_code(
            remix_edit::create(
                &pool,
                &settings,
                &owner,
                SCOPED,
                &create("fw-edit", clips, false)
            )
            .await
        ),
        ConflictCode::RemixEditDuplicate
    );
    // Cancelling the framework output frees the combination.
    remix_cancel::cancel(
        &pool,
        &settings,
        &f.owner,
        Some(&f.owner),
        batch.batch.batch_id,
    )
    .await
    .unwrap();
    let after = remix_edit::check(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &check(
            batch.items[0]
                .segments
                .iter()
                .map(|s| clip(s.segment_id, s.start_ms, s.end_ms))
                .collect(),
        ),
    )
    .await
    .unwrap();
    assert!(after.exact.is_empty());
}
