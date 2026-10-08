use super::super::{types::ClipHit, visual_search::VisualEvidence};
use super::{
    evidence_candidates::{self, Evidence},
    evidence_planning::{self, ModelPlan, ModelShot},
    tests,
    types::Run,
};
use uuid::Uuid;

pub(super) fn visual(asset_id: Uuid) -> VisualEvidence {
    VisualEvidence {
        asset_id,
        title: "无台词演示".into(),
        start_ms: 1000,
        end_ms: 3000,
        observation: "手持产品，蓝色瓶身".into(),
        visible_text: serde_json::json!({"status":"missing","observations":[],"erasureAuthorized":false}),
        purpose_suggestion: "可作为产品介绍".into(),
        quality_signal: String::new(),
        analysis_result_id: Uuid::new_v4(),
        raw_sha256: "a".repeat(64),
        model: "fixture-vision".into(),
        prompt_version: "v1".into(),
        analysis_schema_version: "2.1".into(),
        input_snapshot_hash: "snapshot".into(),
        cache_key: "cache".into(),
    }
}
fn transcript(asset_id: Uuid, start_ms: u32) -> ClipHit {
    ClipHit {
        asset_id,
        title: "原声".into(),
        transcript_id: Uuid::new_v4(),
        start_ms,
        end_ms: start_ms + 1000,
        text: "完整讲解".into(),
        can_use: true,
        playback_url: "https://private.invalid/signed-secret".into(),
    }
}
pub(super) fn run() -> Run {
    Run {
        run_id: Uuid::new_v4(),
        version: 1,
        execution_version: 1,
        plan_revision: 0,
        status: "running".into(),
        stage: "planning".into(),
        waiting_reason: None,
        request: tests::input(),
        project_id: None,
        project_revision: None,
        render_job_id: None,
        pause_requested: false,
        created_at: String::new(),
        updated_at: String::new(),
        sources: tests::snapshot(),
        active_attempt: None,
    }
}
fn plan(ids: &[usize]) -> ModelPlan {
    ModelPlan {
        shots: ids
            .iter()
            .map(|i| ModelShot {
                slot_id: None,
                duration_frames: None,
                candidate_id: *i,
                reason: "画面支持要求".into(),
            })
            .collect(),
        gaps: vec![],
    }
}

#[test]
fn silent_visual_has_own_provenance_and_no_invented_transcript() {
    let candidates = evidence_candidates::select(&[Uuid::nil()], vec![], vec![visual(Uuid::nil())]);
    let (document, selected) = evidence_planning::ground(plan(&[0]), &candidates, &run()).unwrap();
    assert_eq!(document.clips[0].volume, 0.0);
    assert_eq!(
        (document.clips[0].start_ms, document.clips[0].end_ms),
        (1000, 3000)
    );
    assert_eq!(
        selected[0]["source"]["evidence"]["kind"],
        "raw-video-analysis"
    );
    assert!(!selected[0]["source"]["evidence"]["analysisResultId"].is_null());
    assert!(!serde_json::to_string(&selected)
        .unwrap()
        .contains("transcriptId"));
    assert_eq!(
        candidates[0].model_input(0)["evidence"]["audioPolicy"],
        "mute"
    );
}

#[test]
fn context_is_fair_bounded_scoped_and_excludes_private_media_urls() {
    let second = Uuid::new_v4();
    let transcripts = (0..100)
        .map(|i| transcript(Uuid::nil(), i * 1000))
        .collect();
    let candidates = evidence_candidates::select(
        &[Uuid::nil(), second],
        transcripts,
        vec![visual(second), visual(Uuid::new_v4())],
    );
    assert_eq!(candidates.len(), 30);
    assert_eq!(candidates[1].asset_id, second);
    assert!(matches!(
        candidates[1].evidence,
        Evidence::RawVideoAnalysis(_)
    ));
    let input = candidates
        .iter()
        .enumerate()
        .map(|(i, c)| c.model_input(i))
        .collect::<Vec<_>>();
    let serialized = serde_json::to_string(&input).unwrap();
    assert!(!serialized.contains("signed-secret"));
    assert!(!serialized.contains("playbackUrl"));
    assert!(!serialized.contains("objectKey"));
    assert!(candidates
        .iter()
        .all(|c| c.asset_id == Uuid::nil() || c.asset_id == second));
}

#[test]
fn rejects_hallucination_overlap_out_of_scope_and_over_budget() {
    let candidates = evidence_candidates::select(
        &[Uuid::nil()],
        vec![transcript(Uuid::nil(), 1000)],
        vec![visual(Uuid::nil())],
    );
    for ids in [vec![99], vec![0, 0], vec![0, 1]] {
        assert!(evidence_planning::ground(plan(&ids), &candidates, &run()).is_err());
    }
    let mut bounded = run();
    bounded.request.target_seconds = 1;
    assert!(evidence_planning::ground(plan(&[1]), &candidates, &bounded).is_err());
    bounded = run();
    bounded.sources.assets.clear();
    assert!(evidence_planning::ground(plan(&[0]), &candidates, &bounded).is_err());
    assert!(serde_json::from_str::<ModelPlan>(
        r#"{"shots":[{"candidateId":0,"reason":"x","startMs":0}],"gaps":[]}"#
    )
    .is_err());
    assert!(evidence_planning::ground(plan(&[]), &[], &run()).is_err());
    let (empty, _) = evidence_planning::ground(
        ModelPlan {
            shots: vec![],
            gaps: vec!["缺完整动作证据".into()],
        },
        &[],
        &run(),
    )
    .unwrap();
    assert!(empty.clips.is_empty());
}

