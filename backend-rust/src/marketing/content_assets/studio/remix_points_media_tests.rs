//! Opt-in real-sample planner replay. Inputs and outputs stay outside the repo.
//! Draft annotations become confirmed ONLY in the disposable fixture database;
//! this exercises planning/creation and never measures annotation accuracy.
use super::postgres_tests::{pool, user, SCOPED};
use super::remix_postgres_tests::settings;
use super::remix_types::{CreateRemixBatchRequest, RemixBatchPreviewRequest};
use super::{remix, remix_cancel};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::path::Path;
use uuid::Uuid;

#[derive(Deserialize)]
struct Sample {
    film: String,
    source: String,
    sha256: String,
    duration_ms: i32,
    frames: Vec<Annotation>,
    points: Vec<Annotation>,
}

#[derive(Deserialize)]
struct Annotation {
    start_ms: i32,
    end_ms: i32,
    label_key: String,
    #[serde(default)]
    additional_label_keys: Vec<String>,
    #[serde(default)]
    continues_previous: bool,
}

async fn seed(pool: &PgPool, sample: &Sample, id: Uuid, owner: &str, product: &str) {
    assert!(sample.duration_ms > 0 && Path::new(&sample.source).is_file());
    assert_eq!(sample.sha256.len(), 64);
    sqlx::query("INSERT INTO ads.marketing_content_assets (asset_id, title, asset_status, bucket, raw_object_key, raw_sha256, duration_seconds, product_name, owner_user_id, authorization_status) VALUES ($1, $2, 'ready', 'fixture', $3, $4, $5::NUMERIC, $6, $7, 'authorized')")
        .bind(id).bind(&sample.film).bind(format!("raw/{id}.mp4"))
        .bind(&sample.sha256).bind(f64::from(sample.duration_ms) / 1000.0)
        .bind(product).bind(owner).execute(pool).await.unwrap();
    for (preset, annotations) in [
        ("framework", &sample.frames),
        ("selling_point", &sample.points),
    ] {
        for a in annotations {
            assert!(0 <= a.start_ms && a.start_ms < a.end_ms && a.end_ms <= sample.duration_ms);
            sqlx::query("INSERT INTO ads.content_segments (segment_id, owner_user_id, asset_id, source_content_hash, source_duration_ms, start_ms, end_ms, preset_key, preset_version, label_key, product_name, origin, status, confirmed_by, confirmed_at, continues_previous, additional_label_keys) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, 'human', 'confirmed', $2, NOW(), $11, $12)")
                .bind(Uuid::new_v4()).bind(owner).bind(id).bind(&sample.sha256)
                .bind(sample.duration_ms).bind(a.start_ms).bind(a.end_ms).bind(preset)
                .bind(&a.label_key).bind(product).bind(a.continues_previous)
                .bind(&a.additional_label_keys)
                .execute(pool).await.unwrap();
        }
    }
}

