//! Independent transactions keep incomplete-window cases isolated from other fixture tests.
use super::{
    admission,
    postgres_tests::{pool, user, SCOPED},
    remix, remix_postgres_tests as fixture, repository,
    types::ContentSegmentListQuery,
};
use sqlx::{PgPool, Row};
use uuid::Uuid;

/// Existing render contracts now use originals with an explicit complete spend window.
pub(super) async fn qualify(pool: &PgPool, asset: Uuid, sha: &str) {
    sqlx::query("INSERT INTO cloud_video.spend_days (stat_date, one_level_type_id, videos, total_spend) SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::DATE - n, 73180, 1, 5000 FROM generate_series(1,30) n ON CONFLICT DO NOTHING")
        .execute(pool).await.unwrap();
    let video = (asset.as_u128() & 0x7fff_ffff_ffff_ffff) as i64;
    sqlx::query("INSERT INTO cloud_video.videos (video_id, name, video_type, one_level_type_id, url_path, outer_host, inner_host, asset_id, file_sha256) VALUES ($1, 'admission fixture', 0, 73180, '/fixture.mp4', 'example.test', 'example.test', $2, $3)")
        .bind(video).bind(asset).bind(sha).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO cloud_video.spend_by_day (video_id, stat_date, one_level_type_id, spend) VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::DATE - 1, 73180, 5000)")
        .bind(video).execute(pool).await.unwrap();
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn spend_boundary_duplicate_files_unknown_and_partial_window() {
    let pool = pool().await;
    let (asset, _) =
        fixture::asset(&pool, "admission-test", "admission-product", "authorized").await;
    let mut tx = pool.begin().await.unwrap();
    let video: i64 =
        sqlx::query_scalar("SELECT video_id FROM cloud_video.videos WHERE asset_id = $1")
            .bind(asset)
            .fetch_one(&mut *tx)
            .await
            .unwrap();
    sqlx::query("UPDATE cloud_video.spend_by_day SET spend = 4999.99 WHERE video_id = $1")
        .bind(video)
        .execute(&mut *tx)
        .await
        .unwrap();
    let read = admission::load(&mut tx, &[asset], 5000., None)
        .await
        .unwrap();
    assert_eq!(read[&asset].class, "low");
    assert_eq!(read[&asset].spend30d, Some(4999.99));
    // Another vendor entry of the same bytes contributes to this original exactly once.
    let second = video ^ 0x4000_0000_0000_0000;
    sqlx::query("INSERT INTO cloud_video.videos (video_id, name, video_type, one_level_type_id, url_path, outer_host, inner_host, asset_id, file_sha256) SELECT $2, name, video_type, one_level_type_id, url_path, outer_host, inner_host, asset_id, file_sha256 FROM cloud_video.videos WHERE video_id = $1")
        .bind(video).bind(second).execute(&mut *tx).await.unwrap();
    sqlx::query("INSERT INTO cloud_video.spend_by_day (video_id, stat_date, one_level_type_id, spend) SELECT $2, stat_date, one_level_type_id, 0.01 FROM cloud_video.spend_by_day WHERE video_id = $1")
        .bind(video).bind(second).execute(&mut *tx).await.unwrap();
    let read = admission::load(&mut tx, &[asset], 5000., None)
        .await
        .unwrap();
    assert_eq!(read[&asset].class, "qualified");
    assert_eq!(read[&asset].spend30d, Some(5000.));
    sqlx::query("DELETE FROM cloud_video.spend_days WHERE one_level_type_id = 73180 AND stat_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::DATE - 10").execute(&mut *tx).await.unwrap();
    let read = admission::load(&mut tx, &[asset], 5000., None)
        .await
        .unwrap();
    assert_eq!(read[&asset].class, "unknown");
    assert!(!read[&asset].complete);
    assert_eq!(read[&asset].synced_days, 29);
    assert_eq!(read[&asset].spend30d, Some(5000.));
    sqlx::query("UPDATE cloud_video.videos SET file_sha256 = NULL WHERE asset_id = $1")
        .bind(asset)
        .execute(&mut *tx)
        .await
        .unwrap();
    let read = admission::load(&mut tx, &[asset], 5000., None)
        .await
        .unwrap();
    assert_eq!(read[&asset].class, "unknown");
    assert_eq!(read[&asset].spend30d, None);
    tx.rollback().await.unwrap();
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn filtered_pages_and_manual_batch_freeze_the_same_admission() {
    let pool = pool().await;
    let f = fixture::fixture(&pool).await;
    let video: i64 =
        sqlx::query_scalar("SELECT video_id FROM cloud_video.videos WHERE asset_id = $1")
            .bind(f.b)
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query("UPDATE cloud_video.spend_by_day SET spend = 800 WHERE video_id = $1")
        .bind(video)
        .execute(&pool)
        .await
        .unwrap();
    let query = |cursor| ContentSegmentListQuery {
        product_name: Some(f.product.clone()),
        status: Some("confirmed".into()),
        spend_class: Some("low".into()),
        cursor,
        limit: Some(1),
        ..Default::default()
    };
    let first = repository::list_segments(&pool, query(None), None, 5000.)
        .await
        .unwrap();
    assert_eq!(first.items.len(), 1);
    assert_eq!(first.items[0].asset_id, f.b);
    assert_eq!(
        first.items[0].source_spend.as_ref().unwrap().spend30d,
        Some(800.)
    );
    let second = repository::list_segments(&pool, query(first.next_cursor), None, 5000.)
        .await
        .unwrap();
    assert_ne!(first.items[0].segment_id, second.items[0].segment_id);
    assert_eq!(second.items[0].asset_id, f.b);
    let created = remix::create(
        &pool,
        &fixture::settings(),
        &user(&f.owner),
        SCOPED,
        &fixture::create_request(&f, 10, "admission-freeze"),
    )
    .await
    .unwrap();
    for item in &created.items {
        let low = item
            .segments
            .iter()
            .filter(|s| s.spend_class.as_deref() != Some("qualified"))
            .count();
        assert!(low <= 2 && low < item.segments.len());
    }
    let row = sqlx::query("SELECT constraints FROM ads.content_remix_batches WHERE batch_id = $1")
        .bind(created.batch.batch_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    let constraints: serde_json::Value = row.get("constraints");
    assert_eq!(constraints["admission"]["version"], "admission-v1");
    sqlx::query("DELETE FROM cloud_video.videos WHERE asset_id = ANY($1)")
        .bind(vec![f.a, f.b])
        .execute(&pool)
        .await
        .unwrap();
    let preview = remix::preview(
        &pool,
        &fixture::settings(),
        &user(&f.owner),
        SCOPED,
        &fixture::preview_request(&f, 10),
    )
    .await
    .unwrap();
    assert_eq!(preview.plannable_count, 0);
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn twenty_manual_outputs_replay_admission_and_freeze_their_source_evidence() {
    use super::remix_types::CreateRemixBatchRequest;
    let pool = pool().await;
    let owner = format!("admission-replay-{}", uuid::Uuid::new_v4());
    let product = format!("replay-{}", uuid::Uuid::new_v4());
    let mut assets = Vec::new();
    for i in 0..8 {
        let (id, sha) = fixture::asset(&pool, &owner, &product, "authorized").await;
        fixture::segment(&pool, (id, &sha), "mixed_voiceover", (0, 5000), &product).await;
        fixture::segment(&pool, (id, &sha), "live_demo", (10000, 15000), &product).await;
        if i >= 4 {
            sqlx::query("UPDATE cloud_video.spend_by_day SET spend = 800 WHERE video_id IN (SELECT video_id FROM cloud_video.videos WHERE asset_id = $1)")
                .bind(id).execute(&pool).await.unwrap();
        }
        assets.push(id);
    }
    let mut batches = Vec::new();
    let mut combinations = std::collections::HashSet::new();
    for batch in 0..2 {
        let request = CreateRemixBatchRequest {
            mode: None,
            idempotency_key: format!("replay-{batch}"),
            preset_key: "framework".into(),
            preset_version: 1,
            labels: Some(vec!["mixed_voiceover".into(), "live_demo".into()]),
            source_asset_id: None,
            product_name: product.clone(),
            count: 10,
        };
        let result = remix::create(&pool, &fixture::settings(), &user(&owner), SCOPED, &request)
            .await
            .unwrap();
        assert_eq!(result.items.len(), 10);
        for item in &result.items {
            assert_eq!(item.segments.len(), 2);
            let qualified = item
                .segments
                .iter()
                .filter(|s| s.spend_class.as_deref() == Some("qualified"))
                .count();
            assert!(qualified >= 1 && item.segments.len() - qualified <= 2);
            let ids: Vec<_> = item.segments.iter().map(|s| s.segment_id).collect();
            assert!(combinations.insert(ids));
        }
        batches.push(result.batch.batch_id);
    }
    assert_eq!(combinations.len(), 20);
    sqlx::query("UPDATE cloud_video.spend_by_day SET spend = 0 WHERE video_id IN (SELECT video_id FROM cloud_video.videos WHERE asset_id = ANY($1))")
        .bind(&assets).execute(&pool).await.unwrap();
    for batch in batches {
        let rows: Vec<serde_json::Value> = sqlx::query_scalar(
            "SELECT segments FROM ads.content_remix_batch_runs WHERE batch_id = $1",
        )
        .bind(batch)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(rows.len(), 10);
        for segments in rows {
            assert!(segments
                .as_array()
                .unwrap()
                .iter()
                .any(|s| s["spendClass"] == "qualified" && s["spend30d"] == 5000.0));
        }
    }
}
