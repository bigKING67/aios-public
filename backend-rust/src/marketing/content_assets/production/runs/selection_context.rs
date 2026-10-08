//! Neighbor picture evidence is distinct from neighboring narration.
use super::evidence_candidates::{Candidate, Evidence};
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};

pub(super) fn adjacent(
    candidates: &[Candidate],
    selected: &[Value],
    choice: &Value,
) -> AppResult<Value> {
    let mut result = json!({"scope":"adjacent_picture_edges_1500ms", "timingVerified":false});
    for (side, own_edge, other_edge) in [
        ("before", "timelineStartMs", "timelineEndMs"),
        ("after", "timelineEndMs", "timelineStartMs"),
    ] {
        let edge = choice["slot"][own_edge]
            .as_u64()
            .ok_or(AppError::Internal)?;
        let neighbors: Vec<_> = selected
            .iter()
            .filter(|c| {
                c["clipId"] != choice["clipId"] && c["slot"][other_edge].as_u64() == Some(edge)
            })
            .collect();
        result[side] = if let [neighbor] = neighbors.as_slice() {
            let id = neighbor["candidateId"].as_u64().ok_or(AppError::Internal)? as usize;
            let candidate = candidates.get(id).ok_or(AppError::Internal)?;
            let start = neighbor["compiledSource"]["startMs"]
                .as_u64()
                .ok_or(AppError::Internal)?;
            let end = neighbor["compiledSource"]["endMs"]
                .as_u64()
                .ok_or(AppError::Internal)?;
            let (lo, hi) = if side == "before" {
                (start.max(end.saturating_sub(1500)), end)
            } else {
                (start, end.min(start.saturating_add(1500)))
            };
            let visible = picture_text(candidate, candidates, lo, hi)?;
            let sha = match &candidate.evidence {
                Evidence::RawVideoAnalysis(v) => Some(v.raw_sha256.as_str()),
                Evidence::SourcePreservation { raw_sha256 } => Some(raw_sha256.as_str()),
                Evidence::Transcript { .. } => None,
            };
            json!({"clipId":neighbor["clipId"],"source":neighbor["compiledSource"],"sourceSha256":sha,
                "observedRange":{"startMs":lo,"endMs":hi},"visibleText":visible})
        } else {
            // A single-candidate repair request cannot prove the absence of neighbors.
            json!({"status":"unavailable", "reason":"adjacent_picture_not_supplied"})
        };
    }
    Ok(result)
}

