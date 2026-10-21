//! Disposable PostgreSQL contract for 类型 2 卖点混剪 (021–032 + 035 + 038).
//! Run through `backend-rust/scripts/test-content-production-postgres.sh`.
use super::error::ConflictCode;
use super::postgres_tests::{create, patch, pool, user, SCOPED};
use super::remix;
use super::remix_postgres_tests::{asset, conflict_code, segment, settings};
use super::remix_types::{CreateRemixBatchRequest, RemixBatchPreviewRequest};
use super::repository;
use crate::error::AppError;
use serde_json::Value;
use sqlx::PgPool;
use std::collections::HashSet;
use uuid::Uuid;

pub(super) async fn point(
    pool: &PgPool,
    asset: (Uuid, &str),
    label: &str,
    range: (i32, i32),
    product: &str,
    joins: bool,
) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.content_segments (segment_id, owner_user_id, asset_id, source_content_hash, source_duration_ms, start_ms, end_ms, preset_key, preset_version, label_key, product_name, origin, status, confirmed_by, confirmed_at, continues_previous) VALUES ($1, 'annotator', $2, $3, 60000, $4, $5, 'selling_point', 1, $6, $7, 'human', 'confirmed', 'annotator', NOW(), $8)")
        .bind(id).bind(asset.0).bind(asset.1).bind(range.0).bind(range.1).bind(label).bind(product).bind(joins)
        .execute(pool).await.unwrap();
    id
}

pub(super) struct Fixture {
    pub(super) owner: String,
    pub(super) product: String,
    pub(super) reference: Uuid,
    exact_block: Vec<Uuid>,
}

/// Reference R: mixed_voiceover [0,24s) with 滋润→养肤 continuous, promotion [24,34s)
/// without selling points. A: mixed_voiceover with the same continuous block
/// (exact). B: mixed_voiceover with 滋润 and 养肤 as separate blocks (spliced) and a
/// promotion segment.
pub(super) async fn fixture(pool: &PgPool) -> Fixture {
    let owner = format!("points-{}", Uuid::new_v4());
    let product = format!("蜜粉-{}", Uuid::new_v4().simple());
    let (r, sha_r) = asset(pool, &owner, &product, "authorized").await;
    let (a, sha_a) = asset(pool, &owner, &product, "authorized").await;
    let (b, sha_b) = asset(pool, &owner, &product, "authorized").await;
    segment(pool, (r, &sha_r), "mixed_voiceover", (0, 24_000), &product).await;
    segment(pool, (r, &sha_r), "promotion", (24_000, 34_000), &product).await;
    point(
        pool,
        (r, &sha_r),
        "moisturizing",
        (0, 10_000),
        &product,
        false,
    )
    .await;
    point(
        pool,
        (r, &sha_r),
        "skincare",
        (10_000, 20_000),
        &product,
        true,
    )
    .await;
    segment(pool, (a, &sha_a), "mixed_voiceover", (0, 40_000), &product).await;
    let a1 = point(
        pool,
        (a, &sha_a),
        "moisturizing",
        (0, 10_000),
        &product,
        false,
    )
    .await;
    let a2 = point(
        pool,
        (a, &sha_a),
        "skincare",
        (10_000, 20_000),
        &product,
        true,
    )
    .await;
    segment(pool, (b, &sha_b), "mixed_voiceover", (0, 40_000), &product).await;
    segment(pool, (b, &sha_b), "promotion", (40_000, 49_000), &product).await;
    point(
        pool,
        (b, &sha_b),
        "moisturizing",
        (0, 10_000),
        &product,
        false,
    )
    .await;
    point(
        pool,
        (b, &sha_b),
        "skincare",
        (20_000, 31_000),
        &product,
        false,
    )
    .await;
    Fixture {
        owner,
        product,
        reference: r,
        exact_block: vec![a1, a2],
    }
}

