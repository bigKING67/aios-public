//! 爆款分析 time windows against a disposable database: a window with analysed films but no
//! snapshot is queued once for the worker, an empty one is not, and 较上一周期 counts the
//! previous calendar period. Run through `backend-rust/scripts/test-content-production-postgres.sh`.
use super::competitor_overview::{COUNTS_SELECT, SCOPED_CTE};
use super::competitor_patterns::patterns;
use super::competitor_types::CompetitorPatternsQuery;
use super::competitor_window::resolve_scope;
use super::postgres_tests::pool;
use chrono::NaiveDate;
use serde_json::json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

/// A category key of lowercase letters only, unique per test run.
fn cohort() -> String {
    Uuid::new_v4()
        .simple()
        .to_string()
        .bytes()
        .take(12)
        .map(|b| (b'a' + b % 26) as char)
        .collect()
}

/// An analysed film first seen at noon (Beijing) on `seen`.
async fn film(pool: &PgPool, cohort: &str, seen: &str, brand: &str) -> String {
    let aweme_id = format!("74{:012}", Uuid::new_v4().as_u128() % 1_000_000_000_000);
    sqlx::query(
        "INSERT INTO competitor.videos (aweme_id, share_url, first_seen_at) \
         VALUES ($1, 'https://v.douyin.com/fixture/', ($2::DATE + TIME '12:00') AT TIME ZONE 'Asia/Shanghai')",
    )
    .bind(&aweme_id)
    .bind(NaiveDate::parse_from_str(seen, "%Y-%m-%d").unwrap())
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO competitor.analyses (aweme_id, status, card, source_sha256, input_manifest_hash, model_id, \
         prompt_version, taxonomy_version) \
         VALUES ($1, 'succeeded', $2, md5($1) || md5($1), REPEAT('b', 64), 'fixture-model', 'v1', 'v1')",
    )
    .bind(&aweme_id)
    .bind(json!({ "product": { "category": cohort, "brand": brand } }))
    .execute(pool)
    .await
    .unwrap();
    aweme_id
}

fn query(cohort: &str, pairs: &[(&str, &str)]) -> CompetitorPatternsQuery {
    let mut query = CompetitorPatternsQuery {
        category: Some(cohort.into()),
        ..Default::default()
    };
    for (name, value) in pairs {
        let value = Some((*value).to_string());
        match *name {
            "unit" => query.unit = value,
            "date" => query.date = value,
            "from" => query.from = value,
            "to" => query.to = value,
            _ => unreachable!(),
        }
    }
    query
}

