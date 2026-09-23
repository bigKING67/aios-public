//! Loopback model fixture: real provider client, no external requests or credentials.
use crate::config::Settings;
use axum::{routing::post, Json, Router};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

pub(super) async fn model(
    settings: &mut Settings,
) -> (tokio::task::JoinHandle<()>, Arc<AtomicUsize>) {
    let count = Arc::new(AtomicUsize::new(0));
    let calls = count.clone();
    let app=Router::new().route("/chat/completions", post(move |Json(body):Json<Value>| {
        let calls=calls.clone();
        async move {
            calls.fetch_add(1,Ordering::SeqCst);
            let input=body["messages"][1]["content"].as_str().unwrap();
            assert!(!input.contains("playbackUrl") && !input.contains("objectKey") && !input.contains("source.mp4"));
            let candidate=if input.contains("hallucinated") {99} else {0};
            Json(json!({"choices":[{"message":{"content":json!({"shots":[{"candidateId":candidate,"reason":"以原片台词作为开场"}],"gaps":["待补产品特写，产品外观需要另行确认"]}).to_string()}}]}))
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    settings.content_production_planning_enabled = true;
    settings.llm_default_provider = "deepseek".into();
    settings.llm_default_model = "deepseek-chat".into();
    settings.deepseek_base_url = format!("http://{}", listener.local_addr().unwrap());
    settings.deepseek_api_key = "local-fixture-only".into();
    settings.deepseek_model = "deepseek-chat".into();
    (
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() }),
        count,
    )
}

pub(super) async fn exercise(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    asset: &str,
    count: &AtomicUsize,
) {
    let mut request = json!({"brief":"口播开场","searchText":"验收","assetIds":[asset],"targetSeconds":10,"modelCallConfirmed":false,"rightsConfirmed":true});
    let url = format!("{base}/plans");
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
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(count.load(Ordering::SeqCst), 0);
    request["modelCallConfirmed"] = json!(true);
    request["searchText"] = json!("不存在的台词");
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(count.load(Ordering::SeqCst), 0);
    request["searchText"] = json!("验收");
    let response = client
        .post(&url)
        .bearer_auth(token)
        .json(&request)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200, "{}", response.text().await.unwrap());
    let plan: Value = response.json().await.unwrap();
    assert_eq!(plan["shots"][0]["clip"]["assetId"], asset);
    assert_eq!(plan["shots"][0]["clip"]["endMs"], 1000);
    assert_eq!(plan["basis"], "raw-transcript");
    assert_eq!(plan["gaps"].as_array().unwrap().len(), 1);
    request["brief"] = json!("hallucinated");
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(token)
            .json(&request)
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(count.load(Ordering::SeqCst), 2);
}
