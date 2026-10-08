use crate::{cors::build_cors_layer, routes::build_app, state::AppState};
use axum::{routing::post, Json, Router};
use serde_json::{json, Value};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};
use uuid::Uuid;

pub(super) async fn exercise(state: &AppState, run: Uuid, request: Value, out: &Path) {
    let alternatives = std::env::var("AIOS_TEST_REPLACEMENT_ALTERNATIVES").as_deref() == Ok("true");
    if alternatives {
        // Disposable fixture DB only. The price text is visually observed in the raw
        // source, but its interval and semantic labels below are test inputs.
        let current = super::repository::get(&state.pool, "90000001", run)
            .await
            .unwrap();
        let asset = current
            .sources
            .assets
            .iter()
            .find(|source| {
                source.sha256 == "90f9a9b032d063279d873c65c64765cbe781dcd267ad7ddf8806450def582087"
            })
            .unwrap()
            .asset_id;
        let row: (Uuid, Value) = sqlx::query_as("SELECT result_id,result_json FROM ads.marketing_content_asset_video_understanding_results WHERE asset_id=$1")
            .bind(asset).fetch_one(&state.pool).await.unwrap();
        let mut data = row.1;
        data["analysis"]["timeline"].as_array_mut().unwrap().push(json!({"start_time":"00:00:31.500","end_time":"00:00:32.600","visual":"真实原片商品展示窗口；语义采用测试夹具","quality_signal":"fixture","purpose":""}));
        data["analysis"]["video_understanding"]["visible_text"]["observations"].as_array_mut().unwrap().push(json!({"start_ms":31500,"end_ms":32600,"text":"百来块的价格","role":"dialogue_subtitle","box":[0.2,0.68,0.6,0.06],"confidence":0.5}));
        sqlx::query("UPDATE ads.marketing_content_asset_video_understanding_results SET result_json=$2 WHERE result_id=$1")
            .bind(row.0).bind(data).execute(&state.pool).await.unwrap();
    }
    let count = Arc::new(AtomicUsize::new(0));
    let calls = count.clone();
    let mock=Router::new().route("/chat/completions",post(move |Json(body):Json<Value>| {
        let calls=calls.clone(); async move {
            let call=calls.fetch_add(1,Ordering::SeqCst);
            let input:Value=serde_json::from_str(body["messages"][1]["content"].as_str().unwrap()).unwrap();
            if let Some(windows)=input["windows"].as_array() {
                assert!(!windows.is_empty() && windows.len() <= 3);
                assert!(input.get("candidates").is_none());
                let verdict=if call<2 {"compatible"} else if call<4 {"uncertain"} else {"conflict"};
                if alternatives { assert_eq!(windows.len(), 2); }
                let response=json!({"checks":windows.iter().map(|w|json!({"clipId":w["clipId"],"verdict":if alternatives && call < 2 && w["source"]["startMs"] == 31500 {"uncertain"} else {verdict},"reason":"independent fixture verdict; not real semantic approval"})).collect::<Vec<_>>()});
                return Json(json!({"choices":[{"message":{"content":response.to_string()}}]}));
            }
            let candidates=input["candidates"].as_array().unwrap();assert!(!candidates.is_empty());
            let selected = if alternatives { candidates.iter().position(|c| c["replacement"]["startMs"] == 31500).unwrap() } else { 0 };
            let decision=json!({"candidateIndex":selected,"gap":"","checks":(0..candidates.len()).map(|i|json!({"candidateIndex":i,"picture":"compatible","text":"compatible","business":"compatible","reason":"synthetic selection fixture only"})).collect::<Vec<_>>()});
            Json(json!({"choices":[{"message":{"content":decision.to_string()}}]}))
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut state = state.clone();
    let mut settings = (*state.settings).clone();
    settings.deepseek_base_url = format!("http://{}", listener.local_addr().unwrap());
    settings.deepseek_api_key = "local-fixture-only".into();
    settings.llm_default_provider = "deepseek".into();
    settings.llm_default_model = "deepseek-chat".into();
    state.settings = Arc::new(settings);
    let provider = tokio::spawn(async move { axum::serve(listener, mock).await.unwrap() });
    let app = build_app(
        state.clone().into(),
        build_cors_layer(&state.settings).unwrap(),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!(
        "http://{}/v1/marketing/content-assets/production/runs/{run}/select-replacement",
        listener.local_addr().unwrap()
    );
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let client = reqwest::Client::new();
    let token =
        crate::marketing::content_assets::handlers::qianchuan_http_route_tests::access_token();
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
    let response = client
        .post(&url)
        .bearer_auth(&token)
        .json(&request)
        .send()
        .await
        .unwrap();
    let status = response.status();
    let result: Value = response.json().await.unwrap();
    assert_eq!(status, 200, "{result}");
    assert_eq!(result["status"], "draft_proposed");
    assert_eq!(result["input"]["clipId"], request["clipId"]);
    assert_eq!(result["promptVersion"], "replacement-selection-v3");
    assert_eq!(result["deliveryApproved"], false);
    assert_eq!(result["draft"]["saved"], false);
    if alternatives {
        let initial = result["decision"]["candidateIndex"].as_u64().unwrap() as usize;
        let adopted = result["adoptedCandidateIndex"].as_u64().unwrap() as usize;
        assert_ne!(initial, adopted);
        assert_eq!(
            result["input"]["candidates"][initial]["replacement"]["startMs"],
            31500
        );
        assert_eq!(
            result["input"]["candidates"][adopted]["replacement"]["startMs"],
            20000
        );
        assert_eq!(result["modelCalls"], 2);
        assert_eq!(
            super::replacement_selection::persisted_choice(&result, &result["input"]).unwrap(),
            adopted
        );
        let mut tampered = result.clone();
        tampered["adoptedCandidateIndex"] = json!(initial);
        assert!(
            super::replacement_selection::persisted_choice(&tampered, &tampered["input"]).is_err()
        );
    }
    assert_eq!(
        client
            .post(&url)
            .bearer_auth(&token)
            .json(&request)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    assert_eq!(count.load(Ordering::SeqCst), 2);
    let stored:Value=sqlx::query_scalar("SELECT receipt->'host_replacement_selection' FROM ads.content_production_jobs WHERE job_id=$1")
        .bind(Uuid::parse_str(request["jobId"].as_str().unwrap()).unwrap()).fetch_one(&state.pool).await.unwrap();
    assert_eq!(stored, result);
    std::fs::write(
        out.join("replacement-selection.json"),
        serde_json::to_vec_pretty(&result).unwrap(),
    )
    .unwrap();
    let job = Uuid::parse_str(request["jobId"].as_str().unwrap()).unwrap();
    let mut negative_checks = Vec::new();
    for verdict in ["uncertain", "conflict"] {
        // Disposable test DB only: isolate alternative model outcomes, restore positive afterward.
        sqlx::query("UPDATE ads.content_production_jobs SET receipt=receipt-'host_replacement_selection' WHERE job_id=$1").bind(job).execute(&state.pool).await.unwrap();
        let reply = client
            .post(url.replace("select-replacement", "repair-replacement"))
            .bearer_auth(&token)
            .json(&request)
            .send()
            .await
            .unwrap();
        let status = reply.status();
        let repair: Value = reply.json().await.unwrap();
        assert_eq!(repair["status"], "evidence_required");
        assert_eq!(repair["selectionReused"], false);
        let blocked:Value=sqlx::query_scalar("SELECT receipt->'host_replacement_selection' FROM ads.content_production_jobs WHERE job_id=$1").bind(job).fetch_one(&state.pool).await.unwrap();
        assert_eq!(status, 200, "{blocked}");
        assert_eq!(blocked["status"], "evidence_required");
        assert!(blocked["draft"].is_null());
        assert_eq!(
            blocked["textReview"]["assessment"]["checks"][0]["verdict"],
            verdict
        );
        assert_eq!(
            client
                .post(url.replace("select-replacement", "apply-replacement"))
                .bearer_auth(&token)
                .json(&request)
                .send()
                .await
                .unwrap()
                .status(),
            409
        );
        let calls_before = count.load(Ordering::SeqCst);
        let reused: Value = client
            .post(url.replace("select-replacement", "repair-replacement"))
            .bearer_auth(&token)
            .json(&request)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(reused["status"], "evidence_required");
        assert_eq!(reused["selectionReused"], true);
        assert_eq!(count.load(Ordering::SeqCst), calls_before);
        let current = super::repository::get(&state.pool, "90000001", run)
            .await
            .unwrap();
        assert_eq!(current.render_job_id, Some(job));
        assert_eq!(
            current.version,
            request["expectedVersion"].as_i64().unwrap() as i32
        );
        negative_checks.push(blocked);
    }
    assert_eq!(count.load(Ordering::SeqCst), 6);
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=jsonb_set(receipt,'{host_replacement_selection}',$2) WHERE job_id=$1").bind(job).bind(&result).execute(&state.pool).await.unwrap();
    std::fs::write(
        out.join("replacement-selection-negative.json"),
        serde_json::to_vec_pretty(&negative_checks).unwrap(),
    )
    .unwrap();
    provider.abort();
    server.abort();
}
