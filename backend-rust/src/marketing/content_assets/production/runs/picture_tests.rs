use super::super::types::{BoundAsset, Clip};
use super::{
    domain,
    evidence_planning::{ground, ModelPlan, ModelShot},
    picture_remix,
    tests::{input, snapshot},
};
use serde_json::json;
use uuid::Uuid;

#[test]
fn picture_request_and_plan_preserve_fixed_narration_contract() {
    let mut request = input();
    request.task_type = "picture_remix".into();
    request.target_seconds = 3;
    assert!(domain::validate_request(&request).is_err());
    let voice = request.asset_ids[0];
    let picture = Uuid::new_v4();
    request.narration_asset_id = Some(voice);
    request.asset_ids.push(picture);
    assert!(domain::validate_request(&request).is_ok());
    let mut sources = snapshot();
    sources.assets.push(BoundAsset {
        asset_id: picture,
        object_key: "picture.mp4".into(),
        sha256: "b".repeat(64),
        duration_ms: 4000,
    });
    let mut plan = super::tests::document();
    plan.clips = vec![Clip {
        id: "picture".into(),
        asset_id: picture,
        start_ms: 1000,
        end_ms: 4000,
        caption: String::new(),
        volume: 0.0,
    }];
    assert!(domain::validate_plan(&plan, &request, &sources).is_ok());
    plan.clips[0].volume = 1.0;
    assert!(domain::validate_plan(&plan, &request, &sources).is_err());
    plan.clips[0].volume = 0.0;
    plan.clips[0].end_ms = 3000;
    assert!(domain::validate_plan(&plan, &request, &sources).is_err());
    plan.clips[0].end_ms = 4000;
    plan.clips[0].asset_id = voice;
    assert!(domain::validate_plan(&plan, &request, &sources).is_err());
    plan.clips[0].asset_id = picture;
    let mut run = super::evidence_tests::run();
    run.request = request;
    run.sources = sources;
    run.plan_revision = 2;
    let document = picture_remix::edit_document(&run, &plan).unwrap().unwrap();
    assert_eq!(document["assets"].as_array().unwrap().len(), 2);
    assert_eq!(
        document["clips"][0]["sourceMap"][0]["sourceEnd"],
        json!({"num":12000,"den":3000})
    );
    assert_eq!(document["clips"][1]["timeline"]["endFrame"], 90);
    assert_eq!(document["revision"], 2);
    assert!(document["captions"].as_array().unwrap().is_empty());
    assert_eq!(
        document["captionOverlayPolicy"],
        "preserve-source-picture-v1"
    );
    run.sources.assets[0].duration_ms = 2000;
    assert!(picture_remix::validate_source(&run.request, &run.sources).is_err());
}

#[test]
fn picture_grounding_rejects_transcript_only_picture_candidates() {
    let request = input();
    let sources = snapshot();
    let mut run = super::evidence_tests::run();
    run.request = request;
    run.sources = sources;
    let plan = ModelPlan {
        shots: vec![ModelShot {
            slot_id: None,
            candidate_id: 0,
            reason: "x".into(),
            duration_frames: Some(30),
        }],
        gaps: vec![],
    };
    // Ordinary tasks must reject the new picture-only duration override too.
    let candidates = vec![super::evidence_candidates::Candidate {
        asset_id: Uuid::nil(),
        title: "x".into(),
        start_ms: 0,
        end_ms: 1000,
        evidence: super::evidence_candidates::Evidence::Transcript {
            transcript_id: Uuid::new_v4(),
            text: "x".into(),
        },
    }];
    assert!(ground(plan, &candidates, &run).is_err());
    run.request.task_type = "picture_remix".into();
    run.request.narration_asset_id = Some(Uuid::nil());
    let plan = ModelPlan {
        shots: vec![ModelShot {
            slot_id: None,
            candidate_id: 0,
            reason: "x".into(),
            duration_frames: Some(30),
        }],
        gaps: vec![],
    };
    assert!(ground(plan, &candidates, &run).is_err());
}

