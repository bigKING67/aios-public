//! Controlled loopback provider: observe real HTTP admission, dispatch and revocation.
use super::{http_fixture::poll_plan, planner, repository as repo};
use crate::state::AppState;
use axum::{routing::post, Json, Router};
use reqwest::Client;
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

async fn submit(client: &Client, base: &str, token: &str, asset: &str) -> String {
    let input = json!({"idempotencyKey":Uuid::new_v4().to_string(),"title":"后台规划隔离验收","brief":"使用完整原片台词","taskType":"talking_head","assetIds":[asset],"aspect":"portrait","targetSeconds":10,"rightsConfirmed":true,"modelCallConfirmed":true});
    let created: Value = client
        .post(format!("{base}/runs"))
        .bearer_auth(token)
        .json(&input)
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let url = format!("{base}/runs/{}", created["run"]["runId"].as_str().unwrap());
    // The provider cannot respond until the test releases it. HTTP must not wait.
    let admitted: Value = tokio::time::timeout(Duration::from_secs(5), async {
        client
            .post(format!("{url}/plan"))
            .bearer_auth(token)
            .json(&json!({"expectedVersion":1}))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json()
            .await
            .unwrap()
    })
    .await
    .expect("HTTP blocked on provider instead of durable admission");
    assert_eq!(admitted["run"]["status"], "running");
    assert_eq!(admitted["run"]["version"], 2);
    assert!(admitted["plan"].is_null());
    url
}

