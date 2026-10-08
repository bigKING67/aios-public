//! Real Runs HTTP/SQL dispatch with source-bound visual observations and a loopback model.
use super::{http_fixture::poll_plan, planner};
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use uuid::Uuid;

async fn run(
    state: &AppState,
    client: &Client,
    base: &str,
    token: &str,
    asset: &str,
    brief: &str,
) -> Value {
    let created: Value = client.post(format!("{base}/runs")).bearer_auth(token)
        .json(&json!({"idempotencyKey":Uuid::new_v4().to_string(),"title":"画面证据隔离验收","brief":brief,"taskType":"montage","assetIds":[asset],"aspect":"portrait","targetSeconds":10,"rightsConfirmed":true,"modelCallConfirmed":true,"reviewBeforeProduction":true}))
        .send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
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
    assert!(planner::step(state).await.unwrap());
    poll_plan(client, &url, token).await
}

pub(in crate::marketing::content_assets::production) async fn exercise(
    state: &AppState,
    client: &Client,
    base: &str,
    token: &str,
    asset: &str,
    hash: &str,
    calls: &AtomicUsize,
) {
    let pool = &state.pool;
    let id = Uuid::new_v4();
    let job = Uuid::new_v4();
    let mut payload = json!({"inputSnapshot":{"modelInputRole":"raw","modelInputObjectKey":"source.mp4"},"analysis":{"timeline":[{"start_time":"00:00:01","end_time":"00:00:03","visual":"产品瓶身与手部展示","purpose":"产品演示用途建议"}]}});
    payload["analysis"]["video_understanding"] = json!({"visible_text":{"coverage":"partial","observations":[{"start_ms":500,"end_ms":1500,"text":"限时活动","role":"promotion","box":[0.1,0.1,0.5,0.1],"confidence":0.9}]}});
    sqlx::query("INSERT INTO ads.marketing_content_asset_video_understanding_jobs(job_id,asset_id,media_hash,storage_key,model_name,prompt_version,analysis_schema_version,input_snapshot_hash,cache_key,status) VALUES ($1,$2::uuid,$3,'source.mp4','visual-run-fixture','visual-v1','2.1','visual-snapshot','visual-cache','succeeded')")
        .bind(job).bind(asset).bind(hash).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO ads.marketing_content_asset_video_understanding_results(result_id,asset_id,media_hash,model_name,prompt_version,analysis_schema_version,input_snapshot_hash,cache_key,result_json) VALUES ($1,$2::uuid,$3,'visual-run-fixture','visual-v1','2.1','visual-snapshot','visual-cache',$4)")
        .bind(id).bind(asset).bind(hash).bind(&payload).execute(pool).await.unwrap();
    // This fixture owns the single transcript seeded by http_e2e_tests.
    sqlx::query("UPDATE ads.marketing_content_asset_transcripts SET segments='[]'::jsonb WHERE asset_id=$1::uuid")
        .bind(asset).execute(pool).await.unwrap();
    let before = calls.load(Ordering::SeqCst);
    let result = run(
        state,
        client,
        base,
        token,
        asset,
        "visual-only-fixture：使用已有画面，无需原声",
    )
    .await;
    assert_eq!(calls.load(Ordering::SeqCst), before + 1);
    assert_eq!(result["plan"]["document"]["clips"][0]["startMs"], 1000);
    assert_eq!(result["plan"]["document"]["clips"][0]["endMs"], 3000);
    assert_eq!(result["plan"]["document"]["clips"][0]["volume"], 0.0);
    assert!(result["plan"]["document"]["gaps"]
        .as_array()
        .unwrap()
        .is_empty());
    let run_id = Uuid::parse_str(result["run"]["runId"].as_str().unwrap()).unwrap();
    let receipt: Value=sqlx::query_scalar("SELECT a.result FROM ads.content_production_plans p JOIN ads.content_production_plan_attempts a ON a.attempt_id=p.attempt_id WHERE p.run_id=$1 AND p.revision=1")
        .bind(run_id).fetch_one(pool).await.unwrap();
    assert_eq!(receipt["basis"], "source-bound-evidence");
    assert_eq!(
        receipt["selected"][0]["source"]["evidence"]["analysisResultId"],
        id.to_string()
    );
    assert_eq!(
        receipt["selected"][0]["source"]["evidence"]["rawSha256"],
        hash
    );
    assert!(!receipt.to_string().contains("source.mp4"));
    assert!(!receipt.to_string().contains("transcriptId"));
    let text = &receipt["candidates"][0]["evidence"]["visibleText"];
    assert_eq!(text["status"], "model_observed");
    assert_eq!(text["observations"][0]["candidateStartMs"], 0);
    assert_eq!(text["observations"][0]["candidateEndMs"], 500);
    assert_eq!(text["erasureAuthorized"], false);
    assert_eq!(text["selectionAdvice"]["action"], "compare_alternatives");
    assert_eq!(
        text["selectionAdvice"]["candidateConflictRoles"],
        json!(["promotion"])
    );
    render_visual(client, base, token, &result, &receipt).await;

    for (path, value) in [
        (vec!["inputSnapshot", "modelInputRole"], json!("preview")),
        (
            vec!["inputSnapshot", "modelInputObjectKey"],
            json!("other.mp4"),
        ),
        (
            vec!["analysis", "timeline", "0", "end_time"],
            json!("00:00:30"),
        ),
        (vec!["analysis", "timeline", "0", "start_time"], json!("1s")),
    ] {
        sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_results SET result_json=jsonb_set($1,$2::text[],$3) WHERE result_id=$4")
            .bind(&payload).bind(path).bind(value).bind(id).execute(pool).await.unwrap();
        let value = run(state, client, base, token, asset, "visual-only-fixture").await;
        assert_eq!(value["run"]["waitingReason"], "planning_failed");
        assert!(value["plan"].is_null());
        assert_eq!(calls.load(Ordering::SeqCst), before + 1);
    }
    sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_results SET result_json=$1,media_hash='stale-hash' WHERE result_id=$2")
        .bind(&payload).bind(id).execute(pool).await.unwrap();
    assert!(run(state, client, base, token, asset, "visual-only-fixture").await["plan"].is_null());
    sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_results SET media_hash=$1 WHERE result_id=$2")
        .bind(hash).bind(id).execute(pool).await.unwrap();
    sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_jobs SET status='failed' WHERE job_id=$1")
        .bind(job).execute(pool).await.unwrap();
    assert!(run(state, client, base, token, asset, "visual-only-fixture").await["plan"].is_null());
    assert_eq!(calls.load(Ordering::SeqCst), before + 1);
    sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_jobs SET status='succeeded' WHERE job_id=$1")
        .bind(job).execute(pool).await.unwrap();
    let hallucinated = run(
        state,
        client,
        base,
        token,
        asset,
        "visual-only-fixture hallucinated",
    )
    .await;
    assert!(hallucinated["plan"].is_null());
    assert_eq!(calls.load(Ordering::SeqCst), before + 3);

    sqlx::query(
        "UPDATE ads.marketing_content_asset_transcripts SET segments=$1 WHERE asset_id=$2::uuid",
    )
    .bind(json!([{"start_ms":0,"end_ms":1000,"text":"验收片段"}]))
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_results SET media_hash='fixture-finished' WHERE result_id=$1")
        .bind(id).execute(pool).await.unwrap();
}

