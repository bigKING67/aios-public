use crate::marketing::content_assets::handlers::qianchuan_http_route_tests::{
    access_token, fixture_settings, seed_route_fixture_schema_and_auth,
};
use crate::{cors::build_cors_layer, routes::build_app, state::AppState};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires disposable loopback PostgreSQL and Redis"]
async fn live_owner_and_queue_authorization() {
    let db = std::env::var("CONTENT_PRODUCTION_TEST_DATABASE_URL").unwrap();
    let url = reqwest::Url::parse(&db).unwrap();
    assert_eq!(url.host_str(), Some("127.0.0.1"));
    assert_eq!(url.path(), "/content_production_fixture");
    let redis_url = std::env::var("CONTENT_PRODUCTION_TEST_REDIS_URL").unwrap();
    assert_eq!(
        reqwest::Url::parse(&redis_url).unwrap().host_str(),
        Some("127.0.0.1")
    );
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db)
        .await
        .unwrap();
    seed_route_fixture_schema_and_auth(&pool).await;
    let mut settings = fixture_settings(db);
    settings.content_production_enabled = true;
    settings.content_production_runs_enabled = true;
    settings.tos_bucket = "fixture".into();
    settings.dragonfly_url = redis_url;
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
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!(
        "http://{}/v1/marketing/content-assets/production",
        listener.local_addr().unwrap()
    );
    let app = build_app(state.clone(), build_cors_layer(&settings).unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let client = reqwest::Client::builder().no_proxy().build().unwrap();
    let token = access_token();
    let asset = Uuid::new_v4();
    let sha = "a".repeat(64);
    sqlx::query("INSERT INTO ads.marketing_content_assets(asset_id,title,asset_status,bucket,raw_object_key,raw_sha256,duration_seconds) VALUES($1,'fixture','ready','fixture','source.mp4',$2,3)")
        .bind(asset).bind(&sha).execute(&pool).await.unwrap();
    let created: Value = client.post(format!("{base}/runs")).bearer_auth(&token).json(&json!({
        "idempotencyKey":Uuid::new_v4().to_string(),"title":"caption authorization","brief":"fixture",
        "taskType":"talking_head","assetIds":[asset],"aspect":"portrait","targetSeconds":10,
        "rightsConfirmed":true,"modelCallConfirmed":true})).send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
    let run = created["run"]["runId"].as_str().unwrap();
    sqlx::query("UPDATE ads.content_production_runs SET status='running' WHERE run_id=$1::uuid")
        .bind(run)
        .execute(&pool)
        .await
        .unwrap();
    let job = Uuid::new_v4();
    let claim = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.marketing_content_asset_processing_jobs(job_id,asset_id,job_type,status,attempts,max_attempts,started_at,input_object_key,metadata) VALUES($1,$2,'analysis','running',1,1,NOW(),'source.mp4',$3)")
        .bind(job).bind(asset).bind(json!({"operation":"source_caption_preflight_v1","caption_claim_token":claim,
            "caption_request":{"runId":run,"executionVersion":1,"sourceSha256":sha,"assetVersionId":format!("{asset}-{}",&sha[..16])}}))
        .execute(&pool).await.unwrap();
    let endpoint = format!("{base}/caption-preflight-jobs/{job}/authorize");
    let send = |claim: Uuid| {
        client
            .post(&endpoint)
            .bearer_auth(&token)
            .json(&json!({"claimToken":claim}))
    };
    assert_eq!(
        client
            .post(&endpoint)
            .json(&json!({"claimToken":claim}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(send(Uuid::new_v4()).send().await.unwrap().status(), 403);
    let result: Value = send(claim)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        result["sourceSnapshot"]["assets"][0]["assetId"],
        asset.to_string()
    );
    let secret = "z".repeat(43); // Fixture capability, never a real account token.
    let digest = format!("{:x}", Sha256::digest(secret.as_bytes()));
    sqlx::query("UPDATE ads.marketing_content_asset_processing_jobs SET metadata=metadata || jsonb_build_object('caption_authorization_sha256',$2::text) WHERE job_id=$1")
        .bind(job).bind(&digest).execute(&pool).await.unwrap();
    let worker_endpoint = format!("{base}/caption-preflight-jobs/{job}/authorize-worker");
    let worker = || {
        client
            .post(&worker_endpoint)
            .bearer_auth(&secret)
            .json(&json!({"claimToken":claim}))
    };
    assert_eq!(worker().send().await.unwrap().status(), 200);
    // Exercise the Python adapter against this real API, with no user JWT.
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    let payload = json!({"base":base,"job":{"job_id":job,"authorization_secret":secret,
        "metadata":{"caption_claim_token":claim}},"owner":result["ownerUserId"],"snapshot":result["sourceSnapshot"]});
    let python = tokio::task::spawn_blocking(move || {
        std::process::Command::new(root.join("etl/groland_postgres/.venv/bin/python"))
            .env("PYTHONPATH",root.join("etl/groland_postgres/scripts"))
            .env("CAPTION_PREFLIGHT_FIXTURE",payload.to_string())
            .args(["-c", "import json,os; from content_production.caption_preflight_api import WorkerPermissionClient; p=json.loads(os.environ['CAPTION_PREFLIGHT_FIXTURE']); WorkerPermissionClient(p['base']).check(p['job'],p['owner'],p['snapshot'])"])
            .output().unwrap()
    }).await.unwrap();
    assert!(
        python.status.success(),
        "Python worker permission adapter failed"
    );
    assert_eq!(
        client
            .post(&worker_endpoint)
            .bearer_auth(&token)
            .json(&json!({"claimToken":claim}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        client
            .post(&worker_endpoint)
            .bearer_auth("x".repeat(43))
            .json(&json!({"claimToken":claim}))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        client
            .post(format!(
                "{base}/caption-preflight-jobs/{}/authorize-worker",
                Uuid::new_v4()
            ))
            .bearer_auth(&secret)
            .json(&json!({"claimToken":claim}))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    for change in [
        "status='paused'",
        "status='cancelled'",
        "execution_version=2",
        "owner_user_id='other'",
    ] {
        sqlx::query(&format!(
            "UPDATE ads.content_production_runs SET {change} WHERE run_id=$1::uuid"
        ))
        .bind(run)
        .execute(&pool)
        .await
        .unwrap();
        assert_eq!(send(claim).send().await.unwrap().status(), 403);
        assert_eq!(worker().send().await.unwrap().status(), 403);
        sqlx::query("UPDATE ads.content_production_runs SET status='running',execution_version=1,owner_user_id='90000001' WHERE run_id=$1::uuid").bind(run).execute(&pool).await.unwrap();
    }
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET owner_user_id='someone-else' WHERE asset_id=$1",
    )
    .bind(asset)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(send(claim).send().await.unwrap().status(), 403);
    sqlx::query("UPDATE ads.marketing_content_assets SET owner_user_id=NULL WHERE asset_id=$1")
        .bind(asset)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE public.auth_users SET is_active=FALSE WHERE id=90000001")
        .execute(&pool)
        .await
        .unwrap();
    assert!(!send(claim).send().await.unwrap().status().is_success());
    assert_eq!(worker().send().await.unwrap().status(), 403);
    sqlx::query("UPDATE public.auth_users SET is_active=TRUE WHERE id=90000001")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE ads.marketing_content_asset_processing_jobs SET started_at=NOW()-INTERVAL '21 minutes' WHERE job_id=$1").bind(job).execute(&pool).await.unwrap();
    assert_eq!(send(claim).send().await.unwrap().status(), 403);
    assert_eq!(worker().send().await.unwrap().status(), 403);
    exercise_planning(&state, run, asset, &sha).await;
    super::caption_worker_bridge_tests::exercise(&state, &base, run).await;
    server.abort();
}

async fn exercise_planning(state: &AppState, original: &str, asset: Uuid, sha: &str) {
    use super::{caption_preflight_planning::poll, planning_queue::Claim, repository};
    let pool = &state.pool;
    let run_id = Uuid::new_v4();
    let attempt = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.content_production_runs(run_id,owner_user_id,idempotency_key,request,source_snapshot,status,active_attempt) SELECT $1,owner_user_id,$2,request,source_snapshot,'running',$3 FROM ads.content_production_runs WHERE run_id=$4::uuid")
        .bind(run_id).bind(Uuid::new_v4().to_string()).bind(attempt).bind(original).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO ads.content_production_plan_attempts(attempt_id,run_id,execution_version,input,status,expires_at) VALUES($1,$2,1,'{}','running',clock_timestamp()+INTERVAL '210 seconds')")
        .bind(attempt).bind(run_id).execute(pool).await.unwrap();
    let claim = Claim {
        owner: "90000001".into(),
        token: attempt,
        run: repository::get(pool, "90000001", run_id).await.unwrap(),
    };
    let input = json!({"runId":run_id,"executionVersion":1,"assetVersionId":format!("{asset}-{}",&sha[..16]),"sourceSha256":sha,
        "startFrame":0,"frames":60,"requiredFrames":30,"region":{"top":0.7,"bottom":0.8},"model":"fixture","maxCalls":3});
    assert!(poll(state, &claim, asset, "source.mp4", &input)
        .await
        .unwrap()
        .is_none());
    sqlx::query("UPDATE ads.content_production_plan_attempts SET status='running',expires_at=clock_timestamp()+INTERVAL '210 seconds' WHERE attempt_id=$1").bind(attempt).execute(pool).await.unwrap();
    assert!(poll(state, &claim, asset, "source.mp4", &input)
        .await
        .unwrap()
        .is_none());
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ads.marketing_content_asset_processing_jobs WHERE metadata->'caption_request'->>'runId'=$1").bind(run_id.to_string()).fetch_one(pool).await.unwrap();
    assert_eq!(count, 1);
    let mut changed = input.clone();
    changed["maxCalls"] = json!(4);
    assert!(poll(state, &claim, asset, "source.mp4", &changed)
        .await
        .is_err());
    let report = json!({"status":"needs_inspection","candidates":[],"deliveryApproved":false});
    let receipt = json!({"report":report,"reportSha256":format!("{:x}",Sha256::digest(serde_json::to_vec(&report).unwrap())),"deliveryApproved":false});
    sqlx::query("UPDATE ads.marketing_content_asset_processing_jobs SET status='succeeded',metadata=metadata || jsonb_build_object('host_caption_preflight',$2::jsonb) WHERE metadata->'caption_request'->>'runId'=$1")
        .bind(run_id.to_string()).bind(receipt).execute(pool).await.unwrap();
    assert_eq!(
        poll(state, &claim, asset, "source.mp4", &input)
            .await
            .unwrap(),
        Some(report)
    );
    assert!(poll(state, &claim, asset, "changed.mp4", &input)
        .await
        .is_err());
    sqlx::query("UPDATE ads.marketing_content_asset_processing_jobs SET status='failed' WHERE metadata->'caption_request'->>'runId'=$1").bind(run_id.to_string()).execute(pool).await.unwrap();
    assert!(poll(state, &claim, asset, "source.mp4", &input)
        .await
        .is_err());
    sqlx::query(
        "UPDATE ads.content_production_plan_attempts SET status='failed' WHERE attempt_id=$1",
    )
    .bind(attempt)
    .execute(pool)
    .await
    .unwrap();
}
