//! Source-bound narration captions saved with the plan, before project freezing.
use super::types::{CreateRunRequest, PlanDocument};
use crate::{
    error::{AppError, AppResult},
    marketing::content_assets::production::types::Snapshot,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use uuid::Uuid;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::marketing::content_assets::production) struct NarrationCaptions {
    pub asset_id: Uuid,
    pub source_sha256: String,
    pub cues: Vec<Cue>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::marketing::content_assets::production) struct Cue {
    pub id: String,
    pub start_ms: u32,
    pub end_ms: u32,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<CaptionStyle>,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::marketing::content_assets::production) struct CaptionStyle {
    pub font_height: f64,
    pub center_y: f64,
    pub color: String,
    pub stroke_width: f64,
    pub weight: u16,
}

impl CaptionStyle {
    fn valid(&self) -> bool {
        (0.015..=0.08).contains(&self.font_height)
            && (0.1..=0.9).contains(&self.center_y)
            && (0.0..=0.004).contains(&self.stroke_width)
            && matches!(self.weight, 400 | 600 | 700 | 900)
            && self.color.len() == 7
            && self.color.starts_with('#')
            && self.color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    }
}

pub(super) fn validate(
    plan: &PlanDocument,
    request: &CreateRunRequest,
    sources: &Snapshot,
) -> AppResult<()> {
    let Some(captions) = &plan.narration_captions else {
        return Ok(());
    };
    let invalid = || AppError::bad_request("主讲字幕来源、时间范围或内容无效，请重新生成方案");
    if request.task_type != "picture_remix" || request.narration_asset_id != Some(captions.asset_id)
    {
        return Err(invalid());
    }
    let source = sources
        .assets
        .iter()
        .find(|a| a.asset_id == captions.asset_id)
        .ok_or_else(invalid)?;
    if captions.source_sha256.len() != 64
        || !captions
            .source_sha256
            .bytes()
            .all(|c| c.is_ascii_hexdigit())
        || source.sha256 != captions.source_sha256
        || captions.cues.is_empty()
        || captions.cues.len() > 500
    {
        return Err(invalid());
    }
    let mut ids = HashSet::new();
    let mut previous_end = 0;
    for cue in &captions.cues {
        let first_frame = (u64::from(cue.start_ms) * 30).div_ceil(1000);
        let last_frame = (u64::from(cue.end_ms) * 30).div_ceil(1000);
        if cue.style.as_ref().is_some_and(|style| !style.valid())
            || cue.id.trim().is_empty()
            || cue.id.len() > 100
            || !ids.insert(&cue.id)
            || cue.start_ms < previous_end
            || cue.end_ms <= cue.start_ms
            || cue.end_ms > source.duration_ms
            || u64::from(cue.end_ms) > u64::from(request.target_seconds) * 1000
            || first_frame >= last_frame
            || cue.text.trim().is_empty()
            || cue.text.chars().count() > 2000
            || cue.text.chars().any(|c| c.is_control() && c != '\n')
        {
            return Err(invalid());
        }
        previous_end = cue.end_ms;
    }
    Ok(())
}

