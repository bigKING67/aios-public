//! Real Rust enqueue -> Python Worker/HTTP permissions -> Rust adoption.
use super::{
    caption_preflight_planning,
    evidence_candidates::{Candidate, Evidence},
    planning_queue::Claim,
    repository,
};
use crate::state::AppState;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub(super) async fn exercise(state: &AppState, base: &str, original: &str) {
    assert_eq!(
        std::env::var("AIOS_CAPTION_PREFLIGHT_ENABLED").unwrap(),
        "true"
    );
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap();
    let scratch = root
        .join(".cache")
        .join(format!("caption-bridge-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&scratch).unwrap();
    let media = scratch.join("source.mp4");
    let output = tokio::process::Command::new("ffmpeg")
        .args([
            "-v",
            "error",
            "-nostdin",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=180x320:r=30:d=3",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=stereo",
            "-t",
            "3",
            "-c:a",
            "aac",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
        ])
        .arg(&media)
        .output()
        .await
        .unwrap();
    assert!(output.status.success(), "fixture video generation failed");
    let sha = hex::encode(Sha256::digest(std::fs::read(&media).unwrap()));
    let asset = Uuid::new_v4();
    let run_id = Uuid::new_v4();
    let attempt = Uuid::new_v4();
    let pool = &state.pool;
    sqlx::query("INSERT INTO ads.marketing_content_assets(asset_id,title,asset_status,bucket,raw_object_key,raw_sha256,duration_seconds) VALUES($1,'bridge','ready','fixture','bridge.mp4',$2,3)").bind(asset).bind(&sha).execute(pool).await.unwrap();
    let mut original_run = repository::get(pool, "90000001", original.parse().unwrap())
        .await
        .unwrap();
    original_run.request.task_type = "picture_remix".into();
    original_run.request.target_seconds = 3;
    original_run.request.review_before_production = false;
    let voice_media = scratch.join("voice.mp4");
    let remux = tokio::process::Command::new("ffmpeg")
        .args(["-v", "error", "-nostdin", "-i"])
        .arg(&media)
        .args(["-c", "copy", "-metadata", "comment=voice fixture"])
        .arg(&voice_media)
        .output()
        .await
        .unwrap();
    assert!(remux.status.success());
    let voice_sha = hex::encode(Sha256::digest(std::fs::read(&voice_media).unwrap()));
    let voice = Uuid::new_v4();
    sqlx::query("INSERT INTO ads.marketing_content_assets(asset_id,title,asset_status,bucket,raw_object_key,raw_sha256,duration_seconds) VALUES($1,'voice','ready','fixture','voice.mp4',$2,3)").bind(voice).bind(&voice_sha).execute(pool).await.unwrap();
    original_run.request.narration_asset_id = Some(voice);
    original_run.request.asset_ids = vec![voice, asset];
    original_run.sources.assets = vec![super::super::types::BoundAsset {
        asset_id: voice,
        object_key: "voice.mp4".into(),
        sha256: voice_sha,
        duration_ms: 3000,
    }];
    original_run
        .sources
        .assets
        .push(super::super::types::BoundAsset {
            asset_id: asset,
            object_key: "bridge.mp4".into(),
            sha256: sha.clone(),
            duration_ms: 3000,
        });
    sqlx::query("INSERT INTO ads.content_production_runs(run_id,owner_user_id,idempotency_key,request,source_snapshot,status,active_attempt) VALUES($1,'90000001',$2,$3,$4,'running',$5)").bind(run_id).bind(Uuid::new_v4().to_string()).bind(json!(original_run.request)).bind(json!(original_run.sources)).bind(attempt).execute(pool).await.unwrap();
    sqlx::query("INSERT INTO ads.content_production_plan_attempts(attempt_id,run_id,execution_version,input,status,expires_at) VALUES($1,$2,1,'{}','running',clock_timestamp()+INTERVAL '210 seconds')").bind(attempt).bind(run_id).execute(pool).await.unwrap();
    let claim = Claim {
        owner: "90000001".into(),
        token: attempt,
        run: repository::get(pool, "90000001", run_id).await.unwrap(),
    };
    let mut visual = super::evidence_tests::visual(asset);
    visual.start_ms = 0;
    visual.end_ms = 2000;
    visual.raw_sha256 = sha;
    visual.visible_text = json!({"status":"model_observed","observations":[{"role":"dialogue_subtitle","text":"原片字幕","sourceStartMs":0,"sourceEndMs":2000,"box":[0.1,0.7,0.8,0.1]}]});
    let mut candidates = vec![Candidate {
        asset_id: asset,
        title: "bridge".into(),
        start_ms: 0,
        end_ms: 2000,
        evidence: Evidence::RawVideoAnalysis(Box::new(visual)),
    }];
    assert!(
        !caption_preflight_planning::ready(state, &claim, &mut candidates)
            .await
            .unwrap()
    );
    let payload = json!({"base":base,"media":media,"work":scratch.join("work")});
    let worker =
        tokio::process::Command::new(root.join("etl/groland_postgres/.venv/bin/python"))
            .env("PYTHONPATH", root.join("etl/groland_postgres/scripts"))
            .env("AIOS_CAPTION_BRIDGE_FIXTURE", payload.to_string())
            .arg(root.join(
                "etl/groland_postgres/tests/content_production/caption_worker_bridge_fixture.py",
            ))
            .output()
            .await
            .unwrap();
    assert!(
        worker.status.success(),
        "worker fixture failed: {}",
        String::from_utf8_lossy(&worker.stderr)
    );
    let receipt: Value = serde_json::from_slice(&worker.stdout).unwrap();
    assert_eq!(receipt["calls"], 3);
    // Advance only this fixture's retry time; claim performs the real queued -> running transition.
    sqlx::query("UPDATE ads.content_production_plan_attempts SET expires_at=clock_timestamp() WHERE attempt_id=$1 AND status='queued'").bind(attempt).execute(pool).await.unwrap();
    let claim = super::planning_queue::claim(pool).await.unwrap().unwrap();
    assert_eq!(claim.run.run_id, run_id);
    assert_eq!(claim.token, attempt);
    assert!(
        caption_preflight_planning::ready(state, &claim, &mut candidates)
            .await
            .unwrap()
    );
    let Evidence::RawVideoAnalysis(v) = &candidates[0].evidence else {
        panic!()
    };
    assert_eq!(
        v.visible_text["captionWindow"]["observation"]["lines"],
        json!(["原片字幕"])
    );
    assert_eq!(v.visible_text["captionPreflight"]["callsReserved"], 3);
    let count:i64=sqlx::query_scalar("SELECT COUNT(*) FROM ads.marketing_content_asset_processing_jobs WHERE metadata->'caption_request'->>'runId'=$1").bind(run_id.to_string()).fetch_one(pool).await.unwrap();
    assert_eq!(count, 1);
    resume_and_dispatch(state, &claim, candidates).await;
    let render = tokio::process::Command::new(root.join("etl/groland_postgres/.venv/bin/python"))
        .env("PYTHONPATH", root.join("etl/groland_postgres/scripts"))
        .env(
            "AIOS_CAPTION_BRIDGE_FIXTURE",
            json!({"media":media,"voice":voice_media,"work":scratch.join("render"),"runId":run_id})
                .to_string(),
        )
        .arg(
            root.join(
                "etl/groland_postgres/tests/content_production/caption_render_bridge_fixture.py",
            ),
        )
        .output()
        .await
        .unwrap();
    assert!(
        render.status.success(),
        "render bridge failed: {} {}",
        String::from_utf8_lossy(&render.stdout),
        String::from_utf8_lossy(&render.stderr)
    );
    let receipt: Value = serde_json::from_slice(&render.stdout).unwrap();
    assert_eq!(receipt["status"], "completed");
    let run = repository::get(pool, "90000001", run_id).await.unwrap();
    assert_eq!(run.status, "waiting");
    assert_eq!(run.stage, "inspection");
    assert_eq!(
        run.waiting_reason.as_deref(),
        Some("caption_quality_pending")
    );
    std::fs::remove_dir_all(scratch).unwrap(); // UUID-owned fixture only.
}

async fn resume_and_dispatch(state: &AppState, claim: &Claim, mut candidates: Vec<Candidate>) {
    use crate::llm::{LlmCallOptions, LlmCallResult};
    use std::cell::Cell;
    candidates.push(super::picture_remix::preservation_candidate(&claim.run).unwrap());
    let narration = json!({"transcripts":[{"startMs":0,"endMs":1000,"text":"原片字幕"},{"startMs":1000,"endMs":2000,"text":"原片字幕"},{"startMs":2000,"endMs":3000,"text":"原片字幕"}]});
    let slots = super::picture_slots::build(&narration, &candidates, &claim.run).unwrap();
    let options = LlmCallOptions {
        provider: None,
        model: None,
        thinking_enabled: false,
        request_scope: None,
        system_prompt: super::picture_slots::PROMPT.into(),
        user_prompt: json!({"slots":slots,"narration":narration,"brief":"fixture"}).to_string(),
    };
    assert!(super::planning_queue::ready(&state.pool, claim)
        .await
        .unwrap());
    let calls = Cell::new(0);
    let user = super::planner::owner(state, &claim.owner).await.unwrap();
    let planned=super::planning_repair::execute(options,&candidates,&claim.run,|options| {
        calls.set(calls.get()+1);
        let input:Value=serde_json::from_str(&options.user_prompt).unwrap();
        let result=if calls.get()==1 {
            json!({"shots":[{"slotId":0,"candidateId":0,"reason":"fixture replacement"},{"slotId":1,"candidateId":1,"reason":"preserve"},{"slotId":2,"candidateId":1,"reason":"preserve"}],"gaps":[]})
        } else {
            assert_eq!(input["windows"][0]["visibleText"]["observations"][0]["evidenceOrigin"],"caption_preflight");
            json!({"checks":[{"clipId":input["windows"][0]["clipId"],"verdict":"compatible","reason":"fixture text"}]})
        };
        std::future::ready(Ok(LlmCallResult{provider:"fixture".into(),model:"fixture".into(),content:result.to_string()}))
    },||super::planner::repair_allowed(state,&user,&claim.run)).await.unwrap();
    assert_eq!(calls.get(), 2);
    assert!(planned.document.gaps.is_empty());
    let result = (planned.document, planned.receipt);
    assert!(super::attempts::finish_and_dispatch(
        &state.pool,
        &claim.owner,
        claim.run.run_id,
        claim.token,
        result.clone()
    )
    .await
    .unwrap());
    let run = repository::get(&state.pool, &claim.owner, claim.run.run_id)
        .await
        .unwrap();
    assert_eq!(run.stage, "production");
    assert_eq!(run.status, "running");
    assert_eq!(run.plan_revision, 1);
    assert!(run.waiting_reason.is_none());
    assert!(!super::attempts::finish_and_dispatch(
        &state.pool,
        &claim.owner,
        claim.run.run_id,
        claim.token,
        result
    )
    .await
    .unwrap());
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_production_run_renders WHERE run_id=$1",
    )
    .bind(claim.run.run_id)
    .fetch_one(&state.pool)
    .await
    .unwrap();
    assert_eq!(count, 1);
}
