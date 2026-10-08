use crate::{marketing::content_assets::delivery::build_object_read_url, state::AppState};
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::path::Path;

pub(super) async fn exercise(
    state: &AppState,
    client: &Client,
    url: &str,
    token: &str,
    adopted: &Value,
    root: &Path,
) {
    let run = &adopted["run"];
    let produced: Value = client
        .post(format!("{url}/produce"))
        .bearer_auth(token)
        .json(&json!({
        "expectedVersion":run["version"],"expectedPlanRevision":run["planRevision"],
        "expectedProjectRevision":run["projectRevision"]}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let output =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .args(["-m", "content_production.worker", "--once"])
            .output()
            .await
            .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let output: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(output["status"], "completed", "{output}");
    let row = sqlx::query(
        "SELECT receipt,output_object_key FROM ads.content_production_jobs WHERE job_id=$1::uuid",
    )
    .bind(produced["run"]["renderJobId"].as_str().unwrap())
    .fetch_one(&state.pool)
    .await
    .unwrap();
    let receipt: Value = row.get("receipt");
    assert_eq!(
        receipt["caption_quality"]["repair"]["captions"][0]["style"],
        json!({"fontHeight":0.035,"centerY":0.6875,"color":"#ffffff","strokeWidth":0.0015,"weight":900})
    );
    assert_eq!(
        receipt["caption_quality"]["repair"]["captions"][0]["text"],
        "完整\n字幕"
    );
    assert_eq!(receipt["host_caption_review"]["callsReserved"], 1);
    assert_eq!(receipt["host_caption_review"]["candidateRendered"], false);
    assert_eq!(receipt["host_inspection"]["status"], "passed");
    let key: String = row.get("output_object_key");
    let signed = build_object_read_url(&state.settings, &key).unwrap();
    let bytes = client
        .get(signed)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .await
        .unwrap();
    assert_eq!(
        format!("{:x}", Sha256::digest(&bytes)),
        receipt["output"]["sha256"].as_str().unwrap()
    );
    std::fs::write(root.join("caption-adopted-video.mp4"), bytes).unwrap();
    std::fs::write(
        root.join("caption-adopted-receipt.json"),
        serde_json::to_vec_pretty(&receipt).unwrap(),
    )
    .unwrap();
    let after: Value = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
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
    assert!(result.get("captionCandidate").is_none());
}
