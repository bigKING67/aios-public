//! Actual captioned Worker render must retain output but not bypass quality gating.
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use sqlx::Row;

pub(super) async fn exercise(
    state: &AppState,
    client: &Client,
    url: &str,
    token: &str,
    adopted: &Value,
) {
    let produced: Value = client
        .post(format!("{url}/produce"))
        .bearer_auth(token)
        .json(
            &json!({"expectedVersion":adopted["run"]["version"],"expectedPlanRevision":2,
            "expectedProjectRevision":adopted["run"]["projectRevision"]}),
        )
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
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
    assert_eq!(worker["status"], "completed", "{worker}");
    let after: Value = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(after["run"]["status"], "waiting");
    assert_eq!(after["run"]["waitingReason"], "caption_quality_pending");
    let result: Value = client
        .get(format!("{url}/result"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(result["ready"], false);
    assert!(result["playbackUrl"].is_null());
    let job_id = produced["run"]["renderJobId"].as_str().unwrap();
    let row = sqlx::query(
        "SELECT receipt,output_object_key FROM ads.content_production_jobs WHERE job_id=$1::uuid",
    )
    .bind(job_id)
    .fetch_one(&state.pool)
    .await
    .unwrap();
    let receipt: Value = row.get("receipt");
    assert_eq!(
        receipt["caption_quality"]["schema"],
        "aios.caption-quality.v3"
    );
    assert_eq!(
        receipt["caption_quality"]["repair"]["policy"],
        "asr-boundary-repair-v1"
    );
    assert_eq!(receipt["caption_quality"]["captionCount"], 1);
    assert_eq!(receipt["caption_quality"]["status"], "unverified");
    assert_eq!(receipt["host_inspection"]["status"], "passed");
    assert!(row.get::<Option<String>, _>("output_object_key").is_some());
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(root.join("caption-render-http.json"), serde_json::to_vec_pretty(&json!({
        "renderCompleted":true,"outputRetained":true,"runWaitingReason":after["run"]["waitingReason"],
        "deliveryReady":false,"captionQuality":receipt["caption_quality"],"inspection":receipt["host_inspection"]
    })).unwrap()).unwrap();
    super::caption_candidate_http_fixture::exercise(state, client, url, token, &after, receipt)
        .await;
}
