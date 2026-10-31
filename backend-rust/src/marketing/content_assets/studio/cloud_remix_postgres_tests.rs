//! Cloud rollout, candidate binding and frozen batches; no live vendor calls.
use super::{
    postgres_tests::{pool, user},
    remix_postgres_tests::asset,
};
use crate::marketing::content_assets::production::framework_remix::{
    self as runs, bind_source, RemixClip, RemixRun, SourcePermission,
};
use uuid::Uuid;

async fn make_cloud(pool: &sqlx::PgPool, id: Uuid) {
    sqlx::query("UPDATE ads.marketing_content_assets a SET source_type='cloud_video', bucket='cloud_video', raw_object_key='cloud-video://' || v.video_id::TEXT FROM cloud_video.videos v WHERE a.asset_id=$1 AND v.asset_id=a.asset_id")
        .bind(id).execute(pool).await.unwrap();
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn cloud_rollout_controls_counts_preview_create_and_frozen_job_sources() {
    use super::{
        asset_summaries, postgres_tests::SCOPED, remix, remix_postgres_tests as f, remix_read,
        remix_types::RemixProductListQuery, types::SegmentPoolQuery,
    };
    let pool = pool().await;
    let fixture = f::fixture(&pool).await;
    for id in [fixture.a, fixture.b] {
        make_cloud(&pool, id).await;
    }
    let actor = user(&fixture.owner);
    let mut config = f::settings();
    let request = f::create_request(&fixture, 1, "cloud-rollout");
    let off = remix::preview(
        &pool,
        &config,
        &actor,
        SCOPED,
        &f::preview_request(&fixture, 1),
    )
    .await
    .unwrap();
    assert_eq!(off.plannable_count, 0);
    assert!(remix::create(&pool, &config, &actor, SCOPED, &request)
        .await
        .is_err());
    for (enabled, expected) in [(false, 1_i64), (true, 5_i64)] {
        let products = remix_read::products(
            &pool,
            &RemixProductListQuery {
                preset_key: Some("framework".into()),
                preset_version: Some(1),
            },
            None,
            enabled,
        )
        .await
        .unwrap();
        assert_eq!(
            products
                .items
                .iter()
                .find(|p| p.product_name == fixture.product)
                .unwrap()
                .confirmed_segment_count,
            expected
        );
        let cells =
            asset_summaries::segment_pool(&pool, SegmentPoolQuery::default(), None, enabled)
                .await
                .unwrap();
        assert_eq!(
            cells
                .product_counts
                .iter()
                .find(|p| p.product_name.as_deref() == Some(fixture.product.as_str()))
                .unwrap()
                .confirmed_count,
            expected
        );
    }
    config.content_ai_studio_cloud_remix_enabled = true;
    let on = remix::preview(
        &pool,
        &config,
        &actor,
        SCOPED,
        &f::preview_request(&fixture, 1),
    )
    .await
    .unwrap();
    assert_eq!(on.plannable_count, 1);
    let batch = remix::create(&pool, &config, &actor, SCOPED, &request)
        .await
        .unwrap();
    assert_eq!(batch.items.len(), 1);
    let replay = remix::create(&pool, &config, &actor, SCOPED, &request)
        .await
        .unwrap();
    assert_eq!(replay.batch.batch_id, batch.batch.batch_id);
    let snapshot: serde_json::Value = sqlx::query_scalar("SELECT pr.snapshot FROM ads.content_production_runs r JOIN ads.content_production_revisions pr ON pr.project_id=r.project_id AND pr.revision=r.project_revision WHERE r.run_id=$1")
        .bind(batch.items[0].run_id).fetch_one(&pool).await.unwrap();
    assert!(snapshot["assets"]
        .as_array()
        .unwrap()
        .iter()
        .all(|a| a["objectKey"]
            .as_str()
            .unwrap()
            .starts_with("cloud-video://")));
    assert_eq!(snapshot["clips"].as_array().unwrap().len(), 3);
    sqlx::query("UPDATE cloud_video.videos SET file_sha256=NULL WHERE asset_id=ANY($1)")
        .bind([fixture.a, fixture.b])
        .execute(&pool)
        .await
        .unwrap();
    let stale = remix::preview(
        &pool,
        &config,
        &actor,
        SCOPED,
        &f::preview_request(&fixture, 1),
    )
    .await
    .unwrap();
    assert_eq!(stale.plannable_count, 0);
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn cloud_single_edit_uses_the_same_switch() {
    use super::{
        postgres_tests::SCOPED,
        remix_edit, remix_postgres_tests as f,
        remix_types::{CreateRemixEditRequest, RemixEditCheckRequest, RemixEditClip},
    };
    let pool = pool().await;
    let owner = format!("cloud-edit-{}", Uuid::new_v4());
    let product = format!("cloud-edit-product-{}", Uuid::new_v4());
    let (id, sha) = asset(&pool, &owner, &product, "authorized").await;
    let segment = f::segment(&pool, (id, &sha), "mixed_voiceover", (0, 5000), &product).await;
    make_cloud(&pool, id).await;
    let actor = user(&owner);
    let request = RemixEditCheckRequest {
        preset_key: "framework".into(),
        preset_version: 1,
        clips: vec![RemixEditClip {
            segment_id: segment,
            start_ms: 0,
            end_ms: 5000,
        }],
    };
    let mut config = f::settings();
    assert!(remix_edit::check(&pool, &config, &actor, SCOPED, &request)
        .await
        .is_err());
    config.content_ai_studio_cloud_remix_enabled = true;
    remix_edit::check(&pool, &config, &actor, SCOPED, &request)
        .await
        .unwrap();
    let created = remix_edit::create(
        &pool,
        &config,
        &actor,
        SCOPED,
        &CreateRemixEditRequest {
            idempotency_key: owner.clone(),
            preset_key: request.preset_key,
            preset_version: 1,
            clips: request.clips,
            allow_duplicate: false,
        },
    )
    .await
    .unwrap();
    assert_eq!(created.items.len(), 1);
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn cloud_selling_point_frames_and_points_are_enabled_together() {
    use super::{
        postgres_tests::SCOPED,
        remix, remix_points_postgres_tests as p, remix_postgres_tests as f,
        remix_types::{CreateRemixBatchRequest, RemixBatchPreviewRequest},
    };
    let pool = pool().await;
    let fixture = p::fixture(&pool).await;
    let ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT asset_id FROM ads.marketing_content_assets WHERE product_name=$1",
    )
    .bind(&fixture.product)
    .fetch_all(&pool)
    .await
    .unwrap();
    for id in ids {
        make_cloud(&pool, id).await;
    }
    let actor = user(&fixture.owner);
    let request = RemixBatchPreviewRequest {
        mode: Some("sellingPoint".into()),
        preset_key: "framework".into(),
        preset_version: 1,
        labels: None,
        source_asset_id: Some(fixture.reference),
        product_name: fixture.product.clone(),
        count: 1,
    };
    let mut config = f::settings();
    let off = remix::preview(&pool, &config, &actor, SCOPED, &request)
        .await
        .unwrap();
    assert_eq!(off.plannable_count, 0);
    config.content_ai_studio_cloud_remix_enabled = true;
    let on = remix::preview(&pool, &config, &actor, SCOPED, &request)
        .await
        .unwrap();
    assert_eq!(on.plannable_count, 1);
    let batch = remix::create(
        &pool,
        &config,
        &actor,
        SCOPED,
        &CreateRemixBatchRequest {
            mode: request.mode,
            idempotency_key: fixture.owner.clone(),
            preset_key: request.preset_key,
            preset_version: 1,
            labels: None,
            source_asset_id: request.source_asset_id,
            product_name: fixture.product,
            count: 1,
        },
    )
    .await
    .unwrap();
    assert_eq!(batch.items.len(), 1);
    let frozen: serde_json::Value =
        sqlx::query_scalar("SELECT segments FROM ads.content_remix_batch_runs WHERE run_id=$1")
            .bind(batch.items[0].run_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(frozen
        .as_array()
        .unwrap()
        .iter()
        .any(|s| s["parts"].as_array().is_some_and(|p| !p.is_empty())));
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn cloud_remix_freezes_identity_and_rejects_stale_or_restricted_sources() {
    let pool = pool().await;
    let owner = format!("cloud-remix-{}", Uuid::new_v4());
    let actor = user(&owner);
    let (id, sha) = asset(&pool, &owner, "cloud-remix-product", "authorized").await;
    let video: i64 =
        sqlx::query_scalar("SELECT video_id FROM cloud_video.videos WHERE asset_id=$1")
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap();
    let key = format!("cloud-video://{video}");
    sqlx::query("UPDATE ads.marketing_content_assets SET source_type='cloud_video', bucket='cloud_video', raw_object_key=$2 WHERE asset_id=$1")
        .bind(id).bind(&key).execute(&pool).await.unwrap();
    let bound = bind_source(&pool, "fixture", &actor, id, SourcePermission::Enforce)
        .await
        .unwrap();
    let mut tx = pool.begin().await.unwrap();
    let run = runs::create_and_produce(
        &mut tx,
        &owner,
        RemixRun {
            idempotency_key: owner.clone(),
            title: "cloud fixture".into(),
            brief: "cloud fixture".into(),
            summary: "cloud fixture".into(),
            clips: vec![RemixClip {
                asset_id: id,
                start_ms: 0,
                end_ms: 9800,
                reason: "fixture".into(),
            }],
        },
        &[&bound],
    )
    .await
    .unwrap();
    let snapshot: serde_json::Value = sqlx::query_scalar("SELECT pr.snapshot FROM ads.content_production_runs r JOIN ads.content_production_revisions pr ON pr.project_id=r.project_id AND pr.revision=r.project_revision WHERE r.run_id=$1")
        .bind(run).fetch_one(&mut *tx).await.unwrap();
    assert_eq!(snapshot["assets"][0]["objectKey"], key);
    assert_eq!(snapshot["assets"][0]["sha256"], sha);
    assert_eq!(snapshot["clips"][0]["endMs"], 9800);
    tx.rollback().await.unwrap();

    sqlx::query("UPDATE cloud_video.videos SET file_sha256=NULL WHERE video_id=$1")
        .bind(video)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        bind_source(&pool, "fixture", &actor, id, SourcePermission::Skip)
            .await
            .is_err()
    );
    sqlx::query("UPDATE cloud_video.videos SET file_sha256=$2 WHERE video_id=$1")
        .bind(video)
        .bind(&sha)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET repurpose_allowed=FALSE WHERE asset_id=$1",
    )
    .bind(id)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        bind_source(&pool, "fixture", &actor, id, SourcePermission::Skip)
            .await
            .is_err()
    );
}
