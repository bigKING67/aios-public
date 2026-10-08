//! Reconcile host-bound caption preflight with coarse analysis for text review.
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};

pub(super) fn region(value: &Value) -> Option<(f64, f64)> {
    let top = value["top"].as_f64()?;
    let bottom = value["bottom"].as_f64()?;
    (top.is_finite()
        && bottom.is_finite()
        && top >= 0.0
        && bottom <= 1.0
        && bottom > top
        && bottom - top <= 0.25)
        .then_some((top, bottom))
}

pub(super) fn for_window(value: &Value, sha: &str, start: u32, end: u32) -> AppResult<Value> {
    let mut visible = super::super::visible_text::for_window(value, start, end);
    let Some(proof) = value.get("captionWindow") else {
        return Ok(visible);
    };
    let invalid = || AppError::bad_request("字幕预检证据不覆盖实际剪辑范围");
    let (top, bottom) = region(&proof["region"]).ok_or_else(invalid)?;
    if start >= end
        || proof["sourceSha256"] != sha
        || proof["scope"] != "observed-caption-band-only"
        || proof["deliveryApproved"] != false
        || proof["sourceStartMs"]
            .as_u64()
            .is_none_or(|v| v > u64::from(start))
        || proof["sourceEndMs"]
            .as_u64()
            .is_none_or(|v| v < u64::from(end))
    {
        return Err(invalid());
    }
    let lines = proof["observation"]["lines"]
        .as_array()
        .ok_or_else(invalid)?;
    let lines: Vec<_> = lines
        .iter()
        .map(|v| {
            v.as_str()
                .filter(|s| !s.trim().is_empty())
                .ok_or_else(invalid)
        })
        .collect::<AppResult<_>>()?;
    if lines.is_empty() || lines.len() > 4 {
        return Err(invalid());
    }
    // Missing full-picture observations remain missing, even with a valid band.
    if visible["status"] != "model_observed" {
        return Ok(visible);
    }
    let observations = visible["observations"].as_array().ok_or_else(invalid)?;
    let (superseded, mut current): (Vec<_>, Vec<_>) = observations.iter().cloned().partition(|o| {
        if o["role"] != "dialogue_subtitle" {
            return false;
        }
        let Some(b) = o["box"].as_array().filter(|b| b.len() == 4) else {
            return false;
        };
        match (b[1].as_f64(), b[3].as_f64()) {
            (Some(y), Some(h)) => h > 0.0 && y >= top && y + h <= bottom,
            _ => false,
        }
    });
    current.push(json!({"text":lines.join("\n"),"role":"dialogue_subtitle",
        "sourceStartMs":start,"sourceEndMs":end,"candidateStartMs":0,"candidateEndMs":end-start,
        "evidenceOrigin":"caption_preflight","scope":"observed-caption-band-only",
        "region":proof["region"],"timingPrecision":"frame_sample_model_observed"}));
    visible["supersededBandObservations"] = json!(superseded);
    visible["observations"] = json!(current);
    Ok(visible)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Value {
        json!({"status":"model_observed","observations":[
            {"text":"旧粗略字幕","role":"dialogue_subtitle","box":[0.1,0.72,0.8,0.1],"sourceStartMs":1000,"sourceEndMs":4000},
            {"text":"活动价","role":"promotion","box":[0.1,0.72,0.8,0.1],"sourceStartMs":1000,"sourceEndMs":4000}],
            "captionWindow":{"region":{"top":0.7,"bottom":0.85},"sourceSha256":"sha",
                "sourceStartMs":2400,"sourceEndMs":4000,"scope":"observed-caption-band-only",
                "deliveryApproved":false,"observation":{"lines":["实际字幕"]}}})
    }
    #[test]
    fn replaces_only_observed_band_dialogue_and_preserves_promotion() {
        let result = for_window(&fixture(), "sha", 2400, 3400).unwrap();
        assert_eq!(result["observations"][0]["text"], "活动价");
        assert_eq!(result["observations"][1]["text"], "实际字幕");
        assert_eq!(result["observations"][1]["sourceEndMs"], 3400);
        assert_eq!(
            result["supersededBandObservations"][0]["text"],
            "旧粗略字幕"
        );
        assert_eq!(
            super::super::super::visible_text::dialogue_boundary_status(&result),
            "single_text_model_estimated"
        );
    }
    #[test]
    fn unknown_or_outside_band_dialogue_is_not_overruled() {
        for bounds in [
            Value::Null,
            json!([0.1, 0.1, 0.8, 0.1]),
            json!([0.1, 0.8, 0.8, 0.1]),
        ] {
            let mut input = fixture();
            input["observations"][0]["box"] = bounds;
            let result = for_window(&input, "sha", 2400, 3400).unwrap();
            assert_eq!(result["observations"].as_array().unwrap().len(), 3);
            assert_eq!(
                super::super::super::visible_text::dialogue_boundary_status(&result),
                "multiple_texts_require_review"
            );
        }
    }
    #[test]
    fn refuses_unbound_ranges_and_does_not_upgrade_missing_analysis() {
        for (sha, start, end) in [
            ("wrong", 2400, 3400),
            ("sha", 2300, 3400),
            ("sha", 2400, 4100),
        ] {
            assert!(for_window(&fixture(), sha, start, end).is_err());
        }
        let mut input = fixture();
        input["status"] = json!("missing");
        assert_eq!(
            for_window(&input, "sha", 2400, 3400).unwrap()["status"],
            "missing"
        );
    }
}
