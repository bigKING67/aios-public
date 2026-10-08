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
            if let Ok(path) = std::env::var("CONTENT_PRODUCTION_TEST_REPLAY") {
                let root=std::path::PathBuf::from(path);
                let expected:Value=serde_json::from_slice(&std::fs::read(root.join("planner-request.json")).unwrap()).unwrap();
                assert_eq!(body["messages"][0]["content"],expected["systemPrompt"]);
                let mut actual:Value=serde_json::from_str(input).unwrap();
                let mut expected=expected["userPrompt"].clone();
                for payload in [&mut actual,&mut expected] {
                    let asset=payload["candidates"][0]["source"]["assetId"].clone();
                    assert!(payload["candidates"].as_array().unwrap().iter().all(|c| c["source"]["assetId"]==asset));
                    for candidate in payload["candidates"].as_array_mut().unwrap() {
                        candidate.as_object_mut().unwrap().remove("title");
                        candidate["source"]["assetId"]=json!(uuid::Uuid::nil());
                    }
                }
                assert_eq!(actual,expected,"replayed model decision no longer matches retrieved candidates");
                let raw:Value=serde_json::from_slice(&std::fs::read(root.join("provider-output.json")).unwrap()).unwrap();
                return Json(json!({"choices":[{"message":{"content":raw["outputText"]}}]}));
            }
            if input.contains("batch-capacity") {
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                return Json(json!({"choices":[{"message":{"content":json!({"shots":[{"candidateId":0,"reason":"技术负载片段一"},{"candidateId":1,"reason":"技术负载片段二"},{"candidateId":2,"reason":"技术负载片段三"}],"gaps":[]}).to_string()}}]}));
            }
            let candidate=if input.contains("hallucinated") {99} else {0};
            if input.contains("picture-remix-fixture") {
                let raw:Value=serde_json::from_str(input).unwrap();
                let parsed=raw.get("originalInput").unwrap_or(&raw);
                assert!(body["max_tokens"].as_u64().unwrap()<=4096);
                assert_eq!(parsed["narration"]["endMs"],3000);
                assert_eq!(parsed["narration"]["transcripts"].as_array().unwrap().len(),40);
                let preserved=parsed["candidates"].as_array().unwrap().last().unwrap();
                assert_eq!(preserved["evidence"]["kind"],"source-preservation");
                let shots:Vec<_>=parsed["slots"].as_array().unwrap().iter().map(|slot| {
                    let selected=if input.contains("keep-original") {preserved["candidateId"].clone()}else{slot["slotId"].clone()};
                    let mut shot=json!({"slotId":slot["slotId"],"candidateId":selected,"reason":"按固定时间段选片"});
                    if input.contains("repair-once") && raw.get("originalInput").is_none() {shot["durationFrames"]=json!(91);}
                    shot
                }).collect();
                return Json(json!({"choices":[{"message":{"content":json!({"shots":shots,"gaps":[]}).to_string()}}]}));
            }
            if input.contains("visual-only-fixture") {
                let raw:Value=serde_json::from_str(input).unwrap();
                let parsed=raw.get("originalInput").unwrap_or(&raw);
                assert!(parsed["candidates"].as_array().unwrap().iter().all(|c| c["evidence"]["kind"]=="raw-video-analysis"));
                assert!(body["messages"][0]["content"].as_str().unwrap().contains("视觉候选静音"));
                return Json(json!({"choices":[{"message":{"content":json!({"shots":[{"candidateId":candidate,"reason":"依据原片画面展示产品"}],"gaps":[]}).to_string()}}]}));
            }
            let gaps = if input.contains("automatic-ready") {vec![]} else {vec!["待补产品特写，产品外观需要另行确认"]};
            Json(json!({"choices":[{"message":{"content":json!({"shots":[{"candidateId":candidate,"reason":"以原片台词作为开场"}],"gaps":gaps}).to_string()}}]}))
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
