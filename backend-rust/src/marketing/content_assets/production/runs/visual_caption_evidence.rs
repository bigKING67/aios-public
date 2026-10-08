//! Bind high-resolution caption observations without guessing original fonts.
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn invalid() -> AppError {
    AppError::Conflict("字幕高清复检证据与当前工程不一致".into())
}
fn digest(value: &Value) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(value).expect("JSON serializes"))
    )
}
fn sha(value: &Value) -> bool {
    value.as_str().is_some_and(|s| {
        s.len() == 64
            && s.bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    })
}

pub(super) fn inspect(entry: &Value, request: &Value, document: &Value) -> AppResult<Value> {
    let evidence = &entry["captionEvidence"];
    let samples = evidence["samples"].as_array().ok_or_else(invalid)?;
    let canvas = &document["canvas"];
    let height = canvas["height"].as_u64().ok_or_else(invalid)?;
    let start = request["timeline"]["startFrame"]
        .as_u64()
        .ok_or_else(invalid)?;
    let end = request["timeline"]["endFrame"]
        .as_u64()
        .ok_or_else(invalid)?;
    let eligible = evidence["eligibleIntervals"].as_u64().ok_or_else(invalid)?;
    if evidence["schema"] != "aios.caption-visual-evidence.v1"
        || evidence["documentSha256"] != digest(document)
        || evidence["requestSha256"] != digest(request)
        || evidence["sampleLimit"] != 3
        || samples.len() as u64 != eligible.min(3)
        || evidence["geometryBasis"] != "requested_style_band_not_detected_text"
        || evidence["canvas"] != json!({"width":canvas["width"],"height":canvas["height"]})
        || evidence["panels"]
            != json!(["top: original narration picture", "bottom: final candidate"])
        || entry["captionEvidenceSha256"] != digest(evidence)
        || (!samples.is_empty()
            && (!sha(&evidence["sourceExcerptSha256"]) || !sha(&evidence["renderExcerptSha256"])))
    {
        return Err(invalid());
    }
    let mut seen = std::collections::HashSet::new();
    for sample in samples {
        let id = sample["captionId"].as_str().ok_or_else(invalid)?;
        let cue = document["captions"]
            .as_array()
            .ok_or_else(invalid)?
            .iter()
            .find(|cue| cue["id"] == id)
            .ok_or_else(invalid)?;
        let frame = sample["frame"].as_u64().ok_or_else(invalid)?;
        let lo = sample["startFrame"].as_u64().ok_or_else(invalid)?;
        let hi = sample["endFrame"].as_u64().ok_or_else(invalid)?;
        let y = sample["cropY"].as_u64().ok_or_else(invalid)?;
        let h = sample["cropHeight"].as_u64().ok_or_else(invalid)?;
        if sample.as_object().ok_or_else(invalid)?.len() != 9
            || !seen.insert((id, frame))
            || cue["stylePreset"] != "source-style-v1"
            || sample["expectedText"] != cue["text"]
            || !(start..end).contains(&frame)
            || sample["relativeFrame"].as_u64() != frame.checked_sub(start)
            || lo >= hi
            || hi > end.saturating_sub(start)
            || frame.checked_sub(start) != Some(lo + (hi - lo - 1) / 2)
            || h == 0
            || y.checked_add(h).is_none_or(|bottom| bottom > height)
            || !sha(&sample["imageSha256"])
        {
            return Err(invalid());
        }
    }
    // Only these fields are client-facing; the input hash still binds all bytes.
    Ok(
        json!({"sampleCount":samples.len(),"eligibleIntervals":eligible,
        "sampleLimit":3,"scope":"sampled_caption_bands","fontIdentity":"unverified",
        "sha256":entry["captionEvidenceSha256"]}),
    )
}
