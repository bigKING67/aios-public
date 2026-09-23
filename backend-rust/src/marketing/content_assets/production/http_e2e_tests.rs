//! Real HTTP/auth/SQL/worker/renderer test. The object service is loopback-only.
use super::super::handlers::qianchuan_http_route_tests::{
    access_token, fixture_settings, seed_route_fixture_schema_and_auth,
};
use crate::{cors::build_cors_layer, routes::build_app, state::AppState};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPoolOptions, Row};
use std::{path::PathBuf, sync::Arc};

const ASSET: &str = "11111111-1111-1111-1111-111111111111";

#[tokio::test]
#[ignore = "run test-content-production-e2e.sh with disposable DB, Redis and TLS object service"]
async fn real_http_worker_render_and_signed_delivery() {
    let required = |key| std::env::var(key).expect(key);
    let db = required("CONTENT_PRODUCTION_TEST_DATABASE_URL");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db)
        .await
        .unwrap();
    sqlx::raw_sql(include_str!("../../../../../etl/groland_postgres/sql/migrations/20260522_1600__create_ads_marketing_content_assets.sql")).execute(&pool).await.unwrap();
    seed_route_fixture_schema_and_auth(&pool).await;
    sqlx::raw_sql(include_str!(
        "../../../../../sql/migrations/021_content_production.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    let source = std::fs::read(required("CONTENT_PRODUCTION_TEST_SOURCE")).unwrap();
    let source_hash = format!("{:x}", Sha256::digest(&source));
    sqlx::query("INSERT INTO ads.marketing_content_assets (asset_id,title,asset_status,bucket,raw_object_key,raw_sha256,duration_seconds,repurpose_allowed,authorization_status,authorization_starts_at,authorization_expires_at) VALUES ($1::UUID,'真实素材隔离验收','ready','127','source.mp4',$2,3,TRUE,'authorized',CURRENT_DATE-1,CURRENT_DATE+1)")
        .bind(ASSET).bind(&source_hash).execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO ads.marketing_content_asset_transcripts (transcript_id,asset_id,source_object_key,status,transcript_text,segments) VALUES ($1,$2::UUID,'source.mp4','active','验收片段',$3)")
        .bind(uuid::Uuid::new_v4()).bind(ASSET).bind(json!([{"start_ms":0,"end_ms":1000,"text":"验收片段"}])).execute(&pool).await.unwrap();
    let mut settings = fixture_settings(db);
    settings.content_production_enabled = true;
    settings.content_production_shot_extraction_enabled = true;
    settings.content_production_semantics_enabled = true;
    let (model_server, model_calls) = super::planning_http_fixture::model(&mut settings).await;
    settings.dragonfly_url = required("CONTENT_PRODUCTION_TEST_REDIS_URL");
    settings.content_asset_delivery_provider = "tos_signed_url".into();
    settings.tos_bucket = "127".into();
    settings.tos_endpoint = required("TOS_ENDPOINT");
    settings.tos_region = required("TOS_REGION");
    settings.tos_access_key_id = required("TOS_ACCESS_KEY_ID");
    settings.tos_secret_access_key = required("TOS_SECRET_ACCESS_KEY");
    let redis = dragonfly_client::Client::open(settings.dragonfly_url.as_str())
        .unwrap()
        .get_multiplexed_tokio_connection()
        .await
        .unwrap();
    let settings = Arc::new(settings);
    let state = Arc::new(AppState {
        pool: pool.clone(),
        creator_library_filter_cache: Default::default(),
        dragonfly_connection: redis,
        report_build_semaphore: Arc::new(tokio::sync::Semaphore::new(1)),
        http_client: reqwest::Client::new(),
        settings: settings.clone(),
    });
    let app = build_app(state, build_cors_layer(&settings).unwrap());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!(
        "http://{}/v1/marketing/content-assets/production",
        listener.local_addr().unwrap()
    );
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let certificate =
        reqwest::Certificate::from_pem(&std::fs::read(required("REQUESTS_CA_BUNDLE")).unwrap())
            .unwrap();
    let client = reqwest::Client::builder()
        .add_root_certificate(certificate)
        .no_proxy()
        .build()
        .unwrap();
    let token = access_token();
    assert_eq!(
        client
            .get(format!("{base}/capabilities"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let capabilities: Value = client
        .get(format!("{base}/capabilities"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(capabilities["enabled"], true);
    let hits: Value = client
        .get(format!("{base}/clips"))
        .bearer_auth(&token)
        .query(&[("q", "验收")])
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(hits["items"][0]["startMs"], 0);
    assert_eq!(hits["items"][0]["endMs"], 1000);
    let original = client
        .get(hits["items"][0]["playbackUrl"].as_str().unwrap())
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .await
        .unwrap();
    assert_eq!(format!("{:x}", Sha256::digest(&original)), source_hash);
    super::planning_http_fixture::exercise(&client, &base, &token, ASSET, &model_calls).await;
    model_server.abort();
    super::visual_http_fixture::exercise(&pool, &client, &base, &token, ASSET, &source_hash).await;
    super::catalog_http_fixture::exercise(&pool, &client, &base, &token, ASSET, &source_hash).await;
    super::shot_jobs_http_fixture::exercise(&pool, &client, &base, &token, ASSET).await;
    super::semantic_http_fixture::exercise(&pool, &client, &base, &token, ASSET).await;
    let body = json!({"expectedRevision":null,"title":"真实原片双段联调","aspect":"portrait","rightsConfirmed":true,"clips":[{"id":"one","assetId":ASSET,"startMs":0,"endMs":1000,"caption":"","volume":1},{"id":"two","assetId":ASSET,"startMs":2000,"endMs":3000,"caption":"","volume":0}]});
    let created = client
        .post(format!("{base}/projects"))
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(created.status(), 200, "{}", created.text().await.unwrap());
    let project: Value = created.json().await.unwrap();
    let project_url = format!("{base}/projects/{}", project["projectId"].as_str().unwrap());
    let mut edit = body.clone();
    edit["expectedRevision"] = json!(1);
    edit["title"] = json!("保存后的版本");
    assert_eq!(
        client
            .put(&project_url)
            .bearer_auth(&token)
            .json(&edit)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        client
            .put(&project_url)
            .bearer_auth(&token)
            .json(&edit)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let request = json!({"revision":2,"preview":true});
    let job: Value = client
        .post(format!("{project_url}/renders"))
        .bearer_auth(&token)
        .json(&request)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let duplicate: Value = client
        .post(format!("{project_url}/renders"))
        .bearer_auth(&token)
        .json(&request)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(job["jobId"], duplicate["jobId"]);
    let worker = tokio::process::Command::new(required("CONTENT_PRODUCTION_TEST_PYTHON"))
        .args(["-m", "content_production.worker", "--once"])
        .output()
        .await
        .unwrap();
    assert!(worker.status.success(), "worker exited unsuccessfully");
    let worker_result: Value = serde_json::from_slice(&worker.stdout).expect("worker JSON result");
    assert_eq!(
        worker_result["status"], "completed",
        "worker: {worker_result}"
    );
    let detail: Value = client
        .get(&project_url)
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(detail["project"]["revision"], 2);
    assert_eq!(detail["jobs"][0]["status"], "completed");
    let output = client
        .get(detail["jobs"][0]["playbackUrl"].as_str().unwrap())
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .await
        .unwrap();
    let row = sqlx::query("SELECT receipt FROM ads.content_production_jobs WHERE job_id=$1::UUID")
        .bind(job["jobId"].as_str().unwrap())
        .fetch_one(&pool)
        .await
        .unwrap();
    let receipt: Value = row.get("receipt");
    assert_eq!(
        receipt["output"]["sha256"],
        format!("{:x}", Sha256::digest(&output))
    );
    assert_eq!(receipt["host_revision"], 2);
    assert_eq!(receipt["output"]["duration"], 2);
    let artifact = PathBuf::from(required("CONTENT_PRODUCTION_TEST_OUTPUT"));
    std::fs::write(artifact.join("video.mp4"), output).unwrap();
    std::fs::write(
        artifact.join("receipt.json"),
        serde_json::to_vec_pretty(&receipt).unwrap(),
    )
    .unwrap();
    // Mutate only the runner-owned source copy after enqueue: a bad source hash
    // must fail without any second object upload or completed receipt.
    let failed_job: Value = client
        .post(format!("{project_url}/renders"))
        .bearer_auth(&token)
        .json(&request)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    std::fs::write(
        required("CONTENT_PRODUCTION_TEST_SOURCE"),
        b"tampered fixture body",
    )
    .unwrap();
    let failure_worker = tokio::process::Command::new(required("CONTENT_PRODUCTION_TEST_PYTHON"))
        .args(["-m", "content_production.worker", "--once"])
        .output()
        .await
        .unwrap();
    assert!(failure_worker.status.success());
    let failed: Value = serde_json::from_slice(&failure_worker.stdout).unwrap();
    assert_eq!(failed["status"], "failed");
    let failure_row = sqlx::query("SELECT status,output_object_key,receipt FROM ads.content_production_jobs WHERE job_id=$1::UUID").bind(failed_job["jobId"].as_str().unwrap()).fetch_one(&pool).await.unwrap();
    assert_eq!(failure_row.get::<String, _>("status"), "failed");
    assert!(failure_row
        .get::<Option<String>, _>("output_object_key")
        .is_none());
    assert!(failure_row.get::<Option<Value>, _>("receipt").is_none());
    std::fs::write(required("CONTENT_PRODUCTION_TEST_SOURCE"), &source).unwrap();
    let cancelled: Value = client
        .post(format!("{project_url}/renders"))
        .bearer_auth(&token)
        .json(&request)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        client
            .post(format!(
                "{project_url}/renders/{}/cancel",
                cancelled["jobId"].as_str().unwrap()
            ))
            .bearer_auth(&token)
            .json(&json!({}))
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    let idle_worker = tokio::process::Command::new(required("CONTENT_PRODUCTION_TEST_PYTHON"))
        .args(["-m", "content_production.worker", "--once"])
        .output()
        .await
        .unwrap();
    assert!(idle_worker.status.success());
    let idle: Value = serde_json::from_slice(&idle_worker.stdout).unwrap();
    assert_eq!(idle["status"], "idle");
    // Current source authorization is rechecked even for completed historical output.
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET repurpose_allowed=FALSE WHERE asset_id=$1::UUID",
    )
    .bind(ASSET)
    .execute(&pool)
    .await
    .unwrap();
    let revoked: Value = client
        .get(&project_url)
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(revoked["jobs"]
        .as_array()
        .unwrap()
        .iter()
        .all(|job| job["playbackUrl"].is_null()));
    assert_eq!(
        client
            .post(format!("{project_url}/renders"))
            .bearer_auth(&token)
            .json(&request)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    server.abort();
}