#[tokio::test]
#[ignore = "requires disposable PostgreSQL, CONTENT_REMIX_MEDIA_INPUT and a new CONTENT_REMIX_MEDIA_OUTPUT path"]
async fn selling_point_local_media_acceptance() {
    // Explicitly constrain this opt-in mutating fixture to a loopback test DB.
    let url = std::env::var("CONTENT_PRODUCTION_TEST_DATABASE_URL").unwrap();
    let parsed = reqwest::Url::parse(&url).unwrap();
    assert!(matches!(parsed.host_str(), Some("127.0.0.1" | "localhost")));
    assert_eq!(parsed.path(), "/content_production_fixture");
    let input = std::env::var("CONTENT_REMIX_MEDIA_INPUT").unwrap();
    let output = std::env::var("CONTENT_REMIX_MEDIA_OUTPUT").unwrap();
    assert!(
        !Path::new(&output).exists(),
        "keep previous acceptance evidence"
    );
    let samples: Vec<Sample> = serde_json::from_slice(&std::fs::read(input).unwrap()).unwrap();
    assert!((2..=20).contains(&samples.len()));
    let pool = pool().await;
    let owner = format!("media-fixture-{}", Uuid::new_v4());
    let product = format!("isolated-media-{}", Uuid::new_v4());
    let actor = user(&owner);
    let ids: Vec<Uuid> = samples.iter().map(|_| Uuid::new_v4()).collect();
    for (sample, id) in samples.iter().zip(&ids) {
        seed(&pool, sample, *id, &owner, &product).await;
    }
    let mut results = Vec::new();
    for (sample, id) in samples.iter().zip(&ids) {
        let request = RemixBatchPreviewRequest {
            mode: Some("sellingPoint".into()),
            preset_key: "framework".into(),
            preset_version: 1,
            labels: None,
            source_asset_id: Some(*id),
            product_name: product.clone(),
            count: 3,
        };
        // A reference the planner rejects (e.g. no 混剪口播) is a result, not a crash.
        let preview = match remix::preview(&pool, &settings(), &actor, SCOPED, &request).await {
            Ok(preview) => preview,
            Err(error) => {
                results.push(json!({"film":sample.film, "error":format!("{error:?}")}));
                continue;
            }
        };
        let mut result = json!({"film":sample.film, "preview":preview});
        if preview.plannable_count > 0 {
            let detail = remix::create(
                &pool,
                &settings(),
                &actor,
                SCOPED,
                &CreateRemixBatchRequest {
                    idempotency_key: format!("media-{id}"),
                    mode: request.mode,
                    preset_key: request.preset_key,
                    preset_version: request.preset_version,
                    labels: None,
                    source_asset_id: request.source_asset_id,
                    product_name: product.clone(),
                    count: 3,
                },
            )
            .await
            .unwrap();
            assert_eq!(detail.items.len(), preview.plannable_count as usize);
            let mut snapshots = Vec::new();
            for item in &detail.items {
                let snapshot: Value = sqlx::query_scalar("SELECT v.snapshot FROM ads.content_production_runs r JOIN ads.content_production_revisions v ON v.project_id = r.project_id AND v.revision = r.project_revision WHERE r.run_id = $1")
                    .bind(item.run_id).fetch_one(&pool).await.unwrap();
                assert_eq!(
                    snapshot["clips"].as_array().unwrap().len(),
                    item.segments.len()
                );
                for (clip, segment) in snapshot["clips"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .zip(&item.segments)
                {
                    assert_eq!(clip["assetId"], segment.asset_id.to_string());
                    assert_eq!(clip["startMs"], segment.start_ms);
                    assert_eq!(clip["endMs"], segment.end_ms);
                }
                snapshots.push(json!({"runId":item.run_id,"snapshot":snapshot}));
            }
            let batch_id = detail.batch.batch_id;
            result["batch"] = serde_json::to_value(detail).unwrap();
            result["snapshots"] = json!(snapshots);
            // This fixture exports plans without a rendering worker. Settle its
            // queued jobs through the real cancel path before the next reference,
            // instead of letting >20 exports hit the production active-run limit.
            let cancelled =
                remix_cancel::cancel(&pool, &settings(), &owner, Some(&owner), batch_id)
                    .await
                    .unwrap();
            assert!(cancelled
                .items
                .iter()
                .all(|item| item.run_status == "cancelled"));
            result["fixtureCleanup"] = json!({"queuedRunsCancelled":cancelled.items.len()});
        }
        results.push(result);
    }
    let assets: Vec<Value> = samples.iter().zip(ids).map(|(s,id)| json!({
        "assetId":id,"film":s.film,"source":s.source,"sha256":s.sha256,"durationMs":s.duration_ms
    })).collect();
    let report = json!({
        "scope":"REAL_MEDIA_PLANNING_WITH_DRAFT_ANNOTATIONS",
        "annotationAccuracy":"UNVERIFIED_NO_HUMAN_GOLD",
        "productionWrites":false,"assets":assets,"results":results
    });
    std::fs::write(output, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
}
