//! Read actual Worker proposals through the authenticated result route in the disposable DB.
use crate::{cors::build_cors_layer, routes::build_app, state::AppState};
use serde_json::{json, Value};
use std::path::Path;
use uuid::Uuid;

pub(super) async fn exercise(state: &AppState, run: Uuid, job: Uuid, out: &Path) {
    let mut receipt: Value =
        sqlx::query_scalar("SELECT receipt FROM ads.content_production_jobs WHERE job_id=$1")
            .bind(job)
            .fetch_one(&state.pool)
            .await
            .unwrap();
    if receipt["host_selected_semantic_review"]
        .get("followUp")
        .is_none()
    {
        return;
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!(
        "http://{}/v1/marketing/content-assets/production/runs/{run}/result",
        listener.local_addr().unwrap()
    );
    let app = build_app(
        state.clone().into(),
        build_cors_layer(&state.settings).unwrap(),
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let client = reqwest::Client::new();
    let token =
        crate::marketing::content_assets::handlers::qianchuan_http_route_tests::access_token();
    assert_eq!(client.get(&url).send().await.unwrap().status(), 401);
    let response = client.get(&url).bearer_auth(&token).send().await.unwrap();
    let status = response.status();
    let body: Value = response.json().await.unwrap();
    assert_eq!(status, 200, "{body}");
    assert_eq!(body["ready"], false);
    let summary = &body["selectedReview"]["summary"];
    assert_eq!(summary["scope"], "selected_output_windows_sampled");
    assert_eq!(summary["deliveryApproved"], false);
    assert_eq!(
        summary["binding"],
        body["selectedReview"]["followUp"]["binding"]
    );
    let expected_status = match body["selectedReview"]["followUp"]["status"]
        .as_str()
        .unwrap()
    {
        "observations_only" => "sampled_checks_passed",
        "revision_proposed" => "needs_revision",
        _ => "evidence_required",
    };
    assert_eq!(summary["status"], expected_status);
    if expected_status == "sampled_checks_passed" {
        assert_eq!(summary["windowCount"], summary["passedWindowCount"]);
    }
    assert_eq!(
        body["selectedReview"]["followUp"],
        receipt["host_selected_semantic_review"]["followUp"]
    );
    std::fs::write(
        out.join("selected-review-api.json"),
        serde_json::to_vec_pretty(&body).unwrap(),
    )
    .unwrap();
    if let Some(proposal) = body["selectedReview"]["followUp"]["proposals"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["action"] == "reselect_source")
    {
        let current = super::repository::get(&state.pool, "90000001", run)
            .await
            .unwrap();
        let mut db = state.pool.acquire().await.unwrap();
        let plan = super::repository::plan(&mut db, run, current.plan_revision)
            .await
            .unwrap()
            .unwrap();
        drop(db);
        let clip = plan
            .document
            .clips
            .iter()
            .find(|c| c.id == proposal["target"]["clipId"])
            .unwrap();
        let candidates_url = url.replace("/result", "/replacement-candidates");
        let candidates_request = json!({"expectedVersion":current.version,"expectedPlanRevision":current.plan_revision,"jobId":job,"clipId":clip.id});
        assert_eq!(
            client
                .post(&candidates_url)
                .json(&candidates_request)
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        let response = client
            .post(&candidates_url)
            .bearer_auth(&token)
            .json(&candidates_request)
            .send()
            .await
            .unwrap();
        let status = response.status();
        let candidates: Value = response.json().await.unwrap();
        assert_eq!(status, 200, "{candidates}");
        assert_eq!(candidates["modelCalls"], 0);
        assert_eq!(candidates["deliveryApproved"], false);
        for c in candidates["candidates"].as_array().unwrap() {
            assert_eq!(c["semanticStatus"], "unverified");
            assert_eq!(c["replacement"]["clipId"], clip.id);
        }
        super::replacement_selection_fixture::exercise(state, run, candidates_request.clone(), out)
            .await;
        receipt =
            sqlx::query_scalar("SELECT receipt FROM ads.content_production_jobs WHERE job_id=$1")
                .bind(job)
                .fetch_one(&state.pool)
                .await
                .unwrap();
        super::replacement_candidates::exercise_filter(&current, &plan.document, &clip.id);
        for field in ["expectedVersion", "jobId", "clipId"] {
            let mut bad = candidates_request.clone();
            bad[field] = match field {
                "expectedVersion" => json!(current.version + 1),
                "jobId" => json!(Uuid::new_v4()),
                _ => json!("missing"),
            };
            assert!(client
                .post(&candidates_url)
                .bearer_auth(&token)
                .json(&bad)
                .send()
                .await
                .unwrap()
                .status()
                .is_client_error());
        }
        std::fs::write(
            out.join("replacement-candidates.json"),
            serde_json::to_vec_pretty(&candidates).unwrap(),
        )
        .unwrap();
        let draft_url = url.replace("/result", "/selected-revision-draft");
        assert!(!candidates["narrationContext"]
            .as_array()
            .unwrap()
            .is_empty());
        for candidate in candidates["candidates"].as_array().unwrap() {
            let candidate_request = json!({"expectedVersion":current.version,"expectedPlanRevision":current.plan_revision,
                "jobId":job,"replacements":[candidate["replacement"]]});
            let response = client
                .post(&draft_url)
                .bearer_auth(&token)
                .json(&candidate_request)
                .send()
                .await
                .unwrap();
            let status = response.status();
            let result: Value = response.json().await.unwrap();
            assert_eq!(status, 200, "{result}");
        }
        let request = json!({"expectedVersion":current.version,"expectedPlanRevision":current.plan_revision,
            "jobId":job,"replacements":[{"clipId":clip.id,"assetId":clip.asset_id,"startMs":clip.start_ms-100}]});
        assert_eq!(
            client
                .post(&draft_url)
                .json(&request)
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        let response = client
            .post(&draft_url)
            .bearer_auth(&token)
            .json(&request)
            .send()
            .await
            .unwrap();
        let status = response.status();
        let draft: Value = response.json().await.unwrap();
        assert_eq!(status, 200, "{draft}");
        assert_eq!(draft["saved"], false);
        assert_eq!(draft["deliveryApproved"], false);
        let next: super::types::PlanDocument =
            serde_json::from_value(draft["revisionRequest"]["document"].clone()).unwrap();
        for (before, after) in plan.document.clips.iter().zip(&next.clips) {
            if before.id == clip.id {
                assert_eq!(after.start_ms, before.start_ms - 100);
                assert_eq!(after.end_ms, before.end_ms - 100);
                assert_eq!(after.caption, before.caption);
                assert_eq!(after.volume, before.volume);
            } else {
                assert_eq!(before, after);
            }
        }
        assert_eq!(
            serde_json::to_value(&next.narration_captions).unwrap(),
            serde_json::to_value(&plan.document.narration_captions).unwrap()
        );
        for case in [
            "stale",
            "noop",
            "unknown_asset",
            "duplicate",
            "unknown_clip",
            "overflow",
        ] {
            let mut bad = request.clone();
            match case {
                "stale" => bad["expectedVersion"] = json!(current.version + 1),
                "noop" => bad["replacements"][0]["startMs"] = json!(clip.start_ms),
                "unknown_asset" => bad["replacements"][0]["assetId"] = json!(Uuid::new_v4()),
                "duplicate" => {
                    bad["replacements"] =
                        json!([request["replacements"][0], request["replacements"][0]])
                }
                "unknown_clip" => bad["replacements"][0]["clipId"] = json!("unknown"),
                "overflow" => bad["replacements"][0]["startMs"] = json!(u32::MAX),
                _ => unreachable!(),
            }
            assert!(
                client
                    .post(&draft_url)
                    .bearer_auth(&token)
                    .json(&bad)
                    .send()
                    .await
                    .unwrap()
                    .status()
                    .is_client_error(),
                "{case}"
            );
        }
        let unchanged = super::repository::get(&state.pool, "90000001", run)
            .await
            .unwrap();
        assert_eq!(unchanged.version, current.version);
        assert_eq!(unchanged.plan_revision, current.plan_revision);
        assert_eq!(unchanged.render_job_id, Some(job));
        std::fs::write(
            out.join("selected-revision-draft.json"),
            serde_json::to_vec_pretty(&draft).unwrap(),
        )
        .unwrap();
    }
    let mut cases = vec![
        "video",
        "version",
        "approval",
        "action",
        "missing_proposal",
        "pointer",
        "source",
        "response",
        "ledger",
        "policy",
        "source_time",
    ];
    if receipt["host_selected_semantic_review"]["followUp"]["proposals"]
        .as_array()
        .unwrap()
        .is_empty()
    {
        cases.retain(|case| !["action", "missing_proposal", "pointer"].contains(case));
        cases.push("unexpected_proposal");
    }
    for case in &cases {
        let mut bad = receipt.clone();
        match *case {
            "unexpected_proposal" => {
                bad["host_selected_semantic_review"]["followUp"]["proposals"] = json!([{
                    "category":"visible_text", "action":"reselect_source",
                    "target":{"clipId":bad["host_selected_semantic_review"]["entries"][0]["clipId"],"startFrame":927,"endFrame":960},
                    "reason":"forged issue on a passing receipt", "evidencePath":"/entries/0", "requirement":"fixture"
                }]);
            }
            "video" => bad["host_selected_semantic_review"]["outputSha256"] = json!("f".repeat(64)),
            "version" => bad["host_plan_revision"] = json!(0),
            "approval" => {
                bad["host_selected_semantic_review"]["followUp"]["deliveryApproved"] = json!(true)
            }
            "action" => {
                bad["host_selected_semantic_review"]["followUp"]["proposals"][0]["action"] =
                    json!("erase_text")
            }
            "missing_proposal" => {
                bad["host_selected_semantic_review"]["followUp"]["proposals"] = json!([])
            }
            "pointer" => {
                bad["host_selected_semantic_review"]["followUp"]["proposals"][0]["evidencePath"] =
                    json!("/model")
            }
            "source" => {
                bad["host_selected_semantic_review"]["entries"][0]["window"]["sha256"] =
                    json!("f".repeat(64))
            }
            "response" => {
                bad["host_selected_semantic_review"]["entries"][0]["checks"][0]["observation"] =
                    json!("tampered")
            }
            "ledger" => bad["host_visual_calls"] = json!({}),
            "policy" => {
                bad["host_selected_semantic_review"]["followUp"]["constraints"]
                    ["automaticErasureAllowed"] = json!(true)
            }
            "source_time" => {
                bad["host_selected_semantic_review"]["entries"][0]["window"]["sourceStart"]["num"] =
                    json!(0)
            }
            _ => unreachable!(),
        }
        sqlx::query("UPDATE ads.content_production_jobs SET receipt=$2 WHERE job_id=$1")
            .bind(job)
            .bind(bad)
            .execute(&state.pool)
            .await
            .unwrap();
        assert_eq!(
            client
                .get(&url)
                .bearer_auth(&token)
                .send()
                .await
                .unwrap()
                .status(),
            409,
            "{case}"
        );
    }
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=$2 WHERE job_id=$1")
        .bind(job)
        .bind(&receipt)
        .execute(&state.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE ads.content_production_run_renders SET execution_version=execution_version+1 WHERE job_id=$1").bind(job).execute(&state.pool).await.unwrap();
    let stale: Value = client
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(stale.get("selectedReview").is_none());
    sqlx::query("UPDATE ads.content_production_run_renders SET execution_version=execution_version-1 WHERE job_id=$1").bind(job).execute(&state.pool).await.unwrap();
    let asset = super::repository::get(&state.pool, "90000001", run)
        .await
        .unwrap()
        .sources
        .assets[0]
        .asset_id;
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET repurpose_allowed=FALSE WHERE asset_id=$1",
    )
    .bind(asset)
    .execute(&state.pool)
    .await
    .unwrap();
    assert_eq!(
        client
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    sqlx::query("UPDATE ads.marketing_content_assets SET repurpose_allowed=NULL WHERE asset_id=$1")
        .bind(asset)
        .execute(&state.pool)
        .await
        .unwrap();
    std::fs::write(out.join("selected-review-api-checks.json"), serde_json::to_vec_pretty(&json!({"readback":true,"unauthenticated":401,"rejectedTampering":cases,"staleHidden":true,"revokedAsset":400,"deliveryApproved":false})).unwrap()).unwrap();
    server.abort();
}
