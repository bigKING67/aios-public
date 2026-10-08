//! Real queue/Worker mismatch -> same Run resume, with a simulated package identity.
use reqwest::Client;
use serde_json::{json, Value};

pub(super) async fn exercise(
    state: &crate::state::AppState,
    client: &Client,
    run_url: &str,
    token: &str,
    planned: Value,
) -> Value {
    let frozen: Value = sqlx::query_scalar("SELECT v.snapshot FROM ads.content_production_jobs j JOIN ads.content_production_revisions v ON v.project_id=j.project_id AND v.revision=j.revision WHERE j.job_id=$1::UUID")
        .bind(planned["run"]["renderJobId"].as_str().unwrap()).fetch_one(&state.pool).await.unwrap();
    assert_eq!(
        frozen["renderBinding"],
        json!(super::super::render_binding::current())
    );
    // Only this isolated child advertises a different installed package. No
    // source, lock file, global config, or production service is changed.
    let script = r#"
import json, os
from pathlib import Path
from content_production import worker, render_binding
wrong = {**render_binding.current_binding(), 'rendererLockSha256': 'f' * 64}
render_binding.current_binding = lambda: wrong
print(json.dumps(worker.process_one(Path(os.environ['CREATIVE_CRAFT_PRODUCTION_DIR']), Path(os.environ['CONTENT_PRODUCTION_WORK_DIR']))))
"#;
    let output =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .args(["-c", script])
            .output()
            .await
            .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let failed: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(failed["status"], "failed");
    assert_eq!(failed["errorType"], "RenderBindingMismatch");
    let waiting: Value = client
        .get(run_url)
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(waiting["run"]["status"], "waiting");
    assert_eq!(waiting["run"]["waitingReason"], "render_failed");
    let resumed: Value = client
        .post(format!("{run_url}/resume"))
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
    assert_eq!(resumed["run"]["runId"], planned["run"]["runId"]);
    assert_ne!(resumed["run"]["renderJobId"], planned["run"]["renderJobId"]);
    assert_eq!(
        resumed["run"]["projectRevision"],
        planned["run"]["projectRevision"]
    );
    let snapshot: Value = sqlx::query_scalar("SELECT v.snapshot FROM ads.content_production_jobs j JOIN ads.content_production_revisions v ON v.project_id=j.project_id AND v.revision=j.revision WHERE j.job_id=$1::UUID")
        .bind(resumed["run"]["renderJobId"].as_str().unwrap()).fetch_one(&state.pool).await.unwrap();
    assert_eq!(snapshot, frozen);
    let root = std::path::PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    std::fs::write(root.join("render-binding-resume.json"), serde_json::to_vec_pretty(&json!({
        "schema":"aios.render-binding-acceptance.v1", "binding":frozen["renderBinding"],
        "mismatchedWorker":"rejected", "sameRun":true, "sameFrozenSnapshot":true,
        "identityMismatch":"injected in isolated Worker child", "restoredWorkerRender":"verified by parent fixture"
    })).unwrap()).unwrap();
    resumed
}
