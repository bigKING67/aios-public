//! Opt-in real-provider decision probe; cached source binding is not DB authorization.
use super::super::types::{ClipHit, Snapshot};
use super::{evidence_planning, evidence_tests, picture_remix, types::CreateRunRequest};
use serde_json::{json, Value};
use std::{fs, path::PathBuf};

fn root() -> PathBuf {
    PathBuf::from(std::env::var("AIOS_PRESERVATION_PROBE_DIR").unwrap())
}
fn read(name: &str) -> Value {
    serde_json::from_slice(&fs::read(root().join(name)).unwrap()).unwrap()
}
fn save(name: &str, value: &Value) {
    fs::write(root().join(name), serde_json::to_vec_pretty(value).unwrap()).unwrap();
}

#[test]
#[ignore = "explicit cached source evidence; export prompt or ground unchanged provider response"]
fn real_preservation_decision_probe() {
    let input = read("input.json");
    let mut run = evidence_tests::run();
    run.request = serde_json::from_value(input["request"].clone()).unwrap();
    run.sources = serde_json::from_value(input["sources"].clone()).unwrap();
    let transcripts: Vec<ClipHit> = input["transcripts"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| ClipHit {
            asset_id: t["assetId"].as_str().unwrap().parse().unwrap(),
            transcript_id: t["transcriptId"].as_str().unwrap().parse().unwrap(),
            title: t["title"].as_str().unwrap().into(),
            start_ms: t["startMs"].as_u64().unwrap().try_into().unwrap(),
            end_ms: t["endMs"].as_u64().unwrap().try_into().unwrap(),
            text: t["text"].as_str().unwrap().into(),
            can_use: t["canUse"].as_bool().unwrap(),
            playback_url: String::new(),
        })
        .collect();
    let narration = evidence_planning::narration(&transcripts, &run).unwrap();
    let mut candidates = cross_source_candidates(&input);
    candidates.push(picture_remix::preservation_candidate(&run).unwrap());
    let model_inputs: Vec<_> = candidates
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let mut value = c.model_input(i);
            value["maxFrames"] = json!((c.end_ms - c.start_ms) * 30 / 1000);
            value
        })
        .collect();
    let slots = if input["fixedSlots"] == true {
        Some(super::picture_slots::build(&narration, &candidates, &run).unwrap())
    } else {
        None
    };
    let mut request = json!({"systemPrompt":if slots.is_some(){super::picture_slots::PROMPT}else{picture_remix::PROMPT},"userPrompt":{
        "taskType":run.request.task_type,"brief":run.request.brief,
        "targetSeconds":run.request.target_seconds,"narration":narration,"candidates":model_inputs}});
    if let Some(value) = &slots {
        request["userPrompt"]["slots"] = json!(value);
    }
    if !root().join("model-plan.json").exists() {
        save("planner-request.json", &request);
        return;
    }
    assert_eq!(
        read("planner-request.json"),
        request,
        "input changed after provider call"
    );
    let model_plan = serde_json::from_value(read("model-plan.json")).unwrap();
    let (document, selected) = match &slots {
        Some(slots) => super::picture_slots::ground(model_plan, &candidates, &run, slots),
        None => evidence_planning::ground(model_plan, &candidates, &run),
    }
    .unwrap();
    save(
        "grounded-plan.json",
        &json!({"document":document,"selected":selected,
        "productionDatabaseVerified":false,"renderExecuted":false}),
    );
    if input["crossSourceCase"] == true {
        let excluded: uuid::Uuid = input["excludedAssetId"].as_str().unwrap().parse().unwrap();
        assert!(
            document.clips.iter().all(|c| c.asset_id != excluded),
            "conflicting fragrance copy selected"
        );
        if document.gaps.is_empty() {
            save(
                "edit-document.json",
                &picture_remix::edit_document(&run, &document)
                    .unwrap()
                    .unwrap(),
            );
        }
        return;
    }
    if input["expectPreservation"] == true {
        assert!(document.gaps.is_empty());
        assert_eq!(document.clips.len(), 1);
        assert_eq!(document.clips[0].start_ms, 0);
        assert_eq!(document.clips[0].end_ms, run.request.target_seconds * 1000);
        assert!(picture_remix::edit_document(&run, &document)
            .unwrap()
            .is_some());
    } else {
        assert!(
            !document.gaps.is_empty(),
            "required new footage silently replaced with original"
        );
        assert!(
            document.clips.is_empty(),
            "prompt requires empty shots for unmet semantics"
        );
    }
}

