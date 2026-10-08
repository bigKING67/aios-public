//! Disposable PostgreSQL contract for 整片素材 annotation summaries and the
//! library `segment_status` filter. Run through
//! `backend-rust/scripts/test-content-production-postgres.sh`.
use super::super::repository::query_assets;
use super::super::types::ContentAssetQuery;
use super::super::validation::normalize_query;
use super::asset_summaries;
use super::postgres_tests::{asset, create, pool, user, OWNER, SCOPED};
use super::repository;
use super::suggestions;
use super::types::{ContentSegmentListQuery, CreateSegmentSuggestionsRequest, SegmentPoolQuery};
use sqlx::PgPool;
use uuid::Uuid;

async fn titled(pool: &PgPool, id: Uuid, title: &str) {
    sqlx::query("UPDATE ads.marketing_content_assets SET title = $2 WHERE asset_id = $1")
        .bind(id)
        .bind(title)
        .execute(pool)
        .await
        .unwrap();
}

async fn filtered(pool: &PgPool, keyword: &str, status: &str) -> Vec<Uuid> {
    let query = normalize_query(ContentAssetQuery {
        keyword: Some(keyword.into()),
        segment_status: Some(status.into()),
        ..ContentAssetQuery::default()
    })
    .unwrap();
    let mut ids: Vec<Uuid> = query_assets(pool, &query)
        .await
        .unwrap()
        .into_iter()
        .map(|item| item.asset_id)
        .collect();
    ids.sort();
    ids
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migrations 029-030"]
async fn summaries_and_segment_status_filter_track_annotation_state() {
    let pool = pool().await;
    let tag = format!("summary-{}", Uuid::new_v4().simple());
    let (unlabeled, _) = asset(&pool, Some(OWNER), Some(60.0), None).await;
    let (confirmed, _) = asset(&pool, Some(OWNER), Some(60.0), None).await;
    let (suggested, _) = asset(&pool, Some(OWNER), Some(60.0), None).await;
    for id in [unlabeled, confirmed, suggested] {
        titled(&pool, id, &tag).await;
    }

    repository::create_segment(&pool, &user(OWNER), SCOPED, create(confirmed, 0, 5_000))
        .await
        .unwrap();
    let pending =
        repository::create_segment(&pool, &user(OWNER), SCOPED, create(suggested, 0, 5_000))
            .await
            .unwrap();
    sqlx::query("UPDATE ads.content_segments SET status = 'suggested', origin = 'ai', confirmed_by = NULL, confirmed_at = NULL WHERE segment_id = $1")
        .bind(pending.segment_id)
        .execute(&pool)
        .await
        .unwrap();
    // Rejected segments do not count as annotation.
    let rejected =
        repository::create_segment(&pool, &user(OWNER), SCOPED, create(unlabeled, 0, 5_000))
            .await
            .unwrap();
    sqlx::query("UPDATE ads.content_segments SET status = 'rejected', confirmed_by = NULL, confirmed_at = NULL WHERE segment_id = $1")
        .bind(rejected.segment_id)
        .execute(&pool)
        .await
        .unwrap();
    suggestions::create_jobs(
        &pool,
        &user(OWNER),
        SCOPED,
        5,
        CreateSegmentSuggestionsRequest {
            asset_ids: vec![unlabeled],
            preset_key: "framework".into(),
            preset_version: 1,
            label_keys: None,
        },
    )
    .await
    .unwrap();

    let unknown = Uuid::new_v4();
    let summary = asset_summaries::list_asset_summaries(
        &pool,
        vec![suggested, unknown, confirmed, unlabeled],
        None,
        None,
    )
    .await
    .unwrap();
    let rows: Vec<(Uuid, i64, i64, bool)> = summary
        .items
        .iter()
        .map(|item| {
            (
                item.asset_id,
                item.suggested_count,
                item.confirmed_count,
                item.suggestion_active,
            )
        })
        .collect();
    assert_eq!(
        rows,
        vec![
            (suggested, 1, 0, false),
            (unknown, 0, 0, false),
            (confirmed, 0, 1, false),
            (unlabeled, 0, 0, true),
        ]
    );

    assert_eq!(filtered(&pool, &tag, "unlabeled").await, vec![unlabeled]);

    // Preset scoping: the same assets are unlabeled for another preset.
    let framework_only = asset_summaries::list_asset_summaries(
        &pool,
        vec![suggested, confirmed],
        Some("framework".into()),
        None,
    )
    .await
    .unwrap();
    assert_eq!(
        framework_only
            .items
            .iter()
            .map(|item| (item.suggested_count, item.confirmed_count))
            .collect::<Vec<_>>(),
        [(1, 0), (0, 1)]
    );
    let picture = asset_summaries::list_asset_summaries(
        &pool,
        vec![suggested, confirmed, unlabeled],
        Some("picture".into()),
        None,
    )
    .await
    .unwrap();
    assert!(picture.items.iter().all(|item| item.suggested_count == 0
        && item.confirmed_count == 0
        && !item.suggestion_active));
    // Originals outside the configured enterprise read as zero, job state included.
    let outside = asset_summaries::list_asset_summaries(
        &pool,
        vec![suggested, confirmed, unlabeled],
        None,
        Some("企业:不存在的企业"),
    )
    .await
    .unwrap();
    assert_eq!(outside.items.len(), 3);
    assert!(outside.items.iter().all(|item| item.suggested_count == 0
        && item.confirmed_count == 0
        && !item.suggestion_active));
    let mut expected = vec![unlabeled, confirmed, suggested];
    expected.sort();
    let scoped = normalize_query(ContentAssetQuery {
        keyword: Some(tag.clone()),
        segment_status: Some("unlabeled".into()),
        segment_preset: Some("picture".into()),
        ..ContentAssetQuery::default()
    })
    .unwrap();
    let mut scoped_ids: Vec<Uuid> = query_assets(&pool, &scoped)
        .await
        .unwrap()
        .into_iter()
        .map(|item| item.asset_id)
        .collect();
    scoped_ids.sort();
    assert_eq!(scoped_ids, expected);
    assert!(normalize_query(ContentAssetQuery {
        segment_preset: Some("Bad Key".into()),
        ..ContentAssetQuery::default()
    })
    .is_err());
    assert_eq!(filtered(&pool, &tag, "confirmed").await, vec![confirmed]);
    assert_eq!(filtered(&pool, &tag, "suggested").await, vec![suggested]);
    assert!(normalize_query(ContentAssetQuery {
        segment_status: Some("bogus".into()),
        ..ContentAssetQuery::default()
    })
    .is_err());
}

async fn confirmed_with_product(
    pool: &PgPool,
    asset: Uuid,
    start_ms: i32,
    label: &str,
    product: Option<&str>,
) {
    let mut request = create(asset, start_ms, start_ms + 5_000);
    request.label_key = label.into();
    request.product_name = product.map(Into::into);
    repository::create_segment(pool, &user(OWNER), SCOPED, request)
        .await
        .unwrap();
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migration 029"]
async fn segment_pool_counts_usable_confirmed_segments_and_outputs_filter() {
    let pool = pool().await;
    let tag = format!("pool-{}", Uuid::new_v4().simple());
    let product = format!("池测试{}", &tag[5..13]);
    let (live, _) = asset(&pool, Some(OWNER), Some(60.0), None).await;
    let (other, _) = asset(&pool, Some(OWNER), Some(60.0), None).await;
    let (stale, _) = asset(&pool, Some(OWNER), Some(60.0), None).await;
    let (output, _) = asset(&pool, Some(OWNER), Some(60.0), None).await;
    for id in [live, other, stale, output] {
        titled(&pool, id, &tag).await;
    }
    confirmed_with_product(&pool, live, 0, "mixed_voiceover", Some(&product)).await;
    confirmed_with_product(&pool, other, 0, "mixed_voiceover", Some(&product)).await;
    confirmed_with_product(&pool, live, 10_000, "live_demo", None).await;
    confirmed_with_product(&pool, stale, 0, "live_demo", Some(&product)).await;
    // A changed source makes its confirmed segment unusable for remix.
    sqlx::query("UPDATE ads.marketing_content_assets SET raw_sha256 = $2 WHERE asset_id = $1")
        .bind(stale)
        .bind("f".repeat(64))
        .execute(&pool)
        .await
        .unwrap();

    let pool_response = asset_summaries::segment_pool(&pool, SegmentPoolQuery::default(), None)
        .await
        .unwrap();
    assert_eq!(
        (
            pool_response.preset_key.as_str(),
            pool_response.preset_version
        ),
        ("framework", 1)
    );
    let mine: Vec<(Option<String>, String, i64)> = pool_response
        .items
        .into_iter()
        .filter(|cell| cell.product_name.as_deref() == Some(product.as_str()))
        .map(|cell| (cell.product_name, cell.label_key, cell.confirmed_count))
        .collect();
    assert_eq!(
        mine,
        vec![(Some(product.clone()), "mixed_voiceover".into(), 2)]
    );
    let productless = repository::list_segments(
        &pool,
        ContentSegmentListQuery {
            asset_id: Some(live),
            without_product: Some(true),
            ..Default::default()
        },
        None,
    )
    .await
    .unwrap();
    assert_eq!(
        productless
            .items
            .iter()
            .map(|segment| segment.label_key.as_str())
            .collect::<Vec<_>>(),
        ["live_demo"]
    );
    assert!(asset_summaries::segment_pool(
        &pool,
        SegmentPoolQuery {
            preset_key: Some("framework".into()),
            preset_version: Some(0),
        },
        None
    )
    .await
    .is_err());

    sqlx::query("UPDATE ads.marketing_content_assets SET source_type = 'ai_studio_output' WHERE asset_id = $1")
        .bind(output)
        .execute(&pool)
        .await
        .unwrap();
    let outputs = |mode: &str| {
        normalize_query(ContentAssetQuery {
            keyword: Some(tag.clone()),
            studio_outputs: Some(mode.into()),
            ..ContentAssetQuery::default()
        })
        .unwrap()
    };
    let only: Vec<Uuid> = query_assets(&pool, &outputs("only"))
        .await
        .unwrap()
        .into_iter()
        .map(|item| item.asset_id)
        .collect();
    assert_eq!(only, vec![output]);
    let excluded = query_assets(&pool, &outputs("exclude")).await.unwrap();
    assert_eq!(excluded.len(), 3);
    assert!(excluded.iter().all(|item| item.asset_id != output));
}
