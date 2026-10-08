//! Disposable PostgreSQL contract for AI 切段 jobs (migration 030). Run through
//! `backend-rust/scripts/test-content-production-postgres.sh`.
use super::error::StudioError;
use super::postgres_tests::{asset, pool, user, OTHER, OWNER, SCOPED};
use super::suggestions;
use super::types::{CreateSegmentSuggestionsRequest, SegmentSuggestionJobListQuery};
use crate::error::AppError;
use uuid::Uuid;

fn request(asset_ids: &[Uuid]) -> CreateSegmentSuggestionsRequest {
    CreateSegmentSuggestionsRequest {
        asset_ids: asset_ids.to_vec(),
        preset_key: "framework".into(),
        preset_version: 1,
        label_keys: None,
    }
}

fn keys(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_string()).collect()
}

const ALL_FRAMEWORK: [&str; 5] = [
    "mixed_voiceover",
    "live_demo",
    "street_interview",
    "promotion",
    "koc",
];

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migration 030"]
async fn jobs_are_reused_while_active_and_recreated_after_finishing() {
    let pool = pool().await;
    let (asset_a, sha_a) = asset(&pool, Some(OWNER), Some(60.0), Some("精华")).await;
    let (asset_b, _) = asset(&pool, Some(OWNER), None, None).await;

    let created =
        suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 5, request(&[asset_b, asset_a]))
            .await
            .unwrap();
    assert_eq!(created.items.len(), 2);
    assert!(created.reused_job_ids.is_empty());
    let job_a = created
        .items
        .iter()
        .find(|job| job.asset_id == asset_a)
        .unwrap();
    assert_eq!(job_a.status, "queued");
    assert_eq!(job_a.source_content_hash, sha_a);
    assert!(job_a.source_current);
    assert_eq!(job_a.attempt, 0);
    assert!(job_a.model.is_none() && job_a.result_summary.is_none());

    // Idempotent while queued/running: the same job comes back, even for another writer.
    let again = suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 5, request(&[asset_a]))
        .await
        .unwrap();
    assert_eq!(again.items[0].job_id, job_a.job_id);
    assert_eq!(again.reused_job_ids, vec![job_a.job_id]);

    sqlx::query("UPDATE ads.content_segment_suggestion_jobs SET status = 'running', claim_token = gen_random_uuid(), heartbeat_at = NOW(), attempt = 1 WHERE job_id = $1")
        .bind(job_a.job_id).execute(&pool).await.unwrap();
    let running = suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 5, request(&[asset_a]))
        .await
        .unwrap();
    assert_eq!(running.reused_job_ids, vec![job_a.job_id]);

    // A failed job is never retried automatically; an explicit new request creates a new job.
    sqlx::query("UPDATE ads.content_segment_suggestion_jobs SET status = 'failed', error_code = 'provider_error', finished_at = NOW() WHERE job_id = $1")
        .bind(job_a.job_id).execute(&pool).await.unwrap();
    let fresh = suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 5, request(&[asset_a]))
        .await
        .unwrap();
    assert_ne!(fresh.items[0].job_id, job_a.job_id);
    assert!(fresh.reused_job_ids.is_empty());
    assert_eq!(
        suggestions::fetch_job(&pool, job_a.job_id, None)
            .await
            .unwrap()
            .status,
        "failed"
    );

    let by_asset = suggestions::list_jobs(
        &pool,
        &user(OTHER),
        SegmentSuggestionJobListQuery {
            asset_id: Some(asset_a),
            limit: None,
        },
        None,
    )
    .await
    .unwrap();
    assert_eq!(by_asset.items.len(), 2);
    assert_eq!(by_asset.items[0].job_id, fresh.items[0].job_id);
    let own = suggestions::list_jobs(
        &pool,
        &user(OTHER),
        SegmentSuggestionJobListQuery::default(),
        None,
    )
    .await
    .unwrap();
    assert!(own.items.iter().all(|job| job.owner_user_id == OTHER));
    assert!(matches!(
        suggestions::fetch_job(&pool, Uuid::new_v4(), None).await,
        Err(StudioError::App(AppError::NotFound))
    ));
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migration 030"]
async fn creation_is_all_or_nothing_and_checks_permissions_and_presets() {
    let pool = pool().await;
    let (owned, _) = asset(&pool, Some(OWNER), Some(30.0), None).await;
    let (free, _) = asset(&pool, None, Some(30.0), None).await;
    let count = |asset_id: Uuid| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM ads.content_segment_suggestion_jobs WHERE asset_id = $1",
            )
            .bind(asset_id)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };

    // Another user cannot edit the owned asset, so neither job is written.
    assert!(matches!(
        suggestions::create_jobs(&pool, &user(OTHER), SCOPED, 5, request(&[free, owned])).await,
        Err(StudioError::App(AppError::Forbidden))
    ));
    assert_eq!(count(free).await, 0);

    let (unready, _) = asset(&pool, Some(OWNER), Some(30.0), None).await;
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET asset_status = 'uploading' WHERE asset_id = $1",
    )
    .bind(unready)
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 5, request(&[owned, unready])).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    assert_eq!(count(owned).await, 0);

    for bad in [
        CreateSegmentSuggestionsRequest {
            preset_version: 99_999,
            ..request(&[owned])
        },
        CreateSegmentSuggestionsRequest {
            preset_key: "Framework".into(),
            ..request(&[owned])
        },
        request(&[owned, owned]),
        request(&[]),
        CreateSegmentSuggestionsRequest {
            label_keys: Some(Vec::new()),
            ..request(&[owned])
        },
        CreateSegmentSuggestionsRequest {
            label_keys: Some(keys(&["live_demo", "live_demo"])),
            ..request(&[owned])
        },
        CreateSegmentSuggestionsRequest {
            label_keys: Some(keys(&["live_demo", "unknown"])),
            ..request(&[owned])
        },
    ] {
        assert!(matches!(
            suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 5, bad).await,
            Err(StudioError::App(AppError::BadRequest(_)))
        ));
    }
    assert!(matches!(
        suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 1, request(&[owned, free])).await,
        Err(StudioError::App(AppError::BadRequest(_)))
    ));
    assert_eq!(count(owned).await, 0);

    // Deleted assets hide their jobs.
    let created = suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 5, request(&[owned]))
        .await
        .unwrap();
    sqlx::query("UPDATE ads.marketing_content_assets SET is_deleted = TRUE WHERE asset_id = $1")
        .bind(owned)
        .execute(&pool)
        .await
        .unwrap();
    assert!(matches!(
        suggestions::fetch_job(&pool, created.items[0].job_id, None).await,
        Err(StudioError::App(AppError::NotFound))
    ));
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migration 030"]
async fn concurrent_requests_share_one_active_job() {
    let pool = pool().await;
    let (asset_a, _) = asset(&pool, Some(OWNER), Some(30.0), None).await;
    let (asset_b, _) = asset(&pool, Some(OWNER), Some(30.0), None).await;
    // Opposite request orders are sorted before insertion, so they cannot deadlock.
    let orders = [[asset_a, asset_b], [asset_b, asset_a]];
    let tasks: Vec<_> = (0..8)
        .map(|index| {
            let pool = pool.clone();
            let ids = orders[index % 2];
            tokio::spawn(async move {
                suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 5, request(&ids)).await
            })
        })
        .collect();
    let mut job_ids = std::collections::BTreeSet::new();
    let mut reused = 0;
    for task in tasks {
        let response = task.await.unwrap().unwrap();
        reused += response.reused_job_ids.len();
        job_ids.extend(response.items.iter().map(|job| job.job_id));
    }
    assert_eq!(job_ids.len(), 2);
    assert_eq!(reused, 14);
    let rows: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_segment_suggestion_jobs WHERE asset_id = ANY($1)",
    )
    .bind(vec![asset_a, asset_b])
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(rows, 2);
}