#[tokio::test]
#[ignore = "grounded real-provider response and disposable loopback PostgreSQL"]
async fn postgres_preservation_decision_probe() {
    use super::{attempts, execution, repository, tests, types::AdoptPlanRequest};
    let input = read("input.json");
    let request: CreateRunRequest = serde_json::from_value(input["request"].clone()).unwrap();
    assert!(!request.review_before_production);
    let sources: Snapshot = serde_json::from_value(input["sources"].clone()).unwrap();
    let document = serde_json::from_value(read("grounded-plan.json")["document"].clone()).unwrap();
    let pool = tests::database().await;
    let owner = uuid::Uuid::new_v4().to_string();
    let run = repository::create(&pool, &owner, &request, &sources)
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
            json!({"scope":"real response replay; isolated source binding"})
        )
    )
    .await
    .unwrap());
    let detail = repository::detail(&pool, &owner, run.run_id).await.unwrap();
    let jobs: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ads.content_production_run_renders WHERE run_id=$1",
    )
    .bind(run.run_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let preserve = input["expectPreservation"] == true;
    if preserve {
        assert_eq!(detail.run.stage, "production");
        assert_eq!(detail.run.status, "running");
        assert!(detail.run.render_job_id.is_some());
        assert_eq!(jobs, 1);
    } else {
        assert_eq!(
            detail.run.waiting_reason.as_deref(),
            Some("missing_material")
        );
        assert_eq!(jobs, 0);
        assert!(matches!(
            execution::produce(
                &pool,
                &owner,
                run.run_id,
                AdoptPlanRequest {
                    expected_version: detail.run.version,
                    expected_plan_revision: detail.run.plan_revision,
                    expected_project_revision: None,
                }
            )
            .await,
            Err(crate::error::AppError::BadRequest(_))
        ));
    }
    save(
        "dispatch-acceptance.json",
        &json!({"status":"passed","automaticDispatch":preserve,
        "renderJobs":jobs,"waitingReason":detail.run.waiting_reason,
        "scope":"isolated SQL settlement; no HTTP, worker or production deployment in this probe"}),
    );
}

// This opt-in adapter projects saved real analysis into production candidates;
// it never writes fake analysis rows or claims production database provenance.
pub(super) fn cross_source_candidates(input: &Value) -> Vec<super::evidence_candidates::Candidate> {
    use super::super::{visible_text, visual_search::VisualEvidence};
    use super::evidence_candidates::{Candidate, Evidence};
    input["visuals"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|v| {
            let start: u32 = v["startMs"].as_u64().unwrap().try_into().unwrap();
            let end: u32 = v["endMs"].as_u64().unwrap().try_into().unwrap();
            let asset_id = v["assetId"].as_str().unwrap().parse().unwrap();
            let title = v["title"].as_str().unwrap().to_string();
            Candidate {
                asset_id,
                title: title.clone(),
                start_ms: start,
                end_ms: end,
                evidence: Evidence::RawVideoAnalysis(Box::new(VisualEvidence {
                    asset_id,
                    title,
                    start_ms: start,
                    end_ms: end,
                    observation: v["observation"].as_str().unwrap().into(),
                    visible_text: visible_text::for_segment(
                        v["visibleText"].clone(),
                        start,
                        end,
                        v["durationMs"].as_f64().unwrap(),
                    ),
                    purpose_suggestion: String::new(),
                    quality_signal: v
                        .get("qualitySignal")
                        .filter(|q| !q.is_null())
                        .map(|q| q.as_str().expect("quality signal must be text").to_string())
                        .unwrap_or_default(),
                    analysis_result_id: uuid::Uuid::nil(),
                    raw_sha256: v["sha256"].as_str().unwrap().into(),
                    model: v["model"].as_str().unwrap().into(),
                    prompt_version: v["promptVersion"].as_str().unwrap().into(),
                    analysis_schema_version: "2.1".into(),
                    input_snapshot_hash: v["inputSha256"].as_str().unwrap().into(),
                    cache_key: "local-real-crop-projection-not-production".into(),
                })),
            }
        })
        .collect()
}

