//! Existing waiting Run -> host treatment adoption -> ordinary Worker -> pending quality.
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use sqlx::Row;

pub(super) async fn exercise(
    state: &AppState,
    client: &Client,
    url: &str,
    token: &str,
    run: &Value,
) {
    let python = std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap();
    let script = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../etl/groland_postgres/tests/content_production/treatment_http_fixture.py"
    );
    let output = tokio::process::Command::new(&python)
        .args([script, run["run"]["runId"].as_str().unwrap()])
        .output()
        .await
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let adopted: Value = serde_json::from_slice(&output.stdout).unwrap();
    let output = tokio::process::Command::new(&python)
        .args(["-m", "content_production.worker", "--once"])
        .output()
        .await
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let worker: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(worker["status"], "completed");
    assert_eq!(worker["jobId"], adopted["jobId"]);
    let after: Value = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(after["run"]["runId"], run["run"]["runId"]);
    assert_eq!(after["run"]["projectRevision"], adopted["projectRevision"]);
    assert_eq!(after["run"]["waitingReason"], "caption_quality_pending");
    let result: Value = client
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
    assert_eq!(result["ready"], false);
    assert!(result["playbackUrl"].is_null());
    let row = sqlx::query(
        "SELECT output_object_key,receipt FROM ads.content_production_jobs WHERE job_id=$1::uuid",
    )
    .bind(adopted["jobId"].as_str().unwrap())
    .fetch_one(&state.pool)
    .await
    .unwrap();
    let key: String = row.get("output_object_key");
    let receipt: Value = row.get("receipt");
    let inspection_url =
        crate::marketing::content_assets::delivery::build_object_read_url(&state.settings, &key)
            .unwrap();
    let bytes = client
        .get(inspection_url)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .await
        .unwrap();
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(root.join("treated-video.mp4"), bytes).unwrap();
    std::fs::write(root.join("treatment-adoption.json"), serde_json::to_vec_pretty(&json!({
        "adoption":adopted,"worker":worker,"ready":false,"waitingReason":"caption_quality_pending",
        "inspection":receipt["host_inspection"],"sourceTextRouting":receipt["caption_quality"]["sourceTextRouting"]
    })).unwrap()).unwrap();
    super::treated_caption_http_fixture::exercise(state, client, url, token, &after).await;
}
