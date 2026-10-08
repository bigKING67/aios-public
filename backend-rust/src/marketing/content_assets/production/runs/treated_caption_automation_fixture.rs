//! Owned reference setup and actual Python host/API automation, no paid calls.
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use sqlx::Row;

pub(super) async fn reference(state: &AppState, original: &Value, plan: &Value) -> String {
    let row = sqlx::query("SELECT p.owner_user_id,r.snapshot FROM ads.content_production_projects p JOIN ads.content_production_revisions r USING(project_id) WHERE p.project_id=$1::uuid AND r.revision=1")
        .bind(original["run"]["projectId"].as_str().unwrap()).fetch_one(&state.pool).await.unwrap();
    let owner: String = row.get("owner_user_id");
    let mut snapshot: super::super::types::Snapshot =
        serde_json::from_value(row.get("snapshot")).unwrap();
    let plan = serde_json::from_value(plan.clone()).unwrap();
    let document = snapshot.edit_document.as_mut().unwrap();
    document["captions"] = json!(super::captions::compile(&plan));
    document["captionDisplayPolicy"] = json!("source-hold-v1");
    super::super::repository::save(&state.pool, &owner, None, None, snapshot)
        .await
        .unwrap()
        .project_id
        .to_string()
}

pub(super) async fn host(url: &str, token: &str, action: &str, reference: &str) -> Value {
    let output =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .args([
                concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../etl/groland_postgres/tests/content_production/caption_run_http_fixture.py"
                ),
                url,
                action,
                reference,
            ])
            .env("AIOS_CAPTION_TEST_TOKEN", token)
            .output()
            .await
            .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

pub(super) async fn inspect(client: &Client, url: &str, token: &str) {
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
    let candidate = &result["captionCandidate"];
    assert_eq!(candidate["deliveryApproved"], false);
    assert_eq!(
        candidate["planDocument"]["narrationCaptions"]["cues"][0]["text"],
        "保留\n原有字幕"
    );
    let bytes = client
        .get(candidate["playbackUrl"].as_str().unwrap())
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .bytes()
        .await
        .unwrap();
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(root.join("treated-caption-candidate.mp4"), bytes).unwrap();
}
