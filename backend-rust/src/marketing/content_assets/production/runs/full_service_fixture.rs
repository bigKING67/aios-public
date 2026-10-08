//! Existing cached evidence, actual service create/plan, daemon render and repair.
use super::{
    media_daemon_fixture::MediaDaemon, service_process_fixture::Service, types::CreateRunRequest,
};
use crate::state::AppState;
use axum::{routing::post, Json, Router};
use serde_json::{json, Value};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
use uuid::Uuid;

pub(super) async fn exercise(
    mut state: AppState,
    mut request: CreateRunRequest,
    root: &Path,
    out: &Path,
    expected: Value,
    files: Value,
) {
    let continuation = std::env::var("AIOS_TEST_PLAN_CONTINUATION").as_deref() == Ok("true");
    if continuation {
        request.review_before_production = true;
        request.max_auto_repairs = 0;
    }
    let load =
        |name| serde_json::from_slice::<Value>(&std::fs::read(root.join(name)).unwrap()).unwrap();
    let plan = load("model-plan.json");
    let review = load("review-model-plan.json");
    let count = Arc::new(AtomicUsize::new(0));
    let calls = count.clone();
    let artifacts = out.to_path_buf();
    let provider = Router::new().route("/chat/completions", post(move |Json(body): Json<Value>| {
        let (plan, mut review, calls, expected, artifacts) = (plan.clone(), review.clone(), calls.clone(), expected.clone(), artifacts.clone());
        async move {
            let index = calls.fetch_add(1, Ordering::SeqCst);
            let input: Value = serde_json::from_str(body["messages"][1]["content"].as_str().unwrap()).unwrap();
            std::fs::write(artifacts.join(format!("full-provider-{index}.json")), serde_json::to_vec_pretty(&input).unwrap()).unwrap();
            let answer = match index {
                2 if continuation => {
                    assert_eq!(input["continuation"]["fromPlanRevision"],1);
                    assert!(!input["continuation"]["previousDocument"]["gaps"].as_array().unwrap().is_empty());
                    plan
                },
                3 if continuation => {
                    review["checks"][0]["clipId"] = input["windows"][0]["clipId"].clone();
                    review
                },
                0 => {
                    assert_eq!(input["brief"], expected["userPrompt"]["brief"]);
                    assert_eq!(input["slots"], expected["userPrompt"]["slots"]);
                    plan
                },
                1 => {
                    assert_eq!(input["windows"].as_array().unwrap().len(), 1);
                    review["checks"][0]["clipId"] = input["windows"][0]["clipId"].clone();
                    if continuation { review["checks"][0]["verdict"]=json!("conflict"); }
                    review
                },
                2 => json!({"candidateIndex":0,"checks":[{"business":"compatible","candidateIndex":0,"picture":"compatible","text":"compatible","reason":"synthetic fixture only"}],"gap":""}),
                3 => json!({"checks":[{"clipId":"replacement-candidate-0","reason":"synthetic independent verdict","verdict":"compatible"}]}),
                _ => panic!("unexpected extra model call"),
            };
            Json(json!({"choices":[{"message":{"content":answer.to_string()}}]}))
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let settings = Arc::make_mut(&mut state.settings);
    settings.deepseek_base_url = format!("http://{}", listener.local_addr().unwrap());
    settings.deepseek_api_key = "local-fixture-only".into();
    settings.llm_default_model = "deepseek-chat".into();
    settings.deepseek_model = "deepseek-chat".into();
    let model = tokio::spawn(async move { axum::serve(listener, provider).await.unwrap() });
    let service = Service::start(
        &state,
        out,
        &std::env::var("AIOS_TEST_SERVICE_BINARY").unwrap(),
    )
    .await;
    let body = serde_json::to_value(&request).unwrap();
    let created = service.post("runs", &body).await;
    let run: Uuid = serde_json::from_value(created["run"]["runId"].clone()).unwrap();
    let replay = service.post("runs", &body).await;
    assert_eq!(created["run"]["runId"], replay["run"]["runId"]);
    service
        .post(
            &format!("runs/{run}/plan"),
            &json!({"expectedVersion":created["run"]["version"]}),
        )
        .await;
    let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let daemon = (!continuation).then(|| {
        MediaDaemon::start(
            repo,
            out,
            &json!({"sources":files,"runId":run,"work":out.join("work")}),
        )
    });
    preflight(&state, &service, repo, run, &files, out).await;
    if continuation {
        let first = wait_plan(&state, run, 1).await;
        assert_eq!(first.waiting_reason.as_deref(), Some("missing_material"));
        let body = json!({"expectedVersion":first.version});
        let queued = service.post(&format!("runs/{run}/plan"), &body).await;
        assert_eq!(
            queued["run"]["executionVersion"],
            first.execution_version + 1
        );
        assert_eq!(queued["run"]["planRevision"], 1);
        let token =
            crate::marketing::content_assets::handlers::qianchuan_http_route_tests::access_token();
        let duplicate = reqwest::Client::new()
            .post(format!(
                "{}/v1/marketing/content-assets/production/runs/{run}/plan",
                service.base
            ))
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .unwrap();
        assert_eq!(duplicate.status(), 409);
        let next_out = out.join("continuation-2");
        std::fs::create_dir_all(&next_out).unwrap();
        preflight(&state, &service, repo, run, &files, &next_out).await;
        let second = wait_plan(&state, run, 2).await;
        assert_eq!(second.execution_version, first.execution_version + 1);
        assert_eq!(
            second.waiting_reason.as_deref(),
            Some("awaiting_plan_confirmation")
        );
        assert!(second.render_job_id.is_none());
        assert_eq!(count.load(Ordering::SeqCst), 4);
        let mut db = state.pool.acquire().await.unwrap();
        let old = super::repository::plan(&mut db, run, 1)
            .await
            .unwrap()
            .unwrap();
        let new = super::repository::plan(&mut db, run, 2)
            .await
            .unwrap()
            .unwrap();
        assert!(!old.document.gaps.is_empty());
        assert!(new.document.gaps.is_empty());
        std::fs::write(out.join("continuation-service-checks.json"),serde_json::to_vec_pretty(&json!({
            "runId":run,"driver":"formal service POST create/plan/plan; persistent planner",
            "oldPlanRetained":true,"planRevision":2,"duplicateStatus":409,"modelFixtureCalls":4,
            "waitingReason":second.waiting_reason,"renderJob":null,"paidCalls":0,"deliveryApproved":false})).unwrap()).unwrap();
        drop(db);
        if std::env::var("AIOS_TEST_CONTINUATION_RENDER").as_deref() == Ok("true") {
            let produced = service.post(&format!("runs/{run}/produce"), &json!({
                "expectedVersion":second.version,"expectedPlanRevision":2,"expectedProjectRevision":null})).await;
            let job: Uuid = serde_json::from_value(produced["run"]["renderJobId"].clone()).unwrap();
            let daemon = MediaDaemon::start(
                repo,
                out,
                &json!({"sources":files,"runId":run,"work":out.join("work")}),
            );
            MediaDaemon::wait_receipt(&out.join("receipt.json")).await;
            daemon.finish_jobs(out, 1).await;
            let linked:(i32,i32,Value)=sqlx::query_as("SELECT l.plan_revision,l.execution_version,r.snapshot FROM ads.content_production_run_renders l JOIN ads.content_production_jobs j ON j.job_id=l.job_id JOIN ads.content_production_revisions r ON r.project_id=j.project_id AND r.revision=j.revision WHERE l.run_id=$1 AND l.job_id=$2")
                .bind(run).bind(job).fetch_one(&state.pool).await.unwrap();
            assert_eq!(linked.0, 2);
            assert_eq!(linked.1, second.execution_version + 1);
            let expected = super::picture_remix::edit_document(&second, &new.document)
                .unwrap()
                .unwrap();
            assert_eq!(linked.2["editDocument"]["clips"], expected["clips"]);
            let result = service.read_result(run).await;
            assert_eq!(result["ready"], false);
            assert_eq!(count.load(Ordering::SeqCst), 4);
            std::fs::write(
                out.join("continuation-render-result.json"),
                serde_json::to_vec_pretty(&result).unwrap(),
            )
            .unwrap();
            std::fs::write(
                out.join("continuation-render-snapshot.json"),
                serde_json::to_vec_pretty(&linked.2).unwrap(),
            )
            .unwrap();
            std::fs::write(out.join("continuation-render-checks.json"),serde_json::to_vec_pretty(&json!({
                "planRevision":linked.0,"executionVersion":linked.1,"jobId":job,"snapshotMatchesSecondPlan":true,
                "workerCompletedJobs":1,"ready":false,"paidCalls":0,"deliveryApproved":false})).unwrap()).unwrap();
        }
        service.check().await;
        model.abort();
        return;
    }
    MediaDaemon::wait_receipt(&out.join("replacement-render/receipt.json")).await;
    daemon.unwrap().finish(out).await;
    service.check().await;
    let result = service.read_result(run).await;
    assert_eq!(result["ready"], false);
    assert_eq!(result["automaticRepair"]["roundsReserved"], 1);
    assert_eq!(result["automaticRepair"]["budgetExhausted"], true);
    assert_eq!(
        result["automaticRepair"]["latestStatus"],
        "production_queued"
    );
    assert_eq!(count.load(Ordering::SeqCst), 4);
    let jobs: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_production_run_renders WHERE run_id=$1",
    )
    .bind(run)
    .fetch_one(&state.pool)
    .await
    .unwrap();
    assert_eq!(jobs, 2);
    let detail = super::repository::get(&state.pool, "90000001", run)
        .await
        .unwrap();
    assert_eq!(detail.plan_revision, 2);
    let audio = |video: std::path::PathBuf| async move {
        let result = tokio::process::Command::new("ffmpeg")
            .args(["-v", "error", "-i"])
            .arg(video)
            .args(["-map", "0:a:0", "-f", "s16le", "-acodec", "pcm_s16le", "-"])
            .output()
            .await
            .unwrap();
        assert!(result.status.success() && !result.stdout.is_empty());
        result.stdout
    };
    assert_eq!(
        audio(out.join("video.mp4")).await,
        audio(out.join("replacement-render/video.mp4")).await
    );
    std::fs::write(
        out.join("full-service-result.json"),
        serde_json::to_vec_pretty(&result).unwrap(),
    )
    .unwrap();
    std::fs::write(
        out.join("full-service-checks.json"),
        serde_json::to_vec_pretty(&json!({
            "runId":run,"driver":"formal service POST create/plan; no direct planner/repair step",
            "createIdempotent":true,"planRevision":2,"renderJobs":jobs,"modelFixtureCalls":4,
            "decodedAudioUnchanged":true,"paidCalls":0,"deliveryApproved":false,
            "preflight":"single local adapter; real service authorization; synthetic observations"
        }))
        .unwrap(),
    )
    .unwrap();
    model.abort();
}

async fn wait_plan(state: &AppState, run: Uuid, revision: i32) -> super::types::Run {
    tokio::time::timeout(Duration::from_secs(90), async {
        loop {
            let current = super::repository::get(&state.pool, "90000001", run)
                .await
                .unwrap();
            if current.plan_revision == revision && current.active_attempt.is_none() {
                break current;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    })
    .await
    .expect("formal service plan did not settle")
}
async fn preflight(
    state: &AppState,
    service: &Service,
    repo: &Path,
    run: Uuid,
    files: &Value,
    out: &Path,
) {
    // The preflight adapter supplies local observations through the real permission API.
    // Do not force attempt expiration or directly call planner/repair steps.
    let key: String = tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            let key: Option<String> = sqlx::query_scalar("SELECT input_object_key FROM ads.marketing_content_asset_processing_jobs WHERE metadata->'caption_request'->>'runId'=$1 AND status='queued'")
                .bind(run.to_string()).fetch_optional(&state.pool).await.unwrap();
            if let Some(key) = key { break key; }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }).await.expect("service did not enqueue preflight");
    let preflight = tokio::process::Command::new(repo.join("etl/groland_postgres/.venv/bin/python"))
        .env("PYTHONPATH", repo.join("etl/groland_postgres/scripts"))
        .env("AIOS_CAPTION_BRIDGE_FIXTURE", json!({"base":format!("{}/v1/marketing/content-assets/production",service.base),"media":files[&key],"objectKey":key,"work":out.join("preflight"),"text":"cached observation fixture"}).to_string())
        .arg(repo.join("etl/groland_postgres/tests/content_production/caption_worker_bridge_fixture.py"))
        .output().await.unwrap();
    assert!(
        preflight.status.success(),
        "{}",
        String::from_utf8_lossy(&preflight.stderr)
    );
}
