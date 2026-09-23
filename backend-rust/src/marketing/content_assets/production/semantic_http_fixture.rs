use axum::{routing::post, Json, Router};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc,
};

async fn worker(endpoint: &str) -> Value {
    let result =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .args(["-m", "content_production.semantic_worker", "--once"])
            .env("CONTENT_PRODUCTION_SEMANTICS_ENABLED", "true")
            .env("ARK_API_KEY", "isolated-fixture-only")
            .env("ARK_RESPONSES_BASE_URL", endpoint)
            .env(
                "CONTENT_ASSET_VIDEO_UNDERSTANDING_MODEL",
                "fixture-frame-model",
            )
            .output()
            .await
            .unwrap();
    assert!(
        result.status.success(),
        "semantic worker failed: {}",
        String::from_utf8_lossy(&result.stderr)
    );
    serde_json::from_slice(&result.stdout).unwrap()
}
pub(super) async fn exercise(
    pool: &PgPool,
    client: &reqwest::Client,
    base: &str,
    token: &str,
    asset: &str,
) {
    sqlx::raw_sql(include_str!(
        "../../../../../sql/migrations/024_content_production_semantic_jobs.sql"
    ))
    .execute(pool)
    .await
    .unwrap();
    let catalog: Value = serde_json::from_slice(
        &std::fs::read(std::env::var("CONTENT_PRODUCTION_TEST_CATALOG").unwrap()).unwrap(),
    )
    .unwrap();
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET duration_seconds=$1 WHERE asset_id=$2::uuid",
    )
    .bind(catalog["source"]["durationMs"].as_f64().unwrap() / 1000.0)
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    let catalogs: Value = client
        .get(format!("{base}/shot-catalogs"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    // Use the real CLI catalog imported during the earlier fixture, not the synthetic cuts.
    let id = catalogs["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["shotCount"] == catalog["shots"].as_array().unwrap().len())
        .unwrap()["catalogId"]
        .as_str()
        .unwrap();
    let body = json!({"catalogId":id,"shotIds":[catalog["shots"][0]["shotId"],catalog["shots"][1]["shotId"]],"rightsConfirmed":true,"modelCallConfirmed":true});
    let url = format!("{base}/semantic-jobs");
    assert_eq!(
        client.post(&url).json(&body).send().await.unwrap().status(),
        401
    );
    let mut invalid = body.clone();
    invalid["modelCallConfirmed"] = json!(false);
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(token)
            .json(&invalid)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    invalid = body.clone();
    invalid["shotIds"] = json!(["unknown"]);
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(token)
            .json(&invalid)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    let queued: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let duplicate: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(queued["jobId"], duplicate["jobId"]);
    let calls = Arc::new(AtomicUsize::new(0));
    let fail = Arc::new(AtomicBool::new(false));
    let c = calls.clone();
    let f = fail.clone();
    let app=Router::new().route("/responses",post(move |Json(body):Json<Value>| {let c=c.clone();let f=f.clone();async move {
        c.fetch_add(1,Ordering::SeqCst);
        assert!(body["input"][0]["content"][0]["image_url"].as_str().unwrap().starts_with("data:image/jpeg;base64,"));
        assert_eq!(body["store"],false);
        if f.load(Ordering::SeqCst) {return Json(json!({"status":"incomplete"}));}
        let observation=json!({"description":"隔离测试白色瓶子","subjects":[],"objects":["瓶子"],"setting":"测试场景","visibleText":[],"reuseIdeas":["仅建议钩子"]});
        Json(json!({"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":observation.to_string()}]}]}))
    }}));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/responses", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    assert_eq!(worker(&endpoint).await["status"], "completed");
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    let search_url = format!("{base}/shot-catalogs/{id}/semantic-clips");
    let hits: Value = client
        .get(&search_url)
        .query(&[("q", "瓶子")])
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(hits["items"].as_array().unwrap().len(), 2);
    assert_eq!(hits["items"][0]["startMs"], 0);
    assert_eq!(hits["items"][0]["endMs"], catalog["shots"][0]["endMs"]);
    assert_eq!(hits["items"][0]["model"], "fixture-frame-model");
    let suggestions: Value = client
        .get(&search_url)
        .query(&[("q", "仅建议钩子")])
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(suggestions["items"], json!([]));
    // Owner isolation applies even for otherwise authorized users.
    sqlx::query("UPDATE ads.content_production_shot_catalogs SET owner_user_id='other-owner' WHERE catalog_id=$1::uuid").bind(id).execute(pool).await.unwrap();
    assert_eq!(
        client
            .get(&search_url)
            .query(&[("q", "瓶子")])
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    sqlx::query("UPDATE ads.content_production_shot_catalogs SET owner_user_id=(SELECT owner_user_id FROM ads.content_production_semantic_jobs WHERE job_id=$1::uuid) WHERE catalog_id=$2::uuid").bind(queued["jobId"].as_str().unwrap()).bind(id).execute(pool).await.unwrap();
    let next: Value = client
        .post(&url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(client
        .post(format!("{url}/{}/cancel", next["jobId"].as_str().unwrap()))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .status()
        .is_success());
    assert_eq!(worker(&endpoint).await["status"], "idle");
    fail.store(true, Ordering::SeqCst);
    client
        .post(&url)
        .bearer_auth(token)
        .json(&body)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    assert_eq!(worker(&endpoint).await["status"], "failed");
    assert_eq!(calls.load(Ordering::SeqCst), 3); // Incomplete first reply: no second call or retry.
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET raw_sha256=repeat('0',64) WHERE asset_id=$1::uuid",
    )
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    assert_eq!(
        client
            .get(&search_url)
            .query(&[("q", "瓶子")])
            .bearer_auth(token)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    sqlx::query("UPDATE ads.marketing_content_assets SET raw_sha256=$1,duration_seconds=3 WHERE asset_id=$2::uuid").bind(catalog["rawSha256"].as_str().unwrap()).bind(asset).execute(pool).await.unwrap();
    let checks =
        tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
            .current_dir(
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .parent()
                    .unwrap(),
            )
            .args([
                "-m",
                "unittest",
                "discover",
                "-s",
                "etl/groland_postgres/tests/content_production",
                "-p",
                "test_semantic_queue_postgres.py",
            ])
            .output()
            .await
            .unwrap();
    assert!(
        checks.status.success(),
        "{}",
        String::from_utf8_lossy(&checks.stderr)
    );
    server.abort();
}
