//! Exercise restoration and newline-only edits through existing public APIs.
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use sqlx::Row;

async fn snapshot(state: &AppState, run: &Value) -> Value {
    sqlx::query_scalar("SELECT snapshot FROM ads.content_production_revisions WHERE project_id=$1::uuid AND revision=$2")
        .bind(run["run"]["projectId"].as_str().unwrap())
        .bind(run["run"]["projectRevision"].as_i64().unwrap() as i32)
        .fetch_one(&state.pool).await.unwrap()
}

fn version(run: &Value) -> Value {
    json!({"expectedVersion":run["run"]["version"],"expectedPlanRevision":run["run"]["planRevision"],
        "expectedProjectRevision":run["run"]["projectRevision"]})
}

fn revision(run: &Value, document: &Value) -> Value {
    json!({"expectedVersion":run["run"]["version"],"expectedPlanRevision":run["run"]["planRevision"],"document":document})
}

async fn post(client: &Client, url: &str, token: &str, request: &Value) -> Value {
    let response = client
        .post(url)
        .bearer_auth(token)
        .json(request)
        .send()
        .await
        .unwrap();
    let status = response.status();
    let body = response.text().await.unwrap();
    assert!(status.is_success(), "{status}: {body}");
    serde_json::from_str(&body).unwrap()
}

