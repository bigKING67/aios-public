//! Explicit local probe: cached observations -> production prompt/grounding.
//! Does not claim database source authorization or call a provider itself.
use super::super::{types::ClipHit, visible_text, visual_search::VisualEvidence};
use super::{evidence_candidates, evidence_planning, evidence_tests};
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
use uuid::Uuid;

#[test]
#[ignore = "requires explicit local evidence directory; no network or database"]
fn real_selection_probe() {
    let root = PathBuf::from(std::env::var("AIOS_SELECTION_PROBE_DIR").unwrap());
    let input: Value =
        serde_json::from_slice(&fs::read(root.join("evidence.json")).unwrap()).unwrap();
    let offset = input["sourceStartMs"].as_u64().unwrap() as u32;
    let duration = input["sourceDurationMs"].as_u64().unwrap() as u32;
    let mut text = input["visibleText"].clone();
    for item in text["observations"].as_array_mut().unwrap() {
        for key in ["start_ms", "end_ms"] {
            item[key] = json!(item[key].as_u64().unwrap() + u64::from(offset));
        }
    }
    let visuals = input["segments"]
        .as_array()
        .unwrap()
        .iter()
        .map(|segment| {
            let start = segment["startMs"].as_u64().unwrap() as u32 + offset;
            let end = segment["endMs"].as_u64().unwrap() as u32 + offset;
            VisualEvidence {
                asset_id: Uuid::nil(),
                title: "本地原片观察验收".into(),
                start_ms: start,
                end_ms: end,
                observation: segment["observation"].as_str().unwrap().into(),
                visible_text: visible_text::for_segment(
                    text.clone(),
                    start,
                    end,
                    f64::from(duration),
                ),
                purpose_suggestion: String::new(),
                quality_signal: String::new(),
                analysis_result_id: Uuid::nil(),
                raw_sha256: input["sourceSha256"].as_str().unwrap().into(),
                model: "doubao-seed-2-1-lite-260915".into(),
                prompt_version: "local-crop-probe-not-db-authorized".into(),
                analysis_schema_version: "2.1".into(),
                input_snapshot_hash: input["inputSha256"].as_str().unwrap().into(),
                cache_key: "local-only".into(),
            }
        })
        .collect();
    let recut = input["case"].as_str() == Some("recut");
    let transcripts = input["transcripts"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| ClipHit {
                    asset_id: Uuid::nil(),
                    title: "原片已对齐台词".into(),
                    transcript_id: Uuid::nil(),
                    start_ms: item["startMs"].as_u64().unwrap() as u32,
                    end_ms: item["endMs"].as_u64().unwrap() as u32,
                    text: item["text"].as_str().unwrap().into(),
                    can_use: true,
                    playback_url: String::new(),
                })
                .collect()
        })
        .unwrap_or_default();
    let candidates = evidence_candidates::select(&[Uuid::nil()], transcripts, visuals);
    assert_eq!(candidates.len(), if recut { 6 } else { 3 });
    let mut run = evidence_tests::run();
    run.request.task_type = "montage".into();
    run.request.brief = "需要同一人物使用前后的发质效果对比；没有真实画面依据就返回缺口，不能用洗头或瓶身展示冒充。保留原片字幕样式。".into();
    if recut {
        run.request.task_type = "recut".into();
        run.request.brief = input["brief"].as_str().unwrap().into();
        run.request.target_seconds = 10;
    }
    run.sources.assets[0].duration_ms = duration;
    run.sources.assets[0].sha256 = input["sourceSha256"].as_str().unwrap().into();
    let request = json!({"systemPrompt":evidence_planning::PROMPT,"userPrompt":{
        "taskType":run.request.task_type,"brief":run.request.brief,"targetSeconds":run.request.target_seconds,
        "narration":null,"candidates":candidates.iter().enumerate().map(|(i,c)|c.model_input(i)).collect::<Vec<_>>()}});
    let request_path = root.join("planner-request.json");
    if !root.join("model-plan.json").exists() {
        fs::write(request_path, serde_json::to_vec_pretty(&request).unwrap()).unwrap();
        return;
    }
    let frozen: Value = serde_json::from_slice(&fs::read(request_path).unwrap()).unwrap();
    assert_eq!(
        frozen, request,
        "prompt or evidence changed after provider call"
    );
    let plan = serde_json::from_slice(&fs::read(root.join("model-plan.json")).unwrap()).unwrap();
    let (document, selected) = evidence_planning::ground(plan, &candidates, &run).unwrap();
    if recut {
        assert!(document.gaps.is_empty(), "positive case returned gaps");
        assert_eq!(document.clips.len(), 1);
        let clip = &document.clips[0];
        assert_eq!((clip.start_ms, clip.end_ms), (18120, 24720));
        assert_eq!(clip.volume, 1.0);
        assert!(
            clip.caption.is_empty(),
            "must retain burned-in subtitle pixels"
        );
    } else {
        assert!(
            document.clips.is_empty(),
            "unsupported before/after footage selected"
        );
        assert!(!document.gaps.is_empty());
        assert!(selected.is_empty());
    }
    fs::write(
        root.join("run-input.json"),
        serde_json::to_vec_pretty(&json!({
            "request":run.request,"sources":run.sources
        }))
        .unwrap(),
    )
    .unwrap();
    fs::write(
        root.join("grounded-plan.json"),
        serde_json::to_vec_pretty(&json!({
            "document":document,"selected":selected,"productionDatabaseVerified":false,
            "renderExecuted":false,"scope":"production prompt and grounding only"
        }))
        .unwrap(),
    )
    .unwrap();
}