#[test]
fn narration_keeps_all_segments_and_rejects_crossing_or_oversized_text() {
    use super::super::types::ClipHit;
    let mut run = super::evidence_tests::run();
    run.request.task_type = "picture_remix".into();
    run.request.target_seconds = 3;
    let id = run.sources.assets[0].asset_id;
    run.request.narration_asset_id = Some(id);
    let mut hits: Vec<_> = (0..40)
        .rev()
        .map(|i| ClipHit {
            asset_id: id,
            title: String::new(),
            transcript_id: Uuid::new_v4(),
            start_ms: i * 75,
            end_ms: (i + 1) * 75,
            text: format!("segment {i}"),
            can_use: true,
            playback_url: String::new(),
        })
        .collect();
    let value = super::evidence_planning::narration(&hits, &run).unwrap();
    assert_eq!(value["transcripts"].as_array().unwrap().len(), 40);
    assert_eq!(value["transcripts"][0]["startMs"], 0);
    assert_eq!(value["transcripts"][39]["endMs"], 3000);
    hits[0].end_ms = 3100;
    assert!(super::evidence_planning::narration(&hits, &run).is_err());
    hits[0].end_ms = 3000;
    hits[0].text = "x".repeat(32_001);
    assert!(super::evidence_planning::narration(&hits, &run).is_err());
}

#[test]
fn retained_narration_picture_must_stay_at_original_time() {
    let mut run = super::evidence_tests::run();
    run.request.task_type = "picture_remix".into();
    run.request.target_seconds = 3;
    let voice = run.sources.assets[0].asset_id;
    run.request.narration_asset_id = Some(voice);
    let mut plan = super::tests::document();
    plan.clips = vec![Clip {
        id: "keep-original".into(),
        asset_id: voice,
        start_ms: 0,
        end_ms: 3000,
        caption: String::new(),
        volume: 0.0,
    }];
    assert!(picture_remix::validate(&plan, &run.request, &run.sources).is_ok());
    let edit = picture_remix::edit_document(&run, &plan).unwrap().unwrap();
    assert_eq!(edit["assets"].as_array().unwrap().len(), 1);
    assert_eq!(edit["clips"][0]["assetRef"], edit["clips"][1]["assetRef"]);
    plan.clips[0].start_ms = 1000;
    plan.clips[0].end_ms = 4000;
    assert!(picture_remix::validate(&plan, &run.request, &run.sources).is_err());
}

#[test]
fn host_preservation_candidate_needs_no_invented_visual_analysis() {
    let mut run = super::evidence_tests::run();
    run.request.task_type = "picture_remix".into();
    run.request.target_seconds = 3;
    run.request.narration_asset_id = Some(Uuid::nil());
    let candidate = picture_remix::preservation_candidate(&run).unwrap();
    assert_eq!(
        candidate.model_input(0)["evidence"]["kind"],
        "source-preservation"
    );
    assert!(candidate.model_input(0)["evidence"]
        .get("observation")
        .is_none());
    let make = |frames| ModelPlan {
        shots: vec![ModelShot {
            slot_id: None,
            candidate_id: 0,
            duration_frames: Some(frames),
            reason: "无可靠替代，保留原片".into(),
        }],
        gaps: vec![],
    };
    let (plan, selected) = ground(make(90), &[candidate], &run).unwrap();
    assert_eq!(plan.clips[0].asset_id, Uuid::nil());
    assert_eq!(
        selected[0]["source"]["evidence"]["rawSha256"],
        "a".repeat(64)
    );
    let edit = picture_remix::edit_document(&run, &plan).unwrap().unwrap();
    assert_eq!(edit["clips"][0]["assetRef"], edit["clips"][1]["assetRef"]);
    assert!(ground(
        make(89),
        &[picture_remix::preservation_candidate(&run).unwrap()],
        &run
    )
    .is_err());
    let mut unmet = make(90);
    unmet.gaps = vec!["任务要求新增对比画面，保留原片无法满足".into()];
    let (blocked, _) = ground(
        unmet,
        &[picture_remix::preservation_candidate(&run).unwrap()],
        &run,
    )
    .unwrap();
    assert_eq!(blocked.gaps.len(), 1);
    run.sources.assets[0].duration_ms = 2999;
    assert!(picture_remix::preservation_candidate(&run).is_err());
}
