//! Disposable PostgreSQL contract for the AI 创作中心 enterprise scope
//! (`CONTENT_AI_STUDIO_ENTERPRISE`). Run through
//! `backend-rust/scripts/test-content-production-postgres.sh`.
//! Only originals tagged `企业:<name>` are admitted or read by the studio;
//! without a configured enterprise the whole library stays in scope.
use super::access::StudioAccess;
use super::asset_summaries;
use super::error::StudioError;
use super::overview;
use super::overview_types::StudioOverviewQuery;
use super::postgres_tests::{asset, create, pool, OWNER};
use super::remix_read;
use super::repository;
use super::suggestions;
use super::types::{ContentSegmentListQuery, CreateSegmentSuggestionsRequest, SegmentPoolQuery};
use crate::{auth::CurrentUser, error::AppError};
use sqlx::PgPool;
use uuid::Uuid;

fn user() -> CurrentUser {
    CurrentUser {
        user_id: OWNER.into(),
        username: Some(OWNER.into()),
        roles: Vec::new(),
        permissions: Vec::new(),
    }
}

async fn tag(pool: &PgPool, asset_id: Uuid, tag: &str) {
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET tags = ARRAY[$2, '测试样片'] WHERE asset_id = $1",
    )
    .bind(asset_id)
    .bind(tag)
    .execute(pool)
    .await
    .unwrap();
}

fn segments_of(asset_id: Uuid) -> ContentSegmentListQuery {
    ContentSegmentListQuery {
        asset_id: Some(asset_id),
        ..Default::default()
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 021–032"]
async fn enterprise_scope_admits_and_reads_only_tagged_originals() {
    let pool = pool().await;
    let enterprise = format!("企业:测试{}", Uuid::new_v4().simple());
    let scoped = StudioAccess::OPEN.with_enterprise_tag(&enterprise);
    let actor = user();
    let (inside, _) = asset(&pool, Some(OWNER), Some(10.0), Some("面霜")).await;
    let (outside, _) = asset(&pool, Some(OWNER), Some(10.0), Some("面霜")).await;
    tag(&pool, inside, &enterprise).await;
    // A segment written before the scope existed stays in the library but out of view.
    repository::create_segment(&pool, &actor, StudioAccess::OPEN, create(outside, 0, 1000))
        .await
        .unwrap();

    assert!(matches!(
        repository::create_segment(&pool, &actor, scoped, create(outside, 2000, 3000)).await,
        Err(StudioError::App(AppError::BadRequest(message))) if message.contains("不属于当前企业")
    ));
    let suggest = |asset_id| CreateSegmentSuggestionsRequest {
        asset_ids: vec![asset_id],
        preset_key: "framework".into(),
        preset_version: 1,
        label_keys: None,
    };
    assert!(matches!(
        suggestions::create_jobs(&pool, &actor, scoped, 5, suggest(outside)).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    repository::create_segment(&pool, &actor, scoped, create(inside, 0, 1000))
        .await
        .unwrap();

    let tag = Some(enterprise.as_str());
    let hidden = repository::list_segments(&pool, segments_of(outside), tag)
        .await
        .unwrap();
    assert!(hidden.items.is_empty());
    let shown = repository::list_segments(&pool, segments_of(inside), tag)
        .await
        .unwrap();
    assert_eq!(shown.items.len(), 1);
    let unscoped = repository::list_segments(&pool, segments_of(outside), None)
        .await
        .unwrap();
    assert_eq!(unscoped.items.len(), 1);

    let cells = asset_summaries::segment_pool(&pool, SegmentPoolQuery::default(), tag)
        .await
        .unwrap();
    assert_eq!(
        cells.items.iter().map(|c| c.confirmed_count).sum::<i64>(),
        1
    );

    let overview = overview::overview(&pool, StudioOverviewQuery { period: None }, None, tag)
        .await
        .unwrap();
    assert_eq!(overview.pipeline.ready_assets, 1);
    assert_eq!(overview.pipeline.segments_confirmed, 1);
    // An AI 切段 job on an untagged original is not readable by id inside the enterprise.
    let job = suggestions::create_jobs(&pool, &actor, StudioAccess::OPEN, 5, suggest(outside))
        .await
        .unwrap()
        .items
        .remove(0)
        .job_id;
    assert!(matches!(
        suggestions::fetch_job(&pool, job, tag).await,
        Err(StudioError::App(AppError::NotFound))
    ));
    assert!(suggestions::fetch_job(&pool, job, None).await.is_ok());
    // Batches only count when one of their segments comes from a tagged original.
    let batches = remix_read::list(
        &pool,
        &super::remix_postgres_tests::settings(),
        OWNER,
        None,
        tag,
    )
    .await
    .unwrap();
    assert!(batches.items.is_empty());
}