pub(super) fn preview_request(f: &Fixture, count: i32) -> RemixBatchPreviewRequest {
    RemixBatchPreviewRequest {
        mode: Some("sellingPoint".into()),
        preset_key: "framework".into(),
        preset_version: 1,
        labels: None,
        source_asset_id: Some(f.reference),
        product_name: f.product.clone(),
        count,
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032 and 035"]
async fn selling_point_preview_reports_slot_targets_fallbacks_and_tiers() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let preview = remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 1))
        .await
        .unwrap();
    assert_eq!(preview.mode, "sellingPoint");
    assert_eq!(preview.labels, vec!["mixed_voiceover", "promotion"]);
    let live = &preview.slots[0];
    assert_eq!(
        live.selling_points.as_deref(),
        Some(&["moisturizing".to_string(), "skincare".into()][..])
    );
    assert_eq!(live.fallback, Some(false));
    // exact: R's own block and A's block; spliced: B's two blocks; varied: B reordered.
    assert_eq!(live.candidate_count, 4);
    assert_eq!(preview.slots[1].fallback, Some(true));
    assert_eq!(preview.slots[1].candidate_count, 2);
    assert!(preview.reference_combination_excluded);
    assert_eq!(preview.plannable_count, 1);
    // 4 × 2 = 8 raw minus the reference itself.
    let all = remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 10))
        .await
        .unwrap();
    assert_eq!(all.available_combinations, 7);
    assert_eq!(all.plannable_count, 7);
    // Mode validation: a selling-point batch needs a reference original.
    let mut manual = preview_request(&f, 1);
    manual.source_asset_id = None;
    manual.labels = Some(vec!["mixed_voiceover".into()]);
    assert!(remix::preview(&pool, &settings(), &owner, SCOPED, &manual)
        .await
        .is_err());
    let mut unknown = preview_request(&f, 1);
    unknown.mode = Some("points".into());
    assert!(remix::preview(&pool, &settings(), &owner, SCOPED, &unknown)
        .await
        .is_err());
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032 and 035"]
async fn selling_point_batches_freeze_blocks_with_fill_details_and_prefer_exact_fills() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let preview = preview_request(&f, 2);
    let detail = remix::create(
        &pool,
        &settings(),
        &owner,
        SCOPED,
        &CreateRemixBatchRequest {
            idempotency_key: "points-a".into(),
            mode: preview.mode,
            preset_key: preview.preset_key,
            preset_version: preview.preset_version,
            labels: None,
            source_asset_id: preview.source_asset_id,
            product_name: preview.product_name,
            count: 2,
        },
    )
    .await
    .unwrap();
    assert_eq!(detail.batch.mode, "sellingPoint");
    assert_eq!(detail.items.len(), 2);
    assert!(detail.items[0].picture_review.is_none());
    let review_receipt = serde_json::json!({"host_inspection":{"sha256":"a".repeat(64)},
        "host_remix_picture_review":{"schema":"aios.remix-picture-review.v1", "outputSha256":"a".repeat(64),
            "status":"review_required", "deliveryApproved":false, "pairCount":1,
            "findings":[{"left":{"clipOrdinal":1,"outputStartMs":500},"right":{"clipOrdinal":2,"outputStartMs":20500}}]}});
    sqlx::query("UPDATE ads.content_production_jobs j SET receipt=$1 FROM ads.content_production_runs r WHERE r.render_job_id=j.job_id AND r.run_id=$2")
        .bind(review_receipt).bind(detail.items[0].run_id).execute(&pool).await.unwrap();
    let read = super::remix_read::detail(
        &pool,
        &settings(),
        &f.owner,
        Some(&f.owner),
        detail.batch.batch_id,
    )
    .await
    .unwrap();
    let picture = read.items[0].picture_review.as_ref().unwrap();
    assert_eq!(picture.status, "review_required");
    assert_eq!(picture.pairs[0].right_ms, 20500);
    for item in &detail.items {
        let first = &item.segments[0];
        assert_eq!(first.slot, Some(1));
        assert_eq!(
            first.tier.as_deref(),
            Some("exact"),
            "exact fills come first"
        );
        assert_eq!(first.fallback, Some(false));
        assert_eq!(first.start_ms, 0);
        assert_eq!(first.end_ms, 20_000, "a block is one clip");
        assert_eq!(item.segments[1].fallback, Some(true));
    }
    let stored: Vec<Value> = sqlx::query_scalar("SELECT segments FROM ads.content_remix_batch_runs r JOIN ads.content_remix_batches b USING (batch_id) WHERE b.owner_user_id = $1 ORDER BY r.ordinal")
        .bind(&f.owner).fetch_all(&pool).await.unwrap();
    let blocks: Vec<Vec<Uuid>> = stored
        .iter()
        .map(|run| serde_json::from_value(run[0]["segmentIds"].clone()).unwrap())
        .collect();
    assert!(blocks.contains(&f.exact_block));
    assert!(detail
        .items
        .iter()
        .all(|item| item.segments[0].segment_ids.as_ref().map(Vec::len) == Some(2)));
    assert!(stored
        .iter()
        .all(|run| run[0]["parts"].as_array().map(Vec::len) == Some(2)));
    assert!(stored
        .iter()
        .all(|run| run[0]["sellingPoints"] == serde_json::json!(["moisturizing", "skincare"])));
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032 and 035"]
async fn continues_previous_is_only_accepted_on_selling_point_segments() {
    let pool = pool().await;
    let owner_id = format!("points-write-{}", Uuid::new_v4());
    let owner = user(&owner_id);
    let (asset_id, _) = asset(&pool, &owner_id, "蜜粉", "authorized").await;
    let mut framework = create(asset_id, 0, 1000);
    framework.continues_previous = true;
    assert!(matches!(
        repository::create_segment(&pool, &owner, SCOPED, framework).await,
        Err(super::error::StudioError::App(AppError::BadRequest(_)))
    ));
    let mut first = create(asset_id, 0, 1000);
    first.preset_key = "selling_point".into();
    first.label_key = "moisturizing".into();
    repository::create_segment(&pool, &owner, SCOPED, first)
        .await
        .unwrap();
    let mut second = create(asset_id, 1000, 2000);
    second.preset_key = "selling_point".into();
    second.label_key = "skincare".into();
    second.continues_previous = true;
    let created = repository::create_segment(&pool, &owner, SCOPED, second)
        .await
        .unwrap();
    assert!(created.continues_previous);
    let mut off = patch(created.revision);
    off.continues_previous = Some(false);
    let updated = repository::update_segment(&pool, &owner, SCOPED, created.segment_id, off)
        .await
        .unwrap();
    assert!(!updated.continues_previous);
    assert_eq!(
        updated.status, "confirmed",
        "toggling continuity keeps the confirmation"
    );
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032 and 035"]
async fn create_rejects_a_block_whose_chain_grew_or_whose_framework_segment_moved_after_planning() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let n = remix::normalize(&preview_request(&f, 10), 10).unwrap();
    let mut db = pool.acquire().await.unwrap();
    let plan = remix::build_plan(
        &pool,
        &settings(),
        &mut db,
        &owner,
        SCOPED,
        &n,
        &HashSet::new(),
    )
    .await
    .unwrap();
    assert!(remix::lock_segments(&mut db, &plan, &n).await.is_ok());
    // A new confirmed continuous point extends A's block across unlabelled speech.
    let a_asset: Uuid =
        sqlx::query_scalar("SELECT asset_id FROM ads.content_segments WHERE segment_id = $1")
            .bind(f.exact_block[1])
            .fetch_one(&pool)
            .await
            .unwrap();
    let a_hash: String = sqlx::query_scalar(
        "SELECT raw_sha256 FROM ads.marketing_content_assets WHERE asset_id = $1",
    )
    .bind(a_asset)
    .fetch_one(&pool)
    .await
    .unwrap();
    let joined = point(
        &pool,
        (a_asset, &a_hash),
        "no_caking",
        (22_000, 25_000),
        &f.product,
        true,
    )
    .await;
    assert_eq!(
        conflict_code(remix::lock_segments(&mut db, &plan, &n).await),
        ConflictCode::SourceChanged
    );
    sqlx::query("DELETE FROM ads.content_segments WHERE segment_id = $1")
        .bind(joined)
        .execute(&pool)
        .await
        .unwrap();
    // Moving the framework segment a block was taken from also invalidates the plan.
    sqlx::query("UPDATE ads.content_segments SET end_ms = 39000 WHERE asset_id = $1 AND preset_key = 'framework'")
        .bind(a_asset).execute(&pool).await.unwrap();
    assert_eq!(
        conflict_code(remix::lock_segments(&mut db, &plan, &n).await),
        ConflictCode::SourceChanged
    );
}

