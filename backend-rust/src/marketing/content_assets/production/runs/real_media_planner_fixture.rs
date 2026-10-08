//! Real planner and HTTP provider transport; saved decisions and cached caption observations.
use crate::{cors::build_cors_layer, routes::build_app, state::AppState};
use axum::{routing::post, Json, Router};
use serde_json::{json, Value};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};
use uuid::Uuid;

pub(super) async fn exercise(
    mut state: AppState,
    root: &Path,
    out: &Path,
    expected: Value,
    files: Value,
    run: Uuid,
) -> Arc<AppState> {
    let load =
        |name| serde_json::from_slice::<Value>(&std::fs::read(root.join(name)).unwrap()).unwrap();
    let plan = load("model-plan.json");
    let review = load("review-model-plan.json");
    let review_request = load("review-request.json");
    let count = Arc::new(AtomicUsize::new(0));
    let calls = count.clone();
    let output = out.to_path_buf();
    let app = Router::new().route(
        "/chat/completions",
        post(move |Json(body): Json<Value>| {
            let (expected, plan, review, review_request, calls, output) = (
                expected.clone(),
                plan.clone(),
                review.clone(),
                review_request.clone(),
                calls.clone(),
                output.clone(),
            );
            async move {
                let index = calls.fetch_add(1, Ordering::SeqCst);
                assert!(index < 2, "unexpected repair/provider call");
                let input: Value =
                    serde_json::from_str(body["messages"][1]["content"].as_str().unwrap()).unwrap();
                std::fs::write(
                    output.join(format!("provider-request-{index}.json")),
                    serde_json::to_vec_pretty(&input).unwrap(),
                )
                .unwrap();
                let answer = if index == 0 {
                    assert_eq!(body["messages"][0]["content"], expected["systemPrompt"]);
                    assert_eq!(input["brief"], expected["userPrompt"]["brief"]);
                    assert_eq!(input["narration"]["endMs"], 32000);
                    // Transcript identities belong to this DB; compare the actual words and timing.
                    let text = |v: &Value| {
                        v["transcripts"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|t| json!([t["startMs"], t["endMs"], t["text"]]))
                            .collect::<Vec<_>>()
                    };
                    assert_eq!(
                        text(&input["narration"]),
                        text(&expected["userPrompt"]["narration"])
                    );
                    assert_eq!(
                        input["candidates"].as_array().unwrap().len(),
                        expected["userPrompt"]["candidates"]
                            .as_array()
                            .unwrap()
                            .len()
                    );
                    assert_eq!(
                        input["candidates"][1]["source"],
                        expected["userPrompt"]["candidates"][1]["source"]
                    );
                    assert_eq!(input["slots"], expected["userPrompt"]["slots"]);
                    plan
                } else {
                    assert_eq!(
                        body["messages"][0]["content"],
                        review_request["systemPrompt"]
                    );
                    assert_eq!(input["windows"].as_array().unwrap().len(), 1);
                    let observations = |v: &Value| {
                        v["windows"][0]["visibleText"]["observations"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|o| o["text"].clone())
                            .collect::<Vec<_>>()
                    };
                    assert_eq!(
                        observations(&input),
                        observations(&review_request["userPrompt"])
                    );
                    let mut review = review;
                    review["checks"][0]["clipId"] = input["windows"][0]["clipId"].clone();
                    review
                };
                Json(json!({"choices":[{"message":{"content":answer.to_string()}}]}))
            }
        }),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    // The browser readback server may already hold the original fixture settings.
    // Keep provider overrides local to this planner fixture.
    let settings = Arc::make_mut(&mut state.settings);
    settings.llm_default_provider = "deepseek".into();
    settings.llm_default_model = "deepseek-chat".into();
    settings.deepseek_base_url = format!("http://{}", listener.local_addr().unwrap());
    settings.deepseek_api_key = "local-fixture-only".into();
    settings.deepseek_model = "deepseek-chat".into();
    let model_server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let state = Arc::new(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!(
        "http://{}/v1/marketing/content-assets/production",
        listener.local_addr().unwrap()
    );
    let app = build_app(state.clone(), build_cors_layer(&state.settings).unwrap());
    let api_server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    assert!(super::planner::step(&state).await.unwrap());
    let pending:Option<(Uuid,String)>=sqlx::query_as("SELECT job_id,input_object_key FROM ads.marketing_content_asset_processing_jobs WHERE metadata->'caption_request'->>'runId'=$1 AND status='queued'").bind(run.to_string()).fetch_optional(&state.pool).await.unwrap();
    let mut preflight = false;
    if let Some((_job, key)) = pending {
        preflight = true;
        assert_eq!(count.load(Ordering::SeqCst), 0);
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let python=tokio::process::Command::new(repo.join("etl/groland_postgres/.venv/bin/python"))
            .env("PYTHONPATH",repo.join("etl/groland_postgres/scripts"))
            .env("AIOS_CAPTION_BRIDGE_FIXTURE",json!({"base":base,"media":files[&key],"objectKey":key,"work":out.join("preflight"),"text":"cached observation fixture"}).to_string())
            .arg(repo.join("etl/groland_postgres/tests/content_production/caption_worker_bridge_fixture.py")).output().await.unwrap();
        assert!(
            python.status.success(),
            "{}",
            String::from_utf8_lossy(&python.stderr)
        );
        sqlx::query("UPDATE ads.content_production_plan_attempts SET expires_at=clock_timestamp() WHERE run_id=$1 AND status='queued'").bind(run).execute(&state.pool).await.unwrap();
        assert!(super::planner::step(&state).await.unwrap());
    }
    let detail = super::repository::get(&state.pool, "90000001", run)
        .await
        .unwrap();
    assert_eq!(
        detail.stage, "production",
        "status={} reason={:?}",
        detail.status, detail.waiting_reason
    );
    assert_eq!(count.load(Ordering::SeqCst), 2);
    assert!(!super::planner::step(&state).await.unwrap());
    std::fs::write(out.join("planner.json"),serde_json::to_vec_pretty(&json!({"plannerStep":true,"providerHTTPCalls":2,"paidCalls":0,"preflightWorker":preflight,"preflightObservations":"fixture, not real recognition","idleAfterPlanning":true})).unwrap()).unwrap();
    api_server.abort();
    model_server.abort();
    state
}
