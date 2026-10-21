//! 类型 2 PostgreSQL: selling points only count inside 混剪口播 framework segments.
use super::postgres_tests::{pool, user, SCOPED};
use super::remix;
use super::remix_points_postgres_tests::{fixture, point, preview_request};
use super::remix_postgres_tests::settings;
use crate::error::AppError;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL"]
async fn points_outside_mixed_voiceover_are_ignored_and_a_reference_needs_one() {
    let pool = pool().await;
    let f = fixture(&pool).await;
    let owner = user(&f.owner);
    sqlx::query("UPDATE ads.content_segments SET label_key = 'long_wear' WHERE product_name = $1 AND label_key = 'skincare'")
        .bind(&f.product).execute(&pool).await.unwrap();
    let (source, hash): (Uuid, String) = sqlx::query_as("SELECT asset_id, source_content_hash FROM ads.content_segments WHERE product_name = $1 AND label_key = 'promotion' AND asset_id <> $2")
        .bind(&f.product).bind(f.reference).fetch_one(&pool).await.unwrap();
    point(
        &pool,
        (source, &hash),
        "skincare",
        (40_000, 49_000),
        &f.product,
        false,
    )
    .await;
    let reference_hash: String = sqlx::query_scalar(
        "SELECT raw_sha256 FROM ads.marketing_content_assets WHERE asset_id = $1",
    )
    .bind(f.reference)
    .fetch_one(&pool)
    .await
    .unwrap();
    // An old endorsement inside the 机制 frame does not block the reference.
    point(
        &pool,
        (f.reference, &reference_hash),
        "celebrity_endorsement",
        (24_000, 34_000),
        &f.product,
        false,
    )
    .await;
    let preview = remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 10))
        .await
        .unwrap();
    assert_eq!(preview.slots[1].selling_points.as_deref(), Some(&[][..]));
    assert!(preview.slots[1].candidate_count > 0);
    assert_eq!(
        preview.plannable_count, 0,
        "skincare inside 机制 does not supply the required point"
    );

    sqlx::query("UPDATE ads.content_segments SET label_key = 'live_demo' WHERE asset_id = $1 AND label_key = 'mixed_voiceover'")
        .bind(f.reference).execute(&pool).await.unwrap();
    assert!(
        matches!(remix::preview(&pool, &settings(), &owner, SCOPED, &preview_request(&f, 10)).await,
        Err(super::error::StudioError::App(AppError::BadRequest(message))) if message.contains("混剪口播"))
    );
}