#[tokio::test]
#[ignore = "explicit saved real failure; export bounded correction or replay unchanged repaired response"]
async fn real_bounded_correction_probe() {
    use crate::llm::{LlmCallOptions, LlmCallResult};
    use std::cell::Cell;
    let input = read("input.json");
    let mut run = evidence_tests::run();
    run.request = serde_json::from_value(input["request"].clone()).unwrap();
    run.sources = serde_json::from_value(input["sources"].clone()).unwrap();
    let mut candidates = cross_source_candidates(&input);
    candidates.push(picture_remix::preservation_candidate(&run).unwrap());
    let frozen = read("planner-request.json");
    assert_eq!(frozen["systemPrompt"], picture_remix::PROMPT);
    assert_eq!(frozen["userPrompt"]["brief"], run.request.brief);
    let expected: Vec<_> = candidates
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let mut v = c.model_input(i);
            v["maxFrames"] = json!((c.end_ms - c.start_ms) * 30 / 1000);
            v
        })
        .collect();
    assert_eq!(frozen["userPrompt"]["candidates"], json!(expected));
    let original = read("provider-output.json")["outputText"]
        .as_str()
        .unwrap()
        .to_string();
    let model = "doubao-seed-2-1-lite-260915";
    let options = LlmCallOptions {
        provider: Some("doubao".into()),
        model: Some(model.into()),
        thinking_enabled: false,
        request_scope: Some("content-production-plan".into()),
        system_prompt: picture_remix::PROMPT.into(),
        user_prompt: frozen["userPrompt"].to_string(),
    };
    let export_only = !root().join("repair-provider-output.json").exists();
    let calls = Cell::new(0);
    let planned=super::planning_repair::execute(options,&candidates,&run,|options| {
        calls.set(calls.get()+1);
        let result=if calls.get()==1 {
            Ok(LlmCallResult{provider:"doubao".into(),model:model.into(),content:original.clone()})
        }else{
            let request=json!({"systemPrompt":options.system_prompt,"userPrompt":serde_json::from_str::<Value>(&options.user_prompt).unwrap()});
            if export_only {
                save("repair-request.json",&request);
                Err(crate::error::AppError::ServiceUnavailable("export only".into()))
            }else{
                assert_eq!(read("repair-request.json"),request,"correction request changed after provider call");
                Ok(LlmCallResult{provider:"doubao".into(),model:model.into(),content:read("repair-provider-output.json")["outputText"].as_str().unwrap().into()})
            }
        };
        std::future::ready(result)
    },||std::future::ready(Ok(()))).await;
    assert_eq!(calls.get(), 2);
    if export_only {
        assert!(planned.is_err());
        return;
    }
    if let Err(error) = &planned {
        save(
            "correction-failure.json",
            &json!({"status":"rejected","calls":calls.get(),"error":error.detail(),"thirdCall":false,"renderExecuted":false}),
        );
    }
    let planned = planned.unwrap();
    assert_eq!(planned.receipt["calls"], 2);
    assert_eq!(
        planned.document.gaps.len(),
        3,
        "original unresolved requirements must survive correction"
    );
    save(
        "grounded-plan.json",
        &json!({"document":planned.document,"selected":planned.selected,"correction":planned.receipt,
        "scope":"real response replay through production correction; no production source authorization"}),
    );
}

