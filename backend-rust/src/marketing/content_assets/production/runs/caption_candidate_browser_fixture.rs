//! Opt-in local browser handshake. Never compiled into the production binary.
use reqwest::Client;
use serde_json::{json, Value};
use std::{io::Write, path::Path, time::Duration};

pub(super) async fn wait_for_adoption(
    client: &Client,
    url: &str,
    token: &str,
    run: &Value,
    root: &Path,
) -> Option<Value> {
    let handoff = std::env::var_os("CONTENT_PRODUCTION_TEST_BROWSER_HANDOFF")?;
    assert!(url.starts_with("http://127.0.0.1:"));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&handoff).unwrap();
    file.write_all(
        serde_json::to_string(&json!({"url":url,"token":token,"run":run}))
            .unwrap()
            .as_bytes(),
    )
    .unwrap();
    std::fs::write(
        root.join("browser-ready.json"),
        serde_json::to_vec(&json!({"handoffPath":Path::new(&handoff),"runId":run["runId"]}))
            .unwrap(),
    )
    .unwrap();
    let adopted = tokio::time::timeout(Duration::from_secs(600), async {
        loop {
            let detail: Value = client
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
            if detail["run"]["projectRevision"].as_i64().unwrap()
                > run["projectRevision"].as_i64().unwrap()
            {
                return detail;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    })
    .await;
    std::fs::remove_file(&handoff).unwrap();
    Some(adopted.expect("browser did not adopt candidate within 10 minutes"))
}
