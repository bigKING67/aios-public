//! Convert verified preflight windows to one conservative fixed-time candidate.
use super::evidence_candidates::{Candidate, Evidence};
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};

fn invalid() -> AppError {
    AppError::bad_request("字幕预检时间窗与原片范围不一致")
}

fn frame(value: &Value) -> AppResult<u64> {
    value.as_u64().ok_or_else(invalid)
}

fn rational_matches(value: &Value, at: u64) -> bool {
    match (value["num"].as_u64(), value["den"].as_u64()) {
        (Some(n), Some(d)) if d > 0 => u128::from(n) * 30 == u128::from(at) * u128::from(d),
        _ => false,
    }
}

pub(super) fn narrow(
    candidate: &Candidate,
    request: &Value,
    report: &Value,
) -> AppResult<Option<Candidate>> {
    if report["status"] != "candidates_observed" {
        return Ok(None);
    }
    super::caption_review_window::region(&request["region"]).ok_or_else(invalid)?;
    let start = frame(&request["startFrame"])?;
    let count = frame(&request["frames"])?;
    if !(30..=150).contains(&count) || start > 54000 {
        return Err(invalid());
    }
    let end = start + count;
    let binding = &report["sourceBinding"];
    if binding["assetVersionId"] != request["assetVersionId"]
        || binding["sourceSha256"] != request["sourceSha256"]
        || binding["fps"] != 30
        || !rational_matches(&binding["sourceMap"]["sourceStart"], start)
        || !rational_matches(&binding["sourceMap"]["sourceEnd"], end)
    {
        return Err(invalid());
    }
    let windows = report["candidates"].as_array().ok_or_else(invalid)?;
    if windows.len() > 150 {
        return Err(invalid());
    }
    let mut best: Option<(u32, u32, Value)> = None;
    let mut previous_end = 0;
    for window in windows {
        let lo = frame(&window["startFrame"])?;
        let hi = frame(&window["endFrame"])?;
        let lines = window["lines"].as_array().ok_or_else(invalid)?;
        if lo < previous_end
            || lo >= hi
            || hi > count
            || frame(&window["frameCount"])? != hi - lo
            || lines.is_empty()
            || lines.len() > 4
            || lines.iter().any(|v| {
                v.as_str()
                    .is_none_or(|s| s.trim().is_empty() || s.chars().count() > 100)
            })
            || !rational_matches(&window["sourceMap"]["sourceStart"], start + lo)
            || !rational_matches(&window["sourceMap"]["sourceEnd"], start + hi)
        {
            return Err(invalid());
        }
        previous_end = hi;
        // 100ms = exactly 3 frames; never round outside the observed interval.
        let lo_ms = u32::try_from((start + lo).div_ceil(3) * 100).map_err(|_| invalid())?;
        let hi_ms = u32::try_from((start + hi) / 3 * 100).map_err(|_| invalid())?;
        if lo_ms < candidate.start_ms || hi_ms > candidate.end_ms {
            return Err(invalid());
        }
        if hi_ms.saturating_sub(lo_ms) < 1000 {
            continue;
        }
        if best.as_ref().is_none_or(|(a, b, _)| hi_ms - lo_ms > b - a) {
            best = Some((lo_ms, hi_ms, window.clone()));
        }
    }
    let Some((lo, hi, window)) = best else {
        return Ok(None);
    };
    let mut narrowed = candidate.clone();
    let Evidence::RawVideoAnalysis(evidence) = &mut narrowed.evidence else {
        return Err(invalid());
    };
    if evidence.raw_sha256 != request["sourceSha256"].as_str().ok_or_else(invalid)? {
        return Err(invalid());
    }
    if evidence.raw_sha256.len() != 64
        || !evidence.raw_sha256.bytes().all(|b| b.is_ascii_hexdigit())
        || request["assetVersionId"]
            != format!("{}-{}", candidate.asset_id, &evidence.raw_sha256[..16])
    {
        return Err(invalid());
    }
    narrowed.start_ms = lo;
    narrowed.end_ms = hi;
    // Retain all original observations and conflict roles: this is neither a
    // clean-picture certificate nor a replacement for the independent review.
    evidence.visible_text["captionWindow"] = json!({"originalStartMs":candidate.start_ms,"originalEndMs":candidate.end_ms,
        "sourceStartMs":lo,"sourceEndMs":hi,"observation":window,"coverageSha256":report["coverageSha256"],
        "region":request["region"],"sourceSha256":evidence.raw_sha256,
        "scope":"observed-caption-band-only","deliveryApproved":false});
    Ok(Some(narrowed))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixtures() -> (Candidate, Value, Value) {
        let asset = uuid::Uuid::new_v4();
        let visual = super::super::evidence_tests::visual(asset);
        let candidate = Candidate {
            asset_id: asset,
            title: "fixture".into(),
            start_ms: 1000,
            end_ms: 4000,
            evidence: Evidence::RawVideoAnalysis(Box::new(visual)),
        };
        let input = json!({"region":{"top":0.7,"bottom":0.85},"startFrame":30,"frames":90,"assetVersionId":format!("{}-{}",asset,"a".repeat(16)),"sourceSha256":"a".repeat(64)});
        let interval = |lo: u64, hi: u64| {
            json!({"startFrame":lo,"endFrame":hi,"frameCount":hi-lo,"lines":["原字幕"],
            "sourceMap":{"sourceStart":{"num":30+lo,"den":30},"sourceEnd":{"num":30+hi,"den":30}}})
        };
        let report = json!({"status":"candidates_observed","sourceBinding":{"assetVersionId":format!("{}-{}",asset,"a".repeat(16)),"sourceSha256":"a".repeat(64),"fps":30,
            "sourceMap":{"sourceStart":{"num":1,"den":1},"sourceEnd":{"num":4,"den":1}}},"candidates":[interval(1,40),interval(42,90)]});
        (candidate, input, report)
    }
    #[test]
    fn inward_grid_preserves_risks_and_selects_longest_window() {
        let (candidate, input, report) = fixtures();
        let narrowed = narrow(&candidate, &input, &report).unwrap().unwrap();
        assert_eq!((narrowed.start_ms, narrowed.end_ms), (2400, 4000));
        assert_eq!((candidate.start_ms, candidate.end_ms), (1000, 4000));
        let Evidence::RawVideoAnalysis(v) = narrowed.evidence else {
            panic!()
        };
        assert_eq!(v.visible_text["status"], "missing");
        assert_eq!(v.visible_text["captionWindow"]["deliveryApproved"], false);
    }
    #[test]
    fn rejects_wrong_mapping_overlap_and_out_of_range() {
        let (candidate, input, report) = fixtures();
        for path in [0, 1, 2] {
            let mut changed = report.clone();
            match path {
                0 => changed["candidates"][0]["sourceMap"]["sourceEnd"]["num"] = json!(999),
                1 => changed["candidates"][1]["startFrame"] = json!(20),
                _ => changed["sourceBinding"]["sourceSha256"] = json!("b".repeat(64)),
            }
            assert!(narrow(&candidate, &input, &changed).is_err());
        }
    }
    #[test]
    fn short_window_is_not_stretched() {
        let (candidate, input, mut report) = fixtures();
        report["candidates"] = json!([{"startFrame":1,"endFrame":31,"frameCount":30,"lines":["原字幕"],
            "sourceMap":{"sourceStart":{"num":31,"den":30},"sourceEnd":{"num":61,"den":30}}}]);
        assert!(narrow(&candidate, &input, &report).unwrap().is_none());
    }

    #[test]
    fn selected_slot_stays_inside_observed_source_window() {
        use super::super::{
            evidence_planning::{ModelPlan, ModelShot},
            picture_remix, picture_slots,
        };
        use crate::marketing::content_assets::production::types::BoundAsset;
        let (candidate, input, report) = fixtures();
        let mut narrowed = narrow(&candidate, &input, &report).unwrap().unwrap();
        if let Evidence::RawVideoAnalysis(v) = &mut narrowed.evidence {
            v.visible_text["status"] = json!("model_observed");
            v.visible_text["observations"] = json!([{"text":"旧估计文字","role":"dialogue_subtitle",
                "sourceStartMs":1000,"sourceEndMs":4000,"box":[0.1,0.72,0.8,0.1]}]);
        }
        let mut run = super::super::evidence_tests::run();
        run.request.task_type = "picture_remix".into();
        run.request.target_seconds = 3;
        run.request.narration_asset_id = Some(run.sources.assets[0].asset_id);
        run.request.asset_ids.push(candidate.asset_id);
        run.sources.assets.push(BoundAsset {
            asset_id: candidate.asset_id,
            object_key: "replacement.mp4".into(),
            sha256: "a".repeat(64),
            duration_ms: 6000,
        });
        let candidates = vec![
            narrowed,
            picture_remix::preservation_candidate(&run).unwrap(),
        ];
        let slots = picture_slots::build(
            &json!({"transcripts":[{"endMs":1000},{"endMs":2000}]}),
            &candidates,
            &run,
        )
        .unwrap();
        assert!(serde_json::to_value(&slots[0]).unwrap()["candidateIds"]
            .as_array()
            .unwrap()
            .contains(&json!(0)));
        let plan = ModelPlan {
            shots: slots
                .iter()
                .enumerate()
                .map(|(i, _)| ModelShot {
                    slot_id: Some(i),
                    candidate_id: if i == 0 { 0 } else { 1 },
                    duration_frames: None,
                    reason: "fixture".into(),
                })
                .collect(),
            gaps: vec![],
        };
        let (document, selected) = picture_slots::ground(plan, &candidates, &run, &slots).unwrap();
        assert_eq!(
            (document.clips[0].start_ms, document.clips[0].end_ms),
            (2400, 3400)
        );
        assert_eq!(document.clips[0].volume, 0.0);
        assert!(document.clips[0].caption.is_empty());
        let options = crate::llm::LlmCallOptions {
            provider: None,
            model: None,
            thinking_enabled: false,
            request_scope: None,
            system_prompt: String::new(),
            user_prompt: json!({"slots":slots,"brief":"fixture","narration":{"transcripts":[
                {"startMs":0,"endMs":1000,"text":"原字幕"}]}})
            .to_string(),
        };
        let review = super::super::selection_review::request(&options, &candidates, &selected)
            .unwrap()
            .unwrap();
        let payload: Value = serde_json::from_str(&review.user_prompt).unwrap();
        assert_eq!(
            payload["windows"][0]["visibleText"]["observations"][0]["text"],
            "原字幕"
        );
        for (verdict, expected) in [
            ("compatible", "compatible_on_supplied_evidence"),
            ("conflict", "needs_revision"),
            ("uncertain", "needs_revision"),
        ] {
            let mut checked = document.clone();
            let response = json!({"checks":[{"clipId":payload["windows"][0]["clipId"],"verdict":verdict,"reason":"fixture"}]}).to_string();
            let receipt =
                super::super::selection_review::apply(&mut checked, &review.user_prompt, &response)
                    .unwrap();
            assert_eq!(receipt["status"], expected);
            assert_eq!(receipt["deliveryApproved"], false);
            assert_eq!(
                receipt["deferredChecks"],
                json!([
                    "full_frame_text_coverage",
                    "picture_semantics_and_edit_quality",
                    "final_audio_visual_sync",
                    "adjacent_picture_caption_continuity"
                ])
            );
        }
    }
    #[test]
    #[ignore = "requires explicitly supplied local real-media preflight receipts"]
    fn real_preflight_receipt_reaches_compiled_review() {
        use super::super::{
            evidence_planning::{ModelPlan, ModelShot},
            picture_remix, picture_slots, selection_review,
        };
        use crate::marketing::content_assets::production::types::BoundAsset;
        let root =
            std::path::PathBuf::from(std::env::var("AIOS_TEST_CAPTION_RECEIPT_DIR").unwrap());
        let read = |name: &str| -> Value {
            serde_json::from_slice(&std::fs::read(root.join(name)).unwrap()).unwrap()
        };
        let input = read("input.json");
        let request = &input["request"];
        let report = read("replayed-report.json");
        let original = read("planner-request.json");
        let asset = request["assetVersionId"].as_str().unwrap()[..36]
            .parse()
            .unwrap();
        let mut visual = super::super::evidence_tests::visual(asset);
        visual.raw_sha256 = request["sourceSha256"].as_str().unwrap().into();
        visual.visible_text = original["userPrompt"]["candidates"]
            .as_array()
            .unwrap()
            .iter()
            .find_map(|c| {
                (c["source"]["assetId"] == asset.to_string())
                    .then(|| c["evidence"]["visibleText"].clone())
            })
            .unwrap();
        let candidate = Candidate {
            asset_id: asset,
            title: "local real media".into(),
            start_ms: 22000,
            end_ms: 24000,
            evidence: Evidence::RawVideoAnalysis(Box::new(visual)),
        };
        let narrowed = narrow(&candidate, request, &report).unwrap().unwrap();
        assert_eq!((narrowed.start_ms, narrowed.end_ms), (22000, 23800));
        let mut run = super::super::evidence_tests::run();
        run.request.task_type = "picture_remix".into();
        run.request.target_seconds = 32;
        run.sources.assets[0].duration_ms = 60000;
        run.request.narration_asset_id = Some(run.sources.assets[0].asset_id);
        run.request.asset_ids.push(asset);
        run.sources.assets.push(BoundAsset {
            asset_id: asset,
            object_key: "local-fixture.mp4".into(),
            sha256: request["sourceSha256"].as_str().unwrap().into(),
            duration_ms: 60000,
        });
        let candidates = vec![
            narrowed,
            picture_remix::preservation_candidate(&run).unwrap(),
        ];
        let slots =
            picture_slots::build(&original["userPrompt"]["narration"], &candidates, &run).unwrap();
        let shots = slots
            .iter()
            .enumerate()
            .map(|(i, _)| ModelShot {
                slot_id: Some(i),
                candidate_id: if i + 1 == slots.len() { 0 } else { 1 },
                duration_frames: None,
                reason: "bounded local acceptance selection".into(),
            })
            .collect();
        let (document, selected) = picture_slots::ground(
            ModelPlan {
                shots,
                gaps: vec![],
            },
            &candidates,
            &run,
            &slots,
        )
        .unwrap();
        let options = crate::llm::LlmCallOptions {
            provider: None,
            model: None,
            thinking_enabled: false,
            request_scope: None,
            system_prompt: String::new(),
            user_prompt: original["userPrompt"].to_string(),
        };
        let review = selection_review::request(&options, &candidates, &selected)
            .unwrap()
            .unwrap();
        let payload: Value = serde_json::from_str(&review.user_prompt).unwrap();
        assert_eq!(payload["windows"].as_array().unwrap().len(), 1);
        assert_eq!(
            payload["reviewScope"]["contractVersion"],
            "observed-text-compatibility-v2"
        );
        std::fs::write(root.join("compiled-review.json"),serde_json::to_vec_pretty(&json!({"systemPrompt":review.system_prompt,"userPrompt":payload,"document":document,"selectionMode":"host acceptance fixture, not autonomous planner"})).unwrap()).unwrap();
    }
    #[test]
    #[ignore = "requires saved real-model review tied to compiled local receipt"]
    fn real_caption_review_response_uses_host_gate() {
        let root =
            std::path::PathBuf::from(std::env::var("AIOS_TEST_CAPTION_RECEIPT_DIR").unwrap());
        let input: Value =
            serde_json::from_slice(&std::fs::read(root.join("compiled-review.json")).unwrap())
                .unwrap();
        let mut document = serde_json::from_value(input["document"].clone()).unwrap();
        let response = std::fs::read_to_string(root.join("review-response.json")).unwrap();
        let receipt = super::super::selection_review::apply(
            &mut document,
            &input["userPrompt"].to_string(),
            &response,
        )
        .unwrap();
        assert_eq!(receipt["deliveryApproved"], false);
        std::fs::write(
            root.join("review-receipt.json"),
            serde_json::to_vec_pretty(&receipt).unwrap(),
        )
        .unwrap();
    }
}
