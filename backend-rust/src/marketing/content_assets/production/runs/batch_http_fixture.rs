//! Opt-in bounded batch: real API/queue/worker, isolated identities and local media.
use super::planner;
use crate::state::AppState;
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::task::JoinHandle;
use uuid::Uuid;

fn setting(name: &str, min: usize, max: usize) -> usize {
    let value: usize = std::env::var(name).unwrap().parse().unwrap();
    assert!((min..=max).contains(&value));
    value
}

async fn worker(root: PathBuf, index: usize, stop: Arc<std::sync::atomic::AtomicBool>) -> Value {
    let work = root.join(format!("batch-worker-{index}"));
    std::fs::create_dir(&work).unwrap();
    let mut results = vec![];
    while !stop.load(Ordering::SeqCst) {
        let started = Instant::now();
        let epoch_started = chrono::Utc::now().timestamp_micros() as f64 / 1_000_000.0;
        let output =
            tokio::process::Command::new(std::env::var("CONTENT_PRODUCTION_TEST_PYTHON").unwrap())
                .args(["-m", "content_production.worker", "--once"])
                .env("CONTENT_PRODUCTION_WORK_DIR", &work)
                // The outer fixture owns this process group and sends SIGTERM,
                // allowing the worker to stop its separately grouped renderer.
                .output()
                .await
                .unwrap();
        assert!(
            output.status.success(),
            "batch worker process failed (stderr withheld)"
        );
        let mut result: Value = serde_json::from_slice(&output.stdout).unwrap();
        if result["status"] == "idle" {
            tokio::time::sleep(Duration::from_millis(250)).await;
        } else {
            result["worker"] = json!(index);
            result["invocationStartedEpoch"] = json!(epoch_started);
            result["invocationSeconds"] = json!(started.elapsed().as_secs_f64());
            eprintln!(
                "batch worker {index}: {} ({:.1}s)",
                result["status"],
                started.elapsed().as_secs_f64()
            );
            results.push(result);
        }
    }
    json!(results)
}

async fn identities(state: &AppState, count: usize) -> Vec<String> {
    let mut tokens = vec![];
    for index in 0..count {
        let id = 91_000_000 + index as i64;
        sqlx::query("INSERT INTO public.auth_users (id,username,email,password_hash,is_active) VALUES ($1,$2,'batch@example.invalid','fixture',TRUE)")
            .bind(id).bind(format!("batch_fixture_{index}")).execute(&state.pool).await.unwrap();
        sqlx::query("INSERT INTO public.auth_user_roles (user_id,role_id) SELECT $1,id FROM public.auth_roles WHERE name='content_ops'")
            .bind(id).execute(&state.pool).await.unwrap();
        let now = chrono::Utc::now().timestamp();
        tokens.push(jsonwebtoken::encode(&jsonwebtoken::Header::default(),
            &json!({"sub":id.to_string(),"typ":"access","exp":now+7200,"iat":now,"jti":Uuid::new_v4().to_string(),"roles":[],"permissions":[]}),
            &jsonwebtoken::EncodingKey::from_secret(state.settings.secret_key.as_bytes())).unwrap());
    }
    tokens
}