pub(super) async fn exercise(
    state: &AppState,
    client: &Client,
    url: &str,
    token: &str,
    original: &Value,
) {
    let before = snapshot(state, original).await;
    assert_eq!(before["derivedAssets"].as_array().unwrap().len(), 1);
    assert_eq!(before["editDocument"]["captions"], json!([]));
    let voice = &original["run"]["request"]["narrationAssetId"];
    let source = before["assets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|asset| &asset["assetId"] == voice)
        .unwrap();
    let mut plan = original["plan"]["document"].clone();
    let style = json!({"fontHeight":0.035,"centerY":0.72,"color":"#ffffff","strokeWidth":0.0015,"weight":700});
    plan["narrationCaptions"] = json!({"assetId":voice,"sourceSha256":source["sha256"],"cues":[
        {"id":"restored-one","startMs":100,"endMs":900,"text":"保留原有字幕","style":style},
        {"id":"restored-two","startMs":1200,"endMs":2800,"text":"画面声音保持一致","style":style}
    ]});
    let revisions = format!("{url}/plan-revisions");
    let mut no_style = plan.clone();
    no_style["narrationCaptions"]["cues"][0]
        .as_object_mut()
        .unwrap()
        .remove("style");
    assert_eq!(
        client
            .post(&revisions)
            .bearer_auth(token)
            .json(&revision(original, &no_style))
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let revised = post(client, &revisions, token, &revision(original, &plan)).await;
    assert_eq!(
        client
            .post(&revisions)
            .bearer_auth(token)
            .json(&revision(original, &plan))
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let mut stale = version(&revised);
    stale["expectedProjectRevision"] = json!(1);
    assert_eq!(
        client
            .post(format!("{url}/produce"))
            .bearer_auth(token)
            .json(&stale)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let reference =
        super::treated_caption_automation_fixture::reference(state, original, &plan).await;
    let automated =
        super::treated_caption_automation_fixture::host(url, token, "restore", &reference).await;
    let adopted = automated["detail"].clone();
    let restored = render(
        state,
        client,
        url,
        token,
        &adopted,
        "treated-caption-restored",
    )
    .await;
    let restored_snapshot = snapshot(state, &restored).await;
    assert_preserved(&before, &restored_snapshot);
    assert_eq!(
        restored_snapshot["editDocument"]["captions"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        restored_snapshot["editDocument"]["captions"][0]["style"],
        style
    );

    for change in ["picture", "style", "words", "timing", "hash"] {
        let mut bad = plan.clone();
        match change {
            "picture" => bad["clips"][0]["id"] = json!("changed-picture"),
            "style" => bad["narrationCaptions"]["cues"][0]["style"]["weight"] = json!(900),
            "words" => bad["narrationCaptions"]["cues"][0]["text"] = json!("不允许改写"),
            "timing" => bad["narrationCaptions"]["cues"][0]["endMs"] = json!(950),
            "hash" => bad["narrationCaptions"]["sourceSha256"] = json!("b".repeat(64)),
            _ => unreachable!(),
        }
        let status = client
            .post(&revisions)
            .bearer_auth(token)
            .json(&revision(&restored, &bad))
            .send()
            .await
            .unwrap()
            .status();
        assert!([400, 409].contains(&status.as_u16()), "{change}: {status}");
    }
    super::treated_caption_automation_fixture::inspect(client, url, token).await;
    let automation =
        super::treated_caption_automation_fixture::host(url, token, "adopt", "-").await;
    assert_eq!(automation["status"], "queued");
    let revised = automation["detail"].clone();
    let wrapped = render(
        state,
        client,
        url,
        token,
        &revised,
        "treated-caption-wrapped",
    )
    .await;
    let wrapped_snapshot = snapshot(state, &wrapped).await;
    assert_preserved(&restored_snapshot, &wrapped_snapshot);
    assert_eq!(
        wrapped_snapshot["editDocument"]["captions"][0]["text"],
        "保留\n原有字幕"
    );
    let mut normalized = wrapped_snapshot.clone();
    normalized["editDocument"]["captions"][0]["text"] = json!("保留原有字幕");
    normalized["editDocument"]["revision"] = restored_snapshot["editDocument"]["revision"].clone();
    assert_eq!(normalized, restored_snapshot);
    assert_eq!(snapshot(state, original).await, before); // immutable earlier revision
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(root.join("treated-caption-adoption.json"), serde_json::to_vec_pretty(&json!({
        "restoredProjectRevision":restored["run"]["projectRevision"],"wrappedProjectRevision":wrapped["run"]["projectRevision"],
        "style":style,"derivedAssetsPreserved":true,"otherDocumentFieldsPreserved":true,"oldRevisionUnchanged":true,
        "staleVersionsRejected":true,"pictureStyleTextTimingChangesRejected":true,"deliveryApproved":false,
        "automaticReferenceRestoration":automated["restoration"],"automaticCandidateAdoption":true
    })).unwrap()).unwrap();
}

fn assert_preserved(before: &Value, after: &Value) {
    let mut normalized = after.clone();
    for field in ["captions", "revision", "captionDisplayPolicy"] {
        match before["editDocument"].get(field) {
            Some(value) => normalized["editDocument"][field] = value.clone(),
            None => {
                normalized["editDocument"]
                    .as_object_mut()
                    .unwrap()
                    .remove(field);
            }
        }
    }
    assert_eq!(&normalized, before);
}

async fn render(
    state: &AppState,
    client: &Client,
    url: &str,
    token: &str,
    run: &Value,
    name: &str,
) -> Value {
    let produced = if run["run"]["status"] == "running" {
        run.clone()
    } else {
        post(client, &format!("{url}/produce"), token, &version(run)).await
    };
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
    let worker: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(worker["status"], "completed", "{worker}");
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
        "SELECT receipt,output_object_key FROM ads.content_production_jobs WHERE job_id=$1::uuid",
    )
    .bind(produced["run"]["renderJobId"].as_str().unwrap())
    .fetch_one(&state.pool)
    .await
    .unwrap();
    let receipt: Value = row.get("receipt");
    assert_eq!(receipt["caption_quality"]["captionCount"], 2);
    assert_eq!(receipt["host_inspection"]["status"], "passed");
    assert_eq!(
        receipt["host_caption_review"]["callsReserved"],
        if name.ends_with("restored") { 3 } else { 1 }
    );
    assert_eq!(
        receipt["host_caption_review"]["candidateRendered"],
        name.ends_with("restored")
    );
    super::visual_review_http_fixture::exercise(state, client, url, token, &after, &receipt, name)
        .await;
    let key: String = row.get("output_object_key");
    let signed =
        crate::marketing::content_assets::delivery::build_object_read_url(&state.settings, &key)
            .unwrap();
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
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(root.join(format!("{name}.mp4")), bytes).unwrap();
    after
}