#[tokio::test]
#[ignore = "requires local grounded response and disposable loopback PostgreSQL"]
async fn postgres_real_selection_gap_probe() {
    use super::{attempts, execution, repository, tests, types::AdoptPlanRequest};
    let root = PathBuf::from(std::env::var("AIOS_SELECTION_PROBE_DIR").unwrap());
    let grounded: Value =
        serde_json::from_slice(&fs::read(root.join("grounded-plan.json")).unwrap()).unwrap();
    let document = serde_json::from_value(grounded["document"].clone()).unwrap();
    let pool = tests::database().await;
    let owner = Uuid::new_v4().to_string();
    let mut request = tests::input();
    request.review_before_production = false;
    let run = repository::create(&pool, &owner, &request, &tests::snapshot())
        .await
        .unwrap();
    let (_, token) = tests::begin(&pool, &owner, run.run_id, 1).await.unwrap();
    assert!(attempts::finish_and_dispatch(
        &pool,
        &owner,
        run.run_id,
        token,
        (
            document,
            json!({"scope":"real response replay; synthetic DB source"})
        )
    )
    .await
    .unwrap());
    let detail = repository::detail(&pool, &owner, run.run_id).await.unwrap();
    assert_eq!(detail.run.status, "waiting");
    assert_eq!(
        detail.run.waiting_reason.as_deref(),
        Some("missing_material")
    );
    assert!(detail.run.render_job_id.is_none());
    assert!(detail.run.project_id.is_none());
    let result = execution::produce(
        &pool,
        &owner,
        run.run_id,
        AdoptPlanRequest {
            expected_version: detail.run.version,
            expected_plan_revision: detail.run.plan_revision,
            expected_project_revision: None,
        },
    )
    .await;
    assert!(matches!(result, Err(crate::error::AppError::BadRequest(_))));
    let jobs: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_production_run_renders WHERE run_id=$1",
    )
    .bind(run.run_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(jobs, 0);
    fs::write(root.join("dispatch-acceptance.json"), serde_json::to_vec_pretty(&json!({
        "status":"passed","waitingReason":"missing_material","automaticDispatch":false,
        "explicitProduceRejected":true,"renderJobs":jobs,
        "scope":"real response replay through isolated SQL settlement and dispatch; no HTTP/provider transport test"
    })).unwrap()).unwrap();
}

#[tokio::test]
#[ignore = "requires real recut response and disposable loopback PostgreSQL"]
async fn postgres_real_recut_dispatch_probe() {
    use super::super::{repository as projects, types::Snapshot};
    use super::{attempts, repository, tests, types::CreateRunRequest};
    let root = PathBuf::from(std::env::var("AIOS_SELECTION_PROBE_DIR").unwrap());
    let load = |name| serde_json::from_slice::<Value>(&fs::read(root.join(name)).unwrap()).unwrap();
    let grounded = load("grounded-plan.json");
    let input = load("run-input.json");
    let origin = if root.join("fixture-origin.json").exists() {
        load("fixture-origin.json")
    } else {
        json!({"kind":"real-model-response"})
    };
    let mut request: CreateRunRequest = serde_json::from_value(input["request"].clone()).unwrap();
    request.review_before_production = false;
    let sources: Snapshot = serde_json::from_value(input["sources"].clone()).unwrap();
    let pool = tests::database().await;
    let owner = Uuid::new_v4().to_string();
    let run = repository::create(&pool, &owner, &request, &sources)
        .await
        .unwrap();
    let (_, token) = tests::begin(&pool, &owner, run.run_id, 1).await.unwrap();
    let document = serde_json::from_value(grounded["document"].clone()).unwrap();
    assert!(attempts::finish_and_dispatch(
        &pool,
        &owner,
        run.run_id,
        token,
        (
            document,
            json!({"scope":"local source binding","origin":origin})
        )
    )
    .await
    .unwrap());
    let detail = repository::detail(&pool, &owner, run.run_id).await.unwrap();
    assert_eq!(detail.run.status, "running");
    assert_eq!(detail.run.stage, "production");
    assert!(detail.run.waiting_reason.is_none());
    let project = detail.run.project_id.unwrap();
    let revision = detail.run.project_revision.unwrap();
    let frozen = projects::snapshot(&pool, &owner, project, revision)
        .await
        .unwrap();
    assert_eq!(frozen.clips.len(), 1);
    assert_eq!(frozen.clips[0].volume, 1.0);
    assert!(frozen.clips[0].caption.is_empty());
    assert_eq!(
        (frozen.clips[0].start_ms, frozen.clips[0].end_ms),
        (18120, 24720)
    );
    assert_eq!(frozen.assets[0].sha256, sources.assets[0].sha256);
    let jobs: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_production_run_renders WHERE run_id=$1",
    )
    .bind(run.run_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(jobs, 1);
    fs::write(
        root.join("frozen-snapshot.json"),
        serde_json::to_vec_pretty(&frozen).unwrap(),
    )
    .unwrap();
    fs::write(root.join("dispatch-acceptance.json"), serde_json::to_vec_pretty(&json!({
        "status":"passed","automaticDispatch":true,"renderJobs":jobs,
        "projectId":project,"revision":revision,"origin":origin,
        "scope":"isolated SQL settlement and dispatch; local source binding, not production authorization"
    })).unwrap()).unwrap();
}