// Reuse only a unique covering observation for this exact preserved asset version.
// A selected preservation option itself still carries no visual quality evidence.
fn picture_text(
    candidate: &Candidate,
    candidates: &[Candidate],
    lo: u64,
    hi: u64,
) -> AppResult<Value> {
    let visual = match &candidate.evidence {
        Evidence::RawVideoAnalysis(v) => Some(v.as_ref()),
        Evidence::SourcePreservation { raw_sha256 } => {
            let matches: Vec<_> = candidates
                .iter()
                .filter_map(|c| match &c.evidence {
                    Evidence::RawVideoAnalysis(v)
                        if c.asset_id == candidate.asset_id
                            && v.asset_id == candidate.asset_id
                            && &v.raw_sha256 == raw_sha256
                            && u64::from(v.start_ms) <= lo
                            && u64::from(v.end_ms) >= hi =>
                    {
                        Some(v.as_ref())
                    }
                    _ => None,
                })
                .collect();
            match matches.as_slice() {
                [v] => Some(*v),
                [] => None,
                _ => {
                    return Ok(
                        json!({"status":"missing", "reason":"ambiguous_picture_text_observation"}),
                    )
                }
            }
        }
        Evidence::Transcript { .. } => None,
    };
    let Some(v) = visual else {
        return Ok(json!({"status":"missing", "reason":"picture_text_not_observed"}));
    };
    let mut visible = super::caption_review_window::for_window(
        &v.visible_text,
        &v.raw_sha256,
        u32::try_from(lo).map_err(|_| AppError::Internal)?,
        u32::try_from(hi).map_err(|_| AppError::Internal)?,
    )?;
    visible["analysisBinding"] = json!({"analysisResultId":v.analysis_result_id,
        "sourceSha256":v.raw_sha256,"model":v.model,"promptVersion":v.prompt_version,
        "inputSnapshotHash":v.input_snapshot_hash});
    Ok(visible)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn observed_candidate() -> Candidate {
        let v = super::super::super::visual_search::VisualEvidence {
            model: String::new(),
            prompt_version: String::new(),
            analysis_schema_version: String::new(),
            input_snapshot_hash: String::new(),
            cache_key: String::new(),
            asset_id: uuid::Uuid::new_v4(),
            title: String::new(),
            start_ms: 0,
            end_ms: 6000,
            observation: String::new(),
            purpose_suggestion: String::new(),
            quality_signal: String::new(),
            analysis_result_id: uuid::Uuid::new_v4(),
            raw_sha256: "a".repeat(64),
            visible_text: json!({"status":"model_observed","observations":[
                {"text":"成分名称","role":"dialogue_subtitle","sourceStartMs":3000,"sourceEndMs":4500},
                {"text":"不应混入的活动字幕","role":"promotion","sourceStartMs":5000,"sourceEndMs":6000}]}),
        };
        Candidate {
            asset_id: v.asset_id,
            title: String::new(),
            start_ms: 0,
            end_ms: 6000,
            evidence: Evidence::RawVideoAnalysis(Box::new(v)),
        }
    }
    #[test]
    fn observed_neighbor_is_clipped_to_actual_edit_edge() {
        let candidate = observed_candidate();
        let target = json!({"clipId":"target","slot":{"timelineStartMs":0,"timelineEndMs":1000}});
        let neighbor = json!({"clipId":"after","candidateId":0,"slot":{"timelineStartMs":1000,"timelineEndMs":4000},"compiledSource":{"startMs":3000,"endMs":6000}});
        let context = adjacent(&[candidate], &[target.clone(), neighbor], &target).unwrap();
        let observations = context["after"]["visibleText"]["observations"]
            .as_array()
            .unwrap();
        assert_eq!(observations.len(), 1);
        assert_eq!(observations[0]["text"], "成分名称");
        assert_eq!(context["after"]["sourceSha256"], "a".repeat(64));
    }
    #[test]
    fn preservation_reuses_only_unique_same_version_covering_visual() {
        let observation = observed_candidate();
        let mut preserved = observation.clone();
        preserved.evidence = Evidence::SourcePreservation {
            raw_sha256: "a".repeat(64),
        };
        let text =
            picture_text(&preserved, std::slice::from_ref(&observation), 3000, 4500).unwrap();
        assert_eq!(text["observations"][0]["text"], "成分名称");
        assert_eq!(text["analysisBinding"]["sourceSha256"], "a".repeat(64));
        for mode in ["sha", "asset", "range", "duplicate"] {
            let mut other = observation.clone();
            if let Evidence::RawVideoAnalysis(v) = &mut other.evidence {
                match mode {
                    "sha" => v.raw_sha256 = "b".repeat(64),
                    "asset" => v.asset_id = uuid::Uuid::new_v4(),
                    "range" => v.end_ms = 4000,
                    _ => (),
                }
            }
            let mut candidates = vec![other];
            if mode == "duplicate" {
                candidates.push(observation.clone());
            }
            let result = picture_text(&preserved, &candidates, 3000, 4500).unwrap();
            assert_eq!(result["status"], "missing", "{mode}");
        }
    }
    #[test]
    fn preserved_neighbor_is_not_transcript_or_no_text_evidence() {
        let candidate = Candidate {
            asset_id: uuid::Uuid::new_v4(),
            title: String::new(),
            start_ms: 0,
            end_ms: 6000,
            evidence: Evidence::SourcePreservation {
                raw_sha256: "a".repeat(64),
            },
        };
        let before = json!({"clipId":"before","candidateId":0,"compiledSource":{"startMs":0,"endMs":3000},"slot":{"timelineStartMs":0,"timelineEndMs":3000}});
        let target = json!({"clipId":"target","candidateId":0,"compiledSource":{"startMs":3000,"endMs":4000},"slot":{"timelineStartMs":3000,"timelineEndMs":4000}});
        let after = json!({"clipId":"after","candidateId":0,"compiledSource":{"startMs":4000,"endMs":6000},"slot":{"timelineStartMs":4000,"timelineEndMs":6000}});
        let context = adjacent(&[candidate], &[after, before, target.clone()], &target).unwrap();
        assert_eq!(context["before"]["clipId"], "before");
        assert_eq!(context["after"]["clipId"], "after");
        assert_eq!(context["before"]["observedRange"]["startMs"], 1500);
        assert_eq!(context["after"]["observedRange"]["endMs"], 5500);
        assert_eq!(context["after"]["visibleText"]["status"], "missing");
        assert_eq!(context["timingVerified"], false);
        let absent = adjacent(&[], std::slice::from_ref(&target), &target).unwrap();
        assert_eq!(absent["after"]["status"], "unavailable");
    }
}
