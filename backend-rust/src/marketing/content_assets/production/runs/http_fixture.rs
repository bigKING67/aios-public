//! Real HTTP/auth/SQL + loopback provider; no paid calls or external resources.
use reqwest::Client;
use serde_json::{json, Value};

use std::sync::atomic::{AtomicUsize, Ordering};

pub(in crate::marketing::content_assets::production) async fn disabled(
    mut state: crate::state::AppState,
    client: &Client,
    token: &str,
) {
    let mut settings = (*state.settings).clone();
    settings.content_production_runs_enabled = false;
    let cors = crate::cors::build_cors_layer(&settings).unwrap();
    state.settings = std::sync::Arc::new(settings);
    let app = crate::routes::build_app(std::sync::Arc::new(state), cors);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!(
        "http://{}/v1/marketing/content-assets/production",
        listener.local_addr().unwrap()
    );
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    assert_eq!(
        client
            .get(format!("{base}/runs"))
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        503
    );
    let capabilities: Value = client
        .get(format!("{base}/capabilities"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(capabilities["enabled"], true);
    assert_eq!(capabilities["persistentPlansEnabled"], false);
    assert_eq!(capabilities["autonomousEditingEnabled"], false);
    server.abort();
}

pub(in crate::marketing::content_assets::production) async fn exercise(
    state: &crate::state::AppState,
    client: &Client,
    base: &str,
    token: &str,
    asset: &str,
    calls: &AtomicUsize,
) {
    let pool = &state.pool;
    let url = format!("{base}/runs");
    let request = json!({"idempotencyKey":"run-http-fixture","title":"持久口播方案","brief":"使用已有原片台词，保持原意","taskType":"talking_head","assetIds":[asset],"aspect":"portrait","targetSeconds":10,"rightsConfirmed":true,"modelCallConfirmed":true});
    assert_eq!(
        client
            .post(&url)
            .json(&request)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let created: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&request)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = created["run"]["runId"].as_str().unwrap();
    let run_url = format!("{url}/{id}");
    assert_eq!(created["run"]["version"], 1);
    assert!(created["plan"].is_null());
    assert!(!created.to_string().contains("objectKey"));
    let repeated: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&request)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(created["run"]["runId"], repeated["run"]["runId"]);
    let mut changed = request.clone();
    changed["brief"] = json!("不同要求");
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(token)
            .json(&changed)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let before = calls.load(Ordering::SeqCst);
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
    assert_eq!(calls.load(Ordering::SeqCst), before);
    assert_eq!(planned["run"]["status"], "running");
    assert!(planned["plan"].is_null());
    assert!(super::planner::step(state).await.unwrap());
    let planned = super::http_fixture::poll_plan(client, &run_url, token).await;
    assert_eq!(calls.load(Ordering::SeqCst), before + 1);
    assert_eq!(planned["run"]["status"], "waiting");
    assert_eq!(planned["run"]["version"], 3);
    assert_eq!(planned["run"]["waitingReason"], "missing_material");
    assert_eq!(
        client
            .post(format!("{run_url}/produce"))
            .bearer_auth(token)
            .json(&json!({"expectedVersion":3,"expectedPlanRevision":1}))
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(planned["plan"]["document"]["clips"][0]["assetId"], asset);
    assert_eq!(
        client
            .post(format!("{run_url}/plan"))
            .bearer_auth(token)
            .json(&json!({"expectedVersion":3}))
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    assert_eq!(calls.load(Ordering::SeqCst), before + 1);
    let reopened: Value = client
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
    assert_eq!(reopened["plan"], planned["plan"]);
    let original_owner: String = sqlx::query_scalar(
        "SELECT owner_user_id FROM ads.content_production_runs WHERE run_id=$1::UUID",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .unwrap();
    sqlx::query(
        "UPDATE ads.content_production_runs SET owner_user_id='another-user' WHERE run_id=$1::UUID",
    )
    .bind(id)
    .execute(pool)
    .await
    .unwrap();
    assert_eq!(
        client
            .get(&run_url)
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        client
            .get(format!("{run_url}/plans/1"))
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    sqlx::query("UPDATE ads.content_production_runs SET owner_user_id=$2 WHERE run_id=$1::UUID")
        .bind(id)
        .bind(original_owner)
        .execute(pool)
        .await
        .unwrap();
    let adopted: Value = client
        .post(format!("{run_url}/adopt-plan"))
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
    let project = adopted["run"]["projectId"].as_str().unwrap();
    let original: Value = client
        .get(format!("{base}/projects/{project}"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        original["project"]["snapshot"]["clips"],
        planned["plan"]["document"]["clips"]
    );
    assert!(
        original["jobs"].as_array().unwrap().is_empty(),
        "foundation must not silently dispatch rendering"
    );
    client
        .post(format!("{run_url}/pause"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":4}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let mut document = planned["plan"]["document"].clone();
    document["lockedClipIds"] = json!([document["clips"][0]["id"]]);
    let edited: Value = client
        .post(format!("{run_url}/plan-revisions"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":5,"expectedPlanRevision":1,"document":document}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(edited["run"]["planRevision"], 2);
    assert_eq!(edited["run"]["status"], "paused");
    let old: Value = client
        .get(format!("{run_url}/plans/1"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(old, planned["plan"]);
    document["clips"][0]["caption"] = json!("不允许静默改变已锁定字幕");
    assert_eq!(
        client
            .post(format!("{run_url}/plan-revisions"))
            .bearer_auth(token)
            .json(&json!({"expectedVersion":6,"expectedPlanRevision":2,"document":document}))
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let source_hash: String = sqlx::query_scalar(
        "SELECT raw_sha256 FROM ads.marketing_content_assets WHERE asset_id=$1::UUID",
    )
    .bind(asset)
    .fetch_one(pool)
    .await
    .unwrap();
    sqlx::query("UPDATE ads.marketing_content_assets SET raw_sha256=$2 WHERE asset_id=$1::UUID")
        .bind(asset)
        .bind("0".repeat(64))
        .execute(pool)
        .await
        .unwrap();
    assert_eq!(
        client
            .post(format!("{run_url}/adopt-plan"))
            .bearer_auth(token)
            .json(
                &json!({"expectedVersion":6,"expectedPlanRevision":2,"expectedProjectRevision":1})
            )
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    sqlx::query("UPDATE ads.marketing_content_assets SET raw_sha256=$2 WHERE asset_id=$1::UUID")
        .bind(asset)
        .bind(source_hash)
        .execute(pool)
        .await
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
            .post(format!("{run_url}/resume"))
            .bearer_auth(token)
            .json(&json!({"expectedVersion":6}))
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    client
        .post(format!("{run_url}/cancel"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":6}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET repurpose_allowed=TRUE WHERE asset_id=$1::UUID",
    )
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
}

// The HTTP acknowledgement proves admission; completion is observed separately.
pub(super) async fn poll_plan(client: &Client, url: &str, token: &str) -> Value {
    tokio::time::timeout(std::time::Duration::from_secs(15), async {
        loop {
            let value: Value = client
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
            if value["run"]["status"] != "running" || value["run"]["stage"] != "planning" {
                return value;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("background planning did not finish")
}
