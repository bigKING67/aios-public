//! Disposable PostgreSQL contract for AI 创作中心 open access (migrations
//! 021–032). Run through `backend-rust/scripts/test-content-production-postgres.sh`.
//! A basic signed-in user (no role, no permission) writes studio data and
//! sees/cancels every batch in open access; scoped access keeps the old rules.
use super::access::StudioAccess;
use super::error::StudioError;
use super::postgres_tests::{asset, confirm, create, patch, pool, OWNER};
use super::remix;
use super::remix_cancel;
use super::remix_postgres_tests::{create_request, fixture, preview_request, settings};
use super::remix_read;
use super::repository;
use super::suggestions;
use super::types::CreateSegmentSuggestionsRequest;
use crate::{
    auth::CurrentUser,
    error::AppError,
    marketing::content_assets::production::framework_remix::{bind_source, SourcePermission},
};
use uuid::Uuid;

const OPEN: StudioAccess = StudioAccess::OPEN;
const SCOPED: StudioAccess = StudioAccess::SCOPED;

fn basic(id: &str) -> CurrentUser {
    CurrentUser {
        user_id: id.into(),
        username: Some(id.into()),
        roles: Vec::new(),
        permissions: Vec::new(),
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn open_access_lets_a_basic_user_write_segments_and_request_suggestions() {
    let pool = pool().await;
    let actor = basic(&format!("basic-{}", Uuid::new_v4()));
    let (owned, _) = asset(&pool, Some(OWNER), Some(10.0), Some("面霜")).await;

    // Scoped access keeps the per-asset edit permission.
    assert!(matches!(
        repository::create_segment(&pool, &actor, SCOPED, create(owned, 0, 1000)).await,
        Err(StudioError::App(AppError::Forbidden))
    ));

    let segment = repository::create_segment(&pool, &actor, OPEN, create(owned, 0, 1000))
        .await
        .unwrap();
    assert_eq!(segment.owner_user_id, actor.user_id);
    assert_eq!(
        segment.confirmed_by.as_deref(),
        Some(actor.user_id.as_str())
    );
    assert_eq!(segment.product_name.as_deref(), Some("面霜"));

    let relabel = || {
        let mut request = patch(segment.revision);
        request.label_key = Some("koc".into());
        request
    };
    assert!(matches!(
        repository::update_segment(&pool, &actor, SCOPED, segment.segment_id, relabel()).await,
        Err(StudioError::App(AppError::Forbidden))
    ));
    let relabeled = repository::update_segment(&pool, &actor, OPEN, segment.segment_id, relabel())
        .await
        .unwrap();
    assert_eq!(relabeled.label_key, "koc");

    let mut draft = create(owned, 2000, 3000);
    draft.draft = true;
    let draft = repository::create_segment(&pool, &actor, OPEN, draft)
        .await
        .unwrap();
    let confirmer = basic(&format!("basic-{}", Uuid::new_v4()));
    let request = || confirm(&[(draft.segment_id, draft.revision)]);
    assert!(matches!(
        repository::confirm_segments(&pool, &confirmer, SCOPED, request()).await,
        Err(StudioError::App(AppError::Forbidden))
    ));
    let confirmed = repository::confirm_segments(&pool, &confirmer, OPEN, request())
        .await
        .unwrap();
    // Audit columns keep the real acting users.
    assert_eq!(confirmed.items[0].owner_user_id, actor.user_id);
    assert_eq!(
        confirmed.items[0].confirmed_by.as_deref(),
        Some(confirmer.user_id.as_str())
    );

    // Existence, readiness and hash checks are not relaxed.
    assert!(matches!(
        repository::create_segment(&pool, &actor, OPEN, create(Uuid::new_v4(), 0, 1000)).await,
        Err(StudioError::App(AppError::NotFound))
    ));
    let (unready, _) = asset(&pool, Some(OWNER), Some(10.0), None).await;
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET asset_status = 'uploading' WHERE asset_id = $1",
    )
    .bind(unready)
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        repository::create_segment(&pool, &actor, OPEN, create(unready, 0, 1000)).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));

    let suggest = |asset_ids: Vec<Uuid>| CreateSegmentSuggestionsRequest {
        asset_ids,
        preset_key: "framework".into(),
        preset_version: 1,
        label_keys: None,
    };
    assert!(matches!(
        suggestions::create_jobs(&pool, &actor, SCOPED, 5, suggest(vec![owned])).await,
        Err(StudioError::App(AppError::Forbidden))
    ));
    let jobs = suggestions::create_jobs(&pool, &actor, OPEN, 5, suggest(vec![owned]))
        .await
        .unwrap();
    assert_eq!(jobs.items[0].owner_user_id, actor.user_id);
    assert!(matches!(
        suggestions::create_jobs(&pool, &actor, OPEN, 5, suggest(vec![unready])).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn bind_source_skips_only_the_edit_permission() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let stranger = basic("remix-basic-stranger");
    assert!(matches!(
        bind_source(&pool, "fixture", &stranger, f.a, SourcePermission::Enforce).await,
        Err(AppError::Forbidden)
    ));
    let bound = bind_source(&pool, "fixture", &stranger, f.a, SourcePermission::Skip)
        .await
        .unwrap();
    assert_eq!(bound.asset_id(), f.a);
    assert!(matches!(
        bind_source(
            &pool,
            "other-bucket",
            &stranger,
            f.a,
            SourcePermission::Skip
        )
        .await,
        Err(AppError::BadRequest(_))
    ));
    assert!(matches!(
        bind_source(
            &pool,
            "fixture",
            &stranger,
            Uuid::new_v4(),
            SourcePermission::Skip
        )
        .await,
        Err(AppError::NotFound)
    ));
    sqlx::query("UPDATE ads.marketing_content_assets SET authorization_status = 'expired' WHERE asset_id = $1")
        .bind(f.b)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        bind_source(&pool, "fixture", &stranger, f.b, SourcePermission::Skip).await,
        Err(AppError::BadRequest(_))
    ));
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn open_access_batches_are_created_seen_and_cancelled_by_any_user() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let creator = basic(&format!("remix-basic-{}", Uuid::new_v4()));
    let viewer = basic(&format!("remix-basic-{}", Uuid::new_v4()));

    // Same candidates as the asset owner: only the restricted asset is excluded.
    let preview = remix::preview(&pool, &settings(), &creator, OPEN, &preview_request(&f, 3))
        .await
        .unwrap();
    assert_eq!(preview.excluded_asset_count, 1);
    assert_eq!(preview.plannable_count, 3);

    let detail = remix::create(
        &pool,
        &settings(),
        &creator,
        OPEN,
        &create_request(&f, 2, "open-a"),
    )
    .await
    .unwrap();
    let batch_id = detail.batch.batch_id;
    assert_eq!(detail.batch.owner_user_id, creator.user_id);
    assert!(detail.batch.owned_by_current_user);
    let run_owners: Vec<String> = sqlx::query_scalar(
        "SELECT r.owner_user_id FROM ads.content_remix_batch_runs br JOIN ads.content_production_runs r ON r.run_id = br.run_id WHERE br.batch_id = $1",
    )
    .bind(batch_id)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(run_owners, vec![creator.user_id.clone(); 2]);

    // Scoped reads stay owner-only; open reads show every batch.
    assert!(remix_read::list(
        &pool,
        &settings(),
        &viewer.user_id,
        Some(&viewer.user_id),
        None
    )
    .await
    .unwrap()
    .items
    .is_empty());
    assert!(matches!(
        remix_read::detail(
            &pool,
            &settings(),
            &viewer.user_id,
            Some(&viewer.user_id),
            batch_id
        )
        .await,
        Err(StudioError::App(AppError::NotFound))
    ));
    let listed = remix_read::list(&pool, &settings(), &viewer.user_id, None, None)
        .await
        .unwrap();
    let seen = listed
        .items
        .iter()
        .find(|batch| batch.batch_id == batch_id)
        .expect("open access lists other users' batches");
    assert_eq!(seen.owner_user_id, creator.user_id);
    assert!(!seen.owned_by_current_user);
    let shared = remix_read::detail(&pool, &settings(), &viewer.user_id, None, batch_id)
        .await
        .unwrap();
    assert_eq!(shared.items.len(), 2);
    assert!(!shared.batch.owned_by_current_user);

    assert!(matches!(
        remix_cancel::cancel(
            &pool,
            &settings(),
            &viewer.user_id,
            Some(&viewer.user_id),
            batch_id
        )
        .await,
        Err(StudioError::App(AppError::NotFound))
    ));
    let cancelled = remix_cancel::cancel(&pool, &settings(), &viewer.user_id, None, batch_id)
        .await
        .unwrap();
    assert!(cancelled
        .items
        .iter()
        .all(|item| item.run_status == "cancelled"));
    assert_eq!(cancelled.batch.status, "cancelled");
    assert_eq!(cancelled.batch.owner_user_id, creator.user_id);
}
