use super::super::{evidence_tests, picture_remix, tests as fixtures};
use super::*;

fn fixture() -> (Snapshot, PlanDocument) {
    let mut run = evidence_tests::run();
    run.plan_revision = 4;
    run.request.task_type = "picture_remix".into();
    run.request.target_seconds = 3;
    run.request.narration_asset_id = Some(run.sources.assets[0].asset_id);
    let mut plan = fixtures::document();
    plan.clips[0].start_ms = 0;
    plan.clips[0].volume = 0.0;
    plan.clips[0].caption.clear();
    let document = picture_remix::edit_document(&run, &plan).unwrap();
    plan.narration_captions = Some(serde_json::from_value(json!({
        "assetId":run.sources.assets[0].asset_id,"sourceSha256":run.sources.assets[0].sha256,
        "cues":[{"id":"speech","startMs":200,"endMs":1000,"text":"保留原有字幕",
            "style":{"fontHeight":0.035,"centerY":0.7,"color":"#ffffff","strokeWidth":0.001,"weight":700}}]
    })).unwrap());
    let mut snapshot = run.sources;
    snapshot.clips = plan.clips.clone();
    snapshot.edit_document = document;
    (snapshot, plan)
}

#[test]
fn restoration_changes_only_captions_revision_and_source_display_policy() {
    let (snapshot, plan) = fixture();
    let before = serde_json::to_value(&snapshot).unwrap();
    let restored = revise(snapshot, &plan).unwrap();
    let mut after = serde_json::to_value(restored).unwrap();
    assert_eq!(
        after["editDocument"]["captions"],
        json!(captions::compile(&plan))
    );
    assert_eq!(after["editDocument"]["revision"], 5);
    assert_eq!(
        after["editDocument"]["captionDisplayPolicy"],
        "source-hold-v1"
    );
    after["editDocument"]
        .as_object_mut()
        .unwrap()
        .remove("captionDisplayPolicy");
    after["editDocument"]["captions"] = json!([]);
    after["editDocument"]["revision"] = json!(4);
    assert_eq!(before, after);
}

#[test]
fn newline_revision_preserves_exact_frozen_rational_times_and_style() {
    let (snapshot, mut plan) = fixture();
    let mut snapshot = revise(snapshot, &plan).unwrap();
    let document = snapshot.edit_document.as_mut().unwrap();
    document["captions"][0]["anchor"]["sourceStart"] = json!({"num":1,"den":5});
    let before = serde_json::to_value(&snapshot).unwrap();
    plan.narration_captions.as_mut().unwrap().cues[0].text = "保留\n原有字幕".into();
    let mut after = serde_json::to_value(revise(snapshot, &plan).unwrap()).unwrap();
    assert_eq!(
        after["editDocument"]["captions"][0]["text"],
        "保留\n原有字幕"
    );
    after["editDocument"]["captions"][0]["text"] =
        before["editDocument"]["captions"][0]["text"].clone();
    after["editDocument"]["revision"] = before["editDocument"]["revision"].clone();
    assert_eq!(after, before);
}

#[test]
fn rejects_picture_text_style_timing_source_and_caption_removal() {
    let (snapshot, plan) = fixture();
    let snapshot = serde_json::to_value(revise(snapshot, &plan).unwrap()).unwrap();
    for change in [
        "picture", "text", "style", "time", "source", "remove", "id", "default",
    ] {
        let mut changed = plan.clone();
        let caption = changed.narration_captions.as_mut().unwrap();
        match change {
            "picture" => changed.clips[0].id = "different-picture".into(),
            "text" => caption.cues[0].text = "新增文案".into(),
            "style" => caption.cues[0].style.as_mut().unwrap().weight = 900,
            "time" => caption.cues[0].end_ms += 1,
            "source" => caption.source_sha256 = "b".repeat(64),
            "remove" => caption.cues.clear(),
            "id" => caption.cues[0].id = "new-id".into(),
            "default" => caption.cues[0].style = None,
            _ => unreachable!(),
        }
        assert!(
            revise(serde_json::from_value(snapshot.clone()).unwrap(), &changed).is_err(),
            "{change}"
        );
    }
}

#[test]
fn restoration_requires_explicit_style_and_frozen_repairs() {
    let (mut snapshot, plan) = fixture();
    snapshot.edit_document.as_mut().unwrap()["captionRepair"] = json!({});
    assert!(revise(snapshot, &plan).is_err());
    let (snapshot, mut plan) = fixture();
    plan.narration_captions.as_mut().unwrap().cues[0].style = None;
    assert!(revise(snapshot, &plan).is_err());
}
