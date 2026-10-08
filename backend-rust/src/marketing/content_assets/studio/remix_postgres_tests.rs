//! Disposable PostgreSQL contract for 框架混剪批次 (migrations 021–032). Run
//! through `backend-rust/scripts/test-content-production-postgres.sh`. Each
//! test uses its own owner and product so parallel tests stay independent.
use super::error::{ConflictCode, StudioError};
use super::postgres_tests::{pool, user, SCOPED};
use super::remix;
use super::remix_cancel;
use super::remix_read;
use super::remix_types::{CreateRemixBatchRequest, RemixBatchPreviewRequest};
use crate::{config::Settings, error::AppError};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use std::collections::HashSet;
use uuid::Uuid;

pub(super) fn settings() -> Settings {
    let mut settings = super::super::handlers::qianchuan_http_route_tests::fixture_settings(
        "postgres://fixture".into(),
    );
    settings.tos_bucket = "fixture".into();
    settings.content_ai_studio_enabled = true;
    settings.content_ai_studio_remix_enabled = true;
    settings.content_production_enabled = true;
    settings.content_production_runs_enabled = true;
    settings
}

pub(super) struct Fixture {
    pub(super) owner: String,
    pub(super) product: String,
    pub(super) a: Uuid,
    pub(super) b: Uuid,
}

pub(super) async fn asset(
    pool: &PgPool,
    owner: &str,
    product: &str,
    authorization: &str,
) -> (Uuid, String) {
    let id = Uuid::new_v4();
    let sha = hex::encode(Sha256::digest(id.as_bytes()));
    sqlx::query("INSERT INTO ads.marketing_content_assets (asset_id, title, asset_status, bucket, raw_object_key, raw_sha256, duration_seconds, product_name, owner_user_id, authorization_status) VALUES ($1, 'remix fixture', 'ready', 'fixture', $2, $3, 60, $4, $5, $6)")
        .bind(id).bind(format!("raw/{id}.mp4")).bind(&sha).bind(product).bind(owner).bind(authorization)
        .execute(pool).await.unwrap();
    (id, sha)
}

pub(super) async fn segment(
    pool: &PgPool,
    asset: (Uuid, &str),
    label: &str,
    range: (i32, i32),
    product: &str,
) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.content_segments (segment_id, owner_user_id, asset_id, source_content_hash, source_duration_ms, start_ms, end_ms, preset_key, preset_version, label_key, product_name, origin, status, confirmed_by, confirmed_at) VALUES ($1, 'annotator', $2, $3, 60000, $4, $5, 'framework', 1, $6, $7, 'human', 'confirmed', 'annotator', NOW())")
        .bind(id).bind(asset.0).bind(asset.1).bind(range.0).bind(range.1).bind(label).bind(product)
        .execute(pool).await.unwrap();
    id
}

/// Two usable assets, one restricted asset and one stale segment:
/// mixed_voiceover: A[0,5s) B[0,6s) (+restricted R); live_demo: A[10,14s)
/// B[10,15s) (+stale A); another product on A is never a candidate.
pub(super) async fn fixture(pool: &PgPool) -> Fixture {
    let owner = format!("remix-{}", Uuid::new_v4());
    let product = format!("精华-{}", Uuid::new_v4().simple());
    let (a, sha_a) = asset(pool, &owner, &product, "authorized").await;
    let (b, sha_b) = asset(pool, &owner, &product, "unknown").await;
    let (r, sha_r) = asset(pool, &owner, &product, "restricted").await;
    segment(pool, (a, &sha_a), "mixed_voiceover", (0, 5000), &product).await;
    segment(pool, (b, &sha_b), "mixed_voiceover", (0, 6000), &product).await;
    segment(pool, (r, &sha_r), "mixed_voiceover", (0, 5000), &product).await;
    segment(pool, (a, &sha_a), "live_demo", (10_000, 14_000), &product).await;
    segment(pool, (b, &sha_b), "live_demo", (10_000, 15_000), &product).await;
    let stale = "f".repeat(64);
    segment(pool, (a, &stale), "live_demo", (20_000, 25_000), &product).await;
    segment(pool, (a, &sha_a), "live_demo", (30_000, 35_000), "其他产品").await;
    Fixture {
        owner,
        product,
        a,
        b,
    }
}

pub(super) fn preview_request(f: &Fixture, count: i32) -> RemixBatchPreviewRequest {
    RemixBatchPreviewRequest {
        preset_key: "framework".into(),
        preset_version: 1,
        labels: Some(vec![
            "mixed_voiceover".into(),
            "live_demo".into(),
            "mixed_voiceover".into(),
        ]),
        source_asset_id: None,
        product_name: f.product.clone(),
        count,
    }
}