#[test]
#[ignore = "offline saved model decision regression; no provider, DB or render"]
fn saved_conflict_decision_cannot_build_executable_edit() {
    let input = read("input.json");
    let mut run = evidence_tests::run();
    run.request = serde_json::from_value(input["request"].clone()).unwrap();
    run.sources = serde_json::from_value(input["sources"].clone()).unwrap();
    let mut candidates = cross_source_candidates(&input);
    candidates.push(picture_remix::preservation_candidate(&run).unwrap());
    // Slot partition is the exact saved host input, not a new model invocation.
    let slots: Vec<super::picture_slots::Slot> =
        serde_json::from_value(read("planner-request.json")["userPrompt"]["slots"].clone())
            .unwrap();
    let plan = serde_json::from_value(read("model-plan.json")).unwrap();
    let (document, _) = super::picture_slots::ground(plan, &candidates, &run, &slots).unwrap();
    assert!(!document.gaps.is_empty());
    assert!(picture_remix::edit_document(&run, &document).is_err());
    save(
        "execution-guard-regression.json",
        &json!({"status":"passed", "scope":"saved model decision with reported gaps; no new prompt evaluation",
        "gaps":document.gaps,"draftClips":document.clips.len(),"executableEditRejected":true,
        "providerCalls":0,"renderExecuted":false,"databaseDispatchVerified":false}),
    );
}

#[test]
#[ignore = "explicit cached positive/negative decision; export or validate one independent review"]
fn saved_selection_independent_review_probe() {
    use crate::llm::LlmCallOptions;
    let input = read("input.json");
    let frozen = read("planner-request.json");
    let mut run = evidence_tests::run();
    run.request = serde_json::from_value(input["request"].clone()).unwrap();
    run.sources = serde_json::from_value(input["sources"].clone()).unwrap();
    let mut candidates = cross_source_candidates(&input);
    candidates.push(picture_remix::preservation_candidate(&run).unwrap());
    let slots =
        super::picture_slots::build(&frozen["userPrompt"]["narration"], &candidates, &run).unwrap();
    let plan = serde_json::from_value(read("model-plan.json")).unwrap();
    let (mut document, mut selected) =
        super::picture_slots::ground(plan, &candidates, &run, &slots).unwrap();
    // Stable local probe identity only; production uses its frozen clip IDs.
    for (i, (clip, choice)) in document
        .clips
        .iter_mut()
        .zip(selected.iter_mut())
        .enumerate()
    {
        clip.id = format!("review-clip-{i}");
        choice["clipId"] = json!(clip.id);
    }
    let old_gaps = document.gaps.clone();
    let original = LlmCallOptions {
        provider: None,
        model: None,
        thinking_enabled: false,
        request_scope: None,
        system_prompt: frozen["systemPrompt"].as_str().unwrap().into(),
        user_prompt: frozen["userPrompt"].to_string(),
    };
    let request = super::selection_review::request(&original, &candidates, &selected)
        .unwrap()
        .unwrap();
    let value = json!({"systemPrompt":request.system_prompt,"userPrompt":serde_json::from_str::<Value>(&request.user_prompt).unwrap()});
    if !root().join("review-provider-output.json").exists() {
        save("review-request.json", &value);
        return;
    }
    assert_eq!(
        read("review-request.json"),
        value,
        "review evidence or prompt changed"
    );
    let raw = read("review-provider-output.json");
    let receipt = super::selection_review::apply(
        &mut document,
        &request.user_prompt,
        raw["outputText"].as_str().unwrap(),
    )
    .unwrap();
    assert!(old_gaps.iter().all(|g| document.gaps.contains(g)));
    save(
        "review-acceptance.json",
        &json!({"review":receipt,"originalGaps":old_gaps,"resultGaps":document.gaps,
        "executableEditAllowed":picture_remix::edit_document(&run,&document).is_ok(),
        "scope":"cached real selection evidence; independent text review only","renderExecuted":false,"deliveryApproved":false}),
    );
}
