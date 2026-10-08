//! Disposable PostgreSQL contract for AI 创作中心 segments. Run through
//! `backend-rust/scripts/test-content-production-postgres.sh`, which applies
//! the raw asset migration and 021–029 to a throwaway container.
use super::access::StudioAccess;
use super::error::{ConflictCode, StudioError};
use super::repository;
use super::types::{
    ConfirmContentSegmentItem, ConfirmContentSegmentsRequest, ContentSegmentListQuery,
    CreateContentSegmentRequest, UpdateContentSegmentRequest,
};
use crate::{auth::CurrentUser, error::AppError};
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

pub(super) const OWNER: &str = "studio-owner";
/// Existing contract tests exercise the scoped (owner/role) rules.
pub(super) const SCOPED: StudioAccess = StudioAccess::SCOPED;
pub(super) const OTHER: &str = "studio-other";

pub(super) fn user(id: &str) -> CurrentUser {
    CurrentUser {
        user_id: id.into(),
        username: Some(id.into()),
        roles: vec!["content_ops".into()],
        permissions: Vec::new(),
    }
}

pub(super) async fn pool() -> PgPool {
    let url =
        std::env::var("CONTENT_PRODUCTION_TEST_DATABASE_URL").expect("isolated test database");
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await
        .unwrap();
    // Tests run in parallel; the shared fixture DDL must be applied once.
    static SEEDED: tokio::sync::OnceCell<()> = tokio::sync::OnceCell::const_new();
    SEEDED
        .get_or_init(|| async {
            super::super::handlers::qianchuan_http_route_tests::seed_route_fixture_schema_and_auth(
                &pool,
            )
            .await;
        })
        .await;
    pool
}

fn random_sha() -> String {
    format!("{:x}", Sha256::digest(Uuid::new_v4().as_bytes()))
}

pub(super) async fn asset(
    pool: &PgPool,
    owner: Option<&str>,
    duration_seconds: Option<f64>,
    product: Option<&str>,
) -> (Uuid, String) {
    let id = Uuid::new_v4();
    let sha = random_sha();
    sqlx::query("INSERT INTO ads.marketing_content_assets (asset_id, title, asset_status, raw_sha256, duration_seconds, product_name, owner_user_id) VALUES ($1, 'studio fixture', 'ready', $2, $3::NUMERIC, $4, $5)")
        .bind(id).bind(&sha).bind(duration_seconds).bind(product).bind(owner)
        .execute(pool).await.unwrap();
    (id, sha)
}

pub(super) fn create(asset_id: Uuid, start_ms: i32, end_ms: i32) -> CreateContentSegmentRequest {
    CreateContentSegmentRequest {
        asset_id,
        preset_key: "framework".into(),
        preset_version: 1,
        label_key: "mixed_voiceover".into(),
        start_ms,
        end_ms,
        product_name: None,
        source_content_hash: None,
        draft: false,
    }
}

pub(super) fn patch(expected_revision: i32) -> UpdateContentSegmentRequest {
    UpdateContentSegmentRequest {
        expected_revision,
        start_ms: None,
        end_ms: None,
        label_key: None,
        product_name: None,
        status: None,
    }
}

/// Asserts a structured 409 and returns the named segment ids.
fn conflict<T: std::fmt::Debug>(result: Result<T, StudioError>, code: ConflictCode) -> Vec<Uuid> {
    match result {
        Err(StudioError::Conflict(conflict)) => {
            assert_eq!(conflict.code, code, "{}", conflict.detail);
            assert!(!conflict.detail.is_empty());
            conflict.segment_ids
        }
        other => panic!("expected {code:?} conflict, got {other:?}"),
    }
}