pub(super) fn create_request(f: &Fixture, count: i32, key: &str) -> CreateRemixBatchRequest {
    let preview = preview_request(f, count);
    CreateRemixBatchRequest {
        idempotency_key: key.into(),
        preset_key: preview.preset_key,
        preset_version: preview.preset_version,
        labels: preview.labels,
        source_asset_id: None,
        product_name: preview.product_name,
        count,
    }
}

pub(super) fn conflict_code<T: std::fmt::Debug>(result: Result<T, StudioError>) -> ConflictCode {
    match result {
        Err(StudioError::Conflict(conflict)) => conflict.code,
        other => panic!("expected a structured conflict, got {other:?}"),
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn preview_filters_rights_hash_and_product_and_counts_exactly() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let preview = remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 3))
        .await
        .unwrap();
    let counts: Vec<i32> = preview.slots.iter().map(|s| s.candidate_count).collect();
    assert_eq!(counts, vec![2, 2, 2]);
    assert_eq!(preview.excluded_asset_count, 1);
    // 2*2*2 raw; slots 1 and 3 share the two mixed_voiceover segments → 4 valid.
    assert_eq!(preview.theoretical_combinations, 8);
    assert_eq!(preview.available_combinations, 4);
    assert!(!preview.available_is_lower_bound);
    assert_eq!(preview.plannable_count, 3);
    assert!(preview.shortfall_reason.is_none());
    let again = remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 3))
        .await
        .unwrap();
    assert_eq!(again.seed, preview.seed);
    let short = remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 6))
        .await
        .unwrap();
    assert_eq!(short.plannable_count, 4);
    assert!(short.shortfall_reason.unwrap().contains("只有 4 种"));
    let mut missing = preview_request(&f, 1);
    missing.labels = Some(vec!["mixed_voiceover".into(), "street_interview".into()]);
    let missing = remix::preview(&pool, &settings(), &owner, SCOPED, &missing)
        .await
        .unwrap();
    assert_eq!(missing.missing_labels, vec!["street_interview".to_string()]);
    assert_eq!(missing.plannable_count, 0);
    // Another user without edit permission sees no usable sources.
    let other = remix::preview(
        &pool,
        &settings(),
        &user("remix-stranger"),
        SCOPED,
        &preview_request(&f, 3),
    )
    .await
    .unwrap();
    assert_eq!(other.excluded_asset_count, 3);
    assert_eq!(other.plannable_count, 0);
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn create_freezes_unique_runs_is_idempotent_and_never_repeats_combinations() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let settings = settings();
    let detail = remix::create(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &create_request(&f, 3, "batch-a"),
    )
    .await
    .unwrap();
    assert_eq!(detail.batch.planned_count, 3);
    assert_eq!(detail.batch.status, "running");
    assert_eq!(detail.items.len(), 3);
    let hashes: HashSet<_> = detail
        .items
        .iter()
        .map(|i| i.combination_hash.clone())
        .collect();
    assert_eq!(hashes.len(), 3);
    for item in &detail.items {
        assert_eq!(item.outcome, "running");
        assert_eq!(item.job_status.as_deref(), Some("queued"));
        let ids: HashSet<_> = item.segments.iter().map(|s| s.segment_id).collect();
        assert_eq!(ids.len(), 3, "a segment never repeats inside one output");
        let row = sqlx::query("SELECT r.request, r.status, v.snapshot, p.origin FROM ads.content_production_runs r JOIN ads.content_production_revisions v ON v.project_id = r.project_id AND v.revision = r.project_revision JOIN ads.content_production_plans p ON p.run_id = r.run_id AND p.revision = r.plan_revision WHERE r.run_id = $1")
            .bind(item.run_id).fetch_one(&pool).await.unwrap();
        let request: Value = row.get("request");
        let snapshot: Value = row.get("snapshot");
        assert_eq!(request["taskType"], "framework_remix");
        assert_eq!(request["modelCallConfirmed"], false);
        assert_eq!(row.get::<String, _>("status"), "running");
        assert_eq!(row.get::<String, _>("origin"), "user");
        assert_eq!(snapshot["outputProfile"], "hd_1080_v1");
        let clips = snapshot["clips"].as_array().unwrap();
        assert_eq!(clips.len(), 3);
        for (clip, segment) in clips.iter().zip(&item.segments) {
            assert_eq!(clip["assetId"], segment.asset_id.to_string());
            assert_eq!(clip["startMs"], segment.start_ms);
            assert_eq!(clip["endMs"], segment.end_ms);
            assert_eq!(clip["volume"], 1.0);
            assert!([f.a, f.b].contains(&segment.asset_id));
        }
    }
    // Replay returns the same batch; the same key with another input conflicts.
    let replay = remix::create(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &create_request(&f, 3, "batch-a"),
    )
    .await
    .unwrap();
    assert_eq!(replay.batch.batch_id, detail.batch.batch_id);
    assert_eq!(
        conflict_code(
            remix::create(
                &pool,
                &settings,
                &owner,
                SCOPED,
                &create_request(&f, 2, "batch-a")
            )
            .await
        ),
        ConflictCode::IdempotencyConflict
    );
    // Only one unused combination remains; the next batch reports the shortfall.
    let second = remix::create(
        &pool,
        &settings,
        &owner,
        SCOPED,
        &create_request(&f, 3, "batch-b"),
    )
    .await
    .unwrap();
    assert_eq!(second.batch.planned_count, 1);
    assert!(second.batch.shortfall_reason.is_some());
    assert!(!hashes.contains(&second.items[0].combination_hash));
    assert_eq!(
        conflict_code(
            remix::create(
                &pool,
                &settings,
                &owner,
                SCOPED,
                &create_request(&f, 1, "batch-c")
            )
            .await
        ),
        ConflictCode::RemixUnavailable
    );
    // Owner-only reads.
    assert_eq!(
        remix_read::list(&pool, &settings, &f.owner, Some(&f.owner), None)
            .await
            .unwrap()
            .items
            .len(),
        2
    );
    assert!(matches!(
        remix_read::detail(
            &pool,
            &settings,
            "remix-stranger",
            Some("remix-stranger"),
            detail.batch.batch_id
        )
        .await,
        Err(StudioError::App(AppError::NotFound))
    ));
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn active_limit_changed_segments_and_reference_structure() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let mut limited = settings();
    limited.content_ai_studio_remix_max_active = 2;
    assert_eq!(
        conflict_code(
            remix::create(
                &pool,
                &limited,
                &owner,
                SCOPED,
                &create_request(&f, 3, "over")
            )
            .await
        ),
        ConflictCode::RemixActiveLimit
    );
    let first = remix::create(
        &pool,
        &limited,
        &owner,
        SCOPED,
        &create_request(&f, 2, "fits"),
    )
    .await
    .unwrap();
    assert_eq!(first.items.len(), 2);
    assert_eq!(
        conflict_code(
            remix::create(
                &pool,
                &limited,
                &owner,
                SCOPED,
                &create_request(&f, 1, "next")
            )
            .await
        ),
        ConflictCode::RemixActiveLimit
    );
    // Structure from a reference asset: its current confirmed segments in time order.
    let mut reference = preview_request(&f, 1);
    reference.labels = None;
    reference.source_asset_id = Some(f.a);
    let preview = remix::preview(&pool, &settings(), &owner, SCOPED, &reference)
        .await
        .unwrap();
    assert_eq!(
        preview.labels,
        vec![
            "mixed_voiceover".to_string(),
            "live_demo".into(),
            "live_demo".into()
        ]
    );
    // Its own combination uses another product's segment, so it is never a candidate.
    assert!(!preview.reference_combination_excluded);
    // A candidate asset whose raw content changes drops out of the candidates.
    sqlx::query("UPDATE ads.marketing_content_assets SET raw_sha256 = $2 WHERE asset_id = $1")
        .bind(f.b)
        .bind(hex::encode(Sha256::digest(Uuid::new_v4().as_bytes())))
        .execute(&pool)
        .await
        .unwrap();
    let after = remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 3))
        .await
        .unwrap();
    assert_eq!(
        after
            .slots
            .iter()
            .map(|s| s.candidate_count)
            .collect::<Vec<_>>(),
        vec![1, 1, 1]
    );
    assert_eq!(after.plannable_count, 0);
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn an_edited_confirmed_segment_is_rejected_before_freezing() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let settings = settings();
    let n = remix::normalize(&preview_request(&f, 1), 10).unwrap();
    let mut db = pool.acquire().await.unwrap();
    let plan = remix::build_plan(
        &pool,
        &settings,
        &mut db,
        &owner,
        SCOPED,
        &n,
        &HashSet::new(),
    )
    .await
    .unwrap();
    let combo = &plan.selection.combos[0];
    let chosen = plan.slots[1][combo.picks[1]].segment_id;
    // Still confirmed with the same hash, but its cut points moved after planning.
    sqlx::query("UPDATE ads.content_segments SET end_ms = end_ms - 500 WHERE segment_id = $1")
        .bind(chosen)
        .execute(&pool)
        .await
        .unwrap();
    match remix::lock_segments(&mut db, &plan, &n).await {
        Err(StudioError::Conflict(conflict)) => {
            assert_eq!(conflict.code, ConflictCode::SourceChanged);
            assert_eq!(conflict.segment_ids, vec![chosen]);
        }
        other => panic!("expected source_changed, got {other:?}"),
    }
}

