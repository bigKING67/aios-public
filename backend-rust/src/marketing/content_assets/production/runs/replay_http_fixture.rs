//! Saved real response, isolated seeded source evidence and actual HTTP/Worker lifecycle.
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicUsize, Ordering},
};
use uuid::Uuid;

pub(in crate::marketing::content_assets::production) async fn exercise(
    state: &AppState,
    client: &Client,
    base: &str,
    token: &str,
    asset: &str,
    hash: &str,
    calls: &AtomicUsize,
) {
    let root = PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_REPLAY").unwrap());
    let load =
        |name| serde_json::from_slice::<Value>(&std::fs::read(root.join(name)).unwrap()).unwrap();
    let input = load("evidence.json");
    assert_eq!(input["sourceSha256"], hash);
    let pool = &state.pool;
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET duration_seconds=$1 WHERE asset_id=$2::uuid",
    )
    .bind(input["sourceDurationMs"].as_f64().unwrap() / 1000.0)
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    let segments: Vec<_> = input["transcripts"]
        .as_array()
        .unwrap()
        .iter()
        .map(|x| json!({"start_ms":x["startMs"],"end_ms":x["endMs"],"text":x["text"]}))
        .collect();
    sqlx::query(
        "UPDATE ads.marketing_content_asset_transcripts SET segments=$1 WHERE asset_id=$2::uuid",
    )
    .bind(json!(segments))
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    let migration=include_str!("../../../../../../etl/groland_postgres/sql/migrations/20260618_1430__add_qianchuan_all_domain_material_performance.sql");
    let start = migration
        .find("CREATE TABLE IF NOT EXISTS ads.marketing_content_asset_video_understanding_jobs")
        .unwrap();
    let end = start
        + migration[start..]
            .find("ALTER TABLE ads.marketing_content_asset_video_understanding_jobs")
            .unwrap();
    sqlx::raw_sql(&migration[start..end])
        .execute(pool)
        .await
        .unwrap();
    // Explicit fixture projection from a known local crop. This is not a production analysis ingest.
    let offset = input["sourceStartMs"].as_u64().unwrap();
    let mut text = input["visibleText"].clone();
    for o in text["observations"].as_array_mut().unwrap() {
        for key in ["start_ms", "end_ms"] {
            o[key] = json!(o[key].as_u64().unwrap() + offset);
        }
    }
    let time = |ms: u64| format!("00:{:02}:{:02}", ms / 60000, (ms / 1000) % 60);
    let timeline:Vec<_>=input["segments"].as_array().unwrap().iter().map(|s|json!({
        "start_time":time(offset+s["startMs"].as_u64().unwrap()),"end_time":time(offset+s["endMs"].as_u64().unwrap()),"visual":s["observation"],"purpose":""
    })).collect();
    let payload = json!({"inputSnapshot":{"modelInputRole":"raw","modelInputObjectKey":"source.mp4"},"analysis":{"timeline":timeline,"video_understanding":{"visible_text":text}}});
    sqlx::query("INSERT INTO ads.marketing_content_asset_video_understanding_jobs(job_id,asset_id,media_hash,storage_key,model_name,prompt_version,analysis_schema_version,input_snapshot_hash,cache_key,status) VALUES ($1,$2::uuid,$3,'source.mp4','local-replay','local-replay','2.1','snapshot','cache','succeeded')")
        .bind(Uuid::new_v4()).bind(asset).bind(hash).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO ads.marketing_content_asset_video_understanding_results(result_id,asset_id,media_hash,model_name,prompt_version,analysis_schema_version,input_snapshot_hash,cache_key,result_json) VALUES ($1,$2::uuid,$3,'local-replay','local-replay','2.1','snapshot','cache',$4)")
        .bind(Uuid::new_v4()).bind(asset).bind(hash).bind(payload).execute(pool).await.unwrap();
    let created:Value=client.post(format!("{base}/runs")).bearer_auth(token).json(&json!({
        "idempotencyKey":"real-response-replay","title":"真实复剪完整生命周期验收","brief":input["brief"],"taskType":"recut","assetIds":[asset],"aspect":"portrait","targetSeconds":10,"rightsConfirmed":true,"modelCallConfirmed":true,"reviewBeforeProduction":false
    })).send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
    let url = format!("{base}/runs/{}", created["run"]["runId"].as_str().unwrap());
    client
        .post(format!("{url}/plan"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":1}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    assert!(super::planner::step(state).await.unwrap());
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    let planned = super::http_fixture::poll_plan(client, &url, token).await;
    assert_eq!(planned["run"]["stage"], "production", "{planned}");
    let clip = &planned["plan"]["document"]["clips"][0];
    assert_eq!(clip["startMs"], 18120);
    assert_eq!(clip["endMs"], 24720);
    assert_eq!(clip["volume"], 1.0);
    assert_eq!(clip["caption"], "");
    let worker =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .args(["-m", "content_production.worker", "--once"])
            .output()
            .await
            .unwrap();
    assert!(
        worker.status.success(),
        "{}",
        String::from_utf8_lossy(&worker.stderr)
    );
    let worker: Value = serde_json::from_slice(&worker.stdout).unwrap();
    assert_eq!(worker["status"], "completed", "{worker}");
    let done: Value = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(done["run"]["status"], "succeeded", "{done}");
    let mut result: Value = client
        .get(format!("{url}/result"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(result["ready"], true);
    assert_eq!(result["inspection"]["semantic"], "unverified");
    assert_eq!(result["inspection"]["width"], 1080);
    let video = client
        .get(result["playbackUrl"].as_str().unwrap())
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .await
        .unwrap();
    result["playbackUrl"] = Value::Null;
    let output = PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(output.join("video.mp4"), video).unwrap();
    std::fs::write(
        output.join("result.json"),
        serde_json::to_vec_pretty(&result).unwrap(),
    )
    .unwrap();
    std::fs::write(
        output.join("run.json"),
        serde_json::to_vec_pretty(&done).unwrap(),
    )
    .unwrap();
    // A replay must neither re-call the model nor duplicate the completed job.
    let idle =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .args(["-m", "content_production.worker", "--once"])
            .output()
            .await
            .unwrap();
    assert!(idle.status.success());
    let idle: Value = serde_json::from_slice(&idle.stdout).unwrap();
    assert_eq!(idle["status"], "idle");
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}