async fn requests(pool: &PgPool, cohort: &str) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT period FROM competitor.stat_requests WHERE cohort = $1 ORDER BY period",
    )
    .bind(cohort)
    .fetch_all(pool)
    .await
    .unwrap()
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with bql 002-004 and 006"]
async fn windows_queue_missing_snapshots_and_compare_with_the_period_before() {
    let pool = pool().await;
    let cohort = cohort();
    let films = [
        film(&pool, &cohort, "2026-09-10", "甲").await,
        film(&pool, &cohort, "2026-10-03", "甲").await,
        film(&pool, &cohort, "2026-10-24", "乙").await,
    ];

    // No unit: the month of the newest film; it has films and no snapshot, so it is queued once.
    let view = patterns(&pool, query(&cohort, &[]), None).await.unwrap();
    assert_eq!(view.period, "2026-10-01..2026-10-31");
    assert_eq!(view.window.from, "2026-10-01");
    assert_eq!(
        view.window.latest_activity_date.as_deref(),
        Some("2026-10-24")
    );
    assert!(view.pending && view.snapshot.is_none());
    patterns(&pool, query(&cohort, &[]), None).await.unwrap();
    assert_eq!(requests(&pool, &cohort).await, ["2026-10-01..2026-10-31"]);

    // A day without films answers at once: nothing to wait for, nothing queued.
    let empty = patterns(
        &pool,
        query(&cohort, &[("unit", "day"), ("date", "2026-10-10")]),
        None,
    )
    .await
    .unwrap();
    assert!(!empty.pending);
    assert_eq!(requests(&pool, &cohort).await.len(), 1);

    // A snapshot written by the worker is read back and nothing more is queued.
    sqlx::query(
        "INSERT INTO competitor.stat_snapshots (cohort, period, stats_version, taxonomy_version, \
           normalization_version, input_snapshot, source_watermark, films, families, payload) \
         VALUES ($1, '2026-09-01..2026-09-30', 's', 't', 'n', 'x', 'w', 1, 1, '{}'::JSONB)",
    )
    .bind(&cohort)
    .execute(&pool)
    .await
    .unwrap();
    let september = patterns(
        &pool,
        query(&cohort, &[("unit", "month"), ("date", "2026-09-30")]),
        None,
    )
    .await
    .unwrap();
    assert!(!september.pending && september.snapshot.is_some());

    // October against September: two films (both brands) after one.
    let scope = resolve_scope(
        &pool,
        &query(&cohort, &[("unit", "month"), ("date", "2026-10-15")]),
    )
    .await
    .unwrap();
    let (first, last) = scope.bounds().unzip();
    let (previous_first, previous_last) = scope.previous().unzip();
    let counts = sqlx::query(sqlx::AssertSqlSafe(format!("{SCOPED_CTE} {COUNTS_SELECT}")))
        .bind(&cohort)
        .bind(first)
        .bind(last)
        .bind(previous_first)
        .bind(previous_last)
        .fetch_one(&pool)
        .await
        .unwrap();
    let pair = |a: &str, b: &str| (counts.get::<i64, _>(a), counts.get::<i64, _>(b));
    assert_eq!(pair("analyzed", "brands"), (2, 2));
    assert_eq!(pair("previous_analyzed", "previous_brands"), (1, 1));

    for statement in [
        "DELETE FROM competitor.stat_requests WHERE cohort = $1",
        "DELETE FROM competitor.stat_snapshots WHERE cohort = $1",
    ] {
        sqlx::query(statement)
            .bind(&cohort)
            .execute(&pool)
            .await
            .unwrap();
    }
    for table in ["competitor.analyses", "competitor.videos"] {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "DELETE FROM {table} WHERE aweme_id = ANY($1)"
        )))
        .bind(films.to_vec())
        .execute(&pool)
        .await
        .unwrap();
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with bql 002-004, 006, 010 and 011"]
async fn our_structures_sum_cloud_spend_inside_the_window() {
    let pool = pool().await;
    let cohort = cohort();
    let tag = format!("企业:{cohort}");
    let mut assets = Vec::new();
    for _ in 0..2 {
        let (asset, sha) = super::postgres_tests::asset(&pool, None, Some(60.0), None).await;
        sqlx::query("UPDATE ads.marketing_content_assets SET tags = ARRAY[$2] WHERE asset_id = $1")
            .bind(asset)
            .bind(&tag)
            .execute(&pool)
            .await
            .unwrap();
        for (start, label) in [(0, "mixed_voiceover"), (5000, "live_demo")] {
            sqlx::query(
                "INSERT INTO ads.content_segments (segment_id, owner_user_id, asset_id, source_content_hash, \
                 start_ms, end_ms, preset_key, preset_version, label_key, origin, status, confirmed_by, confirmed_at) \
                 VALUES ($1, 'spend', $2, $3, $4, $4 + 4000, 'framework', 1, $5, 'human', 'confirmed', 'spend', NOW())",
            )
            .bind(Uuid::new_v4())
            .bind(asset)
            .bind(&sha)
            .bind(start)
            .bind(label)
            .execute(&pool)
            .await
            .unwrap();
        }
        assets.push(asset);
    }
    // The first original is held twice by the vendor; the second has no spend at all.
    let base = i64::try_from(Uuid::new_v4().as_u128() % 1_000_000_000).unwrap() * 10;
    let videos = [base, base + 1];
    for video in videos {
        sqlx::query(
            "INSERT INTO cloud_video.videos (video_id, name, video_type, url_path, outer_host, inner_host, asset_id) \
             VALUES ($1, 'v', 0, '/p/f.mp4', 'outer.example:9001', 'inner.example', $2)",
        )
        .bind(video)
        .bind(assets[0])
        .execute(&pool)
        .await
        .unwrap();
    }
    for (video, day, spend) in [
        (videos[0], "2024-02-10", 100.0),
        (videos[1], "2024-02-11", 50.0),
        (videos[0], "2024-03-01", 999.0),
    ] {
        sqlx::query(
            "INSERT INTO cloud_video.spend_by_day (video_id, stat_date, one_level_type_id, spend) \
             VALUES ($1, $2::DATE, 73180, $3::NUMERIC)",
        )
        .bind(video)
        .bind(day)
        .bind(spend)
        .execute(&pool)
        .await
        .unwrap();
    }
    for day in ["2024-02-10", "2024-02-11"] {
        sqlx::query(
            "INSERT INTO cloud_video.spend_days (stat_date, one_level_type_id, videos, total_spend) \
             VALUES ($1::DATE, 73180, 1, 1) ON CONFLICT DO NOTHING",
        )
        .bind(day)
        .execute(&pool)
        .await
        .unwrap();
    }

    let view = patterns(
        &pool,
        query(&cohort, &[("unit", "month"), ("date", "2024-02-15")]),
        Some(&tag),
    )
    .await
    .unwrap();
    let framework = &view.own_structures.framework;
    assert_eq!((framework.assets, framework.spend), (2, 150.0));
    assert_eq!(framework.rows[0].labels, ["mixed_voiceover", "live_demo"]);
    assert_eq!(
        (framework.rows[0].assets, framework.rows[0].spend),
        (2, 150.0)
    );
    assert_eq!(view.own_structures.spend_days.days, Some(29));
    assert!(view.own_structures.spend_days.synced >= 2);

    sqlx::query("DELETE FROM cloud_video.spend_by_day WHERE video_id = ANY($1)")
        .bind(videos.to_vec())
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM cloud_video.videos WHERE video_id = ANY($1)")
        .bind(videos.to_vec())
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM ads.content_segments WHERE asset_id = ANY($1)")
        .bind(&assets)
        .execute(&pool)
        .await
        .unwrap();
}
