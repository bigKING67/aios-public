//! 爆款视频 list covers against a disposable database: the earliest stored frame of the newest
//! analysis that has frames, kept while a re-analysis runs.
use super::competitor;
use super::competitor_auto;
use super::postgres_tests::pool;
use super::remix_postgres_tests::settings;
use serde_json::json;

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with the competitor migrations"]
async fn list_covers_come_from_the_newest_analysis_with_frames() {
    let pool = pool().await;
    let suffix = uuid::Uuid::new_v4().as_u128() % 1_000_000_000_000;
    let [covered, bare] = [format!("71{suffix:012}"), format!("72{suffix:012}")];
    for aweme_id in [&covered, &bare] {
        sqlx::query("INSERT INTO competitor.videos (aweme_id, share_url) VALUES ($1, 'https://v.douyin.com/fixture/')")
            .bind(aweme_id)
            .execute(&pool)
            .await
            .unwrap();
    }
    let frames = json!([
        { "kind": "clip", "objectKey": format!("competitor/evidence/{covered}/clip.mp4"), "startMs": 0 },
        { "kind": "frame", "objectKey": format!("competitor/evidence/{covered}/3000.jpg"), "startMs": 3000 },
        { "kind": "frame", "objectKey": format!("competitor/evidence/{covered}/1000.jpg"), "startMs": 1000 },
    ]);
    sqlx::query(
        "INSERT INTO competitor.analyses (aweme_id, status, card, source_sha256, input_manifest_hash, model_id, \
         prompt_version, taxonomy_version, evidence_objects, created_at) \
         VALUES ($1, 'succeeded', '{}'::JSONB, REPEAT('a', 64), REPEAT('b', 64), 'fixture-model', 'v1', 'v1', $2, NOW() - INTERVAL '1 day')",
    )
    .bind(&covered)
    .bind(&frames)
    .execute(&pool)
    .await
    .unwrap();
    // A newer analysis still running has no frames yet; the list keeps the last cover.
    sqlx::query("INSERT INTO competitor.analyses (aweme_id, status) VALUES ($1, 'running')")
        .bind(&covered)
        .execute(&pool)
        .await
        .unwrap();

    let listed = super::competitor_catalog::list_videos(&pool, &settings(), &Default::default())
        .await
        .unwrap();
    let find = |aweme_id: &str| {
        listed
            .items
            .iter()
            .find(|video| video.aweme_id == aweme_id)
            .unwrap()
    };
    let video = find(&covered);
    assert_eq!(video.latest_analysis.as_ref().unwrap().status, "running");
    let cover = video
        .cover_url
        .as_deref()
        .expect("cover from the earlier analysis");
    assert!(
        cover.contains(&format!("competitor/evidence/{covered}/1000.jpg")),
        "{cover}"
    );
    assert!(find(&bare).cover_url.is_none());

    for table in ["competitor.analyses", "competitor.videos"] {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "DELETE FROM {table} WHERE aweme_id = ANY($1)"
        )))
        .bind(vec![covered.clone(), bare.clone()])
        .execute(&pool)
        .await
        .unwrap();
    }
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with the competitor migrations"]
async fn only_cards_with_a_framework_structure_are_reused() {
    let pool = pool().await;
    let suffix = uuid::Uuid::new_v4().as_u128() % 1_000_000_000_000;
    let aweme_id = format!("73{suffix:012}");
    sqlx::query("INSERT INTO competitor.videos (aweme_id, share_url) VALUES ($1, 'https://v.douyin.com/fixture/')")
        .bind(&aweme_id)
        .execute(&pool)
        .await
        .unwrap();
    let insert = |card: serde_json::Value, manifest: &'static str, status: &'static str| {
        let (pool, aweme_id) = (pool.clone(), aweme_id.clone());
        async move {
            sqlx::query(
                "INSERT INTO competitor.analyses (aweme_id, status, card, source_sha256, input_manifest_hash, \
                 model_id, prompt_version, taxonomy_version, finished_at) \
                 VALUES ($1, $4, $2, REPEAT('a', 64), REPEAT($3, 64), 'fixture-model', 'v1', 'v1', NOW())",
            )
            .bind(&aweme_id)
            .bind(card)
            .bind(manifest)
            .bind(status)
            .execute(&pool)
            .await
            .unwrap();
        }
    };
    for (card, manifest, status) in [
        (json!({ "summary": "旧卡" }), "e", "succeeded"),
        (
            json!({ "framework": { "status": "unavailable" } }),
            "f",
            "succeeded",
        ),
        (
            json!({ "framework": { "status": "ok", "sellingPointError": "x" } }),
            "8",
            "succeeded",
        ),
        (
            json!({ "framework": { "status": "ok", "transcriptError": "x" } }),
            "7",
            "succeeded",
        ),
        (json!({ "framework": { "status": "ok" } }), "6", "partial"),
    ] {
        insert(card, manifest, status).await;
        assert!(competitor::finished_analysis(&pool, &aweme_id)
            .await
            .unwrap()
            .is_none());
        assert!(
            !competitor::fetch_video(&pool, None, &aweme_id)
                .await
                .unwrap()
                .latest_analysis
                .unwrap()
                .complete
        );
    }
    insert(json!({ "framework": { "status": "ok" } }), "9", "succeeded").await;
    assert!(
        competitor::fetch_video(&pool, None, &aweme_id)
            .await
            .unwrap()
            .latest_analysis
            .unwrap()
            .complete
    );
    let reused = competitor::finished_analysis(&pool, &aweme_id)
        .await
        .unwrap()
        .expect("the card with a structure");
    assert_eq!(reused.card.unwrap()["framework"]["status"], "ok");
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with the competitor and compass migrations"]
async fn auto_analysis_covers_new_imports_and_bounded_unfinished_history() {
    let pool = pool().await;
    let suffix = uuid::Uuid::new_v4().as_u128() % 1_000_000_000_000;
    let ids: Vec<String> = (1..=10).map(|k| format!("7{k:02}{suffix:012}")).collect();
    let [top, done, tried, low, unranked, active, removed, private, incomplete, late] =
        std::array::from_fn(|index| &ids[index]);
    let day = "2099-01-01";
    let scope = format!("auto_{suffix}");
    let import_id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO competitor.compass_imports (list_type, list_scope, data_date, file_name, file_sha256, row_count, room_count, video_count) \
         VALUES ('live_trade_traffic_videos', $1, $2::DATE, 'fixture.csv', REPEAT('c', 64), 10, 3, 10) RETURNING import_id",
    )
    .bind(&scope)
    .bind(day)
    .fetch_one(&pool)
    .await
    .unwrap();
    for (room, rank) in [
        ("700000000000000001", Some(3)),
        ("700000000000000002", Some(501)),
        ("700000000000000003", None),
    ] {
        sqlx::query(
            "INSERT INTO competitor.compass_live_rooms_daily (data_date, live_room_id, import_id, rank, anchor_name, list_scope) \
             VALUES ($1::DATE, $2, $3, $4, 'fixture', $5)",
        )
        .bind(day)
        .bind(room)
        .bind(import_id)
        .bind(rank)
        .bind(&scope)
        .execute(&pool)
        .await
        .unwrap();
    }
    for (aweme_id, room) in [
        (top, "700000000000000001"),
        (done, "700000000000000001"),
        (tried, "700000000000000001"),
        (low, "700000000000000002"),
        (unranked, "700000000000000003"),
        (active, "700000000000000001"),
        (removed, "700000000000000001"),
        (private, "700000000000000001"),
        (incomplete, "700000000000000001"),
        (late, "700000000000000003"),
    ] {
        sqlx::query("INSERT INTO competitor.videos (aweme_id, share_url, source) VALUES ($1, 'https://www.douyin.com/video/x', 'compass')")
            .bind(aweme_id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO competitor.compass_traffic_videos_daily (data_date, live_room_id, aweme_id, import_id, list_scope) VALUES ($1::DATE, $2, $3, $4, $5)")
            .bind(day)
            .bind(room)
            .bind(aweme_id)
            .bind(import_id)
            .bind(&scope)
            .execute(&pool)
            .await
            .unwrap();
    }
    sqlx::query(
        "INSERT INTO competitor.analyses (aweme_id, status, card, source_sha256, input_manifest_hash, model_id, prompt_version, taxonomy_version) \
         VALUES ($1, 'succeeded', '{\"framework\": {\"status\": \"ok\"}}'::JSONB, REPEAT('a', 64), REPEAT('d', 64), 'm', 'p', 't')",
    )
    .bind(done)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO competitor.analyses (aweme_id, status, error_code, requested_by) VALUES ($1, 'failed', 'provider_error', $2)")
        .bind(tried)
        .bind(competitor_auto::AUTO_REQUESTER)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO competitor.analyses (aweme_id, status) VALUES ($1, 'queued')")
        .bind(active)
        .execute(&pool)
        .await
        .unwrap();
    for (id, availability) in [(removed, "removed"), (private, "private")] {
        sqlx::query("UPDATE competitor.videos SET availability = $2 WHERE aweme_id = $1")
            .bind(id)
            .bind(availability)
            .execute(&pool)
            .await
            .unwrap();
    }
    sqlx::query("INSERT INTO competitor.analyses (aweme_id, status, card, source_sha256, input_manifest_hash, model_id, prompt_version, taxonomy_version) \
        VALUES ($1, 'succeeded', '{\"framework\": {\"status\": \"ok\", \"sellingPointError\": \"interrupted\"}}'::JSONB, REPEAT('a', 64), REPEAT('e', 64), 'm', 'p', 't')")
        .bind(incomplete)
        .execute(&pool)
        .await
        .unwrap();
    // A second room featuring the same video must not consume another queue slot.
    sqlx::query("INSERT INTO competitor.compass_traffic_videos_daily (data_date, live_room_id, aweme_id, import_id, list_scope) \
        VALUES ($1::DATE, '700000000000000002', $2, $3, $4)")
        .bind(day).bind(top).bind(import_id).bind(&scope)
        .execute(&pool).await.unwrap();
    // A newly imported old ranking remains eligible even when its data date is outside seven days.
    let old_import: uuid::Uuid = sqlx::query_scalar("INSERT INTO competitor.compass_imports \
        (list_type, list_scope, data_date, file_name, file_sha256, row_count, room_count, video_count) \
        VALUES ('live_trade_traffic_videos', $1, '2000-01-01', 'late.csv', REPEAT('f', 64), 1, 1, 1) RETURNING import_id")
        .bind(&scope).fetch_one(&pool).await.unwrap();
    sqlx::query("INSERT INTO competitor.compass_live_rooms_daily (data_date, list_scope, live_room_id, import_id, anchor_name) \
        VALUES ('2000-01-01', $1, '700000000000000003', $2, 'fixture')")
        .bind(&scope).bind(old_import).execute(&pool).await.unwrap();
    sqlx::query("UPDATE competitor.compass_traffic_videos_daily SET data_date = '2000-01-01', import_id = $3 \
        WHERE aweme_id = $1 AND list_scope = $2")
        .bind(late).bind(&scope).bind(old_import).execute(&pool).await.unwrap();
    let picked = competitor_auto::candidates(&pool, 100).await.unwrap();
    let ours: Vec<&String> = picked
        .iter()
        .map(|(id, _)| id)
        .filter(|id| ids.contains(id))
        .collect();
    assert_eq!(ours, vec![top, low, unranked, late, tried, incomplete]);
    assert!(picked.contains(&(tried.clone(), true)));
    assert!(picked.contains(&(incomplete.clone(), true)));
    let bounded = competitor_auto::candidates(&pool, 2).await.unwrap();
    assert_eq!(bounded, vec![(top.clone(), false), (low.clone(), false)]);
    sqlx::query("INSERT INTO competitor.analyses (aweme_id, status, error_code, requested_by) VALUES ($1, 'failed', 'provider_error', $2)")
        .bind(tried).bind(competitor_auto::AUTO_REPAIR_REQUESTER).execute(&pool).await.unwrap();
    sqlx::query("UPDATE competitor.analyses SET card=jsonb_set(card, '{framework,sellingPointRecovery}', '{\"exhausted\":true}'::jsonb) WHERE aweme_id=$1")
        .bind(incomplete).execute(&pool).await.unwrap();
    let after = competitor_auto::candidates(&pool, 100).await.unwrap();
    assert!(!after.iter().any(|(id, _)| id == tried || id == incomplete));
    sqlx::query("DELETE FROM competitor.compass_imports WHERE list_scope = $1")
        .bind(&scope)
        .execute(&pool)
        .await
        .unwrap();
}

#[tokio::test]
#[ignore = "requires disposable CONTENT_PRODUCTION_TEST_DATABASE_URL"]
async fn historical_auto_repair_is_fenced_even_when_both_inserts_are_terminal() {
    let pool = pool().await;
    let id = format!(
        "798{:012}",
        uuid::Uuid::new_v4().as_u128() % 1_000_000_000_000
    );
    sqlx::query("INSERT INTO competitor.videos (aweme_id, share_url) VALUES ($1, 'https://www.douyin.com/video/x')")
        .bind(&id).execute(&pool).await.unwrap();
    assert!(!competitor_auto::candidates(&pool, 100)
        .await
        .unwrap()
        .iter()
        .any(|(v, _)| v == &id));
    sqlx::query("INSERT INTO competitor.analyses (aweme_id,status,error_code,requested_by) VALUES ($1,'failed','fixture','manual-user')")
        .bind(&id).execute(&pool).await.unwrap();
    assert!(competitor_auto::candidates(&pool, 100)
        .await
        .unwrap()
        .contains(&(id.clone(), true)));
    let attempt = || {
        sqlx::query_scalar::<_, uuid::Uuid>(
        "INSERT INTO competitor.analyses (aweme_id,status,error_code,requested_by) VALUES ($1,'failed','fixture',$2) \
         ON CONFLICT DO NOTHING RETURNING analysis_id")
        .bind(&id).bind(competitor_auto::AUTO_REPAIR_REQUESTER).fetch_optional(&pool)
    };
    let (first, second) = tokio::join!(attempt(), attempt());
    assert_eq!(
        usize::from(first.unwrap().is_some()) + usize::from(second.unwrap().is_some()),
        1
    );
    let manual: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO competitor.analyses (aweme_id,status,error_code,requested_by) VALUES ($1,'failed','fixture','manual-user') RETURNING analysis_id")
        .bind(&id).fetch_one(&pool).await.unwrap();
    assert!(!manual.is_nil());
    assert!(!competitor_auto::candidates(&pool, 100)
        .await
        .unwrap()
        .iter()
        .any(|(v, _)| v == &id));
    sqlx::query("DELETE FROM competitor.analyses WHERE aweme_id=$1")
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM competitor.videos WHERE aweme_id=$1")
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();
}