pub(super) fn confirm(items: &[(Uuid, i32)]) -> ConfirmContentSegmentsRequest {
    ConfirmContentSegmentsRequest {
        items: items
            .iter()
            .map(
                |(segment_id, expected_revision)| ConfirmContentSegmentItem {
                    segment_id: *segment_id,
                    expected_revision: *expected_revision,
                },
            )
            .collect(),
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migration 029"]
async fn presets_seed_framework_v1_and_hide_retired_versions() {
    let pool = pool().await;
    sqlx::query("INSERT INTO ads.content_segment_presets (preset_key, version, dimension, name, labels, status) VALUES ('framework', 99, 'framework', 'retired fixture', '[{\"key\":\"koc\",\"name\":\"KOC\",\"definition\":\"x\"}]', 'retired') ON CONFLICT DO NOTHING")
        .execute(&pool).await.unwrap();
    let presets = repository::list_presets(&pool).await.unwrap();
    let framework = presets
        .iter()
        .find(|preset| preset.preset_key == "framework" && preset.version == 1)
        .expect("framework v1 seed");
    assert_eq!(framework.dimension, "framework");
    let keys: Vec<_> = framework
        .labels
        .iter()
        .map(|label| label.key.as_str())
        .collect();
    assert_eq!(
        keys,
        [
            "mixed_voiceover",
            "live_demo",
            "street_interview",
            "promotion",
            "koc"
        ]
    );
    assert!(framework
        .labels
        .iter()
        .all(|label| !label.name.is_empty() && !label.definition.is_empty()));
    assert!(!presets.iter().any(|preset| preset.version == 99));
    // Retired presets reject new writes.
    let (asset_id, _) = asset(&pool, Some(OWNER), Some(10.0), None).await;
    let mut request = create(asset_id, 0, 1000);
    request.preset_version = 99;
    request.label_key = "koc".into();
    assert!(matches!(
        repository::create_segment(&pool, &user(OWNER), SCOPED, request).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    let mut request = create(asset_id, 0, 1000);
    request.preset_version = 7;
    assert!(matches!(
        repository::create_segment(&pool, &user(OWNER), SCOPED, request).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migration 029"]
async fn confirmed_segments_never_overlap_within_asset_and_preset() {
    let pool = pool().await;
    let owner = user(OWNER);
    let (asset_a, sha_a) = asset(&pool, Some(OWNER), Some(10.0), Some("精华水")).await;
    let (asset_b, _) = asset(&pool, None, Some(10.0), None).await;

    let first = repository::create_segment(&pool, &owner, SCOPED, create(asset_a, 0, 1000))
        .await
        .unwrap();
    assert_eq!(first.status, "confirmed");
    assert_eq!(first.origin, "human");
    assert_eq!(first.owner_user_id, OWNER);
    assert_eq!(first.product_name.as_deref(), Some("精华水"));
    assert_eq!(first.source_content_hash, sha_a);
    assert!(first.source_current);
    assert_eq!(first.source_duration_ms, Some(10_000));
    assert_eq!(first.confirmed_by.as_deref(), Some(OWNER));
    assert_eq!(first.revision, 1);

    // Overlapping confirmed write is rejected and names the conflicting segment.
    assert_eq!(
        conflict(
            repository::create_segment(&pool, &owner, SCOPED, create(asset_a, 500, 1500)).await,
            ConflictCode::SegmentOverlap,
        ),
        vec![first.segment_id]
    );
    // Adjacent half-open intervals do not overlap.
    let adjacent = repository::create_segment(&pool, &owner, SCOPED, create(asset_a, 1000, 2000))
        .await
        .unwrap();
    // Draft (suggested) and rejected segments do not participate.
    let mut draft = create(asset_a, 500, 1500);
    draft.draft = true;
    let draft = repository::create_segment(&pool, &owner, SCOPED, draft)
        .await
        .unwrap();
    assert_eq!(draft.status, "suggested");
    assert!(draft.confirmed_by.is_none());
    let mut reject = patch(draft.revision);
    reject.status = Some("rejected".into());
    let rejected = repository::update_segment(&pool, &owner, SCOPED, draft.segment_id, reject)
        .await
        .unwrap();
    assert_eq!(rejected.status, "rejected");
    assert_eq!(rejected.revision, 2);
    // A different asset does not conflict.
    let other_asset = repository::create_segment(&pool, &owner, SCOPED, create(asset_b, 0, 1000))
        .await
        .unwrap();
    assert_eq!(other_asset.product_name, None);
    // Editing only the product of a confirmed segment keeps the original confirmer.
    let mut product_only = patch(other_asset.revision);
    product_only.product_name = Some("面霜".into());
    let product_only = repository::update_segment(
        &pool,
        &user(OTHER),
        SCOPED,
        other_asset.segment_id,
        product_only,
    )
    .await
    .unwrap();
    assert_eq!(product_only.status, "confirmed");
    assert_eq!(product_only.confirmed_by.as_deref(), Some(OWNER));
    assert_eq!(product_only.confirmed_at, other_asset.confirmed_at);

    // Batch confirmation is all-or-nothing.
    let mut free = create(asset_a, 5000, 6000);
    free.draft = true;
    let free = repository::create_segment(&pool, &owner, SCOPED, free)
        .await
        .unwrap();
    let ids = conflict(
        repository::confirm_segments(
            &pool,
            &owner,
            SCOPED,
            confirm(&[
                (free.segment_id, free.revision),
                (rejected.segment_id, rejected.revision),
            ]),
        )
        .await,
        ConflictCode::SegmentOverlap,
    );
    assert_eq!(ids, vec![first.segment_id, adjacent.segment_id]);
    let unchanged = repository::fetch_segment(&pool, free.segment_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(unchanged.status, "suggested");
    assert_eq!(unchanged.revision, free.revision);
    // Overlap inside the batch itself is also rejected.
    let mut twin = create(asset_a, 5500, 6500);
    twin.draft = true;
    let twin = repository::create_segment(&pool, &owner, SCOPED, twin)
        .await
        .unwrap();
    let mut ids = conflict(
        repository::confirm_segments(
            &pool,
            &owner,
            SCOPED,
            confirm(&[
                (free.segment_id, free.revision),
                (twin.segment_id, twin.revision),
            ]),
        )
        .await,
        ConflictCode::BatchOverlap,
    );
    ids.sort();
    let mut expected = vec![free.segment_id, twin.segment_id];
    expected.sort();
    assert_eq!(ids, expected);
    // Stale expected revision and duplicates are rejected.
    assert_eq!(
        conflict(
            repository::confirm_segments(&pool, &owner, SCOPED, confirm(&[(free.segment_id, 99)]))
                .await,
            ConflictCode::RevisionConflict,
        ),
        vec![free.segment_id]
    );
    assert!(matches!(
        repository::confirm_segments(
            &pool,
            &owner,
            SCOPED,
            confirm(&[(free.segment_id, 1), (free.segment_id, 1)])
        )
        .await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    let confirmed =
        repository::confirm_segments(&pool, &owner, SCOPED, confirm(&[(free.segment_id, 1)]))
            .await
            .unwrap();
    assert_eq!(confirmed.items[0].status, "confirmed");
    assert_eq!(confirmed.items[0].revision, 2);
    assert!(confirmed.items[0].confirmed_at.is_some());

    // Database exclusion constraint backstops concurrent writers.
    let direct = sqlx::query("INSERT INTO ads.content_segments (segment_id, owner_user_id, asset_id, source_content_hash, start_ms, end_ms, preset_key, preset_version, label_key, origin, status, confirmed_by, confirmed_at) VALUES ($1, 'race', $2, $3, 1500, 2500, 'framework', 1, 'koc', 'human', 'confirmed', 'race', NOW())")
        .bind(Uuid::new_v4()).bind(asset_a).bind(&sha_a).execute(&pool).await;
    let error = direct.expect_err("exclusion constraint must reject overlap");
    assert_eq!(
        error
            .as_database_error()
            .and_then(|error| error.code())
            .as_deref(),
        Some("23P01")
    );
    assert!(conflict::<()>(
        Err(repository::db_error(error)),
        ConflictCode::SegmentOverlap
    )
    .is_empty());

    // Moving a confirmed segment onto another is rejected; optimistic revision enforced.
    let mut moved = patch(adjacent.revision);
    moved.start_ms = Some(900);
    assert_eq!(
        conflict(
            repository::update_segment(&pool, &owner, SCOPED, adjacent.segment_id, moved).await,
            ConflictCode::SegmentOverlap,
        ),
        vec![first.segment_id]
    );
    let mut stale_revision = patch(adjacent.revision + 5);
    stale_revision.end_ms = Some(2100);
    assert_eq!(
        conflict(
            repository::update_segment(&pool, &owner, SCOPED, adjacent.segment_id, stale_revision)
                .await,
            ConflictCode::RevisionConflict,
        ),
        vec![adjacent.segment_id]
    );
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migration 029"]
async fn validation_permissions_products_and_listing() {
    let pool = pool().await;
    let owner = user(OWNER);
    let (asset_a, sha_a) = asset(&pool, Some(OWNER), Some(10.0), Some("精华水")).await;
    let (foreign, _) = asset(&pool, Some("someone-else"), Some(10.0), None).await;
    let (unknown_duration, _) = asset(&pool, Some(OWNER), None, None).await;

    // Bounds, labels and source hash.
    assert!(matches!(
        repository::create_segment(&pool, &owner, SCOPED, create(asset_a, 0, 10_001)).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    assert!(matches!(
        repository::create_segment(&pool, &owner, SCOPED, create(asset_a, 10, 10)).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    let mut bad_label = create(asset_a, 0, 1000);
    bad_label.label_key = "unknown_label".into();
    assert!(matches!(
        repository::create_segment(&pool, &owner, SCOPED, bad_label).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    let mut wrong_hash = create(asset_a, 0, 1000);
    wrong_hash.source_content_hash = Some(random_sha());
    assert!(conflict(
        repository::create_segment(&pool, &owner, SCOPED, wrong_hash).await,
        ConflictCode::SourceChanged,
    )
    .is_empty());
    let mut malformed_hash = create(asset_a, 0, 1000);
    malformed_hash.source_content_hash = Some("not-a-sha".into());
    assert!(matches!(
        repository::create_segment(&pool, &owner, SCOPED, malformed_hash).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    let mut right_hash = create(asset_a, 0, 1000);
    right_hash.source_content_hash = Some(sha_a.to_ascii_uppercase());
    right_hash.product_name = Some("  面霜 ".into());
    let segment = repository::create_segment(&pool, &owner, SCOPED, right_hash)
        .await
        .unwrap();
    assert_eq!(segment.product_name.as_deref(), Some("面霜"));

    // Unknown asset duration is allowed and marked by sourceDurationMs = null.
    let unbounded =
        repository::create_segment(&pool, &owner, SCOPED, create(unknown_duration, 0, 60_000))
            .await
            .unwrap();
    assert_eq!(unbounded.source_duration_ms, None);

    // Permissions follow the content-asset edit policy.
    assert!(matches!(
        repository::create_segment(&pool, &user(OTHER), SCOPED, create(asset_a, 2000, 3000)).await,
        Err(StudioError::App(AppError::Forbidden))
    ));
    assert!(matches!(
        repository::create_segment(&pool, &owner, SCOPED, create(foreign, 0, 1000)).await,
        Err(StudioError::App(AppError::Forbidden))
    ));
    assert!(matches!(
        repository::create_segment(&pool, &owner, SCOPED, create(Uuid::new_v4(), 0, 1000)).await,
        Err(StudioError::App(AppError::NotFound))
    ));
    let mut foreign_patch = patch(segment.revision);
    foreign_patch.label_key = Some("koc".into());
    assert!(matches!(
        repository::update_segment(
            &pool,
            &user(OTHER),
            SCOPED,
            segment.segment_id,
            foreign_patch
        )
        .await,
        Err(StudioError::App(AppError::Forbidden))
    ));
    assert!(matches!(
        repository::confirm_segments(
            &pool,
            &user(OTHER),
            SCOPED,
            confirm(&[(segment.segment_id, 1)])
        )
        .await,
        Err(StudioError::App(AppError::Forbidden))
    ));
    assert!(matches!(
        repository::update_segment(&pool, &owner, SCOPED, Uuid::new_v4(), patch(1)).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    let mut missing = patch(1);
    missing.status = Some("rejected".into());
    assert!(matches!(
        repository::update_segment(&pool, &owner, SCOPED, Uuid::new_v4(), missing).await,
        Err(StudioError::App(AppError::NotFound))
    ));
    let mut client_stale = patch(segment.revision);
    client_stale.status = Some("stale".into());
    assert!(matches!(
        repository::update_segment(&pool, &owner, SCOPED, segment.segment_id, client_stale).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));

    // Label and product edits; blank product clears it.
    let mut relabel = patch(segment.revision);
    relabel.label_key = Some("koc".into());
    relabel.product_name = Some(" ".into());
    let relabeled = repository::update_segment(&pool, &owner, SCOPED, segment.segment_id, relabel)
        .await
        .unwrap();
    assert_eq!(relabeled.label_key, "koc");
    assert_eq!(relabeled.product_name, None);
    assert_eq!(relabeled.status, "confirmed");

    // Filtered, bounded, cursor-paginated listing.
    for start in [2000, 3000, 4000] {
        let mut request = create(asset_a, start, start + 500);
        request.draft = true;
        repository::create_segment(&pool, &owner, SCOPED, request)
            .await
            .unwrap();
    }
    let query = |cursor| ContentSegmentListQuery {
        asset_id: Some(asset_a),
        status: Some("suggested".into()),
        limit: Some(2),
        cursor,
        ..Default::default()
    };
    let page = repository::list_segments(&pool, query(None), None)
        .await
        .unwrap();
    assert_eq!(
        page.items
            .iter()
            .map(|item| item.start_ms)
            .collect::<Vec<_>>(),
        [2000, 3000]
    );
    let next = repository::list_segments(&pool, query(page.next_cursor), None)
        .await
        .unwrap();
    assert_eq!(
        next.items
            .iter()
            .map(|item| item.start_ms)
            .collect::<Vec<_>>(),
        [4000]
    );
    assert!(next.next_cursor.is_none());
    let koc = repository::list_segments(
        &pool,
        ContentSegmentListQuery {
            asset_id: Some(asset_a),
            label_key: Some("koc".into()),
            ..Default::default()
        },
        None,
    )
    .await
    .unwrap();
    assert_eq!(koc.items.len(), 1);
    // Origin filter is bound server-side, not applied to loaded rows.
    let ai_segment = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.content_segments (segment_id, owner_user_id, asset_id, source_content_hash, start_ms, end_ms, preset_key, preset_version, label_key, origin, status) VALUES ($1, 'model', $2, $3, 6000, 7000, 'framework', 1, 'live_demo', 'ai', 'suggested')")
        .bind(ai_segment).bind(asset_a).bind(&sha_a).execute(&pool).await.unwrap();
    let by_origin = |origin: &str| ContentSegmentListQuery {
        asset_id: Some(asset_a),
        origin: Some(origin.into()),
        ..Default::default()
    };
    let ai = repository::list_segments(&pool, by_origin("ai"), None)
        .await
        .unwrap();
    assert_eq!(
        ai.items
            .iter()
            .map(|item| item.segment_id)
            .collect::<Vec<_>>(),
        [ai_segment]
    );
    let human = repository::list_segments(&pool, by_origin("human"), None)
        .await
        .unwrap();
    assert!(!human.items.is_empty());
    assert!(human.items.iter().all(|item| item.origin == "human"));
    assert!(matches!(
        repository::list_segments(&pool, by_origin("model"), None).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    assert!(matches!(
        repository::list_segments(
            &pool,
            ContentSegmentListQuery {
                cursor: Some(Uuid::new_v4()),
                ..Default::default()
            },
            None
        )
        .await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migration 029"]
async fn changed_source_content_marks_segments_stale() {
    let pool = pool().await;
    let owner = user(OWNER);
    let (asset_id, _) = asset(&pool, Some(OWNER), Some(10.0), None).await;
    let confirmed = repository::create_segment(&pool, &owner, SCOPED, create(asset_id, 0, 1000))
        .await
        .unwrap();
    let mut draft = create(asset_id, 2000, 3000);
    draft.draft = true;
    let draft = repository::create_segment(&pool, &owner, SCOPED, draft)
        .await
        .unwrap();

    sqlx::query("UPDATE ads.marketing_content_assets SET raw_sha256 = $2 WHERE asset_id = $1")
        .bind(asset_id)
        .bind(random_sha())
        .execute(&pool)
        .await
        .unwrap();
    let listed = repository::list_segments(
        &pool,
        ContentSegmentListQuery {
            asset_id: Some(asset_id),
            ..Default::default()
        },
        None,
    )
    .await
    .unwrap();
    assert!(listed.items.iter().all(|item| !item.source_current));

    let mut edit = patch(confirmed.revision);
    edit.end_ms = Some(900);
    assert_eq!(
        conflict(
            repository::update_segment(&pool, &owner, SCOPED, confirmed.segment_id, edit).await,
            ConflictCode::StaleSegment,
        ),
        vec![confirmed.segment_id]
    );
    for id in [confirmed.segment_id, draft.segment_id] {
        let stale = repository::fetch_segment(&pool, id).await.unwrap().unwrap();
        assert_eq!(stale.status, "stale");
    }
    assert_eq!(
        conflict(
            repository::confirm_segments(
                &pool,
                &owner,
                SCOPED,
                confirm(&[(draft.segment_id, draft.revision + 1)])
            )
            .await,
            ConflictCode::StaleSegment,
        ),
        vec![draft.segment_id]
    );
    // New annotations bind the new content hash and may reuse the stale interval.
    let fresh = repository::create_segment(&pool, &owner, SCOPED, create(asset_id, 0, 1000))
        .await
        .unwrap();
    assert!(fresh.source_current);
    assert_eq!(fresh.status, "confirmed");
}
