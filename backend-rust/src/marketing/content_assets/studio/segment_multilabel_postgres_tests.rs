//! Same-span multi-label persistence, filtering and confirmation contracts.
use super::asset_summaries;
use super::postgres_tests::{asset, create, patch, pool, user, SCOPED};
use super::repository;
use super::types::{ContentSegmentListQuery, SegmentPoolQuery};
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires disposable PostgreSQL with migration 040"]
async fn same_span_labels_round_trip_filter_and_patch_without_extra_rows() {
    let db = pool().await;
    let owner_id = format!("multi-{}", Uuid::new_v4());
    let owner = user(&owner_id);
    let product = format!("multi-product-{}", Uuid::new_v4());
    let (asset_id, _) = asset(&db, Some(&owner_id), Some(60.0), Some(&product)).await;
    let mut request = create(asset_id, 1000, 5000);
    request.preset_key = "selling_point".into();
    request.label_key = "moisturizing".into();
    request.label_keys = Some(vec!["skincare".into(), "moisturizing".into()]);
    let saved = repository::create_segment(&db, &owner, SCOPED, request)
        .await
        .unwrap();
    assert_eq!(saved.label_keys, ["moisturizing", "skincare"]);
    for label in ["moisturizing", "skincare"] {
        let list = repository::list_segments(
            &db,
            ContentSegmentListQuery {
                asset_id: Some(asset_id),
                label_key: Some(label.into()),
                ..Default::default()
            },
            None,
        )
        .await
        .unwrap();
        assert_eq!(list.items.len(), 1);
        assert_eq!(list.items[0].segment_id, saved.segment_id);
    }
    let cells = asset_summaries::segment_pool(
        &db,
        SegmentPoolQuery {
            preset_key: Some("selling_point".into()),
            preset_version: Some(1),
        },
        None,
    )
    .await
    .unwrap();
    assert_eq!(
        cells
            .product_counts
            .iter()
            .find(|item| item.product_name.as_deref() == Some(&product))
            .unwrap()
            .confirmed_count,
        1
    );
    let covered: Vec<_> = cells
        .items
        .iter()
        .filter(|cell| cell.product_name.as_deref() == Some(&product))
        .collect();
    assert_eq!(covered.len(), 2);
    assert!(covered.iter().all(|cell| cell.confirmed_count == 1));
    let mut timing = patch(saved.revision);
    timing.end_ms = Some(5500);
    let saved = repository::update_segment(&db, &owner, SCOPED, saved.segment_id, timing)
        .await
        .unwrap();
    assert_eq!(
        saved.label_keys,
        ["moisturizing", "skincare"],
        "time-only edits retain all labels"
    );
    for keys in [
        vec![],
        vec!["moisturizing", "unknown"],
        vec!["skincare"],
        vec!["moisturizing", "moisturizing"],
    ] {
        let mut bad = patch(saved.revision);
        bad.label_keys = Some(keys.into_iter().map(str::to_owned).collect());
        assert!(
            repository::update_segment(&db, &owner, SCOPED, saved.segment_id, bad)
                .await
                .is_err()
        );
    }
    let mut remove = patch(saved.revision);
    remove.label_keys = Some(vec!["moisturizing".into()]);
    let updated = repository::update_segment(&db, &owner, SCOPED, saved.segment_id, remove)
        .await
        .unwrap();
    assert_eq!(updated.label_keys, ["moisturizing"]);
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM ads.content_segments WHERE asset_id=$1")
            .bind(asset_id)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(count, 1);
    let mut framework = create(asset_id, 10_000, 15_000);
    framework.label_keys = Some(vec!["mixed_voiceover".into(), "live_demo".into()]);
    assert!(repository::create_segment(&db, &owner, SCOPED, framework)
        .await
        .is_err());
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL with migrations 040 and 041"]
async fn secondary_label_changes_and_legacy_endorsements_invalidate_planning() {
    use super::error::ConflictCode;
    use super::remix;
    use super::remix_points_postgres_tests::{fixture, preview_request, voiceover_fallback_source};
    use super::remix_postgres_tests::{conflict_code, settings};
    use std::collections::HashSet;
    let db = pool().await;
    let f = fixture(&db).await;
    // The fallback must be a 混剪口播 frame for its points to count.
    voiceover_fallback_source(&db, &f).await;
    let owner = user(&f.owner);
    let n = remix::normalize(&preview_request(&f, 10), 10).unwrap();
    let mut conn = db.acquire().await.unwrap();
    let plan = remix::build_plan(
        &db,
        &settings(),
        &mut conn,
        &owner,
        SCOPED,
        &n,
        &HashSet::new(),
    )
    .await
    .unwrap();
    let part = plan
        .runs
        .iter()
        .flat_map(|r| &r.clips)
        .flat_map(|c| &c.parts)
        .find(|p| p.preset_key == "selling_point")
        .unwrap();
    sqlx::query("UPDATE ads.content_segments SET additional_label_keys=ARRAY['no_caking'] WHERE segment_id=$1")
        .bind(part.segment_id).execute(&db).await.unwrap();
    assert_eq!(
        conflict_code(remix::lock_segments(&mut conn, &plan, &n).await),
        ConflictCode::SourceChanged
    );
    sqlx::query("UPDATE ads.content_segments SET additional_label_keys='{}' WHERE segment_id=$1")
        .bind(part.segment_id)
        .execute(&db)
        .await
        .unwrap();
    let fallback = plan
        .runs
        .iter()
        .flat_map(|r| &r.clips)
        .find(|c| c.fallback)
        .unwrap();
    sqlx::query("INSERT INTO ads.content_segments (segment_id,owner_user_id,asset_id,source_content_hash,start_ms,end_ms,preset_key,preset_version,label_key,product_name,origin,status,confirmed_by,confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,'selling_point',1,'celebrity_endorsement',$7,'human','confirmed',$2,NOW())")
        .bind(Uuid::new_v4()).bind(&f.owner).bind(fallback.asset_id).bind(&fallback.source_content_hash)
        .bind(fallback.start_ms).bind(fallback.end_ms).bind(&f.product).execute(&db).await.unwrap();
    assert_eq!(
        conflict_code(remix::lock_segments(&mut conn, &plan, &n).await),
        ConflictCode::SourceChanged
    );
    // An old broad endorsement on the reference needs human reclassification.
    sqlx::query("UPDATE ads.content_segments SET label_key='celebrity_endorsement' WHERE asset_id=$1 AND preset_key='selling_point' AND label_key='moisturizing'")
        .bind(f.reference).execute(&db).await.unwrap();
    assert!(
        matches!(remix::preview(&db, &settings(), &owner, SCOPED, &preview_request(&f, 10)).await,
        Err(super::error::StudioError::App(crate::error::AppError::BadRequest(message))) if message.contains("旧范围的背书"))
    );
}
