//! Fixed historical dates isolate all pool snapshots from other Studio fixtures.
use super::{
    postgres_tests::{pool, user, SCOPED},
    remix_postgres_tests as fixture, structure_pool,
    structure_pool_types::StructurePoolQuery,
};
use serde_json::json;
use sqlx::PgPool;

async fn snapshot(pool: &PgPool, period: &str, rows: serde_json::Value) {
    sqlx::query("INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, normalization_version, input_snapshot, source_watermark, films, families, payload) VALUES ('loose_powder', $1, 'p2-fixture', 'v1', 'v1', $1, 'fixture', 1, 1, $2)")
        .bind(period).bind(json!({"structures": {"framework": {"rows": rows}}})).execute(pool).await.unwrap();
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL"]
async fn pool_empty_competitor_fallback_and_unsupported_structures_are_independent() {
    let pool = pool().await;
    let owner = format!("pool-{}", uuid::Uuid::new_v4());
    let (asset, sha) = fixture::asset(&pool, &owner, "百雀羚香粉", "authorized").await;
    fixture::segment(
        &pool,
        (asset, &sha),
        "mixed_voiceover",
        (0, 5000),
        "百雀羚香粉",
    )
    .await;
    sqlx::query("INSERT INTO cloud_video.spend_days (stat_date, one_level_type_id, videos, total_spend) SELECT DATE '2021-02-01' - n, 73180, 1, 5000 FROM generate_series(1,31) n ON CONFLICT DO NOTHING").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO cloud_video.spend_by_day (video_id, stat_date, one_level_type_id, spend) SELECT video_id, DATE '2021-01-30', 73180, 5000 FROM cloud_video.videos WHERE asset_id = $1").bind(asset).execute(&pool).await.unwrap();
    let query = || StructurePoolQuery {
        date: Some("2021-02-01".into()),
    };
    let settings = fixture::settings();
    let user = user(&owner);
    let empty = structure_pool::preview(&pool, &settings, &user, SCOPED, query())
        .await
        .unwrap();
    assert!(!empty.pending);
    assert_eq!(empty.status, "ready");
    assert_eq!(empty.planned_count, 1);
    assert_eq!(empty.rows[0].source, "ours");
    // With a current-window film, the statistics request exists and the prior window is usable.
    sqlx::query("INSERT INTO competitor.videos (aweme_id, share_url, first_seen_at) VALUES ('7100000000000000001', 'https://example.test/pool', TIMESTAMPTZ '2021-01-31 12:00:00+08')").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO competitor.analyses (aweme_id, status, card, source_sha256, input_manifest_hash, model_id, prompt_version, taxonomy_version) VALUES ('7100000000000000001', 'succeeded', $1, REPEAT('a',64), REPEAT('b',64), 'fixture', 'v1', 'v1')")
        .bind(json!({"product":{"category":"loose_powder", "brand":"fixture"}})).execute(&pool).await.unwrap();
    snapshot(
        &pool,
        "2021-01-01..2021-01-30",
        json!([{"labels":["mixed_voiceover"],"films":1}]),
    )
    .await;
    for _ in 0..2 {
        let fallback = structure_pool::preview(&pool, &settings, &user, SCOPED, query())
            .await
            .unwrap();
        assert_eq!(fallback.status, "previous_window");
        assert!(fallback.pending);
        assert_eq!(fallback.planned_count, 1);
        assert_eq!(fallback.rows[0].source, "both");
    }
    let queued: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM competitor.stat_requests WHERE cohort='loose_powder' AND period='2021-01-02..2021-01-31'").fetch_one(&pool).await.unwrap();
    assert_eq!(queued, 1);
    let long: Vec<&str> = (0..31)
        .map(|i| {
            if i % 2 == 0 {
                "mixed_voiceover"
            } else {
                "live_demo"
            }
        })
        .collect();
    snapshot(
        &pool,
        "2021-01-02..2021-01-31",
        json!([
            {"labels":["mixed_voiceover"],"films":3},
            {"labels":["retired_label"],"films":2},
            {"labels":long,"films":1}
        ]),
    )
    .await;
    let current = structure_pool::preview(&pool, &settings, &user, SCOPED, query())
        .await
        .unwrap();
    assert_eq!(current.status, "ready");
    assert!(!current.pending);
    assert_eq!(current.planned_count, 1);
    assert_eq!(current.rows.len(), 3);
    assert_eq!(
        current
            .rows
            .iter()
            .filter(|r| r.available_combinations == 0 && r.reason.is_some())
            .count(),
        2
    );
    // Unsupported rows do not consume the cap of supported rows.
    assert!(current.rows.iter().all(|r| r.planned_count <= 30));
}