async fn render_visual(client: &Client, base: &str, token: &str, planned: &Value, receipt: &Value) {
    let url = format!("{base}/runs/{}", planned["run"]["runId"].as_str().unwrap());
    client
        .post(format!("{url}/produce"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":planned["run"]["version"],"expectedPlanRevision":1}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
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
    assert_eq!(worker["status"], "completed");
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
    assert_eq!(result["inspection"]["width"], 1080);
    assert_eq!(result["inspection"]["height"], 1920);
    assert_eq!(result["inspection"]["semantic"], "unverified");
    let bytes = client
        .get(result["playbackUrl"].as_str().unwrap())
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .await
        .unwrap();
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    let video = root.join("visual-evidence-video.mp4");
    std::fs::write(&video, bytes).unwrap();
    let probe = tokio::process::Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=index",
            "-of",
            "json",
        ])
        .arg(&video)
        .output()
        .await
        .unwrap();
    assert!(probe.status.success());
    let probe: Value = serde_json::from_slice(&probe.stdout).unwrap();
    let audio_streams = probe["streams"].as_array().unwrap().len();
    assert!(audio_streams <= 1);
    let mut samples = 0;
    if audio_streams == 1 {
        let audio = tokio::process::Command::new("ffmpeg")
            .args(["-v", "error", "-i"])
            .arg(&video)
            .args(["-f", "s16le", "-ac", "1", "-ar", "16000", "-"])
            .output()
            .await
            .unwrap();
        assert!(audio.status.success());
        assert!(!audio.stdout.is_empty());
        assert!(
            audio.stdout.iter().all(|byte| *byte == 0),
            "visual-only candidate leaked unanalysed source audio"
        );
        samples = audio.stdout.len() / 2;
    }
    // The existing renderer can omit an all-muted audio stream; absence and
    // decoded zero PCM both establish that unanalysed source sound did not leak.
    result["playbackUrl"] = Value::Null;
    result["audioCheck"] =
        json!({"audioStreams":audio_streams,"decodedSamples":samples,"sourceAudioAbsent":true});
    std::fs::write(
        root.join("visual-evidence-result.json"),
        serde_json::to_vec_pretty(&result).unwrap(),
    )
    .unwrap();
    std::fs::write(
        root.join("visual-evidence-plan.json"),
        serde_json::to_vec_pretty(receipt).unwrap(),
    )
    .unwrap();
}
