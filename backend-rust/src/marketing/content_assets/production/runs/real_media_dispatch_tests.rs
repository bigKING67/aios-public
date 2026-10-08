//! Saved business plan -> actual Run queue/settlement/freeze/dispatch -> media Worker.
use super::{attempts, repository, tests, types::CreateRunRequest};
use crate::marketing::content_assets::production::{repository as projects, types::Snapshot};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};
use uuid::Uuid;

#[tokio::test]
#[ignore = "explicit saved business evidence and disposable bridge PostgreSQL required"]
async fn real_media_rust_dispatch() {
    let root = PathBuf::from(std::env::var("AIOS_REAL_MEDIA_REPLAY").unwrap());
    let out =
        PathBuf::from(std::env::var("AIOS_CAPTION_BRIDGE_OUTPUT").unwrap()).join("rust-dispatch");
    fs::create_dir_all(&out).unwrap();
    let mut input = fs::read_to_string(root.join("input.json")).unwrap();
    let mut prompt = fs::read_to_string(root.join("planner-request.json")).unwrap();
    let original: Value = serde_json::from_str(&input).unwrap();
    for asset in original["sources"]["assets"].as_array().unwrap() {
        let old = asset["assetId"].as_str().unwrap();
        let new = Uuid::new_v4().to_string();
        input = input.replace(old, &new);
        prompt = prompt.replace(old, &new);
    }
    let input: Value = serde_json::from_str(&input).unwrap();
    let prompt: Value = serde_json::from_str(&prompt).unwrap();
    let mut request: CreateRunRequest = serde_json::from_value(input["request"].clone()).unwrap();
    request.idempotency_key = Uuid::new_v4().to_string();
    request.review_before_production = false;
    request.max_auto_repairs =
        u8::from(std::env::var("AIOS_TEST_AUTO_REPAIR").as_deref() == Ok("true"));
    if std::env::var_os("AIOS_TEST_AUTO_BROWSER_HANDOFF").is_some() {
        request.title = "浏览器自动修订联调".into();
    }
    let mut sources: Snapshot = serde_json::from_value(input["sources"].clone()).unwrap();
    sources.render_binding = Some(super::super::render_binding::current());
    let records: Value = serde_json::from_slice(
        &fs::read(std::env::var("AIOS_REAL_MEDIA_SOURCES").unwrap()).unwrap(),
    )
    .unwrap();
    let pool = tests::database().await;
    let mut files = serde_json::Map::new();
    for asset in &mut sources.assets {
        let record = records
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["sha256"] == asset.sha256)
            .unwrap();
        let path = record["path"].as_str().unwrap();
        assert_eq!(
            hex::encode(Sha256::digest(fs::read(path).unwrap())),
            asset.sha256
        );
        asset.duration_ms = (record["durationSeconds"].as_f64().unwrap() * 1000.0).round() as u32;
        files.insert(asset.object_key.clone(), json!(path));
        sqlx::query("INSERT INTO ads.marketing_content_assets(asset_id,title,asset_status,bucket,raw_object_key,raw_sha256,duration_seconds) VALUES($1,'real replay','ready','fixture',$2,$3,$4)")
            .bind(asset.asset_id).bind(&asset.object_key).bind(&asset.sha256).bind(f64::from(asset.duration_ms)/1000.0).execute(&pool).await.unwrap();
    }
    let state = super::real_media_evidence_fixture::seed(&pool, &input, &sources).await;
    if std::env::var("AIOS_TEST_FULL_SERVICE").as_deref() == Ok("true") {
        super::full_service_fixture::exercise(state, request, &root, &out, prompt, json!(files))
            .await;
        return;
    }
    let owner = "90000001".to_string();
    let browser =
        super::automatic_repair_browser_fixture::BrowserFixture::start(&state, &request).await;
    let (browser, run) = if let Some((browser, run)) = browser {
        (Some(browser), run)
    } else {
        (
            None,
            repository::create(&pool, &owner, &request, &sources)
                .await
                .unwrap(),
        )
    };
    if browser.is_none() {
        attempts::enqueue(&pool, &owner, run.run_id, run.version)
            .await
            .unwrap();
    }
    let state = super::real_media_planner_fixture::exercise(
        state,
        &root,
        &out,
        prompt,
        json!(files),
        run.run_id,
    )
    .await;
    let detail = repository::get(&pool, &owner, run.run_id).await.unwrap();
    assert_eq!(detail.status, "running");
    assert_eq!(detail.stage, "production");
    let frozen = projects::snapshot(
        &pool,
        &owner,
        detail.project_id.unwrap(),
        detail.project_revision.unwrap(),
    )
    .await
    .unwrap();
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_production_run_renders WHERE run_id=$1",
    )
    .bind(run.run_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
    fs::write(
        out.join("frozen-snapshot.json"),
        serde_json::to_vec_pretty(&frozen).unwrap(),
    )
    .unwrap();
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    let daemon =
        if std::env::var("AIOS_TEST_MEDIA_DAEMON").as_deref() == Ok("true") {
            assert_eq!(std::env::var("AIOS_TEST_AUTO_HOST").as_deref(), Ok("true"));
            let daemon = super::media_daemon_fixture::MediaDaemon::start(
                &repo,
                &out,
                &json!({"sources":files,"runId":run.run_id,"work":out.join("work")}),
            );
            super::media_daemon_fixture::MediaDaemon::wait_receipt(&out.join("receipt.json")).await;
            Some(daemon)
        } else {
            let worker = tokio::process::Command::new(
                repo.join("etl/groland_postgres/.venv/bin/python"),
            )
            .env("PYTHONPATH", repo.join("etl/groland_postgres/scripts"))
            .env("AIOS_CAPTION_BRIDGE_OUTPUT", &out)
            .env(
                "AIOS_CAPTION_BRIDGE_FIXTURE",
                json!({"sources":files,"runId":run.run_id,"work":out.join("work")}).to_string(),
            )
            .arg(repo.join(
                "etl/groland_postgres/tests/content_production/caption_render_bridge_fixture.py",
            ))
            .output()
            .await
            .unwrap();
            assert!(
                worker.status.success(),
                "{} {}",
                String::from_utf8_lossy(&worker.stdout),
                String::from_utf8_lossy(&worker.stderr)
            );
            None
        };
    let completed = repository::get(&pool, &owner, run.run_id).await.unwrap();
    assert_eq!(
        completed.waiting_reason.as_deref(),
        Some("caption_quality_pending")
    );
    super::selected_review_http_fixture::exercise(
        &state,
        run.run_id,
        detail.render_job_id.unwrap(),
        &out,
    )
    .await;
    let live_review = std::env::var("AIOS_TEST_SELECTED_SEMANTIC").as_deref() == Ok("live");
    // A live review run has a two-call budget; never cascade into another live render review.
    if !live_review {
        super::replacement_apply_fixture::exercise(&state, run.run_id, json!(files), &out, &repo)
            .await;
    }
    if let Some(daemon) = daemon {
        daemon.finish(&out).await;
    }
    let evidence: Value =
        serde_json::from_slice(&fs::read(out.join("receipt.json")).unwrap()).unwrap();
    let live_calls = if live_review {
        evidence["job"]["receipt"]["host_selected_semantic_review"]["callsReserved"]
            .as_u64()
            .unwrap()
    } else {
        0
    };
    fs::write(out.join("dispatch.json"), serde_json::to_vec_pretty(&json!({"runId":run.run_id,"jobId":detail.render_job_id,"renderJobs":count,"plannerIdleAfterDispatch":true,"status":completed.status,"stage":completed.stage,"waitingReason":completed.waiting_reason,"liveModelCalls":live_calls,"scope":"saved model decision and cached evidence; full planner.step with DB retrieval and loopback provider; actual Rust settlement and dispatch; actual Worker; local storage fixture"})).unwrap()).unwrap();
    if let Some(browser) = browser {
        browser.wait_for_readback().await;
    }
}