#[test]
fn transcript_audio_is_preserved_and_denied_evidence_is_not_loaded() {
    let mut denied = transcript(Uuid::nil(), 0);
    denied.can_use = false;
    let candidates = evidence_candidates::select(
        &[Uuid::nil()],
        vec![denied, transcript(Uuid::nil(), 2000)],
        vec![],
    );
    assert_eq!(candidates.len(), 1);
    let (doc, _) = evidence_planning::ground(plan(&[0]), &candidates, &run()).unwrap();
    assert_eq!(doc.clips[0].volume, 1.0);
    assert_eq!(doc.clips[0].start_ms, 2000);
    assert!(doc.clips[0].caption.is_empty());
    assert_eq!(
        candidates[0].model_input(0)["evidence"]["picturePolicy"],
        "preserve-source"
    );
    assert_eq!(
        candidates[0].model_input(0)["evidence"]["audioPolicy"],
        "preserve-source"
    );
}

#[test]
fn gaps_only_response_matches_prompt_without_allowing_empty_success() {
    let response = r#"{"gaps":["缺少同一人物使用前后的发质对比画面"]}"#;
    let plan: ModelPlan = serde_json::from_str(response).unwrap();
    let (document, selected) = evidence_planning::ground(plan, &[], &run()).unwrap();
    assert!(document.clips.is_empty());
    assert!(selected.is_empty());
    assert_eq!(document.gaps.len(), 1);
    for response in [r#"{"gaps":[]}"#, r#"{"gaps":[" "]}"#] {
        let plan: ModelPlan = serde_json::from_str(response).unwrap();
        assert!(evidence_planning::ground(plan, &[], &run()).is_err());
    }
    for response in [
        r#"{}"#,
        r#"{"shots":null,"gaps":["missing"]}"#,
        r#"{"gaps":["missing"],"approved":true}"#,
    ] {
        assert!(serde_json::from_str::<ModelPlan>(response).is_err());
    }
}

#[test]
fn recut_duration_is_a_ceiling_while_picture_remix_requires_exact_coverage() {
    let mut task = run();
    task.request.task_type = "recut".into();
    task.request.target_seconds = 10;
    let mut spoken = transcript(Uuid::nil(), 1000);
    spoken.end_ms = 7600;
    let candidates = evidence_candidates::select(&[Uuid::nil()], vec![spoken], vec![]);
    let (document, _) = evidence_planning::ground(plan(&[0]), &candidates, &task).unwrap();
    assert!(document.gaps.is_empty());
    assert_eq!(document.clips[0].end_ms - document.clips[0].start_ms, 6600);
    task.request.target_seconds = 6;
    assert!(evidence_planning::ground(plan(&[0]), &candidates, &task).is_err());
    task.request.task_type = "picture_remix".into();
    task.request.narration_asset_id = Some(Uuid::nil());
    task.request.target_seconds = 10;
    let mut picture = visual(Uuid::nil());
    picture.start_ms = 0;
    picture.end_ms = 6600;
    let candidates = evidence_candidates::select(&[Uuid::nil()], vec![], vec![picture]);
    let mut short = plan(&[0]);
    short.shots[0].duration_frames = Some(198);
    assert!(evidence_planning::ground(short, &candidates, &task).is_err());
}

#[test]
fn model_input_links_modalities_with_source_coordinates_not_titles() {
    let asset = Uuid::new_v4();
    let other = Uuid::new_v4();
    let candidates = evidence_candidates::select(
        &[asset, other],
        vec![transcript(asset, 1500)],
        vec![visual(asset), visual(other)],
    );
    let input = candidates
        .iter()
        .enumerate()
        .map(|(i, c)| c.model_input(i))
        .collect::<Vec<_>>();
    assert_eq!(
        input[0]["source"],
        serde_json::json!({"assetId":asset,"startMs":1500,"endMs":2500})
    );
    assert_eq!(
        input[1]["source"],
        serde_json::json!({"assetId":asset,"startMs":1000,"endMs":3000})
    );
    assert_eq!(input[2]["source"]["assetId"], other.to_string());
    assert_eq!(input[0]["durationMs"], 1000);
    assert_eq!(input[1]["durationMs"], 2000);
    assert_ne!(input[0]["source"]["assetId"], input[2]["source"]["assetId"]);
    let serialized = serde_json::to_string(&input).unwrap();
    assert!(!serialized.contains("signed-secret"));
    assert!(!serialized.contains("objectKey"));
}

#[test]
fn source_text_handling_reaches_actual_candidate_model_input() {
    let asset = Uuid::new_v4();
    let mut candidate = visual(asset);
    candidate.visible_text = super::super::visible_text::for_segment(
        serde_json::json!({"coverage":"partial","observations":[
            {"start_ms":1000,"end_ms":2000,"text":"限时价","role":"promotion","box":null,"confidence":0.8}
        ]}),
        1000,
        3000,
        4000.0,
    );
    let candidates = evidence_candidates::select(&[asset], vec![], vec![candidate]);
    let input = candidates[0].model_input(0);
    let advice = &input["evidence"]["visibleText"]["selectionAdvice"];
    assert!(advice["handlingSteps"]
        .as_array()
        .unwrap()
        .contains(&serde_json::json!(
            "check_promotion_against_current_business_facts"
        )));
    assert_eq!(advice["cleanStatus"], "unverified");
    assert_eq!(advice["erasureAuthorized"], false);
}