pub(super) async fn stored_status(pool: &PgPool, batch_id: Uuid) -> String {
    sqlx::query_scalar("SELECT status FROM ads.content_remix_batches WHERE batch_id = $1")
        .bind(batch_id)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn cancel_is_owner_only_idempotent_and_leaves_settled_runs() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let detail = remix::create(
        &pool,
        &settings(),
        &owner,
        SCOPED,
        &create_request(&f, 3, "cancel"),
    )
    .await
    .unwrap();
    let batch_id = detail.batch.batch_id;
    let [rendering, done, queued] = [0, 1, 2].map(|i| detail.items[i].run_id);
    // One render is already running in the worker, one Run already delivered.
    sqlx::query("UPDATE ads.content_production_jobs SET status = 'running' WHERE job_id = (SELECT render_job_id FROM ads.content_production_runs WHERE run_id = $1)")
        .bind(rendering).execute(&pool).await.unwrap();
    sqlx::query("UPDATE ads.content_production_runs SET status = 'succeeded', stage = 'delivery' WHERE run_id = $1")
        .bind(done).execute(&pool).await.unwrap();
    assert!(matches!(
        remix_cancel::cancel(
            &pool,
            &settings(),
            "remix-stranger",
            Some("remix-stranger"),
            batch_id
        )
        .await,
        Err(StudioError::App(AppError::NotFound))
    ));
    assert_eq!(stored_status(&pool, batch_id).await, "running");

    let cancelled = remix_cancel::cancel(&pool, &settings(), &f.owner, Some(&f.owner), batch_id)
        .await
        .unwrap();
    let states: Vec<(&str, &str, Option<&str>)> = cancelled
        .items
        .iter()
        .map(|i| {
            (
                i.run_status.as_str(),
                i.outcome.as_str(),
                i.job_status.as_deref(),
            )
        })
        .collect();
    assert_eq!(
        states,
        vec![
            ("cancelling", "running", Some("cancel_requested")),
            ("succeeded", "succeeded", Some("queued")),
            ("cancelled", "cancelled", Some("cancelled")),
        ]
    );
    assert_eq!(cancelled.batch.status, "running");
    assert_eq!(
        (
            cancelled.batch.running_count,
            cancelled.batch.succeeded_count,
            cancelled.batch.cancelled_count,
            cancelled.batch.failed_count
        ),
        (1, 1, 1, 0)
    );
    // Repeating the cancel changes nothing and still returns the detail.
    let versions = |run: Uuid| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, i32>(
                "SELECT version FROM ads.content_production_runs WHERE run_id = $1",
            )
            .bind(run)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    let before = [
        versions(rendering).await,
        versions(done).await,
        versions(queued).await,
    ];
    let again = remix_cancel::cancel(&pool, &settings(), &f.owner, Some(&f.owner), batch_id)
        .await
        .unwrap();
    assert_eq!(again.batch.status, "running");
    assert_eq!(
        [
            versions(rendering).await,
            versions(done).await,
            versions(queued).await
        ],
        before
    );
    // The worker finalizes the stopping render; the batch settles as cancelled.
    sqlx::query("UPDATE ads.content_production_runs SET status = 'cancelled' WHERE run_id = $1")
        .bind(rendering)
        .execute(&pool)
        .await
        .unwrap();
    let settled = remix_cancel::cancel(&pool, &settings(), &f.owner, Some(&f.owner), batch_id)
        .await
        .unwrap();
    assert_eq!(settled.batch.status, "cancelled");
    assert_eq!(
        (
            settled.batch.succeeded_count,
            settled.batch.cancelled_count,
            settled.batch.failed_count
        ),
        (1, 2, 0)
    );
    assert_eq!(stored_status(&pool, batch_id).await, "cancelled");
    assert_eq!(
        remix_read::detail(&pool, &settings(), &f.owner, Some(&f.owner), batch_id)
            .await
            .unwrap()
            .batch
            .status,
        "cancelled"
    );
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn list_names_the_first_failure_and_skips_outputs_without_covers() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let detail = remix::create(
        &pool,
        &settings(),
        &owner,
        SCOPED,
        &create_request(&f, 2, "failure-reason"),
    )
    .await
    .unwrap();
    let batch_id = detail.batch.batch_id;
    let [failed, done] = [0, 1].map(|i| detail.items[i].run_id);
    sqlx::query("UPDATE ads.content_production_runs SET status = 'waiting', waiting_reason = 'render_failed' WHERE run_id = $1")
        .bind(failed).execute(&pool).await.unwrap();
    sqlx::query("UPDATE ads.content_production_runs SET status = 'succeeded', stage = 'delivery' WHERE run_id = $1")
        .bind(done).execute(&pool).await.unwrap();
    // A delivered output asset without a cover yet contributes no thumbnail.
    let (output, _) = asset(&pool, &f.owner, "精华", "authorized").await;
    sqlx::query("UPDATE ads.content_remix_batch_runs SET output_asset_id = $1 WHERE run_id = $2")
        .bind(output)
        .bind(done)
        .execute(&pool)
        .await
        .unwrap();
    let listed = remix_read::list(&pool, &settings(), &f.owner, Some(&f.owner), None)
        .await
        .unwrap();
    let batch = listed
        .items
        .iter()
        .find(|b| b.batch_id == batch_id)
        .unwrap();
    assert_eq!(batch.status, "partially_failed");
    assert_eq!(batch.failure_reason.as_deref(), Some("render_failed"));
    assert!(batch.cover_urls.is_empty());
    let read = remix_read::detail(&pool, &settings(), &f.owner, Some(&f.owner), batch_id)
        .await
        .unwrap();
    assert_eq!(read.items[1].output_asset_id, Some(output));
    assert_eq!(read.items[1].output_cover_url, None);
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn a_reference_original_is_never_reproduced() {
    let pool = pool().await;
    let owner_id = format!("remix-ref-{}", Uuid::new_v4());
    let product = format!("精华-{}", Uuid::new_v4().simple());
    let (a, sha_a) = asset(&pool, &owner_id, &product, "authorized").await;
    let (b, sha_b) = asset(&pool, &owner_id, &product, "authorized").await;
    let own_voice = segment(&pool, (a, &sha_a), "mixed_voiceover", (0, 5000), &product).await;
    let own_demo = segment(&pool, (a, &sha_a), "live_demo", (10_000, 14_000), &product).await;
    segment(&pool, (b, &sha_b), "mixed_voiceover", (0, 6000), &product).await;
    segment(&pool, (b, &sha_b), "live_demo", (10_000, 15_000), &product).await;
    let owner = user(&owner_id);
    let request = RemixBatchPreviewRequest {
        preset_key: "framework".into(),
        preset_version: 1,
        labels: None,
        source_asset_id: Some(a),
        product_name: product.clone(),
        count: 4,
    };
    let preview = remix::preview(&pool, &settings(), &owner, SCOPED, &request)
        .await
        .unwrap();
    // 2 × 2 combinations minus the original's own (voice A + demo A).
    assert_eq!(preview.theoretical_combinations, 4);
    assert_eq!(preview.available_combinations, 3);
    assert_eq!(preview.previously_used_combinations, 0);
    assert!(preview.reference_combination_excluded);
    let detail = remix::create(
        &pool,
        &settings(),
        &owner,
        SCOPED,
        &CreateRemixBatchRequest {
            idempotency_key: "ref-1".into(),
            preset_key: request.preset_key,
            preset_version: 1,
            labels: None,
            source_asset_id: Some(a),
            product_name: product,
            count: 4,
        },
    )
    .await
    .unwrap();
    assert_eq!(detail.batch.planned_count, 3);
    for item in &detail.items {
        let ids: Vec<Uuid> = item.segments.iter().map(|s| s.segment_id).collect();
        assert_ne!(ids, vec![own_voice, own_demo]);
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn batch_reads_and_cancel_stay_inside_the_enterprise() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let batch = remix::create(
        &pool,
        &settings(),
        &owner,
        SCOPED,
        &create_request(&f, 1, "ent-1"),
    )
    .await
    .unwrap()
    .batch
    .batch_id;
    let enterprise = format!("企业:测试{}", Uuid::new_v4().simple());
    // Untagged originals: the batch is outside the enterprise and reads as missing.
    assert!(matches!(
        remix_read::ensure_in_enterprise(&pool, batch, Some(&enterprise)).await,
        Err(StudioError::App(AppError::NotFound))
    ));
    assert!(remix_read::ensure_in_enterprise(&pool, batch, None)
        .await
        .is_ok());
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET tags = ARRAY[$2] WHERE asset_id = ANY($1)",
    )
    .bind(vec![f.a, f.b])
    .bind(&enterprise)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        remix_read::ensure_in_enterprise(&pool, batch, Some(&enterprise))
            .await
            .is_ok()
    );
}