pub(super) fn compile(plan: &PlanDocument) -> Vec<Value> {
    let Some(captions) = &plan.narration_captions else {
        return vec![];
    };
    let version = format!("{}-{}", captions.asset_id, &captions.source_sha256[..16]);
    captions.cues.iter().map(|cue| {
        let mut compiled = json!({
            "id":cue.id,"text":cue.text,"stylePreset":"basic-bottom-v1",
            "anchor":{"kind":"source","clipId":"narration","assetVersionId":version,
                "sourceStart":{"num":cue.start_ms,"den":1000},"sourceEnd":{"num":cue.end_ms,"den":1000}}
        });
        if let Some(style) = &cue.style {
            compiled["stylePreset"] = json!("source-style-v1");
            compiled["style"] = json!(style);
        }
        compiled
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::marketing::content_assets::production::runs::{
        evidence_tests, picture_remix, tests as fixtures,
    };

    #[test]
    fn source_style_rejects_unbounded_or_injected_parameters() {
        let value = json!({"fontHeight":0.035,"centerY":0.6875,"color":"#ffffff","strokeWidth":0.0015,"weight":900});
        let style: CaptionStyle = serde_json::from_value(value.clone()).unwrap();
        assert!(style.valid());
        for (key, bad) in [
            ("fontHeight", json!(1)),
            ("centerY", json!(-1)),
            ("strokeWidth", json!(0.01)),
            ("weight", json!(100)),
            ("color", json!("red;display:none")),
        ] {
            let mut invalid = value.clone();
            invalid[key] = bad;
            assert!(!serde_json::from_value::<CaptionStyle>(invalid)
                .unwrap()
                .valid());
        }
        let mut invalid = value.clone();
        invalid["fontHeight"] = json!(true);
        assert!(serde_json::from_value::<CaptionStyle>(invalid).is_err());
        let mut invalid = value;
        invalid["css"] = json!("display:none");
        assert!(serde_json::from_value::<CaptionStyle>(invalid).is_err());
        let mut invalid = style;
        invalid.center_y = f64::NAN;
        assert!(!invalid.valid());
    }

    #[test]
    fn caption_plan_is_optional_and_freezes_to_source_anchored_document() {
        let mut run = evidence_tests::run();
        run.request.task_type = "picture_remix".into();
        run.request.target_seconds = 3;
        run.request.narration_asset_id = Some(run.sources.assets[0].asset_id);
        let mut plan = fixtures::document();
        plan.clips[0].start_ms = 0;
        plan.clips[0].end_ms = 3000;
        plan.clips[0].volume = 0.0;
        plan.clips[0].caption.clear();
        assert!(serde_json::to_value(&run.request)
            .unwrap()
            .get("generateCaptions")
            .is_none());
        run.request.generate_captions = true;
        assert!(picture_remix::edit_document(&run, &plan).is_err());
        let old_json = serde_json::to_value(&plan).unwrap();
        assert!(old_json.get("narrationCaptions").is_none());
        assert!(serde_json::from_value::<PlanDocument>(old_json)
            .unwrap()
            .narration_captions
            .is_none());
        plan.narration_captions = Some(NarrationCaptions {
            asset_id: run.sources.assets[0].asset_id,
            source_sha256: run.sources.assets[0].sha256.clone(),
            cues: vec![Cue {
                id: "speech".into(),
                start_ms: 200,
                end_ms: 1600,
                text: "完整字幕".into(),
                style: None,
            }],
        });
        validate(&plan, &run.request, &run.sources).unwrap();
        let saved: PlanDocument =
            serde_json::from_value(serde_json::to_value(&plan).unwrap()).unwrap();
        let document = picture_remix::edit_document(&run, &saved).unwrap().unwrap();
        assert_eq!(document["captions"][0]["anchor"]["clipId"], "narration");
        assert_eq!(document["captionDisplayPolicy"], "source-hold-v1");
        assert_eq!(
            document["captionOverlayPolicy"],
            "preserve-source-picture-v1"
        );
        assert_eq!(
            document["captions"][0]["anchor"]["sourceStart"],
            json!({"num":200,"den":1000})
        );
        assert_eq!(document["captions"][0]["text"], "完整字幕");
        assert!(document["captions"][0].get("qualityPassed").is_none());
        for kind in [
            "stale",
            "wrong_asset",
            "outside",
            "duplicate",
            "frame_empty",
            "text_control",
        ] {
            let mut invalid = saved.clone();
            let captions = invalid.narration_captions.as_mut().unwrap();
            match kind {
                "stale" => captions.source_sha256 = "b".repeat(64),
                "wrong_asset" => captions.asset_id = Uuid::new_v4(),
                "outside" => captions.cues[0].end_ms = 3001,
                "duplicate" => captions.cues.push(captions.cues[0].clone()),
                "frame_empty" => {
                    captions.cues[0].start_ms = 1;
                    captions.cues[0].end_ms = 2;
                }
                _ => captions.cues[0].text = "bad\0".into(),
            }
            assert!(
                validate(&invalid, &run.request, &run.sources).is_err(),
                "{kind}"
            );
        }
        run.request.task_type = "smart".into();
        assert!(validate(&saved, &run.request, &run.sources).is_err());
    }
}