pub(in crate::marketing::content_assets::production) async fn exercise(
    state: Arc<AppState>,
    client: &Client,
    base: &str,
    asset: &str,
    model_calls: &AtomicUsize,
) {
    let count = setting("CONTENT_PRODUCTION_TEST_BATCH_COUNT", 1, 50);
    let seconds = setting("CONTENT_PRODUCTION_TEST_BATCH_SECONDS", 3, 60);
    let slots = setting("CONTENT_PRODUCTION_TEST_BATCH_SLOTS", 1, 2);
    assert_eq!(seconds % 3, 0);
    let output = PathBuf::from(std::env::var("CONTENT_PRODUCTION_TEST_OUTPUT").unwrap());
    let private = PathBuf::from(std::env::var("CONTENT_PRODUCTION_WORK_DIR").unwrap());
    // Fixture facts only, never a transcription/rights assertion about the source.
    sqlx::query(
        "UPDATE ads.marketing_content_assets SET duration_seconds=$2 WHERE asset_id=$1::UUID",
    )
    .bind(asset)
    .bind(seconds as f64)
    .execute(&state.pool)
    .await
    .unwrap();
    let segments: Vec<_> = (0..3).map(|i| json!({"start_ms":i*seconds*1000/3,"end_ms":(i+1)*seconds*1000/3,"text":format!("容量技术片段{i}")})).collect();
    sqlx::query(
        "UPDATE ads.marketing_content_asset_transcripts SET segments=$2 WHERE asset_id=$1::UUID",
    )
    .bind(asset)
    .bind(json!(segments))
    .execute(&state.pool)
    .await
    .unwrap();
    let tokens = identities(&state, count.min(10)).await;
    let started = Instant::now();
    std::fs::write(
        output.join("batch-started.json"),
        json!({"count":count,"seconds":seconds,"slots":slots}).to_string(),
    )
    .unwrap();
    let mut runs = vec![];
    for i in 0..count {
        let owner = i % tokens.len();
        let request = json!({"idempotencyKey":format!("batch-{i}"),"title":format!("技术负载-{i}"),"brief":"batch-capacity: 本地原片技术负载，不评价创意质量","taskType":"montage","assetIds":[asset],"aspect":"portrait","targetSeconds":seconds,"rightsConfirmed":true,"modelCallConfirmed":true});
        let value: Value = client
            .post(format!("{base}/runs"))
            .bearer_auth(&tokens[owner])
            .json(&request)
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json()
            .await
            .unwrap();
        let id = value["run"]["runId"].as_str().unwrap().to_string();
        let repeated: Value = client
            .post(format!("{base}/runs"))
            .bearer_auth(&tokens[owner])
            .json(&request)
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(repeated["run"]["runId"], id);
        let value: Value = client
            .post(format!("{base}/runs/{id}/plan"))
            .bearer_auth(&tokens[owner])
            .json(&json!({"expectedVersion":1}))
            .send()
            .await
            .unwrap()
            .error_for_status()
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(value["run"]["status"], "running");
        runs.push((Uuid::parse_str(&id).unwrap(), owner));
    }
    let planners = planner::spawn(Arc::clone(&state));
    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let workers: Vec<JoinHandle<Value>> = (0..slots)
        .map(|i| tokio::spawn(worker(private.clone(), i, Arc::clone(&stop))))
        .collect();
    let ids: Vec<_> = runs.iter().map(|(id, _)| *id).collect();
    let mut peak_planning = 0i64;
    let mut peak_rendering = 0i64;
    let mut peak_queue = 0i64;
    let mut observations = 0;
    loop {
        assert!(
            started.elapsed() < Duration::from_secs(5400),
            "batch exceeded 90 minute deadline"
        );
        assert!(
            !workers.iter().any(JoinHandle::is_finished),
            "batch worker exited before completion"
        );
        let row = sqlx::query("SELECT COUNT(*) FILTER (WHERE r.status IN ('succeeded','waiting','failed','cancelled')) AS done,COUNT(*) FILTER (WHERE a.status='running') AS planning,COUNT(*) FILTER (WHERE j.status='running') AS rendering,COUNT(*) FILTER (WHERE j.status='queued') AS queued FROM ads.content_production_runs r LEFT JOIN ads.content_production_plan_attempts a ON a.attempt_id=r.active_attempt LEFT JOIN ads.content_production_jobs j ON j.job_id=r.render_job_id WHERE r.run_id=ANY($1)")
            .bind(&ids).fetch_one(&state.pool).await.unwrap();
        let done: i64 = row.get("done");
        peak_planning = peak_planning.max(row.get("planning"));
        peak_rendering = peak_rendering.max(row.get("rendering"));
        peak_queue = peak_queue.max(row.get("queued"));
        observations += 1;
        std::fs::write(output.join("batch-progress.json"), json!({"done":done,"total":count,"wallSeconds":started.elapsed().as_secs_f64(),"rendering":row.get::<i64,_>("rendering"),"queued":row.get::<i64,_>("queued")}).to_string()).unwrap();
        if done == count as i64 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    stop.store(true, Ordering::SeqCst);
    let mut invocations = vec![];
    for worker in workers {
        invocations.extend(worker.await.unwrap().as_array().unwrap().clone());
    }
    for planner in planners {
        planner.abort();
        let _ = planner.await;
    }
    let mut results = vec![];
    for (index, (id, owner)) in runs.iter().enumerate() {
        let row = sqlx::query("SELECT r.status,EXTRACT(EPOCH FROM r.updated_at-r.created_at)::FLOAT8 AS elapsed,j.job_id,EXTRACT(EPOCH FROM j.created_at)::FLOAT8 AS queued_at,j.receipt FROM ads.content_production_runs r LEFT JOIN ads.content_production_jobs j ON j.job_id=r.render_job_id WHERE r.run_id=$1")
            .bind(id).fetch_one(&state.pool).await.unwrap();
        let mut result = json!({"index":index,"owner":owner,"runId":id,"status":row.get::<String,_>("status"),"endToEndSeconds":row.get::<f64,_>("elapsed")});
        if result["status"] == "succeeded" {
            let value: Value = client
                .get(format!("{base}/runs/{id}/result"))
                .bearer_auth(&tokens[*owner])
                .send()
                .await
                .unwrap()
                .error_for_status()
                .unwrap()
                .json()
                .await
                .unwrap();
            assert_eq!(value["ready"], true);
            assert_eq!(value["inspection"]["width"], 1080);
            assert_eq!(value["inspection"]["height"], 1920);
            assert!(
                (value["inspection"]["durationSeconds"].as_f64().unwrap() - seconds as f64).abs()
                    < 0.1
            );
            let bytes = client
                .get(value["playbackUrl"].as_str().unwrap())
                .send()
                .await
                .unwrap()
                .error_for_status()
                .unwrap()
                .bytes()
                .await
                .unwrap();
            let receipt: Value = row.get("receipt");
            let hash = hex::encode(Sha256::digest(&bytes));
            assert_eq!(hash, receipt["host_inspection"]["sha256"]);
            std::fs::write(output.join(format!("video-{index:02}.mp4")), &bytes).unwrap();
            result["sha256"] = json!(hash);
            result["bytes"] = json!(bytes.len());
            result["inspection"] = value["inspection"].clone();
            result["workspace"] = receipt["host_workspace"].clone();
            let job: Uuid = row.get("job_id");
            let invocation = invocations
                .iter()
                .find(|v| v["jobId"] == job.to_string())
                .unwrap();
            result["workerInvocationSeconds"] = invocation["invocationSeconds"].clone();
            result["queueUntilInvocationSeconds"] =
                json!((invocation["invocationStartedEpoch"].as_f64().unwrap()
                    - row.get::<f64, _>("queued_at"))
                .max(0.0));
            if tokens.len() > 1 {
                assert_eq!(
                    client
                        .get(format!("{base}/runs/{id}/result"))
                        .bearer_auth(&tokens[(owner + 1) % tokens.len()])
                        .send()
                        .await
                        .unwrap()
                        .status(),
                    404
                );
            }
        }
        results.push(result);
    }
    let passed = results
        .iter()
        .filter(|r| r["status"] == "succeeded")
        .count();
    let report = json!({"schema":"aios.batch-acceptance.v1","scope":"local fixture, repeated real footage and fixed model; no creative quality or VPS capacity proof","planned":count,"passed":passed,"failed":count-passed,"users":tokens.len(),"secondsPerVideo":seconds,"slots":slots,"wallSeconds":started.elapsed().as_secs_f64(),"modelCalls":model_calls.load(Ordering::SeqCst),"sampledPeakPlanning":peak_planning,"sampledPeakRendering":peak_rendering,"sampledPeakRenderQueue":peak_queue,"observations":observations,"workerInvocations":invocations,"results":results});
    std::fs::write(
        output.join("batch-report.json"),
        serde_json::to_vec_pretty(&report).unwrap(),
    )
    .unwrap();
    assert_eq!(passed, count, "batch failures remain in report");
    assert_eq!(model_calls.load(Ordering::SeqCst), count);
    assert!(peak_planning <= 2 && peak_rendering <= slots as i64);
}
