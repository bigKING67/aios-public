//! Current-result readback rejects stale or forged visual observations.
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub(super) async fn exercise(
    state: &AppState,
    client: &Client,
    url: &str,
    token: &str,
    run: &Value,
    receipt: &Value,
    name: &str,
) {
    let endpoint = format!("{url}/result");
    let result: Value = client
        .get(&endpoint)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let diagnostic_root =
        std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(
        diagnostic_root.join(format!("{name}-visual-receipt.json")),
        serde_json::to_vec_pretty(&receipt["host_visual_review"]).unwrap(),
    )
    .unwrap();
    let review = &result["visualReview"];
    assert_eq!(result["ready"], false);
    assert_eq!(review["status"], "reviewed");
    assert_eq!(review["deliveryApproved"], false);
    assert_eq!(review["callsReserved"], 1);
    assert_eq!(review["entries"][0]["captionEvidence"]["sampleCount"], 1);
    assert_eq!(
        review["identity"]["projectRevision"],
        run["run"]["projectRevision"]
    );
    assert_eq!(review["identity"]["jobId"], run["run"]["renderJobId"]);
    assert_eq!(
        review["entries"][0]["status"],
        if name.ends_with("restored") {
            "issues_found"
        } else {
            "no_issues_reported"
        }
    );
    assert_eq!(
        review["entries"][0]["nextActions"],
        if name.ends_with("restored") {
            json!(["revise_subtitles"])
        } else {
            json!(["await_product_quality_evidence"])
        }
    );
    for case in [
        "revision",
        "video",
        "request",
        "approval",
        "reservation",
        "reservation_shape",
        "checks",
        "action",
        "response",
        "extra",
        "detail_hash",
        "detail_frame",
        "detail_words",
        "detail_missing",
    ] {
        let mut bad = receipt.clone();
        let report = &mut bad["host_visual_review"];
        match case {
            "revision" => report["identity"]["projectRevision"] = json!(0),
            "video" => report["identity"]["videoSha256"] = json!("f".repeat(64)),
            "request" => report["entries"][0]["requestSha256"] = json!("f".repeat(64)),
            "approval" => report["deliveryApproved"] = json!(true),
            "reservation" => bad["host_visual_calls"] = json!({}),
            "reservation_shape" => bad["host_visual_calls"] = json!([]),
            "checks" => report["entries"][0]["checks"][0]["endFrame"] = json!(999),
            "action" => report["entries"][0]["nextActions"] = json!(["approve"]),
            "response" => report["entries"][0]["responseSha256"] = json!("f".repeat(64)),
            "detail_hash" => report["entries"][0]["captionEvidenceSha256"] = json!("f".repeat(64)),
            "detail_frame" => {
                report["entries"][0]["captionEvidence"]["samples"][0]["relativeFrame"] = json!(999)
            }
            "detail_words" => {
                report["entries"][0]["captionEvidence"]["samples"][0]["expectedText"] =
                    json!("other")
            }
            "detail_missing" => {
                report["entries"][0]
                    .as_object_mut()
                    .unwrap()
                    .remove("captionEvidence");
            }
            "extra" => report["entries"][0]["checks"][0]["secret"] = json!("must-not-expose"),
            _ => unreachable!(),
        }
        if ["detail_frame", "detail_words"].contains(&case) {
            let evidence = &bad["host_visual_review"]["entries"][0]["captionEvidence"];
            let digest = format!(
                "{:x}",
                Sha256::digest(serde_json::to_vec(evidence).unwrap())
            );
            bad["host_visual_review"]["entries"][0]["captionEvidenceSha256"] = json!(digest);
        }
        sqlx::query("UPDATE ads.content_production_jobs SET receipt=$1 WHERE job_id=$2::uuid")
            .bind(&bad)
            .bind(run["run"]["renderJobId"].as_str().unwrap())
            .execute(&state.pool)
            .await
            .unwrap();
        let rejected = client
            .get(&endpoint)
            .bearer_auth(token)
            .send()
            .await
            .unwrap();
        let status = rejected.status();
        let body = rejected.text().await.unwrap();
        assert_eq!(status.as_u16(), 409, "{case}: {body}");
        assert!(!body.contains("must-not-expose"));
    }
    let mut legacy = receipt.clone();
    legacy["host_visual_review"]["promptVersion"] = json!("source-treatment-visual-review-v1");
    let entry = legacy["host_visual_review"]["entries"][0]
        .as_object_mut()
        .unwrap();
    entry.remove("captionEvidence");
    entry.remove("captionEvidenceSha256");
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=$1 WHERE job_id=$2::uuid")
        .bind(&legacy)
        .bind(run["run"]["renderJobId"].as_str().unwrap())
        .execute(&state.pool)
        .await
        .unwrap();
    assert!(client
        .get(&endpoint)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .status()
        .is_success());
    let mut incomplete = receipt.clone();
    let report = &mut incomplete["host_visual_review"];
    report["status"] = json!("incomplete");
    let entry = report["entries"][0].as_object_mut().unwrap();
    entry.insert("status".into(), json!("incomplete"));
    entry.insert("errorStage".into(), json!("provider"));
    entry.remove("checks");
    entry.remove("nextActions");
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=$1 WHERE job_id=$2::uuid")
        .bind(&incomplete)
        .bind(run["run"]["renderJobId"].as_str().unwrap())
        .execute(&state.pool)
        .await
        .unwrap();
    let pending: Value = client
        .get(&endpoint)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(pending["ready"], false);
    assert_eq!(pending["visualReview"]["status"], "incomplete");
    assert_eq!(
        pending["visualReview"]["entries"][0]["failureStage"],
        "provider"
    );
    assert_eq!(
        pending["visualReview"]["entries"][0]["nextActions"],
        json!(["inspect_uncertainty"])
    );
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=$1 WHERE job_id=$2::uuid")
        .bind(receipt)
        .bind(run["run"]["renderJobId"].as_str().unwrap())
        .execute(&state.pool)
        .await
        .unwrap();
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(
        root.join(format!("{name}-visual.json")),
        serde_json::to_vec_pretty(&json!({
            "scope":"real HTTP and render; deterministic loopback model", "review":review,
            "tamperedReceiptsRejected":14,"providerFailureReadbackPending":true,"legacyReceiptReadable":true, "deliveryApproved":false
        }))
        .unwrap(),
    )
    .unwrap();
}
