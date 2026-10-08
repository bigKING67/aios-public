//! Prove caption plan persistence and freezing through the real isolated HTTP API.
use super::{http_fixture::poll_plan, planner};
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use uuid::Uuid;

pub(super) async fn exercise(
    state: &AppState,
    client: &Client,
    base: &str,
    token: &str,
    mut request: Value,
    source_hash: &str,
) {
    request["idempotencyKey"] = json!(Uuid::new_v4());
    request["generateCaptions"] = json!(true);
    let cache = json!({"schema":"aios.transcript-captions.v1","provenance":{"model":"fixture"},"warnings":[],
        "document":{"assetId":request["narrationAssetId"],"sourceSha256":source_hash,
        "cues":[{"id":"cached","startMs":200,"endMs":1600,"text":"缓存字幕"}]}});
    let created: Value = client
        .post(format!("{base}/runs"))
        .bearer_auth(token)
        .json(&request)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
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
    let waiting: Value = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(waiting["run"]["waitingReason"], "caption_preprocessing");
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ads.marketing_content_asset_processing_jobs WHERE metadata->>'caption_required'='true'")
        .fetch_one(&state.pool).await.unwrap();
    assert_eq!(count, 1);
    assert!(!planner::step(state).await.unwrap()); // Not eligible before the next poll.
    sqlx::query("UPDATE ads.content_production_plan_attempts SET expires_at=clock_timestamp() WHERE status='queued'")
        .execute(&state.pool).await.unwrap();
    assert!(planner::step(state).await.unwrap()); // Reuse, never enqueue a second ASR.
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ads.marketing_content_asset_processing_jobs WHERE metadata->>'caption_required'='true'")
        .fetch_one(&state.pool).await.unwrap();
    assert_eq!(count, 1);
    let waiting: Value = client
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let paused: Value = client
        .post(format!("{url}/pause"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":waiting["run"]["version"]}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(paused["run"]["status"], "paused");
    // A second Run reuses the same dependency; cancelling it cannot wake it later.
    let mut second = request.clone();
    second["idempotencyKey"] = json!(Uuid::new_v4());
    let second: Value = client
        .post(format!("{base}/runs"))
        .bearer_auth(token)
        .json(&second)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let second_url = format!("{base}/runs/{}", second["run"]["runId"].as_str().unwrap());
    client
        .post(format!("{second_url}/plan"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":1}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    assert!(planner::step(state).await.unwrap());
    let second: Value = client
        .get(&second_url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(second["run"]["waitingReason"], "caption_preprocessing");
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ads.marketing_content_asset_processing_jobs WHERE metadata->>'caption_required'='true'")
        .fetch_one(&state.pool).await.unwrap();
    assert_eq!(count, 1);
    client
        .post(format!("{second_url}/cancel"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":second["run"]["version"]}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();

    sqlx::query("UPDATE ads.marketing_content_asset_transcripts SET provider='seed_asr',metadata=COALESCE(metadata,'{}'::jsonb)||$2 WHERE asset_id=$1::uuid")
        .bind(request["narrationAssetId"].as_str().unwrap())
        .bind(json!({"source_sha256":source_hash,"caption_plan":cache,
            "word_timing":{"utterances":[{"text":"完整字幕。","words":[
                {"text":"完整","start_time":200,"end_time":850},{"text":"字幕","start_time":850,"end_time":1600}]}]}})).execute(&state.pool).await.unwrap();
    sqlx::query("UPDATE ads.content_production_plan_attempts SET expires_at=clock_timestamp() WHERE status='queued'")
        .execute(&state.pool).await.unwrap();
    assert!(!planner::step(state).await.unwrap()); // Ready ASR cannot wake a paused Run.
    client
        .post(format!("{url}/resume"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":paused["run"]["version"]}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    assert!(planner::step(state).await.unwrap());
    let planned = poll_plan(client, &url, token).await;
    assert_eq!(
        planned["plan"]["document"]["narrationCaptions"]["cues"][0]["text"],
        "缓存字幕"
    );
    let mut document = planned["plan"]["document"].clone();
    document["narrationCaptions"] = json!({
        "assetId":request["narrationAssetId"], "sourceSha256":source_hash,
        "cues":[{"id":"semantic-narration-200-1600","startMs":200,"endMs":1600,"text":"完整字幕","style":{"fontHeight":0.035,"centerY":0.6875,"color":"#ffffff","strokeWidth":0.0015,"weight":900}}]
    });
    let mut revision = json!({"expectedVersion":planned["run"]["version"],"expectedPlanRevision":1,"document":document});
    revision["document"]["narrationCaptions"]["sourceSha256"] = json!("0".repeat(64));
    assert_eq!(
        client
            .post(format!("{url}/plan-revisions"))
            .bearer_auth(token)
            .json(&revision)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    revision["document"]["narrationCaptions"]["sourceSha256"] = json!(source_hash);
    let mut invalid_style = revision.clone();
    invalid_style["document"]["narrationCaptions"]["cues"][0]["style"]["color"] =
        json!("red;display:none");
    assert_eq!(
        client
            .post(format!("{url}/plan-revisions"))
            .bearer_auth(token)
            .json(&invalid_style)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    let revised: Value = client
        .post(format!("{url}/plan-revisions"))
        .bearer_auth(token)
        .json(&revision)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(revised["plan"]["revision"], 2);
    assert_eq!(
        client
            .post(format!("{url}/plan-revisions"))
            .bearer_auth(token)
            .json(&revision)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let saved: Value = client
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
    assert_eq!(
        saved["plan"]["document"]["narrationCaptions"],
        document["narrationCaptions"]
    );
    let adopted: Value = client
        .post(format!("{url}/adopt-plan"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":revised["run"]["version"],"expectedPlanRevision":2}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let project: Value = client
        .get(format!(
            "{base}/projects/{}",
            adopted["run"]["projectId"].as_str().unwrap()
        ))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let frozen = &project["project"]["snapshot"]["editDocument"];
    assert_eq!(frozen["captions"][0]["text"], "完整字幕");
    assert_eq!(
        frozen["captions"][0]["style"],
        document["narrationCaptions"]["cues"][0]["style"]
    );
    assert_eq!(frozen["captions"][0]["stylePreset"], "source-style-v1");
    assert_eq!(frozen["captions"][0]["anchor"]["clipId"], "narration");
    assert_eq!(
        frozen["captions"][0]["anchor"]["assetVersionId"],
        format!(
            "{}-{}",
            request["narrationAssetId"].as_str().unwrap(),
            &source_hash[..16]
        )
    );
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(root.join("caption-plan-http.json"), serde_json::to_vec_pretty(&json!({
        "planRevision":2,"persisted":true,"automaticCaptionCache":true,"dependencyQueuedAndReused":true,"pausedRunNotWoken":true,"sharedDependencyAndCancelledRun":true,"staleRevisionRejected":true,"sourceMismatchRejected":true,
        "editDocument":frozen,"deliveryValidated":false
    })).unwrap()).unwrap();
    super::caption_render_fixture::exercise(state, client, &url, token, &adopted).await;
}
