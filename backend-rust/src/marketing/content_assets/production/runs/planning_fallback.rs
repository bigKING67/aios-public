//! Deterministic, non-executable preservation draft after independent review fails.
use super::{
    evidence_candidates::{Candidate, Evidence},
    evidence_planning::{ModelPlan, ModelShot},
    picture_slots::{self, Slot},
    types::{PlanDocument, Run},
};
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};
use std::collections::HashSet;

pub(super) fn draft(
    run: &Run,
    candidates: &[Candidate],
    slots: &[Slot],
    document: &mut PlanDocument,
    selected: &mut Vec<Value>,
    review: &Value,
) -> AppResult<Value> {
    if review["status"] != "needs_revision" || !document.locked_clip_ids.is_empty() {
        return Ok(Value::Null);
    }
    let insufficient: HashSet<_> = review["insufficientEvidenceClipIds"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    let failed: HashSet<_> = review["checks"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|c| {
            c["verdict"] != "compatible"
                || insufficient.contains(c["clipId"].as_str().unwrap_or_default())
        })
        .filter_map(|c| c["clipId"].as_str())
        .collect();
    let Some(preserve) = candidates
        .iter()
        .position(|c| matches!(c.evidence, Evidence::SourcePreservation { .. }))
    else {
        return Ok(
            json!({"status":"unavailable","reason":"preservation_candidate_missing","deliveryApproved":false}),
        );
    };
    if failed.is_empty() {
        return Ok(Value::Null);
    }
    let mut changed = Vec::new();
    let shots = selected
        .iter()
        .enumerate()
        .map(|(index, choice)| {
            let id = choice["clipId"].as_str().ok_or(AppError::Internal)?;
            let replace = failed.contains(id);
            if replace {
                changed.push(id.to_owned());
            }
            Ok(ModelShot {
                slot_id: Some(
                    choice["slot"]["slotId"]
                        .as_u64()
                        .ok_or(AppError::Internal)? as usize,
                ),
                candidate_id: if replace {
                    preserve
                } else {
                    choice["candidateId"].as_u64().ok_or(AppError::Internal)? as usize
                },
                duration_frames: None,
                reason: if replace {
                    "替换片段复核未通过，降级草稿保留主讲同一时段原画面；不代表业务要求完成".into()
                } else {
                    document.reasons.get(index).cloned().unwrap_or_default()
                },
            })
        })
        .collect::<AppResult<Vec<_>>>()?;
    let mut gaps = document.gaps.clone();
    gaps.push(
        "降级草稿已保留失败窗口原画面；尚未复核新切点，要求更换或新增画面的业务目标仍未完成".into(),
    );
    let (mut fallback, fallback_selected) =
        picture_slots::ground(ModelPlan { shots, gaps }, candidates, run, slots)?;
    fallback.narration_captions = document.narration_captions.clone();
    let receipt = json!({"schema":"aios.planning-preservation-fallback.v1","status":"draft_requires_review","replacedClipIds":changed,
        "originalSelected":selected,"reviewAppliesTo":"originalSelected","businessGoalCompleted":false,
        "additionalModelCalls":0,"deliveryApproved":false});
    *document = fallback;
    *selected = fallback_selected;
    Ok(receipt)
}
