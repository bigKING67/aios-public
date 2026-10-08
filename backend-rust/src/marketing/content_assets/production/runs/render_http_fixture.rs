//! Automatic plan -> existing worker -> source-authorized technical delivery.
use reqwest::Client;
use serde_json::{json, Value};

pub(in crate::marketing::content_assets::production) async fn exercise(
    state: &crate::state::AppState,
    client: &Client,
    base: &str,
    token: &str,
    asset: &str,
) {
    let pool = &state.pool;
    let url = format!("{base}/runs");
    let mut input = json!({"idempotencyKey":"auto-render","title":"自动制作验收","brief":"automatic-ready","taskType":"talking_head","assetIds":[asset],"aspect":"portrait","targetSeconds":10,"rightsConfirmed":true,"modelCallConfirmed":true});
    let created: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&input)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let run_url = format!("{url}/{}", created["run"]["runId"].as_str().unwrap());
    let planned: Value = client
        .post(format!("{run_url}/plan"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":1}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(planned["run"]["stage"], "planning");
    assert!(super::planner::step(state).await.unwrap());
    let planned = super::http_fixture::poll_plan(client, &run_url, token).await;
    assert_eq!(planned["run"]["status"], "running");
    assert_eq!(planned["run"]["stage"], "production");
    assert!(planned["run"]["renderJobId"].is_string());
    assert_eq!(
        client
            .post(format!("{run_url}/produce"))
            .bearer_auth(token)
            .json(&json!({"expectedVersion":3,"expectedPlanRevision":1}))
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let planned =
        super::render_binding_http_fixture::exercise(state, client, &run_url, token, planned).await;
    let worker =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .args(["-m", "content_production.worker", "--once"])
            .output()
            .await
            .unwrap();
    assert!(
        worker.status.success(),
        "worker failed: {}",
        String::from_utf8_lossy(&worker.stderr)
    );
    let worker: Value = serde_json::from_slice(&worker.stdout).unwrap();
    assert_eq!(worker["status"], "completed", "{worker}");
    let done: Value = client
        .get(&run_url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(done["run"]["status"], "succeeded");
    let mut result: Value = client
        .get(format!("{run_url}/result"))
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
    assert_eq!(result["inspection"]["scope"], "technical");
    assert_eq!(result["inspection"]["semantic"], "unverified");
    assert_eq!(result["inspection"]["width"], 1080);
    assert_eq!(result["inspection"]["height"], 1920);
    assert_eq!(result["inspection"]["outputProfile"], "hd_1080_v1");
    let job = planned["run"]["renderJobId"].as_str().unwrap();
    let receipt: Value =
        sqlx::query_scalar("SELECT receipt FROM ads.content_production_jobs WHERE job_id=$1::UUID")
            .bind(job)
            .fetch_one(pool)
            .await
            .unwrap();
    assert_eq!(
        receipt["render_binding"],
        json!(super::super::render_binding::current())
    );
    for (field, wrong) in [
        ("width", json!(720)),
        ("outputProfile", json!("legacy_v1")),
        ("render_binding", Value::Null),
    ] {
        let mut incompatible = receipt.clone();
        if field == "render_binding" {
            incompatible[field] = wrong;
        } else {
            incompatible["host_inspection"][field] = wrong;
        }
        sqlx::query("UPDATE ads.content_production_jobs SET receipt=$2 WHERE job_id=$1::UUID")
            .bind(job)
            .bind(incompatible)
            .execute(pool)
            .await
            .unwrap();
        assert_eq!(
            client
                .get(format!("{run_url}/result"))
                .bearer_auth(token)
                .send()
                .await
                .unwrap()
                .status(),
            409
        );
    }
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=$2 WHERE job_id=$1::UUID")
        .bind(job)
        .bind(receipt)
        .execute(pool)
        .await
        .unwrap();
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
    let output = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(output.join("run-video.mp4"), video).unwrap();
    result["playbackUrl"] = Value::Null;
    std::fs::write(
        output.join("run-result.json"),
        serde_json::to_vec_pretty(&result).unwrap(),
    )
    .unwrap();
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET repurpose_allowed=FALSE WHERE asset_id=$1::UUID",
    )
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    assert_eq!(
        client
            .get(format!("{run_url}/result"))
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET repurpose_allowed=TRUE WHERE asset_id=$1::UUID",
    )
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    // Review-first holds dispatch until the exact version is explicitly approved.
    input["idempotencyKey"] = json!("review-render");
    input["reviewBeforeProduction"] = json!(true);
    let review: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&input)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let review_url = format!("{url}/{}", review["run"]["runId"].as_str().unwrap());
    let held: Value = client
        .post(format!("{review_url}/plan"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":1}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(held["run"]["stage"], "planning");
    assert!(super::planner::step(state).await.unwrap());
    let held = super::http_fixture::poll_plan(client, &review_url, token).await;
    assert_eq!(held["run"]["waitingReason"], "awaiting_plan_confirmation");
    assert!(held["run"]["renderJobId"].is_null());
    let sent: Value = client
        .post(format!("{review_url}/produce"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":3,"expectedPlanRevision":1}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(sent["run"]["status"], "running");
    let paused: Value = client
        .post(format!("{review_url}/pause"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":4}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(paused["run"]["status"], "paused");
    assert_eq!(paused["run"]["pauseRequested"], false);
    let status: String =
        sqlx::query_scalar("SELECT status FROM ads.content_production_jobs WHERE job_id=$1::UUID")
            .bind(sent["run"]["renderJobId"].as_str().unwrap())
            .fetch_one(pool)
            .await
            .unwrap();
    assert_eq!(status, "cancelled");
}
