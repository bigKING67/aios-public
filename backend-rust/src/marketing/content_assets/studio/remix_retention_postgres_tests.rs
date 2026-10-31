//! Seven-day rejection visibility, restoration, permanent audit and remote playback.
use super::{
    error::StudioError,
    postgres_tests::{pool, user, OTHER, SCOPED},
    remix, remix_list,
    remix_postgres_tests::{asset, create_request, fixture, settings},
    remix_read, remix_review,
    remix_types::{RemixBatchListQuery, RemixOutputReviewRequest},
};
use sqlx::PgPool;
use uuid::Uuid;

fn reject() -> RemixOutputReviewRequest {
    RemixOutputReviewRequest {
        decision: "rejected".into(),
        reasons: vec!["pacing".into()],
        note: Some("节奏太慢".into()),
    }
}
fn status(result: Result<impl std::fmt::Debug, StudioError>) -> u16 {
    match result.unwrap_err() {
        StudioError::App(e) => e.status_code().as_u16(),
        e => panic!("{e:?}"),
    }
}
async fn deliver(pool: &PgPool, run: Uuid, output: Uuid) {
    sqlx::query("UPDATE ads.content_production_runs SET status='succeeded',stage='delivery' WHERE run_id=$1").bind(run).execute(pool).await.unwrap();
    sqlx::query("UPDATE ads.content_remix_batch_runs SET output_asset_id=$1 WHERE run_id=$2")
        .bind(output)
        .bind(run)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET source_type='ai_studio_output' WHERE asset_id=$1",
    )
    .bind(output)
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL with BQL 017"]
async fn rejected_outputs_hide_restore_then_expire_with_permanent_history() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let s = settings();
    let detail = remix::create(
        &pool,
        &s,
        &user(&f.owner),
        SCOPED,
        &create_request(&f, 1, "retention"),
    )
    .await
    .unwrap();
    let batch = detail.batch.batch_id;
    let run = detail.items[0].run_id;
    let (output, _) = asset(&pool, &f.owner, "粉底液", "authorized").await;
    deliver(&pool, run, output).await;
    let rejected = remix_review::review(&pool, &s, &f.owner, Some(&f.owner), batch, 1, &reject())
        .await
        .unwrap();
    assert!(rejected.items[0].output_deleted);
    assert_eq!(
        rejected.items[0].review.as_ref().unwrap().decision,
        "rejected"
    );
    assert!(rejected.items[0].retention.as_ref().unwrap().can_restore);
    assert_eq!(rejected.batch.available_count, 0);
    assert_eq!(rejected.batch.rejected_count, 1);
    assert!(super::super::repository::query_asset_by_id(&pool, output)
        .await
        .unwrap()
        .is_none());
    for filter in ["with", "without"] {
        let page = remix_list::list(
            &pool,
            &s,
            &f.owner,
            Some(&f.owner),
            None,
            &RemixBatchListQuery {
                outputs: Some(filter.into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert!(page.items.is_empty());
        assert_eq!(page.counts.rejected.all, 1);
    }
    let page = remix_list::list(
        &pool,
        &s,
        &f.owner,
        Some(&f.owner),
        None,
        &RemixBatchListQuery {
            review: Some("rejected".into()),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(
        status(remix_review::clear(&pool, &s, OTHER, Some(OTHER), batch, 1).await),
        404
    );
    let restored = remix_review::clear(&pool, &s, &f.owner, Some(&f.owner), batch, 1)
        .await
        .unwrap();
    assert!(!restored.items[0].output_deleted);
    assert!(restored.items[0].review.is_none());
    assert!(restored.items[0].retention.is_none());
    assert_eq!(restored.batch.available_count, 1);
    let history: Vec<String> =
        sqlx::query_scalar("SELECT decision FROM ads.content_remix_review_history WHERE run_id=$1")
            .bind(run)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(history, vec!["rejected"]);
    remix_review::review(&pool, &s, &f.owner, Some(&f.owner), batch, 1, &reject())
        .await
        .unwrap();
    sqlx::query("UPDATE ads.content_remix_output_reviews SET reviewed_at=NOW()-INTERVAL '8 days' WHERE run_id=$1").bind(run).execute(&pool).await.unwrap();
    let read = remix_read::detail(&pool, &s, &f.owner, Some(&f.owner), batch)
        .await
        .unwrap();
    assert!(!read.items[0].retention.as_ref().unwrap().can_restore);
    assert_eq!(
        status(remix_review::clear(&pool, &s, &f.owner, Some(&f.owner), batch, 1).await),
        409
    );
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL with BQL 017"]
async fn shared_asset_stays_live_and_cleaned_delivery_uses_cloud_addresses() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let s = settings();
    let detail = remix::create(
        &pool,
        &s,
        &user(&f.owner),
        SCOPED,
        &create_request(&f, 2, "shared-retention"),
    )
    .await
    .unwrap();
    let batch = detail.batch.batch_id;
    let (output, _) = asset(&pool, &f.owner, "粉底液", "authorized").await;
    for item in &detail.items {
        deliver(&pool, item.run_id, output).await;
    }
    let rejected = remix_review::review(&pool, &s, &f.owner, Some(&f.owner), batch, 1, &reject())
        .await
        .unwrap();
    assert!(!rejected.items[0].output_deleted);
    assert_eq!(rejected.batch.available_count, 1);
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM ads.content_remix_retention WHERE output_asset_id=$1"
        )
        .bind(output)
        .fetch_one(&pool)
        .await
        .unwrap(),
        0
    );
    sqlx::query("INSERT INTO cloud_video.pushes(output_asset_id,run_id,approved_by,approved_at,status,cloud_video_id,succeeded_at,playback_outer_host,playback_inner_host,playback_path,playback_verified_at) VALUES ($1,$2,$3,NOW(),'succeeded',987654321,NOW(),'files.example','inner.example','/delivered.mp4',NOW())").bind(output).bind(detail.items[1].run_id).bind(&f.owner).execute(&pool).await.unwrap();
    let mut local_settings = settings();
    local_settings.content_asset_delivery_provider = "volc_cdn".into();
    let retained = super::super::repository::query_asset_by_id(&pool, output)
        .await
        .unwrap()
        .unwrap();
    let local = super::super::cloud_video::playback_url(
        &pool,
        &local_settings,
        &retained,
        super::super::types::PlaybackVariant::Preview,
    )
    .await
    .unwrap();
    assert!(local.url.starts_with("https://cdn.fixture.invalid/"));
    assert_eq!(local.provider, "volc_cdn");
    sqlx::query("UPDATE ads.marketing_content_assets SET raw_object_key=NULL,preview_object_key=NULL WHERE asset_id=$1").bind(output).execute(&pool).await.unwrap();
    let asset = super::super::repository::query_asset_by_id(&pool, output)
        .await
        .unwrap()
        .unwrap();
    let response = super::super::cloud_video::playback_url(
        &pool,
        &s,
        &asset,
        super::super::types::PlaybackVariant::Preview,
    )
    .await
    .unwrap();
    assert_eq!(response.url, "https://files.example/delivered.mp4");
    assert_eq!(
        response.alternate_urls,
        vec!["https://inner.example/delivered.mp4"]
    );
}