#[tokio::test]
#[ignore = "requires a disposable CONTENT_PRODUCTION_TEST_DATABASE_URL with migration 030"]
async fn label_subsets_are_normalized_stored_and_reported_on_reuse() {
    let pool = pool().await;
    let (asset_a, _) = asset(&pool, Some(OWNER), Some(30.0), None).await;
    let (asset_b, _) = asset(&pool, Some(OWNER), Some(30.0), None).await;
    let four = keys(&[
        "mixed_voiceover",
        "live_demo",
        "street_interview",
        "promotion",
    ]);

    // Omitted → every preset label, stored in preset order.
    let all = suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 5, request(&[asset_a]))
        .await
        .unwrap();
    assert_eq!(all.items[0].label_keys, keys(&ALL_FRAMEWORK));
    assert!(all.label_key_mismatch_job_ids.is_empty());

    // A different subset for the same active (asset, preset) reuses the job and says so.
    let subset = CreateSegmentSuggestionsRequest {
        label_keys: Some(keys(&[
            "promotion",
            "street_interview",
            "live_demo",
            "mixed_voiceover",
        ])),
        ..request(&[asset_a, asset_b])
    };
    let mixed = suggestions::create_jobs(&pool, &user(OWNER), SCOPED, 5, subset)
        .await
        .unwrap();
    let job_a = mixed
        .items
        .iter()
        .find(|job| job.asset_id == asset_a)
        .unwrap();
    let job_b = mixed
        .items
        .iter()
        .find(|job| job.asset_id == asset_b)
        .unwrap();
    assert_eq!(job_a.job_id, all.items[0].job_id);
    assert_eq!(job_a.label_keys, keys(&ALL_FRAMEWORK));
    assert_eq!(job_b.label_keys, four);
    assert_eq!(mixed.reused_job_ids, vec![job_a.job_id]);
    assert_eq!(mixed.label_key_mismatch_job_ids, vec![job_a.job_id]);

    // The same subset in another order is equal after normalization: no mismatch.
    let same = suggestions::create_jobs(
        &pool,
        &user(OWNER),
        SCOPED,
        5,
        CreateSegmentSuggestionsRequest {
            label_keys: Some(keys(&[
                "live_demo",
                "mixed_voiceover",
                "promotion",
                "street_interview",
            ])),
            ..request(&[asset_b])
        },
    )
    .await
    .unwrap();
    assert_eq!(same.reused_job_ids, vec![job_b.job_id]);
    assert!(same.label_key_mismatch_job_ids.is_empty());

    // The worker merges its call settings; the stored subset survives.
    sqlx::query("UPDATE ads.content_segment_suggestion_jobs SET request_settings = request_settings || '{\"provider\":\"mock\"}'::JSONB WHERE job_id = $1")
        .bind(job_b.job_id).execute(&pool).await.unwrap();
    assert_eq!(
        suggestions::fetch_job(&pool, job_b.job_id, None)
            .await
            .unwrap()
            .label_keys,
        four
    );

    // Jobs written before subsets existed read as the full preset label list.
    sqlx::query("UPDATE ads.content_segment_suggestion_jobs SET request_settings = '{}'::JSONB WHERE job_id = $1")
        .bind(job_a.job_id).execute(&pool).await.unwrap();
    assert_eq!(
        suggestions::fetch_job(&pool, job_a.job_id, None)
            .await
            .unwrap()
            .label_keys,
        keys(&ALL_FRAMEWORK)
    );
}