async fn calls_reach(calls: &AtomicUsize, expected: usize) {
    tokio::time::timeout(Duration::from_secs(10), async {
        while calls.load(Ordering::SeqCst) < expected {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), expected);
}

async fn failed(state: &AppState, client: &Client, url: &str, token: &str) {
    assert!(planner::step(state).await.unwrap());
    let value = poll_plan(client, url, token).await;
    assert_eq!(value["run"]["waitingReason"], "planning_failed");
    assert!(value["plan"].is_null());
}

pub(in crate::marketing::content_assets::production) async fn exercise(
    original: &AppState,
    client: &Client,
    base: &str,
    token: &str,
    asset: &str,
) {
    let calls = Arc::new(AtomicUsize::new(0));
    let (dispatches, mut requests) = mpsc::unbounded_channel::<oneshot::Sender<()>>();
    let counter = Arc::clone(&calls);
    let model = Router::new().route("/chat/completions", post(move || {
        let (counter, dispatches) = (Arc::clone(&counter), dispatches.clone());
        async move {
            counter.fetch_add(1, Ordering::SeqCst);
            let (release, pending) = oneshot::channel();
            dispatches.send(release).unwrap();
            let _ = pending.await;
            Json(json!({"choices":[{"message":{"content":json!({"shots":[{"candidateId":0,"reason":"原片台词"}],"gaps":["补充画面"]}).to_string()}}]}))
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut settings = (*original.settings).clone();
    settings.deepseek_base_url = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move { axum::serve(listener, model).await.unwrap() });
    let mut worker_state = original.clone();
    worker_state.settings = Arc::new(settings);
    let state = Arc::new(worker_state);
    let pool = &state.pool;

    let paused = submit(client, base, token, asset).await;
    let id = Uuid::parse_str(paused.rsplit('/').next().unwrap()).unwrap();
    let owner: String =
        sqlx::query_scalar("SELECT owner_user_id FROM ads.content_production_runs WHERE run_id=$1")
            .bind(id)
            .fetch_one(pool)
            .await
            .unwrap();
    client
        .post(format!("{paused}/pause"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":2}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    assert!(!planner::step(&state).await.unwrap());
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    client
        .post(format!("{paused}/resume"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":3}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    sqlx::query("UPDATE public.auth_users SET is_active=FALSE WHERE id=$1::TEXT::BIGINT")
        .bind(&owner)
        .execute(pool)
        .await
        .unwrap();
    assert!(planner::step(&state).await.unwrap());
    assert_eq!(
        repo::get(pool, &owner, id)
            .await
            .unwrap()
            .waiting_reason
            .as_deref(),
        Some("planning_failed")
    );
    sqlx::query("UPDATE public.auth_users SET is_active=TRUE WHERE id=$1::TEXT::BIGINT")
        .bind(&owner)
        .execute(pool)
        .await
        .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 0);

    let denied = submit(client, base, token, asset).await;
    sqlx::query("UPDATE public.auth_roles SET name='revoked_fixture' WHERE name='content_ops'")
        .execute(pool)
        .await
        .unwrap();
    failed(&state, client, &denied, token).await;
    sqlx::query("UPDATE public.auth_roles SET name='content_ops' WHERE name='revoked_fixture'")
        .execute(pool)
        .await
        .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 0);

    let source_denied = submit(client, base, token, asset).await;
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET repurpose_allowed=FALSE WHERE asset_id=$1::UUID",
    )
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    failed(&state, client, &source_denied, token).await;
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET repurpose_allowed=TRUE WHERE asset_id=$1::UUID",
    )
    .bind(asset)
    .execute(pool)
    .await
    .unwrap();
    assert_eq!(calls.load(Ordering::SeqCst), 0);

    // Revoke while the provider is executing: returned content must not activate.
    let late_denied = submit(client, base, token, asset).await;
    let worker = {
        let state = Arc::clone(&state);
        tokio::spawn(async move { planner::step(&state).await.unwrap() })
    };
    calls_reach(&calls, 1).await;
    let release = requests.recv().await.unwrap();
    sqlx::query("UPDATE public.auth_roles SET name='revoked_fixture' WHERE name='content_ops'")
        .execute(pool)
        .await
        .unwrap();
    let _ = release.send(());
    assert!(worker.await.unwrap());
    let value = poll_plan(client, &late_denied, token).await;
    assert_eq!(value["run"]["waitingReason"], "planning_failed");
    assert!(value["plan"].is_null());
    sqlx::query("UPDATE public.auth_roles SET name='content_ops' WHERE name='revoked_fixture'")
        .execute(pool)
        .await
        .unwrap();

    // Lose the executing worker after the provider accepted the request. A new
    // worker recovers expired state but makes no second external request.
    let interrupted = submit(client, base, token, asset).await;
    let worker = {
        let state = Arc::clone(&state);
        tokio::spawn(async move { planner::step(&state).await.unwrap() })
    };
    calls_reach(&calls, 2).await;
    let release = requests.recv().await.unwrap();
    worker.abort();
    assert!(worker.await.unwrap_err().is_cancelled());
    let _ = release.send(());
    let id = Uuid::parse_str(interrupted.rsplit('/').next().unwrap()).unwrap();
    sqlx::query("UPDATE ads.content_production_plan_attempts SET expires_at=NOW()-INTERVAL '1 second' WHERE run_id=$1 AND status='running'")
        .bind(id).execute(pool).await.unwrap();
    assert!(!planner::step(&state).await.unwrap());
    let value = poll_plan(client, &interrupted, token).await;
    assert_eq!(value["run"]["waitingReason"], "planning_failed");
    assert!(value["plan"].is_null());
    assert_eq!(calls.load(Ordering::SeqCst), 2);

    let cancelled = submit(client, base, token, asset).await;
    let worker = {
        let state = Arc::clone(&state);
        tokio::spawn(async move { planner::step(&state).await.unwrap() })
    };
    calls_reach(&calls, 3).await;
    let release = requests.recv().await.unwrap();
    client
        .post(format!("{cancelled}/cancel"))
        .bearer_auth(token)
        .json(&json!({"expectedVersion":2}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let _ = release.send(());
    assert!(worker.await.unwrap());
    let value = poll_plan(client, &cancelled, token).await;
    assert_eq!(value["run"]["status"], "cancelled");
    assert!(value["plan"].is_null());

    let automatic = submit(client, base, token, asset).await;
    let mut disabled = (*state).clone();
    let mut flags = (*disabled.settings).clone();
    flags.content_production_planning_enabled = false;
    disabled.settings = Arc::new(flags);
    assert!(!planner::step(&disabled).await.unwrap());
    assert!(planner::spawn(Arc::new(disabled)).is_empty());
    let handles = planner::spawn(Arc::clone(&state));
    calls_reach(&calls, 4).await;
    let release = requests.recv().await.unwrap();
    let _ = release.send(());
    let value = poll_plan(client, &automatic, token).await;
    assert_eq!(value["run"]["waitingReason"], "missing_material");
    assert!(value["plan"].is_object());
    assert_eq!(calls.load(Ordering::SeqCst), 4);
    for handle in handles {
        handle.abort();
        let _ = handle.await;
    }
    server.abort();
    let _ = server.await;
    eprintln!("background planning HTTP: queued/pause/disabled/account/permission/source/revocation/interruption/cancel/automatic PASS; provider calls=4");
}
