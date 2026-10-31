//! Isolated catalogue contracts: date semantics, exact counts, multi-source dedup and metadata edits.
use super::{
    competitor_catalog, competitor_collection,
    competitor_types::{
        CompetitorVideoListQuery, CreateCompetitorVideoRequest, UpdateCompetitorVideoRequest,
    },
    postgres_tests::pool,
    remix_postgres_tests::settings,
};
use serde_json::json;

fn query(value: serde_json::Value) -> CompetitorVideoListQuery {
    serde_json::from_value(value).unwrap()
}
fn request(brand: &str) -> CreateCompetitorVideoRequest {
    CreateCompetitorVideoRequest {
        share_url: "https://www.douyin.com/video/740000000000001".into(),
        brand_name: Some(brand.into()),
        product_category: None,
        notes: Some("new note".into()),
    }
}

#[tokio::test]
#[ignore = "requires disposable competitor migrations 002-007 and compass warehouse"]
async fn catalogue_dates_pages_and_collection_contract() {
    let pool = pool().await;
    let settings = settings();
    // Fixed IDs and dates belong only to this disposable fixture; the test is serial.
    sqlx::query("INSERT INTO competitor.videos (aweme_id,share_url,brand_name,source,first_seen_at,manual_added_at)
      SELECT (740000000000000 + n)::TEXT, 'https://www.douyin.com/video/' || (740000000000000+n), 'original', 'manual',
      '2026-09-03 00:00:00+08'::TIMESTAMPTZ, '2026-09-03 00:00:00+08'::TIMESTAMPTZ FROM generate_series(1,225) n")
        .execute(&pool).await.unwrap();
    let compass = "750000000000001";
    sqlx::query("INSERT INTO competitor.videos (aweme_id,share_url,source,brand_name,first_seen_at) VALUES ($1,'https://www.douyin.com/video/750000000000001','compass','keep me','2026-09-05 00:00:00+08')")
        .bind(compass).execute(&pool).await.unwrap();
    for day in ["2026-09-01", "2026-09-02"] {
        let import: uuid::Uuid = sqlx::query_scalar("INSERT INTO competitor.compass_imports(list_type,data_date,file_name,file_sha256,row_count,room_count,video_count) VALUES ('live_trade_traffic_videos',$1::DATE,'fixture.csv',repeat('e',64),2,1,2) RETURNING import_id")
            .bind(day).fetch_one(&pool).await.unwrap();
        sqlx::query("INSERT INTO competitor.compass_live_rooms_daily(data_date,live_room_id,import_id,rank,anchor_name) VALUES($1::DATE,'760000000000001',$2,5,'fixture')")
            .bind(day).bind(import).execute(&pool).await.unwrap();
        for id in [compass, "740000000000001"] {
            sqlx::query("INSERT INTO competitor.compass_traffic_videos_daily(data_date,live_room_id,aweme_id,import_id) VALUES($1::DATE,'760000000000001',$2,$3)")
                .bind(day).bind(id).bind(import).execute(&pool).await.unwrap();
        }
    }
    let month = |source: &str, page: i64| {
        query(json!({"source":source,"unit":"month","date":"2026-09-01","page":page,"pageSize":20}))
    };
    let first = competitor_catalog::list_videos(&pool, &settings, &month("all", 1))
        .await
        .unwrap();
    assert_eq!((first.total, first.items.len()), (226, 20));
    let last = competitor_catalog::list_videos(&pool, &settings, &month("all", 12))
        .await
        .unwrap();
    assert_eq!((last.total, last.items.len(), last.page), (226, 6, 12));
    assert!(!last
        .items
        .iter()
        .any(|v| first.items.iter().any(|f| v.aweme_id == f.aweme_id)));
    let overflow = competitor_catalog::list_videos(&pool, &settings, &month("all", 999))
        .await
        .unwrap();
    assert_eq!(overflow.page, 12);
    let ranks = competitor_catalog::list_videos(&pool, &settings, &month("compass", 1))
        .await
        .unwrap();
    assert_eq!(ranks.total, 2);
    assert!(ranks
        .items
        .iter()
        .all(|v| v.ranking_days == 2 && v.best_rank == Some(5)));
    let default_month =
        competitor_catalog::list_videos(&pool, &settings, &query(json!({"source":"compass"})))
            .await
            .unwrap();
    assert_eq!(default_month.period.unwrap().from, "2026-09-01");
    assert_eq!(default_month.total, 2);
    assert_eq!(
        ranks
            .items
            .iter()
            .find(|v| v.aweme_id == "740000000000001")
            .unwrap()
            .sources,
        vec!["compass", "manual"]
    );
    let daily = query(json!({"source":"compass","unit":"day","date":"2026-09-01"}));
    let day = competitor_catalog::list_videos(&pool, &settings, &daily)
        .await
        .unwrap();
    assert_eq!(day.total, 2); // imported later, still belongs to the source date
    assert!(day.items.iter().all(|v| v.ranking_days == 1));
    let manual_day = query(json!({"source":"manual","unit":"day","date":"2026-09-01"}));
    assert_eq!(
        competitor_catalog::list_videos(&pool, &settings, &manual_day)
            .await
            .unwrap()
            .total,
        0
    );
    assert_eq!(
        competitor_catalog::list_videos(&pool, &settings, &month("manual", 1))
            .await
            .unwrap()
            .total,
        225
    );
    // Beijing midnight: 16:00 UTC is the next local day.
    sqlx::query("UPDATE competitor.videos SET manual_added_at='2026-09-02 16:00:00+00' WHERE aweme_id='740000000000225'")
        .execute(&pool).await.unwrap();
    let midnight = query(json!({"source":"manual","unit":"day","date":"2026-09-03"}));
    assert_eq!(
        competitor_catalog::list_videos(&pool, &settings, &midnight)
            .await
            .unwrap()
            .total,
        225
    );
    let custom = query(json!({"source":"all","from":"2026-09-01","to":"2026-09-02"}));
    assert_eq!(
        competitor_catalog::list_videos(&pool, &settings, &custom)
            .await
            .unwrap()
            .total,
        2
    );
    // Collection of an existing compass film records membership, preserves metadata and row count.
    let existing = competitor_collection::collect(
        &pool,
        &settings,
        "fixture",
        compass,
        "https://www.douyin.com/video/750000000000001",
        request("overwrite"),
    )
    .await
    .unwrap();
    assert_eq!(existing.add_outcome.as_deref(), Some("existing"));
    assert_eq!(existing.brand_name.as_deref(), Some("keep me"));
    assert_eq!(existing.sources, vec!["compass", "manual"]);
    let again = competitor_collection::collect(
        &pool,
        &settings,
        "fixture",
        compass,
        "https://www.douyin.com/video/750000000000001",
        request("overwrite again"),
    )
    .await
    .unwrap();
    assert_eq!(again.manual_added_at, existing.manual_added_at);
    assert_eq!(again.first_seen_at, existing.first_seen_at);
    let edited = competitor_collection::update_video(
        &pool,
        &settings,
        compass,
        UpdateCompetitorVideoRequest {
            brand_name: "edited".into(),
            product_category: "散粉".into(),
            notes: String::new(),
        },
    )
    .await
    .unwrap();
    assert_eq!(edited.brand_name.as_deref(), Some("edited"));
    assert!(edited.notes.is_none());
    // Concurrent additions create one row and report one winner; no check-then-insert race.
    let id = "770000000000001";
    let url = "https://www.douyin.com/video/770000000000001";
    let (a, b) = tokio::join!(
        competitor_collection::collect(&pool, &settings, "a", id, url, request("one")),
        competitor_collection::collect(&pool, &settings, "b", id, url, request("two"))
    );
    let a = a.unwrap();
    let b = b.unwrap();
    assert_ne!(a.add_outcome, b.add_outcome);
    assert_eq!(a.manual_added_at, b.manual_added_at);
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM competitor.videos WHERE aweme_id=$1")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    // Replaced daily files remove rank membership but preserve the historical catalogue entry.
    sqlx::query("DELETE FROM competitor.compass_imports WHERE data_date BETWEEN '2026-09-01' AND '2026-09-02'").execute(&pool).await.unwrap();
    assert_eq!(
        competitor_catalog::list_videos(&pool, &settings, &month("compass", 1))
            .await
            .unwrap()
            .total,
        0
    );
    // This one was manually collected today; September must not fabricate a historical manual event.
    assert_eq!(
        competitor_catalog::list_videos(&pool, &settings, &month("manual", 1))
            .await
            .unwrap()
            .total,
        225
    );
    sqlx::query("INSERT INTO competitor.videos (aweme_id,share_url,source,first_seen_at) VALUES ('780000000000001','https://www.douyin.com/video/780000000000001','compass','2026-09-04 00:00:00+08')")
        .execute(&pool).await.unwrap();
    let historical = competitor_catalog::list_videos(&pool, &settings, &month("all", 1))
        .await
        .unwrap();
    assert_eq!(historical.total, 226);
    let retained = historical
        .items
        .iter()
        .find(|v| v.aweme_id == "780000000000001")
        .unwrap();
    assert_eq!(retained.sources, vec!["compass"]);
    assert_eq!(retained.ranking_days, 0);
    assert_eq!(retained.relevant_date.as_deref(), Some("2026-09-04"));
    for bad in [
        json!({"from":"2026-09-01"}),
        json!({"from":"2026-09-10","to":"2026-09-01"}),
        json!({"unit":"week"}),
    ] {
        assert!(
            competitor_catalog::list_videos(&pool, &settings, &query(bad))
                .await
                .is_err()
        );
    }
}