/// Selling points only count inside 混剪口播: relabel the fixture's promotion
/// frames so the fallback slot and B's whole-frame replacement carry points.
pub(super) async fn voiceover_fallback_source(pool: &PgPool, f: &Fixture) -> (Uuid, Uuid, String) {
    sqlx::query("UPDATE ads.content_segments SET label_key = 'mixed_voiceover' WHERE product_name = $1 AND label_key = 'promotion'")
        .bind(&f.product).execute(pool).await.unwrap();
    sqlx::query_as("SELECT s.segment_id, s.asset_id, s.source_content_hash FROM ads.content_segments s WHERE s.product_name = $1 AND s.preset_key = 'framework' AND s.start_ms = 40000 AND s.asset_id <> $2")
        .bind(&f.product).bind(f.reference).fetch_one(pool).await.unwrap()
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL"]
async fn fallback_points_are_counted_frozen_and_kept_out_of_render_lineage() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let (frame_id, source, hash) = voiceover_fallback_source(&pool, &f).await;
    point(
        &pool,
        (source, &hash),
        "star_endorsement",
        (40_000, 49_000),
        &f.product,
        false,
    )
    .await;
    let detail = remix::create(
        &pool,
        &settings(),
        &user(&f.owner),
        SCOPED,
        &CreateRemixBatchRequest {
            idempotency_key: "fallback-known-points".into(),
            mode: Some("sellingPoint".into()),
            preset_key: "framework".into(),
            preset_version: 1,
            labels: None,
            source_asset_id: Some(f.reference),
            product_name: f.product.clone(),
            count: 10,
        },
    )
    .await
    .unwrap();
    let clips: Vec<_> = detail
        .items
        .iter()
        .flat_map(|i| &i.segments)
        .filter(|s| s.segment_id == frame_id)
        .collect();
    assert!(!clips.is_empty());
    assert!(clips
        .iter()
        .all(|s| s.selling_points.as_deref() == Some(&["star_endorsement".into()][..])));
    assert!(clips.iter().all(|s| s.segment_ids == Some(vec![frame_id])));
    let stored: Vec<Value> =
        sqlx::query_scalar("SELECT segments FROM ads.content_remix_batch_runs WHERE batch_id = $1")
            .bind(detail.batch.batch_id)
            .fetch_all(&pool)
            .await
            .unwrap();
    for clip in stored
        .iter()
        .flat_map(|v| v.as_array().unwrap())
        .filter(|s| s["segmentId"] == frame_id.to_string())
    {
        assert_eq!(
            clip["parts"],
            serde_json::json!([{"segmentId": frame_id, "startMs": 40_000, "endMs": 49_000}])
        );
        assert_eq!(
            clip["sellingPoints"],
            serde_json::json!(["star_endorsement"])
        );
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL"]
async fn fallback_new_or_edited_points_invalidate_planning_and_repetition_is_rejected() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let (frame_id, source, hash) = voiceover_fallback_source(&pool, &f).await;
    let n = remix::normalize(&preview_request(&f, 10), 10).unwrap();
    let mut db = pool.acquire().await.unwrap();
    let plan = remix::build_plan(
        &pool,
        &settings(),
        &mut db,
        &owner,
        SCOPED,
        &n,
        &HashSet::new(),
    )
    .await
    .unwrap();
    let point_id = point(
        &pool,
        (source, &hash),
        "star_endorsement",
        (40_000, 49_000),
        &f.product,
        false,
    )
    .await;
    assert_eq!(
        conflict_code(remix::lock_segments(&mut db, &plan, &n).await),
        ConflictCode::SourceChanged
    );
    let plan = remix::build_plan(
        &pool,
        &settings(),
        &mut db,
        &owner,
        SCOPED,
        &n,
        &HashSet::new(),
    )
    .await
    .unwrap();
    assert!(remix::lock_segments(&mut db, &plan, &n).await.is_ok());
    sqlx::query("UPDATE ads.content_segments SET label_key = 'moisturizing' WHERE segment_id = $1")
        .bind(point_id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        conflict_code(remix::lock_segments(&mut db, &plan, &n).await),
        ConflictCode::SourceChanged
    );
    let plan = remix::build_plan(
        &pool,
        &settings(),
        &mut db,
        &owner,
        SCOPED,
        &n,
        &HashSet::new(),
    )
    .await
    .unwrap();
    assert!(!plan.runs.is_empty());
    assert!(
        plan.runs
            .iter()
            .flat_map(|r| &r.clips)
            .all(|c| !(c.fallback && c.parts[0].segment_id == frame_id)),
        "a fallback repeating moisturizing must be rejected"
    );
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL"]
async fn fallback_duration_and_known_cross_frame_continuity_are_checked_on_preview() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let (frame_id, source, hash) = voiceover_fallback_source(&pool, &f).await;
    sqlx::query("UPDATE ads.content_segments SET end_ms = 60000 WHERE segment_id = $1")
        .bind(frame_id)
        .execute(&pool)
        .await
        .unwrap();
    let preview = remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 10))
        .await
        .unwrap();
    assert_eq!(
        preview.slots[1].candidate_count, 1,
        "20-second promotion cannot fill a 10-second slot"
    );
    sqlx::query("UPDATE ads.content_segments SET end_ms = 49000 WHERE segment_id = $1")
        .bind(frame_id)
        .execute(&pool)
        .await
        .unwrap();
    point(
        &pool,
        (source, &hash),
        "star_endorsement",
        (40_000, 49_000),
        &f.product,
        true,
    )
    .await;
    let preview = remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 10))
        .await
        .unwrap();
    assert_eq!(
        preview.slots[1].candidate_count, 1,
        "an inseparable candidate cannot be cut at the framework boundary"
    );
    let hash: String = sqlx::query_scalar(
        "SELECT raw_sha256 FROM ads.marketing_content_assets WHERE asset_id = $1",
    )
    .bind(f.reference)
    .fetch_one(&pool)
    .await
    .unwrap();
    point(
        &pool,
        (f.reference, &hash),
        "star_endorsement",
        (24_000, 34_000),
        &f.product,
        true,
    )
    .await;
    assert!(
        matches!(remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 10)).await,
        Err(super::error::StudioError::App(AppError::BadRequest(message))) if message.contains("连续关系"))
    );
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL"]
async fn point_writes_cannot_race_a_frozen_fallback_and_contention_does_not_wait() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let (_, source, _) = voiceover_fallback_source(&pool, &f).await;
    let n = remix::normalize(&preview_request(&f, 10), 10).unwrap();
    let mut tx = pool.begin().await.unwrap();
    let plan = remix::build_plan(
        &pool,
        &settings(),
        &mut tx,
        &owner,
        SCOPED,
        &n,
        &HashSet::new(),
    )
    .await
    .unwrap();
    let mut writer = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':selling_point', 0))")
        .bind(source.to_string())
        .execute(&mut *writer)
        .await
        .unwrap();
    let locked = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        remix::lock_segments(&mut tx, &plan, &n),
    )
    .await
    .unwrap();
    assert_eq!(conflict_code(locked), ConflictCode::SourceChanged);
    writer.rollback().await.unwrap();
    assert!(remix::lock_segments(&mut tx, &plan, &n).await.is_ok());
    let mut writer = pool.begin().await.unwrap();
    let writable: bool = sqlx::query_scalar(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1 || ':selling_point', 0))",
    )
    .bind(source.to_string())
    .fetch_one(&mut *writer)
    .await
    .unwrap();
    assert!(
        !writable,
        "new confirmed points wait until the batch commits"
    );
    writer.rollback().await.unwrap();
    tx.rollback().await.unwrap();
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL"]
async fn a_new_continuous_neighbour_outside_a_fallback_invalidates_its_cut() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    let n = remix::normalize(&preview_request(&f, 10), 10).unwrap();
    let (_, source, hash) = voiceover_fallback_source(&pool, &f).await;
    point(
        &pool,
        (source, &hash),
        "star_endorsement",
        (40_000, 49_000),
        &f.product,
        false,
    )
    .await;
    let mut db = pool.acquire().await.unwrap();
    let plan = remix::build_plan(
        &pool,
        &settings(),
        &mut db,
        &owner,
        SCOPED,
        &n,
        &HashSet::new(),
    )
    .await
    .unwrap();
    point(
        &pool,
        (source, &hash),
        "natural_look",
        (49_000, 55_000),
        &f.product,
        true,
    )
    .await;
    assert_eq!(
        conflict_code(remix::lock_segments(&mut db, &plan, &n).await),
        ConflictCode::SourceChanged
    );
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL with migration 038"]
async fn missing_required_point_blocks_preview_and_create_but_fallback_can_supply_it() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    sqlx::query("UPDATE ads.content_segments SET label_key = 'long_wear' WHERE product_name = $1 AND label_key = 'skincare'")
        .bind(&f.product).execute(&pool).await.unwrap();
    let preview = remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 10))
        .await
        .unwrap();
    assert!(preview.slots.iter().all(|slot| slot.candidate_count > 0));
    assert_eq!(preview.plannable_count, 0);
    assert!(preview
        .shortfall_reason
        .unwrap()
        .contains("缺少必保卖点（滋润保湿、养肤护肤）"));
    let request = CreateRemixBatchRequest {
        idempotency_key: "required-points".into(),
        mode: Some("sellingPoint".into()),
        preset_key: "framework".into(),
        preset_version: 1,
        labels: None,
        source_asset_id: Some(f.reference),
        product_name: f.product.clone(),
        count: 10,
    };
    assert!(
        matches!(remix::create(&pool, &settings(), &owner, SCOPED, &request).await,
        Err(super::error::StudioError::Conflict(conflict)) if conflict.code == ConflictCode::RemixUnavailable && conflict.detail.contains("必保卖点"))
    );
    let batches: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_remix_batches WHERE owner_user_id = $1",
    )
    .bind(&f.owner)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        batches, 0,
        "a failed required-point check enqueues no batch"
    );
    let (_, source, hash) = voiceover_fallback_source(&pool, &f).await;
    point(
        &pool,
        (source, &hash),
        "skincare",
        (40_000, 49_000),
        &f.product,
        false,
    )
    .await;
    let detail = remix::create(&pool, &settings(), &owner, SCOPED, &request)
        .await
        .unwrap();
    assert!(!detail.items.is_empty());
    for item in detail.items {
        let labels: HashSet<&str> = item
            .segments
            .iter()
            .flat_map(|s| s.selling_points.iter().flatten().map(String::as_str))
            .collect();
        assert!(labels.contains("moisturizing") && labels.contains("skincare"));
        assert!(item.segments.iter().any(|s| s.fallback == Some(true)
            && s.selling_points
                .as_ref()
                .unwrap()
                .iter()
                .any(|p| p == "skincare")));
    }
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL with migration 038"]
async fn business_label_migration_preserves_legacy_annotations_and_blocks_new_nonstandard_labels() {
    let pool = pool().await;
    let owner_id = format!("business-labels-{}", Uuid::new_v4());
    let owner = user(&owner_id);
    let (asset_id, hash) = asset(&pool, &owner_id, "蜜粉", "authorized").await;
    let legacy_id = point(
        &pool,
        (asset_id, &hash),
        "natural_look",
        (0, 1000),
        "蜜粉",
        false,
    )
    .await;
    let mut tx = pool.begin().await.unwrap();
    // Reconstruct the previous metadata only inside this transaction. Other
    // tests continue seeing the committed seven-label preset.
    sqlx::query("UPDATE ads.content_segment_presets SET labels = labels || '[{\"key\":\"natural_look\",\"name\":\"伪素颜\",\"definition\":\"legacy\"}]'::JSONB WHERE preset_key = 'selling_point' AND version = 1")
        .execute(&mut *tx).await.unwrap();
    let before: Value =
        sqlx::query_scalar("SELECT TO_JSONB(s) FROM ads.content_segments s WHERE segment_id = $1")
            .bind(legacy_id)
            .fetch_one(&mut *tx)
            .await
            .unwrap();
    sqlx::raw_sql(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../sql/migrations/042_content_ai_studio_selling_point_business_labels.sql"
    )))
    .execute(&mut *tx)
    .await
    .unwrap();
    let after: Value =
        sqlx::query_scalar("SELECT TO_JSONB(s) FROM ads.content_segments s WHERE segment_id = $1")
            .bind(legacy_id)
            .fetch_one(&mut *tx)
            .await
            .unwrap();
    assert_eq!(
        before, after,
        "legacy label, interval and continuity must remain untouched"
    );
    let labels = repository::active_preset_labels(&mut tx, "selling_point", 1)
        .await
        .unwrap();
    assert_eq!(labels.len(), 7);
    assert!(!labels.iter().any(|label| label.key == "natural_look"));
    tx.rollback().await.unwrap();
    let mut input = create(asset_id, 1000, 2000);
    input.preset_key = "selling_point".into();
    input.label_key = "natural_look".into();
    assert!(matches!(
        repository::create_segment(&pool, &owner, SCOPED, input).await,
        Err(super::error::StudioError::App(AppError::BadRequest(_)))
    ));
    let mut input = create(asset_id, 1000, 2000);
    input.preset_key = "selling_point".into();
    input.label_key = "skincare".into();
    assert!(repository::create_segment(&pool, &owner, SCOPED, input)
        .await
        .is_ok());
}
