use crate::{cors::build_cors_layer, routes::build_app, state::AppState};
use serde_json::{json, Value};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};
use uuid::Uuid;

pub(super) async fn exercise(state: &AppState, run: Uuid, files: Value, out: &Path, repo: &Path) {
    let selection_file = out.join("replacement-selection.json");
    if !selection_file.exists() {
        assert_ne!(
            std::env::var("AIOS_TEST_REPAIR_FRESH").as_deref(),
            Ok("true"),
            "repair acceptance requires a conflict and a persisted selection"
        );
        return;
    }
    let selection: Value = serde_json::from_slice(&std::fs::read(selection_file).unwrap()).unwrap();
    let automatic = std::env::var("AIOS_TEST_AUTO_REPAIR").as_deref() == Ok("true");
    let background = std::env::var("AIOS_TEST_AUTO_HOST").as_deref() == Ok("true");
    assert!(
        !background || automatic,
        "host acceptance requires automatic repair"
    );
    let mut host = None;
    let fresh = std::env::var("AIOS_TEST_REPAIR_FRESH").as_deref() == Ok("true");
    let calls = Arc::new(AtomicUsize::new(0));
    let mut state = state.clone();
    let provider = if fresh {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut settings = (*state.settings).clone();
        settings.deepseek_base_url = format!("http://{}", listener.local_addr().unwrap());
        settings.deepseek_api_key = "local-fixture-only".into();
        settings.llm_default_provider = "deepseek".into();
        settings.llm_default_model = "deepseek-chat".into();
        state.settings = Arc::new(settings);
        let outputs = [
            selection["decision"].clone(),
            selection["textReview"]["response"].clone(),
        ];
        let count = calls.clone();
        let mock =
            axum::Router::new().route(
                "/chat/completions",
                axum::routing::post(move || {
                    let value = outputs
                        .get(count.fetch_add(1, Ordering::SeqCst))
                        .expect("no third call")
                        .clone();
                    async move {
                        axum::Json(json!({"choices":[{"message":{"content":value.to_string()}}]}))
                    }
                }),
            );
        Some(tokio::spawn(async move {
            axum::serve(listener, mock).await.unwrap()
        }))
    } else {
        None
    };
    let before = super::repository::get(&state.pool, "90000001", run)
        .await
        .unwrap();
    let source_job = before.render_job_id.unwrap();
    let mut db = state.pool.acquire().await.unwrap();
    let old = super::repository::plan(&mut db, run, before.plan_revision)
        .await
        .unwrap()
        .unwrap();
    drop(db);
    let app = build_app(
        state.clone().into(),
        build_cors_layer(&state.settings).unwrap(),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!(
        "http://{}/v1/marketing/content-assets/production/runs/{run}",
        listener.local_addr().unwrap()
    );
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let client = reqwest::Client::new();
    let token =
        crate::marketing::content_assets::handlers::qianchuan_http_route_tests::access_token();
    let request = json!({"expectedVersion":before.version,"expectedPlanRevision":before.plan_revision,"jobId":source_job,"clipId":selection["input"]["clipId"]});
    let apply = format!("{url}/apply-replacement");
    assert_eq!(
        client
            .post(&apply)
            .json(&request)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    for route in ["repair-replacement"] {
        assert_eq!(
            client
                .post(format!("{url}/{route}"))
                .json(&request)
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
    }
    let mut stale = request.clone();
    stale["expectedVersion"] = json!(before.version + 1);
    assert_eq!(
        client
            .post(&apply)
            .bearer_auth(&token)
            .json(&stale)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    let original_receipt: Value =
        sqlx::query_scalar("SELECT receipt FROM ads.content_production_jobs WHERE job_id=$1")
            .bind(source_job)
            .fetch_one(&state.pool)
            .await
            .unwrap();
    for case in ["missing_selection", "changed_draft", "unfinished_selection"] {
        let mut bad = original_receipt.clone();
        if case == "missing_selection" {
            bad.as_object_mut()
                .unwrap()
                .remove("host_replacement_selection");
        } else if case == "unfinished_selection" {
            bad["host_replacement_selection"]["status"] = json!("reserved_outcome_unknown");
        } else {
            bad["host_replacement_selection"]["draft"]["saved"] = json!(true);
        }
        sqlx::query("UPDATE ads.content_production_jobs SET receipt=$2 WHERE job_id=$1")
            .bind(source_job)
            .bind(bad)
            .execute(&state.pool)
            .await
            .unwrap();
        assert_eq!(
            client
                .post(&apply)
                .bearer_auth(&token)
                .json(&request)
                .send()
                .await
                .unwrap()
                .status(),
            409,
            "{case}"
        );
        if case != "missing_selection" {
            assert_eq!(
                client
                    .post(format!("{url}/repair-replacement"))
                    .bearer_auth(&token)
                    .json(&request)
                    .send()
                    .await
                    .unwrap()
                    .status(),
                409,
                "{case}"
            );
        }
    }
    sqlx::query("UPDATE ads.content_production_jobs SET receipt=$2 WHERE job_id=$1")
        .bind(source_job)
        .bind(original_receipt)
        .execute(&state.pool)
        .await
        .unwrap();
    let repair = format!("{url}/repair-replacement");
    if fresh {
        sqlx::query("UPDATE ads.content_production_jobs SET receipt=receipt-'host_replacement_selection' WHERE job_id=$1")
            .bind(source_job).execute(&state.pool).await.unwrap();
    }
    let body: Value = if automatic {
        // Disposable DB only: prove disabled and paused tasks cannot start calls.
        sqlx::query("UPDATE ads.content_production_runs SET request=jsonb_set(request,'{maxAutoRepairs}','0') WHERE run_id=$1").bind(run).execute(&state.pool).await.unwrap();
        assert!(!super::automatic_repair::step(&state).await.unwrap());
        sqlx::query("UPDATE ads.content_production_runs SET request=jsonb_set(request,'{maxAutoRepairs}','1'),status='paused' WHERE run_id=$1").bind(run).execute(&state.pool).await.unwrap();
        assert!(!super::automatic_repair::step(&state).await.unwrap());
        sqlx::query("UPDATE ads.content_production_runs SET status='waiting' WHERE run_id=$1")
            .bind(run)
            .execute(&state.pool)
            .await
            .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        // A crashed claimant has a durable receipt; another connection cannot reclaim it.
        assert!(super::automatic_repair::claim(&state.pool)
            .await
            .unwrap()
            .is_some());
        let restarted = super::tests::database().await;
        assert!(super::automatic_repair::claim(&restarted)
            .await
            .unwrap()
            .is_none());
        sqlx::query("UPDATE ads.content_production_jobs SET receipt=receipt-'host_auto_repair' WHERE job_id=$1").bind(source_job).execute(&state.pool).await.unwrap();
        if background {
            // Keep the task paused across several real host scan intervals first.
            sqlx::query("UPDATE ads.content_production_runs SET status='paused' WHERE run_id=$1")
                .bind(run)
                .execute(&state.pool)
                .await
                .unwrap();
            let running = super::automatic_repair_host_fixture::Host::start(&state, out).await;
            running.observe_quiet().await;
            assert_eq!(calls.load(Ordering::SeqCst), 0);
            let reserved: bool = sqlx::query_scalar("SELECT receipt ? 'host_auto_repair' FROM ads.content_production_jobs WHERE job_id=$1")
                .bind(source_job).fetch_one(&state.pool).await.unwrap();
            assert!(!reserved);
            sqlx::query("UPDATE ads.content_production_runs SET status='waiting' WHERE run_id=$1")
                .bind(run)
                .execute(&state.pool)
                .await
                .unwrap();
            running.wait_for_repair(&state, source_job).await;
            host = Some(running);
        } else {
            let (a, b) = tokio::join!(
                super::automatic_repair::step(&state),
                super::automatic_repair::step(&state)
            );
            assert_eq!(usize::from(a.unwrap()) + usize::from(b.unwrap()), 1);
        }
        let receipt: Value = sqlx::query_scalar(
            "SELECT receipt->'host_auto_repair' FROM ads.content_production_jobs WHERE job_id=$1",
        )
        .bind(source_job)
        .fetch_one(&state.pool)
        .await
        .unwrap();
        assert_eq!(receipt["status"], "production_queued", "{receipt}");
        receipt
    } else {
        let response = client
            .post(&repair)
            .bearer_auth(&token)
            .json(&request)
            .send()
            .await
            .unwrap();
        let status = response.status();
        let body: Value = response.json().await.unwrap();
        assert_eq!(status, 200, "{body}");
        assert_eq!(body["status"], "production_queued");
        assert_eq!(body["selectionReused"], !fresh);
        body
    };
    assert_eq!(body["deliveryApproved"], false);
    assert_eq!(calls.load(Ordering::SeqCst), if fresh { 2 } else { 0 });
    assert_eq!(body["deliveryApproved"], false);
    assert_eq!(
        client
            .post(&apply)
            .bearer_auth(&token)
            .json(&request)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    assert_eq!(
        client
            .post(&repair)
            .bearer_auth(&token)
            .json(&request)
            .send()
            .await
            .unwrap()
            .status(),
        409
    );
    std::fs::write(
        out.join("repair-api.json"),
        serde_json::to_vec_pretty(&body).unwrap(),
    )
    .unwrap();
    let next = super::repository::get(&state.pool, "90000001", run)
        .await
        .unwrap();
    assert_eq!(next.status, "running");
    assert_eq!(next.plan_revision, before.plan_revision + 1);
    assert_ne!(next.render_job_id, Some(source_job));
    assert!(next.project_revision > before.project_revision);
    let mut db = state.pool.acquire().await.unwrap();
    let retained = super::repository::plan(&mut db, run, before.plan_revision)
        .await
        .unwrap()
        .unwrap();
    let revised = super::repository::plan(&mut db, run, next.plan_revision)
        .await
        .unwrap()
        .unwrap();
    drop(db);
    assert_eq!(
        serde_json::to_value(old.document).unwrap(),
        serde_json::to_value(retained.document).unwrap()
    );
    assert_eq!(
        serde_json::to_value(revised.document).unwrap(),
        selection["draft"]["revisionRequest"]["document"]
    );
    let revision_out = out.join("replacement-render");
    std::fs::create_dir_all(&revision_out).unwrap();
    if std::env::var("AIOS_TEST_MEDIA_DAEMON").as_deref() == Ok("true") {
        super::media_daemon_fixture::MediaDaemon::wait_receipt(&revision_out.join("receipt.json"))
            .await;
    } else {
        let worker=tokio::process::Command::new(repo.join("etl/groland_postgres/.venv/bin/python"))
        .env("PYTHONPATH",repo.join("etl/groland_postgres/scripts"))
        .env("AIOS_CAPTION_BRIDGE_OUTPUT",&revision_out)
        .env("AIOS_CAPTION_BRIDGE_FIXTURE",json!({"sources":files,"runId":run,"work":revision_out.join("work"),"selectedText":"再加上很多护肤级的成分"}).to_string())
        .arg(repo.join("etl/groland_postgres/tests/content_production/caption_render_bridge_fixture.py"))
        .output().await.unwrap();
        assert!(
            worker.status.success(),
            "{} {}",
            String::from_utf8_lossy(&worker.stdout),
            String::from_utf8_lossy(&worker.stderr)
        );
    }
    let audio = |video: std::path::PathBuf| async move {
        let result = tokio::process::Command::new("ffmpeg")
            .args(["-v", "error", "-i"])
            .arg(video)
            .args(["-map", "0:a:0", "-f", "s16le", "-acodec", "pcm_s16le", "-"])
            .output()
            .await
            .unwrap();
        assert!(result.status.success());
        assert!(!result.stdout.is_empty());
        result.stdout
    };
    assert_eq!(
        audio(out.join("video.mp4")).await,
        audio(revision_out.join("video.mp4")).await
    );
    let after = super::repository::get(&state.pool, "90000001", run)
        .await
        .unwrap();
    assert_eq!(
        after.waiting_reason.as_deref(),
        Some("caption_quality_pending")
    );
    let output: Value = client
        .get(format!("{url}/result"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(output["ready"], false);
    assert_eq!(
        output["selectedReview"]["followUp"]["binding"]["jobId"],
        json!(next.render_job_id)
    );
    assert_ne!(
        output["selectedReview"]["followUp"]["binding"]["outputSha256"],
        selection["binding"]["outputSha256"]
    );
    assert_eq!(
        output["selectedReview"]["entries"][0]["visibleText"]["texts"][0],
        "再加上很多护肤级的成分"
    );
    if automatic {
        if let Some(host) = &host {
            host.observe_quiet().await;
            let reserved: bool = sqlx::query_scalar("SELECT receipt ? 'host_auto_repair' FROM ads.content_production_jobs WHERE job_id=$1")
                .bind(next.render_job_id.unwrap()).fetch_one(&state.pool).await.unwrap();
            assert!(!reserved, "exhausted host must not reserve the second job");
        } else {
            assert!(
                !super::automatic_repair::step(&state).await.unwrap(),
                "one-round budget exhausted even though new output still conflicts"
            );
        }
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_production_run_renders WHERE run_id=$1",
    )
    .bind(run)
    .fetch_one(&state.pool)
    .await
    .unwrap();
    assert_eq!(count, 2);
    std::fs::write(
        revision_out.join("result-api.json"),
        serde_json::to_vec_pretty(&output).unwrap(),
    )
    .unwrap();
    std::fs::write(revision_out.join("apply-checks.json"),serde_json::to_vec_pretty(&json!({"oldJobId":source_job,"newJobId":next.render_job_id,"oldPlanPreserved":true,"decodedAudioUnchanged":true,"planRevision":next.plan_revision,"renderJobs":count,"repeatedApply":409,"deliveryApproved":false,"semanticEvidence":"fixture only"})).unwrap()).unwrap();
    if let Some(host) = host {
        let service = host.service_result(run).await;
        if let Some(ref result) = service {
            assert_eq!(result["ready"], false);
            assert_eq!(result["automaticRepair"], output["automaticRepair"]);
            std::fs::write(
                out.join("service-result.json"),
                serde_json::to_vec_pretty(result).unwrap(),
            )
            .unwrap();
        }
        std::fs::write(
            out.join("host-checks.json"),
            serde_json::to_vec_pretty(&json!({
                "driver":if service.is_some() {"backend binary startup::run"} else {"planner::spawn"}, "serviceHealthChecked":service.is_some(), "disabledFlagsChecked":3,
                "pausedObservationSeconds":7, "exhaustedObservationSeconds":7,
                "selectionCalls":calls.load(Ordering::SeqCst), "renderJobs":count,
                "exhaustedJobUnclaimed":true, "deliveryApproved":false,
                "scope":"isolated DB and mock provider; real rendering; bounded loop observation"
            }))
            .unwrap(),
        )
        .unwrap();
        drop(host);
    }
    if let Some(provider) = provider {
        provider.abort();
    }
    server.abort();
}
